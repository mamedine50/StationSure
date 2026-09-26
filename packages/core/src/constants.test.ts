import { describe, expect, it } from 'vitest';

import { APP_ID, APP_NAME } from './constants';

describe('identité', () => {
  it('expose le nom affiché et l’identifiant technique', () => {
    expect(APP_NAME).toBe('StationSûre');
    expect(APP_ID).toBe('stationsure');
  });
});
