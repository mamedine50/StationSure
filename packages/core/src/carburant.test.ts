import { describe, expect, it } from 'vitest';

import {
  ecartCuve,
  ecartCuvePourcent,
  litresVendus,
  stockTheorique,
  volumeDepuisBaremage,
} from './carburant';
import { ErreurMetier } from './erreurs';
import { litresToCl } from './unites';

describe('litresVendus', () => {
  it('calcule la différence entre deux index', () => {
    // Maquette 02 : P1-A Super, relevés en litres → centilitres
    expect(litresVendus(litresToCl(198402.1), litresToCl(198950.6))).toBe(litresToCl(548.5));
    expect(litresVendus(1000, 1000)).toBe(0);
  });

  it("lève une erreur si l'index recule", () => {
    expect(() => litresVendus(21589040, 21588040)).toThrowError(ErreurMetier);
    expect(() => litresVendus(21589040, 21588040)).toThrowError(
      expect.objectContaining({ code: 'INDEX_RECULE' }),
    );
  });

  it('refuse les index non entiers', () => {
    expect(() => litresVendus(10.5, 20)).toThrowError(
      expect.objectContaining({ code: 'VALEUR_NON_ENTIERE' }),
    );
  });
});

describe('stockTheorique', () => {
  it('additionne stock initial, livraisons, retire les ventes et applique les ajustements', () => {
    expect(stockTheorique(1_000_000, 500_000, 300_000, -2_000)).toBe(1_198_000);
  });

  it('accepte des listes de livraisons et d’ajustements', () => {
    expect(stockTheorique(1_000_000, [200_000, 300_000], 300_000, [-1_000, -1_000])).toBe(
      1_198_000,
    );
  });

  it('les ajustements sont optionnels', () => {
    expect(stockTheorique(1_000_000, 0, 300_000)).toBe(700_000);
  });
});

describe('volumeDepuisBaremage', () => {
  const table = [
    { hauteurCm: 0, volumeCl: 0 },
    { hauteurCm: 50, volumeCl: 500_000 },
    { hauteurCm: 100, volumeCl: 1_400_000 },
    { hauteurCm: 150, volumeCl: 2_000_000 },
  ];

  it('renvoie exactement le volume d’un point de la table', () => {
    expect(volumeDepuisBaremage(50, table)).toBe(500_000);
    expect(volumeDepuisBaremage(0, table)).toBe(0);
    expect(volumeDepuisBaremage(150, table)).toBe(2_000_000);
  });

  it('interpole linéairement entre deux points', () => {
    // entre 50 cm (500 000) et 100 cm (1 400 000) : 75 cm → 950 000
    expect(volumeDepuisBaremage(75, table)).toBe(950_000);
    // 60 cm → 500 000 + 0,2 × 900 000 = 680 000
    expect(volumeDepuisBaremage(60, table)).toBe(680_000);
    // hauteur décimale (lecture au millimètre) : 120,5 cm → 1 400 000 + 0,41 × 600 000
    expect(volumeDepuisBaremage(120.5, table)).toBe(1_646_000);
  });

  it('accepte une table non triée', () => {
    expect(volumeDepuisBaremage(75, [...table].reverse())).toBe(950_000);
  });

  it('lève une erreur hors table', () => {
    expect(() => volumeDepuisBaremage(-1, table)).toThrowError(
      expect.objectContaining({ code: 'BAREMAGE_HORS_TABLE' }),
    );
    expect(() => volumeDepuisBaremage(150.1, table)).toThrowError(
      expect.objectContaining({ code: 'BAREMAGE_HORS_TABLE' }),
    );
  });

  it('lève une erreur si la table est vide ou contient un doublon', () => {
    expect(() => volumeDepuisBaremage(10, [])).toThrowError(
      expect.objectContaining({ code: 'BAREMAGE_TABLE_VIDE' }),
    );
    expect(() =>
      volumeDepuisBaremage(10, [
        { hauteurCm: 10, volumeCl: 100 },
        { hauteurCm: 10, volumeCl: 200 },
      ]),
    ).toThrowError(expect.objectContaining({ code: 'BAREMAGE_HAUTEUR_DUPLIQUEE' }));
  });
});

describe('ecartCuve / ecartCuvePourcent', () => {
  it('écart = physique − théorique', () => {
    expect(ecartCuve(1_195_500, 1_200_000)).toBe(-4_500);
  });

  it('écart en % des litres vendus, 2 décimales', () => {
    // Maquette 05 : Kaolack Gasoil −0,9 %
    expect(ecartCuvePourcent(-4_500, 500_000)).toBe(-0.9);
    expect(ecartCuvePourcent(-1_000, 500_000)).toBe(-0.2);
    expect(ecartCuvePourcent(1, 300_000)).toBe(0);
  });

  it('refuse une période sans litres vendus', () => {
    expect(() => ecartCuvePourcent(-100, 0)).toThrowError(
      expect.objectContaining({ code: 'DIVISION_PAR_ZERO' }),
    );
  });
});
