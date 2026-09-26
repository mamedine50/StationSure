'use client';

import { APP_NAME } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

export function BarreLaterale() {
  const pathname = usePathname();
  const estActif = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav
      aria-label={t('common.ownerArea')}
      className="flex w-barre-laterale shrink-0 flex-col gap-1 border-r border-bordure bg-surface-nav px-[14px] py-6"
    >
      <Link href="/" className="mb-5 flex items-center gap-2 px-[10px] text-texte no-underline">
        <LogoPompe />
        <span className="font-display text-[15px] font-bold">{APP_NAME}</span>
      </Link>
      {NAVIGATION.map((entree) => (
        <LienNavigation key={entree.cle} entree={entree} actif={estActif(entree.href)} />
      ))}
      <div className="mt-auto">
        <LienNavigation entree={NAVIGATION_PIED} actif={estActif(NAVIGATION_PIED.href)} pied />
      </div>
    </nav>
  );
}
