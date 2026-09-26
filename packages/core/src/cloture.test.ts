import { describe, expect, it } from 'vitest';

import { ecartCaisse, montantEncaisse } from './caisse';
import {
  attenduCarburantParTranches,
  montantAttenduEspeces,
  montantAttenduShift,
  totalBilletage,
} from './cloture';
import { litresToCl } from './unites';

describe('attendu carburant par tranches de prix', () => {
  it('sans changement de prix : une tranche (index fin − début) × prix', () => {
    const t = attenduCarburantParTranches([
      { indexCl: litresToCl(198402.1), prixUnitaire: 990 },
      { indexCl: litresToCl(199102.1), prixUnitaire: 990 },
    ]);
    expect(t).toEqual([{ litresCl: 70000, prixUnitaire: 990, montantFcfa: 693000 }]);
  });
  it('changement de prix pendant le shift : le relevé intermédiaire découpe en deux tranches', () => {
    const t = attenduCarburantParTranches([
      { indexCl: 0, prixUnitaire: 990 },
      { indexCl: litresToCl(400), prixUnitaire: 1000 }, // relevé à l'heure du changement
      { indexCl: litresToCl(1000), prixUnitaire: 1000 },
    ]);
    expect(t.map((x) => x.montantFcfa)).toEqual([396000, 600000]);
    expect(t.reduce((s, x) => s + x.montantFcfa, 0)).toBe(996000);
  });
  it('index qui recule → erreur', () => {
    expect(() =>
      attenduCarburantParTranches([
        { indexCl: 100, prixUnitaire: 990 },
        { indexCl: 50, prixUnitaire: 990 },
      ]),
    ).toThrowError(expect.objectContaining({ code: 'INDEX_RECULE' }));
  });
});

describe('clôture de la maquette 04', () => {
  const attendu = montantAttenduShift({ carburant: 2_190_000, boutique: 145_000, lavage: 50_000 });
  it('attendu total 2 385 000', () => {
    expect(attendu).toBe(2_385_000);
  });
  it('attendu en espèces = total − Wave 640 000 − OM 410 000 − carte 150 000 − crédit 30 000 = 1 155 000', () => {
    expect(
      montantAttenduEspeces(attendu, {
        wave: 640_000,
        orangeMoney: 410_000,
        carte: 150_000,
        credit: 30_000,
      }),
    ).toBe(1_155_000);
  });
  it('espèces comptées 1 120 000 → écart −35 000 (identique à ecartCaisse sur le total)', () => {
    const especesAttendues = montantAttenduEspeces(attendu, {
      wave: 640_000,
      orangeMoney: 410_000,
      carte: 150_000,
      credit: 30_000,
    });
    expect(1_120_000 - especesAttendues).toBe(-35_000);
    const encaisse = montantEncaisse({
      especes: 1_120_000,
      wave: 640_000,
      orangeMoney: 410_000,
      carte: 150_000,
      creditClient: 30_000,
    });
    expect(ecartCaisse(encaisse, attendu)).toBe(-35_000);
  });
  it('les annulations approuvées diminuent l’attendu, les remboursements l’augmentent', () => {
    expect(montantAttenduShift({ carburant: 100_000, annulationsApprouvees: 25_000 })).toBe(75_000);
    expect(montantAttenduShift({ carburant: 100_000, remboursementsCredit: 50_000 })).toBe(150_000);
  });
});

describe('billetage (maquette 14)', () => {
  it('78×10 000 + 42×5 000 + 45×2 000 + 25×1 000 + 16×500 + 20×200 + 25×100 + 10×50 = 1 120 000', () => {
    expect(
      totalBilletage({
        10000: 78,
        5000: 42,
        2000: 45,
        1000: 25,
        500: 16,
        200: 20,
        100: 25,
        50: 10,
      }),
    ).toBe(1_120_000);
  });
  it('coupure inconnue ou quantité invalide refusée', () => {
    expect(() => totalBilletage({ 25: 1 } as never)).toThrowError(/Coupure inconnue/);
    expect(() => totalBilletage({ 10000: -1 })).toThrowError(/négatif/);
    expect(totalBilletage({})).toBe(0);
  });
});
