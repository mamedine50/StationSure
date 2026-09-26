import { describe, expect, it } from 'vitest';

import {
  adaptateurCsv,
  lireDate,
  lireEntetesCsv,
  lireMontantFcfa,
  lireReleveMobileMoney,
} from './mobile-money';

const CSV_WAVE = `Date;Référence;Montant;Client
25/09/2026 16:42;WV-88213;"15 000";77 000 00 00
25/09/2026 17:03;WV-88240;625 000 FCFA;77 111 11 11

25/09/2026 17:30;;12 000;77 222 22 22
25/09/2026 18:00;WV-88300;abc;77 333 33 33
`;

describe('relevé mobile money CSV', () => {
  it('lit les en-têtes et détecte le séparateur', () => {
    expect(lireEntetesCsv(CSV_WAVE)).toEqual(['Date', 'Référence', 'Montant', 'Client']);
    expect(lireEntetesCsv('ref,amount,paid_at\nA,1,2')).toEqual(['ref', 'amount', 'paid_at']);
  });
  it('applique le mapping de colonnes et rejette les lignes invalides sans bloquer', () => {
    const r = lireReleveMobileMoney(CSV_WAVE, {
      reference: 'Référence',
      montant: 'Montant',
      date: 'Date',
      formatDate: 'dmy',
    });
    expect(r.lignes.map((l) => [l.reference, l.montantFcfa])).toEqual([
      ['WV-88213', 15000],
      ['WV-88240', 625000],
    ]);
    expect(r.lignes[0]!.payeLe.toISOString()).toBe('2026-09-25T16:42:00.000Z');
    expect(r.lignesRejetees).toEqual([
      { ligne: 5, motif: 'REFERENCE' },
      { ligne: 6, motif: 'MONTANT' },
    ]);
  });
  it('mapping incomplet → FORMAT', () => {
    expect(
      lireReleveMobileMoney(CSV_WAVE, { reference: 'Ref', montant: 'Montant', date: 'Date' })
        .lignesRejetees[0]?.motif,
    ).toBe('FORMAT');
  });
  it('montants et dates dans plusieurs formats', () => {
    expect(lireMontantFcfa('1 250 000')).toBe(1250000);
    expect(lireMontantFcfa('15000,00')).toBe(15000);
    expect(lireMontantFcfa('x')).toBeNull();
    expect(lireDate('2026-09-25T16:42:00Z')?.toISOString()).toBe('2026-09-25T16:42:00.000Z');
    expect(lireDate('1790354520', 'epoch')?.toISOString()).toBe('2026-09-25T16:42:00.000Z');
    expect(lireDate('pas une date')).toBeNull();
  });
  it("l'adaptateur CSV filtre par dates et respecte l'interface", async () => {
    const a = adaptateurCsv('wave', CSV_WAVE, {
      reference: 'Référence',
      montant: 'Montant',
      date: 'Date',
      formatDate: 'dmy',
    });
    expect(a.operateur).toBe('wave');
    const lignes = await a.lireReleve(
      new Date('2026-09-25T17:00:00Z'),
      new Date('2026-09-26T00:00:00Z'),
    );
    expect(lignes.map((l) => l.reference)).toEqual(['WV-88240']);
  });
});
