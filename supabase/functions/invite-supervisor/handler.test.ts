import { assertEquals } from '@std/assert';

import { inviterSuperviseur, type Dependances } from './handler.ts';

function deps(partiel: Partial<Dependances> = {}, journal: string[] = []): Dependances {
  return {
    utilisateurDepuisJeton: (j) =>
      Promise.resolve(
        j === 'jeton-owner' ? { id: 'owner-1' } : j === 'jeton-sup' ? { id: 'sup-1' } : null,
      ),
    organisationOwner: (id) => Promise.resolve(id === 'owner-1' ? 'org-1' : null),
    inviter: (email, redirectTo) => {
      journal.push(`invite:${email}:${redirectTo}`);
      return Promise.resolve({ userId: 'new-1' });
    },
    utilisateurExistant: () => Promise.resolve('old-1'),
    enregistrer: (org, email, userId, invitedBy) => {
      journal.push(`register:${org}:${email}:${userId}:${invitedBy}`);
      return Promise.resolve('inv-1');
    },
    siteUrl: 'http://localhost:3000',
    log: () => {},
    ...partiel,
  };
}

Deno.test('le propriétaire invite : courriel envoyé puis invitation enregistrée', async () => {
  const journal: string[] = [];
  const r = await inviterSuperviseur(
    { email: ' Compta@Exemple.sn ' },
    'jeton-owner',
    deps({}, journal),
  );
  assertEquals(r, {
    status: 200,
    body: { ok: true, invitation_id: 'inv-1', already_registered: false },
  });
  assertEquals(journal, [
    'invite:compta@exemple.sn:http://localhost:3000/auth/callback?suite=/nouveau-mot-de-passe',
    'register:org-1:compta@exemple.sn:new-1:owner-1',
  ]);
});

Deno.test('un superviseur ou un anonyme ne peut pas inviter', async () => {
  assertEquals((await inviterSuperviseur({ email: 'a@b.sn' }, 'jeton-sup', deps())).status, 403);
  assertEquals((await inviterSuperviseur({ email: 'a@b.sn' }, null, deps())).status, 401);
  assertEquals(
    (await inviterSuperviseur({ email: 'a@b.sn' }, 'jeton-inconnu', deps())).status,
    401,
  );
});

Deno.test('courriel invalide → 400 avant tout appel', async () => {
  const journal: string[] = [];
  assertEquals(
    (await inviterSuperviseur({ email: 'pas-un-courriel' }, 'jeton-owner', deps({}, journal)))
      .status,
    400,
  );
  assertEquals(journal, []);
});

Deno.test('utilisateur déjà inscrit : rattaché sans nouveau courriel', async () => {
  const journal: string[] = [];
  const r = await inviterSuperviseur(
    { email: 'old@b.sn' },
    'jeton-owner',
    deps({ inviter: () => Promise.resolve('EXISTS') }, journal),
  );
  assertEquals(r.body, { ok: true, invitation_id: 'inv-1', already_registered: true });
  assertEquals(journal, ['register:org-1:old@b.sn:old-1:owner-1']);
});

Deno.test('échec du service auth → 502 sans enregistrement', async () => {
  const journal: string[] = [];
  const r = await inviterSuperviseur(
    { email: 'x@b.sn' },
    'jeton-owner',
    deps({ inviter: () => Promise.reject(new Error('smtp')) }, journal),
  );
  assertEquals(r.status, 502);
  assertEquals(journal, []);
});
