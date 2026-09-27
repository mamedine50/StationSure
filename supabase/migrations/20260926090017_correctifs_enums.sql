-- =============================================================================
-- 0017 — Lot de correctifs n°1 : nouveaux types d'alerte.
-- =============================================================================
alter type public.alert_type add value if not exists 'cash_small_variance_cumulative';
alter type public.alert_type add value if not exists 'tank_low';
