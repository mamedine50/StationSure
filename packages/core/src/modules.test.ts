import { describe, expect, it } from 'vitest';

import { MODULES, MODULES_INACTIFS, ongletsVisibles, prochaineAction } from './modules';

const GERANT = [
  'shift',
  'gauging',
  'handover',
  'delivery',
  'sell',
  'credit_sale',
  'void_request',
  'cash_close',
  'bank_deposit',
];

describe('onglets visibles selon les modules', () => {
  it('gérant : Accueil, Carburant, Caisse, Moi', () => {
    expect(ongletsVisibles(GERANT)).toEqual(['accueil', 'carburant', 'caisse', 'moi']);
  });
  it('laveur : 3 onglets (écran 25)', () => {
    expect(ongletsVisibles(['wash_scan'])).toEqual(['accueil', 'lavage', 'moi']);
  });
  it('mécanicien : vidange ; caissier boutique : caisse + boutique', () => {
    expect(ongletsVisibles(['oil_change_scan'])).toEqual(['accueil', 'vidange', 'moi']);
    expect(ongletsVisibles(['shop_pos', 'shop_count', 'service_ticket_sale', 'sell'])).toEqual([
      'accueil',
      'caisse',
      'boutique',
      'moi',
    ]);
  });
  it('aucun module : Accueil et Moi seulement ; modules inconnus ignorés', () => {
    expect(ongletsVisibles([])).toEqual(['accueil', 'moi']);
    expect(ongletsVisibles(['prices'])).toEqual(['accueil', 'moi']);
  });
  it('la liste fermée contient 14 modules dont 5 inactifs', () => {
    expect(MODULES).toHaveLength(14);
    expect(MODULES_INACTIFS).toHaveLength(5);
  });
});

describe('prochaine action (écran 21)', () => {
  const base = { configurationComplete: true };
  it('configuration incomplète → configurer, quel que soit le module', () => {
    expect(prochaineAction({ statut: null, configurationComplete: false }, GERANT)).toBe(
      'configurer',
    );
  });
  it('sans shift → ouvrir (avec le module shift) sinon rien', () => {
    expect(prochaineAction({ ...base, statut: null }, GERANT)).toBe('ouvrir_shift');
    expect(prochaineAction({ ...base, statut: null }, ['sell'])).toBe('aucune');
  });
  it('ouverture en cours → continuer / attendre', () => {
    expect(prochaineAction({ ...base, statut: 'opening' }, GERANT)).toBe('continuer_ouverture');
    expect(prochaineAction({ ...base, statut: 'opening' }, ['sell'])).toBe('attendre');
  });
  it('shift ouvert → encaisser ; passation à signer prioritaire ; fin de shift quand les relevés sont faits', () => {
    expect(prochaineAction({ ...base, statut: 'open' }, GERANT)).toBe('encaisser');
    expect(prochaineAction({ ...base, statut: 'open', passationAMoi: true }, GERANT)).toBe(
      'passation',
    );
    expect(prochaineAction({ ...base, statut: 'open', passationAMoi: true }, ['sell'])).toBe(
      'encaisser',
    );
    expect(prochaineAction({ ...base, statut: 'open', fermetureComplete: true }, GERANT)).toBe(
      'fermer_shift',
    );
    expect(prochaineAction({ ...base, statut: 'open' }, ['shift'])).toBe('fermer_shift');
  });
  it('shift en attente de clôture → clôturer la caisse (module cash_close) sinon attendre', () => {
    expect(prochaineAction({ ...base, statut: 'closing' }, GERANT)).toBe('cloturer_caisse');
    expect(prochaineAction({ ...base, statut: 'closing' }, ['shift', 'sell'])).toBe('attendre');
    expect(prochaineAction({ ...base, statut: 'closing', caisseCloturee: true }, GERANT)).toBe(
      'aucune',
    );
  });
});
