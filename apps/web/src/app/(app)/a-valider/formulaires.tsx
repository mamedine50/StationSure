'use client';

import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { deciderAnnulation, deciderCompteCredit, deciderEcart } from '@/actions/caisse';
import { relancerGerant } from '@/actions/notifications';
import { ETAT_INITIAL, Message } from '@/components/ui/formulaire';

const bouton = 'h-11 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-60';

export function BoutonsEcart({ closingId }: { closingId: string }) {
  const [etat, action] = useActionState(deciderEcart, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="closingId" value={closingId} />
      <input
        name="note"
        placeholder={t('validate.note')}
        className="h-11 w-48 rounded-md border border-bordure bg-fond px-3 text-[13px] text-texte"
      />
      <button
        name="decision"
        value="accept_loss"
        className={`${bouton} border border-bordure-forte text-texte`}
      >
        {t('validate.acceptLoss')}
      </button>
      <button
        name="decision"
        value="salary_deduction"
        className={`${bouton} bg-accent text-accent-texte`}
      >
        {t('validate.salaryDeduction')}
      </button>
      <button
        name="decision"
        value="recount"
        className={`${bouton} border border-bordure-forte text-texte`}
      >
        {t('validate.recount')}
      </button>
      <Message etat={etat} />
    </form>
  );
}

export function FormulaireAnnulation({ voidId }: { voidId: string }) {
  const [etat, action] = useActionState(deciderAnnulation, ETAT_INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="voidId" value={voidId} />
      <button
        name="approuver"
        value="false"
        className={`${bouton} border border-bordure-forte text-texte`}
      >
        {t('validate.reject')}
      </button>
      <button name="approuver" value="true" className={`${bouton} bg-accent text-accent-texte`}>
        {t('validate.approve')}
      </button>
      <Message etat={etat} />
    </form>
  );
}

export function FormulaireCompteCredit({ accountId }: { accountId: string }) {
  const [etat, action] = useActionState(deciderCompteCredit, ETAT_INITIAL);
  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
        {t('validate.limitGranted')}
        <input
          name="plafond"
          type="number"
          min={0}
          step={1}
          defaultValue={0}
          className="h-11 w-40 rounded-md border border-bordure bg-fond px-3 font-mono text-[14px] text-texte"
        />
      </label>
      <button
        name="approuver"
        value="false"
        className={`${bouton} border border-bordure-forte text-texte`}
      >
        {t('validate.reject')}
      </button>
      <button name="approuver" value="true" className={`${bouton} bg-accent text-accent-texte`}>
        {t('validate.openAccount')}
      </button>
      <Message etat={etat} />
    </form>
  );
}

/** Écran 17 : relance WhatsApp du gérant qui a clôturé sans bordereau (désactivée sans numéro). */
export function FormulaireRelance({
  shiftId,
  nom,
  telephone,
  rw,
}: {
  shiftId: string;
  nom: string;
  telephone: string | null;
  rw: boolean;
}) {
  const [etat, action] = useActionState(relancerGerant, ETAT_INITIAL);
  const actif = rw && telephone !== null;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="shiftId" value={shiftId} />
      <button
        disabled={!actif}
        title={telephone === null ? t('validate.remindNoPhone') : telephone}
        className={`${bouton} bg-accent text-accent-texte disabled:opacity-40`}
      >
        {t('validate.remindTo', { name: nom })}
      </button>
      {telephone === null && (
        <span className="text-[12px] text-texte-secondaire">{t('validate.remindNoPhone')}</span>
      )}
      <Message etat={etat} />
    </form>
  );
}
