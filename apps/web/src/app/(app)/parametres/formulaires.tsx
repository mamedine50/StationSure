'use client';

import { t } from '@stationsure/i18n';
import { useActionState, useState } from 'react';

import {
  ajouterDestinataire,
  enregistrerMomentRapport,
  enregistrerPlafonds,
  enregistrerRoutage,
  enregistrerSeuils,
  enregistrerSurchargeStation,
  inviterSuperviseur,
  mettreAJourDestinataire,
  retirerDestinataire,
  revoquerSuperviseur,
} from '@/actions/parametres';
import { BoutonPrincipal, ETAT_INITIAL, Message } from '@/components/ui/formulaire';
import type { TYPES_ALERTE_ROUTABLES } from '@/lib/validation';

const champ =
  'h-11 rounded-md border border-bordure bg-fond px-3 text-right font-mono text-[14px] text-texte focus:border-accent focus:outline-none disabled:opacity-60';
const bouton = 'h-11 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-60';

function LigneSeuil({
  label,
  unite,
  children,
}: {
  label: string;
  unite: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {children}
        <span className="w-10 text-[13px] text-texte-secondaire">{unite}</span>
      </span>
    </label>
  );
}

export function FormulaireSeuils({
  rw,
  valeurs,
}: {
  rw: boolean;
  valeurs: {
    tankVariance: number;
    deliveryVariance: number;
    cashTolerance: number;
    depositHours: number;
    reportMode: 'after_each_closing' | 'fixed_time';
    reportTime: string;
    smsFallback: boolean;
  };
}) {
  const [etat, action] = useActionState(enregistrerSeuils, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="reportMode" value={valeurs.reportMode} />
      <input type="hidden" name="reportTime" value={valeurs.reportTime} />
      {valeurs.smsFallback && <input type="hidden" name="smsFallback" value="on" />}
      <LigneSeuil label={t('settings.tankVariance')} unite={t('settings.percent')}>
        <input
          name="tankVariance"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue={valeurs.tankVariance}
          disabled={!rw}
          className={`${champ} w-24`}
        />
      </LigneSeuil>
      <LigneSeuil label={t('settings.deliveryVariance')} unite={t('settings.percent')}>
        <input
          name="deliveryVariance"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue={valeurs.deliveryVariance}
          disabled={!rw}
          className={`${champ} w-24`}
        />
      </LigneSeuil>
      <LigneSeuil label={t('settings.cashTolerance')} unite={t('common.currency')}>
        <input
          name="cashTolerance"
          type="number"
          step="1"
          min="0"
          defaultValue={valeurs.cashTolerance}
          disabled={!rw}
          className={`${champ} w-28`}
        />
      </LigneSeuil>
      <div
        className="flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 text-[14px]"
        title={t('settings.lockedHint')}
      >
        <span className="text-texte-secondaire">{t('settings.lockedLabel')}</span>
        <span className="rounded-pilule bg-surface-2 px-3 py-1 font-mono text-[13px]">
          {t('settings.lockedValue')}
        </span>
      </div>
      <LigneSeuil label={t('settings.depositMissingAfter')} unite={t('settings.hours')}>
        <input
          name="depositHours"
          type="number"
          step="1"
          min="1"
          max="168"
          defaultValue={valeurs.depositHours}
          disabled={!rw}
          className={`${champ} w-24`}
        />
      </LigneSeuil>
      {rw && (
        <div className="flex items-center gap-3 px-[18px] py-3">
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
          <Message etat={etat} />
        </div>
      )}
    </form>
  );
}

