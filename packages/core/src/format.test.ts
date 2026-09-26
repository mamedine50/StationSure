import { describe, expect, it } from 'vitest';

import { formatFCFA, formatLitres, formatPourcent } from './format';

describe('formats sénégalais', () => {
  it('formatFCFA(2385000) → "2 385 000"', () => {
    expect(formatFCFA(2385000)).toBe('2 385 000');
    expect(formatFCFA(0)).toBe('0');
    expect(formatFCFA(999)).toBe('999');
    expect(formatFCFA(1000)).toBe('1 000');
    expect(formatFCFA(12460500)).toBe('12 460 500');
  });

  it('formatFCFA négatif utilise le signe moins typographique de la maquette', () => {
    expect(formatFCFA(-35000)).toBe('−35 000');
  });

  it('formatLitres(48237125) → "482 371,25"', () => {
    expect(formatLitres(48237125)).toBe('482 371,25');
    expect(formatLitres(1000)).toBe('10,00');
    expect(formatLitres(5)).toBe('0,05');
    expect(formatLitres(0)).toBe('0,00');
    expect(formatLitres(-1000)).toBe('−10,00');
  });

  it('formatPourcent(-0.9) → "−0,9 %"', () => {
    expect(formatPourcent(-0.9)).toBe('−0,9 %');
    expect(formatPourcent(0)).toBe('0,0 %');
    expect(formatPourcent(28, 0)).toBe('28 %');
  });

  it('refuse un montant non entier', () => {
    expect(() => formatFCFA(10.5)).toThrowError(/entier/);
  });
});
