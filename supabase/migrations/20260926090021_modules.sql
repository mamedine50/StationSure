-- =============================================================================
-- 0021 — Lot de correctifs n°2 : types d'employés (8 types système + personnalisés), modules
-- par employé (surcharge), vérification serveur dans toutes les RPC mobiles
-- (MODULE_NOT_GRANTED), historique des droits, tâches du shift (sans montant), opérations
-- récentes de l'employé, libellés des membres.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Types d'employés : système (organization_id null) et personnalisés (par organisation).
-- -----------------------------------------------------------------------------
create table public.employee_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (length(trim(name)) between 2 and 60),
  modules public.employee_module[] not null default '{}',
  /** Rôle historique équivalent (plafonds d'annulation, anciens contrôles). */
  legacy_role public.employee_role not null default 'pump_attendant',
  is_system boolean not null default false,
  position integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_system and organization_id is null) or (not is_system and organization_id is not null))
);
create unique index employee_types_code_idx on public.employee_types (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
comment on table public.employee_types is 'Types d''employés : 8 types système (organization_id null) et types personnalisés du propriétaire. modules = modules par défaut.';
select private.enable_updated_at('public.employee_types');
select private.enable_audit('public.employee_types');
alter table public.employee_types enable row level security;
create policy employee_types_select on public.employee_types for select to authenticated
  using (organization_id is null or organization_id in (select public.current_org_ids()) or organization_id = public.current_device_organization_id());
create policy employee_types_insert_owner on public.employee_types for insert to authenticated
  with check (not is_system and organization_id is not null and public.is_org_owner(organization_id));
create policy employee_types_update_owner on public.employee_types for update to authenticated
  using (not is_system and organization_id is not null and public.is_org_owner(organization_id))
  with check (not is_system and organization_id is not null and public.is_org_owner(organization_id));
create policy employee_types_delete_owner on public.employee_types for delete to authenticated
  using (not is_system and organization_id is not null and public.is_org_owner(organization_id));

insert into public.employee_types (id, organization_id, code, name, modules, legacy_role, is_system, position) values
  (md5('employee_type:gerant')::uuid, null, 'gerant', 'Gérant', '{shift,gauging,handover,delivery,sell,credit_sale,void_request,cash_close,bank_deposit}', 'manager', true, 10),
  (md5('employee_type:chef_de_piste')::uuid, null, 'chef_de_piste', 'Chef de piste', '{shift,gauging,handover,delivery,sell}', 'pump_attendant', true, 20),
  (md5('employee_type:pompiste')::uuid, null, 'pompiste', 'Pompiste', '{shift,handover,sell,void_request}', 'pump_attendant', true, 30),
  (md5('employee_type:caissier_boutique')::uuid, null, 'caissier_boutique', 'Caissier boutique', '{shop_pos,shop_count,service_ticket_sale,sell}', 'shop_cashier', true, 40),
  (md5('employee_type:mecanicien')::uuid, null, 'mecanicien', 'Mécanicien (vidange)', '{oil_change_scan}', 'mechanic', true, 50),
  (md5('employee_type:laveur')::uuid, null, 'laveur', 'Laveur', '{wash_scan}', 'washer', true, 60),
  (md5('employee_type:gardien_nuit')::uuid, null, 'gardien_nuit', 'Gardien de nuit', '{shift,gauging}', 'pump_attendant', true, 70),
  (md5('employee_type:adjoint_station')::uuid, null, 'adjoint_station', 'Adjoint de station', '{shift,gauging,handover,delivery,sell,credit_sale,void_request,cash_close}', 'manager', true, 80);

-- Employés : type + surcharge par module (ajout ou retrait par rapport au type).
alter table public.employees add column type_id uuid references public.employee_types (id) on delete restrict;
comment on column public.employees.type_id is 'Type d''employé (modules par défaut). role reste le rôle historique synchronisé depuis le type.';
update public.employees e set type_id = case e.role
  when 'manager' then md5('employee_type:gerant')::uuid
  when 'pump_attendant' then md5('employee_type:pompiste')::uuid
  when 'shop_cashier' then md5('employee_type:caissier_boutique')::uuid
  when 'mechanic' then md5('employee_type:mecanicien')::uuid
  when 'washer' then md5('employee_type:laveur')::uuid
end where e.type_id is null;
alter table public.employees alter column type_id set not null;

create or replace function private.sync_employee_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select t.legacy_role into new.role from public.employee_types t where t.id = new.type_id;
  return new;
end;
$$;
create trigger sync_employee_role before insert or update of type_id on public.employees for each row execute function private.sync_employee_role();

create table public.employee_module_overrides (
  employee_id uuid not null references public.employees (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module public.employee_module not null,
  granted boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, module)
);
comment on table public.employee_module_overrides is 'Surcharge par employé : granted = module ajouté, not granted = module retiré par rapport au type.';
select private.enable_updated_at('public.employee_module_overrides');
select private.enable_audit('public.employee_module_overrides');
alter table public.employee_module_overrides enable row level security;
select private.policy_select_org('public.employee_module_overrides');
create policy employee_module_overrides_select_device on public.employee_module_overrides for select to authenticated
  using (organization_id = public.current_device_organization_id());
select private.policy_write_owner('public.employee_module_overrides');

-- Modules effectifs = modules du type + ajouts − retraits. Jamais de « prix », « approbations »,
-- « écarts », « comptes crédit », « configuration » : ces droits n'existent pas dans l'enum.
create or replace function public.employee_modules(p_employee_id uuid)
returns public.employee_module[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m order by m), '{}')
  from (
    select unnest(t.modules) as m from public.employees e join public.employee_types t on t.id = e.type_id where e.id = p_employee_id
    union
    select o.module from public.employee_module_overrides o where o.employee_id = p_employee_id and o.granted
    except
    select o.module from public.employee_module_overrides o where o.employee_id = p_employee_id and not o.granted
  ) x;
