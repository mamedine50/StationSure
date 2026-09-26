// Edge Function notify-webhook : reçoit les statuts de livraison de Meta (verify_jwt = false,
// la sécurité est la signature X-Hub-Signature-256). Testée avec des données factices ; l'URL
// publique à déclarer chez Meta est https://<projet>.supabase.co/functions/v1/notify-webhook.
import { createClient } from '@supabase/supabase-js';

import { traiterWebhook } from './webhook.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';

function log(message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'notify-webhook', message, ...extra }));
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resultat = await traiterWebhook(
    { method: req.method, url: req.url, headers: req.headers, corpsBrut: await req.text() },
    {
      verifyToken: VERIFY_TOKEN,
      appSecret: APP_SECRET,
      async enregistrer(id, statut, erreur) {
        const { data, error } = await admin.rpc('record_delivery_status', {
          p_provider_message_id: id,
          p_status: statut,
          p_error: erreur,
        });
        if (error) throw new Error(error.message);
        return Number(data ?? 0);
      },
      log,
    },
  );
  return typeof resultat.body === 'string'
    ? new Response(resultat.body, { status: resultat.status })
    : Response.json(resultat.body, { status: resultat.status });
});
