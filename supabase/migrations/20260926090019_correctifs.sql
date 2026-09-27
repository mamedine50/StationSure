-- =============================================================================
-- 0019 — Lot de correctifs n°1 : petits écarts de caisse cumulés, seuil de commande et
-- niveaux des cuves (écran 20), alerte tank_low, complétude de la configuration carburant
-- (écran 19) et refus d'ouverture de shift, score d'écart avec les petits écarts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Paramètre « cumul d'écarts toléré sur 30 jours par employé » (défaut 5 000 FCFA).
-- -----------------------------------------------------------------------------
alter table public.organization_settings add column small_variance_cumulative_fcfa bigint not null default 5000 check (small_variance_cumulative_fcfa >= 0);
alter table public.station_settings add column small_variance_cumulative_fcfa bigint check (small_variance_cumulative_fcfa is null or small_variance_cumulative_fcfa >= 0);
comment on column public.organization_settings.small_variance_cumulative_fcfa is 'Somme des |écarts| sous la tolérance, par employé, sur 30 jours glissants, au-delà de laquelle une alerte cash_small_variance_cumulative est levée.';

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
      when 'small_variance_cumulative_fcfa' then ss.small_variance_cumulative_fcfa::numeric
    end,
    case p_key
      when 'tank_variance_pct' then os.tank_variance_pct
      when 'delivery_variance_pct' then os.delivery_variance_pct
      when 'cash_tolerance_fcfa' then os.cash_tolerance_fcfa::numeric
      when 'deposit_missing_hours' then os.deposit_missing_hours::numeric
      when 'small_variance_cumulative_fcfa' then os.small_variance_cumulative_fcfa::numeric
    end,
    case p_key
      when 'tank_variance_pct' then 0.5
      when 'delivery_variance_pct' then 0.3
      when 'cash_tolerance_fcfa' then 1000
      when 'deposit_missing_hours' then 24
      when 'small_variance_cumulative_fcfa' then 5000
    end
  )
  from public.stations s
  left join public.organization_settings os on os.organization_id = s.organization_id
  left join public.station_settings ss on ss.station_id = s.id
  where s.id = p_station_id;
$$;

create or replace function public.alert_route_for(p_org uuid, p_type public.alert_type)
returns public.alert_route
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.route from public.alert_routing r where r.organization_id = p_org and r.alert_type = p_type),
    case when p_type in ('handover_mismatch', 'cash_variance', 'delivery_shortfall', 'meter_regression', 'pin_lockout', 'cash_small_variance_cumulative') then 'immediate'::public.alert_route
         else 'report'::public.alert_route end
  );
$$;

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
    when 'cash_small_variance_cumulative' then 'Petits écarts de caisse cumulés : ' || public.format_fcfa((a.payload ->> 'cumulative_fcfa')::bigint) || ' FCFA sur 30 jours (seuil ' || public.format_fcfa((a.payload ->> 'threshold_fcfa')::bigint) || ')'
    when 'tank_low' then 'Cuve ' || coalesce(a.payload ->> 'tank_label', '?') || ' sous le seuil de commande : ' || public.format_litres((a.payload ->> 'volume_cl')::bigint) || ' L (seuil ' || public.format_litres((a.payload ->> 'threshold_cl')::bigint) || ' L)'
    else replace(a.type::text, '_', ' ')
  end;
  return '⚠️ ' || coalesce(v_station, 'Organisation') || ' · ' || v_what
    || case when v_who is not null then ' · ' || v_who else '' end
    || E'\n' || coalesce(v_base, 'http://localhost:3000') || '/alertes?id=' || a.id::text;
end;
$$;

-- Cumul glissant des petits écarts (0 < |écart| ≤ tolérance) de l'employé sur 30 jours.
create or replace function public.employee_small_variance_cumulative(p_employee_id uuid, p_days integer default 30)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(abs(c.variance_fcfa)), 0)::bigint
  from public.cash_closings c
  where c.employee_id = p_employee_id
    and c.closed_at >= now() - make_interval(days => p_days)
    and c.variance_fcfa <> 0
    and abs(c.variance_fcfa) <= public.effective_setting(c.station_id, 'cash_tolerance_fcfa')
    and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
    and (select e.station_id from public.employees e where e.id = p_employee_id) in (select public.current_station_ids());
