import { assertEntier, assertEntierPositif } from './erreurs';
import type { Centilitres, FCFA } from './types';

/** Une ligne de vente carburant : volume vendu (centilitres) au prix unitaire du litre. */
export interface VenteCarburant {
  /** Volume vendu en centilitres (voir `litresToCl`). */
  litres: Centilitres;
  /** Prix du litre en vigueur, en FCFA entiers. */
  prixUnitaire: FCFA;
}

export interface ElementsAttendu {
  ventesCarburant: readonly VenteCarburant[];
  /** Ventes boutique (FCFA). */
  boutique?: FCFA;
  /** Ventes garage (FCFA). */
  garage?: FCFA;
  /** Ventes Car Wash (FCFA). */
  lavage?: FCFA;
  /** Annulations validées par le propriétaire (FCFA), déduites du montant attendu. */
  annulationsValidees?: FCFA;
}

/**
 * Montant d'une vente carburant en FCFA : (centilitres × prix du litre) / 100,
 * arrondi au franc (le FCFA n'a pas de centime).
 */
export function montantVenteCarburant(vente: VenteCarburant): FCFA {
  assertEntierPositif(vente.litres, 'litres');
  assertEntierPositif(vente.prixUnitaire, 'prixUnitaire');
  return Math.round((vente.litres * vente.prixUnitaire) / 100);
}

/**
 * Montant attendu en caisse à la clôture :
 * Σ (litres vendus × prix) + boutique + garage + lavage − annulations validées.
 */
export function montantAttendu({
  ventesCarburant,
  boutique = 0,
  garage = 0,
  lavage = 0,
  annulationsValidees = 0,
}: ElementsAttendu): FCFA {
  assertEntierPositif(boutique, 'boutique');
  assertEntierPositif(garage, 'garage');
  assertEntierPositif(lavage, 'lavage');
  assertEntierPositif(annulationsValidees, 'annulationsValidees');
  const carburant = ventesCarburant.reduce((total, v) => total + montantVenteCarburant(v), 0);
  return carburant + boutique + garage + lavage - annulationsValidees;
}

export interface Encaissements {
  /** Espèces comptées physiquement. */
  especes?: FCFA;
  carte?: FCFA;
  wave?: FCFA;
  orangeMoney?: FCFA;
  /** Ventes à crédit (ardoise) adossées à un client identifié. */
  creditClient?: FCFA;
}

/** Montant encaissé = espèces + carte + Wave + Orange Money + crédit client. */
export function montantEncaisse({
  especes = 0,
  carte = 0,
  wave = 0,
  orangeMoney = 0,
  creditClient = 0,
}: Encaissements): FCFA {
  assertEntierPositif(especes, 'especes');
  assertEntierPositif(carte, 'carte');
  assertEntierPositif(wave, 'wave');
  assertEntierPositif(orangeMoney, 'orangeMoney');
  assertEntierPositif(creditClient, 'creditClient');
  return especes + carte + wave + orangeMoney + creditClient;
}

/**
 * Écart de caisse = encaissé − attendu. Négatif = il manque de l'argent.
 * Tout écart ≠ 0 exige une justification avant clôture (règle métier).
 */
export function ecartCaisse(encaisse: FCFA, attendu: FCFA): FCFA {
  assertEntier(encaisse, 'encaisse');
  assertEntier(attendu, 'attendu');
  return encaisse - attendu;
}
