import { APP_NAME } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { couleurs } from '@stationsure/ui';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { classesPolices } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: t('common.ownerArea'),
};

export const viewport: Viewport = {
  themeColor: couleurs.fond,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`dark ${classesPolices}`}>
      <body className="flex min-h-screen">{children}</body>
    </html>
  );
}
