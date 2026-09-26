import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { PageVide } from '@/components/page-vide';

export const metadata: Metadata = { title: t('nav.settings') };

export default function Page() {
  return <PageVide cle="settings" />;
}
