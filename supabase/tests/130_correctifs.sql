-- GÉNÉRÉ par _build.sh à partir de _src/130_correctifs.sql.src — ne pas éditer à la main.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Préambule commun (copié en tête de chaque fichier de test, les fichiers étant
-- exécutés dans des transactions séparées). Simule un JWT Supabase.
create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
-- Identifiants de la seed
create or replace function pg_temp.org_demo() returns uuid language sql as $$ select md5('org:demo')::uuid $$;
create or replace function pg_temp.owner_demo() returns uuid language sql as $$ select md5('user:owner@demo.local')::uuid $$;
create or replace function pg_temp.station(p_slug text) returns uuid language sql as $$ select md5('station:' || p_slug)::uuid $$;
create or replace function pg_temp.device(p_slug text) returns uuid language sql as $$ select md5('device:' || p_slug)::uuid $$;
create or replace function pg_temp.device_user(p_slug text) returns uuid language sql as $$ select md5('user:device-' || p_slug || '@demo.local')::uuid $$;
create or replace function pg_temp.employee(p_slug text, p_name text) returns uuid language sql as $$ select md5('employee:' || p_slug || ':' || p_name)::uuid $$;
create or replace function pg_temp.tank(p_slug text, p_fuel text) returns uuid language sql as $$ select md5('tank:' || p_slug || ':' || p_fuel)::uuid $$;
create or replace function pg_temp.nozzle(p_slug text, p_label text) returns uuid language sql as $$ select md5('nozzle:' || p_slug || ':' || p_label)::uuid $$;
-- Crée un utilisateur auth de test
create or replace function pg_temp.new_auth_user(p_email text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('test', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', '', false);
  return v_id;
end $$;
-- Ouvre un shift + une preuve pour une station de la seed (en tant que postgres)
create or replace function pg_temp.open_shift(p_slug text, p_employee text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, status, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug),
          pg_temp.employee(p_slug, p_employee), now(), 'open', now());
  return v_id;
end $$;
create or replace function pg_temp.new_evidence(p_slug text, p_employee text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256,
    captured_at_device, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_employee),
    'meter_photo', pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_id::text || '.jpg',
    repeat('a', 64), now(), now());
  return v_id;
end $$;
-- Ouvre une session employé sur l'appareil d'une station (en tant que postgres), comme verify_employee_pin le ferait.
create or replace function pg_temp.login_employee(p_slug text, p_name text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  update public.employee_sessions set ended_at = now(), ended_reason = 'replaced'
  where device_id = pg_temp.device(p_slug) and ended_at is null;
  insert into public.employee_sessions (id, organization_id, station_id, device_id, employee_id, expires_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), now() + interval '12 hours');
  return v_id;
end $$;

-- Marque comme reçues (bucket) toutes les preuves de la station (en tant que postgres).
create or replace function pg_temp.upload_all(p_slug text) returns void language sql as $$
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size)
  select e.id, e.organization_id, e.station_id, 1000 from public.evidence_files e
  where e.station_id = pg_temp.station(p_slug) on conflict do nothing $$;
-- Preuve + relevé d'index, exécutés avec les droits de l'appelant (appareil + session employé).
create or replace function pg_temp.meter(p_shift uuid, p_slug text, p_name text, p_label text, p_index bigint, p_kind text,
  p_handover uuid default null, p_side text default null, p_at timestamptz default now()) returns uuid language plpgsql as $$
declare v_ev uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), 'meter_photo',
          pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_ev::text || '.jpg', repeat('c', 64), p_at, p_at);
  insert into public.meter_readings (id, organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id,
    device_created_at, handover_id, handover_side)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), p_shift,
          pg_temp.nozzle(p_slug, p_label), p_kind::public.meter_reading_kind, p_index, v_ev, p_at, p_handover, p_side::public.handover_side);
  return v_id;
end $$;
-- Preuve + jaugeage (volume envoyé volontairement faux : le serveur l'impose).
create or replace function pg_temp.gauge(p_shift uuid, p_slug text, p_name text, p_fuel text, p_height integer, p_kind text, p_at timestamptz default now())
returns uuid language plpgsql as $$
declare v_ev uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), 'tank_gauge',
          pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_ev::text || '.jpg', repeat('d', 64), p_at, p_at);
  insert into public.tank_readings (id, organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at, shift_id, kind)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), pg_temp.tank(p_slug, p_fuel),
          p_height, 1, v_ev, p_at, p_shift, p_kind::public.tank_reading_kind);
  return v_id;
