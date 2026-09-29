-- =============================================================================
-- 0020 — Lot de correctifs n°2 : modules de l'application mobile (liste fermée).
-- Les modules « boutique » et « services » existent déjà pour les types d'employés mais sont
-- inactifs tant que les phases 7 et 8 ne sont pas codées.
-- =============================================================================
create type public.employee_module as enum (
  'shift', 'gauging', 'handover', 'delivery',
  'sell', 'credit_sale', 'void_request', 'cash_close', 'bank_deposit',
  'shop_pos', 'shop_count', 'service_ticket_sale', 'oil_change_scan', 'wash_scan'
);
