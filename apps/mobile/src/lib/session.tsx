import type { ValeurEnum } from '@stationsure/database';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from './supabase';

export type RoleEmploye = ValeurEnum<'employee_role'>;

export interface EmployeConnecte {
  sessionId: string;
  employeeId: string;
  fullName: string;
  role: RoleEmploye;
  expiresAt: string;
}

export interface Appareil {
  stationId: string;
  stationName: string;
  organizationId: string;
  deviceId: string;
}

/**
 * chargement → non_jumele (pas de session appareil) | revoque (session mais appareil inactif)
 *            → pin (appareil OK, personne connectée) → connecte (session employé active).
 */
export type EtatSession =
  | { etat: 'chargement' }
  | { etat: 'non_jumele' }
  | { etat: 'revoque' }
  | { etat: 'pin'; appareil: Appareil }
  | { etat: 'connecte'; appareil: Appareil; employe: EmployeConnecte };

export type ResultatPin =
  | { ok: true }
  | { ok: false; erreur: 'PIN_INVALID' }
  | { ok: false; erreur: 'PIN_LOCKED'; secondesRestantes: number }
  | { ok: false; erreur: 'DEVICE_NOT_PAIRED' }
  | { ok: false; erreur: 'RESEAU' };

interface ContexteSession {
  session: EtatSession;
  rafraichir: () => Promise<void>;
  verifierPin: (employeeId: string, pin: string) => Promise<ResultatPin>;
  deconnecterEmploye: (motif: 'logout' | 'inactivity' | 'handover') => Promise<void>;
  oublierAppareil: () => Promise<void>;
}

const Contexte = createContext<ContexteSession | null>(null);

function lireEmploye(json: unknown): EmployeConnecte | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (typeof o.session_id !== 'string' || typeof o.employee_id !== 'string') return null;
  return {
    sessionId: o.session_id,
    employeeId: o.employee_id,
    fullName: String(o.full_name ?? ''),
    role: o.role as RoleEmploye,
    expiresAt: String(o.expires_at ?? ''),
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<EtatSession>({ etat: 'chargement' });

  /** Recalcule l'état complet depuis le serveur (appareil actif ? session employé ?). */
  const rafraichir = useCallback(async () => {
    const {
      data: { session: sessionAuth },
    } = await supabase.auth.getSession();
    if (!sessionAuth) {
      setSession({ etat: 'non_jumele' });
      return;
    }
    const { data: stationId, error } = await supabase.rpc('current_device_station_id');
    if (error) {
      // Jeton refusé (appareil banni) ou appel impossible : on considère l'appareil révoqué
      // seulement si le serveur a répondu ; sinon on garde l'état courant.
      if (error.code === 'PGRST301' || error.message.toLowerCase().includes('jwt')) {
        await supabase.auth.signOut();
        setSession({ etat: 'revoque' });
      }
      return;
    }
    if (!stationId) {
      await supabase.auth.signOut();
      setSession({ etat: 'revoque' });
      return;
    }
    const [
      { data: station },
      { data: sessionEmploye },
      { data: deviceId },
      { data: organizationId },
    ] = await Promise.all([
      supabase.from('stations').select('id, name').eq('id', stationId).maybeSingle(),
      supabase.rpc('current_employee_session'),
      supabase.rpc('current_device_id'),
      supabase.rpc('current_device_organization_id'),
    ]);
    const appareil: Appareil = {
      stationId,
      stationName: station?.name ?? '',
      organizationId: organizationId ?? '',
      deviceId: deviceId ?? '',
    };
    const employe = lireEmploye(sessionEmploye);
    setSession(employe ? { etat: 'connecte', appareil, employe } : { etat: 'pin', appareil });
  }, []);

  useEffect(() => {
    // rafraichir() ne met à jour l'état qu'après les appels serveur (asynchrone), pas pendant l'effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void rafraichir();
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement === 'SIGNED_OUT')
        setSession((s) => (s.etat === 'revoque' ? s : { etat: 'non_jumele' }));
      if (evenement === 'SIGNED_IN') void rafraichir();
    });
    return () => abonnement.subscription.unsubscribe();
  }, [rafraichir]);

  const verifierPin = useCallback(async (employeeId: string, pin: string): Promise<ResultatPin> => {
    const { data, error } = await supabase.rpc('verify_employee_pin', {
      p_employee_id: employeeId,
      p_pin: pin,
    });
    if (error) {
      if (error.message.startsWith('DEVICE_NOT_PAIRED')) {
        await supabase.auth.signOut();
        setSession({ etat: 'revoque' });
        return { ok: false, erreur: 'DEVICE_NOT_PAIRED' };
      }
      return { ok: false, erreur: 'RESEAU' };
    }
    const res = data as { ok: boolean; error?: string; retry_after_seconds?: number } & Record<
      string,
      unknown
    >;
    if (!res.ok) {
      if (res.error === 'PIN_LOCKED') {
        return {
          ok: false,
          erreur: 'PIN_LOCKED',
          secondesRestantes: Number(res.retry_after_seconds ?? 900),
        };
      }
      return { ok: false, erreur: 'PIN_INVALID' };
    }
    const employe = lireEmploye(res);
    if (!employe) return { ok: false, erreur: 'RESEAU' };
    setSession((s) =>
      s.etat === 'pin' || s.etat === 'connecte'
        ? { etat: 'connecte', appareil: s.appareil, employe }
        : s,
    );
    return { ok: true };
  }, []);

  const deconnecterEmploye = useCallback(async (motif: 'logout' | 'inactivity' | 'handover') => {
    setSession((s) => {
      if (s.etat === 'connecte') {
        void supabase.rpc('end_employee_session', {
          p_session_id: s.employe.sessionId,
          p_reason: motif,
        });
        return { etat: 'pin', appareil: s.appareil };
      }
      return s;
    });
  }, []);

  const oublierAppareil = useCallback(async () => {
    await supabase.auth.signOut();
    setSession({ etat: 'non_jumele' });
  }, []);

  const valeur = useMemo(
    () => ({ session, rafraichir, verifierPin, deconnecterEmploye, oublierAppareil }),
    [session, rafraichir, verifierPin, deconnecterEmploye, oublierAppareil],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): ContexteSession {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useSession doit être utilisé sous SessionProvider');
  return ctx;
}