export function FormulaireSurcharge({
  rw,
  stations,
}: {
  rw: boolean;
  stations: {
    id: string;
    name: string;
    surcharge: {
      tank_variance_pct: number | null;
      delivery_variance_pct: number | null;
      cash_tolerance_fcfa: number | null;
      deposit_missing_hours: number | null;
    } | null;
  }[];
}) {
  const [etat, action] = useActionState(enregistrerSurchargeStation, ETAT_INITIAL);
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const station = stations.find((s) => s.id === stationId);
  const s = station?.surcharge;
  return (
    <form action={action} className="flex flex-col gap-3">
      <select
        name="stationId"
        value={stationId}
        onChange={(e) => setStationId(e.target.value)}
        className="h-11 rounded-md border border-bordure bg-fond px-3 text-[14px] text-texte"
      >
        {stations.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
            {x.surcharge ? ' *' : ''}
          </option>
        ))}
      </select>
      <div key={stationId} className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
          {t('settings.tankVariance')} ({t('settings.percent')})
          <input
            name="tankVariance"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={s?.tank_variance_pct ?? ''}
            placeholder={t('settings.inherit')}
            disabled={!rw}
            className={champ}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
          {t('settings.deliveryVariance')} ({t('settings.percent')})
          <input
            name="deliveryVariance"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={s?.delivery_variance_pct ?? ''}
            placeholder={t('settings.inherit')}
            disabled={!rw}
            className={champ}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
          {t('settings.cashTolerance')} ({t('common.currency')})
          <input
            name="cashTolerance"
            type="number"
            step="1"
            min="0"
            defaultValue={s?.cash_tolerance_fcfa ?? ''}
            placeholder={t('settings.inherit')}
            disabled={!rw}
            className={champ}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
          {t('settings.depositMissingAfter')} ({t('settings.hours')})
          <input
            name="depositHours"
            type="number"
            step="1"
            min="1"
            max="168"
            defaultValue={s?.deposit_missing_hours ?? ''}
            placeholder={t('settings.inherit')}
            disabled={!rw}
            className={champ}
          />
        </label>
      </div>
      <span className="text-[12px] text-texte-secondaire">{t('settings.inheritHint')}</span>
      {rw && (
        <div className="flex items-center gap-3">
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
          <Message etat={etat} />
        </div>
      )}
    </form>
  );
}

export function FormulairePlafonds({
  rw,
  valeurs,
}: {
  rw: boolean;
  valeurs: { manager: number; shop_cashier: number; pump_attendant: number; mechanic: number };
}) {
  const [etat, action] = useActionState(enregistrerPlafonds, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col">
      {(['manager', 'shop_cashier', 'pump_attendant', 'mechanic'] as const).map((role) => (
        <LigneSeuil key={role} label={t(`settings.roles.${role}`)} unite={t('common.currency')}>
          <input
            name={role}
            type="number"
            step="1"
            min="0"
            defaultValue={valeurs[role]}
            disabled={!rw}
            className={`${champ} w-32`}
          />
        </LigneSeuil>
      ))}
      {rw && (
        <div className="flex items-center gap-3 px-[18px] py-3">
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
          <Message etat={etat} />
        </div>
      )}
    </form>
  );
}

export function LigneInvitation({
  id,
  email,
  statut,
  rw,
}: {
  id: string;
  email: string;
  statut: 'sent' | 'accepted' | 'revoked';
  rw: boolean;
}) {
  const [etat, action] = useActionState(revoquerSuperviseur, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex items-center justify-between gap-3 border-b border-bordure px-[18px] py-3 text-[14px]"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col">
        <span className="font-semibold">{email}</span>
        <span className="text-[12px] text-texte-secondaire">
          {t('common.roles.supervisor')} · {t(`settings.status.${statut}`)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Message etat={etat} />
        {rw && statut !== 'revoked' && (
          <button className={`${bouton} border border-danger-bordure text-danger`}>
            {t('settings.revoke')}
          </button>
        )}
      </div>
    </form>
  );
}

export function FormulaireInvitation() {
  const [etat, action] = useActionState(inviterSuperviseur, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-2 px-[18px] py-4">
      <div className="flex items-center gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder={t('settings.emailToInvite')}
          aria-label={t('settings.emailToInvite')}
          className="h-11 grow rounded-md border border-bordure bg-fond px-3 text-[14px] text-texte"
        />
        <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('settings.invite')}</BoutonPrincipal>
      </div>
      <Message etat={etat} />
    </form>
  );
}

export function LigneDestinataire({
  id,
  nom,
  telephone,
  rapport,
  alertes,
}: {
  id: string;
  nom: string;
  telephone: string;
  rapport: boolean;
  alertes: boolean;
}) {
  const [etat, action] = useActionState(mettreAJourDestinataire, ETAT_INITIAL);
  const [etatRetrait, retirer] = useActionState(retirerDestinataire, ETAT_INITIAL);
  return (
    <div className="flex flex-col border-b border-bordure px-[18px] py-3">
      <form action={action} className="grid grid-cols-[1.6fr_1fr_1fr_auto] items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold">{nom}</span>
          <span className="font-mono text-[12px] text-texte-secondaire">{telephone}</span>
        </div>
        <label className="flex justify-center">
          <input
            name="rapport"
            type="checkbox"
            defaultChecked={rapport}
            className="h-5 w-5 accent-accent"
            aria-label={t('settings.eveningReport')}
          />
        </label>
        <label className="flex justify-center">
          <input
            name="alertes"
            type="checkbox"
            defaultChecked={alertes}
            className="h-5 w-5 accent-accent"
            aria-label={t('settings.graveAlerts')}
          />
        </label>
        <div className="flex gap-2">
          <button className={`${bouton} border border-bordure-forte text-texte`}>
            {t('common.save')}
          </button>
          <button
            formAction={retirer}
            className={`${bouton} border border-danger-bordure text-danger`}
          >
            {t('settings.remove')}
          </button>
        </div>
      </form>
      <Message etat={etat.erreur || etat.succes ? etat : etatRetrait} />
    </div>
  );
}

