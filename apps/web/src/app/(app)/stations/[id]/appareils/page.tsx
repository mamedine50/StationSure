import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonRevoquer } from './bouton-revoquer';
import { DialogueJumelage } from './dialogue-jumelage';

export const metadata: Metadata = { title: t('devices.title') };

export default async function PageAppareils({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await exigerContexteComplet();
  const station = contexte.stations.find((s) => s.id === id);
  if (!station) notFound();

  const supabase = await creerClientServeur();
  const { data: appareils } = await supabase
    .from('devices')
    .select('id, label, active, registered_at')
    .eq('station_id', id)
    .order('registered_at', { ascending: false });

  const dateFr = new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={`${t('devices.title')} · ${station.name}`}
        sousTitre={t('devices.subtitle', { station: station.name })}
        action={contexte.estProprietaire ? <DialogueJumelage stationId={id} /> : undefined}
      />
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
          <span>{t('devices.label').toUpperCase()}</span>
          <span>{t('devices.registeredAt').toUpperCase()}</span>
          <span>{t('devices.status').toUpperCase()}</span>
          <span />
        </div>
        {(appareils ?? []).length === 0 && (
          <p className="m-0 px-[18px] py-8 text-center text-[13px] text-texte-secondaire">
            {t('devices.none')}
          </p>
        )}
        {(appareils ?? []).map((appareil) => (
          <div
            key={appareil.id}
            className="grid min-h-[54px] grid-cols-[1.4fr_1fr_0.8fr_0.8fr] items-center gap-2 border-b border-bordure px-[18px] py-2 text-[14px] last:border-b-0"
          >
            <span className="font-semibold">{appareil.label}</span>
            <span className="font-mono text-[13px] text-texte-secondaire">
              {dateFr.format(new Date(appareil.registered_at))}
            </span>
            <span
              className={`text-[12px] font-semibold ${appareil.active ? 'text-succes' : 'text-danger'}`}
            >
              {appareil.active ? t('common.active') : t('devices.revoked')}
            </span>
            <div className="justify-self-end">
              {contexte.estProprietaire && appareil.active && (
                <BoutonRevoquer deviceId={appareil.id} stationId={id} label={appareil.label} />
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
