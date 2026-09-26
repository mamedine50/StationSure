import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { FormulaireNouveauMotDePasse } from './formulaire';

export const metadata: Metadata = { title: t('auth.newPasswordTitle') };

export default function PageNouveauMotDePasse() {
  return <FormulaireNouveauMotDePasse />;
}
