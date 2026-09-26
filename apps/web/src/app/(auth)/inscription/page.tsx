import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { FormulaireInscription } from './formulaire-inscription';

export const metadata: Metadata = { title: t('auth.signupTitle') };

export default function PageInscription() {
  return <FormulaireInscription />;
}
