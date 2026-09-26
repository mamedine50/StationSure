-- =============================================================================
-- 0013 — Enums de la phase 4 (séparés : une nouvelle valeur d'enum n'est pas
-- utilisable dans la transaction qui la crée).
-- =============================================================================
alter type public.meter_reading_kind add value if not exists 'price_change';
alter type public.transaction_kind add value if not exists 'credit_repayment';
alter type public.alert_type add value if not exists 'void_over_limit';
alter type public.alert_type add value if not exists 'deposit_mismatch';
alter type public.alert_type add value if not exists 'deposit_missing';
alter type public.alert_type add value if not exists 'mobile_money_unmatched';
alter type public.alert_type add value if not exists 'mobile_money_pending';
alter type public.alert_type add value if not exists 'credit_account_requested';
alter type public.alert_type add value if not exists 'price_change_reading_missing';
alter type public.evidence_kind add value if not exists 'credit_note';
alter type public.evidence_kind add value if not exists 'card_receipt';

create type public.payment_match_status as enum ('pending', 'matched', 'unmatched');
create type public.mobile_money_provider as enum ('wave', 'orange_money');
create type public.approval_decision as enum ('approved', 'rejected');
create type public.credit_account_status as enum ('pending', 'active', 'rejected', 'closed');
create type public.cash_variance_decision as enum ('accept_loss', 'salary_deduction', 'recount');
create type public.deposit_mode as enum ('slip', 'later');
