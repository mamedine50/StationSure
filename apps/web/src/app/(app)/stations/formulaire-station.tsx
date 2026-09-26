'use client';

import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { creerStation } from '@/actions/organisation';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireStation() {
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
        <Champ label={t('stations.city')} name="ville" type="text" maxLength={80} />
      </div>
      <Message etat={etat} />
      <BoutonPrincipal className="self-start">{t('stations.add')}</BoutonPrincipal>
    </form>
  );
}
