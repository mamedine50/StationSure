-- =============================================================================
-- 0016 — Propriétaire à distance : paramètres (organisation + surcharge station,
-- valeurs verrouillées), destinataires WhatsApp, routage des alertes, outbox de
-- notifications + événements, rapport du soir figé, anti-spam, relance du gérant,
-- tableau de bord, score d'écart, invitations de superviseurs, pg_cron + pg_net.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Paramètres. Les tolérances verrouillées (paiements électroniques, passation,
-- index qui recule) n'ont volontairement AUCUNE colonne : elles valent 0 partout.
-- -----------------------------------------------------------------------------
create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  tank_variance_pct numeric(5, 2) not null default 0.5 check (tank_variance_pct >= 0 and tank_variance_pct <= 100),
  delivery_variance_pct numeric(5, 2) not null default 0.3 check (delivery_variance_pct >= 0 and delivery_variance_pct <= 100),
  cash_tolerance_fcfa bigint not null default 1000 check (cash_tolerance_fcfa >= 0),
  deposit_missing_hours integer not null default 24 check (deposit_missing_hours between 1 and 168),
  report_mode public.report_mode not null default 'after_each_closing',
  report_time time not null default '22:30',
  report_timezone text not null default 'Africa/Dakar',
  sms_fallback boolean not null default false,
  sms_fallback_minutes integer not null default 10 check (sms_fallback_minutes between 1 and 120),
  web_base_url text not null default 'http://localhost:3000',
  updated_at timestamptz not null default now()
);
comment on table public.organization_settings is 'Seuils et notifications par organisation. Tolérance 0 (paiements électroniques, passation, index qui recule) : verrouillée, sans colonne.';

