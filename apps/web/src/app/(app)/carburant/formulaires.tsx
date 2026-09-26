'use client';

import {
  commenceAZero,
  lireBaremageCsv,
  type PointBaremageMm,
  validerBaremage,
} from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';

import {
  changerActivationEquipement,
  creerCuve,
  creerPistolet,
  creerPompe,
  modifierCuve,
  publierBaremage,
  publierPrix,
} from '@/actions/carburant';
import {
  BoutonPrincipal,
  BoutonSecondaire,
  Champ,
  ETAT_INITIAL,
  Message,
  Selecteur,
} from '@/components/ui/formulaire';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { PRODUITS } from '@/lib/validation';

import { CourbeBaremage } from './courbe-baremage';

export function SelecteurStation({
  stations,
  stationId,
}: {
  stations: { id: string; name: string }[];
  stationId: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] text-texte-secondaire">
      {t('fuelConfig.station')}
      <select
        value={stationId}
        onChange={(e) => router.push(`/carburant?station=${e.target.value}`)}
        className="h-10 rounded-md border border-bordure bg-surface px-3 text-[14px] text-texte"
      >
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Repliable({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="h-10 rounded-sm border border-bordure-forte px-3 text-[13px] font-semibold text-texte"
      >
        {libelle}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-bordure bg-surface-2 p-3">
      {children}
      <BoutonSecondaire onClick={() => setOuvert(false)} className="h-9 self-end px-3 text-[13px]">
        {t('common.close')}
      </BoutonSecondaire>
    </div>
  );
}

export function FormulaireCuve({ stationId }: { stationId: string }) {
  const [etat, action] = useActionState(creerCuve, ETAT_INITIAL);
  return (
    <Repliable libelle={`+ ${t('fuelConfig.addTank')}`}>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="stationId" value={stationId} />
        <Champ label={t('fuelConfig.tankLabel')} name="label" required maxLength={40} />
        <Selecteur label={t('fuelConfig.product')} name="produit">
          {PRODUITS.map((p) => (
            <option key={p} value={p}>
              {t(`fuel.${p}`)}
            </option>
          ))}
        </Selecteur>
        <Champ
          label={t('fuelConfig.capacityL')}
          name="capaciteLitres"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
        />
        <Message etat={etat} />
        <BoutonPrincipal className="h-10 self-start px-3 text-[13px]">
          {t('common.save')}
        </BoutonPrincipal>
      </form>
    </Repliable>
  );
}

export function FormulaireModifierCuve({
  cuve,
}: {
  cuve: { id: string; label: string; capaciteLitres: number };
}) {
  const [etat, action] = useActionState(modifierCuve, ETAT_INITIAL);
  return (
    <div className="mt-1">
      <Repliable libelle={t('fuelConfig.editTank')}>
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="cuveId" value={cuve.id} />
          <Champ
            label={t('fuelConfig.tankLabel')}
            name="label"
            defaultValue={cuve.label}
            required
            maxLength={40}
          />
          <Champ
            label={t('fuelConfig.capacityL')}
            name="capaciteLitres"
            type="number"
            defaultValue={cuve.capaciteLitres}
            min={1}
            step={1}
            required
          />
          <Message etat={etat} />
          <BoutonPrincipal className="h-10 self-start px-3 text-[13px]">
            {t('common.save')}
          </BoutonPrincipal>
        </form>
      </Repliable>
    </div>
  );
}

export function FormulaireBaremage({
  cuveId,
  organisationId,
  stationId,
}: {
  cuveId: string;
  organisationId: string;
  stationId: string;
}) {
  const [etat, action] = useActionState(publierBaremage, ETAT_INITIAL);
  const [texte, setTexte] = useState('');
  const [lignesRejetees, setLignesRejetees] = useState<number[]>([]);
  const [certificatPath, setCertificatPath] = useState('');
  const [uploadErreur, setUploadErreur] = useState<string | null>(null);
  const [uploadEnCours, setUploadEnCours] = useState(false);

  const points: PointBaremageMm[] = useMemo(() => {
    const r = lireBaremageCsv(texte);
    return r.points;
  }, [texte]);
  const problemes = useMemo(() => (texte.trim() ? validerBaremage(points) : []), [points, texte]);

  const importerCsv = async (fichier: File) => {
    const contenu = await fichier.text();
    const r = lireBaremageCsv(contenu);
    setLignesRejetees(r.lignesRejetees.map((l) => l.ligne));
    setTexte(
      r.points
        .map((p) => `${p.hauteurMm};${(p.volumeCl / 100).toFixed(2).replace(/\.?0+$/, '')}`)
        .join('\n'),
    );
  };

  const deposerCertificat = async (fichier: File) => {
    setUploadErreur(null);
    setUploadEnCours(true);
    const chemin = `${organisationId}/${stationId}/calibration/${cuveId}-${Date.now()}.pdf`;
    const { error } = await creerClientNavigateur()
      .storage.from('evidence')
      .upload(chemin, fichier, { contentType: 'application/pdf' });
    setUploadEnCours(false);
    if (error) {
      setUploadErreur(error.message);
      return;
    }
    setCertificatPath(chemin);
  };

  return (
    <Repliable libelle={t('fuelConfig.publishCalibration')}>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="cuveId" value={cuveId} />
        <input type="hidden" name="points" value={JSON.stringify(points)} />
        <input type="hidden" name="certificatPath" value={certificatPath} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
            <span>{t('fuelConfig.pointsLabel')}</span>
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={8}
              spellCheck={false}
              className="rounded-md border border-bordure bg-surface px-3 py-2 font-mono text-[13px] text-texte"
              placeholder={'0;0\n300;2400\n600;6800'}
            />
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
              <span>{t('fuelConfig.importCsv')}</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => e.target.files?.[0] && void importerCsv(e.target.files[0])}
                className="text-[13px]"
              />
              <span className="text-[11px]">{t('fuelConfig.csvHint')}</span>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
              <span>{t('fuelConfig.certificate')}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => e.target.files?.[0] && void deposerCertificat(e.target.files[0])}
                className="text-[13px]"
              />
              {uploadEnCours && <span className="text-[11px]">{t('common.loading')}</span>}
              {certificatPath && (
                <span className="text-[11px] text-succes">
                  ✓ {t('fuelConfig.certificateAttached')}
                </span>
              )}
              {uploadErreur && <span className="text-[11px] text-danger">{uploadErreur}</span>}
            </label>
            <Champ label="Note" name="note" maxLength={200} />
            <CourbeBaremage points={points} />
          </div>
        </div>
        {lignesRejetees.length > 0 && (
          <span className="text-[12px] text-danger">
            {t('fuelConfig.errors.LIGNES_REJETEES', {
              count: lignesRejetees.length,
              lines: lignesRejetees.join(', '),
            })}
          </span>
        )}
        {problemes.map((p, i) => (
          <span key={i} className="text-[12px] text-danger">
            {t(`fuelConfig.errors.${p.code}`)}
            {p.index !== undefined ? ` (point ${p.index + 1})` : ''}
          </span>
        ))}
        {texte.trim() && problemes.length === 0 && (
          <span className="text-[12px] text-succes">
            ✓ {t('fuelConfig.curveOk', { points: points.length })}
            {!commenceAZero(points) ? ` · ${t('fuelConfig.zeroHint')}` : ''}
          </span>
        )}
        <Message etat={etat} />
        <BoutonPrincipal className="h-10 self-start px-3 text-[13px]">
          {t('fuelConfig.publishCalibration')}
        </BoutonPrincipal>
      </form>
    </Repliable>
  );
}

