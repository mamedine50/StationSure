/**
 * Logique de jumelage d'un appareil, indépendante du runtime (testable avec des doublures).
 *
 * Étapes : valider l'entrée → consume_pairing_code (la base vérifie expiration, usage unique,
 * 5 essais par code, limite par IP) → créer l'utilisateur auth dédié → register_paired_device →
 * ouvrir une session pour l'appareil. Toute erreur renvoie le MÊME message générique.
 */

export const MESSAGE_GENERIQUE = 'Code de jumelage invalide ou expiré.';

export interface EntreeJumelage {
  code: string;
  pairing_id?: string | null;
  label?: string | null;
}

export interface SessionAppareil {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}

export interface CodeConsomme {
  pairing_id: string;
  station_id: string;
  organization_id: string;
}

/** Dépendances injectées : implémentées avec supabase-js en production, avec des doublures en test. */
export interface Dependances {
  consumePairingCode: (code: string, ip: string, pairingId: string | null) => Promise<CodeConsomme>;
  createDeviceUser: (email: string, password: string) => Promise<{ id: string }>;
  registerPairedDevice: (pairingId: string, authUserId: string, label: string) => Promise<string>;
  signInDevice: (email: string, password: string) => Promise<SessionAppareil>;
  deleteAuthUser: (id: string) => Promise<void>;
  randomHex: (bytes: number) => string;
  log: (message: string, extra?: Record<string, unknown>) => void;
}

export interface ResultatJumelage {
  status: number;
  body: Record<string, unknown>;
}

function reponseGenerique(status = 400): ResultatJumelage {
  return { status, body: { error: MESSAGE_GENERIQUE } };
}

/** Lit l'adresse IP cliente (derrière un proxy Supabase). */
export function extraireIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for') ?? headers.get('cf-connecting-ip') ?? '';
  const premiere = forwarded.split(',')[0]?.trim();
  return premiere && premiere.length <= 64 ? premiere : 'unknown';
}

/** Valide et normalise l'entrée. Renvoie null si elle est inexploitable. */
export function lireEntree(json: unknown): EntreeJumelage | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const code = typeof o.code === 'string' ? o.code.replace(/\s+/g, '') : '';
  if (!/^[0-9]{6}$/.test(code)) return null;
  const pairing_id =
    typeof o.pairing_id === 'string' && /^[0-9a-f-]{36}$/i.test(o.pairing_id) ? o.pairing_id : null;
  const label = typeof o.label === 'string' ? o.label.trim().slice(0, 80) : null;
  return { code, pairing_id, label };
}

/** Extrait code et id d'une charge utile de QR `stationsure://pair?code=123456&id=<uuid>`. */
export function lireQr(texte: string): { code: string; pairing_id: string | null } | null {
  try {
    const url = new URL(texte);
    if (url.protocol !== 'stationsure:' || url.hostname !== 'pair') return null;
    const code = url.searchParams.get('code') ?? '';
    if (!/^[0-9]{6}$/.test(code)) return null;
    return { code, pairing_id: url.searchParams.get('id') };
  } catch {
    return null;
  }
}

export async function jumelerAppareil(
  entree: unknown,
  ip: string,
  deps: Dependances,
): Promise<ResultatJumelage> {
  const lue = lireEntree(entree);
  if (!lue) return reponseGenerique();

  let consomme: CodeConsomme;
  try {
    consomme = await deps.consumePairingCode(lue.code, ip, lue.pairing_id ?? null);
  } catch (e) {
    // Expiré, utilisé, faux, trop d'essais, IP limitée : on ne distingue rien côté client.
    deps.log('pairing refused', { ip, reason: (e as Error).message });
    return reponseGenerique();
  }

  // Utilisateur auth dédié à l'appareil : identifiant opaque, mot de passe aléatoire jamais réutilisé.
  const email = `device-${deps.randomHex(8)}@devices.stationsure.local`;
  const password = deps.randomHex(32);
  let userId: string;
  try {
    userId = (await deps.createDeviceUser(email, password)).id;
  } catch (e) {
    deps.log('device user creation failed', { reason: (e as Error).message });
    return reponseGenerique(500);
  }

  let deviceId: string;
  try {
    deviceId = await deps.registerPairedDevice(
      consomme.pairing_id,
      userId,
      lue.label ?? 'Tablette',
    );
  } catch (e) {
    deps.log('device registration failed', { reason: (e as Error).message });
    await deps.deleteAuthUser(userId).catch(() => undefined);
    return reponseGenerique();
  }

  try {
    const session = await deps.signInDevice(email, password);
    return {
      status: 200,
      body: {
        device_id: deviceId,
        station_id: consomme.station_id,
        organization_id: consomme.organization_id,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
      },
    };
  } catch (e) {
    deps.log('device sign-in failed', { reason: (e as Error).message });
    return reponseGenerique(500);
  }
}
