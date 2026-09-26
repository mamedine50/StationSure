-- =============================================================================
-- 0014 — Caisse et clôture : paiements (références, TPE), ventes en une RPC,
-- rapprochement mobile money, crédit client (demande, remboursement, relevé),
-- annulations et approbations, relevés de changement de prix, billetage à
-- l'aveugle, attendu / écart, clôture, décisions, versements, pg_cron.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Alertes d'organisation (sans station) et plafonds d'annulation par rôle.
-- -----------------------------------------------------------------------------
alter table public.alerts alter column station_id drop not null;

create table public.void_role_limits (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.employee_role not null,
  max_fcfa bigint not null check (max_fcfa >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, role)
);
comment on table public.void_role_limits is 'Plafond d''annulation par rôle et par organisation (au-delà : alerte void_over_limit). Sans ligne : valeurs par défaut de void_limit_for().';
select private.enable_updated_at('public.void_role_limits');
select private.enable_audit('public.void_role_limits');
alter table public.void_role_limits enable row level security;
select private.policy_select_org('public.void_role_limits');
select private.policy_write_owner('public.void_role_limits');

create or replace function public.void_limit_for(p_org uuid, p_role public.employee_role)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.max_fcfa from public.void_role_limits l where l.organization_id = p_org and l.role = p_role),
    case p_role when 'manager' then 50000 when 'shop_cashier' then 25000 else 10000 end
  );
$$;
revoke all on function public.void_limit_for(uuid, public.employee_role) from public, anon;
grant execute on function public.void_limit_for(uuid, public.employee_role) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- B. Paiements : référence obligatoire et unique par opérateur, 4 derniers
-- chiffres du ticket TPE, jamais de numéro de carte.
-- -----------------------------------------------------------------------------
alter table public.payments add column card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
alter table public.payments add constraint payments_method_details_check check (
  (method in ('wave', 'orange_money') and length(trim(coalesce(external_ref, ''))) >= 4)
  or (method = 'card' and card_last4 is not null)
  or method in ('cash', 'credit')
);
create unique index payments_mobile_ref_unique_idx on public.payments (organization_id, method, external_ref)
  where method in ('wave', 'orange_money');
comment on column public.payments.card_last4 is 'Carte : 4 derniers chiffres du ticket TPE. Jamais de numéro de carte.';

-- Ventes carburant interdites sur un pistolet en pause (règle phase 3 étendue aux lignes).
create or replace function private.check_item_nozzle_not_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nozzle_id is not null and public.nozzle_is_paused(new.nozzle_id) then
    raise exception 'NOZZLE_PAUSED: vente impossible sur un pistolet en pause (dépotage)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger check_item_nozzle_not_paused before insert on public.transaction_items
  for each row execute function private.check_item_nozzle_not_paused();

-- -----------------------------------------------------------------------------
-- C. Rapprochement mobile money.
-- -----------------------------------------------------------------------------
create table public.mobile_money_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.mobile_money_provider not null,
  filename text,
  mapping jsonb not null default '{}'::jsonb,
  line_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.mobile_money_imports is 'Imports de relevés marchands (CSV aujourd''hui, API demain via le même format de lignes).';

create table public.mobile_money_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_id uuid not null references public.mobile_money_imports (id) on delete cascade,
  provider public.mobile_money_provider not null,
  reference text not null,
  amount_fcfa bigint not null check (amount_fcfa > 0),
  paid_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, reference)
);
comment on table public.mobile_money_statement_lines is 'Lignes du relevé marchand. Append-only.';

create table public.payment_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid,
  payment_id uuid references public.payments (id) on delete cascade,
  statement_line_id uuid references public.mobile_money_statement_lines (id) on delete cascade,
  status public.payment_match_status not null,
  created_at timestamptz not null default now(),
  check (payment_id is not null or statement_line_id is not null)
);
comment on table public.payment_matches is 'Résultat du rapprochement : matched (paiement ↔ ligne), unmatched (ligne sans paiement) ou pending (paiement sans ligne après 24 h). Append-only.';
create index payment_matches_payment_idx on public.payment_matches (payment_id, created_at desc);

select private.enable_append_only('public.mobile_money_statement_lines');
select private.enable_append_only('public.payment_matches');
alter table public.mobile_money_imports enable row level security;
alter table public.mobile_money_statement_lines enable row level security;
alter table public.payment_matches enable row level security;
select private.policy_select_org('public.mobile_money_imports');
select private.policy_select_org('public.mobile_money_statement_lines');
select private.policy_select_org('public.payment_matches');
select private.policy_select_device('public.payment_matches');
revoke insert, update, delete on public.mobile_money_imports, public.mobile_money_statement_lines, public.payment_matches from authenticated;

-- Statut courant d'un paiement électronique.
create or replace function public.payment_match_status(p_payment_id uuid)
returns public.payment_match_status
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.status from public.payment_matches m where m.payment_id = p_payment_id order by m.created_at desc limit 1),
    'pending'::public.payment_match_status
  );
$$;
revoke all on function public.payment_match_status(uuid) from public, anon;
grant execute on function public.payment_match_status(uuid) to authenticated, service_role;

