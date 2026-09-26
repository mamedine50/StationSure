'use client';

import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { traiterFileDev } from '@/actions/notifications';
import { ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function BoutonTraiterFile() {
  const [etat, action, pending] = useActionState(traiterFileDev, ETAT_INITIAL);
  return (
    <form action={action} className="flex items-center gap-3">
      <Message etat={etat} />
      <button
        disabled={pending}
        className="h-11 rounded-lg bg-accent px-4 text-[14px] font-semibold text-accent-texte disabled:opacity-60"
      >
        {pending ? t('common.loading') : t('devMessages.process')}
      </button>
    </form>
  );
}