$$;
revoke all on function public.employee_modules(uuid) from public, anon;
grant execute on function public.employee_modules(uuid) to authenticated, service_role;

create or replace function public.employee_has_module(p_employee_id uuid, p_module public.employee_module)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_module = any (public.employee_modules(p_employee_id));
$$;
revoke all on function public.employee_has_module(uuid, public.employee_module) from public, anon;
grant execute on function public.employee_has_module(uuid, public.employee_module) to authenticated, service_role;

-- Contrôle serveur : toute RPC mobile appelle require_module ; refus = MODULE_NOT_GRANTED.
create or replace function private.require_module(p_employee_id uuid, p_module public.employee_module)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.employee_has_module(p_employee_id, p_module) then
    raise exception 'MODULE_NOT_GRANTED: module % non attribué à cet employé', p_module using errcode = '42501';
  end if;
end;
$$;

-- Insertions directes par l'appareil (relevés, jaugeages, billetage, ouverture de shift) : même contrôle.
create or replace function private.check_module_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_module public.employee_module;
begin
  if public.current_device_id() is null then
    return new; -- propriétaire / service / seed : pas de session employé
  end if;
  case tg_table_name
    when 'meter_readings' then
      v_employee := new.employee_id;
      v_module := case when new.kind = 'handover' then 'handover'::public.employee_module else 'shift' end;
    when 'tank_readings' then
      v_employee := new.employee_id;
      v_module := case when new.kind in ('delivery_before', 'delivery_after') then 'delivery'::public.employee_module else 'gauging' end;
    when 'cash_counts' then
      v_employee := new.employee_id; v_module := 'cash_close';
    when 'shifts' then
      v_employee := new.opened_by; v_module := 'shift';
    else
      return new;
  end case;
  perform private.require_module(v_employee, v_module);
  return new;
end;
$$;
create trigger check_module_meter_readings before insert on public.meter_readings for each row execute function private.check_module_on_insert();
create trigger check_module_tank_readings before insert on public.tank_readings for each row execute function private.check_module_on_insert();
create trigger check_module_cash_counts before insert on public.cash_counts for each row execute function private.check_module_on_insert();
create trigger check_module_shifts before insert on public.shifts for each row execute function private.check_module_on_insert();

