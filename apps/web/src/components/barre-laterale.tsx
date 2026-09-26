'use client';

import { APP_NAME } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { seDeconnecter } from '@/actions/auth';
import { NAVIGATION, NAVIGATION_PIED, type EntreeNavigation } from '@/lib/navigation';

import { LogoPompe } from './logo-pompe';

function LienNavigation({
  entree,
  actif,
  pied,
}: {
  entree: EntreeNavigation;
  actif: boolean;
  pied?: boolean;
}) {
  const base = 'flex h-10 items-center rounded-sm px-3 text-[14px] no-underline transition-colors';
  const etat = actif
    ? 'bg-accent-fond font-semibold text-accent'
    : pied
      ? 'text-texte-secondaire hover:bg-surface hover:text-texte'
      : 'text-texte-nav hover:bg-surface hover:text-texte';
  return (
    <Link
      href={entree.href}
      className={`${base} ${etat}`}
      aria-current={actif ? 'page' : undefined}
    >
      {t(`nav.${entree.cle}`)}
    </Link>
  );
}

export function BarreLaterale({
  organisation,
  email,
  role,
}: {
  organisation: string;
  email: string;
  role: 'owner' | 'supervisor';
}) {
  const pathname = usePathname();
  const estActif = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav
      aria-label={t('common.ownerArea')}
      className="flex w-barre-laterale shrink-0 flex-col gap-1 border-r border-bordure bg-surface-nav px-[14px] py-6"
    >
      <Link href="/" className="mb-2 flex items-center gap-2 px-[10px] text-texte no-underline">
        <LogoPompe />
        <span className="font-display text-[15px] font-bold">{APP_NAME}</span>
      </Link>
      <div className="mb-4 px-[10px] text-[12px] text-texte-secondaire">
        <div className="truncate font-semibold text-texte">{organisation}</div>
        <div className="truncate">{email}</div>
        <span className="mt-1 inline-block rounded-pilule bg-surface-2 px-2 py-0.5 text-[11px]">
          {t(`common.roles.${role}`)}
          {role === 'supervisor' ? ` · ${t('common.readOnly')}` : ''}
        </span>
      </div>
      {NAVIGATION.map((entree) => (
        <LienNavigation key={entree.cle} entree={entree} actif={estActif(entree.href)} />
      ))}
      <div className="mt-auto flex flex-col gap-1">
        <LienNavigation entree={NAVIGATION_PIED} actif={estActif(NAVIGATION_PIED.href)} pied />
        <form action={seDeconnecter}>
          <button
            type="submit"
            className="flex h-10 w-full items-center rounded-sm px-3 text-left text-[14px] text-texte-secondaire hover:bg-surface hover:text-texte"
          >
            {t('auth.logout')}
          </button>
        </form>
      </div>
    </nav>
  );
}
