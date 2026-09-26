import type { MessageSortant, Notifier, ResultatEnvoi } from '../notifier.ts';

/**
 * WhatsApp Business Platform (Cloud API de Meta). Les messages sortants hors fenêtre de 24 h
 * DOIVENT être des modèles approuvés : les textes exacts sont dans docs/whatsapp-modeles.md.
 * Contrainte Meta : un paramètre de modèle ne contient ni retour à la ligne, ni tabulation,
 * ni plus de 4 espaces consécutifs → chaque ligne du corps devient un paramètre.
 */
export interface ConfigMeta {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
  languageCode?: string;
}

export const VERSION_API_META = 'v22.0';

function lignes(corps: string): string[] {
  return corps.split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim());
}

function apres(ligne: string, prefixe: string): string {
  return ligne.startsWith(prefixe) ? ligne.slice(prefixe.length) : ligne;
}

/** Paramètres du modèle, dans l'ordre des {{n}} de docs/whatsapp-modeles.md. */
export function parametresModele(message: MessageSortant): string[] {
  const l = lignes(message.body);
  const v = message.variables;
  switch (message.template) {
    case 'stationsure_rapport_soir': {
      // 0 station/date · 1 CA · 2 répartition · 3 litres · 4..9 statuts · 10 lien
      const station = String(v.station ?? apres(l[0] ?? '', 'Station ').split(' · ')[0] ?? '');
      const date = String(v.date ?? (l[0] ?? '').split('Clôture du ')[1] ?? '');
      const ca = apres(l[1] ?? '', "Chiffre d'affaires : ").replace(/ FCFA$/, '');
      return [
        station,
        date,
        ca,
        l[2] ?? '',
        apres(l[3] ?? '', 'Litres : '),
        l[4] ?? '',
        l[5] ?? '',
        l[6] ?? '',
        l[7] ?? '',
        l[8] ?? '',
        l[9] ?? '',
        apres(l[10] ?? '', 'Détail : '),
      ];
    }
    case 'stationsure_resume_journee': {
      const entete = l[0] ?? '';
      const m = /^Résumé du (\S+) · (\d+) clôture\(s\) sur (\d+) station\(s\)$/.exec(entete);
      const stations = l
        .slice(1, -1)
        .map((x) => apres(x, '• '))
        .join(' · ');
      return [
        m?.[1] ?? String(v.date ?? ''),
        m?.[2] ?? '0',
        m?.[3] ?? '0',
        stations,
        l[l.length - 1] ?? '',
      ];
    }
    case 'stationsure_alerte':
      return [apres(l[0] ?? '', '⚠️ '), l[1] ?? ''];
    case 'stationsure_relance_bordereau':
      return [l.join(' ')];
    default:
      return [l.join(' ')];
  }
}

export function construireRequeteMeta(
  message: MessageSortant,
  config: ConfigMeta,
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const url = `https://graph.facebook.com/${config.apiVersion ?? VERSION_API_META}/${config.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: message.to_phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: message.template,
      language: { code: config.languageCode ?? 'fr' },
      components: [
        {
          type: 'body',
          parameters: parametresModele(message).map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  };
}

export class MetaWhatsAppNotifier implements Notifier {
  readonly nom = 'meta';

  constructor(
    private readonly config: ConfigMeta,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async envoyer(message: MessageSortant): Promise<ResultatEnvoi> {
    const { url, init } = construireRequeteMeta(message, this.config);
    const reponse = await this.fetchFn(url, init);
    const json = (await reponse.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!reponse.ok || !json.messages?.[0]?.id) {
      return {
        ok: false,
        error: `META_${reponse.status}: ${json.error?.message ?? 'réponse inattendue'}`,
        retryable: reponse.status === 429 || reponse.status >= 500,
      };
    }
    // Meta accepte le message ; « delivered » arrive plus tard par le webhook notify-webhook.
    return { ok: true, providerMessageId: json.messages[0].id, delivered: false };
  }
}
