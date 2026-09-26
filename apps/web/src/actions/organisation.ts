'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaOrganisation,
  schemaStation,
} from '@/lib/validation';

export async function creerOrganisation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaOrganisation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('create_organization', {
    p_name: lu.data.nom,
    p_plan_code: lu.data.plan,
  });
  if (error) {
    if (error.message.startsWith('ALREADY_MEMBER')) return { erreur: 'onboarding.alreadyMember' };
    return { erreur: error.message };
  }
  redirect('/onboarding');
}

/** Crée une station (owner). `retour` = page vers laquelle rediriger après succès. */
export async function creerStation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaStation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.membre || !contexte.estProprietaire) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('stations').insert({
    organization_id: contexte.membre.organizationId,
    name: lu.data.nom,
    city: lu.data.ville || null,
  });
  if (error) {
    if (error.message.startsWith('STATION_LIMIT')) return { erreur: 'stations.limitReached' };
    return { erreur: error.message };
  }
  revalidatePath('/stations');
  const retour = formData.get('retour');
  if (typeof retour === 'string' && retour.startsWith('/')) redirect(retour);
  return { succes: 'stations.created' };
}
