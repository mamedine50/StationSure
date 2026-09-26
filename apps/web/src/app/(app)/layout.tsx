import type { ReactNode } from 'react';

import { BarreLaterale } from '@/components/barre-laterale';
import { exigerContexteComplet } from '@/lib/auth/contexte';

/** Espace propriétaire : session + organisation + au moins une station, sinon redirection. */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const contexte = await exigerContexteComplet();
  return (
    <>
      <BarreLaterale
        organisation={contexte.organisation?.name ?? ''}
        email={contexte.utilisateur.email}
        role={contexte.membre.role}
      />
      {children}
    </>
  );
}
