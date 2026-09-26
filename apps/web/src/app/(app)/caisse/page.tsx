import { formatFCFA } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { ImportReleve, SelecteurStationCaisse } from './formulaires';

export const metadata: Metadata = { title: t('nav.cash') };
const dateHeure = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeStyle: 'short' });

export default async function PageCaisse({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const stationIds =
    stationParam && stationParam !== 'all' ? [stationParam] : contexte.stations.map((s) => s.id);
  const [
    { data: shifts },
    { data: closings },
    { data: decisions },
    { data: employes },
    { data: imports },
    { data: matches },
    { data: pendingPayments },
  ] = await Promise.all([
    supabase
      .from('shifts')
      .select('id, station_id, label, status, opened_at, closed_at, opened_by')
      .in('station_id', stationIds)
      .order('opened_at', { ascending: false })
      .limit(40),
    supabase
      .from('cash_closings')
      .select('id, shift_id, expected_total_fcfa, counted_cash_fcfa, variance_fcfa, closed_at')
      .order('closed_at', { ascending: false }),
    supabase.from('cash_variance_decisions').select('closing_id, decision'),
    supabase.from('employees').select('id, full_name'),
    supabase
      .from('mobile_money_imports')
      .select('id, provider, filename, line_count, matched_count, unmatched_count, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('payment_matches')
      .select('payment_id, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id, method, amount_fcfa, external_ref, device_created_at, station_id')
      .in('method', ['wave', 'orange_money'])
      .order('device_created_at', { ascending: false })
      .limit(50),
  ]);
  const nom = (id: string) => employes?.find((e) => e.id === id)?.full_name ?? '';
  const stationDe = (id: string) => contexte.stations.find((s) => s.id === id)?.name ?? '';
  const clotureDe = (shiftId: string) => closings?.find((c) => c.shift_id === shiftId);
  const statutPaiement = (id: string) =>
    matches?.find((m) => m.payment_id === id)?.status ?? 'pending';
  const enAttente = (pendingPayments ?? []).filter((p) => statutPaiement(p.id) !== 'matched');

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('nav.cash')}
        sousTitre={t('cashPage.subtitle')}
        action={
          <SelecteurStationCaisse stations={contexte.stations} stationId={stationParam ?? 'all'} />
        }
      />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        <div className="grid grid-cols-[1.3fr_1fr_0.8fr_1fr_1fr_1fr_1fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
          <span>{t('cashPage.station').toUpperCase()}</span>
          <span>{t('cashPage.opened').toUpperCase()}</span>
          <span>{t('devices.status').toUpperCase()}</span>
          <span className="text-right">{t('cashPage.expected').toUpperCase()}</span>
          <span className="text-right">{t('cashPage.counted').toUpperCase()}</span>
          <span className="text-right">{t('cashPage.variance').toUpperCase()}</span>
          <span className="text-right">{t('cashPage.decision').toUpperCase()}</span>
        </div>
        {(shifts ?? []).length === 0 && (
          <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
            {t('cashPage.none')}
          </p>
        )}
        {(shifts ?? []).map((s) => {
          const c = clotureDe(s.id);
          const d = c ? decisions?.find((x) => x.closing_id === c.id) : null;
          return (
            <Link
              key={s.id}
              href={`/caisse/${s.id}`}
              className="grid grid-cols-[1.3fr_1fr_0.8fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] text-texte no-underline last:border-b-0 hover:bg-surface-2"
            >
              <span className="flex flex-col">
                <span className="font-semibold">
                  {stationDe(s.station_id)}
                  {s.label ? ` · ${s.label}` : ''}
                </span>
                <span className="text-[12px] text-texte-secondaire">
                  {t('cashPage.by', { name: nom(s.opened_by) })}
                </span>
              </span>
              <span className="font-mono text-[13px] text-texte-secondaire">
                {dateHeure.format(new Date(s.opened_at))}
              </span>
              <span className="text-[12px]">{t(`cashPage.status.${s.status}`)}</span>
              <span className="text-right font-mono">
                {c ? formatFCFA(c.expected_total_fcfa) : '—'}
              </span>
              <span className="text-right font-mono">
                {c ? formatFCFA(c.counted_cash_fcfa) : '—'}
              </span>
              <span
                className={`text-right font-mono font-semibold ${c && c.variance_fcfa !== 0 ? 'text-danger' : ''}`}
              >
                {c ? formatFCFA(c.variance_fcfa) : '—'}
              </span>
              <span className="text-right text-[12px] text-texte-secondaire">
                {d
                  ? t(
                      `validate.${d.decision === 'accept_loss' ? 'acceptLoss' : d.decision === 'salary_deduction' ? 'salaryDeduction' : 'recount'}`,
                    )
                  : c && c.variance_fcfa !== 0
                    ? t('validate.pending')
                    : ''}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('cashPage.mobileMoney')}</h2>
          {contexte.estProprietaire && <ImportReleve />}
          <span className="text-[12px] text-texte-secondaire">{t('cashPage.lastImports')}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {(imports ?? []).map((i) => (
              <li key={i.id} className="flex justify-between text-texte-secondaire">
                <span>
                  {dateHeure.format(new Date(i.created_at))} · {i.provider} · {i.filename ?? ''}
                </span>
                <span className="font-mono">
                  {i.line_count} / <span className="text-succes">{i.matched_count}</span> /{' '}
                  <span className="text-danger">{i.unmatched_count}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('cashPage.pendingPayments')}</h2>
          {enAttente.length === 0 && <span className="text-[13px] text-texte-secondaire">—</span>}
          {enAttente.slice(0, 12).map((p) => (
            <div key={p.id} className="flex items-center justify-between text-[13px]">
              <span className="text-texte-secondaire">
                {dateHeure.format(new Date(p.device_created_at))} · {stationDe(p.station_id)} ·{' '}
                {p.method === 'wave' ? 'Wave' : 'Orange Money'} ·{' '}
                <span className="font-mono">{p.external_ref}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono">{formatFCFA(p.amount_fcfa)}</span>
                <span
                  className={`rounded-pilule px-2 py-0.5 text-[11px] ${statutPaiement(p.id) === 'unmatched' ? 'bg-danger-fond text-danger' : 'bg-accent-fond text-accent'}`}
                >
                  {statutPaiement(p.id) === 'unmatched'
                    ? t('cashPage.unmatched')
                    : t('cashPage.pendingStatus')}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
