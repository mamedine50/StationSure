import { formatFCFA } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: t('creditPage.statement') };
const dateHeure = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeStyle: 'short' });

export default async function PageReleve({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [{ data: compte }, { data: lignes }] = await Promise.all([
    supabase
      .from('credit_accounts')
      .select('id, customer_name, phone, limit_fcfa, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('credit_account_statement', { p_account_id: id }),
  ]);
  if (!compte) notFound();
  const solde = (lignes ?? []).at(-1)?.balance_fcfa ?? 0;
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={compte.customer_name}
        sousTitre={`${t('creditPage.limit')} ${formatFCFA(compte.limit_fcfa)} · ${t('creditPage.balance')} ${formatFCFA(solde)} · ${t('creditPage.available')} ${formatFCFA(Math.max(0, compte.limit_fcfa - solde))}`}
        action={
          <a
            href={`/credit-clients/${id}/releve.csv`}
            className="flex h-11 items-center rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte no-underline"
          >
            {t('creditPage.exportCsv')}
          </a>
        }
      />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
          <span>DATE</span>
          <span>{t('creditPage.entries').toUpperCase()}</span>
          <span>{t('creditPage.vehicle').toUpperCase()}</span>
          <span>{t('employees.name').toUpperCase()}</span>
          <span className="text-right">FCFA</span>
          <span className="text-right">{t('creditPage.runningBalance').toUpperCase()}</span>
        </div>
        {(lignes ?? []).map((l) => (
          <div
            key={l.entry_id ?? ''}
            className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-bordure px-[18px] py-2 text-[13px] last:border-b-0"
          >
            <span className="font-mono text-texte-secondaire">
              {l.at ? dateHeure.format(new Date(l.at)) : ''}
            </span>
            <span>{t(`creditPage.kind.${l.kind}`)}</span>
            <span className="text-texte-secondaire">{l.vehicle_plate ?? '—'}</span>
            <span className="text-texte-secondaire">{l.employee_name}</span>
            <span
              className={`text-right font-mono ${(l.amount_fcfa ?? 0) < 0 ? 'text-succes' : ''}`}
            >
              {formatFCFA(l.amount_fcfa ?? 0)}
            </span>
            <span className="text-right font-mono font-semibold">
              {formatFCFA(l.balance_fcfa ?? 0)}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
