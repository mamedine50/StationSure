'use client';

import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { definirNouveauMotDePasse } from '@/actions/auth';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireNouveauMotDePasse() {
  const [etat, action] = useActionState(definirNouveauMotDePasse, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="m-0 font-display text-[22px] font-bold">{t('auth.newPasswordTitle')}</h1>
      <Champ
        label={t('auth.password')}
        name="motDePasse"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Champ
        label={t('auth.passwordConfirm')}
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
      />
      <Message etat={etat} />
      <BoutonPrincipal>{t('auth.submitNewPassword')}</BoutonPrincipal>
    </form>
  );
}
