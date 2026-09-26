'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { obtenirContexte } from '@/lib/auth/contexte';
import { envSupabase, estEnvironnementLocal } from '@/lib/env';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  lireFormulaire,
  premiereErreur,
  schemaAccuserAlerte,
  schemaRelance,
} from '@/lib/validation';

export async function accuserAlerte(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaAccuserAlerte.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.estProprietaire) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('alerts')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: contexte.utilisateur.id })
    .eq('id', lu.data.alertId);
  if (error) return { erreur: error.message };
  revalidatePath('/');
  revalidatePath('/alertes');
  revalidatePath('/a-valider');
  return { succes: 'dashboard.acknowledged' };
}

export async function relancerGerant(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lu = schemaRelance.safeParse(lireFormulaire(formData));
  if (!lu.success) return { erreur: premiereErreur(lu) };
  const contexte = await obtenirContexte();
  if (!contexte.estProprietaire) return { erreur: 'validate.readOnly' };
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('remind_manager', { p_shift_id: lu.data.shiftId });
  if (error) return { erreur: error.message };
  const res = data as { ok: boolean; error?: string | null };
  if (!res.ok) {
    return {
      erreur:
        res.error === 'NO_PHONE'
          ? 'validate.remindNoPhone'
          : res.error === 'ALREADY_SENT'
            ? 'validate.remindAlready'
            : (res.error ?? 'common.error'),
    };
  }
  revalidatePath('/dev/messages');
  return { succes: 'validate.remindSent' };
}

/** Local uniquement : appelle le worker pour vider la file (ce que pg_cron fait chaque minute). */
export async function traiterFileDev(): Promise<EtatFormulaire> {
  if (!estEnvironnementLocal()) return { erreur: 'devMessages.notLocal' };
  const contexte = await obtenirContexte();
  if (!contexte.estProprietaire) return { erreur: 'validate.readOnly' };
  const { url, key } = envSupabase();
  try {
    const reponse = await fetch(`${url}/functions/v1/notify-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        'x-worker-secret': process.env.NOTIFY_WORKER_SECRET ?? 'dev-notify-secret',
      },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    const bilan = (await reponse.json()) as {
      ok?: boolean;
      envoyes?: number;
      reessais?: number;
      echecs?: number;
    };
    if (!reponse.ok || !bilan.ok) return { erreur: 'devMessages.workerUnavailable' };
    revalidatePath('/dev/messages');
    return {
      succes: `devMessages.processed|${bilan.envoyes ?? 0}|${bilan.reessais ?? 0}|${bilan.echecs ?? 0}`,
    };
  } catch {
    return { erreur: 'devMessages.workerUnavailable' };
  }
}