create table public.station_settings (
  station_id uuid primary key,
  organization_id uuid not null,
  tank_variance_pct numeric(5, 2) check (tank_variance_pct is null or (tank_variance_pct >= 0 and tank_variance_pct <= 100)),
  delivery_variance_pct numeric(5, 2) check (delivery_variance_pct is null or (delivery_variance_pct >= 0 and delivery_variance_pct <= 100)),
  cash_tolerance_fcfa bigint check (cash_tolerance_fcfa is null or cash_tolerance_fcfa >= 0),
  deposit_missing_hours integer check (deposit_missing_hours is null or deposit_missing_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete cascade
);
comment on table public.station_settings is 'Surcharge par station des seuils de l''organisation (null = hérite).';

select private.enable_updated_at('public.organization_settings');
select private.enable_updated_at('public.station_settings');
select private.enable_audit('public.organization_settings');
select private.enable_audit('public.station_settings');
alter table public.organization_settings enable row level security;
alter table public.station_settings enable row level security;
select private.policy_select_org('public.organization_settings');
create policy organization_settings_select_device on public.organization_settings for select to authenticated
  using (organization_id = public.current_device_organization_id());
select private.policy_write_owner('public.organization_settings');
select private.policy_select_org('public.station_settings');
select private.policy_select_device('public.station_settings');
select private.policy_write_owner('public.station_settings');

-- Paramètres par défaut créés avec l'organisation.
create or replace function private.create_default_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_settings (organization_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger create_default_settings after insert on public.organizations for each row execute function private.create_default_settings();
insert into public.organization_settings (organization_id) select id from public.organizations on conflict do nothing;

-- Seuil effectif d'une station : surcharge station, sinon organisation, sinon défaut.
create or replace function public.effective_setting(p_station_id uuid, p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case p_key
      when 'tank_variance_pct' then ss.tank_variance_pct
      when 'delivery_variance_pct' then ss.delivery_variance_pct
      when 'cash_tolerance_fcfa' then ss.cash_tolerance_fcfa::numeric
      when 'deposit_missing_hours' then ss.deposit_missing_hours::numeric
    end,
    case p_key
      when 'tank_variance_pct' then os.tank_variance_pct
      when 'delivery_variance_pct' then os.delivery_variance_pct
      when 'cash_tolerance_fcfa' then os.cash_tolerance_fcfa::numeric
      when 'deposit_missing_hours' then os.deposit_missing_hours::numeric
    end,
    case p_key
      when 'tank_variance_pct' then 0.5
      when 'delivery_variance_pct' then 0.3
      when 'cash_tolerance_fcfa' then 1000
      when 'deposit_missing_hours' then 24
    end
  )
  from public.stations s
  left join public.organization_settings os on os.organization_id = s.organization_id
  left join public.station_settings ss on ss.station_id = s.id
  where s.id = p_station_id;
$$;
comment on function public.effective_setting(uuid, text) is 'Seuil effectif : station > organisation > défaut. Clés : tank_variance_pct, delivery_variance_pct, cash_tolerance_fcfa, deposit_missing_hours.';
revoke all on function public.effective_setting(uuid, text) from public, anon;
grant execute on function public.effective_setting(uuid, text) to authenticated, service_role;

-- Tolérances verrouillées, lues par le code et les tests : jamais paramétrables.
create or replace function public.locked_tolerances()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('electronic_payments_fcfa', 0, 'handover_cl', 0, 'meter_regression_cl', 0);
$$;
revoke all on function public.locked_tolerances() from public, anon;
grant execute on function public.locked_tolerances() to authenticated, service_role;

-- Refactor phase 3 : écart de cuve selon le seuil effectif.
create or replace function private.reconcile_tank_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theo record;
  v_pct numeric;
  v_status public.reconciliation_status;
  v_seuil numeric := public.effective_setting(new.station_id, 'tank_variance_pct');
begin
  if new.kind = 'delivery_after' or new.expected_cl is null then
    return new;
  end if;
  select * into v_theo from public.theoretical_stock_cl(new.tank_id, new.device_created_at);
  v_pct := case when v_theo.litres_sold_cl > 0 then round(new.variance_cl::numeric / v_theo.litres_sold_cl * 100, 2) else null end;
  v_status := case when v_pct is not null and abs(v_pct) > v_seuil then 'variance' else 'ok' end;
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details)
  values (new.organization_id, new.station_id, new.shift_id, 'tank', new.expected_cl, new.volume_cl, v_status,
          jsonb_build_object('tank_id', new.tank_id, 'reading_id', new.id, 'litres_sold_cl', v_theo.litres_sold_cl,
                             'delivered_cl', v_theo.delivered_cl, 'variance_pct', v_pct, 'threshold_pct', v_seuil, 'base_reading_id', v_theo.base_reading_id));
  if v_status = 'variance' then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (new.organization_id, new.station_id, new.shift_id, 'tank_variance', 'warning',
            jsonb_build_object('tank_id', new.tank_id, 'reading_id', new.id, 'variance_cl', new.variance_cl,
                               'variance_pct', v_pct, 'threshold_pct', v_seuil, 'litres_sold_cl', v_theo.litres_sold_cl, 'employee_id', new.employee_id));
  end if;
  return new;
end;
$$;

-- Refactor phase 3 : livraison avec réserve selon le seuil effectif.
create or replace function public.sign_delivery(
  p_session_id uuid, p_invoiced_cl bigint, p_invoice_evidence_id uuid, p_invoice_ref text default null,
  p_with_reserve boolean default false, p_reserve_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_s record;
  v_before record;
  v_after record;
  v_received bigint;
  v_pct numeric;
  v_id uuid;
  v_seuil numeric;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant signe une livraison' using errcode = '42501';
  end if;
  select s.* into v_s from public.fuel_delivery_sessions s where s.id = p_session_id and s.station_id = ctx.station_id for update;
  if v_s is null or v_s.status <> 'signing' then
    return jsonb_build_object('ok', false, 'error', 'DELIVERY_NOT_READY');
  end if;
  if p_invoiced_cl is null or p_invoiced_cl <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVOICED_REQUIRED');
  end if;
  if not exists (select 1 from public.evidence_files e where e.id = p_invoice_evidence_id and e.station_id = ctx.station_id and e.kind = 'delivery_note')
     or not public.evidence_is_uploaded(p_invoice_evidence_id) then
    return jsonb_build_object('ok', false, 'error', 'INVOICE_PHOTO_MISSING');
  end if;
  v_seuil := public.effective_setting(ctx.station_id, 'delivery_variance_pct');
  select * into v_before from public.tank_readings where id = v_s.before_reading_id;
  select * into v_after from public.tank_readings where id = v_s.after_reading_id;
  v_received := v_after.volume_cl - v_before.volume_cl;
  v_pct := round((v_received - p_invoiced_cl)::numeric / p_invoiced_cl * 100, 2);
  if abs(v_pct) > v_seuil and not p_with_reserve then
    return jsonb_build_object('ok', false, 'error', 'RESERVE_REQUIRED', 'received_cl', v_received, 'variance_pct', v_pct, 'threshold_pct', v_seuil);
  end if;
  if p_with_reserve and length(trim(coalesce(p_reserve_reason, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED', 'received_cl', v_received, 'variance_pct', v_pct);
  end if;
  insert into public.fuel_deliveries (organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref,
    invoiced_cl, before_cl, after_cl, evidence_id, device_created_at, session_id, before_reading_id, after_reading_id,
    variance_pct, signed_with_reserve, reserve_reason, unloading_started_at, unloading_ended_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_s.tank_id, v_s.supplier, p_invoice_ref,
    p_invoiced_cl, v_before.volume_cl, v_after.volume_cl, p_invoice_evidence_id, now(), p_session_id, v_s.before_reading_id,
    v_s.after_reading_id, v_pct, p_with_reserve, nullif(trim(coalesce(p_reserve_reason, '')), ''), v_s.unloading_started_at, v_s.unloading_ended_at)
  returning id into v_id;
  update public.fuel_delivery_sessions
  set status = 'signed', signed_at = now(), delivery_id = v_id, invoiced_cl = p_invoiced_cl, invoice_ref = p_invoice_ref, invoice_evidence_id = p_invoice_evidence_id
  where id = p_session_id;
  if abs(v_pct) > v_seuil then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, v_s.shift_id, 'delivery_shortfall', 'critical',
            jsonb_build_object('delivery_id', v_id, 'tank_id', v_s.tank_id, 'received_cl', v_received, 'invoiced_cl', p_invoiced_cl,
                               'variance_pct', v_pct, 'threshold_pct', v_seuil, 'reason', p_reserve_reason, 'employee_id', ctx.employee_id, 'employee_name', ctx.employee_name));
  end if;
  return jsonb_build_object('ok', true, 'delivery_id', v_id, 'received_cl', v_received, 'variance_pct', v_pct, 'with_reserve', p_with_reserve);
end;
$$;

-- Refactor phase 4 : bordereau manquant selon le délai effectif.
create or replace function public.flag_missing_deposits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  c record;
begin
  for c in
    select cl.* from public.cash_closings cl
    where cl.closed_at < now() - make_interval(hours => public.effective_setting(cl.station_id, 'deposit_missing_hours')::int)
      and cl.id = (select c2.id from public.cash_closings c2 where c2.shift_id = cl.shift_id order by c2.closed_at desc limit 1)
      and not exists (select 1 from public.bank_deposit_shifts b where b.shift_id = cl.shift_id)
      and not exists (select 1 from public.alerts a where a.type = 'deposit_missing' and a.shift_id = cl.shift_id)
  loop
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (c.organization_id, c.station_id, c.shift_id, 'deposit_missing', 'critical',
            jsonb_build_object('closing_id', c.id, 'counted_cash_fcfa', c.counted_cash_fcfa, 'closed_at', c.closed_at, 'employee_id', c.employee_id,
                               'hours', public.effective_setting(c.station_id, 'deposit_missing_hours')));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Refactor phase 4 : écart de caisse toléré (espèces). Sous la tolérance : pas d'alerte ni de
-- décision à prendre ; au-delà : justification obligatoire + alerte. La contrainte « écart ≠ 0 ⇒
-- justification » de la phase 4 est remplacée par la règle paramétrée de close_shift_cash().
alter table public.cash_closings drop constraint cash_closings_check;
create or replace function public.close_shift_cash(p_shift_id uuid, p_justification text default null, p_deposit_mode public.deposit_mode default 'later')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_summary jsonb;
  v_variance bigint;
  v_last_closing record;
  v_id uuid;
  v_tol bigint;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id for update;
  if v_shift is null then raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_shift.status = 'closed' then
    select c.* into v_last_closing from public.cash_closings c where c.shift_id = p_shift_id order by c.closed_at desc limit 1;
    if not exists (select 1 from public.cash_variance_decisions d where d.closing_id = v_last_closing.id and d.decision = 'recount' and d.created_at > v_last_closing.closed_at)
       or not exists (select 1 from public.cash_counts c where c.shift_id = p_shift_id and c.created_at > v_last_closing.closed_at) then
      return jsonb_build_object('ok', false, 'error', 'SHIFT_CLOSED');
    end if;
  elsif v_shift.status <> 'closing' then
    return jsonb_build_object('ok', false, 'error', 'FUEL_NOT_CLOSED', 'status', v_shift.status);
  end if;
  if not exists (select 1 from public.cash_counts c where c.shift_id = p_shift_id) then
    return jsonb_build_object('ok', false, 'error', 'CASH_COUNT_REQUIRED');
  end if;
  if not (public.shift_missing_items(p_shift_id, 'close') ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'EVIDENCE_MISSING', 'missing', public.shift_missing_items(p_shift_id, 'close'));
  end if;
  v_summary := public.shift_cash_summary(p_shift_id);
  if not (v_summary ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', 'PRICE_CHANGE_READING_MISSING', 'missing', v_summary -> 'missing');
  end if;
  v_variance := (v_summary ->> 'variance_fcfa')::bigint;
  v_tol := public.effective_setting(ctx.station_id, 'cash_tolerance_fcfa')::bigint;
  if abs(v_variance) > v_tol and length(trim(coalesce(p_justification, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'JUSTIFICATION_REQUIRED', 'variance_fcfa', v_variance, 'tolerance_fcfa', v_tol);
  end if;
  insert into public.cash_closings (organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
    expected_fuel_fcfa, expected_shop_fcfa, expected_wash_fcfa, expected_garage_fcfa, credit_repayments_fcfa, approved_voids_fcfa, expected_total_fcfa,
    wave_fcfa, orange_money_fcfa, card_fcfa, credit_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, justification, deposit_mode, details)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, p_shift_id, (v_summary ->> 'cash_count_id')::uuid,
    (v_summary -> 'expected' ->> 'fuel_fcfa')::bigint, (v_summary -> 'expected' ->> 'shop_fcfa')::bigint, (v_summary -> 'expected' ->> 'wash_fcfa')::bigint,
    (v_summary -> 'expected' ->> 'garage_fcfa')::bigint, (v_summary -> 'expected' ->> 'credit_repayments_fcfa')::bigint, (v_summary -> 'expected' ->> 'approved_voids_fcfa')::bigint,
    (v_summary -> 'expected' ->> 'total_fcfa')::bigint, (v_summary -> 'collected' ->> 'wave_fcfa')::bigint, (v_summary -> 'collected' ->> 'orange_money_fcfa')::bigint,
    (v_summary -> 'collected' ->> 'card_fcfa')::bigint, (v_summary -> 'collected' ->> 'credit_fcfa')::bigint, (v_summary -> 'expected' ->> 'cash_fcfa')::bigint,
    (v_summary ->> 'counted_cash_fcfa')::bigint, v_variance, nullif(trim(coalesce(p_justification, '')), ''), p_deposit_mode, v_summary -> 'fuel')
  returning id into v_id;
  if v_shift.status <> 'closed' then
    perform set_config('app.shift_rpc', 'on', true);
    update public.shifts set status = 'closed', closed_at = now(), closed_by = ctx.employee_id where id = p_shift_id;
    perform set_config('app.shift_rpc', 'off', true);
  end if;
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details)
  values (ctx.organization_id, ctx.station_id, p_shift_id, 'cash', (v_summary -> 'expected' ->> 'cash_fcfa')::bigint, (v_summary ->> 'counted_cash_fcfa')::bigint,
          (case when abs(v_variance) <= v_tol then 'ok' else 'variance' end)::public.reconciliation_status, jsonb_build_object('closing_id', v_id, 'justification', p_justification, 'tolerance_fcfa', v_tol));
  if abs(v_variance) > v_tol then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, p_shift_id, 'cash_variance', 'critical',
            jsonb_build_object('closing_id', v_id, 'variance_fcfa', v_variance, 'tolerance_fcfa', v_tol, 'justification', p_justification, 'employee_id', ctx.employee_id, 'employee_name', ctx.employee_name));
  end if;
  return jsonb_build_object('ok', true, 'closing_id', v_id, 'variance_fcfa', v_variance, 'tolerance_fcfa', v_tol, 'status', 'closed');
end;
$$;

-- Écart à trancher = au-delà de la tolérance effective, sans décision.
create or replace function public.pending_validations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with org as (select public.current_org_ids() as id)
  select jsonb_build_object(
    'cash_variances', (select count(*) from public.cash_closings c where c.organization_id in (select id from org)
                        and abs(c.variance_fcfa) > public.effective_setting(c.station_id, 'cash_tolerance_fcfa')
                        and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
                        and not exists (select 1 from public.cash_variance_decisions d where d.closing_id = c.id)),
    'voids', (select count(*) from public.voids v where v.organization_id in (select id from org) and not exists (select 1 from public.void_approvals a where a.void_id = v.id)),
    'credit_accounts', (select count(*) from public.credit_accounts a where a.organization_id in (select id from org) and a.status = 'pending'),
    'deposits', (select count(*) from public.alerts a where a.organization_id in (select id from org) and a.type in ('deposit_missing', 'deposit_mismatch') and a.acknowledged_at is null)
  );
$$;

-- -----------------------------------------------------------------------------
-- B. Destinataires (numéros lisibles par l'owner seulement), routage, téléphone employé.
-- -----------------------------------------------------------------------------
create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  receives_report boolean not null default true,
  receives_alerts boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_e164)
);
comment on table public.notification_recipients is 'Destinataires WhatsApp / SMS du propriétaire. Numéros E.164, lisibles par l''owner uniquement.';
select private.enable_updated_at('public.notification_recipients');
select private.enable_audit('public.notification_recipients');
alter table public.notification_recipients enable row level security;
create policy notification_recipients_select_owner on public.notification_recipients for select to authenticated using (public.is_org_owner(organization_id));
select private.policy_write_owner('public.notification_recipients');

create table public.alert_routing (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  alert_type public.alert_type not null,
  route public.alert_route not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, alert_type)
);
comment on table public.alert_routing is 'Routage d''un type d''alerte : immédiat (WhatsApp tout de suite) ou dans le rapport du soir. Sans ligne : défaut de alert_route_for().';
select private.enable_updated_at('public.alert_routing');
select private.enable_audit('public.alert_routing');
alter table public.alert_routing enable row level security;
select private.policy_select_org('public.alert_routing');
select private.policy_write_owner('public.alert_routing');

create or replace function public.alert_route_for(p_org uuid, p_type public.alert_type)
returns public.alert_route
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.route from public.alert_routing r where r.organization_id = p_org and r.alert_type = p_type),
    case when p_type in ('handover_mismatch', 'cash_variance', 'delivery_shortfall', 'meter_regression', 'pin_lockout') then 'immediate'::public.alert_route
         else 'report'::public.alert_route end
  );
