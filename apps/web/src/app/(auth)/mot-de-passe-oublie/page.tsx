import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { FormulaireOubli } from './formulaire-oubli';

export const metadata: Metadata = { title: t('auth.forgotTitle') };

export default function PageMotDePasseOublie() {
  return <FormulaireOubli />;
}
