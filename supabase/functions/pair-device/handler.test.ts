import { assertEquals, assertStrictEquals } from '@std/assert';

import {
  type Dependances,
  jumelerAppareil,
  lireEntree,
  lireQr,
  MESSAGE_GENERIQUE,
} from './handler.ts';

/**
 * Doublure de la base : reproduit les règles de consume_pairing_code
 * (expiration, usage unique, 5 essais par code) pour tester le comportement du handler.
 */
function fabriquerDeps(
  options: {
    codes?: Array<{
      id: string;
      code: string;
      expired?: boolean;
      used?: boolean;
      attempts?: number;
    }>;
    echecCreationUtilisateur?: boolean;
  } = {},
) {
  const codes = options.codes ?? [];
  const journal: string[] = [];
  const appareils: Array<{ pairingId: string; userId: string; label: string }> = [];
  const utilisateurs: string[] = [];
  const supprimes: string[] = [];
  let compteur = 0;

  const deps: Dependances = {
    consumePairingCode(code, _ip, pairingId) {
      const candidats = codes.filter(
        (c) => !c.used && !c.expired && (c.attempts ?? 0) < 5 && (!pairingId || c.id === pairingId),
      );
      const trouve = candidats.find((c) => c.code === code);
      if (!trouve) {
        for (const c of candidats) c.attempts = (c.attempts ?? 0) + 1;
        return Promise.reject(new Error('PAIRING_INVALID'));
      }
      trouve.used = true;
      return Promise.resolve({
        pairing_id: trouve.id,
        station_id: 'station-1',
        organization_id: 'org-1',
      });
    },
    createDeviceUser(email) {
      if (options.echecCreationUtilisateur) return Promise.reject(new Error('boom'));
      const id = `user-${++compteur}-${email}`;
      utilisateurs.push(id);
      return Promise.resolve({ id });
    },
    registerPairedDevice(pairingId, userId, label) {
      appareils.push({ pairingId, userId, label });
      return Promise.resolve(`device-${appareils.length}`);
    },
    signInDevice() {
      return Promise.resolve({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        expires_at: 1,
        token_type: 'bearer',
      });
    },
    deleteAuthUser(id) {
      supprimes.push(id);
      return Promise.resolve();
    },
    randomHex: (n) => 'ab'.repeat(n),
    log: (m) => {
      journal.push(m);
    },
  };
  return { deps, codes, journal, appareils, utilisateurs, supprimes };
}

Deno.test('code valide → appareil créé et session renvoyée', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  const r = await jumelerAppareil({ code: '482371', label: 'Tablette caisse' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 200);
  assertEquals(r.body.device_id, 'device-1');
  assertEquals(r.body.station_id, 'station-1');
  assertEquals((r.body.session as { access_token: string }).access_token, 'access');
  assertEquals(f.appareils[0].label, 'Tablette caisse');
  assertEquals(f.codes[0].used, true);
});

Deno.test('le code peut contenir des espaces (saisie « 482 371 »)', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  const r = await jumelerAppareil({ code: '482 371' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 200);
});

Deno.test('code faux → message générique', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  const r = await jumelerAppareil({ code: '000000' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 400);
  assertEquals(r.body, { error: MESSAGE_GENERIQUE });
  assertEquals(f.appareils.length, 0);
});

Deno.test('code expiré → même message générique', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371', expired: true }] });
  const r = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 400);
  assertEquals(r.body, { error: MESSAGE_GENERIQUE });
});

Deno.test('code déjà utilisé → même message générique', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  const premier = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(premier.status, 200);
  const second = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(second.status, 400);
  assertEquals(second.body, { error: MESSAGE_GENERIQUE });
  assertEquals(f.appareils.length, 1);
});

Deno.test('6e tentative refusée même avec le bon code', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  for (let i = 0; i < 5; i++) {
    const r = await jumelerAppareil({ code: '111111' }, '1.2.3.4', f.deps);
    assertEquals(r.status, 400);
  }
  const r = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 400);
  assertEquals(r.body, { error: MESSAGE_GENERIQUE });
  assertEquals(f.appareils.length, 0);
});

Deno.test('entrée malformée → message générique, la base n’est pas appelée', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  for (const entree of [
    null,
    {},
    { code: 12345 },
    { code: '12345' },
    { code: '1234567' },
    'texte',
  ]) {
    const r = await jumelerAppareil(entree, '1.2.3.4', f.deps);
    assertEquals(r.status, 400);
    assertEquals(r.body, { error: MESSAGE_GENERIQUE });
  }
  assertEquals(f.codes[0].attempts ?? 0, 0);
});

Deno.test('échec d’enregistrement → utilisateur auth supprimé, message générique', async () => {
  const f = fabriquerDeps({ codes: [{ id: 'p1', code: '482371' }] });
  f.deps.registerPairedDevice = () => Promise.reject(new Error('PAIRING_INVALID'));
  const r = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 400);
  assertEquals(r.body, { error: MESSAGE_GENERIQUE });
  assertEquals(f.supprimes.length, 1);
});

Deno.test('échec de création de l’utilisateur → 500 générique', async () => {
  const f = fabriquerDeps({
    codes: [{ id: 'p1', code: '482371' }],
    echecCreationUtilisateur: true,
  });
  const r = await jumelerAppareil({ code: '482371' }, '1.2.3.4', f.deps);
  assertEquals(r.status, 500);
  assertEquals(r.body, { error: MESSAGE_GENERIQUE });
});

Deno.test('lireEntree normalise et rejette', () => {
  assertEquals(lireEntree({ code: ' 12 34 56 ', pairing_id: 'nope', label: '  Tablette ' }), {
    code: '123456',
    pairing_id: null,
    label: 'Tablette',
  });
  assertStrictEquals(lireEntree({ code: 'abcdef' }), null);
});

Deno.test('lireQr accepte uniquement stationsure://pair', () => {
  assertEquals(lireQr('stationsure://pair?code=482371&id=0d7e2f5a-1b2c-4d3e-8f90-123456789abc'), {
    code: '482371',
    pairing_id: '0d7e2f5a-1b2c-4d3e-8f90-123456789abc',
  });
  assertStrictEquals(lireQr('https://example.com/?code=482371'), null);
  assertStrictEquals(lireQr('stationsure://pair?code=12'), null);
  assertStrictEquals(lireQr('n importe quoi'), null);
});
