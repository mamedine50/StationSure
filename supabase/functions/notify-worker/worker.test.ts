import { assert, assertEquals, assertFalse } from '@std/assert';

import type { MessageSortant, Notifier, ResultatEnvoi } from './notifier.ts';
import { DevNotifier } from './notifiers/dev.ts';
import { construireRequeteMeta, MetaWhatsAppNotifier, parametresModele } from './notifiers/meta.ts';
import { construireRequeteSms } from './notifiers/sms.ts';
import {
  delaiReessaiSecondes,
  MAX_TENTATIVES,
  traiterLot,
  type DependancesWorker,
  type Statut,
} from './worker.ts';

const RAPPORT = [
  'Station Mbour · Clôture du 24/09',
  "Chiffre d'affaires : 2 385 000 FCFA",
  'Carburant 2 190 000 · Boutique 145 000 · Garage 0 · Lavage 50 000',
  'Litres : Super 1 067 · Gasoil 1 500',
  '⚠️ Écart caisse Shift soir : −35 000 FCFA (gérant : Ibrahima Sarr)',
  '✅ Passations OK',
  '⚠️ Bordereau de versement : manquant',
  '⚠️ Wave / Orange Money : 1 050 000 FCFA, en attente de rapprochement',
  '✅ Cuves : pas de jaugeage rapproché',
  "✅ Photos d'index : 12/12",
  'Détail : http://localhost:3000/caisse/abc',
].join('\n');

function message(partiel: Partial<MessageSortant> = {}): MessageSortant {
  return {
    id: 'm1',
    channel: 'whatsapp',
    kind: 'evening_report',
    to_phone: '+221770000001',
    template: 'stationsure_rapport_soir',
    variables: { station: 'Mbour', date: '24/09' },
    body: RAPPORT,
    attempts: 1,
    ...partiel,
  };
}

interface Marque {
  id: string;
  statut: Statut;
  erreur: string | null;
  provider: string | null;
  delai: number | null;
}

function deps(
  lot: MessageSortant[],
  notifier: Notifier | null,
  marques: Marque[],
): DependancesWorker {
  return {
    reclamer: () => Promise.resolve(lot),
    marquer: (id, statut, erreur, provider, delai) => {
      marques.push({ id, statut, erreur, provider, delai });
      return Promise.resolve();
    },
    escalader: () => Promise.resolve(0),
    notifierPour: (canal) => (canal === 'sms' ? null : notifier),
    log: () => {},
  };
}

Deno.test('DevNotifier : marque délivré sans réseau et journalise', async () => {
  const dev = new DevNotifier();
  const marques: Marque[] = [];
  const bilan = await traiterLot(
    deps([message(), message({ id: 'm2', kind: 'alert' })], dev, marques),
  );
  assertEquals(bilan, { traites: 2, envoyes: 2, reessais: 0, echecs: 0, escalades: 0 });
  assertEquals(
    marques.map((m) => m.statut),
    ['delivered', 'delivered'],
  );
  assertEquals(marques[0].provider, 'dev-m1');
  assertEquals(dev.journal.length, 2);
});

Deno.test('worker : erreur temporaire → remis en file avec délai exponentiel', async () => {
  const instable: Notifier = {
    nom: 'instable',
    envoyer: () =>
      Promise.resolve<ResultatEnvoi>({ ok: false, error: 'META_500: down', retryable: true }),
  };
  for (const [tentative, delai] of [
    [1, 30],
    [2, 60],
    [3, 120],
    [4, 240],
  ] as const) {
    const marques: Marque[] = [];
    const bilan = await traiterLot(deps([message({ attempts: tentative })], instable, marques));
    assertEquals(bilan.reessais, 1);
    assertEquals(marques[0].statut, 'queued');
    assertEquals(marques[0].delai, delai);
    assertEquals(delaiReessaiSecondes(tentative), delai);
  }
});

Deno.test(
  'worker : 5e tentative ratée → échec définitif ; erreur non réessayable → échec immédiat',
  async () => {
    const instable: Notifier = {
      nom: 'instable',
      envoyer: () =>
        Promise.resolve<ResultatEnvoi>({ ok: false, error: 'META_500: down', retryable: true }),
    };
    let marques: Marque[] = [];
    await traiterLot(deps([message({ attempts: MAX_TENTATIVES })], instable, marques));
    assertEquals(marques[0].statut, 'failed');
    assertEquals(marques[0].erreur, 'META_500: down');

    const refus: Notifier = {
      nom: 'refus',
      envoyer: () =>
        Promise.resolve<ResultatEnvoi>({
          ok: false,
          error: 'META_400: numéro invalide',
          retryable: false,
        }),
    };
    marques = [];
    const bilan = await traiterLot(deps([message({ attempts: 1 })], refus, marques));
    assertEquals(bilan.echecs, 1);
    assertEquals(marques[0].statut, 'failed');
  },
);

