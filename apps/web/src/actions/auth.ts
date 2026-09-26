'use server';

import { redirect } from 'next/navigation';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaConnexion,
  schemaInscription,
  schemaMotDePasseOublie,
  schemaNouveauMotDePasse,
} from '@/lib/validation';

function urlSite(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export async function seConnecter(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaConnexion.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signInWithPassword({
    email: lu.data.email,
    password: lu.data.motDePasse,
  });
  if (error) {
    if (error.code === 'email_not_confirmed') return { erreur: 'auth.emailNotConfirmed' };
    return { erreur: 'auth.invalidCredentials' };
  }
  const suite = formData.get('suite');
  redirect(typeof suite === 'string' && suite.startsWith('/') ? suite : '/');
}

export async function sInscrire(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaInscription.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.signUp({
    email: lu.data.email,
    password: lu.data.motDePasse,
    options: { emailRedirectTo: `${urlSite()}/auth/callback?suite=/onboarding` },
  });
  if (error) {
    if (error.code === 'user_already_exists') return { erreur: 'auth.emailTaken' };
    return { erreur: error.message };
  }
  // Adresse déjà inscrite (Supabase renvoie un utilisateur sans identité pour ne pas la révéler).
  if (data.user && data.user.identities?.length === 0) return { erreur: 'auth.emailTaken' };
  return { succes: 'auth.signupSent' };
}

export async function demanderReinitialisation(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaMotDePasseOublie.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  await supabase.auth.resetPasswordForEmail(lu.data.email, {
    redirectTo: `${urlSite()}/auth/callback?suite=/nouveau-mot-de-passe`,
  });
  // Réponse identique que l'adresse existe ou non.
  return { succes: 'auth.forgotSent' };
}

export async function definirNouveauMotDePasse(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaNouveauMotDePasse.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.updateUser({ password: lu.data.motDePasse });
  if (error) return { erreur: error.message };
  redirect('/');
}

export async function seDeconnecter(): Promise<void> {
  const supabase = await creerClientServeur();
  await supabase.auth.signOut();
  redirect('/connexion');
}
