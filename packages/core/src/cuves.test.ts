import { describe, expect, it } from 'vitest';

import { autonomieJours, choisirVueCuves, formatAutonomie, pourcentageRemplissage } from './cuves';

describe('cuves (écran 20)', () => {
  it('autonomie = volume / ventes moyennes, au dixième', () => {
    expect(autonomieJours(784000, 245000)).toBe(3.2);
    expect(autonomieJours(215000, 387000)).toBe(0.6);
    expect(autonomieJours(215000, 0)).toBeNull();
    expect(() => autonomieJours(10.5, 1)).toThrow();
  });

  it('remplissage en % de la capacité', () => {
    expect(pourcentageRemplissage(784000, 1200000)).toBe(65.3);
    expect(pourcentageRemplissage(1300000, 1200000)).toBe(100);
    expect(pourcentageRemplissage(0, 0)).toBe(0);
  });

  it('formatAutonomie', () => {
    expect(formatAutonomie(3.2)).toBe('3,2 jours');
    expect(formatAutonomie(0.6)).toBe('0,6 jour');
    expect(formatAutonomie(null)).toBe('—');
  });

  it('vue simple automatique sans WebGL ou avec animations réduites, préférence sinon', () => {
    expect(
      choisirVueCuves({ webglDisponible: false, reduireAnimations: false, preference: '3d' }),
    ).toBe('simple');
    expect(choisirVueCuves({ webglDisponible: true, reduireAnimations: true })).toBe('simple');
    expect(
      choisirVueCuves({ webglDisponible: true, reduireAnimations: true, preference: '3d' }),
    ).toBe('3d');
    expect(choisirVueCuves({ webglDisponible: true, reduireAnimations: false })).toBe('3d');
    expect(
      choisirVueCuves({ webglDisponible: true, reduireAnimations: false, preference: 'simple' }),
    ).toBe('simple');
  });
});
