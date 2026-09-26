import { describe, expect, it } from 'vitest';

import { comparerPassation } from './passation';
import { litresToCl } from './unites';

describe('comparerPassation (maquette 03)', () => {
  const sortant = [
    { pistolet: 'P1-A', index: litresToCl(198402.1) },
    { pistolet: 'P1-B', index: litresToCl(356118.7) },
    { pistolet: 'P2-A', index: litresToCl(142950.0) },
    { pistolet: 'P2-B', index: litresToCl(483912.55) },
    { pistolet: 'P3-A', index: litresToCl(215880.4) },
    { pistolet: 'P3-B', index: litresToCl(301227.85) },
  ];
  const entrant = sortant.map((p) =>
    p.pistolet === 'P3-A' ? { ...p, index: litresToCl(215890.4) } : { ...p },
  );

  it('signale uniquement P3-A avec un écart de 10,00 L', () => {
    const ecarts = comparerPassation(sortant, entrant);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toEqual({
      pistolet: 'P3-A',
      indexSortant: 21588040,
      indexEntrant: 21589040,
      ecart: 1000, // 10,00 L
    });
  });

  it('renvoie une liste vide quand tout concorde', () => {
    expect(comparerPassation(sortant, sortant)).toEqual([]);
  });

  it("l'ordre des listes n'a pas d'importance", () => {
    expect(comparerPassation(sortant, [...entrant].reverse())).toHaveLength(1);
  });

  it('refuse des listes qui ne couvrent pas les mêmes pistolets', () => {
    expect(() => comparerPassation(sortant, entrant.slice(0, 5))).toThrowError(
      expect.objectContaining({ code: 'PASSATION_PISTOLETS_DIFFERENTS' }),
    );
  });

  it('refuse un pistolet en double', () => {
    expect(() => comparerPassation([...sortant, sortant[0]!], entrant)).toThrowError(
      expect.objectContaining({ code: 'PASSATION_PISTOLET_DUPLIQUE' }),
    );
  });
});