-- Import d'un relevé (owner) puis rapprochement : référence + montant + date à ± 24 h.
create or replace function public.import_mobile_money_statement(p_provider public.mobile_money_provider, p_lines jsonb, p_filename text default null, p_mapping jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_import uuid;
  v_line record;
  v_line_id uuid;
  v_payment record;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_count integer := 0;
  v_method public.payment_method := case p_provider when 'wave' then 'wave'::public.payment_method else 'orange_money'::public.payment_method end;
begin
  select m.organization_id into v_org from public.org_members m where m.user_id = auth.uid() and m.role = 'owner' limit 1;
  if v_org is null then
    raise exception 'FORBIDDEN: seul le propriétaire importe un relevé' using errcode = '42501';
  end if;
  insert into public.mobile_money_imports (organization_id, provider, filename, mapping, imported_by)
  values (v_org, p_provider, p_filename, coalesce(p_mapping, '{}'::jsonb), auth.uid()) returning id into v_import;

  for v_line in
    select l ->> 'reference' as reference, (l ->> 'amount_fcfa')::bigint as amount_fcfa, (l ->> 'paid_at')::timestamptz as paid_at, coalesce(l -> 'raw', '{}'::jsonb) as raw
    from jsonb_array_elements(p_lines) l
  loop
    if v_line.reference is null or v_line.amount_fcfa is null or v_line.paid_at is null then continue; end if;
    v_count := v_count + 1;
    insert into public.mobile_money_statement_lines (organization_id, import_id, provider, reference, amount_fcfa, paid_at, raw)
    values (v_org, v_import, p_provider, trim(v_line.reference), v_line.amount_fcfa, v_line.paid_at, v_line.raw)
    on conflict (organization_id, provider, reference) do nothing
    returning id into v_line_id;
    if v_line_id is null then
      select s.id into v_line_id from public.mobile_money_statement_lines s where s.organization_id = v_org and s.provider = p_provider and s.reference = trim(v_line.reference);
      if exists (select 1 from public.payment_matches m where m.statement_line_id = v_line_id and m.status = 'matched') then continue; end if;
    end if;
    select p.* into v_payment from public.payments p
    where p.organization_id = v_org and p.method = v_method and p.external_ref = trim(v_line.reference)
      and p.amount_fcfa = v_line.amount_fcfa and abs(extract(epoch from p.device_created_at - v_line.paid_at)) <= 86400
      and public.payment_match_status(p.id) <> 'matched'
    limit 1;
    if v_payment.id is not null then
      insert into public.payment_matches (organization_id, station_id, payment_id, statement_line_id, status)
      values (v_org, v_payment.station_id, v_payment.id, v_line_id, 'matched');
      v_matched := v_matched + 1;
    else
      insert into public.payment_matches (organization_id, statement_line_id, status) values (v_org, v_line_id, 'unmatched');
      insert into public.alerts (organization_id, station_id, type, severity, payload)
      values (v_org, null, 'mobile_money_unmatched', 'warning',
              jsonb_build_object('provider', p_provider, 'reference', trim(v_line.reference), 'amount_fcfa', v_line.amount_fcfa, 'paid_at', v_line.paid_at, 'import_id', v_import));
      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  update public.mobile_money_imports set line_count = v_count, matched_count = v_matched, unmatched_count = v_unmatched where id = v_import;
  insert into public.reconciliations (organization_id, station_id, kind, expected, actual, status, details)
  select v_org, s.id, 'mobile_money',
         coalesce((select sum(p.amount_fcfa) from public.payments p where p.station_id = s.id and p.method = v_method and p.device_created_at >= now() - interval '31 days'), 0),
         coalesce((select sum(p.amount_fcfa) from public.payments p join public.payment_matches m on m.payment_id = p.id and m.status = 'matched' and m.statement_line_id in (select l.id from public.mobile_money_statement_lines l where l.import_id = v_import) where p.station_id = s.id), 0),
         (case when v_unmatched = 0 then 'ok' else 'variance' end)::public.reconciliation_status,
         jsonb_build_object('import_id', v_import, 'provider', p_provider, 'matched', v_matched, 'unmatched', v_unmatched)
  from public.stations s where s.organization_id = v_org;
  perform public.flag_pending_mobile_money();
  return jsonb_build_object('ok', true, 'import_id', v_import, 'lines', v_count, 'matched', v_matched, 'unmatched', v_unmatched);
end;
$$;
comment on function public.import_mobile_money_statement(public.mobile_money_provider, jsonb, text, jsonb) is 'Owner : importe un relevé marchand (lignes normalisées {reference, amount_fcfa, paid_at, raw}) et rapproche par référence + montant + date ± 24 h.';
revoke all on function public.import_mobile_money_statement(public.mobile_money_provider, jsonb, text, jsonb) from public, anon;
grant execute on function public.import_mobile_money_statement(public.mobile_money_provider, jsonb, text, jsonb) to authenticated;

-- Paiements Wave / OM toujours pending après 24 h → alerte (une seule par paiement).
create or replace function public.flag_pending_mobile_money()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  p record;
begin
  for p in
    select pay.*, t.shift_id as shift_id from public.payments pay join public.transactions t on t.id = pay.transaction_id
    where pay.method in ('wave', 'orange_money') and pay.device_created_at < now() - interval '24 hours'
      and public.payment_match_status(pay.id) = 'pending'
      and not exists (select 1 from public.alerts a where a.type = 'mobile_money_pending' and a.payload ->> 'payment_id' = pay.id::text)
  loop
    insert into public.payment_matches (organization_id, station_id, payment_id, status) values (p.organization_id, p.station_id, p.id, 'pending');
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (p.organization_id, p.station_id, p.shift_id, 'mobile_money_pending', 'warning',
            jsonb_build_object('payment_id', p.id, 'method', p.method, 'external_ref', p.external_ref, 'amount_fcfa', p.amount_fcfa, 'employee_id', p.employee_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.flag_pending_mobile_money() from public, anon;
grant execute on function public.flag_pending_mobile_money() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- D. Crédit client : demande par le gérant, activation par l'owner, bon signé,
-- remboursements, relevé de compte.
-- -----------------------------------------------------------------------------
alter table public.credit_accounts
  add column status public.credit_account_status not null default 'active',
  add column requested_by_employee_id uuid,
  add column requested_at timestamptz,
  add column decided_by uuid references auth.users (id) on delete set null,
  add column decided_at timestamptz;
alter table public.credit_accounts add constraint credit_accounts_status_active_check check (active = (status = 'active'));
alter table public.credit_accounts add constraint credit_accounts_requested_fk foreign key (requested_by_employee_id, station_id) references public.employees (id, station_id) on delete set null;

alter table public.credit_entries
  add column vehicle_plate text,
  add column evidence_id uuid;
alter table public.credit_entries add constraint credit_entries_evidence_fk foreign key (evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict;
alter table public.credit_entries add constraint credit_entries_sale_evidence_check check (kind <> 'sale' or evidence_id is not null);
comment on column public.credit_entries.evidence_id is 'Vente à crédit : photo du bon signé par le chauffeur (obligatoire).';

-- Le gérant demande un compte : plafond 0, statut pending, inactif tant que l'owner ne l'a pas validé.
create or replace function public.request_credit_account(p_customer_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant demande un compte crédit' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;
  insert into public.credit_accounts (organization_id, station_id, customer_name, phone, limit_fcfa, active, status, requested_by_employee_id, requested_at)
  values (ctx.organization_id, ctx.station_id, trim(p_customer_name), nullif(trim(coalesce(p_phone, '')), ''), 0, false, 'pending', ctx.employee_id, now())
  returning id into v_id;
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (ctx.organization_id, ctx.station_id, 'credit_account_requested', 'info',
          jsonb_build_object('credit_account_id', v_id, 'customer_name', trim(p_customer_name), 'employee_id', ctx.employee_id));
  return v_id;
end;
$$;
revoke all on function public.request_credit_account(text, text) from public, anon;
grant execute on function public.request_credit_account(text, text) to authenticated;

create or replace function public.decide_credit_account(p_account_id uuid, p_approve boolean, p_limit_fcfa bigint default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc record;
begin
  select * into v_acc from public.credit_accounts a where a.id = p_account_id for update;
  if v_acc is null or not public.is_org_owner(v_acc.organization_id) then
    raise exception 'FORBIDDEN: seul le propriétaire active un compte crédit' using errcode = '42501';
  end if;
  if v_acc.status <> 'pending' then
    raise exception 'ACCOUNT_NOT_PENDING' using errcode = 'P0001';
  end if;
  if p_approve then
    if p_limit_fcfa is null or p_limit_fcfa <= 0 then
      raise exception 'LIMIT_REQUIRED: plafond > 0 attendu' using errcode = '22023';
    end if;
    update public.credit_accounts set status = 'active', active = true, limit_fcfa = p_limit_fcfa, decided_by = auth.uid(), decided_at = now() where id = p_account_id;
  else
    update public.credit_accounts set status = 'rejected', active = false, decided_by = auth.uid(), decided_at = now() where id = p_account_id;
  end if;
end;
$$;
revoke all on function public.decide_credit_account(uuid, boolean, bigint) from public, anon;
grant execute on function public.decide_credit_account(uuid, boolean, bigint) to authenticated;

-- Solde et relevé d'un compte (membres de l'organisation + appareil de la station).
create or replace function public.credit_account_balance(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.amount_fcfa), 0)::bigint from public.credit_entries e
  where e.credit_account_id = p_account_id and e.station_id in (select public.current_station_ids());
$$;
revoke all on function public.credit_account_balance(uuid) from public, anon;
grant execute on function public.credit_account_balance(uuid) to authenticated, service_role;

create or replace function public.credit_account_statement(p_account_id uuid)
returns table (entry_id uuid, at timestamptz, kind public.credit_entry_kind, amount_fcfa bigint, balance_fcfa bigint, vehicle_plate text, employee_name text, transaction_id uuid, payment_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.device_created_at, e.kind, e.amount_fcfa,
         sum(e.amount_fcfa) over (order by e.device_created_at, e.created_at rows unbounded preceding)::bigint,
         e.vehicle_plate, emp.full_name, e.transaction_id, e.payment_id
  from public.credit_entries e
  join public.employees emp on emp.id = e.employee_id
  where e.credit_account_id = p_account_id and e.station_id in (select public.current_station_ids())
  order by e.device_created_at, e.created_at;
$$;
revoke all on function public.credit_account_statement(uuid) from public, anon;
grant execute on function public.credit_account_statement(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- E. Vente en une transaction atomique (transaction + lignes + paiement + crédit).
-- -----------------------------------------------------------------------------
create or replace function public.record_sale(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_kind public.transaction_kind := (p ->> 'kind')::public.transaction_kind;
  v_method public.payment_method := (p ->> 'method')::public.payment_method;
  v_amount bigint := (p ->> 'amount_fcfa')::bigint;
  v_tx uuid;
  v_pay uuid;
  v_now timestamptz := coalesce((p ->> 'device_created_at')::timestamptz, now());
  v_account record;
  v_account_id uuid;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.id = (p ->> 'shift_id')::uuid and s.station_id = ctx.station_id;
  if v_shift is null or v_shift.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN');
  end if;
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'AMOUNT_REQUIRED');
  end if;
  if v_kind not in ('fuel', 'shop', 'garage', 'wash') then
    return jsonb_build_object('ok', false, 'error', 'KIND_INVALID');
  end if;
  if v_method = 'credit' then
    select a.* into v_account from public.credit_accounts a where a.id = (p ->> 'credit_account_id')::uuid and a.station_id = ctx.station_id;
    if v_account is null or v_account.status <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'CREDIT_ACCOUNT_INACTIVE');
    end if;
    if (p ->> 'evidence_id') is null then
      return jsonb_build_object('ok', false, 'error', 'CREDIT_NOTE_PHOTO_REQUIRED');
    end if;
    if public.credit_account_balance(v_account.id) + v_amount > v_account.limit_fcfa then
      return jsonb_build_object('ok', false, 'error', 'CREDIT_LIMIT', 'available_fcfa', v_account.limit_fcfa - public.credit_account_balance(v_account.id));
    end if;
    v_account_id := v_account.id;
  end if;

  insert into public.transactions (organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, note, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_shift.id, v_kind, v_amount, p ->> 'note', v_now)
  returning id into v_tx;

  if v_kind = 'fuel' then
    insert into public.transaction_items (organization_id, station_id, transaction_id, nozzle_id, description, quantity, unit_price_fcfa, amount_fcfa)
    values (ctx.organization_id, ctx.station_id, v_tx, (p ->> 'nozzle_id')::uuid,
            coalesce(p ->> 'description', 'Carburant'), coalesce((p ->> 'litres_cl')::bigint, 1), coalesce((p ->> 'unit_price_fcfa')::bigint, v_amount), v_amount);
  else
    insert into public.transaction_items (organization_id, station_id, transaction_id, description, quantity, unit_price_fcfa, amount_fcfa)
    values (ctx.organization_id, ctx.station_id, v_tx, coalesce(p ->> 'description', v_kind::text), 1, v_amount, v_amount);
  end if;

  insert into public.payments (organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, external_ref, card_last4, credit_account_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_tx, v_method, v_amount,
          nullif(trim(coalesce(p ->> 'external_ref', '')), ''), nullif(trim(coalesce(p ->> 'card_last4', '')), ''),
          v_account_id, v_now)
  returning id into v_pay;

  if v_method = 'credit' then
    insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, transaction_id, payment_id, vehicle_plate, evidence_id, device_created_at)
    values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_account_id, 'sale', v_amount, v_tx, v_pay, p ->> 'vehicle_plate', (p ->> 'evidence_id')::uuid, v_now);
  end if;
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'payment_id', v_pay,
                            'match_status', case when v_method in ('wave', 'orange_money') then 'pending' end);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'REFERENCE_DUPLICATE');
end;
$$;
comment on function public.record_sale(jsonb) is 'Appareil : vente atomique {kind, shift_id, amount_fcfa, method, external_ref?, card_last4?, nozzle_id?, litres_cl?, unit_price_fcfa?, credit_account_id?, vehicle_plate?, evidence_id?}. Renvoie {ok:false, error} (REFERENCE_DUPLICATE, CREDIT_LIMIT, …).';
revoke all on function public.record_sale(jsonb) from public, anon;
grant execute on function public.record_sale(jsonb) to authenticated;

-- Remboursement d'un compte crédit : transaction credit_repayment + paiement + écriture négative.
create or replace function public.record_credit_repayment(p_account_id uuid, p_amount_fcfa bigint, p_method public.payment_method, p_external_ref text default null, p_shift_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift uuid;
  v_tx uuid;
  v_pay uuid;
begin
  select * into ctx from private.device_context();
  if p_method not in ('cash', 'wave', 'orange_money') then
    return jsonb_build_object('ok', false, 'error', 'METHOD_INVALID');
  end if;
  if p_amount_fcfa is null or p_amount_fcfa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'AMOUNT_REQUIRED');
  end if;
  if not exists (select 1 from public.credit_accounts a where a.id = p_account_id and a.station_id = ctx.station_id) then
    return jsonb_build_object('ok', false, 'error', 'ACCOUNT_NOT_FOUND');
  end if;
  v_shift := coalesce(p_shift_id, (select s.id from public.shifts s where s.station_id = ctx.station_id and s.status = 'open' order by s.opened_at desc limit 1));
  if v_shift is null then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN');
  end if;
  insert into public.transactions (organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_shift, 'credit_repayment', p_amount_fcfa, now()) returning id into v_tx;
  insert into public.transaction_items (organization_id, station_id, transaction_id, description, quantity, unit_price_fcfa, amount_fcfa)
  values (ctx.organization_id, ctx.station_id, v_tx, 'Remboursement crédit', 1, p_amount_fcfa, p_amount_fcfa);
  insert into public.payments (organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, external_ref, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_tx, p_method, p_amount_fcfa, nullif(trim(coalesce(p_external_ref, '')), ''), now()) returning id into v_pay;
  insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, transaction_id, payment_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, p_account_id, 'repayment', -p_amount_fcfa, v_tx, v_pay, now());
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'payment_id', v_pay, 'balance_fcfa', public.credit_account_balance(p_account_id));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'REFERENCE_DUPLICATE');
end;
$$;
revoke all on function public.record_credit_repayment(uuid, bigint, public.payment_method, text, uuid) from public, anon;
grant execute on function public.record_credit_repayment(uuid, bigint, public.payment_method, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- F. Annulations : montant, approbations append-only, plafond par rôle.
-- -----------------------------------------------------------------------------
alter table public.voids add column amount_fcfa bigint not null check (amount_fcfa > 0);
alter table public.voids add column shift_id uuid;
alter table public.voids add constraint voids_shift_fk foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict;

create table public.void_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  void_id uuid not null unique references public.voids (id) on delete cascade,
  decision public.approval_decision not null,
  decided_by uuid not null references auth.users (id) on delete restrict,
  note text,
  decided_at timestamptz not null default now()
);
comment on table public.void_approvals is 'Décision du propriétaire sur une annulation. Append-only : une seule décision par annulation.';
select private.enable_append_only('public.void_approvals');
alter table public.void_approvals enable row level security;
select private.policy_select_org('public.void_approvals');
select private.policy_select_device('public.void_approvals');
revoke insert, update, delete on public.void_approvals from authenticated;

