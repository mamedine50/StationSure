import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';
import { TYPES_ALERTE_ROUTABLES } from '@/lib/validation';

import {
  FormulaireDestinataire,
  FormulaireInvitation,
  FormulaireMomentRapport,
  FormulairePlafonds,
  FormulaireRoutage,
  FormulaireSeuils,
  FormulaireSurcharge,
  LigneDestinataire,
  LigneInvitation,
} from './formulaires';

export const metadata: Metadata = { title: t('nav.settings') };

/** Routage par défaut (miroir de alert_route_for en base). */
const IMMEDIAT_PAR_DEFAUT = new Set([
  'handover_mismatch',
  'cash_variance',
  'delivery_shortfall',
  'meter_regression',
  'pin_lockout',
]);

export default async function PageParametres() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const rw = contexte.estProprietaire;
  const org = contexte.membre.organizationId;

  const [
    { data: settings },
    { data: stationSettings },
    { data: plafonds },
    { data: invitations },
    { data: destinataires },
    { data: routage },
  ] = await Promise.all([
    supabase.from('organization_settings').select('*').eq('organization_id', org).maybeSingle(),
    supabase.from('station_settings').select('*'),
    supabase.from('void_role_limits').select('role, max_fcfa'),
    supabase
      .from('supervisor_invitations')
      .select('id, email, status, invited_at')
      .order('invited_at', { ascending: false }),
    supabase.from('notification_recipients').select('*').order('created_at'),
    supabase.from('alert_routing').select('alert_type, route'),
  ]);
  const statuts = await Promise.all(
    (invitations ?? []).map(async (i) => {
      const { data } = await supabase.rpc('supervisor_invitation_status', {
        p_invitation_id: i.id,
      });
      return [i.id, (data ?? i.status) as 'sent' | 'accepted' | 'revoked'] as const;
    }),
  );
  const statutDe = new Map(statuts);
  const plafond = (role: string) => plafonds?.find((p) => p.role === role)?.max_fcfa;
  const routes = TYPES_ALERTE_ROUTABLES.map((type) => ({
    type,
    route:
      routage?.find((r) => r.alert_type === type)?.route ??
      (IMMEDIAT_PAR_DEFAUT.has(type) ? 'immediate' : 'report'),
  }));
  const modeTest = process.env.NOTIFIER !== 'meta';

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage titre={t('nav.settings')} sousTitre={t('settings.subtitle')} />
      {!rw && (
        <p className="m-0 rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-texte-secondaire">
          {t('settings.readOnly')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          <Bloc titre={t('settings.thresholds')}>
            {settings && (
              <FormulaireSeuils
                rw={rw}
                valeurs={{
                  tankVariance: Number(settings.tank_variance_pct),
                  deliveryVariance: Number(settings.delivery_variance_pct),
                  cashTolerance: settings.cash_tolerance_fcfa,
                  depositHours: settings.deposit_missing_hours,
                  reportMode: settings.report_mode,
                  reportTime: settings.report_time.slice(0, 5),
                  smsFallback: settings.sms_fallback,
                }}
              />
            )}
            <div className="border-t border-bordure px-[18px] py-4">
              <h3 className="m-0 mb-3 text-[13px] font-semibold text-texte-secondaire">
                {t('settings.perStation')}
              </h3>
              <FormulaireSurcharge
                rw={rw}
                stations={contexte.stations.map((s) => ({
                  id: s.id,
                  name: s.name,
                  surcharge: stationSettings?.find((x) => x.station_id === s.id) ?? null,
                }))}
              />
            </div>
          </Bloc>
          <Bloc titre={t('settings.voidLimits')}>
            <FormulairePlafonds
              rw={rw}
              valeurs={{
                manager: plafond('manager') ?? 50000,
                shop_cashier: plafond('shop_cashier') ?? 25000,
                pump_attendant: plafond('pump_attendant') ?? 10000,
                mechanic: plafond('mechanic') ?? 10000,
              }}
            />
          </Bloc>
          <Bloc titre={t('settings.webAccess')} sousTitre={t('settings.supervisorsReadOnly')}>
            {(invitations ?? []).length === 0 && (
              <p className="m-0 px-[18px] py-4 text-[13px] text-texte-secondaire">
                {t('settings.noSupervisors')}
              </p>
            )}
            {(invitations ?? []).map((i) => (
              <LigneInvitation
                key={i.id}
                id={i.id}
                email={i.email}
                statut={statutDe.get(i.id) ?? i.status}
                rw={rw}
              />
            ))}
            {rw && <FormulaireInvitation />}
          </Bloc>
        </div>
        <div className="flex flex-col gap-4">
          <Bloc titre={t('settings.recipients')}>
            {rw ? (
              <>
                <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
                  <span>{t('settings.recipient')}</span>
                  <span className="text-center">{t('settings.eveningReport')}</span>
                  <span className="text-center">{t('settings.graveAlerts')}</span>
                  <span />
                </div>
                {(destinataires ?? []).length === 0 && (
                  <p className="m-0 px-[18px] py-4 text-[13px] text-danger">
                    {t('settings.noRecipients')}
                  </p>
                )}
                {(destinataires ?? []).map((d) => (
                  <LigneDestinataire
                    key={d.id}
                    id={d.id}
                    nom={d.name}
                    telephone={d.phone_e164}
                    rapport={d.receives_report}
                    alertes={d.receives_alerts}
                  />
                ))}
                <FormulaireDestinataire />
              </>
            ) : (
              <p className="m-0 px-[18px] py-4 text-[13px] text-texte-secondaire">
                {t('settings.recipientsHidden')}
              </p>
            )}
          </Bloc>
          <Bloc titre={t('settings.whenToNotify')}>
            <FormulaireRoutage rw={rw} routes={routes} />
            {settings && (
              <FormulaireMomentRapport
                rw={rw}
                reportMode={settings.report_mode}
                reportTime={settings.report_time.slice(0, 5)}
                smsFallback={settings.sms_fallback}
              />
            )}
          </Bloc>
          <section
            className={`flex items-start justify-between gap-4 rounded-xl border px-[18px] py-4 ${modeTest ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
          >
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold">
                {modeTest ? t('settings.testMode') : t('settings.liveMode')}
              </span>
              {modeTest && (
                <span className="text-[13px] text-texte-secondaire">
                  {t('settings.testModeText')}
                </span>
              )}
              <span className="text-[12px] text-texte-secondaire">{t('settings.connectHint')}</span>
            </div>
            {modeTest && (
              <Link
                href="/dev/messages"
                className="flex h-10 shrink-0 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-texte no-underline"
              >
                {t('settings.testModeLink')}
              </Link>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Bloc({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-bordure bg-surface">
      <div className="flex items-center justify-between border-b border-bordure px-[18px] py-4">
        <h2 className="m-0 text-[15px] font-semibold">{titre}</h2>
        {sousTitre && <span className="text-[13px] text-texte-secondaire">{sousTitre}</span>}
      </div>
      {children}
    </section>
  );
}
