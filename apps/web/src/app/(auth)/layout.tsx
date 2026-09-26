import { APP_NAME } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { ReactNode } from 'react';

import { LogoPompe } from '@/components/logo-pompe';

export default function LayoutAuth({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        <LogoPompe />
        <span className="font-display text-[15px] font-bold">{APP_NAME}</span>
        <span className="text-[13px] text-texte-secondaire">· {t('common.ownerArea')}</span>
      </div>
      <div className="w-full max-w-md rounded-xl border border-bordure bg-surface p-6">
        {children}
      </div>
    </main>
  );
}