$$;
revoke all on function public.alert_route_for(uuid, public.alert_type) from public, anon;
grant execute on function public.alert_route_for(uuid, public.alert_type) to authenticated, service_role;

alter table public.employees add column phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$');
comment on column public.employees.phone_e164 is 'Facultatif : permet la relance du gérant par WhatsApp.';

-- -----------------------------------------------------------------------------
-- C. Outbox de notifications (tête mutable par le worker) + événements append-only.
-- -----------------------------------------------------------------------------
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  station_id uuid,
  kind public.notification_kind not null,
  channel public.notification_channel not null default 'whatsapp',
  recipient_id uuid references public.notification_recipients (id) on delete set null,
  to_phone text not null,
  template text not null,
  variables jsonb not null default '{}'::jsonb,
  body text not null,
  idempotency_key text not null unique,
  status public.notification_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  fallback_of uuid references public.notification_outbox (id) on delete set null
);
comment on table public.notification_outbox is 'File d''envoi des messages (rapport du soir, alertes, relances). Vidée par l''Edge Function notify-worker. Le statut courant est ici, l''historique dans notification_outbox_events.';
create index notification_outbox_queue_idx on public.notification_outbox (status, next_attempt_at) where status = 'queued';
create index notification_outbox_org_idx on public.notification_outbox (organization_id, created_at desc);
create index notification_outbox_provider_idx on public.notification_outbox (provider_message_id) where provider_message_id is not null;

create table public.notification_outbox_events (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  organization_id uuid not null,
  status public.notification_status not null,
  error text,
  provider_message_id text,
  at timestamptz not null default now()
);
comment on table public.notification_outbox_events is 'Historique append-only des statuts de chaque message (queued → sent → delivered | failed).';
select private.enable_append_only('public.notification_outbox_events');

create or replace function private.log_outbox_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.last_error is distinct from old.last_error then
    insert into public.notification_outbox_events (outbox_id, organization_id, status, error, provider_message_id)
    values (new.id, new.organization_id, new.status, new.last_error, new.provider_message_id);
  end if;
  return new;
end;
$$;
create trigger log_outbox_event after insert or update on public.notification_outbox for each row execute function private.log_outbox_event();

alter table public.notification_outbox enable row level security;
alter table public.notification_outbox_events enable row level security;
create policy notification_outbox_select_owner on public.notification_outbox for select to authenticated using (public.is_org_owner(organization_id));
create policy notification_outbox_events_select_owner on public.notification_outbox_events for select to authenticated using (public.is_org_owner(organization_id));
revoke insert, update, delete on public.notification_outbox, public.notification_outbox_events from authenticated;

