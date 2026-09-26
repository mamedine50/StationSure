'use server';

import { revalidatePath } from 'next/cache';

import type { EtatFormulaire } from '@/components/ui/formulaire';
import { creerClientServeur } from '@/lib/supabase/server';
import { schemaCodeJumelage } from '@/lib/validation';

export interface CodeJumelage {
  pairingId: string;
  code: string;
  expiresAt: string;
  qr: string;
}

/** Owner : génère un code de jumelage pour une station (renvoyé en clair une seule fois). */
export async function genererCodeJumelage(
  stationId: string,
): Promise<{ code?: CodeJumelage; erreur?: string }> {
  const lu = schemaCodeJumelage.safeParse({ stationId });
  if (!lu.success) return { erreur: 'validation.station' };
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('create_pairing_code', {
    p_station_id: lu.data.stationId,
  });
  if (error || !data) return { erreur: 'common.error' };
  const res = data as { pairing_id: string; code: string; expires_at: string; qr: string };
  return {
    code: { pairingId: res.pairing_id, code: res.code, expiresAt: res.expires_at, qr: res.qr },
  };
}

/** Owner : révoque un appareil (inactif, sessions fermées, compte auth banni). */
export async function revoquerAppareil(
  _etat: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const deviceId = formData.get('deviceId');
  const stationId = formData.get('stationId');
  if (typeof deviceId !== 'string' || typeof stationId !== 'string')
    return { erreur: 'common.error' };
  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('revoke_device', { p_device_id: deviceId });
  if (error) return { erreur: 'common.error' };
  revalidatePath(`/stations/${stationId}/appareils`);
  return { succes: 'devices.revoked' };
}
