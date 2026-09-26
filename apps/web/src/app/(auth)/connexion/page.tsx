import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { FormulaireConnexion } from './formulaire-connexion';

export const metadata: Metadata = { title: t('auth.loginTitle') };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const { suite, erreur } = await searchParams;
  return (
    <FormulaireConnexion
      suite={suite ?? ''}
      erreurInitiale={erreur === 'callback' ? 'auth.callbackError' : undefined}
    />
  );
}
