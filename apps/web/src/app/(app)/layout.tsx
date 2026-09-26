import type { ReactNode } from 'react';

import { BarreLaterale } from '@/components/barre-laterale';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

/** Espace propriétaire : session + organisation + au moins une station, sinon redirection. */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const { data: pending, error: erreurPending } = await supabase.rpc('pending_validations');
  if (erreurPending) console.error('pending_validations', erreurPending.message);
  const compteurs = (pending ?? {}) as Record<string, number>;
  const aValider = Object.values(compteurs).reduce((s, n) => s + Number(n || 0), 0);
  return (
    <>
      <BarreLaterale
        organisation={contexte.organisation?.name ?? ''}
        email={contexte.utilisateur.email}
        role={contexte.membre.role}
        aValider={aValider}
      />
      {children}
    </>
  );
}
