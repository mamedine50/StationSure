// Edge Function invite-supervisor : appelée par le web (session propriétaire) avec { email }.
// verify_jwt = true : la passerelle exige un JWT valide ; l'identité est relue ici avec la clé service.
import { createClient } from '@supabase/supabase-js';

import { inviterSuperviseur, type Dependances } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';

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
    async utilisateurDepuisJeton(jeton) {
      const { data, error } = await admin.auth.getUser(jeton);
      return error || !data.user ? null : { id: data.user.id };
    },
    async organisationOwner(userId) {
      const { data } = await admin
        .from('org_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();
      return data?.organization_id ?? null;
    },
    async inviter(email, redirectTo) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) {
        if (/already|exists|registered/i.test(error.message)) return 'EXISTS';
        throw new Error(error.message);
      }
      return { userId: data.user.id };
    },
    async utilisateurExistant(email) {
      // Pas de recherche par courriel dans l'API admin : un lien magique (non envoyé) renvoie l'utilisateur.
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      return error ? null : (data.user?.id ?? null);
    },
    async enregistrer(organizationId, email, userId, invitedBy) {
      const { data, error } = await admin.rpc('register_supervisor_invitation', {
        p_org: organizationId,
        p_email: email,
        p_user_id: userId,
        p_invited_by: invitedBy,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    siteUrl: SITE_URL,
    log(message, extra) {
      console.log(JSON.stringify({ fn: 'invite-supervisor', message, ...extra }));
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    json = null;
  }
  try {
    const resultat = await inviterSuperviseur(json, jeton, dependancesProduction());
    return Response.json(resultat.body, { status: resultat.status, headers: CORS });
  } catch (e) {
    console.log(
      JSON.stringify({ fn: 'invite-supervisor', message: 'erreur', erreur: (e as Error).message }),
    );
    return Response.json({ error: 'INTERNAL' }, { status: 500, headers: CORS });
  }
});