-- Historique des droits d'un employé (audit_log : type, surcharges, création).
create or replace function public.employee_rights_history(p_employee_id uuid)
returns table (at timestamptz, actor_user_id uuid, action text, details jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select a.at, a.actor_user_id,
    case
      when a.table_name = 'employees' and a.action = 'INSERT' then 'created'
      when a.table_name = 'employees' and (a.new_data ->> 'type_id') is distinct from (a.old_data ->> 'type_id') then 'type_changed'
      when a.table_name = 'employee_module_overrides' and a.action = 'DELETE' then 'override_removed'
      when a.table_name = 'employee_module_overrides' and coalesce((a.new_data ->> 'granted')::boolean, false) then 'module_added'
      when a.table_name = 'employee_module_overrides' then 'module_removed'
      else 'updated'
    end,
    jsonb_build_object(
      'type_code', (select t.code from public.employee_types t where t.id = (a.new_data ->> 'type_id')::uuid),
      'type_name', (select t.name from public.employee_types t where t.id = (a.new_data ->> 'type_id')::uuid),
      'module', coalesce(a.new_data ->> 'module', a.old_data ->> 'module'))
  from public.audit_log a
  where a.organization_id in (select public.current_org_ids())
    and ((a.table_name = 'employees' and a.row_id = p_employee_id
          and (a.action = 'INSERT' or (a.new_data ->> 'type_id') is distinct from (a.old_data ->> 'type_id')))
      or (a.table_name = 'employee_module_overrides' and coalesce(a.new_data ->> 'employee_id', a.old_data ->> 'employee_id') = p_employee_id::text))
  order by a.at desc;
$$;
revoke all on function public.employee_rights_history(uuid) from public, anon;
grant execute on function public.employee_rights_history(uuid) to authenticated;

-- Libellés des membres (courriel) pour l'historique et les auteurs (prix, barémages).
create or replace function public.member_labels()
returns table (user_id uuid, email text, role public.org_member_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email, m.role from public.org_members m join auth.users u on u.id = m.user_id
  where m.organization_id in (select public.current_org_ids());
$$;
revoke all on function public.member_labels() from public, anon;
grant execute on function public.member_labels() to authenticated;

-- -----------------------------------------------------------------------------
-- B. Session : le PIN et la session renvoient les modules effectifs.
-- -----------------------------------------------------------------------------
create or replace function public.verify_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device record;
  v_employee record;
  v_hash text;
  v_failures integer;
  v_locked_until timestamptz;
  v_session record;
begin
  select d.id, d.station_id, d.organization_id into v_device
  from public.devices d where d.auth_user_id = auth.uid() and d.active;
  if v_device is null then
    raise exception 'DEVICE_NOT_PAIRED: cet appareil n''est pas jumelé' using errcode = '42501';
  end if;

  -- Employé actif de la station de l'appareil, sinon même erreur qu'un PIN faux.
  select e.id, e.full_name, e.role into v_employee
  from public.employees e
  where e.id = p_employee_id and e.active and e.station_id = v_device.station_id;
  -- IMPORTANT : les échecs sont RENVOYÉS (ok = false), pas levés : une exception annulerait
  -- l'enregistrement de la tentative et l'alerte dans la même transaction.
  if v_employee is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN_INVALID');
  end if;

  -- Blocage : 5 échecs dans les 15 dernières minutes → 15 min après le dernier échec.
  select count(*), max(a.at) + interval '15 minutes' into v_failures, v_locked_until
  from public.pin_attempts a
  where a.employee_id = v_employee.id and not a.success and a.at > now() - interval '15 minutes';
  if v_failures >= 5 and v_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'PIN_LOCKED',
      'retry_after_seconds', ceil(extract(epoch from v_locked_until - now())));
  end if;

  select p.pin_hash into v_hash from public.employee_pins p where p.employee_id = v_employee.id;

  if v_hash is null or v_hash <> extensions.crypt(p_pin, v_hash) then
    insert into public.pin_attempts (organization_id, station_id, device_id, employee_id, success)
    values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, false);
    if v_failures + 1 = 5 then
      insert into public.alerts (organization_id, station_id, type, severity, payload)
      values (v_device.organization_id, v_device.station_id, 'pin_lockout', 'warning',
              jsonb_build_object('employee_id', v_employee.id, 'full_name', v_employee.full_name,
                                 'device_id', v_device.id, 'locked_until', now() + interval '15 minutes'));
    end if;
    return jsonb_build_object('ok', false, 'error', 'PIN_INVALID');
  end if;

  insert into public.pin_attempts (organization_id, station_id, device_id, employee_id, success)
  values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, true);

  -- Une seule session active par appareil.
  update public.employee_sessions set ended_at = now(), ended_reason = 'replaced'
  where device_id = v_device.id and ended_at is null;

  insert into public.employee_sessions (organization_id, station_id, device_id, employee_id, expires_at)
  values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, now() + interval '12 hours')
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'employee_id', v_employee.id,
    'full_name', v_employee.full_name,
    'role', v_employee.role,
    'type_code', (select t.code from public.employee_types t where t.id = (select e.type_id from public.employees e where e.id = v_employee.id)),
    'modules', to_jsonb(public.employee_modules(v_employee.id)),
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at
  );
