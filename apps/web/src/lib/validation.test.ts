import { lireBaremageCsv, validerBaremage } from '@stationsure/core';
import { describe, expect, it } from 'vitest';

import {
  schemaBaremage,
  schemaCuve,
  schemaPrix,
  premiereErreur,
  schemaDefinirPin,
  schemaEmploye,
  schemaInscription,
  schemaOrganisation,
  schemaPin,
  schemaStation,
} from './validation';

const UUID = '0d7e2f5a-1b2c-4d3e-8f90-123456789abc';

describe('validation des formulaires', () => {
  it('refuse un PIN trivial avec un message clair', () => {
    for (const pin of ['1234', '0000', '1111', '4321', '1212', '2580']) {
      const r = schemaPin.safeParse(pin);
      expect(r.success, pin).toBe(false);
      if (!r.success) expect(premiereErreur(r)).toBe('validation.pinTrivial');
    }
  });

  it('refuse un PIN qui ne fait pas 4 chiffres', () => {
    for (const pin of ['', '12', '12345', '12a4', '４０６２']) {
      const r = schemaPin.safeParse(pin);
      expect(r.success, pin).toBe(false);
      if (!r.success) expect(premiereErreur(r)).toBe('validation.pinFormat');
    }
  });

  it('accepte un PIN valide et un employé ciblé', () => {
    expect(schemaPin.safeParse('4062').success).toBe(true);
    expect(schemaDefinirPin.safeParse({ employeId: UUID, pin: '7391' }).success).toBe(true);
    expect(schemaDefinirPin.safeParse({ employeId: 'x', pin: '7391' }).success).toBe(false);
  });

  it('inscription : courriel, mot de passe ≥ 8 et confirmation identique', () => {
    expect(
      schemaInscription.safeParse({
        email: 'a@b.sn',
        motDePasse: 'Secret-123',
        confirmation: 'Secret-123',
      }).success,
    ).toBe(true);
    const court = schemaInscription.safeParse({
      email: 'a@b.sn',
      motDePasse: 'court',
      confirmation: 'court',
    });
    expect(court.success).toBe(false);
    if (!court.success) expect(premiereErreur(court)).toBe('validation.passwordMin');
    const different = schemaInscription.safeParse({
      email: 'a@b.sn',
      motDePasse: 'Secret-123',
      confirmation: 'Autre-123',
    });
    expect(different.success).toBe(false);
    if (!different.success) expect(premiereErreur(different)).toBe('validation.passwordMismatch');
    const mail = schemaInscription.safeParse({
      email: 'pas-un-mail',
      motDePasse: 'Secret-123',
      confirmation: 'Secret-123',
    });
    expect(mail.success).toBe(false);
    if (!mail.success) expect(premiereErreur(mail)).toBe('validation.email');
  });

  it('organisation : nom obligatoire et formule connue', () => {
    expect(schemaOrganisation.safeParse({ nom: 'Démo', plan: 'groupe' }).success).toBe(true);
    const sansNom = schemaOrganisation.safeParse({ nom: ' ', plan: 'groupe' });
    expect(sansNom.success).toBe(false);
    if (!sansNom.success) expect(premiereErreur(sansNom)).toBe('validation.nameMin');
    expect(schemaOrganisation.safeParse({ nom: 'Démo', plan: 'premium' }).success).toBe(false);
  });

  it('station : nom obligatoire, ville facultative', () => {
    expect(schemaStation.safeParse({ nom: 'Mbour', ville: '' }).success).toBe(true);
    expect(schemaStation.safeParse({ nom: 'Mbour' }).success).toBe(true);
    expect(schemaStation.safeParse({ nom: 'M' }).success).toBe(false);
  });

  it('employé : nom, rôle et station obligatoires', () => {
    expect(
      schemaEmploye.safeParse({ nomComplet: 'Awa Diop', role: 'pump_attendant', stationId: UUID })
        .success,
    ).toBe(true);
    expect(
      schemaEmploye.safeParse({ nomComplet: 'Awa Diop', role: 'pilote', stationId: UUID }).success,
    ).toBe(false);
    expect(
      schemaEmploye.safeParse({ nomComplet: 'Awa Diop', role: 'manager', stationId: '' }).success,
    ).toBe(false);
    expect(
      schemaEmploye.safeParse({ nomComplet: '', role: 'manager', stationId: UUID }).success,
    ).toBe(false);
  });
});

describe('configuration carburant (phase 3)', () => {
  it('cuve : capacité entière en litres > 0, produit connu', () => {
    expect(
      schemaCuve.safeParse({
        stationId: UUID,
        label: 'Cuve 1',
        produit: 'super',
        capaciteLitres: '30000',
      }).success,
    ).toBe(true);
    const r = schemaCuve.safeParse({
      stationId: UUID,
      label: 'Cuve 1',
      produit: 'super',
      capaciteLitres: '0',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(premiereErreur(r)).toBe('validation.capacity');
    expect(
      schemaCuve.safeParse({
        stationId: UUID,
        label: 'Cuve 1',
        produit: 'kerosene',
        capaciteLitres: '10',
      }).success,
    ).toBe(false);
  });
  it('barémage : points JSON lus puis validés par core', () => {
    const csv = lireBaremageCsv('hauteur_mm;volume_l\n0;0\n750;9500\n1205;16460');
    const r = schemaBaremage.safeParse({ cuveId: UUID, points: JSON.stringify(csv.points) });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(validerBaremage(r.data.points)).toEqual([]);
      expect(r.data.points[1]).toEqual({ hauteurMm: 750, volumeCl: 950000 });
    }
    expect(
      validerBaremage(lireBaremageCsv('0;0\n10;100\n20;100').points).map((p) => p.code),
    ).toContain('VOLUME_NON_CROISSANT');
    const mauvais = schemaBaremage.safeParse({ cuveId: UUID, points: 'pas du json' });
    expect(mauvais.success).toBe(false);
  });
  it('prix : entier > 0 et date facultative', () => {
    expect(
      schemaPrix.safeParse({ stationId: UUID, produit: 'gasoil', prix: '755', effectiveAt: '' })
        .success,
    ).toBe(true);
    const r = schemaPrix.safeParse({
      stationId: UUID,
      produit: 'gasoil',
      prix: '-1',
      effectiveAt: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(premiereErreur(r)).toBe('validation.price');
    expect(
      schemaPrix.safeParse({
        stationId: UUID,
        produit: 'gasoil',
        prix: '755',
        effectiveAt: 'demain',
      }).success,
    ).toBe(false);
  });
});
