-- =============================================================================
-- 0009 — Enums de la phase 2. Séparés car une nouvelle valeur d'enum ne peut
-- pas être utilisée dans la transaction qui la crée.
-- =============================================================================
alter type public.alert_type add value if not exists 'pin_lockout';
alter type public.alert_type add value if not exists 'device_paired';
alter type public.alert_type add value if not exists 'device_revoked';

create type public.session_end_reason as enum ('logout', 'replaced', 'expired', 'revoked', 'inactivity');
