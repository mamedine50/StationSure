-- =============================================================================
-- 0015 — Enums de la phase 5.
-- =============================================================================
create type public.report_mode as enum ('after_each_closing', 'fixed_time');
create type public.alert_route as enum ('immediate', 'report');
create type public.notification_kind as enum ('evening_report', 'summary_report', 'alert', 'reminder');
create type public.notification_channel as enum ('dev', 'whatsapp', 'sms');
create type public.notification_status as enum ('queued', 'sent', 'delivered', 'failed', 'cancelled');
create type public.invitation_status as enum ('sent', 'accepted', 'revoked');
