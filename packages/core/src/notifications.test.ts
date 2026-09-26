import { describe, expect, it } from 'vitest';

import {
  estE164,
  normaliserE164,
  renderAlerteCourte,
  renderRapportSoir,
  renderResumeJournee,
  type RapportSoir,
} from './notifications';

describe('numéros E.164', () => {
  it('accepte les numéros internationaux valides', () => {
    expect(estE164('+221770000001')).toBe(true);
    expect(estE164('+18195550123')).toBe(true);
    expect(estE164('+33612345678')).toBe(true);
  });

  it('refuse les formats invalides', () => {
    for (const n of [
      '770000001',
      '+0221770000001',
      '+221 77 000 00 01',
      '+2',
      '+1234567890123456',
      '',
    ])
      expect(estE164(n)).toBe(false);
  });

  it('normalise une saisie sénégalaise avec espaces, 00 ou sans indicatif', () => {
    expect(normaliserE164('+221 77 000 00 01')).toBe('+221770000001');
    expect(normaliserE164('00221770000001')).toBe('+221770000001');
    expect(normaliserE164('77 000 00 01')).toBe('+221770000001');
    expect(normaliserE164('+1 (819) 555-0123')).toBe('+18195550123');
    expect(normaliserE164('abc')).toBeNull();
    expect(normaliserE164('12345')).toBeNull();
  });
});

/** Cas de la seed (Mbour, avant-hier soir, maquette 04) : même texte attendu par le test pgTAP 120. */
export const RAPPORT_MBOUR: RapportSoir = {
  station: 'Mbour',
  date: '24/09',
  shiftLabel: 'Shift soir (démo)',
  caTotal: 2385000,
  caCarburant: 2190000,
  caBoutique: 145000,
  caGarage: 0,
  caLavage: 50000,
  litresSuperCl: 106777,
  litresGasoilCl: 150054,
  mobileFcfa: 1050000,
  mobileRapproche: false,
  ecartCaisse: -35000,
  toleranceCaisse: 1000,
  gerant: 'Ibrahima Sarr',
  ecartPassationCl: null,
  ecartCuvePct: null,
  seuilCuvePct: 0.5,
  cuveOk: true,
  photosFaites: 13,
  photosTotal: 13,
  bordereau: 'missing',
  lien: 'http://localhost:3000/caisse/00000000-0000-0000-0000-000000000000',
};

describe('rapport du soir (écran 06)', () => {
  it('rend le rapport avec les montants au format sénégalais, les accents et le signe moins', () => {
    const texte = renderRapportSoir(RAPPORT_MBOUR);
    expect(texte).toBe(
      [
        'Station Mbour · Clôture du 24/09',
        "Chiffre d'affaires : 2 385 000 FCFA",
        'Carburant 2 190 000 · Boutique 145 000 · Garage 0 · Lavage 50 000',
        'Litres : Super 1 067 · Gasoil 1 500',
        '⚠️ Écart caisse Shift soir (démo) : −35 000 FCFA (gérant : Ibrahima Sarr)',
        '✅ Passations OK',
        '⚠️ Bordereau de versement : manquant',
        '⚠️ Wave / Orange Money : 1 050 000 FCFA, en attente de rapprochement',
        '✅ Cuves : pas de jaugeage rapproché',
        "✅ Photos d'index : 13/13",
        'Détail : http://localhost:3000/caisse/00000000-0000-0000-0000-000000000000',
      ].join('\n'),
    );
  });

  it('marque un écart toléré comme OK et une passation à justifier', () => {
    const texte = renderRapportSoir({
      ...RAPPORT_MBOUR,
      ecartCaisse: -500,
      ecartPassationCl: 1000,
      pistoletPassation: 'P3-A',
      ecartCuvePct: -0.2,
      bordereau: 'slip',
      mobileRapproche: true,
    });
    expect(texte).toContain('✅ Caisse : −500 FCFA (toléré)');
    expect(texte).toContain('⚠️ Passation : 10,00 L à justifier (P3-A)');
    expect(texte).toContain('✅ Bordereau de versement : photo jointe');
    expect(texte).toContain('✅ Wave / Orange Money : 1 050 000 FCFA, rapproché');
    expect(texte).toContain('✅ Cuves : −0,2 % (seuil 0,5 %)');
  });

  it('refuse des litres non entiers', () => {
    expect(() => renderRapportSoir({ ...RAPPORT_MBOUR, litresSuperCl: 10.5 })).toThrow();
  });
});

describe('résumé et alerte', () => {
  it('résume plusieurs stations', () => {
    expect(
      renderResumeJournee({
        date: '25/09',
        clotures: 2,
        stationsTotal: 3,
        stations: [
          { station: 'Kaolack', caFcfa: 3443000, ecartFcfa: 0 },
          { station: 'Mbour', caFcfa: 4812500, ecartFcfa: -35000 },
        ],
        caTotal: 8255500,
        alertesGraves: 1,
      }),
    ).toBe(
      'Résumé du 25/09 · 2 clôture(s) sur 3 station(s)\n• Kaolack : 3 443 000 FCFA · caisse OK\n• Mbour : 4 812 500 FCFA · écart −35 000\nTotal : 8 255 500 FCFA · alertes graves : 1',
    );
  });

  it('alerte courte : quoi, où, qui, lien', () => {
    expect(
      renderAlerteCourte({
        station: 'Mbour',
        quoi: 'Écart de caisse −35 000 FCFA',
        qui: 'Ibrahima Sarr',
        lien: 'http://localhost:3000/alertes?id=x',
      }),
    ).toBe(
      '⚠️ Mbour · Écart de caisse −35 000 FCFA · Ibrahima Sarr\nhttp://localhost:3000/alertes?id=x',
    );
  });
});