end $$;

-- Lot de correctifs n°1 : villes, petits écarts cumulés, tank_low, complétude carburant,
-- ouverture de shift refusée, script de nettoyage local.
-- Fonction TEMPORAIRE (pg_temp) de nettoyage d'une organisation de test, LOCAL UNIQUEMENT.
-- Chargée par reset-station-config-local.sh (et par le test pgTAP 130). Ne s'exécute qu'à
-- l'intérieur de la transaction ouverte par l'appelant : en mode dry-run (p_confirm = false) elle
-- ne fait que compter ; en mode confirm elle supprime avec session_replication_role = replica
-- (déclencheurs append-only et FK désactivés pour CETTE transaction seulement).
create or replace function pg_temp.reset_station_config(p_email text, p_confirm boolean)
returns table (table_name text, rows_count bigint)
language plpgsql
as $$
declare
  v_user uuid;
  v_org uuid;
  v_demo uuid := md5('org:demo')::uuid;
  -- Conservé : organisation, membres, stations, paramètres, destinataires, routage, invitations, plafonds, audit.
  v_keep text[] := array['organizations', 'org_members', 'stations', 'organization_settings', 'station_settings',
                         'notification_recipients', 'alert_routing', 'supervisor_invitations', 'void_role_limits', 'audit_log', 'products'];
  t record;
  v_n bigint;
  v_replica boolean := false;
  v_restants text[];
  v_suivants text[];
  v_passes integer := 0;
  v_tbl text;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'RESET_REFUSE: aucun utilisateur % ', p_email;
  end if;
  select m.organization_id into v_org from public.org_members m where m.user_id = v_user and m.role = 'owner' limit 1;
  if v_org is null then
    raise exception 'RESET_REFUSE: % n''est propriétaire d''aucune organisation', p_email;
  end if;
  if v_org = v_demo then
    raise exception 'RESET_REFUSE: l''organisation de démo n''est jamais nettoyée';
  end if;
  if p_confirm then
    -- Superuser (supabase_admin) : FK et déclencheurs désactivés pour cette transaction seulement.
    -- Sinon (rôle postgres local, tests pgTAP) : déclencheurs utilisateur désactivés table par table
    -- et suppressions par passes successives dans l'ordre des clés étrangères.
    begin
      perform set_config('session_replication_role', 'replica', true);
      v_replica := true;
    exception when insufficient_privilege then
      v_replica := false;
    end;
  end if;

  -- Fichiers du bucket evidence (lignes storage.objects) : supprimés avant les preuves.
  select count(*) into v_n from storage.objects o
  where o.bucket_id = 'evidence' and o.name in (select e.storage_path from public.evidence_files e where e.organization_id = v_org);
  -- Comptés ici ; supprimés par le script shell via l'API Storage locale (la suppression directe
  -- dans storage.objects est interdite par Supabase).
  table_name := 'storage.objects (bucket evidence, via API)'; rows_count := v_n; return next;

  -- Comptes auth des appareils.
  select count(*) into v_n from auth.users u where u.id in (select d.auth_user_id from public.devices d where d.organization_id = v_org);
  table_name := 'auth.users (appareils)'; rows_count := v_n; return next;
  if p_confirm then
    delete from auth.users u where u.id in (select d.auth_user_id from public.devices d where d.organization_id = v_org);
  end if;

  -- Toutes les tables métier portant organization_id, hors liste conservée.
  for t in
    select c.table_name as name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'organization_id' and c.table_name <> all (v_keep)
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where organization_id = $1', t.name) into v_n using v_org;
    table_name := t.name; rows_count := v_n; return next;
    if p_confirm then
      if v_replica then
        execute format('delete from public.%I where organization_id = $1', t.name) using v_org;
      else
        execute format('alter table public.%I disable trigger user', t.name);
        v_restants := array_append(v_restants, t.name);
      end if;
    end if;
  end loop;
  if p_confirm and not v_replica then
    while coalesce(array_length(v_restants, 1), 0) > 0 and v_passes < 20 loop
      v_passes := v_passes + 1;
      v_suivants := array[]::text[];
      foreach v_tbl in array v_restants loop
        begin
          execute format('delete from public.%I where organization_id = $1', v_tbl) using v_org;
        exception when foreign_key_violation then
          v_suivants := array_append(v_suivants, v_tbl);
        end;
      end loop;
      if array_length(v_suivants, 1) = array_length(v_restants, 1) then
        raise exception 'RESET_ECHEC: dépendances circulaires entre %', v_suivants;
      end if;
      v_restants := v_suivants;
    end loop;
    for t in
      select c.table_name as name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'organization_id' and c.table_name <> all (v_keep)
    loop
      execute format('alter table public.%I enable trigger user', t.name);
    end loop;
  end if;
  return;
