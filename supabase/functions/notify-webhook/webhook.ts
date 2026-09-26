/**
 * Webhook de statut de livraison WhatsApp (Meta) :
 * - GET  : vérification à l'abonnement (hub.mode / hub.verify_token / hub.challenge) ;
 * - POST : statuts `sent` / `delivered` / `read` / `failed`, signés par X-Hub-Signature-256
 *          (HMAC SHA-256 du corps brut avec le secret de l'application Meta).
 */
export interface StatutRecu {
  id: string;
  status: string;
  error: string | null;
}

export interface DependancesWebhook {
  verifyToken: string;
  appSecret: string;
  enregistrer: (
    providerMessageId: string,
    statut: string,
    erreur: string | null,
  ) => Promise<number>;
  log: (message: string, extra?: Record<string, unknown>) => void;
}

export interface RequeteWebhook {
  method: string;
  url: string;
  headers: Headers;
  corpsBrut: string;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signatureAttendue(corpsBrut: string, appSecret: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return `sha256=${hex(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(corpsBrut)))}`;
}

function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifierSignature(
  corpsBrut: string,
  entete: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!entete || !appSecret) return false;
  return egalConstant(await signatureAttendue(corpsBrut, appSecret), entete);
}

/** Extrait les statuts d'une notification Meta (entry[].changes[].value.statuses[]). */
export function extraireStatuts(payload: unknown): StatutRecu[] {
  const out: StatutRecu[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] }).changes ?? []) {
      const value = (change as { value?: { statuses?: unknown[] } }).value;
      for (const s of value?.statuses ?? []) {
        const statut = s as {
          id?: string;
          status?: string;
          errors?: { title?: string; message?: string; code?: number }[];
        };
        if (!statut.id || !statut.status) continue;
        const err = statut.errors?.[0];
        out.push({
          id: statut.id,
          status: statut.status,
          error: err ? `${err.code ?? ''} ${err.title ?? err.message ?? ''}`.trim() : null,
        });
      }
    }
  }
  return out;
}

export async function traiterWebhook(
  req: RequeteWebhook,
  deps: DependancesWebhook,
): Promise<{ status: number; body: string | Record<string, unknown> }> {
  if (req.method === 'GET') {
    const u = new URL(req.url);
    if (
      u.searchParams.get('hub.mode') === 'subscribe' &&
      u.searchParams.get('hub.verify_token') === deps.verifyToken
    ) {
      return { status: 200, body: u.searchParams.get('hub.challenge') ?? '' };
    }
    return { status: 403, body: { error: 'Forbidden' } };
  }
  if (req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
  if (
    !(await verifierSignature(
      req.corpsBrut,
      req.headers.get('x-hub-signature-256'),
      deps.appSecret,
    ))
  ) {
    deps.log('signature invalide');
    return { status: 401, body: { error: 'Invalid signature' } };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(req.corpsBrut);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  let mis_a_jour = 0;
  for (const s of extraireStatuts(payload)) {
    mis_a_jour += await deps.enregistrer(s.id, s.status, s.error);
  }
  deps.log('statuts reçus', { mis_a_jour });
  return { status: 200, body: { ok: true, updated: mis_a_jour } };
}
