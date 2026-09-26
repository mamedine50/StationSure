import { formatFCFA, formatLitres, formatPourcent } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonAccuser } from '../composants-dashboard';
import { FiltresAlertes } from './filtres';

export const metadata: Metadata = { title: t('nav.alerts') };

const dateHeure = new Intl.DateTimeFormat('fr-SN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
});

const TYPES = [
  'cash_variance',
  'handover_mismatch',
  'delivery_shortfall',
  'meter_regression',
  'pin_lockout',
  'tank_variance',
  'void_requested',
  'void_over_limit',
  'deposit_missing',
  'deposit_mismatch',
  'mobile_money_unmatched',
  'mobile_money_pending',
  'credit_account_requested',
  'price_change_reading_missing',
  'device_paired',
  'device_revoked',
  'shift_opened',
] as const;
const JOURS = ['1', '7', '30', '90'] as const;

export default async function PageAlertes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const type = TYPES.find((x) => x === params.type) ?? '';
  const station = contexte.stations.find((s) => s.id === params.station)?.id ?? '';
  const severite = ['info', 'warning', 'critical'].find((x) => x === params.severite) ?? '';
  const jours = JOURS.find((x) => x === params.jours) ?? '7';
  const etat = params.etat === 'all' ? 'all' : 'pending';
  const cible = params.id ?? '';
  const depuis = new Date(new Date().getTime() - Number(jours) * 86400000).toISOString();

  let requete = supabase
    .from('alerts')
    .select('id, type, severity, station_id, shift_id, payload, created_at, acknowledged_at')
    .gte('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(200);
  if (type) requete = requete.eq('type', type);
  if (station) requete = requete.eq('station_id', station);
  if (severite) requete = requete.eq('severity', severite as 'info' | 'warning' | 'critical');
  if (etat === 'pending') requete = requete.is('acknowledged_at', null);
  const [{ data: alertes }, { data: employes }, { data: cibleSeule }] = await Promise.all([
    requete,
    supabase.from('employees').select('id, full_name'),
    cible
      ? supabase
          .from('alerts')
          .select('id, type, severity, station_id, shift_id, payload, created_at, acknowledged_at')
          .eq('id', cible)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const liste = [...(alertes ?? [])];
  if (cibleSeule && !liste.some((a) => a.id === cibleSeule.id)) liste.unshift(cibleSeule);
  const stationDe = (id: string | null) => contexte.stations.find((s) => s.id === id)?.name ?? '—';
  const nom = (id: unknown) => employes?.find((e) => e.id === id)?.full_name ?? '';
  const rw = contexte.estProprietaire;

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage titre={t('nav.alerts')} sousTitre={t('alertsPage.subtitle')} />
      <FiltresAlertes
        types={TYPES}
        stations={contexte.stations}
        valeurs={{ type, station, severite, jours, etat }}
      />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        {liste.length === 0 && (
          <p className="m-0 px-[18px] py-8 text-center text-[13px] text-texte-secondaire">
            {t('alertsPage.none')}
          </p>
        )}
        {liste.map((a) => {
          const p = (a.payload ?? {}) as Record<string, unknown>;
          const details: string[] = [];
          if (typeof p.variance_fcfa === 'number')
            details.push(`${formatFCFA(p.variance_fcfa)} FCFA`);
          if (typeof p.amount_fcfa === 'number') details.push(`${formatFCFA(p.amount_fcfa)} FCFA`);
          if (typeof p.variance_pct === 'number') details.push(formatPourcent(p.variance_pct));
          if (typeof p.threshold_pct === 'number')
            details.push(`seuil ${formatPourcent(p.threshold_pct)}`);
          if (typeof p.tolerance_fcfa === 'number')
            details.push(`tolérance ${formatFCFA(p.tolerance_fcfa)} FCFA`);
          if (Array.isArray(p.mismatches) && p.mismatches[0]) {
            const m = p.mismatches[0] as { label?: string; variance_cl?: number };
            details.push(
              `${m.label ?? ''} ${formatLitres(Math.abs(Number(m.variance_cl ?? 0)))} L`,
            );
          }
          if (typeof p.reason === 'string') details.push(p.reason);
          if (typeof p.justification === 'string') details.push(`« ${p.justification} »`);
          if (typeof p.full_name === 'string') details.push(p.full_name);
          if (typeof p.customer_name === 'string') details.push(p.customer_name);
          if (typeof p.external_ref === 'string') details.push(p.external_ref);
          if (typeof p.reference === 'string') details.push(p.reference);
          const qui = nom(p.employee_id) || nom(p.outgoing_employee_id);
          return (
            <div
              key={a.id}
              id={a.id}
              className={`grid grid-cols-[110px_1.3fr_1fr_2fr_auto] items-center gap-3 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0 ${a.id === cible ? 'bg-accent-fond' : ''} ${a.acknowledged_at ? 'opacity-70' : ''}`}
            >
              <span className="font-mono text-[12px] text-texte-secondaire">
                {dateHeure.format(new Date(a.created_at))}
              </span>
              <span className="flex items-center gap-2 font-semibold">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-pilule ${a.severity === 'critical' ? 'bg-danger' : a.severity === 'warning' ? 'bg-accent' : 'bg-texte-secondaire'}`}
                  title={t(`alertsPage.severities.${a.severity}`)}
                />
                {t(`alertTypes.${a.type}`)}
              </span>
              <span className="text-texte-secondaire">
                {stationDe(a.station_id)}
                {qui ? ` · ${qui}` : ''}
              </span>
              <span className="text-[13px] text-texte-secondaire">{details.join(' · ')}</span>
              <span className="flex justify-end">
                {a.acknowledged_at ? (
                  <span className="text-[12px] text-succes">
                    {t('alertsPage.acknowledgedAt', {
                      date: dateHeure.format(new Date(a.acknowledged_at)),
                    })}
                  </span>
                ) : rw ? (
                  <BoutonAccuser alertId={a.id} />
                ) : null}
              </span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
