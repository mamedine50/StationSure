// Edge Function pair-device : jumelage d'une tablette à une station avec un code à usage unique.
// Appelée SANS session utilisateur (verify_jwt = false dans config.toml) ; la clé publishable
// (apikey) est exigée par la passerelle. Toute la validation vit dans la base (consume_pairing_code).
import { createClient } from '@supabase/supabase-js';

import { type Dependances, extraireIp, jumelerAppareil } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function dependancesProduction(): Dependances {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async consumePairingCode(code, ip, pairingId) {
      const { data, error } = await admin.rpc('consume_pairing_code', {
        p_code: code,
        p_ip: ip,
        p_pairing_id: pairingId,
      });
      if (error) throw new Error(error.message);
      // La base RENVOIE l'échec (ok = false) pour conserver ses compteurs de tentatives.
      const res = data as {
        ok: boolean;
        error?: string;
        pairing_id?: string;
        station_id?: string;
        organization_id?: string;
      };
      if (!res?.ok || !res.pairing_id || !res.station_id || !res.organization_id) {
        throw new Error(res?.error ?? 'PAIRING_INVALID');
      }
      return {
        pairing_id: res.pairing_id,
        station_id: res.station_id,
        organization_id: res.organization_id,
      };
    },
    async createDeviceUser(email, password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { stationsure_kind: 'device' },
      });
      if (error || !data.user) throw new Error(error?.message ?? 'no user');
      return { id: data.user.id };
    },
    async registerPairedDevice(pairingId, authUserId, label) {
      const { data, error } = await admin.rpc('register_paired_device', {
        p_pairing_id: pairingId,
        p_auth_user_id: authUserId,
        p_label: label,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    async signInDevice(email, password) {
      // Client anonyme : la session obtenue est celle de l'appareil, pas du service.
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error(error?.message ?? 'no session');
      return data.session;
    },
    async deleteAuthUser(id) {
      await admin.auth.admin.deleteUser(id);
    },
    randomHex(bytes) {
      const buf = new Uint8Array(bytes);
      crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    },
    log(message, extra) {
      console.log(JSON.stringify({ fn: 'pair-device', message, ...extra }));
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }
  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    json = null;
  }
  const resultat = await jumelerAppareil(json, extraireIp(req.headers), dependancesProduction());
  return Response.json(resultat.body, { status: resultat.status, headers: CORS });
});
