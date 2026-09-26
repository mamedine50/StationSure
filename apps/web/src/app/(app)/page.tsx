import { formatFCFA, formatLitres, formatPourcent } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonAccuser, FiltreStation } from './composants-dashboard';

export const metadata: Metadata = { title: t('nav.dashboard') };

const dateLongue = new Intl.DateTimeFormat('fr-SN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Dakar',
});
const heure = new Intl.DateTimeFormat('fr-SN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
});

type Periode = 'today' | '7' | '30';

/** Début de période en heure de Dakar (UTC+0, sans heure d'été). */
function debutPeriode(periode: Periode): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (periode === '7') d.setUTCDate(d.getUTCDate() - 6);
  if (periode === '30') d.setUTCDate(d.getUTCDate() - 29);
  return d;
}

interface Resume {
  ca_fcfa: number;
  ca_fuel_fcfa: number;
  ca_shop_fcfa: number;
  ca_garage_fcfa: number;
  ca_wash_fcfa: number;
  mobile_fcfa: number;
  litres_super_cl: number;
  litres_gasoil_cl: number;
  cash_variance_fcfa: number;
  cash_variance_shifts: number;
  shifts: number;
  tank_alerts: number;
  stations: {
    station_id: string;
    name: string;
    ca_fcfa: number;
    litres_cl: number;
    cash_variance_fcfa: number;
    tank_variance_pct: number | null;
    tank_status: string | null;
    closure_status: string | null;
  }[];
}

