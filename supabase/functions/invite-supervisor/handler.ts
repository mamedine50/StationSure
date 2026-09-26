/**
 * Invitation d'un superviseur (lecture seule) par le propriétaire : l'identité de l'appelant vient
 * du JWT vérifié, l'organisation de org_members (rôle owner obligatoire), l'invitation par
 * auth.admin.inviteUserByEmail (courriel Supabase), puis register_supervisor_invitation.
 */
export interface Dependances {
  utilisateurDepuisJeton: (jeton: string) => Promise<{ id: string } | null>;
  organisationOwner: (userId: string) => Promise<string | null>;
  inviter: (email: string, redirectTo: string) => Promise<{ userId: string } | 'EXISTS'>;
  utilisateurExistant: (email: string) => Promise<string | null>;
  enregistrer: (
    organizationId: string,
    email: string,
    userId: string,
    invitedBy: string,
  ) => Promise<string>;
  siteUrl: string;
  log: (message: string, extra?: Record<string, unknown>) => void;
}

export interface Resultat {
  status: number;
  body: Record<string, unknown>;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function inviterSuperviseur(
  entree: unknown,
  jeton: string | null,
  deps: Dependances,
): Promise<Resultat> {
  if (!jeton) return { status: 401, body: { error: 'UNAUTHENTICATED' } };
  const email = String((entree as { email?: unknown })?.email ?? '')
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { status: 400, body: { error: 'INVALID_EMAIL' } };
  const utilisateur = await deps.utilisateurDepuisJeton(jeton);
  if (!utilisateur) return { status: 401, body: { error: 'UNAUTHENTICATED' } };
  const organizationId = await deps.organisationOwner(utilisateur.id);
  if (!organizationId) return { status: 403, body: { error: 'OWNER_ONLY' } };

  const redirectTo = `${deps.siteUrl}/auth/callback?suite=/nouveau-mot-de-passe`;
  let userId: string;
  let dejaInscrit = false;
  try {
    const invitation = await deps.inviter(email, redirectTo);
    if (invitation === 'EXISTS') {
      const existant = await deps.utilisateurExistant(email);
      if (!existant) return { status: 500, body: { error: 'USER_LOOKUP_FAILED' } };
      userId = existant;
      dejaInscrit = true;
    } else {
      userId = invitation.userId;
    }
  } catch (e) {
    deps.log('invitation refusée par auth', { email, erreur: (e as Error).message });
    return { status: 502, body: { error: 'INVITE_FAILED' } };
  }
  const invitationId = await deps.enregistrer(organizationId, email, userId, utilisateur.id);
  deps.log('superviseur invité', { organizationId, invitationId, dejaInscrit });
  return {
    status: 200,
    body: { ok: true, invitation_id: invitationId, already_registered: dejaInscrit },
  };
}