end;
$$;

-- ---------------------------------------------------------------- Villes
select is((select count(*)::int from public.sn_regions), 14, '14 régions');
select is((select count(*)::int from public.sn_departments), 46, '46 départements');
select is((select count(*)::int from public.sn_communes), 553, '553 communes');
select pg_temp.login(pg_temp.owner_demo());
select cmp_ok((select count(*)::int from public.sn_communes), '>', 500, 'l''owner lit la référence des communes');
select is((select commune_code from public.stations where id = pg_temp.station('kaolack')), 'kaolack/kaolack/kaolack', 'station Kaolack reliée à la commune de Kaolack');
select is((select r ->> 'region' from public.station_localite(pg_temp.station('mbour')) r), 'Thiès', 'localité complète : Mbour est dans la région de Thiès');
select is((select r ->> 'department' from public.station_localite(pg_temp.station('mbour')) r), 'Mbour', 'département de Mbour');
select throws_ok($$ insert into public.sn_communes (code, name, department_code) values ('x/y/z', 'Z', 'thies/mbour') $$, '42501', null, 'référence en lecture seule pour les utilisateurs connectés');
update public.stations set commune_code = 'thies/mbour/saly', city = 'Saly' where id = pg_temp.station('mbour');
select is((select r ->> 'commune' from public.station_localite(pg_temp.station('mbour')) r), 'Saly', 'l''owner relie sa station à une autre commune');
update public.stations set commune_code = null, city = 'Hameau de test' where id = pg_temp.station('mbour');
select is((select r ->> 'region' from public.station_localite(pg_temp.station('mbour')) r), null, 'option « Autre » : ville libre sans commune');
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select cmp_ok((select count(*)::int from public.sn_regions), '=', 14, 'l''appareil (utilisateur connecté) lit aussi la référence');
select pg_temp.logout();
select pg_temp.as_anon();
select throws_ok($$ select count(*) from public.sn_communes $$, '42501', null, 'anon : aucun accès');
select pg_temp.logout();

-- ---------------------------------------------------------------- Petits écarts cumulés
select is(public.effective_setting(pg_temp.station('thies'), 'small_variance_cumulative_fcfa'), 5000::numeric, 'défaut : cumul toléré 5 000 FCFA');
-- Fatou Faye (Thiès) : la seed a 3 écarts de −500 (J-10, J-20, J-30 → 1 500). On ajoute 4 clôtures de −900.
create or replace function pg_temp.petite_cloture(p_n integer, p_variance bigint) returns uuid language plpgsql as $$
declare v_shift uuid := gen_random_uuid(); v_count uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, device_created_at, label)
  values (v_shift, pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.device('thies'), pg_temp.employee('thies', 'Fatou Faye'), pg_temp.employee('thies', 'Fatou Faye'),
          now() - make_interval(hours => p_n * 2 + 2), now() - make_interval(hours => p_n * 2 + 1), 'closed', now() - make_interval(hours => p_n * 2 + 2), 'test');
  insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at)
  values (v_count, pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.device('thies'), pg_temp.employee('thies', 'Fatou Faye'), v_shift, '{"10000": 10}'::jsonb, now());
  insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id, expected_fuel_fcfa, expected_total_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, deposit_mode, closed_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.device('thies'), pg_temp.employee('thies', 'Fatou Faye'), v_shift, v_count, 100000, 100000, 100000, 100000 + p_variance, p_variance, 'later', now() - make_interval(hours => p_n * 2 + 1));
  perform set_config('app.shift_rpc', 'off', true);
  perform private.check_small_variance_cumulative(pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.employee('thies', 'Fatou Faye'), v_id);
  return v_id;
