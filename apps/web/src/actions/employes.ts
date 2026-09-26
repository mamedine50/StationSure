'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import { lireFormulaire, premiereErreur, schemaDefinirPin, schemaEmploye } from '@/lib/validation';

export async function creerEmploye(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaEmploye.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.membre || !contexte.estProprietaire) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('employees').insert({
    organization_id: contexte.membre.organizationId,
    station_id: lu.data.stationId,
    full_name: lu.data.nomComplet,
    role: lu.data.role,
  });
  if (error) return { erreur: error.message };
  revalidatePath('/employes');
  return { succes: 'employees.created' };
}

export async function definirPin(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaDefinirPin.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('set_employee_pin', {
    p_employee_id: lu.data.employeId,
    p_pin: lu.data.pin,
  });
  if (error) {
    if (error.message.startsWith('PIN_TRIVIAL')) return { erreur: 'validation.pinTrivial' };
    if (error.message.startsWith('PIN_INVALID')) return { erreur: 'validation.pinFormat' };
    return { erreur: 'common.error' };
  }
  revalidatePath('/employes');
  return { succes: 'employees.pinSaved' };
}

export async function changerActivation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const employeId = formData.get('employeId');
  const actif = formData.get('actif') === 'true';
  if (typeof employeId !== 'string') return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('employees').update({ active: actif }).eq('id', employeId);
  if (error) return { erreur: 'common.error' };
  revalidatePath('/employes');
  return {};
}
