import type { MessageSortant, Notifier, ResultatEnvoi } from '../notifier.ts';

/**
 * Passerelle SMS HTTP générique (JSON) : POST {to, from, text} avec un jeton Bearer.
 * À adapter au fournisseur retenu (Orange SMS API, Twilio, InfoBip…) : seule construireRequeteSms change.
 */
export interface ConfigSms {
  url: string;
  token: string;
  sender: string;
}

export function construireRequeteSms(
  message: MessageSortant,
  config: ConfigSms,
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  return {
    url: config.url,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: message.to_phone, from: config.sender, text: message.body }),
    },
  };
}

export class SmsNotifier implements Notifier {
  readonly nom = 'sms';

  constructor(
    private readonly config: ConfigSms,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async envoyer(message: MessageSortant): Promise<ResultatEnvoi> {
    const { url, init } = construireRequeteSms(message, this.config);
    const reponse = await this.fetchFn(url, init);
    const json = (await reponse.json().catch(() => ({}))) as {
      id?: string;
      message_id?: string;
      error?: string;
    };
    if (!reponse.ok) {
      return {
        ok: false,
        error: `SMS_${reponse.status}: ${json.error ?? 'réponse inattendue'}`,
        retryable: reponse.status === 429 || reponse.status >= 500,
      };
    }
    return {
      ok: true,
      providerMessageId: json.id ?? json.message_id ?? `sms-${message.id}`,
      delivered: false,
    };
  }
}
