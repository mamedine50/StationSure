'use client';

import { t } from '@stationsure/i18n';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';

import { accuserAlerte } from '@/actions/notifications';
import { ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function BoutonAccuser({ alertId }: { alertId: string }) {
  const [etat, action] = useActionState(accuserAlerte, ETAT_INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="alertId" value={alertId} />
      <button className="h-9 rounded-lg border border-bordure-forte px-3 text-[12px] font-semibold text-texte disabled:opacity-60">
        {t('dashboard.acknowledge')}
      </button>
      {etat.erreur && <Message etat={etat} />}
    </form>
  );
}

export function FiltreStation({
  stations,
  valeur,
  periode,
}: {
  stations: { id: string; name: string }[];
  valeur: string;
  periode: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={t('alertsPage.station')}
      value={valeur}
      onChange={(e) =>
        router.push(`/?periode=${periode}${e.target.value ? `&station=${e.target.value}` : ''}`)
      }
      className="h-11 rounded-lg border border-bordure bg-surface px-3 text-[13px] text-texte"
    >
      <option value="">{t('dashboard.allStations', { count: stations.length })}</option>
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
