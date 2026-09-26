'use client';

import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { useActionState } from 'react';

import { sInscrire } from '@/actions/auth';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireInscription() {
  const [etat, action] = useActionState(sInscrire, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">{t('auth.signupTitle')}</h1>
        <p className="m-0 text-[13px] text-texte-secondaire">{t('auth.signupSubtitle')}</p>
      </header>
      {etat.succes ? (
        <Message etat={etat} />
      ) : (
        <>
          <Champ label={t('auth.email')} name="email" type="email" autoComplete="email" required />
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
          <BoutonPrincipal>{t('auth.submitSignup')}</BoutonPrincipal>
        </>
      )}
      <span className="text-[13px] text-texte-secondaire">
        {t('auth.haveAccount')} <Link href="/connexion">{t('auth.login')}</Link>
      </span>
    </form>
  );
}
