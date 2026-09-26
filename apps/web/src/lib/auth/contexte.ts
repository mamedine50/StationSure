import type { Ligne, ValeurEnum } from '@stationsure/database';
import { redirect } from 'next/navigation';

import { creerClientServeur } from '@/lib/supabase/server';

export type RoleMembre = ValeurEnum<'org_member_role'>;

export interface Contexte {
  utilisateur: { id: string; email: string };
  /** null tant que l'onboarding (organisation) n'est pas fait. */
  membre: { organizationId: string; role: RoleMembre } | null;
  organisation: Pick<Ligne<'organizations'>, 'id' | 'name' | 'plan_code'> | null;
  stations: Pick<Ligne<'stations'>, 'id' | 'name' | 'city' | 'active'>[];
  estProprietaire: boolean;
}

/** Contexte de l'utilisateur connecté. Redirige vers /connexion s'il n'y a pas de session. */
export async function obtenirContexte(): Promise<Contexte> {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');

  const { data: membre } = await supabase
    .from('org_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membre) {
    return {
      utilisateur: { id: user.id, email: user.email ?? '' },
      membre: null,
      organisation: null,
      stations: [],
      estProprietaire: false,
    };
  }

  const [{ data: organisation }, { data: stations }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, plan_code')
      .eq('id', membre.organization_id)
      .maybeSingle(),
    supabase
      .from('stations')
      .select('id, name, city, active')
      .eq('organization_id', membre.organization_id)
      .order('name'),
  ]);

  return {
    utilisateur: { id: user.id, email: user.email ?? '' },
    membre: { organizationId: membre.organization_id, role: membre.role },
    organisation: organisation ?? null,
    stations: stations ?? [],
    estProprietaire: membre.role === 'owner',
  };
}

/** Contexte complet (organisation + au moins une station), sinon redirection vers /onboarding. */
export async function exigerContexteComplet(): Promise<
  Contexte & { membre: NonNullable<Contexte['membre']> }
> {
  const contexte = await obtenirContexte();
  if (!contexte.membre || contexte.stations.length === 0) redirect('/onboarding');
  return contexte as Contexte & { membre: NonNullable<Contexte['membre']> };
}

/** Réservé au propriétaire : redirige les superviseurs vers l'accueil. */
export async function exigerProprietaire() {
  const contexte = await exigerContexteComplet();
  if (!contexte.estProprietaire) redirect('/');
  return contexte;
}
