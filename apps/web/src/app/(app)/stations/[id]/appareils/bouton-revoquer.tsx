'use client';

import { t } from '@stationsure/i18n';
import { useActionState, useState } from 'react';

import { revoquerAppareil } from '@/actions/appareils';
import { BoutonDanger, BoutonSecondaire, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function BoutonRevoquer({
  deviceId,
  stationId,
  label,
}: {
  deviceId: string;
  stationId: string;
  label: string;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const [etat, action] = useActionState(revoquerAppareil, ETAT_INITIAL);

  if (!confirmation) {
    return (
      <button
        type="button"
        onClick={() => setConfirmation(true)}
        className="h-10 rounded-sm border border-danger-bordure px-3 text-[13px] font-semibold text-danger"
      >
        {t('devices.revoke')}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="stationId" value={stationId} />
      <p className="m-0 max-w-xs text-right text-[12px] text-texte-secondaire">
        {t('devices.revokeConfirm', { label })}
      </p>
      <Message etat={etat} />
      <div className="flex gap-2">
        <BoutonSecondaire onClick={() => setConfirmation(false)} className="h-10 px-3 text-[13px]">
          {t('common.cancel')}
        </BoutonSecondaire>
        <BoutonDanger className="h-10 px-3 text-[13px]">{t('common.confirm')}</BoutonDanger>
      </div>
    </form>
  );
}
