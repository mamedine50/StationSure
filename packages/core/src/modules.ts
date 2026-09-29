/**
 * Modules de l'application mobile (lot de correctifs n°2) : liste fermée, miroir de l'enum
 * `public.employee_module`. Les droits sont vérifiés par le serveur (MODULE_NOT_GRANTED) ;
 * ces fonctions ne servent qu'à l'affichage (onglets, prochaine action).
 */
export const MODULES = [
  'shift',
  'gauging',
  'handover',
  'delivery',
  'sell',
  'credit_sale',
  'void_request',
  'cash_close',
  'bank_deposit',
  'shop_pos',
  'shop_count',
  'service_ticket_sale',
  'oil_change_scan',
  'wash_scan',
] as const;
export type Module = (typeof MODULES)[number];

/** Modules prévus mais inactifs tant que les phases 7 et 8 ne sont pas codées. */
export const MODULES_INACTIFS: readonly Module[] = [
  'shop_pos',
  'shop_count',
  'service_ticket_sale',
  'oil_change_scan',
  'wash_scan',
];

export type GroupeModules = 'carburant' | 'caisse' | 'boutique' | 'services';

export const GROUPES_MODULES: Record<GroupeModules, readonly Module[]> = {
  carburant: ['shift', 'gauging', 'handover', 'delivery'],
  caisse: ['sell', 'credit_sale', 'void_request', 'cash_close', 'bank_deposit'],
  boutique: ['shop_pos', 'shop_count', 'service_ticket_sale'],
  services: ['oil_change_scan', 'wash_scan'],
};

export type Onglet = 'accueil' | 'carburant' | 'caisse' | 'boutique' | 'lavage' | 'vidange' | 'moi';

/** Onglet ↔ modules qui le font apparaître. Accueil et Moi sont toujours présents. */
export const ONGLETS_PAR_MODULES: Record<Exclude<Onglet, 'accueil' | 'moi'>, readonly Module[]> = {
  carburant: GROUPES_MODULES.carburant,
  caisse: GROUPES_MODULES.caisse,
  boutique: GROUPES_MODULES.boutique,
  lavage: ['wash_scan'],
  vidange: ['oil_change_scan'],
};

const ORDRE_ONGLETS: readonly Onglet[] = [
  'accueil',
  'carburant',
  'caisse',
  'boutique',
  'lavage',
  'vidange',
  'moi',
];

/** Onglets visibles pour un employé : un onglet n'apparaît que s'il a au moins un module du groupe. */
export function ongletsVisibles(modules: readonly string[]): Onglet[] {
  const ensemble = new Set(modules);
  return ORDRE_ONGLETS.filter((o) => {
    if (o === 'accueil' || o === 'moi') return true;
    return ONGLETS_PAR_MODULES[o].some((m) => ensemble.has(m));
  });
}

export function aModule(modules: readonly string[], module: Module): boolean {
  return modules.includes(module);
}

/** Types d'employés système (codes de `employee_types`, miroir de la migration 0021). */
export const TYPES_EMPLOYE_SYSTEME = [
  'gerant',
  'chef_de_piste',
  'pompiste',
  'caissier_boutique',
  'mecanicien',
  'laveur',
  'gardien_nuit',
  'adjoint_station',
] as const;

/** État résumé du shift courant de la station, tel que renvoyé par `shift_tasks`. */
export interface EtatShiftPourAction {
  /** null = aucun shift en cours. */
  statut: 'opening' | 'open' | 'closing' | null;
  /** Configuration carburant complète (station_fuel_setup_status). */
  configurationComplete: boolean;
  /** Relevés / jaugeages de fin faits (shift_missing_items 'close' vide). */
  fermetureComplete?: boolean;
  /** Une passation en attente concerne cet employé. */
  passationAMoi?: boolean;
  /** La clôture de caisse est déjà faite. */
  caisseCloturee?: boolean;
}

export type ProchaineAction =
  | 'configurer'
  | 'ouvrir_shift'
  | 'continuer_ouverture'
  | 'passation'
  | 'encaisser'
  | 'fermer_shift'
  | 'cloturer_caisse'
  | 'attendre'
  | 'aucune';

/**
 * Gros bouton contextuel de l'écran 21, dans l'ordre : Ouvrir le shift → Encaisser → Passation →
 * Fermer le shift → Clôturer la caisse, selon l'état du shift et les modules de l'employé.
 */
export function prochaineAction(
  etat: EtatShiftPourAction,
  modules: readonly string[],
): ProchaineAction {
  const a = (m: Module) => aModule(modules, m);
  if (!etat.configurationComplete) return 'configurer';
  if (etat.statut === null) return a('shift') ? 'ouvrir_shift' : 'aucune';
  if (etat.statut === 'opening') return a('shift') ? 'continuer_ouverture' : 'attendre';
  if (etat.passationAMoi && a('handover')) return 'passation';
  if (etat.statut === 'closing') {
    if (etat.caisseCloturee) return 'aucune';
    return a('cash_close') ? 'cloturer_caisse' : 'attendre';
  }
  // statut open
  if (etat.fermetureComplete && a('shift')) return 'fermer_shift';
  if (a('sell')) return 'encaisser';
  if (a('shift')) return 'fermer_shift';
  return 'aucune';
}
