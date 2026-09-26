import type { Canal, MessageSortant, Notifier } from './notifier.ts';

/**
 * Vidage de la file public.notification_outbox : réclamer un lot (claim_notifications), envoyer
 * chaque message par l'adaptateur de son canal, écrire le statut (set_notification_status),
 * puis escalader en SMS les WhatsApp non délivrés (escalate_undelivered).
 * Reprise : délai exponentiel 30 s · 60 s · 120 s · 240 s ; échec définitif à la 5e tentative.
 */
export const MAX_TENTATIVES = 5;
export const DELAI_BASE_SECONDES = 30;

export function delaiReessaiSecondes(tentatives: number): number {
  return DELAI_BASE_SECONDES * 2 ** Math.max(0, tentatives - 1);
}

export type Statut = 'queued' | 'sent' | 'delivered' | 'failed';

export interface DependancesWorker {
  reclamer: (limite: number) => Promise<MessageSortant[]>;
  marquer: (
    id: string,
    statut: Statut,
    erreur: string | null,
    providerMessageId: string | null,
    reessaiSecondes: number | null,
  ) => Promise<void>;
  escalader: () => Promise<number>;
  notifierPour: (canal: Canal) => Notifier | null;
  log: (message: string, extra?: Record<string, unknown>) => void;
}

export interface BilanLot {
  traites: number;
  envoyes: number;
  reessais: number;
  echecs: number;
  escalades: number;
}

export async function traiterLot(deps: DependancesWorker, limite = 20): Promise<BilanLot> {
  const bilan: BilanLot = { traites: 0, envoyes: 0, reessais: 0, echecs: 0, escalades: 0 };
  const lot = await deps.reclamer(limite);
  for (const message of lot) {
    bilan.traites += 1;
    const notifier = deps.notifierPour(message.channel);
    if (!notifier) {
      await deps.marquer(
        message.id,
        'failed',
        `CHANNEL_NOT_CONFIGURED: ${message.channel}`,
        null,
        null,
      );
      bilan.echecs += 1;
      continue;
    }
    let resultat;
    try {
      resultat = await notifier.envoyer(message);
    } catch (e) {
      resultat = {
        ok: false as const,
        error: `EXCEPTION: ${(e as Error).message}`,
        retryable: true,
      };
    }
    if (resultat.ok) {
      await deps.marquer(
        message.id,
        resultat.delivered ? 'delivered' : 'sent',
        null,
        resultat.providerMessageId,
        null,
      );
      bilan.envoyes += 1;
      continue;
    }
    if (resultat.retryable && message.attempts < MAX_TENTATIVES) {
      const delai = delaiReessaiSecondes(message.attempts);
      await deps.marquer(message.id, 'queued', resultat.error, null, delai);
      bilan.reessais += 1;
      deps.log('envoi à réessayer', {
        id: message.id,
        tentative: message.attempts,
        delai,
        erreur: resultat.error,
      });
    } else {
      await deps.marquer(message.id, 'failed', resultat.error, null, null);
      bilan.echecs += 1;
      deps.log('envoi en échec définitif', {
        id: message.id,
        tentative: message.attempts,
        erreur: resultat.error,
      });
    }
  }
  bilan.escalades = await deps.escalader();
  return bilan;
}
