import { COULEUR_PRODUIT } from '@stationsure/core';
import { t } from '@stationsure/i18n';

import { hauteurPourFraction, type NiveauCuve } from './niveau';

/** Vue simple (SVG, maquette 20) : cylindre couché, liquide, niveau théorique pointillé, seuil de commande. */
export function CuveSimple({ niveau }: { niveau: NiveauCuve }) {
  const largeur = 560;
  const hauteur = 260;
  const x0 = 90;
  const x1 = 470;
  const cy = 130;
  const r = 78;
  const rx = 34;
  const fraction = niveau.mesureCl === null ? 0 : niveau.mesureCl / niveau.capaciteCl;
  const hLiquide = hauteurPourFraction(fraction) * 2 * r;
  const yLiquide = cy + r - hLiquide;
  const yTheo =
    niveau.theoriqueCl === null
      ? null
      : cy + r - hauteurPourFraction(niveau.theoriqueCl / niveau.capaciteCl) * 2 * r;
  const ySeuil = cy + r - hauteurPourFraction(niveau.seuilCl / niveau.capaciteCl) * 2 * r;
  const couleur = COULEUR_PRODUIT[niveau.produit];
  const gris = niveau.mesureCl === null;
  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      className="w-full"
      role="img"
      aria-label={niveau.label}
    >
      <defs>
        <clipPath id={`corps-${niveau.tankId}`}>
          <rect x={x0} y={cy - r} width={x1 - x0} height={2 * r} />
          <ellipse cx={x1} cy={cy} rx={rx} ry={r} />
        </clipPath>
        <linearGradient id={`fond-${niveau.tankId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4642" />
          <stop offset="1" stopColor="#1c2522" />
        </linearGradient>
      </defs>
      <ellipse cx={(x0 + x1) / 2} cy={cy + r + 22} rx={220} ry={12} fill="#000" opacity={0.35} />
      <rect x={x0} y={cy - r} width={x1 - x0} height={2 * r} fill={`url(#fond-${niveau.tankId})`} />
      <rect x={(x0 + x1) / 2 - 14} y={cy - r - 14} width={28} height={16} rx={3} fill="#3a4642" />
      {!gris && (
        <g clipPath={`url(#corps-${niveau.tankId})`}>
          <rect
            x={x0 - rx}
            y={yLiquide}
            width={x1 - x0 + 2 * rx}
            height={hLiquide}
            fill={couleur}
            opacity={0.92}
          />
        </g>
      )}
      <ellipse
        cx={x1}
        cy={cy}
        rx={rx}
        ry={r}
        fill={gris ? '#2a3530' : couleur}
        opacity={gris ? 1 : 0.75}
        stroke="#4a5852"
        strokeWidth={2}
      />
      <ellipse cx={x0} cy={cy} rx={rx} ry={r} fill="none" stroke="#4a5852" strokeWidth={2} />
      <rect
        x={x0}
        y={cy - r}
        width={x1 - x0}
        height={2 * r}
        fill="none"
        stroke="#4a5852"
        strokeWidth={2}
      />
      {yTheo !== null && (
        <line
          x1={x0 - rx}
          x2={x1 + rx}
          y1={yTheo}
          y2={yTheo}
          stroke="#EEF2EF"
          strokeWidth={2}
          strokeDasharray="8 6"
          opacity={0.9}
        />
      )}
      <line
        x1={x0 - rx}
        x2={x1 + rx}
        y1={ySeuil}
        y2={ySeuil}
        stroke="#F2A541"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      <text
        x={x0 - rx + 4}
        y={ySeuil - 6}
        fill="#F2A541"
        fontSize="13"
        fontFamily="IBM Plex Sans, sans-serif"
      >
        {t('tanks3d.threshold', { pct: Math.round(niveau.seuilPct) })}
      </text>
      {gris && (
        <text
          x={(x0 + x1) / 2}
          y={cy + 5}
          textAnchor="middle"
          fill="#A3B0AA"
          fontSize="16"
          fontFamily="IBM Plex Sans, sans-serif"
        >
          {t('tanks3d.noGauge')}
        </text>
      )}
    </svg>
  );
}
