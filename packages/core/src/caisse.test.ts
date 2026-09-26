import { describe, expect, it } from 'vitest';

import { ecartCaisse, montantAttendu, montantEncaisse, montantVenteCarburant } from './caisse';
import { litresToCl } from './unites';

describe('clôture de caisse (maquette 04)', () => {
  // Attendu 2 385 000 = carburant 2 190 000 + boutique 145 000 + lavage 50 000
  const attendu = montantAttendu({
    ventesCarburant: [
      { litres: litresToCl(1000), prixUnitaire: 990 }, // Super : 990 000
      { litres: litresToCl(1500), prixUnitaire: 800 }, // Gasoil : 1 200 000
    ],
    boutique: 145_000,
    lavage: 50_000,
  });

  it('calcule le montant attendu', () => {
    expect(attendu).toBe(2_385_000);
  });

  it('calcule le montant encaissé', () => {
    expect(
      montantEncaisse({
        especes: 1_120_000,
        wave: 640_000,
        orangeMoney: 410_000,
        carte: 150_000,
        creditClient: 30_000,
      }),
    ).toBe(2_350_000);
  });

  it('écart de caisse −35 000', () => {
    const encaisse = montantEncaisse({
      especes: 1_120_000,
      wave: 640_000,
      orangeMoney: 410_000,
      carte: 150_000,
      creditClient: 30_000,
    });
    expect(ecartCaisse(encaisse, attendu)).toBe(-35_000);
  });

  it('déduit les annulations validées', () => {
    expect(
      montantAttendu({ ventesCarburant: [], boutique: 100_000, annulationsValidees: 25_000 }),
    ).toBe(75_000);
  });

  it('arrondit au franc les ventes carburant en centilitres', () => {
    // 12,34 L × 990 = 12 216,6 → 12 217
    expect(montantVenteCarburant({ litres: 1234, prixUnitaire: 990 })).toBe(12_217);
  });

  it('refuse les montants non entiers ou négatifs', () => {
    expect(() => montantEncaisse({ especes: 10.5 })).toThrowError(/entier/);
    expect(() => montantEncaisse({ wave: -1 })).toThrowError(/négatif/);
  });
});