-- Format sénégalais des montants (miroir de formatFCFA) : « 2 385 000 », « −35 000 ».
create or replace function public.format_fcfa(p bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p < 0 then '−' else '' end
    || reverse(regexp_replace(reverse(abs(p)::text), '(\d{3})(?=\d)', '\1 ', 'g'));
$$;
create or replace function public.format_litres(p_cl bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cl < 0 then '−' else '' end
    || reverse(regexp_replace(reverse((abs(p_cl) / 100)::text), '(\d{3})(?=\d)', '\1 ', 'g'))
    || ',' || lpad((abs(p_cl) % 100)::text, 2, '0');
$$;
create or replace function public.format_pct(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p < 0 then '−' else '' end || replace(abs(round(p, 1))::text, '.', ',') || ' %';
$$;
revoke all on function public.format_fcfa(bigint), public.format_litres(bigint), public.format_pct(numeric) from public, anon;
grant execute on function public.format_fcfa(bigint), public.format_litres(bigint), public.format_pct(numeric) to authenticated, service_role;

-- Mise en file (service / triggers). Idempotente par clé.
create or replace function private.enqueue_notification(
  p_org uuid, p_station uuid, p_kind public.notification_kind, p_recipient_id uuid, p_phone text,
  p_template text, p_variables jsonb, p_body text, p_key text, p_channel public.notification_channel default 'whatsapp'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notification_outbox (organization_id, station_id, kind, channel, recipient_id, to_phone, template, variables, body, idempotency_key)
  values (p_org, p_station, p_kind, p_channel, p_recipient_id, p_phone, p_template, coalesce(p_variables, '{}'::jsonb), p_body, p_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- D. Rapport du soir (écran 06), construit depuis les valeurs FIGÉES de la clôture.
-- -----------------------------------------------------------------------------
create or replace function public.build_evening_report(p_closing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  s record;
  sh record;
  v_super bigint := 0;
  v_gasoil bigint := 0;
  v_mobile bigint;
  v_mobile_ok boolean;
  v_handover record;
  v_tank record;
  v_photos_done integer;
  v_photos_total integer;
  v_deposit text;
  v_manager text;
  v_tz text;
  v_base_url text;
  n jsonb;
begin
  select cl.* into c from public.cash_closings cl where cl.id = p_closing_id;
  if c is null then
    raise exception 'CLOSING_NOT_FOUND' using errcode = 'P0002';
  end if;
  select st.* into s from public.stations st where st.id = c.station_id;
  select x.* into sh from public.shifts x where x.id = c.shift_id;
  select os.report_timezone, os.web_base_url into v_tz, v_base_url from public.organization_settings os where os.organization_id = c.organization_id;
  select e.full_name into v_manager from public.employees e where e.id = c.employee_id;
  -- Litres par produit depuis les tranches figées dans details.
  for n in select * from jsonb_array_elements(case when jsonb_typeof(c.details) = 'array' then c.details else '[]'::jsonb end) loop
    if n ->> 'fuel_product_code' = 'super' then
      v_super := v_super + coalesce((select sum((sl ->> 'litres_cl')::bigint) from jsonb_array_elements(n -> 'slices') sl), 0);
    elsif n ->> 'fuel_product_code' = 'gasoil' then
      v_gasoil := v_gasoil + coalesce((select sum((sl ->> 'litres_cl')::bigint) from jsonb_array_elements(n -> 'slices') sl), 0);
    end if;
  end loop;
  v_mobile := c.wave_fcfa + c.orange_money_fcfa;
  select bool_and(public.payment_match_status(p.id) = 'matched') into v_mobile_ok
  from public.payments p join public.transactions t on t.id = p.transaction_id
  where t.shift_id = c.shift_id and p.method in ('wave', 'orange_money');
  select h.discrepancies, h.discrepancy_reported into v_handover from public.shift_handovers h
  where h.from_shift_id = c.shift_id and h.discrepancies is not null order by h.created_at desc limit 1;
  select r.details ->> 'variance_pct' as pct, r.details ->> 'threshold_pct' as seuil, r.status into v_tank
  from public.reconciliations r where r.shift_id = c.shift_id and r.kind = 'tank' order by r.created_at desc limit 1;
  select count(*) filter (where public.evidence_is_uploaded(m.evidence_id)), count(*) into v_photos_done, v_photos_total
  from public.meter_readings m where m.shift_id = c.shift_id;
  v_deposit := case when exists (select 1 from public.bank_deposit_shifts b where b.shift_id = c.shift_id) then 'declared'
                    when c.deposit_mode = 'slip' then 'slip' else 'missing' end;
  return jsonb_build_object(
    'closing_id', c.id,
    'shift_id', c.shift_id,
    'station_id', s.id,
    'station', s.name,
    'shift_label', sh.label,
    'date', to_char(c.closed_at at time zone coalesce(v_tz, 'Africa/Dakar'), 'DD/MM'),
    'closed_at', to_char(c.closed_at at time zone coalesce(v_tz, 'Africa/Dakar'), 'HH24:MI'),
    'ca_total_fcfa', c.expected_total_fcfa,
    'ca_fuel_fcfa', c.expected_fuel_fcfa,
    'ca_shop_fcfa', c.expected_shop_fcfa,
    'ca_garage_fcfa', c.expected_garage_fcfa,
    'ca_wash_fcfa', c.expected_wash_fcfa,
    'litres_super_cl', v_super,
    'litres_gasoil_cl', v_gasoil,
    'mobile_fcfa', v_mobile,
    'mobile_matched', coalesce(v_mobile_ok, true),
    'cash_variance_fcfa', c.variance_fcfa,
    'cash_tolerance_fcfa', public.effective_setting(c.station_id, 'cash_tolerance_fcfa'),
    'manager', v_manager,
    'handover_variance_cl', case when v_handover.discrepancies is not null then (v_handover.discrepancies -> 0 ->> 'variance_cl')::bigint end,
    'handover_nozzle', case when v_handover.discrepancies is not null then v_handover.discrepancies -> 0 ->> 'label' end,
    'tank_variance_pct', case when v_tank.pct is not null then v_tank.pct::numeric end,
    'tank_threshold_pct', coalesce(v_tank.seuil::numeric, public.effective_setting(c.station_id, 'tank_variance_pct')),
    'tank_ok', coalesce(v_tank.status, 'ok') = 'ok',
    'photos_done', v_photos_done,
    'photos_total', v_photos_total,
    'deposit', v_deposit,
    'link', coalesce(v_base_url, 'http://localhost:3000') || '/caisse/' || c.shift_id::text
  );
end;
$$;
revoke all on function public.build_evening_report(uuid) from public, anon;
grant execute on function public.build_evening_report(uuid) to authenticated, service_role;

-- Texte du rapport (écran 06). Même rendu que renderRapportSoir() de packages/core.
create or replace function public.render_evening_report(r jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  v_var bigint := (r ->> 'cash_variance_fcfa')::bigint;
  v_tol bigint := coalesce((r ->> 'cash_tolerance_fcfa')::bigint, 0);
  nl text := E'\n';
begin
  v := 'Station ' || (r ->> 'station') || ' · Clôture du ' || (r ->> 'date') || nl
    || 'Chiffre d''affaires : ' || public.format_fcfa((r ->> 'ca_total_fcfa')::bigint) || ' FCFA' || nl
    || 'Carburant ' || public.format_fcfa((r ->> 'ca_fuel_fcfa')::bigint)
    || ' · Boutique ' || public.format_fcfa((r ->> 'ca_shop_fcfa')::bigint)
    || ' · Garage ' || public.format_fcfa((r ->> 'ca_garage_fcfa')::bigint)
    || ' · Lavage ' || public.format_fcfa((r ->> 'ca_wash_fcfa')::bigint) || nl
    || 'Litres : Super ' || public.format_fcfa((r ->> 'litres_super_cl')::bigint / 100) || ' · Gasoil ' || public.format_fcfa((r ->> 'litres_gasoil_cl')::bigint / 100) || nl;
  if abs(v_var) > v_tol then
    v := v || '⚠️ Écart caisse ' || coalesce(r ->> 'shift_label', 'shift') || ' : ' || public.format_fcfa(v_var) || ' FCFA (gérant : ' || coalesce(r ->> 'manager', '?') || ')' || nl;
  else
    v := v || '✅ Caisse : ' || (case when v_var = 0 then 'aucun écart' else public.format_fcfa(v_var) || ' FCFA (toléré)' end) || nl;
  end if;
  if (r ->> 'handover_variance_cl') is not null then
    v := v || '⚠️ Passation : ' || public.format_litres(abs((r ->> 'handover_variance_cl')::bigint)) || ' L à justifier (' || coalesce(r ->> 'handover_nozzle', '?') || ')' || nl;
  else
    v := v || '✅ Passations OK' || nl;
  end if;
  v := v || case r ->> 'deposit' when 'declared' then '✅ Versement banque déclaré' when 'slip' then '✅ Bordereau de versement : photo jointe' else '⚠️ Bordereau de versement : manquant' end || nl;
  v := v || (case when (r ->> 'mobile_matched')::boolean then '✅' else '⚠️' end) || ' Wave / Orange Money : ' || public.format_fcfa((r ->> 'mobile_fcfa')::bigint) || ' FCFA, '
    || (case when (r ->> 'mobile_matched')::boolean then 'rapproché' else 'en attente de rapprochement' end) || nl;
  if (r ->> 'tank_variance_pct') is not null then
    v := v || (case when (r ->> 'tank_ok')::boolean then '✅' else '⚠️' end) || ' Cuves : ' || public.format_pct((r ->> 'tank_variance_pct')::numeric) || ' (seuil ' || public.format_pct((r ->> 'tank_threshold_pct')::numeric) || ')' || nl;
  else
    v := v || '✅ Cuves : pas de jaugeage rapproché' || nl;
  end if;
  v := v || (case when (r ->> 'photos_done')::int = (r ->> 'photos_total')::int then '✅' else '⚠️' end) || ' Photos d''index : ' || (r ->> 'photos_done') || '/' || (r ->> 'photos_total') || nl;
  v := v || 'Détail : ' || (r ->> 'link');
  return v;
end;
$$;
revoke all on function public.render_evening_report(jsonb) from public, anon;
grant execute on function public.render_evening_report(jsonb) to authenticated, service_role;

-- Un rapport par destinataire concerné, idempotent (clé report:{closing}:{destinataire}).
create or replace function public.enqueue_evening_report(p_closing_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  r jsonb;
  v_body text;
  d record;
  v_n integer := 0;
begin
  select cl.* into c from public.cash_closings cl where cl.id = p_closing_id;
  if c is null then return 0; end if;
  r := public.build_evening_report(p_closing_id);
  v_body := public.render_evening_report(r);
  for d in select * from public.notification_recipients nr where nr.organization_id = c.organization_id and nr.active and nr.receives_report loop
    if private.enqueue_notification(c.organization_id, c.station_id, 'evening_report', d.id, d.phone_e164, 'stationsure_rapport_soir', r, v_body,
                                    'report:' || p_closing_id::text || ':' || d.id::text) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.enqueue_evening_report(uuid) from public, anon;
grant execute on function public.enqueue_evening_report(uuid) to service_role;

-- Résumé multi-stations d'une journée (organisation avec plusieurs stations).
create or replace function public.build_summary_report(p_org uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (select coalesce((select os.report_timezone from public.organization_settings os where os.organization_id = p_org), 'Africa/Dakar') as z),
  cl as (
    select c.* from public.cash_closings c, tz
    where c.organization_id = p_org and (c.closed_at at time zone tz.z)::date = p_date
      and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
  )
  select jsonb_build_object(
    'date', to_char(p_date, 'DD/MM'),
    'stations', coalesce((select jsonb_agg(jsonb_build_object('station', s.name, 'ca_fcfa', x.ca, 'variance_fcfa', x.v, 'shifts', x.n) order by s.name)
                  from (select station_id, sum(expected_total_fcfa) ca, sum(variance_fcfa) v, count(*) n from cl group by station_id) x
                  join public.stations s on s.id = x.station_id), '[]'::jsonb),
    'ca_total_fcfa', coalesce((select sum(expected_total_fcfa) from cl), 0),
    'variance_total_fcfa', coalesce((select sum(variance_fcfa) from cl), 0),
    'closings', (select count(*) from cl),
    'stations_total', (select count(*) from public.stations st where st.organization_id = p_org and st.active),
    'alerts', (select count(*) from public.alerts a, tz where a.organization_id = p_org and (a.created_at at time zone tz.z)::date = p_date and a.severity = 'critical')
  );
$$;
revoke all on function public.build_summary_report(uuid, date) from public, anon;
grant execute on function public.build_summary_report(uuid, date) to authenticated, service_role;

create or replace function public.render_summary_report(r jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Résumé du ' || (r ->> 'date') || ' · ' || (r ->> 'closings') || ' clôture(s) sur ' || (r ->> 'stations_total') || ' station(s)' || E'\n'
    || coalesce((select string_agg('• ' || (x ->> 'station') || ' : ' || public.format_fcfa((x ->> 'ca_fcfa')::bigint) || ' FCFA'
                 || case when (x ->> 'variance_fcfa')::bigint <> 0 then ' · écart ' || public.format_fcfa((x ->> 'variance_fcfa')::bigint) else ' · caisse OK' end, E'\n')
                 from jsonb_array_elements(r -> 'stations') x), '') || E'\n'
    || 'Total : ' || public.format_fcfa((r ->> 'ca_total_fcfa')::bigint) || ' FCFA · alertes graves : ' || (r ->> 'alerts');
$$;
revoke all on function public.render_summary_report(jsonb) from public, anon;
grant execute on function public.render_summary_report(jsonb) to authenticated, service_role;

create or replace function public.enqueue_summary_report(p_org uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  d record;
  v_n integer := 0;
begin
  if (select count(*) from public.stations s where s.organization_id = p_org and s.active) < 2 then return 0; end if;
  r := public.build_summary_report(p_org, p_date);
  if (r ->> 'closings')::int = 0 then return 0; end if;
  for d in select * from public.notification_recipients nr where nr.organization_id = p_org and nr.active and nr.receives_report loop
    if private.enqueue_notification(p_org, null, 'summary_report', d.id, d.phone_e164, 'stationsure_resume_journee', r, public.render_summary_report(r),
                                    'summary:' || p_org::text || ':' || p_date::text || ':' || d.id::text || ':' || (r ->> 'closings')) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.enqueue_summary_report(uuid, date) from public, anon;
grant execute on function public.enqueue_summary_report(uuid, date) to service_role;

-- Après chaque clôture : rapport immédiat si le mode le prévoit (+ résumé quand toutes les stations ont clôturé).
create or replace function private.after_cash_closing_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode public.report_mode;
  v_tz text;
  v_date date;
begin
  select os.report_mode, os.report_timezone into v_mode, v_tz from public.organization_settings os where os.organization_id = new.organization_id;
  if coalesce(v_mode, 'after_each_closing') = 'after_each_closing' then
    perform public.enqueue_evening_report(new.id);
    v_date := (new.closed_at at time zone coalesce(v_tz, 'Africa/Dakar'))::date;
    if (select count(distinct c.station_id) from public.cash_closings c where c.organization_id = new.organization_id
          and (c.closed_at at time zone coalesce(v_tz, 'Africa/Dakar'))::date = v_date)
       >= (select count(*) from public.stations s where s.organization_id = new.organization_id and s.active) then
      perform public.enqueue_summary_report(new.organization_id, v_date);
    end if;
  end if;
  return new;
end;
$$;
create trigger after_cash_closing_notify after insert on public.cash_closings for each row execute function private.after_cash_closing_notify();

-- Mode « heure fixe » : appelé toutes les 5 minutes par pg_cron ; envoie les rapports du jour à l'heure choisie (idempotent).
create or replace function public.dispatch_scheduled_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  c record;
  v_n integer := 0;
  v_now_local timestamp;
begin
  for o in select * from public.organization_settings os where os.report_mode = 'fixed_time' loop
    v_now_local := now() at time zone o.report_timezone;
    if v_now_local::time >= o.report_time and v_now_local::time < o.report_time + interval '5 minutes' then
      for c in select cl.* from public.cash_closings cl where cl.organization_id = o.organization_id
                 and (cl.closed_at at time zone o.report_timezone)::date = v_now_local::date loop
        v_n := v_n + public.enqueue_evening_report(c.id);
      end loop;
      v_n := v_n + public.enqueue_summary_report(o.organization_id, v_now_local::date);
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.dispatch_scheduled_reports() from public, anon, authenticated;
grant execute on function public.dispatch_scheduled_reports() to service_role;

-- -----------------------------------------------------------------------------
-- E. Alertes en temps réel : message court, routage, anti-spam 10 min.
-- -----------------------------------------------------------------------------
create or replace function public.render_alert_message(p_alert_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
  v_station text;
  v_who text;
  v_base text;
  v_what text;
begin
  select * into a from public.alerts al where al.id = p_alert_id;
  select s.name into v_station from public.stations s where s.id = a.station_id;
  select e.full_name into v_who from public.employees e where e.id = (a.payload ->> 'employee_id')::uuid;
  select os.web_base_url into v_base from public.organization_settings os where os.organization_id = a.organization_id;
  v_what := case a.type
    when 'cash_variance' then 'Écart de caisse ' || public.format_fcfa((a.payload ->> 'variance_fcfa')::bigint) || ' FCFA'
    when 'handover_mismatch' then 'Passation : écart de ' || coalesce(public.format_litres(abs((a.payload -> 'mismatches' -> 0 ->> 'variance_cl')::bigint)), '?') || ' L sur ' || coalesce(a.payload -> 'mismatches' -> 0 ->> 'label', '?')
    when 'delivery_shortfall' then 'Livraison avec réserve : ' || public.format_pct((a.payload ->> 'variance_pct')::numeric) || ' (' || public.format_litres((a.payload ->> 'received_cl')::bigint) || ' L reçus / ' || public.format_litres((a.payload ->> 'invoiced_cl')::bigint) || ' L facturés)'
    when 'meter_regression' then 'Index qui recule sur un pistolet (' || public.format_litres((a.payload ->> 'index_cl')::bigint) || ' L après ' || public.format_litres((a.payload ->> 'previous_index_cl')::bigint) || ' L)'
    when 'pin_lockout' then 'PIN bloqué après 5 échecs : ' || coalesce(a.payload ->> 'full_name', '?')
    when 'tank_variance' then 'Écart de cuve ' || public.format_pct((a.payload ->> 'variance_pct')::numeric)
    when 'deposit_missing' then 'Bordereau de versement manquant depuis ' || coalesce(a.payload ->> 'hours', '24') || ' h'
    when 'deposit_mismatch' then 'Versement ' || public.format_fcfa((a.payload ->> 'amount_fcfa')::bigint) || ' FCFA ≠ espèces comptées ' || public.format_fcfa((a.payload ->> 'counted_cash_fcfa')::bigint)
    when 'void_over_limit' then 'Annulation ' || public.format_fcfa((a.payload ->> 'amount_fcfa')::bigint) || ' FCFA au-delà du plafond'
    when 'void_requested' then 'Annulation demandée : ' || public.format_fcfa((a.payload ->> 'amount_fcfa')::bigint) || ' FCFA'
    when 'mobile_money_unmatched' then 'Paiement mobile money sans vente : ' || coalesce(a.payload ->> 'reference', '?')
    when 'mobile_money_pending' then 'Paiement ' || coalesce(a.payload ->> 'external_ref', '?') || ' non rapproché après 24 h'
    else replace(a.type::text, '_', ' ')
  end;
  return '⚠️ ' || coalesce(v_station, 'Organisation') || ' · ' || v_what
    || case when v_who is not null then ' · ' || v_who else '' end
    || E'\n' || coalesce(v_base, 'http://localhost:3000') || '/alertes?id=' || a.id::text;
end;
$$;
revoke all on function public.render_alert_message(uuid) from public, anon;
grant execute on function public.render_alert_message(uuid) to authenticated, service_role;

create or replace function private.after_alert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  v_key text;
  v_bucket text := to_char(floor(extract(epoch from now()) / 600), 'FM999999999');
  v_body text;
  v_existing uuid;
begin
  if public.alert_route_for(new.organization_id, new.type) <> 'immediate' then
    return new;
  end if;
  v_body := public.render_alert_message(new.id);
  for d in select * from public.notification_recipients nr where nr.organization_id = new.organization_id and nr.active and nr.receives_alerts loop
    -- Anti-spam : une alerte identique (station + type) par destinataire et par tranche de 10 min.
    v_key := 'alert:' || coalesce(new.station_id::text, 'org') || ':' || new.type::text || ':' || d.id::text || ':' || v_bucket;
    select o.id into v_existing from public.notification_outbox o where o.idempotency_key = v_key;
    if v_existing is not null then
      update public.notification_outbox set variables = jsonb_set(variables, '{count}', to_jsonb(coalesce((variables ->> 'count')::int, 1) + 1)) where id = v_existing;
    else
      perform private.enqueue_notification(new.organization_id, new.station_id, 'alert', d.id, d.phone_e164, 'stationsure_alerte',
        jsonb_build_object('alert_id', new.id, 'type', new.type, 'count', 1), v_body, v_key);
    end if;
  end loop;
  return new;
end;
$$;
create trigger after_alert_notify after insert on public.alerts for each row execute function private.after_alert_notify();

-- Relance du gérant (écran 17) : message au gérant qui a clôturé, s'il a un numéro.
create or replace function public.remind_manager(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  e record;
  s record;
  v_id uuid;
  v_body text;
begin
  select cl.* into c from public.cash_closings cl where cl.shift_id = p_shift_id order by cl.closed_at desc limit 1;
  if c is null or not public.is_org_owner(c.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into e from public.employees emp where emp.id = c.employee_id;
  if e.phone_e164 is null then
    return jsonb_build_object('ok', false, 'error', 'NO_PHONE');
  end if;
  select * into s from public.stations st where st.id = c.station_id;
  v_body := 'Bonjour ' || e.full_name || ', le bordereau de versement du ' || to_char(c.closed_at at time zone 'Africa/Dakar', 'DD/MM')
    || ' (' || s.name || ', espèces comptées ' || public.format_fcfa(c.counted_cash_fcfa) || ' FCFA) est attendu. Merci de le photographier dans StationSûre.';
  v_id := private.enqueue_notification(c.organization_id, c.station_id, 'reminder', null, e.phone_e164, 'stationsure_relance_bordereau',
    jsonb_build_object('shift_id', p_shift_id, 'employee_id', e.id, 'amount_fcfa', c.counted_cash_fcfa), v_body,
    'reminder:' || p_shift_id::text || ':' || to_char(now(), 'YYYYMMDDHH24'));
  return jsonb_build_object('ok', v_id is not null, 'outbox_id', v_id, 'error', case when v_id is null then 'ALREADY_SENT' end);
end;
$$;
revoke all on function public.remind_manager(uuid) from public, anon;
grant execute on function public.remind_manager(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- F. Worker : réclamation d'un lot, statut, secours SMS, webhook de livraison.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(p_limit integer default 20)
returns setof public.notification_outbox
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox o
  set attempts = o.attempts + 1,
      next_attempt_at = now() + interval '2 minutes' -- bail : un worker planté ne bloque pas le message
  where o.id in (
    select x.id from public.notification_outbox x
    where x.status = 'queued' and x.next_attempt_at <= now()
    order by x.next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning o.*;
$$;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

create or replace function public.set_notification_status(p_id uuid, p_status public.notification_status, p_error text default null, p_provider_message_id text default null, p_retry_after_seconds integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
  set status = p_status,
      last_error = p_error,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      sent_at = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      next_attempt_at = case when p_status = 'queued' and p_retry_after_seconds is not null then now() + make_interval(secs => p_retry_after_seconds) else next_attempt_at end
  where id = p_id;
end;
$$;
revoke all on function public.set_notification_status(uuid, public.notification_status, text, text, integer) from public, anon, authenticated;
grant execute on function public.set_notification_status(uuid, public.notification_status, text, text, integer) to service_role;

-- SMS de secours : WhatsApp envoyé mais non délivré après le délai → message SMS.
create or replace function public.escalate_undelivered()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_n integer := 0;
begin
  for o in
    select x.* from public.notification_outbox x
    join public.organization_settings os on os.organization_id = x.organization_id and os.sms_fallback
    where x.channel = 'whatsapp' and x.status = 'sent' and x.sent_at < now() - make_interval(mins => os.sms_fallback_minutes)
      and not exists (select 1 from public.notification_outbox f where f.fallback_of = x.id)
  loop
    insert into public.notification_outbox (organization_id, station_id, kind, channel, recipient_id, to_phone, template, variables, body, idempotency_key, fallback_of)
    values (o.organization_id, o.station_id, o.kind, 'sms', o.recipient_id, o.to_phone, o.template, o.variables, o.body, 'sms:' || o.idempotency_key, o.id)
    on conflict (idempotency_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.escalate_undelivered() from public, anon, authenticated;
grant execute on function public.escalate_undelivered() to service_role;

-- Statut de livraison reçu du fournisseur (webhook) : par identifiant de message.
create or replace function public.record_delivery_status(p_provider_message_id text, p_status text, p_error text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.notification_outbox
  set status = case p_status when 'delivered' then 'delivered'::public.notification_status when 'read' then 'delivered'::public.notification_status when 'failed' then 'failed'::public.notification_status else status end,
      delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, now()) else delivered_at end,
      last_error = coalesce(p_error, last_error)
  where provider_message_id = p_provider_message_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.record_delivery_status(text, text, text) from public, anon, authenticated;
grant execute on function public.record_delivery_status(text, text, text) to service_role;

-- Configuration d'appel du worker par pg_cron + pg_net (jamais exposée).
create table private.notify_config (
  id boolean primary key default true check (id),
  worker_url text not null,
  worker_secret text not null,
  enabled boolean not null default true
);
insert into private.notify_config (worker_url, worker_secret)
values ('http://host.docker.internal:54721/functions/v1/notify-worker', 'dev-notify-secret');

create or replace function private.call_notify_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
begin
  select * into cfg from private.notify_config where id and enabled;
  if cfg is null then return; end if;
  if not exists (select 1 from public.notification_outbox where status = 'queued' and next_attempt_at <= now())
     and not exists (select 1 from public.notification_outbox where channel = 'whatsapp' and status = 'sent' and sent_at < now() - interval '10 minutes') then
    return;
  end if;
  perform net.http_post(
    url := cfg.worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', cfg.worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

select cron.schedule('stationsure-notify-worker', '* * * * *', $$select private.call_notify_worker();$$);
select cron.schedule('stationsure-rapports-heure-fixe', '*/5 * * * *', $$select public.dispatch_scheduled_reports();$$);

-- -----------------------------------------------------------------------------
-- G. Tableau de bord (écran 05), alertes, score d'écart.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_from timestamptz, p_to timestamptz, p_station_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (select public.current_org_ids() as id),
  st as (select s.* from public.stations s where s.organization_id in (select id from orgs) and s.active and (p_station_id is null or s.id = p_station_id)),
  cl as (
    select c.* from public.cash_closings c where c.station_id in (select id from st) and c.closed_at >= p_from and c.closed_at < p_to
      and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
  ),
  litres as (
    select c.station_id, n ->> 'fuel_product_code' as product, sum((sl ->> 'litres_cl')::bigint) as cl
    from cl c, jsonb_array_elements(case when jsonb_typeof(c.details) = 'array' then c.details else '[]'::jsonb end) n, jsonb_array_elements(n -> 'slices') sl
    group by c.station_id, n ->> 'fuel_product_code'
  ),
  tank as (
    select r.station_id, (r.details ->> 'variance_pct')::numeric as pct, r.status, row_number() over (partition by r.station_id order by r.created_at desc) rn
    from public.reconciliations r where r.kind = 'tank' and r.station_id in (select id from st) and r.created_at >= p_from and r.created_at < p_to
  ),
  today as (
    select s.id as station_id,
      (select sh.status::text from public.shifts sh where sh.station_id = s.id order by sh.opened_at desc limit 1) as last_status
    from st s
  )
  select jsonb_build_object(
    'ca_fcfa', coalesce((select sum(expected_total_fcfa) from cl), 0),
    'ca_fuel_fcfa', coalesce((select sum(expected_fuel_fcfa) from cl), 0),
    'ca_shop_fcfa', coalesce((select sum(expected_shop_fcfa) from cl), 0),
    'ca_garage_fcfa', coalesce((select sum(expected_garage_fcfa) from cl), 0),
    'ca_wash_fcfa', coalesce((select sum(expected_wash_fcfa) from cl), 0),
    'mobile_fcfa', coalesce((select sum(wave_fcfa + orange_money_fcfa) from cl), 0),
    'litres_super_cl', coalesce((select sum(cl) from litres where product = 'super'), 0),
    'litres_gasoil_cl', coalesce((select sum(cl) from litres where product = 'gasoil'), 0),
    'cash_variance_fcfa', coalesce((select sum(variance_fcfa) from cl where abs(variance_fcfa) > public.effective_setting(station_id, 'cash_tolerance_fcfa')), 0),
    'cash_variance_shifts', (select count(*) from cl where abs(variance_fcfa) > public.effective_setting(station_id, 'cash_tolerance_fcfa')),
    'shifts', (select count(*) from cl),
    'tank_alerts', (select count(*) from public.alerts a where a.type = 'tank_variance' and a.station_id in (select id from st) and a.created_at >= p_from and a.created_at < p_to),
    'stations', coalesce((select jsonb_agg(jsonb_build_object(
        'station_id', s.id, 'name', s.name,
        'ca_fcfa', coalesce((select sum(expected_total_fcfa) from cl where station_id = s.id), 0),
        'litres_cl', coalesce((select sum(cl) from litres where station_id = s.id), 0),
        'cash_variance_fcfa', coalesce((select sum(variance_fcfa) from cl where station_id = s.id and abs(variance_fcfa) > public.effective_setting(s.id, 'cash_tolerance_fcfa')), 0),
        'tank_variance_pct', (select pct from tank where station_id = s.id and rn = 1),
        'tank_status', (select status from tank where station_id = s.id and rn = 1),
        'closure_status', (select last_status from today where station_id = s.id)
      ) order by s.name) from st s), '[]'::jsonb)
  );
$$;
revoke all on function public.dashboard_summary(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.dashboard_summary(timestamptz, timestamptz, uuid) to authenticated;

-- Score d'écart par employé (docs/score-ecart.md) : incidents pondérés sur N jours, normalisé 0-100.
create or replace function public.employee_variance_scores(p_days integer default 30, p_station_id uuid default null)
returns table (employee_id uuid, full_name text, station_id uuid, station_name text, shifts integer, cash_variances integer, handover_variances integer, rejected_voids integer, meter_regressions integer, weighted numeric, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (select public.current_org_ids() as id),
  emp as (select e.* from public.employees e join public.stations s on s.id = e.station_id where s.organization_id in (select id from orgs) and (p_station_id is null or e.station_id = p_station_id)),
  since as (select now() - make_interval(days => p_days) as t),
  sh as (
    select e.id as employee_id, count(distinct s.id) as n
    from emp e left join public.shifts s on (s.opened_by = e.id or s.closed_by = e.id) and s.opened_at >= (select t from since)
    group by e.id
  ),
  cv as (
    select c.employee_id, count(*) as n from public.cash_closings c, since
    where c.closed_at >= since.t and abs(c.variance_fcfa) > public.effective_setting(c.station_id, 'cash_tolerance_fcfa')
      and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
    group by c.employee_id
  ),
  hv as (
    select h.outgoing_employee_id as employee_id, count(*) as n from public.shift_handovers h, since
    where h.created_at >= since.t and h.attributed_shift_id is not null group by h.outgoing_employee_id
  ),
  rv as (
    select v.employee_id, count(*) as n from public.voids v join public.void_approvals a on a.void_id = v.id and a.decision = 'rejected', since
    where v.created_at >= since.t and v.employee_id is not null group by v.employee_id
  ),
  mr as (
    select m.employee_id, count(*) as n from public.meter_readings m, since where m.flagged_regression and m.created_at >= since.t group by m.employee_id
  )
  select e.id, e.full_name, e.station_id, s.name, coalesce(sh.n, 0)::int, coalesce(cv.n, 0)::int, coalesce(hv.n, 0)::int, coalesce(rv.n, 0)::int, coalesce(mr.n, 0)::int,
    (coalesce(cv.n, 0) * 1.0 + coalesce(hv.n, 0) * 1.0 + coalesce(rv.n, 0) * 0.5 + coalesce(mr.n, 0) * 0.5)::numeric as weighted,
    least(100, round(400 * (coalesce(cv.n, 0) * 1.0 + coalesce(hv.n, 0) * 1.0 + coalesce(rv.n, 0) * 0.5 + coalesce(mr.n, 0) * 0.5) / greatest(coalesce(sh.n, 0), 1)))::int as score
  from emp e
  join public.stations s on s.id = e.station_id
  left join sh on sh.employee_id = e.id
  left join cv on cv.employee_id = e.id
  left join hv on hv.employee_id = e.id
  left join rv on rv.employee_id = e.id
  left join mr on mr.employee_id = e.id
  where e.active
  order by score desc, e.full_name;
$$;
revoke all on function public.employee_variance_scores(integer, uuid) from public, anon;
grant execute on function public.employee_variance_scores(integer, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- H. Superviseurs : invitations (créées par l'Edge Function invite-supervisor) et révocation.
-- -----------------------------------------------------------------------------
create table public.supervisor_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid references auth.users (id) on delete set null,
  status public.invitation_status not null default 'sent',
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (organization_id, email)
);
comment on table public.supervisor_invitations is 'Invitations de superviseurs (lecture seule). Créées par l''Edge Function invite-supervisor (inviteUserByEmail), acceptées à la première connexion.';
select private.enable_audit('public.supervisor_invitations');
alter table public.supervisor_invitations enable row level security;
select private.policy_select_org('public.supervisor_invitations');
revoke insert, update, delete on public.supervisor_invitations from authenticated;

-- Service : enregistre l'invitation et le membre superviseur (idempotent).
create or replace function public.register_supervisor_invitation(p_org uuid, p_email text, p_user_id uuid, p_invited_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.org_members m where m.organization_id = p_org and m.user_id = p_invited_by and m.role = 'owner') then
    raise exception 'FORBIDDEN: seul le propriétaire invite' using errcode = '42501';
  end if;
  insert into public.supervisor_invitations (organization_id, email, user_id, invited_by)
  values (p_org, lower(trim(p_email)), p_user_id, p_invited_by)
  on conflict (organization_id, email) do update set user_id = excluded.user_id, status = 'sent', invited_by = excluded.invited_by, invited_at = now(), revoked_at = null
  returning id into v_id;
  insert into public.org_members (organization_id, user_id, role) values (p_org, p_user_id, 'supervisor') on conflict (organization_id, user_id) do nothing;
  return v_id;
end;
$$;
revoke all on function public.register_supervisor_invitation(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_supervisor_invitation(uuid, text, uuid, uuid) to service_role;

-- Acceptée = le superviseur s'est connecté (mis à jour à la lecture).
create or replace function public.supervisor_invitation_status(p_invitation_id uuid)
returns public.invitation_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when i.status = 'revoked' then 'revoked'::public.invitation_status
    when exists (select 1 from auth.users u where u.id = i.user_id and u.last_sign_in_at is not null) then 'accepted'::public.invitation_status
    else i.status end
  from public.supervisor_invitations i where i.id = p_invitation_id and i.organization_id in (select public.current_org_ids());
$$;
revoke all on function public.supervisor_invitation_status(uuid) from public, anon;
grant execute on function public.supervisor_invitation_status(uuid) to authenticated;

create or replace function public.revoke_supervisor(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
begin
  select * into i from public.supervisor_invitations si where si.id = p_invitation_id;
  if i is null or not public.is_org_owner(i.organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.supervisor_invitations set status = 'revoked', revoked_at = now() where id = p_invitation_id;
  delete from public.org_members where organization_id = i.organization_id and user_id = i.user_id and role = 'supervisor';
end;
$$;
revoke all on function public.revoke_supervisor(uuid) from public, anon;
grant execute on function public.revoke_supervisor(uuid) to authenticated;
