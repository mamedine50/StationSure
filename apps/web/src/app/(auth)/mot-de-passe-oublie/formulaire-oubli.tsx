'use client';

import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { useActionState } from 'react';

import { demanderReinitialisation } from '@/actions/auth';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireOubli() {
  const [etat, action] = useActionState(demanderReinitialisation, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">{t('auth.forgotTitle')}</h1>
        <p className="m-0 text-[13px] text-texte-secondaire">{t('auth.forgotSubtitle')}</p>
      </header>
      <Champ label={t('auth.email')} name="email" type="email" autoComplete="email" required />
      <Message etat={etat} />
      {!etat.succes && <BoutonPrincipal>{t('auth.submitForgot')}</BoutonPrincipal>}
      <Link href="/connexion" className="text-[13px] text-texte-secondaire">
        {t('common.back')}
      </Link>
    </form>
  );
}