export default async function PageTableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; station?: string }>;
}) {
  const params = await searchParams;
  const periode: Periode =
    params.periode === '7' || params.periode === '30' ? params.periode : 'today';
  const contexte = await exigerContexteComplet();
  const stationId = contexte.stations.some((s) => s.id === params.station) ? params.station! : null;
  const supabase = await creerClientServeur();
  const debut = debutPeriode(periode);
  const fin = new Date(new Date().getTime() + 86400000);
  const debutJour = debutPeriode('today');

  const [
    { data: resumeBrut, error: erreurResume },
    { data: scores },
    { data: alertes },
    { data: employes },
  ] = await Promise.all([
    supabase.rpc('dashboard_summary', {
      p_from: debut.toISOString(),
      p_to: fin.toISOString(),
      ...(stationId ? { p_station_id: stationId } : {}),
    }),
    supabase.rpc('employee_variance_scores', {
      p_days: 30,
      ...(stationId ? { p_station_id: stationId } : {}),
    }),
    supabase
      .from('alerts')
      .select('id, type, severity, station_id, shift_id, payload, created_at, acknowledged_at')
      .gte('created_at', debutJour.toISOString())
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('employees').select('id, full_name'),
  ]);
  if (erreurResume) console.error('dashboard_summary', erreurResume.message);
  const resume = (resumeBrut ?? null) as Resume | null;
  const stationDe = (id: string | null) => contexte.stations.find((s) => s.id === id)?.name ?? '';
  const nom = (id: unknown) => employes?.find((e) => e.id === id)?.full_name ?? '';
  const initiales = (n: string) =>
    n
      .split(' ')
      .map((m, i, a) => (i < a.length - 1 ? `${m[0]}.` : m))
      .join(' ');
  const alertesFiltrees = (alertes ?? []).filter((a) => !stationId || a.station_id === stationId);
  const partMobile =
    resume && resume.ca_fcfa > 0 ? Math.round((resume.mobile_fcfa / resume.ca_fcfa) * 100) : 0;
  const stationEnAlerte = resume?.stations.find((s) => s.tank_status === 'variance');
  const lien = (p: Periode) => `/?periode=${p}${stationId ? `&station=${stationId}` : ''}` as const;
  const rw = contexte.estProprietaire;

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('nav.dashboard')}
        sousTitre={t('dashboard.subtitle', {
          date: dateLongue.format(new Date()),
          scope: stationId
            ? stationDe(stationId)
            : t('dashboard.allStations', { count: contexte.stations.length }),
        })}
        action={
          <div className="flex items-center gap-2">
            <FiltreStation
              stations={contexte.stations}
              valeur={stationId ?? ''}
              periode={periode}
            />
            <div className="flex rounded-lg border border-bordure bg-surface p-1">
              {(['today', '7', '30'] as const).map((p) => (
                <Link
                  key={p}
                  href={lien(p)}
                  className={`flex h-9 items-center rounded-md px-3 text-[13px] no-underline ${periode === p ? 'bg-accent font-semibold text-accent-texte' : 'text-texte-secondaire'}`}
                >
                  {t(
                    p === 'today'
                      ? 'dashboard.today'
                      : p === '7'
                        ? 'dashboard.days7'
                        : 'dashboard.days30',
                  )}
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <Kpi
          titre={t('dashboard.revenue')}
          valeur={formatFCFA(resume?.ca_fcfa ?? 0)}
          detail={t('dashboard.stationsCount', { count: resume?.stations.length ?? 0 })}
        />
        <Kpi
          titre={t('dashboard.litresSold')}
          valeur={`${formatFCFA(Math.trunc(((resume?.litres_super_cl ?? 0) + (resume?.litres_gasoil_cl ?? 0)) / 100))} L`}
          detail={t('dashboard.litresDetail', {
            super: formatFCFA(Math.trunc((resume?.litres_super_cl ?? 0) / 100)),
            gasoil: formatFCFA(Math.trunc((resume?.litres_gasoil_cl ?? 0) / 100)),
          })}
        />
        <Kpi
          titre={t('dashboard.cashVariance')}
          valeur={formatFCFA(resume?.cash_variance_fcfa ?? 0)}
          detail={t('dashboard.shiftsDetail', {
            n: resume?.cash_variance_shifts ?? 0,
            total: resume?.shifts ?? 0,
          })}
          danger={(resume?.cash_variance_fcfa ?? 0) !== 0}
        />
        <Kpi
          titre={t('dashboard.tankVariance')}
          valeur={
            (resume?.tank_alerts ?? 0) > 0
              ? t('dashboard.tankAlerts', { count: resume?.tank_alerts })
              : t('dashboard.noTankAlert')
          }
          detail={
            stationEnAlerte && stationEnAlerte.tank_variance_pct !== null
              ? t('dashboard.tankDetail', {
                  station: stationEnAlerte.name,
                  pct: formatPourcent(Number(stationEnAlerte.tank_variance_pct)),
                })
              : ''
          }
          danger={(resume?.tank_alerts ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <Bloc titre={t('dashboard.stations')}>
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_0.7fr_0.9fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
              <span>{t('dashboard.colStation')}</span>
              <span className="text-right">{t('dashboard.colRevenue')}</span>
              <span className="text-right">{t('dashboard.colLitres')}</span>
              <span className="text-right">{t('dashboard.colCash')}</span>
              <span className="text-right">{t('dashboard.colTanks')}</span>
              <span className="text-right">{t('dashboard.colClosure')}</span>
            </div>
            {(resume?.stations ?? []).map((s) => (
              <div
                key={s.station_id}
                className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_0.7fr_0.9fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-right font-mono">{formatFCFA(s.ca_fcfa)}</span>
                <span className="text-right font-mono">
                  {formatFCFA(Math.trunc(s.litres_cl / 100))}
                </span>
                <span
                  className={`text-right font-mono ${s.cash_variance_fcfa !== 0 ? 'text-danger' : ''}`}
                >
                  {formatFCFA(s.cash_variance_fcfa)}
                </span>
                <span
                  className={`text-right font-mono ${s.tank_status === 'variance' ? 'text-danger' : ''}`}
                >
                  {s.tank_variance_pct === null ? '—' : formatPourcent(Number(s.tank_variance_pct))}
                </span>
                <span className="text-right">
                  <Pilule
                    texte={t(
                      s.closure_status === 'closed'
                        ? 'dashboard.closure.closed'
                        : s.closure_status
                          ? 'dashboard.closure.pending'
                          : 'dashboard.closure.none',
                    )}
                    accent={s.closure_status !== 'closed' && s.closure_status !== null}
                  />
                </span>
              </div>
            ))}
            {(resume?.stations ?? []).length === 0 && <Vide texte={t('dashboard.noData')} />}
          </Bloc>
          <Bloc
            titre={t('dashboard.alertsOfDay')}
            action={
              <Link href="/alertes" className="text-[13px]">
                {t('dashboard.seeAll')}
              </Link>
            }
          >
            {alertesFiltrees.length === 0 && <Vide texte={t('dashboard.noAlerts')} />}
            {alertesFiltrees.map((a) => {
              const p = (a.payload ?? {}) as Record<string, unknown>;
              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 last:border-b-0 ${a.acknowledged_at ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold">
                      <span
                        className={`mr-2 inline-block h-2 w-2 rounded-pilule ${a.severity === 'critical' ? 'bg-danger' : a.severity === 'warning' ? 'bg-accent' : 'bg-texte-secondaire'}`}
                      />
                      {t(`alertTypes.${a.type}`)}
                      {typeof p.variance_fcfa === 'number'
                        ? ` ${formatFCFA(p.variance_fcfa)} FCFA`
                        : ''}
                      {typeof p.amount_fcfa === 'number'
                        ? ` ${formatFCFA(p.amount_fcfa)} FCFA`
                        : ''}
                      {typeof p.variance_pct === 'number'
                        ? ` ${formatPourcent(p.variance_pct)}`
                        : ''}
                    </span>
                    <span className="text-[12px] text-texte-secondaire">
                      {stationDe(a.station_id)}
                      {p.employee_id ? ` · ${initiales(nom(p.employee_id))}` : ''}
                      {Array.isArray(p.mismatches) && p.mismatches[0]
                        ? ` · ${(p.mismatches[0] as { label?: string }).label ?? ''} ${formatLitres(Math.abs(Number((p.mismatches[0] as { variance_cl?: number }).variance_cl ?? 0)))} L`
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] text-texte-secondaire">
                      {heure.format(new Date(a.created_at))}
                    </span>
                    {rw && !a.acknowledged_at && <BoutonAccuser alertId={a.id} />}
                  </div>
                </div>
              );
            })}
          </Bloc>
        </div>
        <div className="flex flex-col gap-4">
          <Bloc titre={t('dashboard.revenueByActivity')}>
            {(
              [
                ['dashboard.fuel', resume?.ca_fuel_fcfa ?? 0],
                ['dashboard.shop', resume?.ca_shop_fcfa ?? 0],
                ['dashboard.garage', resume?.ca_garage_fcfa ?? 0],
                ['dashboard.carwash', resume?.ca_wash_fcfa ?? 0],
              ] as const
            ).map(([cle, montant]) => (
              <div
                key={cle}
                className="flex items-center justify-between border-b border-bordure px-[18px] py-3 text-[14px]"
              >
                <span>{t(cle)}</span>
                <span className="font-mono">{formatFCFA(montant)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-[18px] py-3 text-[14px]">
              <span className="text-texte-secondaire">{t('dashboard.mobilePayments')}</span>
              <span className="font-mono">
                {formatFCFA(resume?.mobile_fcfa ?? 0)} · {partMobile}
                {' %'}
              </span>
            </div>
          </Bloc>
          <Bloc
            titre={t('dashboard.score')}
            action={
              <span className="text-[12px] text-texte-secondaire">{t('dashboard.scoreHint')}</span>
            }
          >
            {(scores ?? []).length === 0 && <Vide texte={t('dashboard.noData')} />}
            {(scores ?? []).slice(0, 8).map((s) => {
              const n =
                s.cash_variances + s.handover_variances + s.rejected_voids + s.meter_regressions;
              return (
                <div
                  key={s.employee_id}
                  className="flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold">{s.full_name}</span>
                    <span className="text-[12px] text-texte-secondaire">
                      {t('dashboard.scoreDetail', { station: s.station_name, n, shifts: s.shifts })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-24 overflow-hidden rounded-pilule bg-surface-2">
                      <div
                        className={`h-full ${s.score >= 50 ? 'bg-danger' : s.score > 0 ? 'bg-accent' : 'bg-succes'}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <span
                      className={`w-8 text-right font-mono text-[15px] font-semibold ${s.score >= 50 ? 'text-danger' : ''}`}
                    >
                      {s.score}
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="m-0 px-[18px] py-2 text-[11px] text-texte-secondaire">
              {t('dashboard.scoreDoc')}
            </p>
          </Bloc>
        </div>
      </div>
    </main>
  );
}

function Kpi({
  titre,
  valeur,
  detail,
  danger,
}: {
  titre: string;
  valeur: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-bordure bg-surface px-[18px] py-4">
      <span className="text-[12px] tracking-wider text-texte-secondaire">{titre}</span>
      <span className={`font-mono text-[24px] font-semibold ${danger ? 'text-danger' : ''}`}>
        {valeur}
      </span>
      <span className="text-[12px] text-texte-secondaire">{detail}</span>
    </section>
  );
}

function Bloc({
  titre,
  action,
  children,
}: {
  titre: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-bordure bg-surface">
      <div className="flex items-center justify-between border-b border-bordure px-[18px] py-4">
        <h2 className="m-0 text-[15px] font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Pilule({ texte, accent }: { texte: string; accent: boolean }) {
  return (
    <span
      className={`inline-block rounded-pilule px-2 py-0.5 text-[12px] ${accent ? 'bg-accent-fond text-accent' : 'bg-surface-2 text-texte-secondaire'}`}
    >
      {texte}
    </span>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">{texte}</p>
  );
}
