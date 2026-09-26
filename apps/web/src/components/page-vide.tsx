import { t } from '@stationsure/i18n';

import { trouverEntree, type ClePage } from '@/lib/navigation';

interface Props {
  cle: ClePage;
}

/** Page standard de la phase 0 : titre + état vide propre, sans aucune donnée fictive. */
export function PageVide({ cle }: Props) {
  const entree = trouverEntree(cle);
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[26px] font-bold">{t(`nav.${cle}`)}</h1>
        <span className="text-[14px] text-texte-secondaire">{t('common.ownerArea')}</span>
      </header>

      <section
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-xl border border-bordure bg-surface px-6 py-14 text-center"
      >
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-pilule border border-bordure bg-surface-2"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-texte-secondaire"
          >
            <path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2" />
            <path d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
            <path d="M9 13h6" />
          </svg>
        </span>
        <h2 className="m-0 text-[15px] font-semibold">{t(`empty.${cle}.title`)}</h2>
        <p className="m-0 max-w-md text-[13px] leading-relaxed text-texte-secondaire">
          {t(`empty.${cle}.description`)}
        </p>
        <span className="mt-2 rounded-pilule bg-accent-fond px-[10px] py-1 text-[12px] font-semibold text-accent">
          {t('empty.availableInPhase', { phase: entree.phase })}
        </span>
      </section>
    </main>
  );
}