end;
$$;

create or replace function public.current_employee_session()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'employee_id', e.id,
    'full_name', e.full_name,
    'role', e.role,
    'type_code', (select t.code from public.employee_types t where t.id = e.type_id),
    'modules', to_jsonb(public.employee_modules(e.id)),
    'started_at', s.started_at,
    'expires_at', s.expires_at
  )
  from public.employee_sessions s
  join public.employees e on e.id = s.employee_id
  where s.device_id = public.current_device_id()
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- C. RPC mobiles : contrôle du module (les anciens contrôles « gérant » sont remplacés).
-- -----------------------------------------------------------------------------
create or replace function public.open_shift(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'shift');
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id for update;
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'opening' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPENING', 'status', v_shift.status);
  end if;
  -- Configuration carburant incomplète (cuve sans barémage ou sans pistolet, prix manquant) : refus clair.
  if not (public.station_fuel_setup_status(ctx.station_id) ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'FUEL_SETUP_INCOMPLETE', 'setup', public.station_fuel_setup_status(ctx.station_id));
  end if;
  v_missing := public.shift_missing_items(p_shift_id, 'open');
  if not (v_missing ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_INCOMPLETE', 'missing', v_missing);
  end if;
  perform set_config('app.shift_rpc', 'on', true);
  update public.shifts set status = 'open' where id = p_shift_id;
  perform set_config('app.shift_rpc', 'off', true);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (ctx.organization_id, ctx.station_id, p_shift_id, 'shift_opened', 'info',
          jsonb_build_object('employee_id', ctx.employee_id, 'employee_name', ctx.employee_name));
  return jsonb_build_object('ok', true, 'status', 'open');
end;
$$;

create or replace function public.close_shift_fuel(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'shift');
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id for update;
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN', 'status', v_shift.status);
  end if;
  v_missing := public.shift_missing_items(p_shift_id, 'close');
  if not (v_missing ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_INCOMPLETE', 'missing', v_missing);
  end if;
  perform set_config('app.shift_rpc', 'on', true);
  update public.shifts set status = 'closing', fuel_closed_at = now(), closed_by = ctx.employee_id where id = p_shift_id;
  perform set_config('app.shift_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'status', 'closing', 'summary', public.shift_fuel_summary(p_shift_id));
end;
$$;

create or replace function public.start_handover(p_shift_id uuid, p_incoming_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'handover');
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id;
  if v_shift is null or v_shift.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN');
  end if;
  if not exists (select 1 from public.employees e where e.id = p_incoming_employee_id and e.station_id = ctx.station_id and e.active) then
    return jsonb_build_object('ok', false, 'error', 'INCOMING_INVALID');
  end if;
  if p_incoming_employee_id = ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'SAME_EMPLOYEE');
  end if;
  if exists (select 1 from public.shift_handovers h where h.from_shift_id = p_shift_id and h.status = 'pending') then
    select h.id into v_id from public.shift_handovers h where h.from_shift_id = p_shift_id and h.status = 'pending' limit 1;
    return jsonb_build_object('ok', true, 'handover_id', v_id, 'resumed', true);
  end if;
  insert into public.shift_handovers (organization_id, station_id, device_id, from_shift_id, outgoing_employee_id, incoming_employee_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, p_shift_id, ctx.employee_id, p_incoming_employee_id, now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'handover_id', v_id);
end;
$$;

create or replace function public.sign_handover_outgoing(p_handover_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'handover');
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_PENDING');
  end if;
  if v_h.outgoing_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_OUTGOING');
  end if;
  v_missing := private.handover_missing(p_handover_id, 'outgoing');
  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_INCOMPLETE', 'missing', v_missing);
  end if;
  update public.shift_handovers set signed_out_at = now() where id = p_handover_id;
  return jsonb_build_object('ok', true, 'signed_out_at', now());
end;
$$;

create or replace function public.sign_handover_incoming(p_handover_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_missing jsonb;
  v_mismatches jsonb;
  v_new uuid;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'handover');
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status not in ('pending', 'disputed') then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_PENDING');
  end if;
  if v_h.signed_out_at is null then
    return jsonb_build_object('ok', false, 'error', 'OUTGOING_NOT_SIGNED');
  end if;
  if v_h.incoming_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_INCOMING');
  end if;
  v_missing := private.handover_missing(p_handover_id, 'incoming');
  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_INCOMPLETE', 'missing', v_missing);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', c.nozzle_id, 'label', c.label,
           'index_outgoing_cl', c.index_outgoing_cl, 'index_incoming_cl', c.index_incoming_cl, 'variance_cl', c.variance_cl)), '[]'::jsonb)
  into v_mismatches from public.compare_handover(p_handover_id) c;
  if jsonb_array_length(v_mismatches) > 0 then
    update public.shift_handovers set status = 'disputed', discrepancies = v_mismatches where id = p_handover_id;
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (v_h.organization_id, v_h.station_id, v_h.from_shift_id, 'handover_mismatch', 'critical',
            jsonb_build_object('handover_id', p_handover_id, 'outgoing_employee_id', v_h.outgoing_employee_id,
                               'incoming_employee_id', v_h.incoming_employee_id, 'mismatches', v_mismatches));
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_MISMATCH', 'mismatches', v_mismatches);
  end if;
  v_new := private.complete_handover(p_handover_id, ctx.device_id);
  return jsonb_build_object('ok', true, 'to_shift_id', v_new);
