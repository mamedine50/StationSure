'use client';

import { t } from '@stationsure/i18n';
import { useActionState, useState } from 'react';

import { changerActivation, creerEmploye, definirPin } from '@/actions/employes';
import {
  BoutonPrincipal,
  BoutonSecondaire,
  Champ,
  ETAT_INITIAL,
  Message,
  Selecteur,
} from '@/components/ui/formulaire';
import { ROLES_EMPLOYE } from '@/lib/validation';

const ROLE_CLE: Record<(typeof ROLES_EMPLOYE)[number], string> = {
  manager: 'manager',
  pump_attendant: 'pumpAttendant',
  shop_cashier: 'shop',
  mechanic: 'mechanic',
  washer: 'washer',
};

export function FormulaireEmploye({ stations }: { stations: { id: string; name: string }[] }) {
  const [etat, action] = useActionState(creerEmploye, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-bordure bg-surface p-[18px]"
    >
      <h2 className="m-0 text-[15px] font-semibold">{t('employees.add')}</h2>
      <div className="grid grid-cols-3 gap-3">
        <Champ
          label={t('employees.name')}
          name="nomComplet"
          type="text"
          minLength={2}
          maxLength={120}
          required
        />
        <Selecteur label={t('employees.role')} name="role" required>
          {ROLES_EMPLOYE.map((role) => (
            <option key={role} value={role}>
              {t(`pin.roles.${ROLE_CLE[role]}`)}
            </option>
          ))}
        </Selecteur>
        <Selecteur label={t('employees.station')} name="stationId" required>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Selecteur>
        <Champ
          label={t('employees.phone')}
          name="telephone"
          type="tel"
          placeholder="+221 77 000 00 01"
          title={t('employees.phoneHint')}
        />
      </div>
      <Message etat={etat} />
      <BoutonPrincipal className="self-start">{t('employees.add')}</BoutonPrincipal>
    </form>
  );
}

export function FormulairePin({
  employeId,
  dejaDefini,
}: {
  employeId: string;
  dejaDefini: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(definirPin, ETAT_INITIAL);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="h-10 rounded-sm border border-bordure-forte px-3 text-[13px] font-semibold text-texte"
      >
        {dejaDefini ? t('employees.changePin') : t('employees.setPin')}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="employeId" value={employeId} />
      <div className="flex items-end gap-2">
        <Champ
          label={t('employees.pinLabel')}
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          required
          className="h-10 w-28 font-mono tracking-[0.3em]"
        />
        <BoutonPrincipal className="h-10 px-3 text-[13px]">{t('common.save')}</BoutonPrincipal>
        <BoutonSecondaire onClick={() => setOuvert(false)} className="h-10 px-3 text-[13px]">
          {t('common.cancel')}
        </BoutonSecondaire>
      </div>
      <span className="text-[11px] text-texte-secondaire">{t('employees.pinHint')}</span>
      <Message etat={etat} />
    </form>
  );
}

export function BoutonActivation({
  employeId,
  actif,
  nom,
}: {
  employeId: string;
  actif: boolean;
  nom: string;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const [etat, action] = useActionState(changerActivation, ETAT_INITIAL);

  if (actif && !confirmation) {
    return (
      <button
        type="button"
        onClick={() => setConfirmation(true)}
        className="h-10 rounded-sm border border-danger-bordure px-3 text-[13px] font-semibold text-danger"
      >
        {t('employees.deactivate')}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="employeId" value={employeId} />
      <input type="hidden" name="actif" value={actif ? 'false' : 'true'} />
      {actif && (
        <span className="max-w-xs text-right text-[12px] text-texte-secondaire">
          {t('employees.confirmDeactivate', { name: nom })}
        </span>
      )}
      <div className="flex gap-2">
        {actif && (
          <BoutonSecondaire
            onClick={() => setConfirmation(false)}
            className="h-10 px-3 text-[13px]"
          >
            {t('common.cancel')}
          </BoutonSecondaire>
        )}
        <button
          type="submit"
          className={`h-10 rounded-sm px-3 text-[13px] font-semibold ${actif ? 'border border-danger-bordure bg-danger-fond text-danger' : 'border border-bordure-forte text-texte'}`}
        >
          {actif ? t('common.confirm') : t('employees.reactivate')}
        </button>
      </div>
      <Message etat={etat} />
    </form>
  );
}
