import { assertEquals } from '@std/assert';

import {
  extraireStatuts,
  signatureAttendue,
  traiterWebhook,
  type DependancesWebhook,
} from './webhook.ts';

const PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [
              { id: 'wamid.A', status: 'delivered', timestamp: '1', recipient_id: '221770000001' },
              {
                id: 'wamid.B',
                status: 'failed',
                errors: [{ code: 131026, title: 'Message undeliverable' }],
              },
            ],
          },
        },
      ],
    },
  ],
};

function deps(enregistres: unknown[]): DependancesWebhook {
  return {
    verifyToken: 'verif-123',
    appSecret: 'secret-meta',
    enregistrer: (id, statut, erreur) => {
      enregistres.push({ id, statut, erreur });
      return Promise.resolve(1);
    },
    log: () => {},
  };
}

Deno.test('GET : vérification Meta avec le bon jeton renvoie le challenge', async () => {
  const r = await traiterWebhook(
    {
      method: 'GET',
      url: 'https://x/notify-webhook?hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=42',
      headers: new Headers(),
      corpsBrut: '',
    },
    deps([]),
  );
  assertEquals(r, { status: 200, body: '42' });
  const ko = await traiterWebhook(
    {
      method: 'GET',
      url: 'https://x/notify-webhook?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42',
      headers: new Headers(),
      corpsBrut: '',
    },
    deps([]),
  );
  assertEquals(ko.status, 403);
});

Deno.test('POST : signature valide → statuts enregistrés', async () => {
  const corps = JSON.stringify(PAYLOAD);
  const enregistres: unknown[] = [];
  const r = await traiterWebhook(
    {
      method: 'POST',
      url: 'https://x/notify-webhook',
      headers: new Headers({
        'x-hub-signature-256': await signatureAttendue(corps, 'secret-meta'),
      }),
      corpsBrut: corps,
    },
    deps(enregistres),
  );
  assertEquals(r, { status: 200, body: { ok: true, updated: 2 } });
  assertEquals(enregistres, [
    { id: 'wamid.A', statut: 'delivered', erreur: null },
    { id: 'wamid.B', statut: 'failed', erreur: '131026 Message undeliverable' },
  ]);
});

Deno.test('POST : signature invalide ou absente → 401, rien enregistré', async () => {
  const corps = JSON.stringify(PAYLOAD);
  const enregistres: unknown[] = [];
  const mauvaise = await traiterWebhook(
    {
      method: 'POST',
      url: 'https://x/notify-webhook',
      headers: new Headers({
        'x-hub-signature-256': await signatureAttendue(corps, 'autre-secret'),
      }),
      corpsBrut: corps,
    },
    deps(enregistres),
  );
  assertEquals(mauvaise.status, 401);
  const absente = await traiterWebhook(
    { method: 'POST', url: 'https://x/notify-webhook', headers: new Headers(), corpsBrut: corps },
    deps(enregistres),
  );
  assertEquals(absente.status, 401);
  assertEquals(enregistres.length, 0);
});

Deno.test('extraireStatuts ignore les entrées sans identifiant', () => {
  assertEquals(
    extraireStatuts({ entry: [{ changes: [{ value: { statuses: [{ status: 'sent' }] } }] }] }),
    [],
  );
  assertEquals(extraireStatuts(null), []);
});
