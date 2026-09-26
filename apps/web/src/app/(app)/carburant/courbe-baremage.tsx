import type { PointBaremageMm } from '@stationsure/core';
import { couleurs } from '@stationsure/ui';

/** Courbe SVG hauteur → volume (points reliés, interpolation linéaire visible). */
export function CourbeBaremage({ points }: { points: PointBaremageMm[] }) {
  const largeur = 480;
  const hauteur = 200;
  const marge = { gauche: 44, droite: 12, haut: 10, bas: 24 };
  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-md border border-bordure text-[12px] text-texte-secondaire">
        —
      </div>
    );
  }
  const tries = [...points].sort((a, b) => a.hauteurMm - b.hauteurMm);
  const maxH = tries[tries.length - 1]!.hauteurMm || 1;
  const maxV = Math.max(...tries.map((p) => p.volumeCl)) || 1;
  const x = (h: number) => marge.gauche + (h / maxH) * (largeur - marge.gauche - marge.droite);
  const y = (v: number) => hauteur - marge.bas - (v / maxV) * (hauteur - marge.haut - marge.bas);
  const chemin = tries
    .map((p) => `${x(p.hauteurMm).toFixed(1)},${y(p.volumeCl).toFixed(1)}`)
    .join(' ');
  const kL = (cl: number) => `${Math.round(cl / 100000)}k`;
  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      className="w-full"
      role="img"
      aria-label="Courbe de barémage"
    >
      <line
        x1={marge.gauche}
        y1={y(0)}
        x2={largeur - marge.droite}
        y2={y(0)}
        stroke={couleurs.bordure}
      />
      <line
        x1={marge.gauche}
        y1={marge.haut}
        x2={marge.gauche}
        y2={y(0)}
        stroke={couleurs.bordure}
      />
      <text
        x={marge.gauche - 6}
        y={y(0) + 4}
        textAnchor="end"
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        0
      </text>
      <text
        x={marge.gauche - 6}
        y={y(maxV / 2) + 4}
        textAnchor="end"
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        {kL(maxV / 2)}
      </text>
      <text
        x={marge.gauche - 6}
        y={y(maxV) + 4}
        textAnchor="end"
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        {kL(maxV)}
      </text>
      <text
        x={x(0)}
        y={hauteur - 6}
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        0
      </text>
      <text
        x={x(maxH / 2)}
        y={hauteur - 6}
        textAnchor="middle"
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        {Math.round(maxH / 2)} mm
      </text>
      <text
        x={x(maxH)}
        y={hauteur - 6}
        textAnchor="end"
        fontSize="10"
        fill={couleurs.texteSecondaire}
        fontFamily="monospace"
      >
        {maxH}
      </text>
      <polyline points={chemin} fill="none" stroke={couleurs.accent} strokeWidth="2" />
      {tries.map((p) => (
        <circle
          key={p.hauteurMm}
          cx={x(p.hauteurMm)}
          cy={y(p.volumeCl)}
          r="3"
          fill={couleurs.accent}
        />
      ))}
    </svg>
  );
}
