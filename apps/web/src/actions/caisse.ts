'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaDecisionAnnulation,
  schemaDecisionCompteCredit,
  schemaDecisionEcart,
  schemaImportReleve,
} from '@/lib/validation';

async function proprietaire() {
  const contexte = await obtenirContexte();
  return contexte.membre && contexte.estProprietaire ? contexte : null;
}

function revalider() {
  revalidatePath('/a-valider');
  revalidatePath('/caisse');
  revalidatePath('/credit-clients');
  revalidatePath('/', 'layout');
}

export async function deciderEcart(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaDecisionEcart.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('decide_cash_variance', {
    p_closing_id: lu.data.closingId,
    p_decision: lu.data.decision,
    ...(lu.data.note ? { p_note: lu.data.note } : {}),
  });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'validate.decided' };
}

export async function deciderAnnulation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaDecisionAnnulation.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('decide_void', {
    p_void_id: lu.data.voidId,
    p_approve: lu.data.approuver === 'true',
    ...(lu.data.note ? { p_note: lu.data.note } : {}),
  });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'validate.decided' };
}

export async function deciderCompteCredit(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaDecisionCompteCredit.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('decide_credit_account', {
    p_account_id: lu.data.accountId,
    p_approve: lu.data.approuver === 'true',
    p_limit_fcfa: lu.data.plafond,
  });
  if (error) return { erreur: error.message };
  revalider();
  return { succes: 'validate.decided' };
}

export async function importerReleve(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaImportReleve.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  if (!(await proprietaire())) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('import_mobile_money_statement', {
    p_provider: lu.data.operateur,
    p_lines: lu.data.lignes,
    ...(lu.data.fichier ? { p_filename: lu.data.fichier } : {}),
    p_mapping: lu.data.mapping,
  });
  if (error) return { erreur: error.message };
  const res = data as { matched: number; unmatched: number };
  revalider();
  return { succes: `cashPage.imported|${res.matched}|${res.unmatched}` };
}