$$;
revoke all on function public.employee_small_variance_cumulative(uuid, integer) from public, anon;
grant execute on function public.employee_small_variance_cumulative(uuid, integer) to authenticated, service_role;

-- Appelée par close_shift_cash : alerte une seule fois par fenêtre de 30 jours quand le cumul dépasse le seuil.
create or replace function private.check_small_variance_cumulative(p_org uuid, p_station uuid, p_employee uuid, p_closing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seuil bigint := public.effective_setting(p_station, 'small_variance_cumulative_fcfa')::bigint;
  v_cumul bigint;
  v_name text;
begin
  select coalesce(sum(abs(c.variance_fcfa)), 0) into v_cumul
  from public.cash_closings c
  where c.employee_id = p_employee and c.closed_at >= now() - interval '30 days' and c.variance_fcfa <> 0
    and abs(c.variance_fcfa) <= public.effective_setting(c.station_id, 'cash_tolerance_fcfa')
    and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1);
  if v_cumul <= v_seuil then return; end if;
  if exists (select 1 from public.alerts a where a.type = 'cash_small_variance_cumulative'
             and a.payload ->> 'employee_id' = p_employee::text and a.created_at >= now() - interval '30 days') then
    return;
  end if;
  select e.full_name into v_name from public.employees e where e.id = p_employee;
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (p_org, p_station, 'cash_small_variance_cumulative', 'critical',
          jsonb_build_object('employee_id', p_employee, 'employee_name', v_name, 'cumulative_fcfa', v_cumul, 'threshold_fcfa', v_seuil, 'closing_id', p_closing, 'days', 30));
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

