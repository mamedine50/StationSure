import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { estEnvironnementLocal } from '@/lib/env';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonTraiterFile } from './bouton';

export const metadata: Metadata = { title: t('devMessages.title') };

const dateHeure = new Intl.DateTimeFormat('fr-SN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Africa/Dakar',
});

/** Page de test locale : affiche la file d'envoi (DevNotifier), jamais disponible en ligne. */
export default async function PageMessagesDev() {
  const contexte = await exigerContexteComplet();
  const local = estEnvironnementLocal();
  const supabase = await creerClientServeur();
  const [{ data: messages }, { data: evenements }] = local
    ? await Promise.all([
        supabase
          .from('notification_outbox')
          .select(
            'id, kind, channel, to_phone, template, body, status, attempts, last_error, created_at, sent_at, delivered_at, station_id',
          )
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('notification_outbox_events')
          .select('outbox_id, status, error, at')
          .order('at', { ascending: true })
          .limit(500),
      ])
    : [{ data: [] }, { data: [] }];
  const stationDe = (id: string | null) => contexte.stations.find((s) => s.id === id)?.name ?? '';
  const couleur = (s: string) =>
    s === 'delivered'
      ? 'text-succes'
      : s === 'failed'
        ? 'text-danger'
        : s === 'sent'
          ? 'text-accent'
          : 'text-texte-secondaire';

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('devMessages.title')}
        sousTitre={t('devMessages.subtitle')}
        action={local && contexte.estProprietaire ? <BoutonTraiterFile /> : undefined}
      />
      {!local && (
        <p className="m-0 rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-texte-secondaire">
          {t('devMessages.notLocal')}
        </p>
      )}
      {local && (messages ?? []).length === 0 && (
        <p className="m-0 rounded-xl border border-bordure bg-surface px-6 py-10 text-center text-[13px] text-texte-secondaire">
          {t('devMessages.none')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        {(messages ?? []).map((m) => (
          <article
            key={m.id}
            className="flex flex-col gap-3 rounded-xl border border-bordure bg-surface p-[18px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold">
                  {t(`devMessages.kinds.${m.kind}`)}
                  {m.station_id ? ` · ${stationDe(m.station_id)}` : ''}
                </span>
                <span className="text-[12px] text-texte-secondaire">
                  {t('devMessages.to')} <span className="font-mono">{m.to_phone}</span> ·{' '}
                  {m.channel} · {t('devMessages.template')}{' '}
                  <span className="font-mono">{m.template}</span>
                </span>
              </div>
              <div className="flex flex-col items-end text-[12px]">
                <span className={`font-semibold ${couleur(m.status)}`}>
                  {t(`devMessages.status.${m.status}`)}
                </span>
                <span className="font-mono text-texte-secondaire">
                  {dateHeure.format(new Date(m.created_at))}
                </span>
                <span className="text-texte-secondaire">
                  {t('devMessages.attempts')} : {m.attempts}
                </span>
              </div>
            </div>
            <pre className="m-0 whitespace-pre-wrap rounded-lg border border-bordure bg-fond px-4 py-3 font-sans text-[14px] leading-relaxed text-texte">
              {m.body}
            </pre>
            {m.last_error && <span className="text-[12px] text-danger">{m.last_error}</span>}
            <span className="text-[11px] text-texte-secondaire">
              {t('devMessages.history')} :{' '}
              {(evenements ?? [])
                .filter((e) => e.outbox_id === m.id)
                .map(
                  (e) =>
                    `${t(`devMessages.status.${e.status}`)} ${dateHeure.format(new Date(e.at))}`,
                )
                .join(' → ')}
            </span>
          </article>
        ))}
      </div>
    </main>
  );
}
