'use client';

import { t } from '@stationsure/i18n';
import { useRouter } from 'next/navigation';

const select = 'h-11 rounded-lg border border-bordure bg-surface px-3 text-[13px] text-texte';

export function FiltresAlertes({
  types,
  stations,
  valeurs,
}: {
  types: readonly string[];
  stations: { id: string; name: string }[];
  valeurs: { type: string; station: string; severite: string; jours: string; etat: string };
}) {
  const router = useRouter();
  const naviguer = (cle: string, valeur: string) => {
    const p = new URLSearchParams({ ...valeurs, [cle]: valeur });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/alertes?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t('alertsPage.type')}
        className={select}
        value={valeurs.type}
        onChange={(e) => naviguer('type', e.target.value)}
      >
        <option value="">{t('alertsPage.allTypes')}</option>
        {types.map((x) => (
          <option key={x} value={x}>
            {t(`alertTypes.${x}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('alertsPage.station')}
        className={select}
        value={valeurs.station}
        onChange={(e) => naviguer('station', e.target.value)}
      >
        <option value="">{t('common.all')}</option>
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t('alertsPage.severity')}
        className={select}
        value={valeurs.severite}
        onChange={(e) => naviguer('severite', e.target.value)}
      >
        <option value="">{t('alertsPage.all')}</option>
        {(['critical', 'warning', 'info'] as const).map((s) => (
          <option key={s} value={s}>
            {t(`alertsPage.severities.${s}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('alertsPage.since')}
        className={select}
        value={valeurs.jours}
        onChange={(e) => naviguer('jours', e.target.value)}
      >
        {(['1', '7', '30', '90'] as const).map((j) => (
          <option key={j} value={j}>
            {t(`alertsPage.days.${j}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('alertsPage.state')}
        className={select}
        value={valeurs.etat}
        onChange={(e) => naviguer('etat', e.target.value)}
      >
        <option value="pending">{t('alertsPage.pending')}</option>
        <option value="all">{t('alertsPage.all')}</option>
      </select>
    </div>
  );
}
