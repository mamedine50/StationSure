import { clToLitres, formatFCFA, formatLitres } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { CourbeBaremage } from './courbe-baremage';
import {
  FormulaireBaremage,
  FormulaireCuve,
  FormulaireModifierCuve,
  FormulairePistolet,
  FormulairePompe,
  FormulairePrix,
  BoutonActivationEquipement,
  SelecteurStation,
} from './formulaires';

export const metadata: Metadata = { title: t('nav.fuel') };

const dateFr = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium' });

export default async function PageCarburant({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; cuve?: string }>;
}) {
  const { station: stationParam, cuve: cuveParam } = await searchParams;
  const contexte = await exigerContexteComplet();
  const station = contexte.stations.find((s) => s.id === stationParam) ?? contexte.stations[0]!;
  const supabase = await creerClientServeur();

  const [
    { data: cuves },
    { data: pompes },
    { data: pistolets },
    { data: versions },
    { data: prixActuels },
    { data: historiquePrix },
  ] = await Promise.all([
    supabase
      .from('tanks')
      .select('id, label, fuel_product_code, capacity_cl, active')
      .eq('station_id', station.id)
      .order('label'),
    supabase.from('pumps').select('id, label, active').eq('station_id', station.id).order('label'),
    supabase
      .from('nozzles')
      .select('id, label, pump_id, tank_id, active')
      .eq('station_id', station.id)
      .order('label'),
    supabase
      .from('tank_calibration_versions')
      .select('id, tank_id, version, effective_from, certificate_path, note')
      .eq('station_id', station.id)
      .order('effective_from', { ascending: false }),
    supabase
      .from('current_fuel_prices')
      .select('fuel_product_code, price_fcfa_per_litre, effective_at')
      .eq('station_id', station.id),
    supabase
      .from('price_changes')
      .select('id, fuel_product_code, price_fcfa_per_litre, effective_at, created_at')
      .eq('station_id', station.id)
      .order('effective_at', { ascending: false })
      .limit(20),
  ]);

  const maintenant = new Date().getTime();
  const listeCuves = cuves ?? [];
  const cuve = listeCuves.find((c) => c.id === cuveParam) ?? listeCuves[0] ?? null;
  const versionsCuve = (versions ?? []).filter((v) => v.tank_id === cuve?.id);
  const versionCourante =
    versionsCuve.find((v) => new Date(v.effective_from).getTime() <= maintenant) ??
    versionsCuve[0] ??
    null;
  const { data: points } = versionCourante
    ? await supabase
        .from('tank_calibrations')
        .select('height_mm, volume_cl')
        .eq('version_id', versionCourante.id)
        .order('height_mm')
    : { data: [] as { height_mm: number; volume_cl: number }[] };
  const { data: comptes } = await supabase
    .from('tank_calibrations')
    .select('version_id')
    .in(
      'version_id',
      (versions ?? []).map((v) => v.id),
    );
  const pointsParVersion = new Map<string, number>();
  for (const c of comptes ?? [])
    pointsParVersion.set(c.version_id, (pointsParVersion.get(c.version_id) ?? 0) + 1);
  const versionEnVigueur = (tankId: string) =>
    (versions ?? []).find(
      (v) => v.tank_id === tankId && new Date(v.effective_from).getTime() <= maintenant,
    );
  const pistoletsDe = (tankId: string) =>
    (pistolets ?? []).filter((p) => p.tank_id === tankId && p.active).map((p) => p.label);
  const nomProduit = (code: string) => t(`fuel.${code}`);
  const cuveLabel = (id: string) => listeCuves.find((c) => c.id === id)?.label ?? '?';

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('nav.fuel')}
        sousTitre={t('fuelConfig.subtitle')}
        action={<SelecteurStation stations={contexte.stations} stationId={station.id} />}
      />
      {!contexte.estProprietaire && (
        <p className="m-0 rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-texte-secondaire">
          {t('fuelConfig.readOnly')}
        </p>
      )}

      <div className="grid grid-cols-[1fr_1.9fr] gap-4">
        {/* Colonne gauche : cuves + prix */}
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-semibold">{t('fuelConfig.tanks')}</h2>
              {contexte.estProprietaire && <FormulaireCuve stationId={station.id} />}
            </div>
            {listeCuves.map((c) => {
              const v = versionEnVigueur(c.id);
              const actif = c.id === cuve?.id;
              return (
                <div
                  key={c.id}
                  className={`flex flex-col gap-1 rounded-xl border p-4 ${actif ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
                >
                  <div className="flex items-center justify-between">
                    <a
                      href={`/carburant?station=${station.id}&cuve=${c.id}`}
                      className="text-[15px] font-semibold text-texte no-underline"
                    >
                      {c.label}
                      {!c.active && (
                        <span className="ml-2 text-[12px] text-danger">
                          ({t('common.inactive')})
                        </span>
                      )}
                    </a>
                    <span className="rounded-pilule bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-info">
                      {nomProduit(c.fuel_product_code)}
                    </span>
                  </div>
                  <span className="text-[13px] text-texte-secondaire">
                    {v
                      ? t('fuelConfig.capacity', {
                          litres: formatLitres(c.capacity_cl).replace(',00', ''),
                          points: pointsParVersion.get(v.id) ?? 0,
                        })
                      : `${t('fuelConfig.capacityL')} ${formatLitres(c.capacity_cl).replace(',00', '')} · ${t('fuelConfig.noCalibration')}`}
                  </span>
                  <span className="text-[13px] text-texte-secondaire">
                    {pistoletsDe(c.id).length > 0
                      ? t('fuelConfig.nozzlesOf', { list: pistoletsDe(c.id).join(' · ') })
                      : t('fuelConfig.noNozzles')}
                  </span>
                  {contexte.estProprietaire && (
                    <FormulaireModifierCuve
                      cuve={{ id: c.id, label: c.label, capaciteLitres: clToLitres(c.capacity_cl) }}
                    />
                  )}
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-bordure bg-surface p-4">
            <h2 className="m-0 text-[15px] font-semibold">{t('fuelConfig.prices')}</h2>
            {(['super', 'gasoil'] as const).map((code) => {
              const p = (prixActuels ?? []).find((x) => x.fuel_product_code === code);
              return (
                <div key={code} className="flex items-baseline justify-between text-[14px]">
                  <span>{nomProduit(code)}</span>
                  <span className="font-mono">
                    {p
                      ? `${formatFCFA(p.price_fcfa_per_litre ?? 0)} ${t('fuelConfig.pricePerLitre')}`
                      : t('fuelConfig.noPrice')}
                  </span>
                </div>
              );
            })}
            {(prixActuels ?? []).length > 0 && (
              <span className="text-[12px] text-texte-secondaire">
                {t('fuelConfig.priceSince', {
                  date: dateFr.format(
                    new Date(
                      Math.max(
                        ...(prixActuels ?? []).map((p) => new Date(p.effective_at ?? 0).getTime()),
                      ),
                    ),
                  ),
                })}
              </span>
            )}
            {contexte.estProprietaire && <FormulairePrix stationId={station.id} />}
            <details>
              <summary className="cursor-pointer text-[13px] text-accent">
                {t('fuelConfig.priceHistory')}
              </summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
                {(historiquePrix ?? []).map((p) => (
                  <li key={p.id} className="flex justify-between text-texte-secondaire">
                    <span>
                      {dateFr.format(new Date(p.effective_at))} · {nomProduit(p.fuel_product_code)}
                    </span>
                    <span className="font-mono text-texte">
                      {formatFCFA(p.price_fcfa_per_litre)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>

        {/* Colonne droite : barémage + pompes */}
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-xl border border-bordure bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-semibold">
                {cuve
                  ? t('fuelConfig.calibrationOf', {
                      tank: `${cuve.label} ${nomProduit(cuve.fuel_product_code)}`,
                    })
                  : t('fuelConfig.calibration')}
              </h2>
              {versionCourante && (
                <span className="text-[12px] text-texte-secondaire">
                  {t('fuelConfig.version', { n: versionCourante.version })} ·{' '}
                  {t('fuelConfig.effectiveFrom', {
                    date: dateFr.format(new Date(versionCourante.effective_from)),
                  })}{' '}
                  ·{' '}
                  {versionCourante.certificate_path
                    ? t('fuelConfig.certificateAttached')
                    : t('fuelConfig.noCertificate')}
                </span>
              )}
            </div>
            {!cuve && (
              <p className="m-0 text-[13px] text-texte-secondaire">{t('fuelConfig.selectTank')}</p>
            )}
            {cuve && (
              <div className="grid grid-cols-[220px_1fr] gap-4">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] tracking-wider text-texte-secondaire">
                      <th className="pb-2 font-normal">{t('fuelConfig.height').toUpperCase()}</th>
                      <th className="pb-2 text-right font-normal">
                        {t('fuelConfig.volume').toUpperCase()}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(points ?? []).map((p) => (
                      <tr key={p.height_mm}>
                        <td className="py-1 font-mono">{p.height_mm} mm</td>
                        <td className="py-1 text-right font-mono">
                          {formatLitres(p.volume_cl).replace(',00', '')} L
                        </td>
                      </tr>
                    ))}
                    {(points ?? []).length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-2 text-texte-secondaire">
                          {t('fuelConfig.noCalibration')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="flex flex-col gap-2">
                  <CourbeBaremage
                    points={(points ?? []).map((p) => ({
                      hauteurMm: p.height_mm,
                      volumeCl: p.volume_cl,
                    }))}
                  />
                  {(points ?? []).length >= 2 && (
                    <span className="text-[13px] text-succes">
                      ✓ {t('fuelConfig.curveOk', { points: (points ?? []).length })}
                    </span>
                  )}
                  <span className="text-[12px] text-texte-secondaire">
                    {t('fuelConfig.curveHint')}
                  </span>
                </div>
              </div>
            )}
            {cuve && contexte.estProprietaire && (
              <FormulaireBaremage
                cuveId={cuve.id}
                organisationId={contexte.membre.organizationId}
                stationId={station.id}
              />
            )}
            {versionsCuve.length > 1 && (
              <details>
                <summary className="cursor-pointer text-[13px] text-accent">
                  {t('fuelConfig.previousVersions')}
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] text-texte-secondaire">
                  {versionsCuve.map((v) => (
                    <li key={v.id}>
                      {t('fuelConfig.version', { n: v.version })} ·{' '}
                      {dateFr.format(new Date(v.effective_from))} ·{' '}
                      {pointsParVersion.get(v.id) ?? 0} pts
                      {v.note ? ` · ${v.note}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="flex flex-col rounded-xl border border-bordure bg-surface">
            <div className="flex items-center justify-between border-b border-bordure px-4 py-3">
              <h2 className="m-0 text-[15px] font-semibold">{t('fuelConfig.pumps')}</h2>
              {contexte.estProprietaire && <FormulairePompe stationId={station.id} />}
            </div>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[11px] tracking-wider text-texte-secondaire">
                  <th className="px-4 py-2 font-normal">POMPE</th>
                  <th className="px-4 py-2 font-normal">
                    {t('fuelConfig.addNozzle').toUpperCase()}
                  </th>
                  <th className="px-4 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {(pompes ?? []).map((pompe) => (
                  <tr key={pompe.id} className="border-t border-bordure align-top">
                    <td className="px-4 py-3 font-semibold">
                      {pompe.label}
                      {!pompe.active && (
                        <span className="ml-2 text-[12px] text-danger">
                          ({t('common.inactive')})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(pistolets ?? [])
                          .filter((p) => p.pump_id === pompe.id)
                          .map((p) => (
                            <span
                              key={p.id}
                              className={`flex items-center gap-2 rounded-pilule border border-bordure px-3 py-1 text-[13px] ${p.active ? '' : 'text-texte-secondaire line-through'}`}
                            >
                              {p.label} → {cuveLabel(p.tank_id)}
                              {contexte.estProprietaire && (
                                <BoutonActivationEquipement
                                  table="nozzles"
                                  id={p.id}
                                  actif={p.active}
                                />
                              )}
                            </span>
                          ))}
                        {contexte.estProprietaire && pompe.active && (
                          <FormulairePistolet
                            stationId={station.id}
                            pompeId={pompe.id}
                            cuves={listeCuves
                              .filter((c) => c.active)
                              .map((c) => ({
                                id: c.id,
                                label: `${c.label} ${nomProduit(c.fuel_product_code)}`,
                              }))}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {contexte.estProprietaire && (
                        <BoutonActivationEquipement
                          table="pumps"
                          id={pompe.id}
                          actif={pompe.active}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contexte.estProprietaire && (
              <p className="m-0 px-4 py-2 text-[12px] text-texte-secondaire">
                {t('fuelConfig.deactivateHint')}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
