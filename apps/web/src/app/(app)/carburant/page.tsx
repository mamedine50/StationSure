import { formatLitres } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { chargerNiveaux } from '@/components/cuves/charger-niveaux';
import { CuvesStation } from '@/components/cuves/cuves-station';
import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import {
  type CuveEtape,
  EtapeCuves,
  EtapePompes,
  EtapePrix,
  FormulaireBaremage,
  type PompeEtape,
  SelecteurStation,
} from './formulaires';

export const metadata: Metadata = { title: t('nav.fuel') };

const dateFr = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeZone: 'Africa/Dakar' });
const litresEntiers = (cl: number) => formatLitres(cl).replace(/,\d\d$/, '');

/** Résultat de la RPC station_fuel_setup_status (écran 19). */
interface StatutConfiguration {
  complete: boolean;
  steps: {
    tanks: { complete: boolean; count: number };
    calibration: { complete: boolean; done: number; total: number };
    nozzles: { complete: boolean; pumps: number; nozzles: number; done: number; total: number };
    prices: { complete: boolean; missing: number };
  };
  tanks: {
    tank_id: string;
    label: string;
    fuel_product_code: 'super' | 'gasoil';
    capacity_cl: number;
    calibration_points: number | null;
    nozzles: number | null;
    missing: ('calibration' | 'nozzles')[];
  }[];
  prices: { fuel_product_code: 'super' | 'gasoil'; price_fcfa_per_litre: number | null }[];
}

const ETAPES = ['tanks', 'calibration', 'nozzles', 'prices'] as const;

