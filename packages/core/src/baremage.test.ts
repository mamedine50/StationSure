import { describe, expect, it } from 'vitest';

import {
  commenceAZero,
  evaluerSaisieBaremage,
  lireBaremageCsv,
  validerBaremage,
  volumeDepuisBaremageMm,
} from './baremage';
import { volumeDepuisBaremage } from './carburant';

const MAQUETTE = [
  [0, 0],
  [300, 2400],
  [600, 6800],
  [750, 9500],
  [900, 12200],
  [1205, 16460],
  [1500, 20500],
  [1800, 24300],
  [2100, 27600],
  [2400, 30000],
].map(([mm, l]) => ({ hauteurMm: mm!, volumeCl: l! * 100 }));

describe('validerBaremage', () => {
  it('accepte la table de la maquette 13', () => {
    expect(validerBaremage(MAQUETTE)).toEqual([]);
    expect(commenceAZero(MAQUETTE)).toBe(true);
  });
  it('refuse moins de 2 points', () => {
    expect(validerBaremage([{ hauteurMm: 0, volumeCl: 0 }]).map((p) => p.code)).toContain(
      'POINTS_INSUFFISANTS',
    );
  });
  it('refuse une hauteur dupliquée', () => {
    expect(
      validerBaremage([
        { hauteurMm: 0, volumeCl: 0 },
        { hauteurMm: 0, volumeCl: 10 },
        { hauteurMm: 5, volumeCl: 20 },
      ]).map((p) => p.code),
    ).toContain('HAUTEUR_DUPLIQUEE');
  });
  it('refuse des volumes non strictement croissants', () => {
    const codes = validerBaremage([
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 10, volumeCl: 100 },
      { hauteurMm: 20, volumeCl: 100 },
    ]);
    expect(codes).toEqual([{ code: 'VOLUME_NON_CROISSANT', index: 2 }]);
    expect(
      validerBaremage([
        { hauteurMm: 0, volumeCl: 50 },
        { hauteurMm: 10, volumeCl: 20 },
      ]).map((p) => p.code),
    ).toContain('VOLUME_NON_CROISSANT');
  });
  it('refuse hauteurs et volumes non entiers ou négatifs', () => {
    const codes = validerBaremage([
      { hauteurMm: -1, volumeCl: 0 },
      { hauteurMm: 10.5, volumeCl: 12.3 },
    ]).map((p) => p.code);
    expect(codes).toContain('HAUTEUR_INVALIDE');
    expect(codes).toContain('VOLUME_INVALIDE');
  });
});

describe('lireBaremageCsv', () => {
  it('lit « hauteur_mm;volume_l » avec en-tête, virgule décimale et lignes vides', () => {
    const csv = 'hauteur_mm;volume_l\n0;0\n300;2400\n\n750;9 500\n1205;16460,00\n';
    const r = lireBaremageCsv(csv);
    expect(r.lignesRejetees).toEqual([]);
    expect(r.points).toEqual([
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 300, volumeCl: 240000 },
      { hauteurMm: 750, volumeCl: 950000 },
      { hauteurMm: 1205, volumeCl: 1646000 },
    ]);
  });
  it('accepte la tabulation et la virgule comme séparateurs', () => {
    expect(lireBaremageCsv('0\t0\n10\t1.5').points).toEqual([
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 10, volumeCl: 150 },
    ]);
    expect(lireBaremageCsv('0,0\n10,1.5').points).toEqual([
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 10, volumeCl: 150 },
    ]);
  });
  it('signale les lignes invalides sans tout rejeter', () => {
    const r = lireBaremageCsv('mm;l\n0;0\nabc;12\n10;-3\n20\n30;300');
    expect(r.points).toEqual([
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 30, volumeCl: 30000 },
    ]);
    expect(r.lignesRejetees).toEqual([
      { ligne: 3, motif: 'HAUTEUR' },
      { ligne: 4, motif: 'VOLUME' },
      { ligne: 5, motif: 'FORMAT' },
    ]);
  });
});

describe('volumeDepuisBaremageMm', () => {
  it('donne les valeurs de la maquette (750 → 9 500 L, 900 → 12 200 L, 1 205 → 16 460 L)', () => {
    expect(volumeDepuisBaremageMm(750, MAQUETTE)).toBe(950000);
    expect(volumeDepuisBaremageMm(900, MAQUETTE)).toBe(1220000);
    expect(volumeDepuisBaremageMm(1205, MAQUETTE)).toBe(1646000);
  });
  it('interpole comme volumeDepuisBaremage (cm) et volume_from_calibration (SQL)', () => {
    const table4 = [
      { hauteurMm: 0, volumeCl: 0 },
      { hauteurMm: 500, volumeCl: 500000 },
      { hauteurMm: 1000, volumeCl: 1400000 },
      { hauteurMm: 1500, volumeCl: 2000000 },
    ];
    const tableCm = table4.map((p) => ({ hauteurCm: p.hauteurMm / 10, volumeCl: p.volumeCl }));
    for (const mm of [0, 1, 2, 3, 500, 600, 750, 1205, 1499, 1500]) {
      expect(volumeDepuisBaremageMm(mm, table4)).toBe(volumeDepuisBaremage(mm / 10, tableCm));
    }
    expect(() => volumeDepuisBaremageMm(1501, table4)).toThrowError(
      expect.objectContaining({ code: 'BAREMAGE_HORS_TABLE' }),
    );
  });
});

describe('saisie du barémage (écran 19)', () => {
  it('zone vide → AUCUN_POINT, un seul point → POINTS_INSUFFISANTS', () => {
    expect(evaluerSaisieBaremage('   ')).toMatchObject({ erreurs: ['AUCUN_POINT'], valide: false });
    expect(evaluerSaisieBaremage('0;0')).toMatchObject({
      erreurs: ['POINTS_INSUFFISANTS'],
      valide: false,
    });
  });

  it('volumes non croissants → VOLUME_NON_CROISSANT', () => {
    expect(evaluerSaisieBaremage('0;0\n300;1400\n600;1200').erreurs).toEqual([
      'VOLUME_NON_CROISSANT',
    ]);
  });

  it('valide dès 2 points croissants ; dernier volume > capacité = avertissement non bloquant', () => {
    const ok = evaluerSaisieBaremage('0;0\n300;1400\n600;3900', 1300000);
    expect(ok.valide).toBe(true);
    expect(ok.points).toHaveLength(3);
    expect(ok.avertissements).toEqual([]);
    const trop = evaluerSaisieBaremage('0;0\n2000;14000', 1300000);
    expect(trop.valide).toBe(true);
    expect(trop.avertissements).toEqual(['DEPASSE_CAPACITE']);
  });

  it('une ligne illisible bloque la publication', () => {
    const r = evaluerSaisieBaremage('0;0\nabc\n600;3900');
    expect(r.lignesRejetees).toHaveLength(1);
    expect(r.valide).toBe(false);
  });
});
