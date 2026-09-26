'use client';

import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { creerOrganisation, creerStation } from '@/actions/organisation';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';
import { PLANS } from '@/lib/validation';

export function FormulaireOrganisation() {
  const [etat, action] = useActionState(creerOrganisation, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Champ
        label={t('onboarding.orgName')}
        name="nom"
        type="text"
        minLength={2}
        maxLength={120}
        required
        autoFocus
      />
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[13px] text-texte-secondaire">{t('onboarding.plan')}</legend>
        {PLANS.map((plan, i) => (
          <label
            key={plan}
            className="flex min-h-tactile cursor-pointer items-center gap-3 rounded-md border border-bordure bg-surface-2 px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-fond"
          >
            <input
              type="radio"
              name="plan"
              value={plan}
              defaultChecked={i === 0}
              className="accent-accent"
            />
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold">{t(`common.plans.${plan}`)}</span>
              <span className="text-[12px] text-texte-secondaire">
                {t(`onboarding.plans.${plan}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <Message etat={etat} />
      <BoutonPrincipal>{t('onboarding.submitOrg')}</BoutonPrincipal>
    </form>
  );
}

export function FormulairePremiereStation() {
  const [etat, action] = useActionState(creerStation, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="retour" value="/" />
      <Champ
        label={t('onboarding.stationName')}
        name="nom"
        type="text"
        minLength={2}
        maxLength={80}
        required
        autoFocus
      />
      <Champ label={t('onboarding.city')} name="ville" type="text" maxLength={80} />
      <Message etat={etat} />
      <BoutonPrincipal>{t('onboarding.submitStation')}</BoutonPrincipal>
    </form>
  );
}
