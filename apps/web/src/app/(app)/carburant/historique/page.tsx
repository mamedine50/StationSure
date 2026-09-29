import { formatFCFA } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: t('fuelHistory.title') };

const dateHeure = new Intl.DateTimeFormat('fr-SN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
});

/** Historique des barémages (versions) et des prix d'une station, avec auteur. */
export default async function PageHistoriqueCarburant({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; cuve?: string }>;
}) {
  const params = await searchParams;
  const contexte = await exigerContexteComplet();
  const station = contexte.stations.find((s) => s.id === params.station) ?? contexte.stations[0]!;
  const supabase = await creerClientServeur();
  const [{ data: versions }, { data: cuves }, { data: prix }, { data: membres }, { data: points }] =
    await Promise.all([
      supabase
        .from('tank_calibration_versions')
        .select(
          'id, tank_id, version, effective_from, certificate_path, note, created_by, created_at',
        )
        .eq('station_id', station.id)
        .order('effective_from', { ascending: false }),
      supabase.from('tanks').select('id, label, fuel_product_code').eq('station_id', station.id),
      supabase
        .from('price_changes')
        .select('id, fuel_product_code, price_fcfa_per_litre, effective_at, created_by, created_at')
        .eq('station_id', station.id)
        .order('effective_at', { ascending: false })
        .limit(100),
      supabase.rpc('member_labels'),
      supabase.from('tank_calibrations').select('version_id').eq('station_id', station.id),
    ]);
  const auteur = (userId: string | null) =>
    userId === contexte.utilisateur.id
      ? t('employeePage.you')
      : ((membres ?? []).find((m) => m.user_id === userId)?.email ?? '—');
  const nbPoints = new Map<string, number>();
  for (const p of points ?? []) nbPoints.set(p.version_id, (nbPoints.get(p.version_id) ?? 0) + 1);
  const cuveDe = (id: string) => (cuves ?? []).find((c) => c.id === id);
  const versionsFiltrees = (versions ?? []).filter(
    (v) => !params.cuve || v.tank_id === params.cuve,
  );

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <div className="flex flex-col gap-1">
        <Link href={`/carburant?station=${station.id}`} className="text-[13px]">
          {t('fuelHistory.backToFuel')}
        </Link>
        <EnTetePage
          titre={t('fuelHistory.title')}
          sousTitre={t('fuelHistory.subtitle', { station: station.name })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <section className="flex flex-col rounded-xl border border-bordure bg-surface">
          <div className="border-b border-bordure px-[18px] py-4 text-[15px] font-semibold">
            {t('fuelHistory.calibrations')}
          </div>
          {versionsFiltrees.length === 0 && (
            <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
              {t('fuelHistory.none')}
            </p>
          )}
          {versionsFiltrees.map((v) => {
            const c = cuveDe(v.tank_id);
            return (
              <div
                key={v.id}
                className="flex flex-col gap-1 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
              >
                <span className="font-semibold">
                  {c ? `${c.label} · ${t(`fuel.${c.fuel_product_code}`)}` : '?'} ·{' '}
                  {t('fuelHistory.version', { n: v.version })}
                </span>
                <span className="text-[13px] text-texte-secondaire">
                  {t('fuelHistory.on', { date: dateHeure.format(new Date(v.effective_from)) })} ·{' '}
                  {t('fuelHistory.by', { who: auteur(v.created_by) })} ·{' '}
                  {t('fuelHistory.points', { count: nbPoints.get(v.id) ?? 0 })} ·{' '}
                  {v.certificate_path
                    ? t('fuelHistory.certificate')
                    : t('fuelHistory.noCertificate')}
                  {v.note ? ` · ${v.note}` : ''}
                </span>
              </div>
            );
          })}
        </section>
        <section className="flex flex-col rounded-xl border border-bordure bg-surface">
          <div className="border-b border-bordure px-[18px] py-4 text-[15px] font-semibold">
            {t('fuelHistory.prices')}
          </div>
          {(prix ?? []).length === 0 && (
            <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
              {t('fuelHistory.none')}
            </p>
          )}
          {(prix ?? []).map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
            >
              <span className="text-[13px] text-texte-secondaire">
                {dateHeure.format(new Date(p.effective_at))}
              </span>
              <span className="font-semibold">{t(`fuel.${p.fuel_product_code}`)}</span>
              <span className="flex flex-col items-end">
                <span className="font-mono">
                  {formatFCFA(p.price_fcfa_per_litre)} {t('fuelConfig.pricePerLitre')}
                </span>
                <span className="text-[12px] text-texte-secondaire">
                  {t('fuelHistory.by', { who: auteur(p.created_by) })}
                </span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