export function FormulaireDestinataire() {
  const [etat, action] = useActionState(ajouterDestinataire, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-2 px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="nom"
          required
          minLength={2}
          placeholder={t('settings.name')}
          aria-label={t('settings.name')}
          className="h-11 w-40 rounded-md border border-bordure bg-fond px-3 text-[14px] text-texte"
        />
        <input
          name="telephone"
          type="tel"
          required
          placeholder={t('settings.phoneHint')}
          aria-label={t('settings.phone')}
          className="h-11 w-52 rounded-md border border-bordure bg-fond px-3 font-mono text-[14px] text-texte"
        />
        <label className="flex items-center gap-1 text-[12px] text-texte-secondaire">
          <input name="rapport" type="checkbox" defaultChecked className="h-5 w-5 accent-accent" />
          {t('settings.eveningReport')}
        </label>
        <label className="flex items-center gap-1 text-[12px] text-texte-secondaire">
          <input name="alertes" type="checkbox" defaultChecked className="h-5 w-5 accent-accent" />
          {t('settings.graveAlerts')}
        </label>
        <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('settings.add')}</BoutonPrincipal>
      </div>
      <Message etat={etat} />
    </form>
  );
}

export function FormulaireRoutage({
  rw,
  routes,
}: {
  rw: boolean;
  routes: { type: (typeof TYPES_ALERTE_ROUTABLES)[number]; route: 'immediate' | 'report' }[];
}) {
  const [etat, action] = useActionState(enregistrerRoutage, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col">
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-b border-bordure px-[18px] py-[10px] text-[11px] tracking-wider text-texte-secondaire">
        <span />
        <span className="text-center">{t('settings.immediately')}</span>
        <span className="text-center">{t('settings.inReport')}</span>
      </div>
      {routes.map((r) => (
        <div
          key={r.type}
          className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 border-b border-bordure px-[18px] py-2 text-[14px]"
        >
          <span>{t(`alertTypes.${r.type}`)}</span>
          <label className="flex justify-center">
            <input
              type="radio"
              name={`route_${r.type}`}
              value="immediate"
              defaultChecked={r.route === 'immediate'}
              disabled={!rw}
              className="h-5 w-5 accent-accent"
            />
          </label>
          <label className="flex justify-center">
            <input
              type="radio"
              name={`route_${r.type}`}
              value="report"
              defaultChecked={r.route === 'report'}
              disabled={!rw}
              className="h-5 w-5 accent-accent"
            />
          </label>
        </div>
      ))}
      {rw && (
        <div className="flex items-center gap-3 px-[18px] py-3">
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
          <Message etat={etat} />
        </div>
      )}
    </form>
  );
}

/** Moment du rapport et SMS de secours : formulaire autonome (organization_settings). */
export function FormulaireMomentRapport({
  rw,
  reportMode,
  reportTime,
  smsFallback,
}: {
  rw: boolean;
  reportMode: 'after_each_closing' | 'fixed_time';
  reportTime: string;
  smsFallback: boolean;
}) {
  const [etat, action] = useActionState(enregistrerMomentRapport, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-t border-bordure px-[18px] py-4 text-[14px]"
    >
      <span className="text-[13px] font-semibold text-texte-secondaire">
        {t('settings.reportTiming')}
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="reportMode"
            value="after_each_closing"
            defaultChecked={reportMode === 'after_each_closing'}
            disabled={!rw}
            className="h-5 w-5 accent-accent"
          />
          {t('settings.afterEachClosing')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="reportMode"
            value="fixed_time"
            defaultChecked={reportMode === 'fixed_time'}
            disabled={!rw}
            className="h-5 w-5 accent-accent"
          />
          {t('settings.fixedTime')}
          <input
            type="time"
            name="reportTime"
            defaultValue={reportTime}
            disabled={!rw}
            className="h-10 rounded-md border border-bordure bg-fond px-2 font-mono text-[14px] text-texte"
          />
          <span className="text-[12px] text-texte-secondaire">{t('settings.timezone')}</span>
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="smsFallback"
          defaultChecked={smsFallback}
          disabled={!rw}
          className="h-5 w-5 accent-accent"
        />
        {t('settings.smsFallback')}
      </label>
      {rw && (
        <div className="flex items-center gap-3">
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
          <Message etat={etat} />
        </div>
      )}
    </form>
  );
}
