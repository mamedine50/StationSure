import { describe, expect, it } from 'vitest';

import { type Localite, normaliserRecherche, rechercherLocalites } from './villes';

const LOCALITES: Localite[] = [
  { code: 'kaolack/kaolack/kaolack', nom: 'Kaolack', departement: 'Kaolack', region: 'Kaolack' },
  { code: 'kaolack/kaolack/kahone', nom: 'Kahone', departement: 'Kaolack', region: 'Kaolack' },
  {
    code: 'kaffrine/kaffrine/kaffrine',
    nom: 'Kaffrine',
    departement: 'Kaffrine',
    region: 'Kaffrine',
  },
  { code: 'thies/mbour/mbour', nom: 'Mbour', departement: 'Mbour', region: 'Thiès' },
  { code: 'thies/mbour/saly', nom: 'Saly', departement: 'Mbour', region: 'Thiès' },
  { code: 'thies/thies/thies-nord', nom: 'Thiès-Nord', departement: 'Thiès', region: 'Thiès' },
  { code: 'dakar/dakar/medina', nom: 'Médina', departement: 'Dakar', region: 'Dakar' },
];

describe('recherche de ville', () => {
  it('normalise accents, casse et ponctuation', () => {
    expect(normaliserRecherche("Thiès-Nord  (M'bour)")).toBe('thies nord m bour');
  });

  it('« Kao » → Kaolack en premier', () => {
    expect(rechercherLocalites('Kao', LOCALITES).map((l) => l.nom)).toEqual(['Kaolack', 'Kahone']);
  });

  it('trouve sans accent et par mot interne', () => {
    expect(rechercherLocalites('medina', LOCALITES)[0]?.nom).toBe('Médina');
    expect(rechercherLocalites('nord', LOCALITES)[0]?.nom).toBe('Thiès-Nord');
  });

  it('cherche aussi dans le département et la région, après le nom', () => {
    expect(rechercherLocalites('mbour', LOCALITES).map((l) => l.nom)).toEqual(['Mbour', 'Saly']);
    expect(rechercherLocalites('thies', LOCALITES).map((l) => l.nom)).toEqual([
      'Thiès-Nord',
      'Mbour',
      'Saly',
    ]);
  });

  it('requête vide ou inconnue → aucun résultat ; limite respectée', () => {
    expect(rechercherLocalites('', LOCALITES)).toEqual([]);
    expect(rechercherLocalites('zzz', LOCALITES)).toEqual([]);
    expect(rechercherLocalites('ka', LOCALITES, 2)).toHaveLength(2);
  });
});