Deno.test(
  "worker : exception de l'adaptateur = erreur temporaire ; canal SMS non configuré = échec",
  async () => {
    const casse: Notifier = { nom: 'casse', envoyer: () => Promise.reject(new Error('réseau')) };
    const marques: Marque[] = [];
    const bilan = await traiterLot(
      deps([message(), message({ id: 'm2', channel: 'sms' })], casse, marques),
    );
    assertEquals(bilan, { traites: 2, envoyes: 0, reessais: 1, echecs: 1, escalades: 0 });
    assertEquals(marques[0].statut, 'queued');
    assert(marques[0].erreur?.startsWith('EXCEPTION: réseau'));
    assertEquals(marques[1].erreur, 'CHANNEL_NOT_CONFIGURED: sms');
  },
);

Deno.test(
  'Meta : requête de modèle construite sans réseau, paramètres sans retour à la ligne',
  () => {
    const { url, init } = construireRequeteMeta(message(), {
      accessToken: 'EAAG-test',
      phoneNumberId: '1234567890',
    });
    assertEquals(url, 'https://graph.facebook.com/v22.0/1234567890/messages');
    assertEquals(init.headers.Authorization, 'Bearer EAAG-test');
    const corps = JSON.parse(init.body);
    assertEquals(corps.messaging_product, 'whatsapp');
    assertEquals(corps.to, '221770000001');
    assertEquals(corps.type, 'template');
    assertEquals(corps.template.name, 'stationsure_rapport_soir');
    assertEquals(corps.template.language.code, 'fr');
    const params = corps.template.components[0].parameters as { type: string; text: string }[];
    assertEquals(params.length, 12);
    assertEquals(params[0].text, 'Mbour');
    assertEquals(params[1].text, '24/09');
    assertEquals(params[2].text, '2 385 000');
    assertEquals(params[4].text, 'Super 1 067 · Gasoil 1 500');
    assertEquals(params[11].text, 'http://localhost:3000/caisse/abc');
    for (const p of params)
      assertFalse(/[\n\t]|\s{4}/.test(p.text), `paramètre invalide pour Meta : ${p.text}`);
  },
);

Deno.test('Meta : paramètres des autres modèles', () => {
  assertEquals(
    parametresModele(
      message({
        template: 'stationsure_alerte',
        body: '⚠️ Mbour · Écart de caisse −12 000 FCFA · Ibrahima Sarr\nhttp://localhost:3000/alertes?id=x',
      }),
    ),
    ['Mbour · Écart de caisse −12 000 FCFA · Ibrahima Sarr', 'http://localhost:3000/alertes?id=x'],
  );
  assertEquals(
    parametresModele(
      message({
        template: 'stationsure_resume_journee',
        body: 'Résumé du 25/09 · 2 clôture(s) sur 3 station(s)\n• Kaolack : 3 443 000 FCFA · caisse OK\n• Mbour : 4 812 500 FCFA · écart −35 000\nTotal : 8 255 500 FCFA · alertes graves : 1',
      }),
    ),
    [
      '25/09',
      '2',
      '3',
      'Kaolack : 3 443 000 FCFA · caisse OK · Mbour : 4 812 500 FCFA · écart −35 000',
      'Total : 8 255 500 FCFA · alertes graves : 1',
    ],
  );
  assertEquals(
    parametresModele(
      message({ template: 'stationsure_relance_bordereau', body: 'Bonjour Fatou, …' }),
    ),
    ['Bonjour Fatou, …'],
  );
});

Deno.test(
  'Meta : réponse acceptée → sent (délivré plus tard par le webhook) ; 500 → réessayable ; 400 → définitif',
  async () => {
    const faux = (statut: number, corps: unknown) => () =>
      Promise.resolve(
        new Response(JSON.stringify(corps), {
          status: statut,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const ok = new MetaWhatsAppNotifier(
      { accessToken: 't', phoneNumberId: 'p' },
      faux(200, { messages: [{ id: 'wamid.1' }] }),
    );
    assertEquals(await ok.envoyer(message()), {
      ok: true,
      providerMessageId: 'wamid.1',
      delivered: false,
    });
    const down = new MetaWhatsAppNotifier(
      { accessToken: 't', phoneNumberId: 'p' },
      faux(503, { error: { message: 'busy' } }),
    );
    const r1 = await down.envoyer(message());
    assert(!r1.ok && r1.retryable && r1.error.startsWith('META_503'));
    const refus = new MetaWhatsAppNotifier(
      { accessToken: 't', phoneNumberId: 'p' },
      faux(400, { error: { message: 'bad' } }),
    );
    const r2 = await refus.envoyer(message());
    assert(!r2.ok && !r2.retryable);
  },
);

Deno.test('SMS : requête HTTP générique', () => {
  const { url, init } = construireRequeteSms(message({ channel: 'sms', body: 'Texte' }), {
    url: 'https://sms.example.sn/send',
    token: 'sms-token',
    sender: 'StationSure',
  });
  assertEquals(url, 'https://sms.example.sn/send');
  assertEquals(JSON.parse(init.body), { to: '+221770000001', from: 'StationSure', text: 'Texte' });
  assertEquals(init.headers.Authorization, 'Bearer sms-token');
});
