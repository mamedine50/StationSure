// Edge Function notify-worker : appelée toutes les minutes par pg_cron + pg_net (private.call_notify_worker),
// ou à la main depuis /dev/messages. Protégée par l'en-tête x-worker-secret (verify_jwt = false).
// L'adaptateur d'envoi est choisi par NOTIFIER (dev par défaut, meta pour WhatsApp réel).
import { createClient } from '@supabase/supabase-js';

import type { Canal, MessageSortant, Notifier } from './notifier.ts';
import { DevNotifier } from './notifiers/dev.ts';
import { MetaWhatsAppNotifier } from './notifiers/meta.ts';
import { SmsNotifier } from './notifiers/sms.ts';
import { traiterLot, type DependancesWorker } from './worker.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SECRET = Deno.env.get('NOTIFY_WORKER_SECRET') ?? 'dev-notify-secret';
const NOTIFIER = Deno.env.get('NOTIFIER') ?? 'dev';

function log(message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'notify-worker', message, ...extra }));
}

function construireNotifiers(): Record<Canal, Notifier | null> {
  const dev = new DevNotifier(log);
  const whatsapp: Notifier | null =
    NOTIFIER === 'meta'
      ? new MetaWhatsAppNotifier({
          accessToken: Deno.env.get('META_WHATSAPP_TOKEN') ?? '',
          phoneNumberId: Deno.env.get('META_PHONE_NUMBER_ID') ?? '',
          ...(Deno.env.get('META_API_VERSION')
            ? { apiVersion: Deno.env.get('META_API_VERSION') }
            : {}),
        })
      : dev;
  const smsUrl = Deno.env.get('SMS_API_URL');
  const sms: Notifier | null =
    NOTIFIER === 'dev'
      ? dev
      : smsUrl
        ? new SmsNotifier({
            url: smsUrl,
            token: Deno.env.get('SMS_API_TOKEN') ?? '',
            sender: Deno.env.get('SMS_SENDER') ?? 'StationSure',
          })
        : null;
  return { dev, whatsapp, sms };
}

function dependancesProduction(): DependancesWorker {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const notifiers = construireNotifiers();
  return {
    async reclamer(limite) {
      const { data, error } = await admin.rpc('claim_notifications', { p_limit: limite });
      if (error) throw new Error(error.message);
      return (data ?? []) as MessageSortant[];
    },
    async marquer(id, statut, erreur, providerMessageId, reessaiSecondes) {
      const { error } = await admin.rpc('set_notification_status', {
        p_id: id,
        p_status: statut,
        p_error: erreur,
        p_provider_message_id: providerMessageId,
        p_retry_after_seconds: reessaiSecondes,
      });
      if (error) throw new Error(error.message);
    },
    async escalader() {
      const { data, error } = await admin.rpc('escalate_undelivered');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    notifierPour: (canal) => notifiers[canal] ?? null,
    log,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  if (req.headers.get('x-worker-secret') !== SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (SECRET === 'dev-notify-secret' && !/127\.0\.0\.1|localhost|kong/.test(SUPABASE_URL)) {
    log('NOTIFY_WORKER_SECRET manquant : refus hors local');
    return Response.json({ error: 'Worker secret not configured' }, { status: 500 });
  }
  try {
    const bilan = await traiterLot(dependancesProduction());
    log('lot traité', { ...bilan, notifier: NOTIFIER });
    return Response.json({ ok: true, notifier: NOTIFIER, ...bilan });
  } catch (e) {
    log('erreur worker', { erreur: (e as Error).message });
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