export default async function PageCarburant({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; etape?: string; cuve?: string }>;
}) {
  const params = await searchParams;
  const contexte = await exigerContexteComplet();
  const station = contexte.stations.find((s) => s.id === params.station) ?? contexte.stations[0]!;
  const supabase = await creerClientServeur();
  const rw = contexte.estProprietaire;

  const [
    { data: statutBrut, error: erreurStatut },
    { data: cuves },
    { data: pompes },
    { data: pistolets },
    { data: versions },
    { data: prixActuels },
    niveaux,
  ] = await Promise.all([
    supabase.rpc('station_fuel_setup_status', { p_station_id: station.id }),
    supabase
      .from('tanks')
      .select('id, label, fuel_product_code, capacity_cl, active, reorder_threshold_pct')
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
      .select('id, tank_id, version, effective_from, certificate_path')
      .eq('station_id', station.id)
      .order('effective_from', { ascending: false }),
    supabase
      .from('current_fuel_prices')
      .select('fuel_product_code, price_fcfa_per_litre, effective_at')
      .eq('station_id', station.id),
    chargerNiveaux(supabase, station.id),
  ]);
  if (erreurStatut) console.error('station_fuel_setup_status', erreurStatut.message);
  const statut = (statutBrut ?? null) as StatutConfiguration | null;
  const complete = statut?.complete ?? false;
  const etapeParam = ['1', '2', '3', '4'].includes(params.etape ?? '')
    ? Number(params.etape)
    : null;
  const lien = (etape: number, cuve?: string) =>
    `/carburant?station=${station.id}&etape=${etape}${cuve ? `&cuve=${cuve}` : ''}`;
  const vueEnsemble = `/carburant?station=${station.id}`;

  // ---------------------------------------------------------------- Tout configuré : cuves (écran 20)
  if (statut && complete && etapeParam === null) {
    return (
      <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
        <EnTetePage
          titre={t('nav.fuel')}
          sousTitre={t('fuelSetup.allDoneText', {
            tanks: statut.steps.tanks.count,
            nozzles: statut.steps.nozzles.nozzles,
          })}
          action={
            <div className="flex items-center gap-3">
              <SelecteurStation stations={contexte.stations} stationId={station.id} />
              <Link href={`/carburant/historique?station=${station.id}`} className="text-[13px]">
                {t('fuelHistory.link')}
              </Link>
              {rw && (
                <Link
                  href={lien(1)}
                  className="flex h-11 items-center rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte no-underline"
                >
                  {t('fuelSetup.modify')}
                </Link>
              )}
            </div>
          }
        />
        <div className="flex items-center gap-2 rounded-xl border border-succes-bordure bg-succes-fond px-4 py-3 text-[14px] text-succes">
          ✓ {t('fuelSetup.allDone')}
        </div>
        <CuvesStation niveaux={niveaux} titre={t('tanks3d.title', { station: station.name })} />
        <p className="m-0 rounded-xl border border-bordure bg-surface px-4 py-3 text-[13px] text-texte-secondaire">
          {t('tanks3d.hint')}
        </p>
      </main>
    );
  }

  // ---------------------------------------------------------------- Parcours en 4 étapes (écran 19)
  const pas = statut?.steps;
  const premiereIncomplete = pas ? ETAPES.findIndex((e) => !pas[e].complete) + 1 || 4 : 1;
  const etape = etapeParam ?? premiereIncomplete;
  const terminees = pas ? ETAPES.filter((e) => pas[e].complete).length : 0;
  const listeCuves = (cuves ?? []).map<CuveEtape>((c) => ({
    id: c.id,
    label: c.label,
    produit: c.fuel_product_code,
    capaciteCl: Number(c.capacity_cl),
    seuilPct: Number(c.reorder_threshold_pct),
    active: c.active,
    points: statut?.tanks.find((x) => x.tank_id === c.id)?.calibration_points ?? 0,
    pistolets: (pistolets ?? []).filter((p) => p.tank_id === c.id && p.active).length,
  }));
  const cuvesActives = listeCuves.filter((c) => c.active);
  const cuveCourante =
    cuvesActives.find((c) => c.id === params.cuve) ??
    cuvesActives.find((c) => c.points < 2) ??
    cuvesActives[0] ??
    null;
  const versionCourante = cuveCourante
    ? ((versions ?? []).find((v) => v.tank_id === cuveCourante.id) ?? null)
    : null;
  const listePompes = (pompes ?? []).map<PompeEtape>((p) => ({
    id: p.id,
    label: p.label,
    active: p.active,
    pistolets: (pistolets ?? [])
      .filter((n) => n.pump_id === p.id)
      .map((n) => ({ id: n.id, label: n.label, tankId: n.tank_id, active: n.active })),
  }));
  const produits = [...new Set(cuvesActives.map((c) => c.produit))];
  const manques = (statut?.tanks ?? []).filter((x) => x.missing.length > 0);
  const produitsSansPrix = (statut?.prices ?? []).filter((p) => p.price_fcfa_per_litre === null);
  const etatEtape = (e: (typeof ETAPES)[number]): string => {
    if (!pas) return t('fuelSetup.stepState.todo');
    switch (e) {
      case 'tanks':
        return pas.tanks.count > 0
          ? t('fuelSetup.stepState.tanksCount', { count: pas.tanks.count })
          : t('fuelSetup.stepState.tanksNone');
      case 'calibration':
        return pas.calibration.total === 0
          ? t('fuelSetup.stepState.todo')
          : pas.calibration.complete
            ? t('fuelSetup.stepState.calibrationAll', { total: pas.calibration.total })
            : t('fuelSetup.stepState.calibration', {
                done: pas.calibration.done,
                total: pas.calibration.total,
              });
      case 'nozzles':
        return pas.nozzles.nozzles > 0
          ? t('fuelSetup.stepState.nozzles', {
              nozzles: pas.nozzles.nozzles,
              pumps: pas.nozzles.pumps,
            })
          : t('fuelSetup.stepState.todo');
      case 'prices':
        return pas.prices.complete && pas.tanks.count > 0
          ? t('fuelSetup.stepState.pricesDone')
          : pas.prices.missing > 0
            ? t('fuelSetup.stepState.pricesMissing', { count: pas.prices.missing })
            : t('fuelSetup.stepState.todo');
    }
  };

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('fuelSetup.title')}
        sousTitre={t('fuelSetup.subtitle', { station: station.name })}
        action={
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-texte-secondaire">
              {t('fuelSetup.progress', { done: terminees })}
            </span>
            <SelecteurStation stations={contexte.stations} stationId={station.id} />
            <Link href={`/carburant/historique?station=${station.id}`} className="text-[13px]">
              {t('fuelHistory.link')}
            </Link>
            {complete && (
              <Link href={vueEnsemble} className="text-[13px] text-accent">
                {t('fuelSetup.backToOverview')}
              </Link>
            )}
          </div>
        }
      />
      {!rw && (
        <p className="m-0 rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-texte-secondaire">
          {t('fuelConfig.readOnly')}
        </p>
      )}

      <ol className="m-0 grid list-none grid-cols-4 gap-3 p-0">
        {ETAPES.map((e, i) => {
          const n = i + 1;
          const fait = pas?.[e].complete ?? false;
          const actif = etape === n;
          return (
            <li key={e}>
              <Link
                href={lien(n)}
                aria-current={actif ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 no-underline ${actif ? 'border-accent bg-accent-fond' : fait ? 'border-succes-bordure bg-succes-fond' : 'border-bordure bg-surface'}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pilule text-[14px] font-bold ${fait ? 'bg-succes text-fond' : actif ? 'bg-accent text-accent-texte' : 'bg-surface-2 text-texte-secondaire'}`}
                >
                  {fait ? '✓' : n}
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold text-texte">
                    {n} · {t(`fuelSetup.steps.${e}`)}
                  </span>
                  <span className="text-[12px] text-texte-secondaire">{etatEtape(e)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {(manques.length > 0 || produitsSansPrix.length > 0) && (
        <div className="flex flex-col gap-1 rounded-xl border border-accent bg-accent-fond px-4 py-3 text-[14px]">
          {manques.map((m) => (
            <span key={m.tank_id}>
              ⚠{' '}
              {t('fuelSetup.banner', {
                tank: `${m.label} · ${t(`fuel.${m.fuel_product_code}`)}`,
                missing: m.missing.map((x) => t(`fuelSetup.missing.${x}`)).join(', '),
              })}
            </span>
          ))}
          {produitsSansPrix.length > 0 && (
            <span>
              ⚠{' '}
              {t('fuelSetup.bannerPrices', {
                products: produitsSansPrix.map((p) => t(`fuel.${p.fuel_product_code}`)).join(', '),
              })}
            </span>
          )}
        </div>
      )}

      {etape === 1 && (
        // Remonté à chaque changement serveur : les panneaux se referment après un succès.
        <EtapeCuves
          key={JSON.stringify(listeCuves)}
          stationId={station.id}
          cuves={listeCuves}
          rw={rw}
          suivant={lien(2)}
        />
      )}

      {etape === 2 && (
        <div className="grid grid-cols-[1fr_2.4fr] gap-4">
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[12px] tracking-wider text-texte-secondaire">
              {t('fuelSetup.tanksTitle')}
            </h2>
            {cuvesActives.map((c) => {
              const actif = c.id === cuveCourante?.id;
              return (
                <Link
                  key={c.id}
                  href={lien(2, c.id)}
                  className={`flex flex-col gap-1 rounded-xl border p-4 no-underline ${actif ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
                >
                  <span className="flex items-center justify-between text-[15px] font-semibold text-texte">
                    {c.label} · {t(`fuel.${c.produit}`)}
                    {c.points >= 2 ? (
                      <span className="text-succes">✓</span>
                    ) : actif ? (
                      <span className="text-[13px] text-accent">{t('fuelSetup.inProgress')}</span>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-texte-secondaire">
                    {t('fuelSetup.tankLine', {
                      litres: litresEntiers(c.capaciteCl),
                      calibration:
                        c.points >= 2
                          ? t('fuelSetup.calibrationPoints', { points: c.points })
                          : t('fuelSetup.noCalibration'),
                      nozzles: t('fuelSetup.nozzlesCount', { count: c.pistolets }),
                    })}
                  </span>
                </Link>
              );
            })}
            {cuvesActives.length === 0 && (
              <p className="m-0 text-[13px] text-texte-secondaire">
                {t('fuelSetup.stepState.tanksNone')}
              </p>
            )}
          </section>
          {cuveCourante && (
            <FormulaireBaremage
              key={cuveCourante.id}
              cuve={cuveCourante}
              organisationId={contexte.membre.organizationId}
              stationId={station.id}
              version={
                versionCourante
                  ? {
                      numero: versionCourante.version,
                      points: cuveCourante.points,
                      date: dateFr.format(new Date(versionCourante.effective_from)),
                      certificat: Boolean(versionCourante.certificate_path),
                    }
                  : null
              }
              precedent={lien(1)}
              plusTard={lien(3)}
              suite={lien(3)}
              rw={rw}
            />
          )}
        </div>
      )}

      {etape === 3 && (
        <EtapePompes
          key={JSON.stringify(listePompes)}
          stationId={station.id}
          pompes={listePompes}
          cuves={cuvesActives.map((c) => ({
            id: c.id,
            label: `${c.label} ${t(`fuel.${c.produit}`)}`,
          }))}
          rw={rw}
          suivant={lien(4)}
          precedent={lien(2)}
        />
      )}

      {etape === 4 && (
        <EtapePrix
          stationId={station.id}
          produits={produits}
          prix={(prixActuels ?? [])
            .filter((p) => p.fuel_product_code && p.price_fcfa_per_litre)
            .map((p) => ({
              produit: p.fuel_product_code as 'super' | 'gasoil',
              valeur: Number(p.price_fcfa_per_litre),
              depuis: dateFr.format(new Date(p.effective_at ?? 0)),
            }))}
          rw={rw}
          precedent={lien(3)}
          suite={vueEnsemble}
        />
      )}
    </main>
  );
}