end;
$$;

create or replace function public.report_handover_discrepancy(p_handover_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_mismatches jsonb;
  v_new uuid;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'handover');
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status <> 'disputed' then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_DISPUTED');
  end if;
  if v_h.incoming_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_INCOMING');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', c.nozzle_id, 'label', c.label,
           'index_outgoing_cl', c.index_outgoing_cl, 'index_incoming_cl', c.index_incoming_cl, 'variance_cl', c.variance_cl)), '[]'::jsonb)
  into v_mismatches from public.compare_handover(p_handover_id) c;
  update public.shift_handovers
  set discrepancy_reported = true, discrepancy_reason = trim(p_reason), discrepancies = v_mismatches,
      attributed_shift_id = from_shift_id
  where id = p_handover_id;
  v_new := private.complete_handover(p_handover_id, ctx.device_id);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (v_h.organization_id, v_h.station_id, v_h.from_shift_id, 'handover_mismatch', 'critical',
          jsonb_build_object('handover_id', p_handover_id, 'reported', true, 'reason', trim(p_reason),
                             'attributed_shift_id', v_h.from_shift_id, 'mismatches', v_mismatches));
  return jsonb_build_object('ok', true, 'to_shift_id', v_new, 'attributed_shift_id', v_h.from_shift_id);
end;
$$;

create or replace function public.start_delivery(p_tank_id uuid, p_supplier text default null, p_truck_plate text default null, p_driver_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_id uuid;
  v_shift uuid;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'delivery');
  if not exists (select 1 from public.tanks t where t.id = p_tank_id and t.station_id = ctx.station_id and t.active) then
    raise exception 'TANK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.fuel_delivery_sessions s where s.tank_id = p_tank_id and s.status not in ('signed', 'cancelled')) then
    select s.id into v_id from public.fuel_delivery_sessions s where s.tank_id = p_tank_id and s.status not in ('signed', 'cancelled');
    return jsonb_build_object('ok', true, 'session_id', v_id, 'resumed', true);
  end if;
  select s.id into v_shift from public.shifts s where s.station_id = ctx.station_id and s.status = 'open' order by s.opened_at desc limit 1;
  insert into public.fuel_delivery_sessions (organization_id, station_id, device_id, employee_id, tank_id, shift_id, supplier, truck_plate, driver_name, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, p_tank_id, v_shift, p_supplier, p_truck_plate, p_driver_name, now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'session_id', v_id);
end;
$$;

