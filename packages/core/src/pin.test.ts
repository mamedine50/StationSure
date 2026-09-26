import { describe, expect, it } from 'vitest';

import { estFormatPinValide, estPinTrivial, validerPin } from './pin';

describe('PIN employé', () => {
  it('exige exactement 4 chiffres', () => {
    expect(estFormatPinValide('4062')).toBe(true);
    expect(estFormatPinValide('406')).toBe(false);
    expect(estFormatPinValide('40621')).toBe(false);
    expect(estFormatPinValide('40a2')).toBe(false);
    expect(validerPin('12')).toBe('FORMAT');
  });

  it('refuse les PIN triviaux', () => {
    for (const pin of [
      '0000',
      '1111',
      '9999',
      '1234',
      '4321',
      '0123',
      '9876',
      '6789',
      '1212',
      '7878',
      '2580',
      '0852',
      '2026',
    ]) {
      expect(estPinTrivial(pin), pin).toBe(true);
      expect(validerPin(pin), pin).toBe('TRIVIAL');
    }
  });

  it('accepte des PIN non triviaux', () => {
    for (const pin of ['4062', '7391', '8175', '3946', '6203', '5817', '9034', '1748', '2794']) {
      expect(estPinTrivial(pin), pin).toBe(false);
      expect(validerPin(pin), pin).toBeNull();
    }
  });
});
