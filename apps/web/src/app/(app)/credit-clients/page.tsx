import { formatFCFA } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: t('nav.credit') };

export default async function PageCreditClients() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [{ data: comptes }, { data: entrees }] = await Promise.all([
    supabase
      .from('credit_accounts')
      .select('id, station_id, customer_name, phone, limit_fcfa, status')
      .order('customer_name'),
    supabase.from('credit_entries').select('credit_account_id, amount_fcfa'),
  ]);
  const solde = (id: string) =>
    (entrees ?? [])
      .filter((e) => e.credit_account_id === id)
      .reduce((s, e) => s + e.amount_fcfa, 0);
  const stationDe = (id: string) => contexte.stations.find((s) => s.id === id)?.name ?? '';
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage titre={t('nav.credit')} sousTitre={t('creditPage.subtitle')} />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr_0.8fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
          <span>{t('creditPage.customer').toUpperCase()}</span>
          <span>{t('creditPage.phone').toUpperCase()}</span>
          <span>{t('devices.status').toUpperCase()}</span>
          <span className="text-right">{t('creditPage.limit').toUpperCase()}</span>
          <span className="text-right">{t('creditPage.balance').toUpperCase()}</span>
          <span className="text-right">{t('creditPage.available').toUpperCase()}</span>
          <span />
        </div>
        {(comptes ?? []).length === 0 && (
          <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
            {t('creditPage.none')}
          </p>
        )}
        {(comptes ?? []).map((a) => (
          <div
            key={a.id}
            className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr_0.8fr] items-center gap-2 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
          >
            <span className="flex flex-col">
              <span className="font-semibold">{a.customer_name}</span>
              <span className="text-[12px] text-texte-secondaire">{stationDe(a.station_id)}</span>
            </span>
            <span className="text-texte-secondaire">{a.phone ?? '—'}</span>
            <span
              className={`text-[12px] ${a.status === 'active' ? 'text-succes' : a.status === 'pending' ? 'text-accent' : 'text-texte-secondaire'}`}
            >
              {t(`creditPage.status.${a.status}`)}
            </span>
            <span className="text-right font-mono">{formatFCFA(a.limit_fcfa)}</span>
            <span className="text-right font-mono">{formatFCFA(solde(a.id))}</span>
            <span className="text-right font-mono">
              {formatFCFA(Math.max(0, a.limit_fcfa - solde(a.id)))}
            </span>
            <Link href={`/credit-clients/${a.id}`} className="text-right text-[13px]">
              {t('creditPage.statement')}
            </Link>
          </div>
        ))}
      </section>
    </main>
  );
}
