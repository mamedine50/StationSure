import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { chargerLocalites } from '@/lib/localites';
import { creerClientServeur } from '@/lib/supabase/server';

import { FormulaireModifierStation, FormulaireStation } from './formulaire-station';

export const metadata: Metadata = { title: t('nav.stations') };

export default async function PageStations() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [localites, { data: stations }] = await Promise.all([
    chargerLocalites(),
    supabase
      .from('stations')
      .select('id, name, city, commune_code, active')
      .eq('organization_id', contexte.membre.organizationId)
      .order('name'),
  ]);
  const localiteDe = (code: string | null) => localites.find((l) => l.code === code);
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('nav.stations')}
        sousTitre={t('stations.subtitle', {
          count: contexte.stations.length,
          plan: t(`common.plans.${contexte.organisation?.plan_code ?? 'solo'}`),
        })}
      />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        <div className="grid grid-cols-[1.2fr_1.4fr_0.6fr_1fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
          <span>{t('stations.name').toUpperCase()}</span>
          <span>{t('stations.city').toUpperCase()}</span>
          <span>{t('devices.status').toUpperCase()}</span>
          <span className="text-right">{t('stations.devices').toUpperCase()}</span>
        </div>
        {(stations ?? []).map((station) => {
          const l = localiteDe(station.commune_code);
          return (
            <div
              key={station.id}
              className="grid grid-cols-[1.2fr_1.4fr_0.6fr_1fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
            >
              <span className="font-semibold">{station.name}</span>
              <span className="flex flex-col">
                <span>{station.city ?? '—'}</span>
                <span className="text-[12px] text-texte-secondaire">
                  {l ? `${l.departement} · ${l.region}` : t('cities.other')}
                </span>
              </span>
              <span className="text-[12px] text-texte-secondaire">
                {station.active ? t('common.active') : t('common.inactive')}
              </span>
              <span className="flex items-center justify-end gap-3">
                {contexte.estProprietaire && (
                  <FormulaireModifierStation
                    key={`${station.id}-${station.name}-${station.city}-${station.commune_code}`}
                    station={station}
                    localites={localites}
                  />
                )}
                <Link href={`/stations/${station.id}/appareils`} className="text-[13px]">
                  {t('stations.manageDevices')}
                </Link>
              </span>
            </div>
          );
        })}
      </section>
      {contexte.estProprietaire && <FormulaireStation localites={localites} />}
    </main>
  );
}
