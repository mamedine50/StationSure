-- =============================================================================
-- 0011 — Enums de la phase 3 (séparés : une nouvelle valeur d'enum n'est pas
-- utilisable dans la transaction qui la crée).
-- =============================================================================
alter type public.shift_status add value if not exists 'opening' before 'open';
alter type public.session_end_reason add value if not exists 'handover';
alter type public.alert_type add value if not exists 'meter_regression';
alter type public.alert_type add value if not exists 'delivery_shortfall';
alter type public.alert_type add value if not exists 'shift_opened';

create type public.tank_reading_kind as enum ('open', 'close', 'delivery_before', 'delivery_after', 'spot');
create type public.handover_side as enum ('outgoing', 'incoming');
create type public.delivery_status as enum ('gauging_before', 'unloading', 'gauging_after', 'signing', 'signed', 'cancelled');
