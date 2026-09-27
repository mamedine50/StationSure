import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { obtenirContexte } from '@/lib/auth/contexte';
import { chargerLocalites } from '@/lib/localites';

import { FormulaireOrganisation, FormulairePremiereStation } from './formulaires';

export const metadata: Metadata = { title: t('onboarding.title') };

export default async function PageOnboarding() {
  const contexte = await obtenirContexte();
  if (contexte.membre && contexte.stations.length > 0) redirect('/');

  if (!contexte.membre) {
    return (
      <div className="flex flex-col gap-5">
        <Entete
          etape={1}
          titre={t('onboarding.step1Title')}
          sousTitre={t('onboarding.step1Subtitle')}
        />
        <FormulaireOrganisation />
      </div>
    );
  }

  if (!contexte.estProprietaire) {
    return <p className="m-0 text-[14px] text-texte-secondaire">{t('onboarding.waitOwner')}</p>;
  }

  const localites = await chargerLocalites();
  return (
    <div className="flex flex-col gap-5">
      <Entete
        etape={2}
        titre={t('onboarding.step2Title')}
        sousTitre={t('onboarding.step2Subtitle')}
      />
      <FormulairePremiereStation localites={localites} />
    </div>
  );
}

function Entete({ etape, titre, sousTitre }: { etape: 1 | 2; titre: string; sousTitre: string }) {
  return (
    <header className="flex flex-col gap-1">
      <span className="text-[12px] uppercase tracking-wider text-accent">
        {t('onboarding.step', { current: etape })}
      </span>
      <h1 className="m-0 font-display text-[22px] font-bold">{titre}</h1>
      <p className="m-0 text-[13px] text-texte-secondaire">{sousTitre}</p>
    </header>
  );
}
