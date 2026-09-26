import { describe, expect, it } from 'vitest';

import { ecartLivraisonPourcent, livraisonAvecReserve, volumeLivre } from './livraison';
import { litresToCl } from './unites';

describe('livraison (maquette 12)', () => {
  it('livré mesuré = après − avant : 16 460 − 9 500 = 6 960 L', () => {
    expect(volumeLivre(litresToCl(9500), litresToCl(16460))).toBe(litresToCl(6960));
  });
  it('écart −0,57 % pour 6 960 L livrés contre 7 000 L facturés → réserve obligatoire', () => {
    const ecart = ecartLivraisonPourcent(litresToCl(6960), litresToCl(7000));
    expect(ecart).toBe(-0.57);
    expect(livraisonAvecReserve(ecart)).toBe(true);
  });
  it('écart dans la tolérance : 6 985 L → −0,21 % → pas de réserve', () => {
    const ecart = ecartLivraisonPourcent(litresToCl(6985), litresToCl(7000));
    expect(ecart).toBe(-0.21);
    expect(livraisonAvecReserve(ecart)).toBe(false);
    expect(livraisonAvecReserve(0.3)).toBe(false);
    expect(livraisonAvecReserve(0.31)).toBe(true);
  });
  it('refuse un volume facturé nul', () => {
    expect(() => ecartLivraisonPourcent(100, 0)).toThrowError(/facturé/);
  });
});