end $$;
select pg_temp.login(pg_temp.owner_demo());
select public.employee_small_variance_cumulative(pg_temp.employee('thies', 'Fatou Faye')) as base_cumul \gset
select small_variances as base_sv from public.employee_variance_scores(30) where full_name = 'Fatou Faye' \gset
-- Seuil placé pour que la 4e petite clôture de −900 fasse dépasser le cumul (base + 3 200).
update public.organization_settings set small_variance_cumulative_fcfa = :base_cumul + 3200 where organization_id = pg_temp.org_demo();
select pg_temp.logout();
select pg_temp.petite_cloture(1, -900);
select pg_temp.petite_cloture(2, -900);
select pg_temp.petite_cloture(3, -900);
select is((select count(*)::int from public.alerts where type = 'cash_small_variance_cumulative' and created_at >= now()), 0, 'cumul sous le seuil : pas d''alerte, mais chaque écart est enregistré');
select pg_temp.login(pg_temp.owner_demo());
select is(public.employee_small_variance_cumulative(pg_temp.employee('thies', 'Fatou Faye')), (:base_cumul + 2700)::bigint, 'cumul glissant 30 jours = base + 3 × 900');
select is((select small_variances from public.employee_variance_scores(30) where full_name = 'Fatou Faye'), :base_sv + 3, 'les petits écarts sont comptés dans le score');
select cmp_ok((select score from public.employee_variance_scores(30) where full_name = 'Fatou Faye'), '>', 0, '…et pèsent dans le score');
select pg_temp.logout();
select pg_temp.petite_cloture(4, -900);
select is((select count(*)::int from public.alerts where type = 'cash_small_variance_cumulative' and created_at >= now()), 1, 'cumul au-delà du seuil → alerte cash_small_variance_cumulative');
select is((select (payload ->> 'cumulative_fcfa')::int from public.alerts where type = 'cash_small_variance_cumulative' and created_at >= now()), :base_cumul + 3600, 'l''alerte porte le cumul');
select pg_temp.petite_cloture(5, -900);
select is((select count(*)::int from public.alerts where type = 'cash_small_variance_cumulative' and created_at >= now()), 1, 'nouvel écart au-dessus du seuil : pas de seconde alerte (une fois par dépassement)');
select is(public.alert_route_for(pg_temp.org_demo(), 'cash_small_variance_cumulative'), 'immediate', 'routage immédiat par défaut');
select is((select count(*)::int from public.notification_outbox where kind = 'alert' and created_at >= now() and (variables ->> 'type') = 'cash_small_variance_cumulative'), 1, 'alerte mise en file (message court)');
select alike((select body from public.notification_outbox where kind = 'alert' and created_at >= now() and (variables ->> 'type') = 'cash_small_variance_cumulative'), '⚠️ Thiès · Petits écarts de caisse cumulés : ' || public.format_fcfa(:base_cumul + 3600) || ' FCFA sur 30 jours (seuil ' || public.format_fcfa(:base_cumul + 3200) || ') · Fatou Faye%', 'texte de l''alerte');
-- Seuil modifiable (organisation puis station).
select pg_temp.login(pg_temp.owner_demo());
update public.organization_settings set small_variance_cumulative_fcfa = 20000 where organization_id = pg_temp.org_demo();
select is(public.effective_setting(pg_temp.station('thies'), 'small_variance_cumulative_fcfa'), 20000::numeric, 'seuil lu depuis les paramètres');
select pg_temp.logout();

-- ---------------------------------------------------------------- tank_low
select pg_temp.login(pg_temp.owner_demo());
update public.tanks set reorder_threshold_pct = 40 where id = pg_temp.tank('mbour', 'gasoil');
select pg_temp.logout();
select pg_temp.open_shift('mbour', 'Ibrahima Sarr') as shift_tl \gset
select pg_temp.login_employee('mbour', 'Ibrahima Sarr');
-- Les jaugeages sont faits par l'appareil ; les alertes sont lues hors session (l'appareil ne les voit pas).
create or replace function pg_temp.jauge_tl(p_shift uuid, p_mm integer, p_min integer) returns void language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.device_user('mbour'));
  perform pg_temp.gauge(p_shift, 'mbour', 'Ibrahima Sarr', 'gasoil', p_mm, 'spot', now() + make_interval(mins => p_min));
  perform pg_temp.logout();
