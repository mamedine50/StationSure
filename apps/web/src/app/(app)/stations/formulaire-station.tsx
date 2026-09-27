'use client';

import type { Localite } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useActionState, useState } from 'react';

import { creerStation, modifierStation } from '@/actions/organisation';
import { ChampVille } from '@/components/ui/champ-ville';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireStation({ localites }: { localites: Localite[] }) {
  const [etat, action] = useActionState(creerStation, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex max-w-xl flex-col gap-4 rounded-xl border border-bordure bg-surface p-[18px]"
    >
      <h2 className="m-0 text-[15px] font-semibold">{t('stations.add')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Champ
          label={t('stations.name')}
          name="nom"
          type="text"
          minLength={2}
          maxLength={80}
          required
        />
        <ChampVille localites={localites} label={t('stations.city')} />
      </div>
      <Message etat={etat} />
      <BoutonPrincipal className="self-start">{t('stations.add')}</BoutonPrincipal>
    </form>
  );
}

export function FormulaireModifierStation({
  station,
  localites,
}: {
  station: { id: string; name: string; city: string | null; commune_code: string | null };
  localites: Localite[];
}) {
  const [etat, action] = useActionState(modifierStation, ETAT_INITIAL);
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="text-[13px] text-accent">
        {t('stations.edit')}
      </button>
    );
  }
  return (
    <form
      action={action}
      className="col-span-4 flex flex-col gap-3 rounded-md border border-bordure bg-surface-2 p-3"
    >
      <input type="hidden" name="stationId" value={station.id} />
      <div className="grid grid-cols-2 gap-3">
        <Champ
          label={t('stations.name')}
          name="nom"
          defaultValue={station.name}
          minLength={2}
          maxLength={80}
          required
        />
        <ChampVille
          localites={localites}
          communeCode={station.commune_code ?? ''}
          ville={station.commune_code ? '' : (station.city ?? '')}
          label={t('stations.city')}
        />
      </div>
      <Message etat={etat} />
      <div className="flex gap-2">
        <BoutonPrincipal className="h-10 px-3 text-[13px]">{t('common.save')}</BoutonPrincipal>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="h-10 rounded-lg border border-bordure-forte px-3 text-[13px] text-texte"
        >
          {t('common.close')}
        </button>
      </div>
    </form>
  );
}