create or replace function public.void_is_approved(p_void_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.void_approvals a where a.void_id = p_void_id and a.decision = 'approved');
$$;
revoke all on function public.void_is_approved(uuid) from public, anon;
grant execute on function public.void_is_approved(uuid) to authenticated, service_role;

create or replace function public.request_void(p_transaction_id uuid, p_amount_fcfa bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_tx record;
  v_id uuid;
  v_limit bigint;
begin
  select * into ctx from private.device_context();
  select t.* into v_tx from public.transactions t where t.id = p_transaction_id and t.station_id = ctx.station_id;
  if v_tx is null then return jsonb_build_object('ok', false, 'error', 'TRANSACTION_NOT_FOUND'); end if;
  if p_amount_fcfa is null or p_amount_fcfa <= 0 or p_amount_fcfa > v_tx.total_fcfa then
    return jsonb_build_object('ok', false, 'error', 'AMOUNT_INVALID');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;
  if exists (select 1 from public.voids v where v.transaction_id = p_transaction_id and not exists (select 1 from public.void_approvals a where a.void_id = v.id and a.decision = 'rejected')) then
    return jsonb_build_object('ok', false, 'error', 'VOID_EXISTS');
  end if;
  insert into public.voids (organization_id, station_id, device_id, employee_id, transaction_id, reason, amount_fcfa, shift_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, p_transaction_id, trim(p_reason), p_amount_fcfa, v_tx.shift_id, now())
  returning id into v_id;
  v_limit := public.void_limit_for(ctx.organization_id, ctx.employee_role);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (ctx.organization_id, ctx.station_id, v_tx.shift_id, 'void_requested', 'warning',
          jsonb_build_object('void_id', v_id, 'transaction_id', p_transaction_id, 'amount_fcfa', p_amount_fcfa, 'reason', trim(p_reason), 'employee_id', ctx.employee_id));
  if p_amount_fcfa > v_limit then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, v_tx.shift_id, 'void_over_limit', 'critical',
            jsonb_build_object('void_id', v_id, 'amount_fcfa', p_amount_fcfa, 'limit_fcfa', v_limit, 'role', ctx.employee_role, 'employee_id', ctx.employee_id));
  end if;
  return jsonb_build_object('ok', true, 'void_id', v_id, 'over_limit', p_amount_fcfa > v_limit);