end $$;
select pg_temp.jauge_tl(:'shift_tl', 1000, 1);
select is((select count(*)::int from public.alerts where type = 'tank_low' and created_at >= now()), 0, 'jauge au-dessus du seuil (13 597 L ≥ 12 000 L) : rien');
select pg_temp.jauge_tl(:'shift_tl', 850, 2);
select is((select count(*)::int from public.alerts where type = 'tank_low' and created_at >= now()), 1, 'jauge sous le seuil (11 300 L < 12 000 L) → alerte tank_low');
select pg_temp.jauge_tl(:'shift_tl', 800, 3);
select is((select count(*)::int from public.alerts where type = 'tank_low' and created_at >= now()), 1, 'toujours sous le seuil : pas de nouvelle alerte');
select pg_temp.jauge_tl(:'shift_tl', 1000, 4);
select pg_temp.jauge_tl(:'shift_tl', 850, 5);
select is((select count(*)::int from public.alerts where type = 'tank_low' and created_at >= now()), 2, 'remontée puis nouveau passage sous le seuil → seconde alerte');
select is((select (payload ->> 'threshold_cl')::bigint from public.alerts where type = 'tank_low' and created_at >= now() limit 1), 1200000::bigint, 'seuil mémorisé (40 % de 30 000 L)');
select pg_temp.logout();
select pg_temp.login(pg_temp.owner_demo());
select is((select below_threshold from public.tank_levels(pg_temp.station('mbour')) where label = 'Cuve Gasoil'), true, 'tank_levels : cuve sous le seuil');
select is((select measured_cl from public.tank_levels(pg_temp.station('mbour')) where label = 'Cuve Gasoil'), 1130000::bigint, 'tank_levels : mesuré = dernier jaugeage');
select cmp_ok((select daily_sales_cl from public.tank_levels(pg_temp.station('mbour')) where label = 'Cuve Gasoil'), '>', 0::bigint, 'tank_levels : ventes moyennes sur 7 jours');
select isnt((select autonomy_days from public.tank_levels(pg_temp.station('mbour')) where label = 'Cuve Gasoil'), null, 'tank_levels : autonomie calculée');
select pg_temp.logout();

