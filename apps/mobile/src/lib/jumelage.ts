import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { supabase } from './supabase';

export type ResultatJumelage = { ok: true } | { ok: false; erreur: 'invalide' | 'reseau' };

/** Extrait code et id d'un QR `stationsure://pair?code=123456&id=<uuid>`. */
export function lireQrJumelage(texte: string): { code: string; pairingId: string | null } | null {
  try {
    const url = new URL(texte);
    if (url.protocol !== 'stationsure:' || url.hostname !== 'pair') return null;
    const code = url.searchParams.get('code') ?? '';
    if (!/^[0-9]{6}$/.test(code)) return null;
    return { code, pairingId: url.searchParams.get('id') };
  } catch {
    return null;
  }
}

/** Appelle l'Edge Function pair-device (sans session) et installe la session de l'appareil. */
export async function jumelerAppareil(
  code: string,
  pairingId: string | null,
  label: string,
): Promise<ResultatJumelage> {
  let reponse: Response;
  try {
    reponse = await fetch(`${SUPABASE_URL}/functions/v1/pair-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code: code.replace(/\s+/g, ''), pairing_id: pairingId, label }),
    });
  } catch {
    return { ok: false, erreur: 'reseau' };
  }
  if (!reponse.ok) return { ok: false, erreur: reponse.status >= 500 ? 'reseau' : 'invalide' };
  const corps = (await reponse.json()) as {
    session?: { access_token: string; refresh_token: string };
  };
  if (!corps.session) return { ok: false, erreur: 'invalide' };
  const { error } = await supabase.auth.setSession({
    access_token: corps.session.access_token,
    refresh_token: corps.session.refresh_token,
  });
  if (error) return { ok: false, erreur: 'reseau' };
  return { ok: true };
}
