import { describe, expect, it } from 'vitest';

import { evaluerAlerte, SEUILS_PAR_DEFAUT } from './alertes';

describe('evaluerAlerte', () => {
  it('cuve : −0,9 % avec seuil 0,5 % → alerte ; −0,2 % → ok', () => {
    expect(evaluerAlerte('cuve', -0.9)).toBe('alerte');
    expect(evaluerAlerte('cuve', -0.2)).toBe('ok');
    expect(evaluerAlerte('cuve', 0.5)).toBe('ok'); // tolérance inclusive
    expect(evaluerAlerte('cuve', 0.51)).toBe('alerte');
  });

  it('livraison : ± 0,3 %', () => {
    expect(evaluerAlerte('livraison', 0.3)).toBe('ok');
    expect(evaluerAlerte('livraison', -0.4)).toBe('alerte');
  });

  it('passation et paiements électroniques : tolérance 0', () => {
    expect(evaluerAlerte('passation', 0)).toBe('ok');
    expect(evaluerAlerte('passation', 1000)).toBe('alerte');
    expect(evaluerAlerte('paiementElectronique', 0)).toBe('ok');
    expect(evaluerAlerte('paiementElectronique', -500)).toBe('alerte');
  });

  it('accepte des seuils surchargés par station', () => {
    expect(evaluerAlerte('cuve', -0.9, { cuve: 1 })).toBe('ok');
    expect(evaluerAlerte('livraison', -0.4, { cuve: 1 })).toBe('alerte'); // livraison inchangée
  });

  it('expose les seuils par défaut de l’architecture v2', () => {
    expect(SEUILS_PAR_DEFAUT).toEqual({
      cuve: 0.5,
      livraison: 0.3,
      passation: 0,
      paiementElectronique: 0,
    });
  });
});