-- ---------------------------------------------------------------- Complétude carburant + ouverture de shift
select pg_temp.login(pg_temp.owner_demo());
select is((public.station_fuel_setup_status(pg_temp.station('mbour')) ->> 'complete')::boolean, true, 'Mbour : configuration complète');
insert into public.tanks (id, organization_id, station_id, fuel_product_code, label, capacity_cl) values (md5('tank:test:nouvelle')::uuid, pg_temp.org_demo(), pg_temp.station('mbour'), 'gasoil', 'Cuve 3 test', 1000000);
select is((public.station_fuel_setup_status(pg_temp.station('mbour')) ->> 'complete')::boolean, false, 'nouvelle cuve sans barémage ni pistolet : incomplète');
select is((select t -> 'missing' from public.station_fuel_setup_status(pg_temp.station('mbour')) s, jsonb_array_elements(s -> 'tanks') t where t ->> 'label' = 'Cuve 3 test'), '["calibration", "nozzles"]'::jsonb, 'la liste de ce qui manque nomme la cuve');
select is((public.station_fuel_setup_status(pg_temp.station('mbour')) -> 'steps' -> 'calibration' ->> 'done')::int, 2, 'étape barémage : 2 cuves sur 3');
select pg_temp.logout();
select pg_temp.login_employee('mbour', 'Ibrahima Sarr');
select pg_temp.login(pg_temp.device_user('mbour'));
insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, device_created_at)
values (md5('shift:test:setup')::uuid, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'), now(), now());
select is((public.open_shift(md5('shift:test:setup')::uuid)) ->> 'error', 'FUEL_SETUP_INCOMPLETE', 'ouverture de shift refusée : configuration incomplète (message clair)');
select is((public.station_fuel_setup_status(pg_temp.station('mbour')) ->> 'complete')::boolean, false, 'l''appareil lit aussi la complétude pour bloquer le bouton');
select pg_temp.logout();
select pg_temp.login(pg_temp.owner_demo());
update public.tanks set active = false where id = md5('tank:test:nouvelle')::uuid;
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select is((public.open_shift(md5('shift:test:setup')::uuid)) ->> 'error', 'SHIFT_INCOMPLETE', 'cuve désactivée : la configuration redevient complète, il ne manque plus que les relevés');
select pg_temp.logout();

-- ---------------------------------------------------------------- Script de nettoyage : n'affecte que l'organisation ciblée
select pg_temp.new_auth_user('proprio-test@test.local') as u_test \gset
insert into public.organizations (id, name, plan_code) values (md5('org:test-reset')::uuid, 'Org de test', 'solo');
insert into public.org_members (organization_id, user_id, role) values (md5('org:test-reset')::uuid, :'u_test', 'owner');
insert into public.stations (id, organization_id, name, city) values (md5('station:test-reset')::uuid, md5('org:test-reset')::uuid, 'Station test', 'Saly');
insert into public.tanks (organization_id, station_id, fuel_product_code, label, capacity_cl) values (md5('org:test-reset')::uuid, md5('station:test-reset')::uuid, 'super', 'Cuve A', 500000);
insert into public.pumps (organization_id, station_id, label) values (md5('org:test-reset')::uuid, md5('station:test-reset')::uuid, 'P1');
insert into public.employees (organization_id, station_id, full_name, role) values (md5('org:test-reset')::uuid, md5('station:test-reset')::uuid, 'Employé test', 'manager');
insert into public.notification_recipients (organization_id, name, phone_e164) values (md5('org:test-reset')::uuid, 'Proprio', '+221770000099');
create temporary table demo_avant as select (select count(*) from public.tanks where organization_id = pg_temp.org_demo()) as tanks, (select count(*) from public.employees where organization_id = pg_temp.org_demo()) as employees, (select count(*) from public.cash_closings where organization_id = pg_temp.org_demo()) as closings;
select throws_like($$ select * from pg_temp.reset_station_config('owner@demo.local', false) $$, 'RESET_REFUSE%démo%', 'refus catégorique sur l''organisation de démo');
select throws_like($$ select * from pg_temp.reset_station_config('inconnu@test.local', false) $$, 'RESET_REFUSE%', 'refus pour un courriel inconnu');
select is((select rows_count from pg_temp.reset_station_config('proprio-test@test.local', false) where table_name = 'tanks'), 1::bigint, 'dry-run : compte 1 cuve');
select is((select count(*)::int from public.tanks where organization_id = md5('org:test-reset')::uuid), 1, 'dry-run : rien supprimé');
select is((select sum(rows_count) from pg_temp.reset_station_config('proprio-test@test.local', true) where table_name in ('tanks', 'pumps', 'employees'))::bigint, 3::bigint, 'confirm : 3 lignes supprimées');
select is((select count(*)::int from public.tanks where organization_id = md5('org:test-reset')::uuid) + (select count(*)::int from public.pumps where organization_id = md5('org:test-reset')::uuid) + (select count(*)::int from public.employees where organization_id = md5('org:test-reset')::uuid), 0, 'organisation ciblée : cuves, pompes, employés supprimés');
select is((select count(*)::int from public.stations where organization_id = md5('org:test-reset')::uuid), 1, 'la station est conservée');
select is((select count(*)::int from public.notification_recipients where organization_id = md5('org:test-reset')::uuid), 1, 'les destinataires sont conservés');
select is((select count(*)::int from public.org_members where organization_id = md5('org:test-reset')::uuid), 1, 'les membres sont conservés');
select is((select tanks from demo_avant), (select count(*) from public.tanks where organization_id = pg_temp.org_demo()), 'organisation de démo intacte (cuves)');
select is((select employees from demo_avant), (select count(*) from public.employees where organization_id = pg_temp.org_demo()), 'organisation de démo intacte (employés)');
select is((select closings from demo_avant), (select count(*) from public.cash_closings where organization_id = pg_temp.org_demo()), 'organisation de démo intacte (clôtures)');

select * from finish();
rollback;
