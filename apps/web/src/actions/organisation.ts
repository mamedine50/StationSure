'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaModifierStation,
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
  const localite = await resoudreLocalite(lu.data.communeCode, lu.data.ville);
  const { error } = await supabase.from('stations').insert({
    organization_id: contexte.membre.organizationId,
    name: lu.data.nom,
    ...localite,
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

/** Commune de référence (nom copié dans city) ou « Autre » (ville libre, sans commune). */
async function resoudreLocalite(communeCode: string | undefined, ville: string | undefined) {
  if (communeCode && communeCode !== 'autre') {
    const supabase = await creerClientServeur();
    const { data } = await supabase
      .from('sn_communes')
      .select('code, name')
      .eq('code', communeCode)
      .maybeSingle();
    if (data) return { commune_code: data.code, city: data.name };
  }
  return { commune_code: null, city: ville || null };
}

export async function modifierStation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaModifierStation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.membre || !contexte.estProprietaire) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const localite = await resoudreLocalite(lu.data.communeCode, lu.data.ville);
  const { error } = await supabase
    .from('stations')
    .update({ name: lu.data.nom, ...localite })
    .eq('id', lu.data.stationId);
  if (error) return { erreur: error.message };
  revalidatePath('/stations');
  revalidatePath('/', 'layout');
  return { succes: 'stations.updated' };
}