create or replace function public.advance_delivery(p_session_id uuid, p_step text, p_reading_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_s record;
  v_reading record;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'delivery');
  select s.* into v_s from public.fuel_delivery_sessions s where s.id = p_session_id and s.station_id = ctx.station_id for update;
  if v_s is null or v_s.status in ('signed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'DELIVERY_NOT_ACTIVE');
  end if;
  if p_step = 'before_gauged' then
    if v_s.status <> 'gauging_before' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    select r.* into v_reading from public.tank_readings r where r.id = p_reading_id and r.tank_id = v_s.tank_id and r.kind = 'delivery_before';
    if v_reading is null or not public.evidence_is_uploaded(v_reading.evidence_id) then
      return jsonb_build_object('ok', false, 'error', 'READING_MISSING');
    end if;
    update public.fuel_delivery_sessions set before_reading_id = p_reading_id, status = 'unloading', unloading_started_at = now() where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'unloading', 'before_cl', v_reading.volume_cl);
  elsif p_step = 'unloading_done' then
    if v_s.status <> 'unloading' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    update public.fuel_delivery_sessions set status = 'gauging_after', unloading_ended_at = now() where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'gauging_after');
  elsif p_step = 'after_gauged' then
    if v_s.status <> 'gauging_after' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    select r.* into v_reading from public.tank_readings r where r.id = p_reading_id and r.tank_id = v_s.tank_id and r.kind = 'delivery_after';
    if v_reading is null or not public.evidence_is_uploaded(v_reading.evidence_id) then
      return jsonb_build_object('ok', false, 'error', 'READING_MISSING');
    end if;
    update public.fuel_delivery_sessions set after_reading_id = p_reading_id, status = 'signing' where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'signing', 'after_cl', v_reading.volume_cl);
  elsif p_step = 'cancel' then
    if v_s.status = 'unloading' then return jsonb_build_object('ok', false, 'error', 'UNLOADING_IN_PROGRESS'); end if;
    update public.fuel_delivery_sessions set status = 'cancelled' where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_STEP');
end;
$$;

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
  perform private.require_module(ctx.employee_id, 'delivery');
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