drop function public.employee_variance_scores(integer, uuid);
create or replace function public.employee_variance_scores(p_days integer default 30, p_station_id uuid default null)
returns table (employee_id uuid, full_name text, station_id uuid, station_name text, shifts integer, cash_variances integer, small_variances integer, handover_variances integer, rejected_voids integer, meter_regressions integer, weighted numeric, score integer)
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
  sv as (
    select c.employee_id, count(*) as n from public.cash_closings c, since
    where c.closed_at >= since.t and c.variance_fcfa <> 0 and abs(c.variance_fcfa) <= public.effective_setting(c.station_id, 'cash_tolerance_fcfa')
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
  select e.id, e.full_name, e.station_id, s.name, coalesce(sh.n, 0)::int, coalesce(cv.n, 0)::int, coalesce(sv.n, 0)::int, coalesce(hv.n, 0)::int, coalesce(rv.n, 0)::int, coalesce(mr.n, 0)::int,
    (coalesce(cv.n, 0) * 1.0 + coalesce(hv.n, 0) * 1.0 + coalesce(rv.n, 0) * 0.5 + coalesce(mr.n, 0) * 0.5 + coalesce(sv.n, 0) * 0.25)::numeric as weighted,
    least(100, round(400 * (coalesce(cv.n, 0) * 1.0 + coalesce(hv.n, 0) * 1.0 + coalesce(rv.n, 0) * 0.5 + coalesce(mr.n, 0) * 0.5 + coalesce(sv.n, 0) * 0.25) / greatest(coalesce(sh.n, 0), 1)))::int as score
  from emp e
  join public.stations s on s.id = e.station_id
  left join sh on sh.employee_id = e.id
  left join cv on cv.employee_id = e.id
  left join sv on sv.employee_id = e.id
  left join hv on hv.employee_id = e.id
  left join rv on rv.employee_id = e.id
  left join mr on mr.employee_id = e.id
  where e.active
  order by score desc, e.full_name;
$$;

-- -----------------------------------------------------------------------------
-- B. Cuves : seuil de commande, niveaux (écran 20), alerte tank_low.
-- -----------------------------------------------------------------------------
alter table public.tanks add column reorder_threshold_pct numeric(5, 2) not null default 20 check (reorder_threshold_pct >= 0 and reorder_threshold_pct <= 100);
comment on column public.tanks.reorder_threshold_pct is 'Seuil de commande en % de la capacité (défaut 20). Passage sous le seuil au jaugeage → alerte tank_low.';

create or replace function public.tank_levels(p_station_id uuid default null)
returns table (
  tank_id uuid, station_id uuid, label text, fuel_product_code public.fuel_code, capacity_cl bigint, active boolean,
  measured_cl bigint, measured_at timestamptz, theoretical_cl bigint, variance_cl bigint, variance_pct numeric,
  daily_sales_cl bigint, autonomy_days numeric, reorder_threshold_pct numeric, reorder_cl bigint, below_threshold boolean, has_gauge boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select x.* from public.tanks x
    where x.station_id in (select public.current_station_ids()) and (p_station_id is null or x.station_id = p_station_id) and x.active
  ),
  g as (
    select t.id as tank_id, r.volume_cl, r.device_created_at
    from t left join lateral (
      select r.volume_cl, r.device_created_at from public.tank_readings r where r.tank_id = t.id order by r.device_created_at desc limit 1
    ) r on true
  ),
  th as (
    select t.id as tank_id, s.expected_cl from t left join lateral (select expected_cl from public.theoretical_stock_cl(t.id, now())) s on true
  ),
  -- Ventes des 7 derniers jours : relevés d'index des pistolets de la cuve ; à défaut (aucun relevé
  -- avant la fenêtre), litres figés des clôtures du produit répartis entre les cuves actives du produit.
  v as (
    select t.id as tank_id,
      case when public.tank_litres_sold_between(t.id, now() - interval '7 days', now()) > 0
           then public.tank_litres_sold_between(t.id, now() - interval '7 days', now())
           else coalesce((
             select sum((sl ->> 'litres_cl')::bigint)
             from public.cash_closings c, jsonb_array_elements(case when jsonb_typeof(c.details) = 'array' then c.details else '[]'::jsonb end) n, jsonb_array_elements(n -> 'slices') sl
             where c.station_id = t.station_id and c.closed_at >= now() - interval '7 days' and n ->> 'fuel_product_code' = t.fuel_product_code::text
               and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)
           ), 0) / greatest(1, (select count(*) from t t2 where t2.station_id = t.station_id and t2.fuel_product_code = t.fuel_product_code))
      end as sold_cl
    from t
  )
  select t.id, t.station_id, t.label, t.fuel_product_code, t.capacity_cl, t.active,
    g.volume_cl, g.device_created_at,
    case when g.volume_cl is null then null else th.expected_cl end,
    case when g.volume_cl is null or th.expected_cl is null then null else g.volume_cl - th.expected_cl end,
    case when g.volume_cl is null or th.expected_cl is null or th.expected_cl = 0 then null else round((g.volume_cl - th.expected_cl)::numeric / th.expected_cl * 100, 2) end,
    (coalesce(v.sold_cl, 0) / 7)::bigint,
    case when g.volume_cl is null or coalesce(v.sold_cl, 0) = 0 then null else round(g.volume_cl::numeric / (v.sold_cl::numeric / 7), 1) end,
    t.reorder_threshold_pct,
    round(t.capacity_cl * t.reorder_threshold_pct / 100)::bigint,
    g.volume_cl is not null and g.volume_cl < round(t.capacity_cl * t.reorder_threshold_pct / 100),
    g.volume_cl is not null
  from t
  join g on g.tank_id = t.id
  join th on th.tank_id = t.id
  join v on v.tank_id = t.id
  order by t.station_id, t.label;
$$;
comment on function public.tank_levels(uuid) is 'Écran 20 : mesuré (dernier jaugeage), théorique (stock théorique), écart, ventes moyennes 7 jours, autonomie en jours, seuil de commande.';
revoke all on function public.tank_levels(uuid) from public, anon;
grant execute on function public.tank_levels(uuid) to authenticated;

-- Alerte tank_low : une seule fois par passage sous le seuil (le jaugeage précédent était au-dessus).
create or replace function private.after_tank_reading_low()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tank record;
  v_seuil bigint;
  v_prev bigint;
begin
  select * into v_tank from public.tanks t where t.id = new.tank_id;
  v_seuil := round(v_tank.capacity_cl * v_tank.reorder_threshold_pct / 100);
  if new.volume_cl >= v_seuil then return new; end if;
  select r.volume_cl into v_prev from public.tank_readings r
  where r.tank_id = new.tank_id and r.id <> new.id and r.device_created_at < new.device_created_at
  order by r.device_created_at desc limit 1;
  if v_prev is not null and v_prev < v_seuil then return new; end if;
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (new.organization_id, new.station_id, new.shift_id, 'tank_low', 'warning',
          jsonb_build_object('tank_id', new.tank_id, 'tank_label', v_tank.label, 'fuel_product_code', v_tank.fuel_product_code,
                             'volume_cl', new.volume_cl, 'threshold_cl', v_seuil, 'threshold_pct', v_tank.reorder_threshold_pct, 'reading_id', new.id, 'employee_id', new.employee_id));
  return new;
