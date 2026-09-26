/**
 * Contrat d'un canal d'envoi. Trois implémentations dans ./notifiers :
 * - DevNotifier (défaut, `NOTIFIER=dev`) : aucun envoi, marqué délivré, visible sur /dev/messages ;
 * - MetaWhatsAppNotifier (`NOTIFIER=meta`) : WhatsApp Business Platform (Cloud API), messages MODÈLES ;
 * - SmsNotifier (`SMS_API_URL` défini) : passerelle HTTP générique, utilisée pour le canal `sms`
 *   (secours quand WhatsApp n'est pas délivré).
 */
export type Canal = 'dev' | 'whatsapp' | 'sms';

/** Ligne de public.notification_outbox réclamée par claim_notifications(). */
export interface MessageSortant {
  id: string;
  channel: Canal;
  kind: string;
  to_phone: string;
  template: string;
  variables: Record<string, unknown>;
  body: string;
  attempts: number;
}

export type ResultatEnvoi =
  | { ok: true; providerMessageId: string; delivered: boolean }
  | { ok: false; error: string; retryable: boolean };

export interface Notifier {
  readonly nom: string;
  envoyer(message: MessageSortant): Promise<ResultatEnvoi>;
}