export function FormulairePompe({ stationId }: { stationId: string }) {
  const [etat, action] = useActionState(creerPompe, ETAT_INITIAL);
  return (
    <Repliable libelle={`+ ${t('fuelConfig.addPump')}`}>
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="stationId" value={stationId} />
        <Champ
          label={t('fuelConfig.pumpLabel')}
          name="label"
          required
          maxLength={40}
          className="h-10"
        />
        <BoutonPrincipal className="h-10 px-3 text-[13px]">{t('common.save')}</BoutonPrincipal>
        <Message etat={etat} />
      </form>
    </Repliable>
  );
}

export function FormulairePistolet({
  stationId,
  pompeId,
  cuves,
}: {
  stationId: string;
  pompeId: string;
  cuves: { id: string; label: string }[];
}) {
  const [etat, action] = useActionState(creerPistolet, ETAT_INITIAL);
  return (
    <Repliable libelle={`+ ${t('fuelConfig.addNozzle')}`}>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="stationId" value={stationId} />
        <input type="hidden" name="pompeId" value={pompeId} />
        <Champ
          label={t('fuelConfig.nozzleLabel')}
          name="label"
          required
          maxLength={40}
          className="h-10 w-28"
        />
        <Selecteur label={t('fuelConfig.linkedTank')} name="cuveId" className="h-10">
          {cuves.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Selecteur>
        <BoutonPrincipal className="h-10 px-3 text-[13px]">{t('common.save')}</BoutonPrincipal>
        <Message etat={etat} />
      </form>
    </Repliable>
  );
}

export function BoutonActivationEquipement({
  table,
  id,
  actif,
}: {
  table: 'nozzles' | 'pumps' | 'tanks';
  id: string;
  actif: boolean;
}) {
  const [, action] = useActionState(changerActivationEquipement, ETAT_INITIAL);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={actif ? 'false' : 'true'} />
      <button
        type="submit"
        className={`text-[11px] underline ${actif ? 'text-danger' : 'text-succes'}`}
      >
        {actif ? t('fuelConfig.deactivate') : t('fuelConfig.reactivate')}
      </button>
    </form>
  );
}

export function FormulairePrix({ stationId }: { stationId: string }) {
  const [etat, action] = useActionState(publierPrix, ETAT_INITIAL);
  return (
    <Repliable libelle={t('fuelConfig.publishPrice')}>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="stationId" value={stationId} />
        <Selecteur label={t('fuelConfig.product')} name="produit">
          {PRODUITS.map((p) => (
            <option key={p} value={p}>
              {t(`fuel.${p}`)}
            </option>
          ))}
        </Selecteur>
        <Champ
          label={t('fuelConfig.newPrice')}
          name="prix"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          className="font-mono"
        />
        <Champ label={t('fuelConfig.effectiveAt')} name="effectiveAt" type="datetime-local" />
        <Message etat={etat} />
        <BoutonPrincipal className="h-10 self-start px-3 text-[13px]">
          {t('fuelConfig.publishNow')}
        </BoutonPrincipal>
      </form>
    </Repliable>
  );
}