end;
$$;
create trigger after_tank_reading_low after insert on public.tank_readings for each row execute function private.after_tank_reading_low();

-- -----------------------------------------------------------------------------
-- C. Complétude de la configuration carburant (écran 19) et refus d'ouverture de shift.
-- -----------------------------------------------------------------------------
create or replace function public.station_fuel_setup_status(p_station_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tanks jsonb;
  v_prices jsonb;
  v_nb_tanks integer;
  v_nb_calibrated integer;
  v_nb_with_nozzles integer;
  v_nb_pumps integer;
  v_nb_nozzles integer;
  v_missing_prices integer;
begin
  if p_station_id not in (select public.current_station_ids()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'tank_id', t.id, 'label', t.label, 'fuel_product_code', t.fuel_product_code, 'capacity_cl', t.capacity_cl,
      'calibration_points', cal.points, 'nozzles', noz.n,
      'missing', (case when coalesce(cal.points, 0) < 2 then jsonb_build_array('calibration') else '[]'::jsonb end)
               || (case when coalesce(noz.n, 0) = 0 then jsonb_build_array('nozzles') else '[]'::jsonb end)
    ) order by t.label), '[]'::jsonb),
    count(*), count(*) filter (where coalesce(cal.points, 0) >= 2), count(*) filter (where coalesce(noz.n, 0) > 0)
  into v_tanks, v_nb_tanks, v_nb_calibrated, v_nb_with_nozzles
  from public.tanks t
  left join lateral (
    select count(*)::int as points from public.tank_calibrations c
    where c.tank_id = t.id and c.version_id = (
      select v.id from public.tank_calibration_versions v where v.tank_id = t.id and v.effective_from <= now() order by v.effective_from desc limit 1)
  ) cal on true
  left join lateral (select count(*)::int as n from public.nozzles n join public.pumps p on p.id = n.pump_id where n.tank_id = t.id and n.active and p.active) noz on true
  where t.station_id = p_station_id and t.active;
  select count(*) into v_nb_pumps from public.pumps p where p.station_id = p_station_id and p.active;
  select count(*) into v_nb_nozzles from public.nozzles n where n.station_id = p_station_id and n.active;
  select coalesce(jsonb_agg(jsonb_build_object('fuel_product_code', x.code, 'price_fcfa_per_litre', x.price) order by x.code), '[]'::jsonb),
         count(*) filter (where x.price is null)
  into v_prices, v_missing_prices
  from (
    select distinct t.fuel_product_code as code,
      (select pc.price_fcfa_per_litre from public.price_changes pc where pc.station_id = p_station_id and pc.fuel_product_code = t.fuel_product_code and pc.effective_at <= now() order by pc.effective_at desc limit 1) as price
    from public.tanks t where t.station_id = p_station_id and t.active
  ) x;
  return jsonb_build_object(
    'complete', v_nb_tanks > 0 and v_nb_calibrated = v_nb_tanks and v_nb_with_nozzles = v_nb_tanks and v_missing_prices = 0,
    'steps', jsonb_build_object(
      'tanks', jsonb_build_object('complete', v_nb_tanks > 0, 'count', v_nb_tanks),
      'calibration', jsonb_build_object('complete', v_nb_tanks > 0 and v_nb_calibrated = v_nb_tanks, 'done', v_nb_calibrated, 'total', v_nb_tanks),
      'nozzles', jsonb_build_object('complete', v_nb_tanks > 0 and v_nb_with_nozzles = v_nb_tanks, 'pumps', v_nb_pumps, 'nozzles', v_nb_nozzles, 'done', v_nb_with_nozzles, 'total', v_nb_tanks),
      'prices', jsonb_build_object('complete', v_nb_tanks > 0 and v_missing_prices = 0, 'missing', v_missing_prices)
    ),
    'tanks', v_tanks,
    'prices', v_prices
  );
end;
$$;
comment on function public.station_fuel_setup_status(uuid) is 'Écran 19 : complet = au moins une cuve active, chaque cuve avec un barémage en vigueur (≥ 2 points) et un pistolet actif, un prix en vigueur par produit.';
revoke all on function public.station_fuel_setup_status(uuid) from public, anon;
grant execute on function public.station_fuel_setup_status(uuid) to authenticated;

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
