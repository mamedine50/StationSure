import { formatFCFA, formatLitres } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: t('nav.cash') };
const dateHeure = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeStyle: 'short' });

export default async function PageShift({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, station_id, label, status, opened_at, closed_at, opened_by, closed_by')
    .eq('id', id)
    .maybeSingle();
  if (!shift) notFound();
  const [
    { data: resume },
    { data: closings },
    { data: decisions },
    { data: employes },
    { data: prix },
  ] = await Promise.all([
    supabase.rpc('shift_cash_summary', { p_shift_id: id }),
    supabase
      .from('cash_closings')
      .select('*')
      .eq('shift_id', id)
      .order('closed_at', { ascending: false }),
    supabase.from('cash_variance_decisions').select('closing_id, decision, note, created_at'),
    supabase.from('employees').select('id, full_name'),
    supabase.rpc('shift_price_changes', { p_shift_id: id }),
  ]);
  const nom = (i: string | null) => employes?.find((e) => e.id === i)?.full_name ?? '';
  type Resume = {
    expected: Record<string, number>;
    collected: Record<string, number>;
    counted_cash_fcfa: number | null;
    variance_fcfa: number | null;
    missing: { label: string; reason: string }[];
    fuel: {
      label: string;
      amount_fcfa: number;
      slices: { litres_cl: number; price_fcfa_per_litre: number; amount_fcfa: number }[];
    }[];
  };
  const live = (resume ?? null) as Resume | null;
  const derniereCloture = closings?.[0];
  // Shift clos : on affiche les valeurs FIGÉES de la clôture (le recalcul en direct changerait avec
  // les annulations approuvées après coup) ; sinon le calcul courant du serveur.
  const r: Resume | null = derniereCloture
    ? {
        expected: {
          fuel_fcfa: derniereCloture.expected_fuel_fcfa,
          shop_fcfa: derniereCloture.expected_shop_fcfa,
          wash_fcfa: derniereCloture.expected_wash_fcfa,
          garage_fcfa: derniereCloture.expected_garage_fcfa,
          credit_repayments_fcfa: derniereCloture.credit_repayments_fcfa,
          approved_voids_fcfa: derniereCloture.approved_voids_fcfa,
          total_fcfa: derniereCloture.expected_total_fcfa,
          cash_fcfa: derniereCloture.expected_cash_fcfa,
        },
        collected: {
          wave_fcfa: derniereCloture.wave_fcfa,
          orange_money_fcfa: derniereCloture.orange_money_fcfa,
          card_fcfa: derniereCloture.card_fcfa,
          credit_fcfa: derniereCloture.credit_fcfa,
        },
        counted_cash_fcfa: derniereCloture.counted_cash_fcfa,
        variance_fcfa: derniereCloture.variance_fcfa,
        missing: [],
        fuel: Array.isArray(derniereCloture.details)
          ? (derniereCloture.details as unknown as Resume['fuel'])
          : (live?.fuel ?? []),
      }
    : live;
  const cloture = closings?.[0];
  const decision = cloture ? decisions?.find((d) => d.closing_id === cloture.id) : null;
  const libDecision = (d: string) =>
    t(
      `validate.${d === 'accept_loss' ? 'acceptLoss' : d === 'salary_deduction' ? 'salaryDeduction' : 'recount'}`,
    );
  const station = contexte.stations.find((s) => s.id === shift.station_id)?.name ?? '';
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={`${station}${shift.label ? ` · ${shift.label}` : ''}`}
        sousTitre={`${t(`cashPage.status.${shift.status}`)} · ${dateHeure.format(new Date(shift.opened_at))} · ${t('cashPage.by', { name: nom(shift.opened_by) })}`}
      />
      <div className="grid grid-cols-3 gap-4">
        <section className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('cashPage.expectedBreakdown')}</h2>
          {r ? (
            <>
              <Ligne l={t('cashPage.fuel')} v={formatFCFA(r.expected.fuel_fcfa ?? 0)} />
              <Ligne l={t('cashPage.shop')} v={formatFCFA(r.expected.shop_fcfa ?? 0)} />
              <Ligne l={t('cashPage.wash')} v={formatFCFA(r.expected.wash_fcfa ?? 0)} />
              <Ligne l={t('cashPage.garage')} v={formatFCFA(r.expected.garage_fcfa ?? 0)} />
              <Ligne
                l={t('cashPage.repayments')}
                v={formatFCFA(r.expected.credit_repayments_fcfa ?? 0)}
              />
              <Ligne
                l={t('cashPage.voids')}
                v={`−${formatFCFA(r.expected.approved_voids_fcfa ?? 0)}`}
              />
              <hr className="border-bordure" />
              <Ligne l={t('cashPage.total')} v={formatFCFA(r.expected.total_fcfa ?? 0)} fort />
              {r.missing?.length > 0 && (
                <span className="text-[12px] text-danger">
                  {t('cashPage.missingPriceReadings', {
                    list: r.missing.map((m) => m.label).join(', '),
                  })}
                </span>
              )}
            </>
          ) : (
            <span className="text-[13px] text-texte-secondaire">—</span>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('cashPage.collected')}</h2>
          {r ? (
            <>
              <Ligne l={t('cashPage.wave')} v={formatFCFA(r.collected.wave_fcfa ?? 0)} />
              <Ligne l={t('cashPage.om')} v={formatFCFA(r.collected.orange_money_fcfa ?? 0)} />
              <Ligne l={t('cashPage.card')} v={formatFCFA(r.collected.card_fcfa ?? 0)} />
              <Ligne l={t('cashPage.credit')} v={formatFCFA(r.collected.credit_fcfa ?? 0)} />
              <hr className="border-bordure" />
              <Ligne l={t('cashPage.cash')} v={formatFCFA(r.expected.cash_fcfa ?? 0)} />
              <Ligne
                l={t('cashPage.countedCash')}
                v={r.counted_cash_fcfa === null ? '—' : formatFCFA(r.counted_cash_fcfa)}
                fort
              />
              <Ligne
                l={t('cashPage.variance')}
                v={r.variance_fcfa === null ? '—' : formatFCFA(r.variance_fcfa)}
                fort
                rouge={r.variance_fcfa !== null && r.variance_fcfa !== 0}
              />
            </>
          ) : (
            <span className="text-[13px] text-texte-secondaire">—</span>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('cashPage.decision')}</h2>
          {cloture ? (
            <>
              <span className="text-[13px] text-texte-secondaire">
                {dateHeure.format(new Date(cloture.closed_at))} · {nom(cloture.employee_id)}
              </span>
              <span className="text-[13px]">
                {t('cashPage.justification')} : {cloture.justification ?? '—'}
              </span>
              <span className="text-[13px] text-texte-secondaire">
                {t(`cashPage.depositMode.${cloture.deposit_mode}`)}
              </span>
              <span
                className={`text-[14px] font-semibold ${decision ? 'text-succes' : 'text-accent'}`}
              >
                {decision
                  ? `${libDecision(decision.decision)}${decision.note ? ` · ${decision.note}` : ''}`
                  : cloture.variance_fcfa !== 0
                    ? t('validate.pending')
                    : '✓'}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-texte-secondaire">{t('cashPage.noClosing')}</span>
          )}
          {(prix ?? []).length > 0 && (
            <div className="mt-2 flex flex-col gap-1 text-[12px] text-texte-secondaire">
              <span className="font-semibold text-texte">{t('cashPage.priceChanges')}</span>
              {(prix ?? []).map((p) => (
                <span key={p.price_change_id ?? ''}>
                  {dateHeure.format(new Date(p.effective_at ?? 0))} ·{' '}
                  {t(`fuel.${p.fuel_product_code}`)} → {formatFCFA(p.price_fcfa_per_litre ?? 0)}{' '}
                  FCFA/L
                  {Array.isArray(p.missing_nozzles) && p.missing_nozzles.length > 0
                    ? ` · ${t('cashPage.missingPriceReadings', { list: (p.missing_nozzles as { label: string }[]).map((m) => m.label).join(', ') })}`
                    : ''}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
      {r && r.fuel && (
        <section className="flex flex-col rounded-xl border border-bordure bg-surface">
          <div className="border-b border-bordure px-[18px] py-3 text-[15px] font-semibold">
            {t('cashPage.fuel')}
          </div>
          {r.fuel.map((n) => (
            <div
              key={n.label}
              className="grid grid-cols-[100px_1fr_140px] items-center gap-3 border-b border-bordure px-[18px] py-2 text-[13px] last:border-b-0"
            >
              <span className="font-semibold">{n.label}</span>
              <span className="text-texte-secondaire">
                {n.slices.map((s, i) => (
                  <span key={i} className="mr-3 font-mono">
                    {formatLitres(s.litres_cl)} L × {s.price_fcfa_per_litre}
                  </span>
                ))}
              </span>
              <span className="text-right font-mono">{formatFCFA(n.amount_fcfa)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Ligne({ l, v, fort, rouge }: { l: string; v: string; fort?: boolean; rouge?: boolean }) {
  return (
    <div className={`flex justify-between text-[14px] ${fort ? 'font-semibold' : ''}`}>
      <span className={fort ? '' : 'text-texte-secondaire'}>{l}</span>
      <span className={`font-mono ${rouge ? 'text-danger' : ''}`}>{v}</span>
    </div>
  );
}
