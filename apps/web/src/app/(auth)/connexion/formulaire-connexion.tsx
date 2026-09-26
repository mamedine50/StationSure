'use client';

import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { useActionState } from 'react';

import { seConnecter } from '@/actions/auth';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireConnexion({
  suite,
  erreurInitiale,
}: {
  suite: string;
  erreurInitiale?: string | undefined;
}) {
  const [etat, action] = useActionState(
    seConnecter,
    erreurInitiale ? { erreur: erreurInitiale } : ETAT_INITIAL,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">{t('auth.loginTitle')}</h1>
        <p className="m-0 text-[13px] text-texte-secondaire">{t('auth.loginSubtitle')}</p>
      </header>
      <input type="hidden" name="suite" value={suite} />
      <Champ label={t('auth.email')} name="email" type="email" autoComplete="email" required />
      <Champ
        label={t('auth.password')}
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
      />
      <Message etat={etat} />
      <BoutonPrincipal>{t('auth.submitLogin')}</BoutonPrincipal>
      <div className="flex flex-col gap-1 text-[13px] text-texte-secondaire">
        <Link href="/mot-de-passe-oublie">{t('auth.forgotPassword')}</Link>
        <span>
          {t('auth.noAccount')} <Link href="/inscription">{t('auth.signup')}</Link>
        </span>
      </div>
    </form>
  );
}
