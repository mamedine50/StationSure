import { APP_NAME } from '@stationsure/core';
import type { ReactNode } from 'react';

import { LogoPompe } from '@/components/logo-pompe';
import { creerClientServeur } from '@/lib/supabase/server';

import { seDeconnecter } from '@/actions/auth';
import { t } from '@stationsure/i18n';

/** Pages protégées sans barre latérale (onboarding, nouveau mot de passe). */
export default async function LayoutCompte({ children }: { children: ReactNode }) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <main className="flex min-h-screen w-full flex-col items-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-lg items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoPompe />
          <span className="font-display text-[15px] font-bold">{APP_NAME}</span>
        </div>
        <form
          action={seDeconnecter}
          className="flex items-center gap-3 text-[13px] text-texte-secondaire"
        >
          <span>{user?.email}</span>
          <button type="submit" className="h-10 rounded-sm border border-bordure px-3 text-texte">
            {t('auth.logout')}
          </button>
        </form>
      </div>
      <div className="w-full max-w-lg rounded-xl border border-bordure bg-surface p-6">
        {children}
      </div>
    </main>
  );
}
