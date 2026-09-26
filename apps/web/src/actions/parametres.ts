'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaDestinataire,
  schemaIdentifiant,
  schemaInvitation,
  schemaMomentRapport,
  schemaMiseAJourDestinataire,
  schemaPlafonds,
  schemaRoutage,
  schemaSeuils,
  schemaSurchargeStation,
  TYPES_ALERTE_ROUTABLES,
} from '@/lib/validation';

async function proprietaire() {
  const contexte = await obtenirContexte();
  return contexte.membre && contexte.estProprietaire
    ? { ...contexte, membre: contexte.membre }
    : null;
}

function revalider() {
  revalidatePath('/parametres');
  revalidatePath('/', 'layout');
}

export async function enregistrerSeuils(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaSeuils.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('organization_settings')
    .update({
      tank_variance_pct: lu.data.tankVariance,
      delivery_variance_pct: lu.data.deliveryVariance,
      cash_tolerance_fcfa: lu.data.cashTolerance,
      deposit_missing_hours: lu.data.depositHours,
      report_mode: lu.data.reportMode,
      report_time: lu.data.reportTime,
      sms_fallback: lu.data.smsFallback,
    })
    .eq('organization_id', contexte.membre.organizationId);
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.saved' };
}

export async function enregistrerSurchargeStation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaSurchargeStation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const d = lu.data;
  const tousVides =
    d.tankVariance === null &&
    d.deliveryVariance === null &&
    d.cashTolerance === null &&
    d.depositHours === null;
  const { error } = tousVides
    ? await supabase.from('station_settings').delete().eq('station_id', d.stationId)
    : await supabase.from('station_settings').upsert(
        {
          station_id: d.stationId,
          organization_id: contexte.membre.organizationId,
          tank_variance_pct: d.tankVariance,
          delivery_variance_pct: d.deliveryVariance,
          cash_tolerance_fcfa: d.cashTolerance,
          deposit_missing_hours: d.depositHours,
        },
        { onConflict: 'station_id' },
      );
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.saved' };
}

export async function enregistrerPlafonds(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaPlafonds.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const org = contexte.membre.organizationId;
  const lignes = [
    { organization_id: org, role: 'manager' as const, max_fcfa: lu.data.manager },
    { organization_id: org, role: 'shop_cashier' as const, max_fcfa: lu.data.shop_cashier },
    { organization_id: org, role: 'pump_attendant' as const, max_fcfa: lu.data.pump_attendant },
    { organization_id: org, role: 'mechanic' as const, max_fcfa: lu.data.mechanic },
    { organization_id: org, role: 'washer' as const, max_fcfa: lu.data.mechanic },
  ];
  const { error } = await supabase
    .from('void_role_limits')
    .upsert(lignes, { onConflict: 'organization_id,role' });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.saved' };
}

export async function ajouterDestinataire(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaDestinataire.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('notification_recipients').insert({
    organization_id: contexte.membre.organizationId,
    name: lu.data.nom,
    phone_e164: lu.data.telephone,
    receives_report: lu.data.rapport,
    receives_alerts: lu.data.alertes,
  });
  if (error) return { erreur: error.code === '23505' ? 'settings.phoneExists' : error.message };
  revalider();
  return { succes: 'settings.recipientAdded' };
}

export async function mettreAJourDestinataire(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaMiseAJourDestinataire.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('notification_recipients')
    .update({ receives_report: lu.data.rapport, receives_alerts: lu.data.alertes })
    .eq('id', lu.data.id);
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.recipientUpdated' };
}

export async function retirerDestinataire(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaIdentifiant.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.from('notification_recipients').delete().eq('id', lu.data.id);
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.recipientRemoved' };
}

export async function enregistrerRoutage(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const brut: Record<string, unknown> = {};
  for (const type of TYPES_ALERTE_ROUTABLES) {
    const v = formData.get(`route_${type}`);
    if (typeof v === 'string') brut[type] = v;
  }
  const lu = schemaRoutage.safeParse(brut);
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const lignes = Object.entries(lu.data).map(([alert_type, route]) => ({
    organization_id: contexte.membre.organizationId,
    alert_type: alert_type as (typeof TYPES_ALERTE_ROUTABLES)[number],
    route: route!,
  }));
  const { error } = await supabase
    .from('alert_routing')
    .upsert(lignes, { onConflict: 'organization_id,alert_type' });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.routingSaved' };
}

export async function inviterSuperviseur(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaInvitation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  // La session propriétaire est transmise en Authorization : l'Edge Function relit l'identité.
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    already_registered?: boolean;
    error?: string;
  }>('invite-supervisor', { body: { email: lu.data.email } });
  if (error || !data?.ok) return { erreur: 'settings.inviteFailed' };
  revalider();
  return { succes: data.already_registered ? 'settings.invitedExisting' : 'settings.invited' };
}

export async function revoquerSuperviseur(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaIdentifiant.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('revoke_supervisor', { p_invitation_id: lu.data.id });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.revoked' };
}

export async function enregistrerMomentRapport(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaMomentRapport.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await proprietaire();
  if (!contexte) return { erreur: 'settings.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('organization_settings')
    .update({
      report_mode: lu.data.reportMode,
      report_time: lu.data.reportTime,
      sms_fallback: lu.data.smsFallback,
    })
    .eq('organization_id', contexte.membre.organizationId);
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'settings.saved' };
}
