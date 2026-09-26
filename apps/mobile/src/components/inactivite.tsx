import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { INACTIVITE_MINUTES } from '@/lib/env';
import { useSession } from '@/lib/session';

/**
 * Enveloppe l'écran connecté : toute pression relance le compte à rebours ;
 * sans interaction pendant INACTIVITE_MINUTES, la session employé est fermée (retour au PIN).
 */
export function SurveillanceInactivite({ children }: { children: ReactNode }) {
  const { session, deconnecterEmploye } = useSession();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relancer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(
      () => void deconnecterEmploye('inactivity'),
      INACTIVITE_MINUTES * 60 * 1000,
    );
  }, [deconnecterEmploye]);

  useEffect(() => {
    if (session.etat !== 'connecte') return;
    relancer();
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [session.etat, relancer]);

  return (
    <View
      className="flex-1"
      onStartShouldSetResponderCapture={() => {
        relancer();
        return false;
      }}
    >
      {children}
    </View>
  );
}
