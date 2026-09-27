'use client';

import {
  clToLitres,
  evaluerSaisieBaremage,
  formatFCFA,
  formatLitres,
  type PointBaremageMm,
} from '@stationsure/core';
import { t } from '@stationsure/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';

import {
  changerActivationEquipement,
  creerCuve,
  creerPistolet,
  creerPompe,
  modifierCuve,
  publierBaremage,
  publierPrixMultiples,
  renommerPistolet,
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

const litresEntiers = (cl: number) => formatLitres(cl).replace(/,\d\d$/, '');
const boutonSecondaire =
  'flex h-11 items-center rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte no-underline';
const boutonPrincipal =
  'flex h-11 items-center rounded-lg bg-accent px-4 text-[14px] font-semibold text-accent-texte no-underline';

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

/** Un seul panneau ouvert à la fois dans une étape. */
function usePanneauUnique() {
  const [ouvert, setOuvert] = useState<string | null>(null);
  return {
    estOuvert: (id: string) => ouvert === id,
    ouvrir: (id: string) => setOuvert(id),
    fermer: () => setOuvert(null),
  };
}

export interface CuveEtape {
  id: string;
  label: string;
  produit: 'super' | 'gasoil';
  capaciteCl: number;
  seuilPct: number;
  active: boolean;
  points: number;
  pistolets: number;
}

// ---------------------------------------------------------------- Étape 1 · Cuves
export function EtapeCuves({
  stationId,
  cuves,
  rw,
  suivant,
}: {
  stationId: string;
  cuves: CuveEtape[];
  rw: boolean;
  suivant: string;
}) {
  const panneau = usePanneauUnique();
  return (
    <div className="flex flex-col gap-3">
      {cuves.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">
              {c.label} · {t(`fuel.${c.produit}`)}
              {!c.active && (
                <span className="ml-2 text-[12px] text-danger">({t('common.inactive')})</span>
              )}
            </span>
            {rw && !panneau.estOuvert(c.id) && (
              <button
                type="button"
                onClick={() => panneau.ouvrir(c.id)}
                className="text-[13px] text-accent"
              >
                {t('fuelSetup.editTank')}
              </button>
            )}
          </div>
          <span className="text-[13px] text-texte-secondaire">
            {t('fuelSetup.tankLine', {
              litres: litresEntiers(c.capaciteCl),
              calibration:
                c.points >= 2
                  ? t('fuelSetup.calibrationPoints', { points: c.points })
                  : t('fuelSetup.noCalibration'),
              nozzles: t('fuelSetup.nozzlesCount', { count: c.pistolets }),
            })}
          </span>
          {rw && panneau.estOuvert(c.id) && (
            <FormulaireModifierCuve cuve={c} fermer={panneau.fermer} />
          )}
        </div>
      ))}
      {rw && !panneau.estOuvert('ajout') && (
        <button
          type="button"
          onClick={() => panneau.ouvrir('ajout')}
          className="h-11 self-start rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte"
        >
          + {t('fuelSetup.addTank')}
        </button>
      )}
      {rw && panneau.estOuvert('ajout') && (
        <FormulaireCuve stationId={stationId} fermer={panneau.fermer} />
      )}
      <div className="mt-2 flex justify-end">
        <Link href={suivant} className={boutonPrincipal}>
          {t('fuelSetup.saveAndNext', { n: 2 })}
        </Link>
      </div>
    </div>
  );
}

function FormulaireCuve({ stationId, fermer }: { stationId: string; fermer: () => void }) {
  const [etat, action] = useActionState(creerCuve, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4"
    >
      <input type="hidden" name="stationId" value={stationId} />
      <div className="grid grid-cols-3 gap-3">
        <Champ label={t('fuelConfig.tankLabel')} name="label" required maxLength={40} autoFocus />
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
      </div>
      <Message etat={etat} />
      <div className="flex gap-2">
        <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
        <BoutonSecondaire onClick={fermer} className="h-11 px-4 text-[14px]">
          {t('common.close')}
        </BoutonSecondaire>
      </div>
    </form>
  );
}

