'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import { MODULES, type Module } from '@stationsure/core';

import {
  lireFormulaire,
  premiereErreur,
  schemaDefinirPin,
  schemaEmployeAvecTelephone,
  schemaIdentifiant,
  schemaModifierEmploye,
  schemaModulesEmploye,
  schemaTypeEmploye,
} from '@/lib/validation';

export async function creerEmploye(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaEmployeAvecTelephone.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.membre || !contexte.estProprietaire) return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  // Type système équivalent au rôle choisi (lot n°2) ; le rôle historique est synchronisé par la base.
  const codeType = {
    manager: 'gerant',
    pump_attendant: 'pompiste',
    shop_cashier: 'caissier_boutique',
    mechanic: 'mecanicien',
    washer: 'laveur',
  }[lu.data.role];
  const { data: type } = await supabase
    .from('employee_types')
    .select('id')
    .eq('code', codeType)
    .eq('is_system', true)
    .maybeSingle();
  if (!type) return { erreur: 'common.error' };
  const { error } = await supabase.from('employees').insert({
    organization_id: contexte.membre.organizationId,
    station_id: lu.data.stationId,
    full_name: lu.data.nomComplet,
    role: lu.data.role,
    type_id: type.id,
    phone_e164: lu.data.telephone,
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

async function proprietaire() {
  const contexte = await obtenirContexte();
  return contexte.membre && contexte.estProprietaire
    ? { ...contexte, membre: contexte.membre }
    : null;
}

function revaliderEmployes(employeId?: string) {
  revalidatePath('/employes');
  revalidatePath('/employes/types');
  if (employeId) revalidatePath(`/employes/${employeId}`);
}

export async function modifierEmploye(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaModifierEmploye.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('employees')
    .update({ type_id: lu.data.typeId, phone_e164: lu.data.telephone })
    .eq('id', lu.data.employeId);
  if (error) return { erreur: error.message };
  revaliderEmployes(lu.data.employeId);
  return { succes: 'employeePage.saved' };
}

/** Modules effectifs voulus (cases cochées) → surcharges par rapport au type. */
export async function enregistrerModules(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaModulesEmploye.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { data: employe } = await supabase
    .from('employees')
    .select('id, type_id, employee_types(modules)')
    .eq('id', lu.data.employeId)
    .maybeSingle();
  if (!employe) return { erreur: 'common.error' };
  const base = new Set<string>(
    (employe.employee_types as { modules: string[] } | null)?.modules ?? [],
  );
  const voulus = new Set<Module>(
    MODULES.filter((m) => lu.data[`module_${m}` as keyof typeof lu.data] === true),
  );
  const aSupprimer: Module[] = [];
  const aPoser: {
    employee_id: string;
    organization_id: string;
    module: Module;
    granted: boolean;
  }[] = [];
  for (const m of MODULES) {
    const dansType = base.has(m);
    const voulu = voulus.has(m);
    if (dansType === voulu) aSupprimer.push(m);
    else
      aPoser.push({
        employee_id: employe.id,
        organization_id: contexte.membre.organizationId,
        module: m,
        granted: voulu,
      });
  }
  if (aSupprimer.length > 0) {
    const { error } = await supabase
      .from('employee_module_overrides')
      .delete()
      .eq('employee_id', employe.id)
      .in('module', aSupprimer);
    if (error) return { erreur: error.message };
  }
  if (aPoser.length > 0) {
    const { error } = await supabase
      .from('employee_module_overrides')
      .upsert(aPoser, { onConflict: 'employee_id,module' });
    if (error) return { erreur: error.message };
  }
  revaliderEmployes(employe.id);
  return { succes: 'employeePage.modulesSaved' };
}

export async function revenirAuModele(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaIdentifiant.safeParse({ id: formData.get('employeId') });
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('employee_module_overrides')
    .delete()
    .eq('employee_id', lu.data.id);
  if (error) return { erreur: error.message };
  revaliderEmployes(lu.data.id);
  return { succes: 'employeePage.modulesSaved' };
}

export async function enregistrerTypeEmploye(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaTypeEmploye.safeParse({
    ...lireFormulaire(formData),
    modules: formData.getAll('modules'),
  });
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = lu.data.typeId
    ? await supabase
        .from('employee_types')
        .update({ name: lu.data.nom, code: lu.data.code, modules: lu.data.modules })
        .eq('id', lu.data.typeId)
    : await supabase.from('employee_types').insert({
        organization_id: contexte.membre.organizationId,
        name: lu.data.nom,
        code: lu.data.code,
        modules: lu.data.modules,
      });
  if (error) return { erreur: error.code === '23505' ? 'validation.typeCode' : error.message };
  revaliderEmployes();
  return { succes: lu.data.typeId ? 'employeeTypes.updated' : 'employeeTypes.created' };
}

export async function supprimerTypeEmploye(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaIdentifiant.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('employee_types').delete().eq('id', lu.data.id);
  if (error)
    return { erreur: error.code === '23503' ? 'employeeTypes.cannotDelete' : error.message };
  revaliderEmployes();
  return { succes: 'employeeTypes.deleted' };
}
