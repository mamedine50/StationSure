import { describe, expect, it } from 'vitest';

import { clToLitres, litresToCl } from './unites';

describe('unités', () => {
  it('litresToCl convertit des litres décimaux en centilitres entiers', () => {
    expect(litresToCl(482371.25)).toBe(48237125);
    expect(litresToCl(0.1)).toBe(10);
    expect(litresToCl(1.005)).toBe(101); // arrondi au centilitre le plus proche
    expect(litresToCl(0)).toBe(0);
  });

  it('clToLitres renvoie des litres à 2 décimales', () => {
    expect(clToLitres(48237125)).toBe(482371.25);
    expect(clToLitres(1000)).toBe(10);
    expect(clToLitres(5)).toBe(0.05);
  });

  it('les conversions sont réversibles', () => {
    for (const cl of [0, 1, 99, 100, 123456789]) {
      expect(litresToCl(clToLitres(cl))).toBe(cl);
    }
  });

  it('clToLitres refuse un non-entier', () => {
    expect(() => clToLitres(10.5)).toThrowError(/entier/);
  });
});