function FormulaireModifierCuve({ cuve, fermer }: { cuve: CuveEtape; fermer: () => void }) {
  const [etat, action] = useActionState(modifierCuve, ETAT_INITIAL);
  const [, desactiver] = useActionState(changerActivationEquipement, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-md border border-bordure bg-surface-2 p-3"
    >
      <input type="hidden" name="cuveId" value={cuve.id} />
      <div className="grid grid-cols-3 gap-3">
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
          defaultValue={clToLitres(cuve.capaciteCl)}
          min={1}
          step={1}
          required
        />
        <Champ
          label={t('fuelSetup.reorderThreshold')}
          name="seuilCommandePct"
          type="number"
          defaultValue={cuve.seuilPct}
          min={0}
          max={100}
          step={1}
        />
      </div>
      <Message etat={etat} />
      <div className="flex flex-wrap gap-2">
        <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
        <BoutonSecondaire onClick={fermer} className="h-11 px-4 text-[14px]">
          {t('common.close')}
        </BoutonSecondaire>
        <button
          type="submit"
          formAction={(fd) => {
            fd.set('table', 'tanks');
            fd.set('id', cuve.id);
            fd.set('actif', cuve.active ? 'false' : 'true');
            desactiver(fd);
          }}
          className={`h-11 px-3 text-[13px] underline ${cuve.active ? 'text-danger' : 'text-succes'}`}
        >
          {cuve.active ? t('fuelConfig.deactivate') : t('fuelConfig.reactivate')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Étape 2 · Barémage (écran 19)
export function FormulaireBaremage({
  cuve,
  organisationId,
  stationId,
  version,
  precedent,
  plusTard,
  suite,
  rw,
}: {
  cuve: { id: string; label: string; produit: 'super' | 'gasoil'; capaciteCl: number };
  organisationId: string;
  stationId: string;
  version: { numero: number; points: number; date: string; certificat: boolean } | null;
  precedent: string;
  plusTard: string;
  suite: string;
  rw: boolean;
}) {
  const [etat, action] = useActionState(publierBaremage, ETAT_INITIAL);
  const [texte, setTexte] = useState('');
  const [certificatPath, setCertificatPath] = useState('');
  const [uploadErreur, setUploadErreur] = useState<string | null>(null);
  const [uploadEnCours, setUploadEnCours] = useState(false);
  const evaluation = useMemo(
    () => evaluerSaisieBaremage(texte, cuve.capaciteCl),
    [texte, cuve.capaciteCl],
  );
  const points: PointBaremageMm[] = evaluation.points;
  const erreur = evaluation.erreurs[0] ?? null;
  const courbeVisible = points.length >= 2 && !evaluation.erreurs.includes('VOLUME_NON_CROISSANT');

  const importerCsv = async (fichier: File) => setTexte(await fichier.text());
  const deposerCertificat = async (fichier: File) => {
    setUploadErreur(null);
    setUploadEnCours(true);
    const chemin = `${organisationId}/${stationId}/calibration/${cuve.id}-${Date.now()}.pdf`;
    const { error } = await creerClientNavigateur()
      .storage.from('evidence')
      .upload(chemin, fichier, { contentType: 'application/pdf' });
    setUploadEnCours(false);
    if (error) setUploadErreur(error.message);
    else setCertificatPath(chemin);
  };

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-bordure bg-surface p-[18px]"
    >
      <input type="hidden" name="cuveId" value={cuve.id} />
      <input type="hidden" name="points" value={JSON.stringify(points)} />
      <input type="hidden" name="certificatPath" value={certificatPath} />
      <input type="hidden" name="suite" value={suite} />
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[17px] font-semibold">
          {t('fuelSetup.calibrationTitle', { tank: `${cuve.label} ${t(`fuel.${cuve.produit}`)}` })}
        </h2>
        <p className="m-0 text-[13px] text-texte-secondaire">{t('fuelSetup.calibrationIntro')}</p>
        {version && (
          <span className="text-[12px] text-texte-secondaire">
            {t('fuelConfig.version', { n: version.numero })} · {version.points} pts ·{' '}
            {t('fuelConfig.effectiveFrom', { date: version.date })} ·{' '}
            {version.certificat
              ? t('fuelConfig.certificateAttached')
              : t('fuelConfig.noCertificate')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={`points-${cuve.id}`} className="text-[14px] font-semibold">
            {t('fuelSetup.pointsLabel')}
          </label>
          <span className="text-[13px] text-texte-secondaire">
            {t('fuelSetup.example')} <code>0;0</code> {t('fuelSetup.then')} <code>300;1400</code>{' '}
            {t('fuelSetup.then')} <code>600;3900</code>…
          </span>
          <textarea
            id={`points-${cuve.id}`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={11}
            spellCheck={false}
            disabled={!rw}
            aria-invalid={erreur !== null}
            className="rounded-md border border-bordure bg-fond px-3 py-2 font-mono text-[14px] text-texte focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <label className={boutonSecondaire}>
              {t('fuelSetup.importCsv')}
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void importerCsv(e.target.files[0])}
              />
            </label>
            <label className={boutonSecondaire}>
              {t('fuelSetup.attachCertificate')}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void deposerCertificat(e.target.files[0])}
              />
            </label>
          </div>
          {uploadEnCours && (
            <span className="text-[12px] text-texte-secondaire">{t('common.loading')}</span>
          )}
          {certificatPath && (
            <span className="text-[12px] text-succes">✓ {t('fuelConfig.certificateAttached')}</span>
          )}
          {uploadErreur && <span className="text-[12px] text-danger">{uploadErreur}</span>}
          <p
            role="status"
            className={`m-0 text-[13px] ${erreur ? 'text-texte-secondaire' : 'text-succes'}`}
          >
            {erreur
              ? t(`fuelSetup.input.${erreur}`)
              : evaluation.lignesRejetees.length > 0
                ? t('fuelSetup.input.LIGNES_REJETEES', {
                    count: evaluation.lignesRejetees.length,
                    lines: evaluation.lignesRejetees.map((l) => l.ligne).join(', '),
                  })
                : `✓ ${t('fuelSetup.input.ok', { points: points.length })}`}
          </p>
          {evaluation.avertissements.map((a) => (
            <p key={a} role="alert" className="m-0 text-[13px] text-accent">
              ⚠ {t(`fuelSetup.input.${a}`)}
            </p>
          ))}
        </div>
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-bordure-forte p-4">
          {courbeVisible ? (
            <CourbeBaremage points={points} />
          ) : (
            <span className="text-center text-[13px] text-texte-secondaire">
              {t('fuelSetup.curvePlaceholder')}
            </span>
          )}
        </div>
      </div>
      <Message etat={etat} />
      <div className="flex items-center justify-between gap-3 border-t border-bordure pt-4">
        <Link href={precedent} className="text-[14px] text-accent">
          {t('fuelSetup.backToStep', { n: 1, name: t('fuelSetup.steps.tanks') })}
        </Link>
        <div className="flex gap-2">
          <Link href={plusTard} className={boutonSecondaire}>
            {t('fuelSetup.later')}
          </Link>
          <button
            type="submit"
            disabled={!rw || !evaluation.valide}
            className="h-11 rounded-lg bg-accent px-4 text-[14px] font-semibold text-accent-texte disabled:opacity-40"
          >
            {t('fuelSetup.publishAndNext')}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Étape 3 · Pompes et pistolets
export interface PompeEtape {
  id: string;
  label: string;
  active: boolean;
  pistolets: { id: string; label: string; tankId: string; active: boolean }[];
}

function lettreSuivante(n: number): string {
  return String.fromCharCode(65 + (n % 26));
}

export function EtapePompes({
  stationId,
  pompes,
  cuves,
  rw,
  suivant,
  precedent,
}: {
  stationId: string;
  pompes: PompeEtape[];
  cuves: { id: string; label: string }[];
  rw: boolean;
  suivant: string;
  precedent: string;
}) {
  const panneau = usePanneauUnique();
  const cuveLabel = (id: string) => cuves.find((c) => c.id === id)?.label ?? '?';
  return (
    <div className="flex flex-col gap-3">
      {pompes.length === 0 && (
        <p className="m-0 text-[13px] text-texte-secondaire">{t('fuelSetup.noPump')}</p>
      )}
      {pompes.map((p) => (
        <div
          key={p.id}
          className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">
              {p.label}
              {!p.active && (
                <span className="ml-2 text-[12px] text-danger">({t('common.inactive')})</span>
              )}
            </span>
            {rw && p.active && !panneau.estOuvert(`pistolet-${p.id}`) && (
              <button
                type="button"
                onClick={() => panneau.ouvrir(`pistolet-${p.id}`)}
                className="text-[13px] text-accent"
              >
                + {t('fuelSetup.addNozzle')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.pistolets.map((n) => (
              <Pistolet
                key={n.id}
                pistolet={n}
                cuve={cuveLabel(n.tankId)}
                rw={rw}
                ouvert={panneau.estOuvert(`renommer-${n.id}`)}
                ouvrir={() => panneau.ouvrir(`renommer-${n.id}`)}
                fermer={panneau.fermer}
              />
            ))}
          </div>
          {rw && panneau.estOuvert(`pistolet-${p.id}`) && (
            <FormulairePistolet
              stationId={stationId}
              pompe={p}
              cuves={cuves}
              fermer={panneau.fermer}
            />
          )}
        </div>
      ))}
      {rw && !panneau.estOuvert('pompe') && (
        <button
          type="button"
          onClick={() => panneau.ouvrir('pompe')}
          className="h-11 self-start rounded-lg border border-bordure-forte px-4 text-[14px] font-semibold text-texte"
        >
          + {t('fuelSetup.addPump')}
        </button>
      )}
      {rw && panneau.estOuvert('pompe') && (
        <FormulairePompe
          stationId={stationId}
          suggestion={`P${pompes.length + 1}`}
          fermer={panneau.fermer}
        />
      )}
      <div className="mt-2 flex items-center justify-between">
        <Link href={precedent} className="text-[14px] text-accent">
          {t('fuelSetup.backToStep', { n: 2, name: t('fuelSetup.steps.calibration') })}
        </Link>
        <Link href={suivant} className={boutonPrincipal}>
          {t('fuelSetup.saveAndNext', { n: 4 })}
        </Link>
      </div>
    </div>
  );
}

function Pistolet({
  pistolet,
  cuve,
  rw,
  ouvert,
  ouvrir,
  fermer,
}: {
  pistolet: { id: string; label: string; active: boolean };
  cuve: string;
  rw: boolean;
  ouvert: boolean;
  ouvrir: () => void;
  fermer: () => void;
}) {
  const [etat, action] = useActionState(renommerPistolet, ETAT_INITIAL);
  const [, activation] = useActionState(changerActivationEquipement, ETAT_INITIAL);
  if (ouvert) {
    return (
      <form
        action={action}
        className="flex items-center gap-2 rounded-pilule border border-accent px-3 py-1"
      >
        <input type="hidden" name="pistoletId" value={pistolet.id} />
        <input
          name="label"
          defaultValue={pistolet.label}
          maxLength={40}
          required
          aria-label={t('fuelSetup.nozzleLabel')}
          className="h-8 w-24 rounded-sm border border-bordure bg-fond px-2 font-mono text-[13px] text-texte"
        />
        <button className="text-[12px] font-semibold text-accent">{t('fuelSetup.rename')}</button>
        <button type="button" onClick={fermer} className="text-[12px] text-texte-secondaire">
          {t('common.cancel')}
        </button>
        <Message etat={etat} />
      </form>
    );
  }
  return (
    <span
      className={`flex items-center gap-2 rounded-pilule border border-bordure px-3 py-1 text-[13px] ${pistolet.active ? '' : 'text-texte-secondaire line-through'}`}
    >
      <span className="font-mono">{pistolet.label}</span> → {cuve}
      {rw && (
        <>
          <button type="button" onClick={ouvrir} className="text-[11px] text-accent underline">
            {t('fuelSetup.rename')}
          </button>
          <form
            action={(fd) => {
              fd.set('table', 'nozzles');
              fd.set('id', pistolet.id);
              fd.set('actif', pistolet.active ? 'false' : 'true');
              activation(fd);
            }}
            className="inline"
          >
            <button
              className={`text-[11px] underline ${pistolet.active ? 'text-danger' : 'text-succes'}`}
            >
              {pistolet.active ? t('fuelConfig.deactivate') : t('fuelConfig.reactivate')}
            </button>
          </form>
        </>
      )}
    </span>
  );
}

function FormulairePompe({
  stationId,
  suggestion,
  fermer,
}: {
  stationId: string;
  suggestion: string;
  fermer: () => void;
}) {
  const [etat, action] = useActionState(creerPompe, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-accent bg-surface p-4"
    >
      <input type="hidden" name="stationId" value={stationId} />
      <Champ
        label={`${t('fuelSetup.pumpLabel')} (${t('fuelSetup.suggested')})`}
        name="label"
        defaultValue={suggestion}
        required
        maxLength={40}
        className="h-11 w-40 font-mono"
        autoFocus
      />
      <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
      <BoutonSecondaire onClick={fermer} className="h-11 px-4 text-[14px]">
        {t('common.close')}
      </BoutonSecondaire>
      <Message etat={etat} />
    </form>
  );
}

function FormulairePistolet({
  stationId,
  pompe,
  cuves,
  fermer,
}: {
  stationId: string;
  pompe: PompeEtape;
  cuves: { id: string; label: string }[];
  fermer: () => void;
}) {
  const [etat, action] = useActionState(creerPistolet, ETAT_INITIAL);
  const suggestion = `${pompe.label}-${lettreSuivante(pompe.pistolets.length)}`;
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-md border border-bordure bg-surface-2 p-3"
    >
      <input type="hidden" name="stationId" value={stationId} />
      <input type="hidden" name="pompeId" value={pompe.id} />
      <Champ
        label={`${t('fuelSetup.nozzleLabel')} (${t('fuelSetup.suggested')})`}
        name="label"
        defaultValue={suggestion}
        required
        maxLength={40}
        className="h-11 w-32 font-mono"
        autoFocus
      />
      <Selecteur label={t('fuelSetup.linkedTank')} name="cuveId" className="h-11">
        {cuves.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Selecteur>
      <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
      <BoutonSecondaire onClick={fermer} className="h-11 px-4 text-[14px]">
        {t('common.close')}
      </BoutonSecondaire>
      <Message etat={etat} />
    </form>
  );
}

// ---------------------------------------------------------------- Étape 4 · Prix
export function EtapePrix({
  stationId,
  produits,
  prix,
  rw,
  precedent,
  suite,
}: {
  stationId: string;
  produits: ('super' | 'gasoil')[];
  prix: { produit: 'super' | 'gasoil'; valeur: number; depuis: string }[];
  rw: boolean;
  precedent: string;
  suite: string;
}) {
  const [etat, action] = useActionState(publierPrixMultiples, ETAT_INITIAL);
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-bordure bg-surface p-[18px]"
    >
      <input type="hidden" name="stationId" value={stationId} />
      <input type="hidden" name="suite" value={suite} />
      <h2 className="m-0 text-[17px] font-semibold">{t('fuelSetup.pricesTitle')}</h2>
      <div className="grid grid-cols-2 gap-4">
        {produits.map((code) => {
          const actuel = prix.find((p) => p.produit === code);
          return (
            <div key={code} className="flex flex-col gap-1">
              <Champ
                label={t('fuelSetup.priceOf', { product: t(`fuel.${code}`) })}
                name={code}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                defaultValue={actuel?.valeur ?? ''}
                required={!actuel}
                disabled={!rw}
                className="font-mono"
              />
              <span className="text-[12px] text-texte-secondaire">
                {actuel
                  ? t('fuelSetup.currentPrice', {
                      price: formatFCFA(actuel.valeur),
                      date: actuel.depuis,
                    })
                  : t('fuelSetup.noPrice')}
              </span>
            </div>
          );
        })}
      </div>
      <Message etat={etat} />
      <div className="flex items-center justify-between gap-3 border-t border-bordure pt-4">
        <Link href={precedent} className="text-[14px] text-accent">
          {t('fuelSetup.backToStep', { n: 3, name: t('fuelSetup.steps.nozzles') })}
        </Link>
        {rw && (
          <BoutonPrincipal className="h-11 px-4 text-[14px]">
            {t('fuelSetup.publishPrices')}
          </BoutonPrincipal>
        )}
      </div>
    </form>
  );
}
