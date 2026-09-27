'use client';

import {
  choisirVueCuves,
  formatAutonomie,
  formatLitres,
  formatPourcent,
  type VueCuves,
} from '@stationsure/core';
import { t } from '@stationsure/i18n';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { CuveSimple } from './cuve-simple';
import type { NiveauCuve } from './niveau';

const Cuve3D = dynamic(() => import('./cuve-3d'), {
  ssr: false,
  loading: () => <div className="h-[260px]" />,
});
const CLE_PREFERENCE = 'stationsure:vue-cuves';

function webglDisponible(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function lirePreference(): VueCuves | null {
  try {
    const v = localStorage.getItem(CLE_PREFERENCE);
    return v === '3d' || v === 'simple' ? v : null;
  } catch {
    return null;
  }
}

const litresEntiers = (cl: number) => formatLitres(cl).replace(/,\d\d$/, '');

/** Écran 20 : une carte par cuve, vue 3D ou vue simple (choix mémorisé, automatique sans WebGL / animations réduites). */
export function CuvesStation({
  niveaux,
  titre,
  compact = false,
}: {
  niveaux: NiveauCuve[];
  titre?: string;
  compact?: boolean;
}) {
  const [vue, setVue] = useState<VueCuves>('simple');
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const dispo = webglDisponible();
    const reduire = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capacités du navigateur connues après montage seulement
    setWebgl(dispo);
    setVue(
      choisirVueCuves({
        preference: lirePreference(),
        webglDisponible: dispo,
        reduireAnimations: reduire,
      }),
    );
  }, []);
  const choisir = (v: VueCuves) => {
    setVue(v);
    try {
      localStorage.setItem(CLE_PREFERENCE, v);
    } catch {
      /* stockage indisponible : préférence non mémorisée */
    }
  };
  const derniere = niveaux
    .map((n) => n.mesureA)
    .filter(Boolean)
    .sort()
    .at(-1);
  const heure = derniere
    ? new Intl.DateTimeFormat('fr-SN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Dakar',
      }).format(new Date(derniere))
    : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          {titre && <h2 className="m-0 text-[15px] font-semibold">{titre}</h2>}
          <span className="text-[12px] text-texte-secondaire">
            {heure ? t('tanks3d.subtitle', { time: heure }) : t('tanks3d.subtitleNoGauge')}
          </span>
        </div>
        <div
          className="flex rounded-lg border border-bordure bg-surface p-1"
          role="group"
          aria-label="Vue"
        >
          <button
            type="button"
            onClick={() => choisir('3d')}
            disabled={!webgl}
            className={`h-9 rounded-md px-3 text-[13px] disabled:opacity-40 ${vue === '3d' ? 'bg-accent font-semibold text-accent-texte' : 'text-texte-secondaire'}`}
          >
            {t('tanks3d.view3d')}
          </button>
          <button
            type="button"
            onClick={() => choisir('simple')}
            className={`h-9 rounded-md px-3 text-[13px] ${vue === 'simple' ? 'bg-accent font-semibold text-accent-texte' : 'text-texte-secondaire'}`}
          >
            {t('tanks3d.viewSimple')}
          </button>
        </div>
      </div>
      {niveaux.length === 0 && (
        <p className="m-0 text-[13px] text-texte-secondaire">{t('tanks3d.noTank')}</p>
      )}
      <div className={`grid gap-4 ${compact ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {niveaux.map((n) => (
          <article
            key={n.tankId}
            data-vue={vue}
            className={`flex flex-col gap-3 rounded-xl border bg-surface p-[18px] ${n.sousSeuil ? 'border-accent' : 'border-bordure'}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[15px] font-semibold">
                {n.label} · {t(`fuel.${n.produit}`)}
              </h3>
              <span
                className={`rounded-pilule px-2 py-0.5 text-[12px] font-semibold ${n.mesureCl === null ? 'bg-surface-2 text-texte-secondaire' : n.sousSeuil ? 'bg-accent-fond text-accent' : 'bg-succes-fond text-succes'}`}
              >
                {n.mesureCl === null
                  ? t('tanks3d.noGauge')
                  : n.sousSeuil
                    ? t('tanks3d.reorder')
                    : t('tanks3d.ok')}
              </span>
            </div>
            <div className="rounded-lg bg-fond" style={{ opacity: n.mesureCl === null ? 0.6 : 1 }}>
              {vue === '3d' && webgl ? <Cuve3D niveau={n} /> : <CuveSimple niveau={n} />}
            </div>
            <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}>
              <Valeur
                titre={t('tanks3d.measured')}
                valeur={n.mesureCl === null ? '—' : `${litresEntiers(n.mesureCl)} L`}
                detail={
                  n.mesureCl === null
                    ? t('tanks3d.noGauge')
                    : t('tanks3d.ofCapacity', {
                        pct: Math.round((n.mesureCl / n.capaciteCl) * 100),
                        capacity: litresEntiers(n.capaciteCl),
                      })
                }
              />
              <Valeur
                titre={t('tanks3d.theoretical')}
                valeur={n.theoriqueCl === null ? '—' : `${litresEntiers(n.theoriqueCl)} L`}
                detail={t('tanks3d.dotted')}
              />
              <Valeur
                titre={t('tanks3d.variance')}
                valeur={
                  n.ecartCl === null
                    ? '—'
                    : `${n.ecartCl > 0 ? '+' : ''}${litresEntiers(n.ecartCl)} L`
                }
                detail={
                  n.ecartPct === null
                    ? ''
                    : `${n.ecartPct > 0 ? '+' : ''}${formatPourcent(n.ecartPct)}`
                }
                accent={n.ecartCl !== null && n.ecartCl < 0 ? 'danger' : 'succes'}
              />
              <Valeur
                titre={t('tanks3d.autonomy')}
                valeur={formatAutonomie(n.autonomieJours)}
                detail={
                  n.ventesJourCl > 0
                    ? t('tanks3d.perDay', { litres: litresEntiers(n.ventesJourCl) })
                    : ''
                }
                accent={n.sousSeuil ? 'accent' : undefined}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Valeur({
  titre,
  valeur,
  detail,
  accent,
}: {
  titre: string;
  valeur: string;
  detail: string;
  accent?: 'danger' | 'succes' | 'accent' | undefined;
}) {
  const couleur =
    accent === 'danger'
      ? 'text-danger'
      : accent === 'succes'
        ? 'text-succes'
        : accent === 'accent'
          ? 'text-accent'
          : '';
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-texte-secondaire">{titre}</span>
      <span className={`font-mono text-[18px] font-semibold ${couleur}`}>{valeur}</span>
      <span className="text-[11px] text-texte-secondaire">{detail}</span>
    </div>
  );
}
