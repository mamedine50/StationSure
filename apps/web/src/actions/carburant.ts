'use server';

import { validerBaremage } from '@stationsure/core';
import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaBaremage,
  schemaCuve,
  schemaModifierCuve,
  schemaPistolet,
  schemaPompe,
  schemaPrix,
} from '@/lib/validation';

async function contexteProprietaire() {
  const contexte = await obtenirContexte();
  if (!contexte.membre || !contexte.estProprietaire) return null;
  return contexte;
}

export async function creerCuve(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaCuve.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await contexteProprietaire();
  if (!contexte) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('tanks').insert({
    organization_id: contexte.membre!.organizationId,
    station_id: lu.data.stationId,
    label: lu.data.label,
    fuel_product_code: lu.data.produit,
    capacity_cl: lu.data.capaciteLitres * 100,
  });
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.tankCreated' };
}

export async function modifierCuve(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaModifierCuve.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await contexteProprietaire())) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('tanks')
    .update({ label: lu.data.label, capacity_cl: lu.data.capaciteLitres * 100 })
    .eq('id', lu.data.cuveId);
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.tankUpdated' };
}

export async function publierBaremage(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaBaremage.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const problemes = validerBaremage(lu.data.points);
  if (problemes.length > 0) return { erreur: `fuelConfig.errors.${problemes[0]!.code}` };
  if (!(await contexteProprietaire())) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('create_calibration_version', {
    p_tank_id: lu.data.cuveId,
    p_points: lu.data.points.map((p) => ({ height_mm: p.hauteurMm, volume_cl: p.volumeCl })),
    ...(lu.data.certificatPath ? { p_certificate_path: lu.data.certificatPath } : {}),
    ...(lu.data.note ? { p_note: lu.data.note } : {}),
  });
  if (error) {
    const code = error.message.split(':')[0] ?? '';
    const cle: Record<string, string> = {
      CALIBRATION_NOT_INCREASING: 'fuelConfig.errors.VOLUME_NON_CROISSANT',
      CALIBRATION_DUPLICATE: 'fuelConfig.errors.HAUTEUR_DUPLIQUEE',
      CALIBRATION_TOO_FEW: 'fuelConfig.errors.POINTS_INSUFFISANTS',
      CALIBRATION_HEIGHT: 'fuelConfig.errors.HAUTEUR_INVALIDE',
      CALIBRATION_VOLUME: 'fuelConfig.errors.VOLUME_INVALIDE',
    };
    return { erreur: cle[code] ?? error.message };
  }
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.calibrationPublished' };
}

export async function creerPompe(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaPompe.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await contexteProprietaire();
  if (!contexte) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('pumps').insert({
    organization_id: contexte.membre!.organizationId,
    station_id: lu.data.stationId,
    label: lu.data.label,
  });
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.pumpCreated' };
}

export async function creerPistolet(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaPistolet.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await contexteProprietaire();
  if (!contexte) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('nozzles').insert({
    organization_id: contexte.membre!.organizationId,
    station_id: lu.data.stationId,
    pump_id: lu.data.pompeId,
    tank_id: lu.data.cuveId,
    label: lu.data.label,
  });
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.nozzleCreated' };
}

export async function changerActivationEquipement(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const table = formData.get('table');
  const id = formData.get('id');
  const actif = formData.get('actif') === 'true';
  if ((table !== 'nozzles' && table !== 'pumps' && table !== 'tanks') || typeof id !== 'string')
    return { erreur: 'common.error' };
  if (!(await contexteProprietaire())) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from(table).update({ active: actif }).eq('id', id);
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return {};
}

export async function publierPrix(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaPrix.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await contexteProprietaire();
  if (!contexte) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('price_changes').insert({
    organization_id: contexte.membre!.organizationId,
    station_id: lu.data.stationId,
    fuel_product_code: lu.data.produit,
    price_fcfa_per_litre: lu.data.prix,
    effective_at: lu.data.effectiveAt
      ? new Date(lu.data.effectiveAt).toISOString()
      : new Date().toISOString(),
    created_by: contexte.utilisateur.id,
  });
  if (error) return { erreur: error.message };
  revalidatePath('/carburant');
  return { succes: 'fuelConfig.pricePublished' };
}
