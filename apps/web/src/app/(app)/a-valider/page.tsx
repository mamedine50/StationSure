import { formatFCFA } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonsEcart, FormulaireAnnulation, FormulaireCompteCredit } from './formulaires';

export const metadata: Metadata = { title: t('nav.validate') };

const dateCourte = new Intl.DateTimeFormat('fr-SN', { day: '2-digit', month: '2-digit' });
const heure = new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' });

export default async function PageAValider() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const stationDe = (id: string) => contexte.stations.find((s) => s.id === id)?.name ?? '';

  const [
    { data: closings },
    { data: decisions },
    { data: voids },
    { data: approvals },
    { data: comptes },
    { data: employes },
    { data: shifts },
    { data: depositLinks },
    { data: deposits },
    { data: alertes },
  ] = await Promise.all([
    supabase
      .from('cash_closings')
      .select(
        'id, shift_id, station_id, employee_id, variance_fcfa, counted_cash_fcfa, justification, closed_at, deposit_mode',
      )
      .order('closed_at', { ascending: false })
      .limit(50),
    supabase.from('cash_variance_decisions').select('closing_id, decision, created_at'),
    supabase
      .from('voids')
      .select(
        'id, station_id, employee_id, amount_fcfa, reason, device_created_at, transaction_id, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('void_approvals').select('void_id, decision'),
    supabase
      .from('credit_accounts')
      .select('id, station_id, customer_name, phone, requested_by_employee_id, requested_at')
      .eq('status', 'pending'),
    supabase.from('employees').select('id, full_name'),
    supabase.from('shifts').select('id, label, opened_at, closed_at, opened_by'),
    supabase.from('bank_deposit_shifts').select('deposit_id, shift_id'),
    supabase.from('bank_deposits').select('id, amount_fcfa, deposited_at, evidence_id'),
    supabase
      .from('alerts')
      .select('id, type, shift_id, payload, created_at')
      .in('type', ['deposit_missing', 'deposit_mismatch'])
      .is('acknowledged_at', null),
  ]);
  const nom = (id: string | null) => employes?.find((e) => e.id === id)?.full_name ?? '';
  const initiales = (n: string) =>
    n
      .split(' ')
      .map((m, i, a) => (i < a.length - 1 ? `${m[0]}.` : m))
      .join(' ');
  const shiftDe = (id: string) => shifts?.find((s) => s.id === id);
  const libelleShift = (shiftId: string, stationId: string) => {
    const s = shiftDe(shiftId);
    return `${stationDe(stationId)} · ${s?.label ?? 'shift'} ${s ? dateCourte.format(new Date(s.opened_at)) : ''}`;
  };
  // Dernière clôture par shift, sans décision
  const derniereParShift = new Map<string, NonNullable<typeof closings>[number]>();
  for (const c of closings ?? [])
    if (!derniereParShift.has(c.shift_id)) derniereParShift.set(c.shift_id, c);
  const ecarts = [...derniereParShift.values()].filter(
    (c) => c.variance_fcfa !== 0 && !decisions?.some((d) => d.closing_id === c.id),
  );
  const annulations = (voids ?? []).filter((v) => !approvals?.some((a) => a.void_id === v.id));
  const versements = [...derniereParShift.values()].slice(0, 12).map((c) => {
    const lien = depositLinks?.find((l) => l.shift_id === c.shift_id);
    const depot = lien ? deposits?.find((d) => d.id === lien.deposit_id) : null;
    const missing = alertes?.find((a) => a.type === 'deposit_missing' && a.shift_id === c.shift_id);
    const mismatch = alertes?.find(
      (a) =>
        a.type === 'deposit_mismatch' &&
        (a.payload as { deposit_id?: string })?.deposit_id === depot?.id,
    );
    return { c, depot, missing, mismatch };
  });
  const rw = contexte.estProprietaire;
  const maintenant = new Date().getTime();

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage titre={t('nav.validate')} sousTitre={t('validate.subtitle')} />
      {!rw && (
        <p className="m-0 rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-texte-secondaire">
          {t('validate.readOnly')}
        </p>
      )}
      <div className="grid grid-cols-[1fr_1.05fr] gap-4">
        <div className="flex flex-col gap-4">
          <Bloc titre={t('validate.variances')} compteur={ecarts.length}>
            {ecarts.length === 0 && <Vide />}
            {ecarts.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 border-b border-bordure px-[18px] py-4 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">
                    {libelleShift(c.shift_id, c.station_id)} · {initiales(nom(c.employee_id))}
                  </span>
                  <span className="font-mono text-[18px] font-semibold text-danger">
                    {formatFCFA(c.variance_fcfa)}
                  </span>
                </div>
                <span className="text-[13px] text-texte-secondaire">
                  {c.justification
                    ? t('validate.justification', { text: c.justification })
                    : t('validate.noJustification')}
                </span>
                {rw && <BoutonsEcart closingId={c.id} />}
              </div>
            ))}
          </Bloc>
          <Bloc titre={t('validate.voids')} compteur={annulations.length}>
            {annulations.length === 0 && <Vide />}
            {annulations.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[1.2fr_0.6fr_1.2fr_auto] items-center gap-3 border-b border-bordure px-[18px] py-3 last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold">{stationDe(v.station_id)}</span>
                  <span className="text-[12px] text-texte-secondaire">
                    {nom(v.employee_id)} ·{' '}
                    {v.device_created_at ? heure.format(new Date(v.device_created_at)) : ''}
                  </span>
                </div>
                <span className="font-mono text-[15px]">{formatFCFA(v.amount_fcfa)}</span>
                <span className="text-[13px] text-texte-secondaire">
                  {t('validate.reason', { text: v.reason })}
                </span>
                {rw ? <FormulaireAnnulation voidId={v.id} /> : <span />}
              </div>
            ))}
          </Bloc>
          <Bloc titre={t('validate.creditRequests')} compteur={comptes?.length ?? 0}>
            {(comptes ?? []).length === 0 && <Vide />}
            {(comptes ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold">{a.customer_name}</span>
                  <span className="text-[12px] text-texte-secondaire">
                    {stationDe(a.station_id)} ·{' '}
                    {t('validate.requestedBy', {
                      name: initiales(nom(a.requested_by_employee_id)),
                      time: a.requested_at ? heure.format(new Date(a.requested_at)) : '',
                    })}{' '}
                    · {a.phone ?? ''}
                  </span>
                </div>
                {rw ? <FormulaireCompteCredit accountId={a.id} /> : null}
              </div>
            ))}
          </Bloc>
        </div>
        <Bloc
          titre={t('validate.deposits')}
          action={
            <Link href="/caisse" className="text-[13px]">
              {t('validate.history')}
            </Link>
          }
        >
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
            <span>{t('validate.shift')}</span>
            <span className="text-right">{t('validate.countedCash')}</span>
            <span className="text-right">{t('validate.deposited')}</span>
            <span className="text-right">{t('validate.slip')}</span>
          </div>
          {versements.map(({ c, depot, missing, mismatch }) => (
            <div
              key={c.id}
              className={`grid grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0 ${missing ? 'bg-danger-fond' : ''}`}
            >
              <div className="flex flex-col">
                <span className="font-semibold">{libelleShift(c.shift_id, c.station_id)}</span>
                <span className="text-[12px] text-texte-secondaire">
                  {initiales(nom(c.employee_id))}
                </span>
              </div>
              <span className="text-right font-mono">{formatFCFA(c.counted_cash_fcfa)}</span>
              <span
                className={`text-right font-mono ${depot ? (mismatch ? 'text-danger' : 'text-succes') : missing ? 'text-danger' : 'text-accent'}`}
              >
                {depot
                  ? formatFCFA(depot.amount_fcfa)
                  : missing
                    ? `${formatFCFA(c.counted_cash_fcfa)} ?`
                    : t('validate.pending')}
              </span>
              <span
                className={`text-right text-[12px] ${depot ? (mismatch ? 'text-danger' : 'text-succes') : missing ? 'font-semibold text-danger' : 'text-accent'}`}
              >
                {depot
                  ? mismatch
                    ? '!'
                    : '✓'
                  : missing
                    ? t('validate.missing')
                    : t('validate.todo')}
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-2 px-[18px] py-4 text-[13px] text-texte-secondaire">
            {versements
              .filter((v) => v.mismatch)
              .map(({ c, mismatch }) => (
                <span key={c.id}>
                  {t('validate.mismatch', {
                    station: stationDe(c.station_id),
                    date: dateCourte.format(new Date(c.closed_at)),
                    amount: formatFCFA(
                      Math.abs(
                        Number(
                          (mismatch!.payload as { counted_cash_fcfa: number; amount_fcfa: number })
                            .counted_cash_fcfa,
                        ) - Number((mismatch!.payload as { amount_fcfa: number }).amount_fcfa),
                      ),
                    ),
                  })}
                </span>
              ))}
            {versements
              .filter((v) => v.missing)
              .map(({ c }) => (
                <span key={c.id}>
                  {t('validate.missingSince', {
                    station: stationDe(c.station_id),
                    date: dateCourte.format(new Date(c.closed_at)),
                    hours: Math.floor((maintenant - new Date(c.closed_at).getTime()) / 3600000),
                  })}
                </span>
              ))}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled
                title={t('validate.remindLater')}
                className="h-11 rounded-lg bg-accent px-4 text-[14px] font-semibold text-accent-texte opacity-40"
              >
                {t('validate.remindWhatsApp')}
              </button>
              <a
                href="/caisse/versements.csv"
                className="flex h-11 items-center rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte no-underline"
              >
                {t('validate.exportAccountant')}
              </a>
            </div>
          </div>
        </Bloc>
      </div>
    </main>
  );
}

function Bloc({
  titre,
  compteur,
  action,
  children,
}: {
  titre: string;
  compteur?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-bordure bg-surface">
      <div className="flex items-center justify-between border-b border-bordure px-[18px] py-4">
        <h2 className="m-0 text-[15px] font-semibold">{titre}</h2>
        {action ?? <span className="text-[13px] text-texte-secondaire">{compteur}</span>}
      </div>
      {children}
    </section>
  );
}

function Vide() {
  return (
    <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
      {t('validate.nothing')}
    </p>
  );
}