end;
$$;
revoke all on function public.request_void(uuid, bigint, text) from public, anon;
grant execute on function public.request_void(uuid, bigint, text) to authenticated;

create or replace function public.decide_void(p_void_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_void record;
begin
  select v.* into v_void from public.voids v where v.id = p_void_id;
  if v_void is null or not public.is_org_owner(v_void.organization_id) then
    raise exception 'FORBIDDEN: seul le propriétaire décide d''une annulation' using errcode = '42501';
  end if;
  insert into public.void_approvals (organization_id, station_id, void_id, decision, decided_by, note)
  values (v_void.organization_id, v_void.station_id, p_void_id, (case when p_approve then 'approved' else 'rejected' end)::public.approval_decision, auth.uid(), p_note);
end;
$$;
revoke all on function public.decide_void(uuid, boolean, text) from public, anon;
grant execute on function public.decide_void(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- G. Changement de prix pendant un shift : relevé intermédiaire obligatoire.
-- -----------------------------------------------------------------------------
alter table public.meter_readings add column price_change_id uuid references public.price_changes (id) on delete restrict;
alter table public.meter_readings add constraint meter_readings_price_change_check check ((kind = 'price_change') = (price_change_id is not null));

-- Prix du litre en vigueur à un instant.
create or replace function public.fuel_price_at(p_station_id uuid, p_product public.fuel_code, p_at timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pc.price_fcfa_per_litre from public.price_changes pc
  where pc.station_id = p_station_id and pc.fuel_product_code = p_product and pc.effective_at <= p_at
  order by pc.effective_at desc, pc.created_at desc limit 1;
$$;
revoke all on function public.fuel_price_at(uuid, public.fuel_code, timestamptz) from public, anon;
grant execute on function public.fuel_price_at(uuid, public.fuel_code, timestamptz) to authenticated, service_role;

-- Changements de prix survenus pendant un shift, et relevés intermédiaires manquants.
create or replace function public.shift_price_changes(p_shift_id uuid)
returns table (price_change_id uuid, fuel_product_code public.fuel_code, price_fcfa_per_litre bigint, effective_at timestamptz, missing_nozzles jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.id, pc.fuel_product_code, pc.price_fcfa_per_litre, pc.effective_at,
    coalesce((select jsonb_agg(jsonb_build_object('nozzle_id', n.id, 'label', n.label) order by n.label)
              from public.nozzles n join public.tanks t on t.id = n.tank_id
              where n.station_id = s.station_id and n.active and t.fuel_product_code = pc.fuel_product_code
                and not exists (select 1 from public.meter_readings m where m.nozzle_id = n.id and m.price_change_id = pc.id and public.evidence_is_uploaded(m.evidence_id))), '[]'::jsonb)
  from public.shifts s
  join public.price_changes pc on pc.station_id = s.station_id
    and pc.effective_at > s.opened_at and pc.effective_at < coalesce(s.fuel_closed_at, now())
  where s.id = p_shift_id and s.station_id in (select public.current_station_ids())
  order by pc.effective_at;
$$;
revoke all on function public.shift_price_changes(uuid) from public, anon;
grant execute on function public.shift_price_changes(uuid) to authenticated, service_role;

-- Attendu carburant par pistolet et par tranche de prix. Équivalent SQL de attenduCarburantParTranches().
create or replace function public.shift_expected_fuel(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shift record;
  n record;
  pc record;
  v_prev_index bigint;
  v_prev_price bigint;
  v_reading bigint;
  v_slices jsonb;
  v_nozzles jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_nozzle_total bigint;
  v_missing jsonb := '[]'::jsonb;
  v_litres bigint;
  v_amount bigint;
  v_summary jsonb;
begin
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id in (select public.current_station_ids());
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_summary := public.shift_fuel_summary(p_shift_id);
  for n in
    select (x ->> 'nozzle_id')::uuid as nozzle_id, x ->> 'label' as label, (x ->> 'fuel_product_code')::public.fuel_code as product,
           (x ->> 'index_open_cl')::bigint as index_open, (x ->> 'index_close_cl')::bigint as index_close
    from jsonb_array_elements(v_summary -> 'nozzles') x
  loop
    if n.index_open is null or n.index_close is null then
      v_missing := v_missing || jsonb_build_object('nozzle_id', n.nozzle_id, 'label', n.label, 'reason', 'missing_reading');
      continue;
    end if;
    v_prev_index := n.index_open;
    v_prev_price := coalesce(public.fuel_price_at(v_shift.station_id, n.product, v_shift.opened_at), 0);
    v_slices := '[]'::jsonb;
    v_nozzle_total := 0;
    for pc in
      select p.id, p.price_fcfa_per_litre, p.effective_at from public.price_changes p
      where p.station_id = v_shift.station_id and p.fuel_product_code = n.product
        and p.effective_at > v_shift.opened_at and p.effective_at < coalesce(v_shift.fuel_closed_at, now())
      order by p.effective_at
    loop
      select m.index_cl into v_reading from public.meter_readings m
      where m.nozzle_id = n.nozzle_id and m.price_change_id = pc.id and public.evidence_is_uploaded(m.evidence_id)
      order by m.device_created_at desc limit 1;
      if v_reading is null then
        v_missing := v_missing || jsonb_build_object('nozzle_id', n.nozzle_id, 'label', n.label, 'reason', 'missing_price_change_reading', 'price_change_id', pc.id);
        v_slices := null;
        exit;
      end if;
      v_litres := greatest(0, v_reading - v_prev_index);
      v_amount := round(v_litres::numeric * v_prev_price / 100)::bigint;
      v_slices := v_slices || jsonb_build_object('from_cl', v_prev_index, 'to_cl', v_reading, 'litres_cl', v_litres, 'price_fcfa_per_litre', v_prev_price, 'amount_fcfa', v_amount);
      v_nozzle_total := v_nozzle_total + v_amount;
      v_prev_index := v_reading;
      v_prev_price := pc.price_fcfa_per_litre;
    end loop;
    if v_slices is null then continue; end if;
    v_litres := greatest(0, n.index_close - v_prev_index);
    v_amount := round(v_litres::numeric * v_prev_price / 100)::bigint;
    v_slices := v_slices || jsonb_build_object('from_cl', v_prev_index, 'to_cl', n.index_close, 'litres_cl', v_litres, 'price_fcfa_per_litre', v_prev_price, 'amount_fcfa', v_amount);
    v_nozzle_total := v_nozzle_total + v_amount;
    v_total := v_total + v_nozzle_total;
    v_nozzles := v_nozzles || jsonb_build_object('nozzle_id', n.nozzle_id, 'label', n.label, 'fuel_product_code', n.product, 'slices', v_slices, 'amount_fcfa', v_nozzle_total);
  end loop;
  return jsonb_build_object('ok', jsonb_array_length(v_missing) = 0, 'total_fcfa', v_total, 'nozzles', v_nozzles, 'missing', v_missing);
end;
$$;
revoke all on function public.shift_expected_fuel(uuid) from public, anon, authenticated;
-- Réservé aux membres de l'organisation : un appareil passe par shift_cash_summary (après billetage).
grant execute on function public.shift_expected_fuel(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- H. Billetage à l'aveugle (append-only, total imposé par le serveur).
-- -----------------------------------------------------------------------------
create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  denominations jsonb not null,
  total_fcfa bigint not null default 0,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  unique (id, shift_id)
);
comment on table public.cash_counts is 'Billetage à l''aveugle : quantités par coupure. total_fcfa est calculé par le serveur. Append-only ; un nouveau comptage n''est possible qu''après une décision « recomptage ».';
create index cash_counts_shift_idx on public.cash_counts (shift_id, created_at desc);

create or replace function private.prepare_cash_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v text;
  v_total bigint := 0;
  v_shift record;
  v_last timestamptz;
begin
  if new.denominations is null or jsonb_typeof(new.denominations) <> 'object' then
    raise exception 'CASH_COUNT_INVALID: coupures attendues' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each_text(new.denominations) loop
    if k not in ('10000', '5000', '2000', '1000', '500', '200', '100', '50') then
      raise exception 'CASH_COUNT_INVALID: coupure inconnue %', k using errcode = '22023';
    end if;
    if v !~ '^[0-9]+$' then
      raise exception 'CASH_COUNT_INVALID: quantité invalide pour %', k using errcode = '22023';
    end if;
    v_total := v_total + k::bigint * v::bigint;
  end loop;
  new.total_fcfa := v_total;
  select s.* into v_shift from public.shifts s where s.id = new.shift_id;
  if v_shift.status not in ('closing', 'closed') then
    raise exception 'SHIFT_NOT_CLOSING: le billetage se fait après la fermeture carburant' using errcode = 'P0001';
  end if;
  select max(c.created_at) into v_last from public.cash_counts c where c.shift_id = new.shift_id;
  if v_last is not null and not exists (
    select 1 from public.cash_variance_decisions d join public.cash_closings cl on cl.id = d.closing_id
    where cl.shift_id = new.shift_id and d.decision = 'recount' and d.created_at > v_last
  ) then
    raise exception 'CASH_COUNT_FROZEN: le comptage est figé ; seule une décision « recomptage » du propriétaire en autorise un nouveau' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- I. Clôture de caisse et décisions sur les écarts.
-- -----------------------------------------------------------------------------
create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  cash_count_id uuid not null,
  expected_fuel_fcfa bigint not null,
  expected_shop_fcfa bigint not null default 0,
  expected_wash_fcfa bigint not null default 0,
  expected_garage_fcfa bigint not null default 0,
  credit_repayments_fcfa bigint not null default 0,
  approved_voids_fcfa bigint not null default 0,
  expected_total_fcfa bigint not null,
  wave_fcfa bigint not null default 0,
  orange_money_fcfa bigint not null default 0,
  card_fcfa bigint not null default 0,
  credit_fcfa bigint not null default 0,
  expected_cash_fcfa bigint not null,
  counted_cash_fcfa bigint not null,
  variance_fcfa bigint not null,
  justification text,
  deposit_mode public.deposit_mode not null,
  details jsonb not null default '{}'::jsonb,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (cash_count_id, shift_id) references public.cash_counts (id, shift_id) on delete restrict,
  check (variance_fcfa = 0 or length(trim(coalesce(justification, ''))) >= 3)
);
comment on table public.cash_closings is 'Clôture de caisse figée : attendu par nature, encaissé par mode, espèces comptées, écart, justification. Append-only ; une nouvelle clôture n''est possible qu''après un recomptage demandé.';
create index cash_closings_shift_idx on public.cash_closings (shift_id, closed_at desc);

create table public.cash_variance_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  closing_id uuid not null references public.cash_closings (id) on delete cascade,
  decision public.cash_variance_decision not null,
  decided_by uuid not null references auth.users (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.cash_variance_decisions is 'Décision du propriétaire sur un écart de caisse (accepter la perte, retenue sur salaire, recomptage). Append-only, auteur et date.';
create index cash_variance_decisions_closing_idx on public.cash_variance_decisions (closing_id, created_at desc);

create trigger prepare_cash_count before insert on public.cash_counts for each row execute function private.prepare_cash_count();
select private.enable_append_only('public.cash_counts');
select private.enable_append_only('public.cash_closings');
select private.enable_append_only('public.cash_variance_decisions');
alter table public.cash_counts enable row level security;
alter table public.cash_closings enable row level security;
alter table public.cash_variance_decisions enable row level security;
select private.policy_select_org('public.cash_counts');
select private.policy_select_device('public.cash_counts');
select private.policy_insert_device('public.cash_counts');
revoke update, delete on public.cash_counts from authenticated;
select private.policy_select_org('public.cash_closings');
select private.policy_select_device('public.cash_closings');
revoke insert, update, delete on public.cash_closings from authenticated;
select private.policy_select_org('public.cash_variance_decisions');
revoke insert, update, delete on public.cash_variance_decisions from authenticated;

-- Dernier comptage validé d'un shift.
create or replace function public.latest_cash_count(p_shift_id uuid)
returns table (id uuid, total_fcfa bigint, denominations jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.total_fcfa, c.denominations, c.created_at from public.cash_counts c
  where c.shift_id = p_shift_id and c.station_id in (select public.current_station_ids())
  order by c.created_at desc limit 1;
$$;
revoke all on function public.latest_cash_count(uuid) from public, anon;
grant execute on function public.latest_cash_count(uuid) to authenticated, service_role;

-- Attendu, encaissé, compté, écart. Un APPAREIL n'y a droit qu'après avoir validé son billetage.
create or replace function public.shift_cash_summary(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shift record;
  v_is_member boolean;
  v_count record;
  v_fuel jsonb;
  v_shop bigint; v_wash bigint; v_garage bigint; v_repay bigint; v_voids bigint;
  v_wave bigint; v_om bigint; v_card bigint; v_credit bigint;
  v_expected_total bigint; v_expected_cash bigint;
  v_closing record;
begin
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id in (select public.current_station_ids());
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_is_member := v_shift.organization_id in (select public.current_org_ids());
  select * into v_count from public.latest_cash_count(p_shift_id);
  if not v_is_member and v_count is null then
    raise exception 'CASH_COUNT_REQUIRED: validez votre billetage avant de voir le montant attendu' using errcode = '42501';
  end if;
  v_fuel := public.shift_expected_fuel(p_shift_id);
  select coalesce(sum(case when t.kind = 'shop' then t.total_fcfa end), 0), coalesce(sum(case when t.kind = 'wash' then t.total_fcfa end), 0),
         coalesce(sum(case when t.kind = 'garage' then t.total_fcfa end), 0), coalesce(sum(case when t.kind = 'credit_repayment' then t.total_fcfa end), 0)
  into v_shop, v_wash, v_garage, v_repay
  from public.transactions t where t.shift_id = p_shift_id;
  select coalesce(sum(v.amount_fcfa), 0) into v_voids from public.voids v where v.shift_id = p_shift_id and public.void_is_approved(v.id);
  select coalesce(sum(case when p.method = 'wave' then p.amount_fcfa end), 0), coalesce(sum(case when p.method = 'orange_money' then p.amount_fcfa end), 0),
         coalesce(sum(case when p.method = 'card' then p.amount_fcfa end), 0), coalesce(sum(case when p.method = 'credit' then p.amount_fcfa end), 0)
  into v_wave, v_om, v_card, v_credit
  from public.payments p join public.transactions t on t.id = p.transaction_id where t.shift_id = p_shift_id;
  v_expected_total := (v_fuel ->> 'total_fcfa')::bigint + v_shop + v_wash + v_garage + v_repay - v_voids;
  v_expected_cash := v_expected_total - v_wave - v_om - v_card - v_credit;
  select c.* into v_closing from public.cash_closings c where c.shift_id = p_shift_id order by c.closed_at desc limit 1;
  return jsonb_build_object(
    'ok', (v_fuel ->> 'ok')::boolean,
    'missing', v_fuel -> 'missing',
    'expected', jsonb_build_object('fuel_fcfa', (v_fuel ->> 'total_fcfa')::bigint, 'shop_fcfa', v_shop, 'wash_fcfa', v_wash, 'garage_fcfa', v_garage,
                                   'credit_repayments_fcfa', v_repay, 'approved_voids_fcfa', v_voids, 'total_fcfa', v_expected_total, 'cash_fcfa', v_expected_cash),
    'collected', jsonb_build_object('wave_fcfa', v_wave, 'orange_money_fcfa', v_om, 'card_fcfa', v_card, 'credit_fcfa', v_credit,
                                    'cash_fcfa', v_count.total_fcfa, 'total_fcfa', coalesce(v_count.total_fcfa, 0) + v_wave + v_om + v_card + v_credit),
    'counted_cash_fcfa', v_count.total_fcfa,
    'variance_fcfa', case when v_count.total_fcfa is null then null else v_count.total_fcfa - v_expected_cash end,
    'cash_count_id', v_count.id,
    'closing', case when v_closing.id is null then null else jsonb_build_object('id', v_closing.id, 'closed_at', v_closing.closed_at, 'variance_fcfa', v_closing.variance_fcfa, 'justification', v_closing.justification, 'deposit_mode', v_closing.deposit_mode) end,
    'fuel', v_fuel -> 'nozzles'
  );
end;
$$;
comment on function public.shift_cash_summary(uuid) is 'Attendu (carburant par tranches, boutique, lavage, garage, remboursements − annulations approuvées), encaissé par mode, espèces comptées et écart. Un appareil doit avoir validé son billetage (CASH_COUNT_REQUIRED sinon).';
revoke all on function public.shift_cash_summary(uuid) from public, anon;
grant execute on function public.shift_cash_summary(uuid) to authenticated, service_role;

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
  if v_variance <> 0 and length(trim(coalesce(p_justification, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'JUSTIFICATION_REQUIRED', 'variance_fcfa', v_variance);
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
          (case when v_variance = 0 then 'ok' else 'variance' end)::public.reconciliation_status, jsonb_build_object('closing_id', v_id, 'justification', p_justification));
  if v_variance <> 0 then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, p_shift_id, 'cash_variance', 'critical',
            jsonb_build_object('closing_id', v_id, 'variance_fcfa', v_variance, 'justification', p_justification, 'employee_id', ctx.employee_id, 'employee_name', ctx.employee_name));
  end if;
  return jsonb_build_object('ok', true, 'closing_id', v_id, 'variance_fcfa', v_variance, 'status', 'closed');
end;
$$;
comment on function public.close_shift_cash(uuid, text, public.deposit_mode) is 'Appareil : clôture définitive (shift closed, immuable). Exige billetage validé, preuves de fin, relevés de changement de prix, justification si écart ≠ 0. Écart → alerte cash_variance + élément à trancher.';
revoke all on function public.close_shift_cash(uuid, text, public.deposit_mode) from public, anon;
grant execute on function public.close_shift_cash(uuid, text, public.deposit_mode) to authenticated;

create or replace function public.decide_cash_variance(p_closing_id uuid, p_decision public.cash_variance_decision, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closing record;
begin
  select c.* into v_closing from public.cash_closings c where c.id = p_closing_id;
  if v_closing is null or not public.is_org_owner(v_closing.organization_id) then
    raise exception 'FORBIDDEN: seul le propriétaire tranche un écart' using errcode = '42501';
  end if;
  insert into public.cash_variance_decisions (organization_id, station_id, closing_id, decision, decided_by, note)
  values (v_closing.organization_id, v_closing.station_id, p_closing_id, p_decision, auth.uid(), p_note);
end;
$$;
revoke all on function public.decide_cash_variance(uuid, public.cash_variance_decision, text) from public, anon;
grant execute on function public.decide_cash_variance(uuid, public.cash_variance_decision, text) to authenticated;

-- -----------------------------------------------------------------------------
-- J. Versements bancaires : un bordereau pour un ou plusieurs shifts clos.
-- -----------------------------------------------------------------------------
alter table public.bank_deposits alter column shift_id drop not null;
create table public.bank_deposit_shifts (
  deposit_id uuid not null references public.bank_deposits (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete restrict,
  organization_id uuid not null,
  station_id uuid not null,
  primary key (deposit_id, shift_id)
);
select private.enable_append_only('public.bank_deposit_shifts');
alter table public.bank_deposit_shifts enable row level security;
select private.policy_select_org('public.bank_deposit_shifts');
select private.policy_select_device('public.bank_deposit_shifts');
revoke insert, update, delete on public.bank_deposit_shifts from authenticated;
drop policy if exists bank_deposits_insert_device on public.bank_deposits;

create or replace function public.declare_bank_deposit(p_amount_fcfa bigint, p_evidence_id uuid, p_shift_ids uuid[], p_bank_ref text default null, p_deposited_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_id uuid;
  v_counted bigint;
  v_nb integer;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant déclare un versement' using errcode = '42501';
  end if;
  if p_amount_fcfa is null or p_amount_fcfa <= 0 then return jsonb_build_object('ok', false, 'error', 'AMOUNT_REQUIRED'); end if;
  if coalesce(array_length(p_shift_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'SHIFTS_REQUIRED'); end if;
  if not exists (select 1 from public.evidence_files e where e.id = p_evidence_id and e.station_id = ctx.station_id and e.kind = 'bank_slip')
     or not public.evidence_is_uploaded(p_evidence_id) then
    return jsonb_build_object('ok', false, 'error', 'SLIP_PHOTO_MISSING');
  end if;
  select count(*) into v_nb from public.shifts s where s.id = any (p_shift_ids) and s.station_id = ctx.station_id and s.status = 'closed';
  if v_nb <> array_length(p_shift_ids, 1) then return jsonb_build_object('ok', false, 'error', 'SHIFTS_NOT_CLOSED'); end if;
  if exists (select 1 from public.bank_deposit_shifts b where b.shift_id = any (p_shift_ids)) then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_ALREADY_DEPOSITED');
  end if;
  select coalesce(sum(c.counted_cash_fcfa), 0) into v_counted
  from public.cash_closings c where c.shift_id = any (p_shift_ids)
    and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1);
  insert into public.bank_deposits (organization_id, station_id, device_id, employee_id, shift_id, amount_fcfa, bank_ref, deposited_at, evidence_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, case when array_length(p_shift_ids, 1) = 1 then p_shift_ids[1] end,
          p_amount_fcfa, p_bank_ref, coalesce(p_deposited_at, now()), p_evidence_id, now())
  returning id into v_id;
  insert into public.bank_deposit_shifts (deposit_id, shift_id, organization_id, station_id)
  select v_id, s, ctx.organization_id, ctx.station_id from unnest(p_shift_ids) s;
  if v_counted <> p_amount_fcfa then
    insert into public.alerts (organization_id, station_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, 'deposit_mismatch', 'critical',
            jsonb_build_object('deposit_id', v_id, 'amount_fcfa', p_amount_fcfa, 'counted_cash_fcfa', v_counted, 'shift_ids', to_jsonb(p_shift_ids), 'employee_id', ctx.employee_id));
  end if;
  return jsonb_build_object('ok', true, 'deposit_id', v_id, 'counted_cash_fcfa', v_counted, 'difference_fcfa', p_amount_fcfa - v_counted);
end;
$$;
comment on function public.declare_bank_deposit(bigint, uuid, uuid[], text, timestamptz) is 'Gérant : versement avec photo du bordereau pour un ou plusieurs shifts clos. Différence avec les espèces comptées → alerte deposit_mismatch.';
revoke all on function public.declare_bank_deposit(bigint, uuid, uuid[], text, timestamptz) from public, anon;
grant execute on function public.declare_bank_deposit(bigint, uuid, uuid[], text, timestamptz) to authenticated;

-- Aucun bordereau 24 h après une clôture « à faire » → alerte deposit_missing (une par shift).
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
    where cl.closed_at < now() - interval '24 hours'
      and cl.id = (select c2.id from public.cash_closings c2 where c2.shift_id = cl.shift_id order by c2.closed_at desc limit 1)
      and not exists (select 1 from public.bank_deposit_shifts b where b.shift_id = cl.shift_id)
      and not exists (select 1 from public.alerts a where a.type = 'deposit_missing' and a.shift_id = cl.shift_id)
  loop
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (c.organization_id, c.station_id, c.shift_id, 'deposit_missing', 'critical',
            jsonb_build_object('closing_id', c.id, 'counted_cash_fcfa', c.counted_cash_fcfa, 'closed_at', c.closed_at, 'employee_id', c.employee_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.flag_missing_deposits() from public, anon;
grant execute on function public.flag_missing_deposits() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- K. « À valider » : compteurs et listes pour le propriétaire.
-- -----------------------------------------------------------------------------
create or replace function public.pending_validations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with org as (select public.current_org_ids() as id)
  select jsonb_build_object(
    'cash_variances', (select count(*) from public.cash_closings c where c.organization_id in (select id from org) and c.variance_fcfa <> 0
                        and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
                        and not exists (select 1 from public.cash_variance_decisions d where d.closing_id = c.id)),
    'voids', (select count(*) from public.voids v where v.organization_id in (select id from org) and not exists (select 1 from public.void_approvals a where a.void_id = v.id)),
    'credit_accounts', (select count(*) from public.credit_accounts a where a.organization_id in (select id from org) and a.status = 'pending'),
    'deposits', (select count(*) from public.alerts a where a.organization_id in (select id from org) and a.type in ('deposit_missing', 'deposit_mismatch') and a.acknowledged_at is null)
  );
$$;
revoke all on function public.pending_validations() from public, anon;
grant execute on function public.pending_validations() to authenticated;

-- -----------------------------------------------------------------------------
-- L. pg_cron : versements manquants et paiements mobile money en attente.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('stationsure-versements-manquants', '15 * * * *', $$select public.flag_missing_deposits();$$);
select cron.schedule('stationsure-mobile-money-en-attente', '45 * * * *', $$select public.flag_pending_mobile_money();$$);