create or replace function public.reverse_delivery(p_delivery_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_d record;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  perform private.require_module(ctx.employee_id, 'delivery');
  select d.* into v_d from public.fuel_deliveries d where d.id = p_delivery_id and d.station_id = ctx.station_id;
  if v_d is null or v_d.reverses_id is not null then
    raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  insert into public.fuel_deliveries (organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref,
    invoiced_cl, before_cl, after_cl, evidence_id, device_created_at, reverses_id, reserve_reason)
  values (v_d.organization_id, v_d.station_id, ctx.device_id, ctx.employee_id, v_d.tank_id, v_d.supplier, v_d.invoice_ref,
    v_d.invoiced_cl, v_d.after_cl, v_d.before_cl, v_d.evidence_id, now(), p_delivery_id, trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

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
  perform private.require_module(ctx.employee_id, 'credit_sale');
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
  perform private.require_module(ctx.employee_id, 'sell');
  if v_method = 'credit' then
    perform private.require_module(ctx.employee_id, 'credit_sale');
  end if;
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
  perform private.require_module(ctx.employee_id, 'sell');
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
  perform private.require_module(ctx.employee_id, 'void_request');
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
  perform private.require_module(ctx.employee_id, 'cash_close');
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
  -- Petits écarts (≤ tolérance) : attribués à l'employé, cumulés sur 30 jours (lot de correctifs n°1).
  perform private.check_small_variance_cumulative(ctx.organization_id, ctx.station_id, ctx.employee_id, v_id);
  return jsonb_build_object('ok', true, 'closing_id', v_id, 'variance_fcfa', v_variance, 'tolerance_fcfa', v_tol, 'status', 'closed');
end;
$$;

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
  perform private.require_module(ctx.employee_id, 'bank_deposit');
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

-- -----------------------------------------------------------------------------
-- D. Tableau de bord du shift (écran 21) : tâches sans AUCUN montant, opérations de l'employé.
-- -----------------------------------------------------------------------------
create or replace function public.shift_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_open jsonb;
  v_close jsonb;
  v_nozzles integer;
  v_tanks integer;
  v_handover record;
  v_deposit_todo boolean;
  v_cash_closed boolean;
  v_tasks jsonb := '[]'::jsonb;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.station_id = ctx.station_id and s.status in ('opening', 'open', 'closing') order by s.opened_at desc limit 1;
  select count(*) into v_nozzles from public.nozzles n join public.pumps p on p.id = n.pump_id where n.station_id = ctx.station_id and n.active and p.active;
  select count(*) into v_tanks from public.tanks t where t.station_id = ctx.station_id and t.active;
  select exists (
    select 1 from public.cash_closings c where c.station_id = ctx.station_id and c.deposit_mode = 'later'
      and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
      and (v_shift.id is null or c.shift_id <> v_shift.id)
      and not exists (select 1 from public.bank_deposit_shifts b where b.shift_id = c.shift_id)
      and c.closed_at > now() - interval '7 days'
  ) into v_deposit_todo;
  if v_shift.id is not null then
    v_open := public.shift_missing_items(v_shift.id, 'open');
    v_tasks := v_tasks || jsonb_build_object('key', 'open_readings', 'done', v_nozzles - jsonb_array_length(v_open -> 'nozzles'), 'total', v_nozzles, 'complete', jsonb_array_length(v_open -> 'nozzles') = 0)
      || jsonb_build_object('key', 'open_gauging', 'done', v_tanks - jsonb_array_length(v_open -> 'tanks'), 'total', v_tanks, 'complete', jsonb_array_length(v_open -> 'tanks') = 0);
    if v_shift.status in ('open', 'closing') then
      v_close := public.shift_missing_items(v_shift.id, 'close');
      v_tasks := v_tasks || jsonb_build_object('key', 'close_readings', 'done', v_nozzles - jsonb_array_length(v_close -> 'nozzles'), 'total', v_nozzles, 'complete', jsonb_array_length(v_close -> 'nozzles') = 0);
    end if;
    select h.id, h.status, h.incoming_employee_id, h.outgoing_employee_id, h.signed_out_at into v_handover
    from public.shift_handovers h where h.from_shift_id = v_shift.id and h.status in ('pending', 'disputed') order by h.created_at desc limit 1;
    if v_handover.id is not null then
      v_tasks := v_tasks || jsonb_build_object('key', 'handover', 'complete', false, 'handover_id', v_handover.id, 'status', v_handover.status,
        'incoming_name', (select e.full_name from public.employees e where e.id = v_handover.incoming_employee_id),
        'mine', ctx.employee_id in (v_handover.incoming_employee_id, v_handover.outgoing_employee_id));
    end if;
    select exists (select 1 from public.cash_closings c where c.shift_id = v_shift.id) into v_cash_closed;
    v_tasks := v_tasks || jsonb_build_object('key', 'cash_close', 'complete', v_cash_closed, 'available', v_shift.status = 'closing');
  end if;
  v_tasks := v_tasks || jsonb_build_object('key', 'deposit_previous', 'complete', not v_deposit_todo);
  return jsonb_build_object(
    'shift', case when v_shift.id is null then null else jsonb_build_object('id', v_shift.id, 'status', v_shift.status, 'label', v_shift.label, 'opened_at', v_shift.opened_at,
      'opened_by', v_shift.opened_by, 'opened_by_name', (select e.full_name from public.employees e where e.id = v_shift.opened_by), 'fuel_closed_at', v_shift.fuel_closed_at) end,
    'setup_complete', (public.station_fuel_setup_status(ctx.station_id) ->> 'complete')::boolean,
    'tasks', v_tasks
  );
end;
$$;
comment on function public.shift_tasks() is 'Écran 21 : état du shift courant et tâches cochables. Ne renvoie jamais de montant attendu ni de total de caisse.';
revoke all on function public.shift_tasks() from public, anon;
grant execute on function public.shift_tasks() to authenticated;

create or replace function public.my_recent_operations(p_limit integer default 5)
returns table (at timestamptz, kind text, label text, method public.payment_method, amount_fcfa bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select tr.device_created_at, tr.kind::text,
    coalesce((select n.label from public.transaction_items i join public.nozzles n on n.id = i.nozzle_id where i.transaction_id = tr.id limit 1),
             (select a.customer_name from public.payments p2 join public.credit_accounts a on a.id = p2.credit_account_id where p2.transaction_id = tr.id limit 1),
             tr.note, tr.kind::text),
    (select p.method from public.payments p where p.transaction_id = tr.id limit 1),
    tr.total_fcfa
  from public.transactions tr
  where tr.employee_id = public.current_employee_id() and tr.station_id in (select public.current_station_ids())
  order by tr.device_created_at desc
  limit greatest(1, least(p_limit, 20));
$$;
comment on function public.my_recent_operations(integer) is 'Écran 21 : les dernières opérations de l''employé connecté uniquement (ses propres ventes, jamais un total).';
revoke all on function public.my_recent_operations(integer) from public, anon;
grant execute on function public.my_recent_operations(integer) to authenticated;
