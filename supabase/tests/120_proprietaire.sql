-- GÉNÉRÉ par _build.sh à partir de _src/120_proprietaire.sql.src — ne pas éditer à la main.
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
create or replace function pg_temp.org_demo() returns uuid language sql as $$ select md5('test:org:demo')::uuid $$;
create or replace function pg_temp.owner_demo() returns uuid language sql as $$ select md5('test:user:owner@test-demo.local')::uuid $$;
create or replace function pg_temp.station(p_slug text) returns uuid language sql as $$ select md5('test:station:' || p_slug)::uuid $$;
create or replace function pg_temp.device(p_slug text) returns uuid language sql as $$ select md5('test:device:' || p_slug)::uuid $$;
create or replace function pg_temp.device_user(p_slug text) returns uuid language sql as $$ select md5('test:user:device-' || p_slug || '@test-demo.local')::uuid $$;
create or replace function pg_temp.employee(p_slug text, p_name text) returns uuid language sql as $$ select md5('test:employee:' || p_slug || ':' || p_name)::uuid $$;
create or replace function pg_temp.tank(p_slug text, p_fuel text) returns uuid language sql as $$ select md5('test:tank:' || p_slug || ':' || p_fuel)::uuid $$;
create or replace function pg_temp.nozzle(p_slug text, p_label text) returns uuid language sql as $$ select md5('test:nozzle:' || p_slug || ':' || p_label)::uuid $$;
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

-- =============================================================================
-- DONNÉES DE DÉMO — LOCAL UNIQUEMENT. Ne JAMAIS pousser ce fichier en ligne.
-- Reprend les données de docs/maquette. Les identifiants sont déterministes
-- (md5 d'un libellé) pour que les tests pgTAP puissent les retrouver.
-- =============================================================================

-- Identifiants fixes
-- organisation : md5('test:org:demo')::uuid
-- owner auth   : md5('test:user:owner@test-demo.local')::uuid
-- station      : md5('test:station:<slug>')::uuid           (mbour, thies, kaolack)
-- appareil     : md5('test:device:<slug>')::uuid, auth user md5('test:user:device-<slug>@test-demo.local')::uuid
-- employé      : md5('test:employee:<slug>:<Nom complet>')::uuid
-- cuve         : md5('test:tank:<slug>:<super|gasoil>')::uuid
-- pompe        : md5('test:pump:<slug>:P<n>')::uuid ; pistolet md5('test:nozzle:<slug>:P<n>-<A|B>')::uuid

-- -----------------------------------------------------------------------------
-- Comptes auth de démo (mots de passe de DEV, affichés dans le README)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('owner@test-demo.local', 'Demo-StationSure-2026!'),
      ('device-mbour@test-demo.local', 'Demo-Appareil-2026!'),
      ('device-thies@test-demo.local', 'Demo-Appareil-2026!'),
      ('device-kaolack@test-demo.local', 'Demo-Appareil-2026!')
    ) as u(email, password)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', md5('test:user:' || r.email)::uuid, 'authenticated', 'authenticated', r.email,
      extensions.crypt(r.password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', false
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), md5('test:user:' || r.email)::uuid, md5('test:user:' || r.email)::uuid::text,
      jsonb_build_object('sub', md5('test:user:' || r.email)::uuid::text, 'email', r.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Organisation de démo (plan groupe) + owner
-- -----------------------------------------------------------------------------
insert into public.organizations (id, name, plan_code)
values (md5('test:org:demo')::uuid, 'Démo StationSûre', 'groupe');

insert into public.org_members (organization_id, user_id, role)
values (md5('test:org:demo')::uuid, md5('test:user:owner@test-demo.local')::uuid, 'owner');

-- -----------------------------------------------------------------------------
-- Stations, appareils, employés, cuves, barémage, pompes, pistolets, prix
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('test:org:demo')::uuid;
  v_owner uuid := md5('test:user:owner@test-demo.local')::uuid;
  r record;
  v_station uuid;
  v_tank_super uuid;
  v_tank_gasoil uuid;
  v_pump uuid;
  n integer;
begin
  for r in
    select * from (values
      ('mbour', 'Mbour', 'Mbour'),
      ('thies', 'Thiès', 'Thiès'),
      ('kaolack', 'Kaolack', 'Kaolack')
    ) as s(slug, name, city)
  loop
    v_station := md5('test:station:' || r.slug)::uuid;

    insert into public.stations (id, organization_id, name, city)
    values (v_station, v_org, r.name, r.city);

    insert into public.devices (id, organization_id, station_id, auth_user_id, label)
    values (md5('test:device:' || r.slug)::uuid, v_org, v_station,
            md5('test:user:device-' || r.slug || '@test-demo.local')::uuid, 'Tablette caisse 01');

    -- Cuves + barémage d'exemple (mm → cL). Table volontairement simple, 4 points.
    v_tank_super := md5('test:tank:' || r.slug || ':super')::uuid;
    v_tank_gasoil := md5('test:tank:' || r.slug || ':gasoil')::uuid;
    insert into public.tanks (id, organization_id, station_id, fuel_product_code, label, capacity_cl) values
      (v_tank_super, v_org, v_station, 'super', 'Cuve Super', 2000000),
      (v_tank_gasoil, v_org, v_station, 'gasoil', 'Cuve Gasoil', 3000000);

    -- Barémage version 1 (maquette 13 pour le Gasoil ; 4 points pour le Super = tests de core).
    insert into public.tank_calibration_versions (id, organization_id, station_id, tank_id, version, effective_from, note) values
      (md5('test:calib:' || r.slug || ':super:1')::uuid, v_org, v_station, v_tank_super, 1, '2026-01-01', 'Version initiale de démo'),
      (md5('test:calib:' || r.slug || ':gasoil:1')::uuid, v_org, v_station, v_tank_gasoil, 1, '2026-01-01', 'Version initiale de démo');
    insert into public.tank_calibrations (organization_id, station_id, tank_id, version_id, height_mm, volume_cl) values
      (v_org, v_station, v_tank_super, md5('test:calib:' || r.slug || ':super:1')::uuid, 0, 0),
      (v_org, v_station, v_tank_super, md5('test:calib:' || r.slug || ':super:1')::uuid, 500, 500000),
      (v_org, v_station, v_tank_super, md5('test:calib:' || r.slug || ':super:1')::uuid, 1000, 1400000),
      (v_org, v_station, v_tank_super, md5('test:calib:' || r.slug || ':super:1')::uuid, 1500, 2000000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 0, 0),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 300, 240000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 600, 680000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 750, 950000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 900, 1220000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 1205, 1646000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 1500, 2050000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 1800, 2430000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 2100, 2760000),
      (v_org, v_station, v_tank_gasoil, md5('test:calib:' || r.slug || ':gasoil:1')::uuid, 2400, 3000000);

    -- 3 pompes, 6 pistolets : P<n>-A = Super, P<n>-B = Gasoil
    for n in 1..3 loop
      v_pump := md5('test:pump:' || r.slug || ':P' || n)::uuid;
      insert into public.pumps (id, organization_id, station_id, label)
      values (v_pump, v_org, v_station, 'P' || n);
      insert into public.nozzles (id, organization_id, station_id, pump_id, tank_id, label) values
        (md5('test:nozzle:' || r.slug || ':P' || n || '-A')::uuid, v_org, v_station, v_pump, v_tank_super, 'P' || n || '-A'),
        (md5('test:nozzle:' || r.slug || ':P' || n || '-B')::uuid, v_org, v_station, v_pump, v_tank_gasoil, 'P' || n || '-B');
    end loop;

    -- PRIX FICTIFS DE DÉMO : ce ne sont PAS les prix officiels en vigueur au Sénégal.
    insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, effective_at, created_by) values
      (v_org, v_station, 'super', 990, now() - interval '30 days', v_owner),
      (v_org, v_station, 'gasoil', 755, now() - interval '30 days', v_owner);
  end loop;

  -- Employés (maquette) avec un PIN de démo NON trivial par personne (voir README, local uniquement).
  for r in
    select * from (values
      ('mbour', 'Awa Diop', 'pump_attendant', '4062'),
      ('mbour', 'Moussa Ndiaye', 'pump_attendant', '7391'),
      ('mbour', 'Ibrahima Sarr', 'manager', '8175'),
      ('mbour', 'Khady Fall', 'shop_cashier', '3946'),
      ('mbour', 'Lamine Gueye', 'mechanic', '6203'),
      ('mbour', 'Pape Seck', 'washer', '5817'),
      ('thies', 'Fatou Faye', 'manager', '9034'),
      ('kaolack', 'Cheikh Mbaye', 'manager', '1748'),
      ('kaolack', 'P. Sow', 'washer', '2794')
    ) as e(slug, full_name, role, pin)
  loop
    insert into public.employees (id, organization_id, station_id, full_name, role)
    values (md5('test:employee:' || r.slug || ':' || r.full_name)::uuid, v_org, md5('test:station:' || r.slug)::uuid,
            r.full_name, r.role::public.employee_role);
    insert into public.employee_pins (employee_id, organization_id, pin_hash)
    values (md5('test:employee:' || r.slug || ':' || r.full_name)::uuid, v_org,
            extensions.crypt(r.pin, extensions.gen_salt('bf')));
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- Historique carburant de Mbour (hier) : un shift clos avec relevés d'ouverture et
-- de clôture (index de la maquette 03), jaugeages, et une livraison Gasoil
-- signée avec réserve (maquette 12 : 750 mm → 1 205 mm, facturé 7 000 L, −0,57 %).
-- Les preuves sont marquées reçues sans fichier réel dans le bucket (démo).
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('test:org:demo')::uuid;
  v_station uuid := md5('test:station:mbour')::uuid;
  v_device uuid := md5('test:device:mbour')::uuid;
  v_manager uuid := md5('test:employee:mbour:Ibrahima Sarr')::uuid;
  v_shift uuid := md5('test:shift:mbour:hier')::uuid;
  v_jour date := current_date - 1;
  r record;
  v_ev uuid;
  v_before uuid;
  v_after uuid;
  v_delivery uuid := md5('test:delivery:mbour:hier')::uuid;
begin
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (v_shift, v_org, v_station, v_device, v_manager, v_manager, v_jour + time '06:00', v_jour + time '22:30', 'closed', v_jour + time '22:10', v_jour + time '06:00', 'Journée (démo)');

  -- Relevés d'index : (pistolet, index ouverture cL, index clôture cL)
  for r in
    select * from (values
      ('P1-A', 19770210, 19840210), ('P1-B', 35481870, 35611870), ('P2-A', 14230000, 14295000),
      ('P2-B', 48263255, 48391255), ('P3-A', 21509040, 21588040), ('P3-B', 29993785, 30122785)
    ) as m(label, idx_open, idx_close)
  loop
    v_ev := md5('test:evidence:mbour:open:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '06:02', v_jour + time '06:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('test:nozzle:mbour:' || r.label)::uuid, 'open', r.idx_open, v_ev, v_jour + time '06:02');

    v_ev := md5('test:evidence:mbour:close:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '22:02', v_jour + time '22:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('test:nozzle:mbour:' || r.label)::uuid, 'close', r.idx_close, v_ev, v_jour + time '22:02');
  end loop;

  -- Jaugeages : (cuve, hauteur mm, type, heure)
  for r in
    select * from (values
      ('super', 1000, 'open', time '06:05'), ('gasoil', 750, 'open', time '06:06'),
      ('gasoil', 750, 'delivery_before', time '06:15'), ('gasoil', 1205, 'delivery_after', time '06:50'),
      ('super', 881, 'close', time '22:05'), ('gasoil', 928, 'close', time '22:06')
    ) as g(fuel, height, kind, heure)
  loop
    v_ev := md5('test:evidence:mbour:gauge:' || r.fuel || ':' || r.kind)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'tank_gauge', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + r.heure, v_jour + r.heure);
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.tank_readings (id, organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at, shift_id, kind)
    values (md5('test:reading:mbour:' || r.fuel || ':' || r.kind)::uuid, v_org, v_station, v_device, v_manager, md5('test:tank:mbour:' || r.fuel)::uuid, r.height, 0, v_ev, v_jour + r.heure, v_shift, r.kind::public.tank_reading_kind);
  end loop;

  -- Livraison Gasoil signée avec réserve (bon n° 44871, 7 000 L facturés, 6 960 L reçus)
  v_before := md5('test:reading:mbour:gasoil:delivery_before')::uuid;
  v_after := md5('test:reading:mbour:gasoil:delivery_after')::uuid;
  v_ev := md5('test:evidence:mbour:delivery_note')::uuid;
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, v_org, v_station, v_device, v_manager, 'delivery_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '06:55', v_jour + time '06:55');
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
  insert into public.fuel_deliveries (id, organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref, invoiced_cl, before_cl, after_cl, evidence_id,
    device_created_at, before_reading_id, after_reading_id, variance_pct, signed_with_reserve, reserve_reason, unloading_started_at, unloading_ended_at)
  values (v_delivery, v_org, v_station, v_device, v_manager, md5('test:tank:mbour:gasoil')::uuid, 'Dépôt Diamniadio (démo)', '44871', 700000, 950000, 1646000, v_ev,
    v_jour + time '06:55', v_before, v_after, -0.57, true, 'Manquant 40 L constaté à la jauge', v_jour + time '06:16', v_jour + time '06:48');
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, v_station, v_shift, 'delivery_shortfall', 'critical',
          jsonb_build_object('delivery_id', v_delivery, 'received_cl', 696000, 'invoiced_cl', 700000, 'variance_pct', -0.57), v_jour + time '06:55');
  perform set_config('app.shift_rpc', 'off', true);
end
$$;

-- -----------------------------------------------------------------------------
-- Caisse (phase 4) — Mbour, avant-hier soir : shift clos avec paiements mixtes et
-- l'écart −35 000 de la maquette 04 (attendu 2 385 000 = carburant 2 190 000 +
-- boutique 145 000 + lavage 50 000 ; espèces 1 120 000 + Wave 640 000 + OM 410 000
-- + carte 150 000 + crédit 30 000). Transports Ndiaye (plafond 500 000, 320 000 dû),
-- demande de compte « Garage Diallo », annulation en attente, bordereau manquant à Thiès.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('test:org:demo')::uuid;
  v_station uuid := md5('test:station:mbour')::uuid;
  v_device uuid := md5('test:device:mbour')::uuid;
  v_manager uuid := md5('test:employee:mbour:Ibrahima Sarr')::uuid;
  v_khady uuid := md5('test:employee:mbour:Khady Fall')::uuid;
  v_shift uuid := md5('test:shift:mbour:avant-hier-soir')::uuid;
  v_jour date := current_date - 2;
  v_account uuid := md5('test:credit:mbour:Transports Ndiaye')::uuid;
  v_count uuid := md5('test:cash_count:mbour:avant-hier-soir')::uuid;
  v_closing uuid := md5('test:cash_closing:mbour:avant-hier-soir')::uuid;
  r record;
  v_ev uuid;
  v_tx uuid;
  v_pay uuid;
begin
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (v_shift, v_org, v_station, v_device, v_manager, v_manager, v_jour + time '14:00', v_jour + time '22:30', 'closed', v_jour + time '22:10', v_jour + time '14:00', 'Shift soir (démo)');

  -- Relevés : Super vendu uniquement sur P1-A (1 067,77 L × 990 = 1 057 092), Gasoil sur P1-B (1 500,54 L × 755 = 1 132 908) → 2 190 000.
  for r in
    select * from (values
      ('P1-A', 19663433, 19770210), ('P1-B', 35331816, 35481870), ('P2-A', 14230000, 14230000),
      ('P2-B', 48263255, 48263255), ('P3-A', 21509040, 21509040), ('P3-B', 29993785, 29993785)
    ) as m(label, idx_open, idx_close)
  loop
    v_ev := md5('test:evidence:mbour:soir:open:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '14:02', v_jour + time '14:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('test:nozzle:mbour:' || r.label)::uuid, 'open', r.idx_open, v_ev, v_jour + time '14:02');
    v_ev := md5('test:evidence:mbour:soir:close:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '22:02', v_jour + time '22:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('test:nozzle:mbour:' || r.label)::uuid, 'close', r.idx_close, v_ev, v_jour + time '22:02');
  end loop;

  -- Compte crédit Transports Ndiaye : plafond 500 000, 290 000 déjà dus avant ce shift.
  insert into public.credit_accounts (id, organization_id, station_id, customer_name, phone, limit_fcfa, active, status)
  values (v_account, v_org, v_station, 'Transports Ndiaye', '77 000 00 00', 500000, true, 'active');
  v_ev := md5('test:evidence:mbour:credit:ancien')::uuid;
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, v_org, v_station, v_device, v_manager, 'credit_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour - 3 + time '10:00', v_jour - 3 + time '10:00');
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 150000);
  insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, vehicle_plate, evidence_id, device_created_at)
  values (v_org, v_station, v_device, v_manager, v_account, 'sale', 290000, 'DK-4821-BC', v_ev, v_jour - 3 + time '10:00');

  -- Transactions et paiements du shift : (type, montant, mode, référence / TPE, description, plaque)
  for r in
    select * from (values
      ('fuel', 640000, 'wave', 'WV-88240', 'Gasoil flotte', null),
      ('fuel', 410000, 'orange_money', 'OM-551903', 'Gasoil flotte', null),
      ('fuel', 150000, 'card', '4821', 'Super', null),
      ('fuel', 18000, 'credit', null, 'Gasoil · Transports Ndiaye', 'DK-4821-BC'),
      ('fuel', 12000, 'credit', null, 'Gasoil · Transports Ndiaye', 'DK-4821-BC'),
      ('fuel', 960000, 'cash', null, 'Ventes carburant espèces', null),
      ('shop', 145000, 'cash', null, 'Ticket boutique 1043', null),
      ('wash', 50000, 'cash', null, 'Lavages', null)
    ) as t(kind, amount, method, ref, description, plate)
  loop
    v_tx := gen_random_uuid();
    insert into public.transactions (id, organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, note, device_created_at)
    values (v_tx, v_org, v_station, v_device, case when r.kind = 'shop' then v_khady else v_manager end, v_shift, r.kind::public.transaction_kind, r.amount, r.description, v_jour + time '16:00');
    insert into public.transaction_items (organization_id, station_id, transaction_id, nozzle_id, description, quantity, unit_price_fcfa, amount_fcfa)
    values (v_org, v_station, v_tx, case when r.kind = 'fuel' then md5('test:nozzle:mbour:P1-B')::uuid end, r.description, 1, r.amount, r.amount);
    v_pay := gen_random_uuid();
    insert into public.payments (id, organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, external_ref, card_last4, credit_account_id, device_created_at)
    values (v_pay, v_org, v_station, v_device, v_manager, v_tx, r.method::public.payment_method, r.amount,
            case when r.method in ('wave', 'orange_money') then r.ref end, case when r.method = 'card' then r.ref end,
            case when r.method = 'credit' then v_account end, v_jour + time '16:00');
    if r.method = 'credit' then
      v_ev := gen_random_uuid();
      insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
      values (v_ev, v_org, v_station, v_device, v_manager, 'credit_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '16:00', v_jour + time '16:00');
      insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 150000);
      insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, transaction_id, payment_id, vehicle_plate, evidence_id, device_created_at)
      values (v_org, v_station, v_device, v_manager, v_account, 'sale', r.amount, v_tx, v_pay, r.plate, v_ev, v_jour + time '16:00');
    end if;
    if r.kind = 'shop' then
      -- Annulation demandée par Khady Fall (en attente de l'owner) : article scanné deux fois.
      insert into public.voids (organization_id, station_id, device_id, employee_id, transaction_id, reason, amount_fcfa, shift_id, device_created_at)
      values (v_org, v_station, v_device, v_khady, v_tx, 'Erreur de saisie (article scanné deux fois)', 25000, v_shift, v_jour + time '15:08');
      insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
      values (v_org, v_station, v_shift, 'void_requested', 'warning', jsonb_build_object('transaction_id', v_tx, 'amount_fcfa', 25000, 'employee_id', v_khady, 'reason', 'Erreur de saisie'), v_jour + time '15:08');
    end if;
  end loop;

  -- Billetage (maquette 14) : 1 120 000 FCFA, puis clôture avec écart −35 000 (maquette 04).
  insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
  values (v_count, v_org, v_station, v_device, v_manager, v_shift,
          '{"10000": 78, "5000": 42, "2000": 45, "1000": 25, "500": 16, "200": 20, "100": 25, "50": 10}'::jsonb, v_jour + time '22:12', v_jour + time '22:12');
  insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
    expected_fuel_fcfa, expected_shop_fcfa, expected_wash_fcfa, expected_garage_fcfa, credit_repayments_fcfa, approved_voids_fcfa, expected_total_fcfa,
    wave_fcfa, orange_money_fcfa, card_fcfa, credit_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, justification, deposit_mode, details, closed_at, created_at)
  values (v_closing, v_org, v_station, v_device, v_manager, v_shift, v_count,
    2190000, 145000, 50000, 0, 0, 0, 2385000, 640000, 410000, 150000, 30000, 1155000, 1120000, -35000,
    'Erreur de rendu de monnaie sur un gros billet.', 'later',
    jsonb_build_array(
      jsonb_build_object('nozzle_id', md5('test:nozzle:mbour:P1-A')::uuid, 'label', 'P1-A', 'fuel_product_code', 'super', 'slices', jsonb_build_array(jsonb_build_object('from_cl', 19663433, 'to_cl', 19770210, 'litres_cl', 106777, 'price_fcfa_per_litre', 990, 'amount_fcfa', 1057092)), 'amount_fcfa', 1057092),
      jsonb_build_object('nozzle_id', md5('test:nozzle:mbour:P1-B')::uuid, 'label', 'P1-B', 'fuel_product_code', 'gasoil', 'slices', jsonb_build_array(jsonb_build_object('from_cl', 35331816, 'to_cl', 35481870, 'litres_cl', 150054, 'price_fcfa_per_litre', 755, 'amount_fcfa', 1132908)), 'amount_fcfa', 1132908)),
    v_jour + time '22:30', v_jour + time '22:30');
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details, created_at)
  values (v_org, v_station, v_shift, 'cash', 1155000, 1120000, 'variance', jsonb_build_object('closing_id', v_closing), v_jour + time '22:30');
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, v_station, v_shift, 'cash_variance', 'critical',
          jsonb_build_object('closing_id', v_closing, 'variance_fcfa', -35000, 'employee_id', v_manager, 'employee_name', 'Ibrahima Sarr', 'justification', 'Erreur de rendu de monnaie sur un gros billet.'), v_jour + time '22:30');

  -- Demande de compte « Garage Diallo » par le gérant (plafond 0, en attente).
  insert into public.credit_accounts (id, organization_id, station_id, customer_name, phone, limit_fcfa, active, status, requested_by_employee_id, requested_at)
  values (md5('test:credit:mbour:Garage Diallo')::uuid, v_org, v_station, 'Garage Diallo', '77 000 00 00', 0, false, 'pending', v_manager, current_date + time '10:12');
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (v_org, v_station, 'credit_account_requested', 'info', jsonb_build_object('credit_account_id', md5('test:credit:mbour:Garage Diallo')::uuid, 'customer_name', 'Garage Diallo', 'employee_id', v_manager));

  -- Thiès : shift clos il y a 36 h (Fatou Faye), 940 000 comptés, aucun bordereau → deposit_missing.
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (md5('test:shift:thies:avant-hier-soir')::uuid, v_org, md5('test:station:thies')::uuid, md5('test:device:thies')::uuid, md5('test:employee:thies:Fatou Faye')::uuid, md5('test:employee:thies:Fatou Faye')::uuid,
          now() - interval '44 hours', now() - interval '36 hours', 'closed', now() - interval '36 hours 20 minutes', now() - interval '44 hours', 'Shift soir (démo)');
  insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
  values (md5('test:cash_count:thies:avant-hier-soir')::uuid, v_org, md5('test:station:thies')::uuid, md5('test:device:thies')::uuid, md5('test:employee:thies:Fatou Faye')::uuid, md5('test:shift:thies:avant-hier-soir')::uuid,
          '{"10000": 94}'::jsonb, now() - interval '36 hours 10 minutes', now() - interval '36 hours 10 minutes');
  insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
    expected_fuel_fcfa, expected_total_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, deposit_mode, closed_at, created_at)
  values (md5('test:cash_closing:thies:avant-hier-soir')::uuid, v_org, md5('test:station:thies')::uuid, md5('test:device:thies')::uuid, md5('test:employee:thies:Fatou Faye')::uuid, md5('test:shift:thies:avant-hier-soir')::uuid, md5('test:cash_count:thies:avant-hier-soir')::uuid,
    940000, 940000, 940000, 940000, 0, 'later', now() - interval '36 hours', now() - interval '36 hours');
  perform set_config('app.shift_rpc', 'off', true);
  perform public.flag_missing_deposits();
end
$$;

-- -----------------------------------------------------------------------------
-- Propriétaire à distance (phase 5) — destinataires, téléphones, 30 jours
-- d'historique pour le tableau de bord et le score d'écart, alertes du jour,
-- rapport du soir de Mbour dans la file de notifications (mode test).
-- Les déclencheurs de notification sont coupés pendant l'historique pour ne pas
-- remplir la file avec 90 rapports anciens.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('test:org:demo')::uuid;
  v_tz text := 'Africa/Dakar';
  st record;
  d integer;
  v_jour date;
  v_shift uuid;
  v_closing uuid;
  v_employee uuid;
  v_fuel bigint;
  v_super_fcfa bigint;
  v_gasoil_fcfa bigint;
  v_wave bigint;
  v_om bigint;
  v_variance bigint;
  v_details jsonb;
  v_pct numeric;
  v_ibrahima uuid := md5('test:employee:mbour:Ibrahima Sarr')::uuid;
  v_awa uuid := md5('test:employee:mbour:Awa Diop')::uuid;
  v_moussa uuid := md5('test:employee:mbour:Moussa Ndiaye')::uuid;
  v_khady uuid := md5('test:employee:mbour:Khady Fall')::uuid;
  v_fatou uuid := md5('test:employee:thies:Fatou Faye')::uuid;
  v_cheikh uuid := md5('test:employee:kaolack:Cheikh Mbaye')::uuid;
  v_tx uuid;
  v_void uuid;
begin
  -- Destinataires de démo (numéros fictifs) et téléphones de gérants (relance WhatsApp).
  insert into public.notification_recipients (id, organization_id, name, phone_e164, receives_report, receives_alerts)
  values (md5('test:recipient:proprietaire')::uuid, v_org, 'Propriétaire', '+221770000001', true, true),
         (md5('test:recipient:associe')::uuid, v_org, 'Associé', '+221770000002', true, false);
  update public.employees set phone_e164 = '+221770000010' where id = v_ibrahima;
  update public.employees set phone_e164 = '+221770000011' where id = v_fatou;

  alter table public.cash_closings disable trigger after_cash_closing_notify;
  alter table public.alerts disable trigger after_alert_notify;
  perform set_config('app.shift_rpc', 'on', true);

  for st in
    select * from (values
      ('mbour', 4100000, 0.42, 'Mbour'), ('thies', 3600000, 0.40, 'Thiès'), ('kaolack', 2950000, 0.35, 'Kaolack')
    ) as s(slug, base_fuel, super_share, name)
  loop
    for d in 1..30 loop
      v_jour := current_date - d;
      -- Les shifts déjà présents (Mbour hier / avant-hier, Thiès avant-hier) ne sont pas doublés.
      continue when st.slug = 'mbour' and d in (1, 2);
      continue when st.slug = 'thies' and d = 2;
      v_shift := md5('test:shift:' || st.slug || ':j-' || d)::uuid;
      v_closing := md5('test:cash_closing:' || st.slug || ':j-' || d)::uuid;
      v_employee := case st.slug
        when 'mbour' then case when d % 6 = 0 then v_awa when d % 7 = 0 then v_moussa else v_ibrahima end
        when 'thies' then v_fatou
        else v_cheikh end;
      v_fuel := st.base_fuel + ((d * 7) % 5) * 50000 - ((d * 3) % 4) * 30000;
      v_super_fcfa := round(v_fuel * st.super_share)::bigint;
      v_gasoil_fcfa := v_fuel - v_super_fcfa;
      v_wave := round(v_fuel * 0.16)::bigint;
      v_om := round(v_fuel * 0.11)::bigint;
      -- Écarts de caisse au-delà de la tolérance : Ibrahima Sarr (4), Cheikh Mbaye (2), Awa Diop (1).
      v_variance := case
        when v_employee = v_ibrahima and d in (3, 9, 15, 24) then -5000 * ((d % 3) + 1)
        when v_employee = v_cheikh and d in (5, 19) then -8000
        when v_employee = v_awa and d = 12 then -4000
        when v_employee = v_fatou and d % 10 = 0 then -500
        else 0 end;
      v_details := jsonb_build_array(
        jsonb_build_object('nozzle_id', md5('test:nozzle:' || st.slug || ':P1-A')::uuid, 'label', 'P1-A', 'fuel_product_code', 'super',
          'slices', jsonb_build_array(jsonb_build_object('litres_cl', round(v_super_fcfa::numeric / 990 * 100)::bigint, 'price_fcfa_per_litre', 990, 'amount_fcfa', v_super_fcfa)), 'amount_fcfa', v_super_fcfa),
        jsonb_build_object('nozzle_id', md5('test:nozzle:' || st.slug || ':P1-B')::uuid, 'label', 'P1-B', 'fuel_product_code', 'gasoil',
          'slices', jsonb_build_array(jsonb_build_object('litres_cl', round(v_gasoil_fcfa::numeric / 755 * 100)::bigint, 'price_fcfa_per_litre', 755, 'amount_fcfa', v_gasoil_fcfa)), 'amount_fcfa', v_gasoil_fcfa));
      insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
      values (v_shift, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, v_employee, v_employee,
              (v_jour + time '06:00') at time zone v_tz, (v_jour + time '22:00') at time zone v_tz, 'closed', (v_jour + time '21:45') at time zone v_tz, (v_jour + time '06:00') at time zone v_tz, 'Shift jour');
      insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
      values (md5('test:cash_count:' || st.slug || ':j-' || d)::uuid, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, v_employee, v_shift,
              jsonb_build_object('10000', (v_fuel - v_wave - v_om + v_variance) / 10000, '1000', ((v_fuel - v_wave - v_om + v_variance) % 10000) / 1000, '500', (((v_fuel - v_wave - v_om + v_variance) % 1000) / 500), '100', (((v_fuel - v_wave - v_om + v_variance) % 500) / 100)),
              (v_jour + time '21:50') at time zone v_tz, (v_jour + time '21:50') at time zone v_tz);
      insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
        expected_fuel_fcfa, expected_shop_fcfa, expected_wash_fcfa, expected_garage_fcfa, credit_repayments_fcfa, approved_voids_fcfa, expected_total_fcfa,
        wave_fcfa, orange_money_fcfa, card_fcfa, credit_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, justification, deposit_mode, details, closed_at, created_at)
      values (v_closing, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, v_employee, v_shift, md5('test:cash_count:' || st.slug || ':j-' || d)::uuid,
        v_fuel, 0, 0, 0, 0, 0, v_fuel, v_wave, v_om, 0, 0, v_fuel - v_wave - v_om, v_fuel - v_wave - v_om + v_variance, v_variance,
        case when abs(v_variance) > 1000 then 'Erreur de rendu de monnaie.' end, 'slip', v_details, (v_jour + time '22:00') at time zone v_tz, (v_jour + time '22:00') at time zone v_tz);
      insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
      values (md5('test:evidence:deposit:' || st.slug || ':j-' || d)::uuid, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, v_employee, 'bank_slip',
              v_org::text || '/' || md5('test:station:' || st.slug)::uuid::text || '/' || md5('test:evidence:deposit:' || st.slug || ':j-' || d)::uuid::text || '.jpg', md5('test:a' || d) || md5('test:b' || d), (v_jour + 1 + time '09:00') at time zone v_tz, (v_jour + 1 + time '09:00') at time zone v_tz);
      insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (md5('test:evidence:deposit:' || st.slug || ':j-' || d)::uuid, v_org, md5('test:station:' || st.slug)::uuid, 120000);
      insert into public.bank_deposits (id, organization_id, station_id, device_id, employee_id, amount_fcfa, bank_ref, deposited_at, evidence_id, device_created_at)
      values (md5('test:deposit:' || st.slug || ':j-' || d)::uuid, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, v_employee, v_fuel - v_wave - v_om + v_variance, 'BRD-' || d, (v_jour + 1 + time '09:00') at time zone v_tz, md5('test:evidence:deposit:' || st.slug || ':j-' || d)::uuid, (v_jour + 1 + time '09:00') at time zone v_tz);
      insert into public.bank_deposit_shifts (deposit_id, shift_id, organization_id, station_id)
      values (md5('test:deposit:' || st.slug || ':j-' || d)::uuid, v_shift, v_org, md5('test:station:' || st.slug)::uuid);
      if abs(v_variance) > 1000 then
        insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details, created_at)
        values (v_org, md5('test:station:' || st.slug)::uuid, v_shift, 'cash', v_fuel - v_wave - v_om, v_fuel - v_wave - v_om + v_variance, 'variance', jsonb_build_object('closing_id', v_closing, 'tolerance_fcfa', 1000), (v_jour + time '22:00') at time zone v_tz);
        insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at, acknowledged_at, acknowledged_by)
        values (v_org, md5('test:station:' || st.slug)::uuid, v_shift, 'cash_variance', 'critical',
                jsonb_build_object('closing_id', v_closing, 'variance_fcfa', v_variance, 'tolerance_fcfa', 1000, 'employee_id', v_employee, 'justification', 'Erreur de rendu de monnaie.'),
                (v_jour + time '22:00') at time zone v_tz, (v_jour + 1 + time '08:00') at time zone v_tz, md5('test:user:owner@test-demo.local')::uuid);
        insert into public.cash_variance_decisions (organization_id, station_id, closing_id, decision, decided_by, note, created_at)
        values (v_org, md5('test:station:' || st.slug)::uuid, v_closing, 'accept_loss', md5('test:user:owner@test-demo.local')::uuid, 'Démo', (v_jour + 1 + time '08:00') at time zone v_tz);
      end if;
      -- Rapprochement de cuve du jour (Gasoil) : Kaolack dérive, les autres restent sous le seuil.
      v_pct := case st.slug when 'kaolack' then -0.9 + ((d % 4) * 0.1) when 'thies' then -0.1 else -0.2 end;
      insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details, created_at)
      values (v_org, md5('test:station:' || st.slug)::uuid, v_shift, 'tank', 1000000, 1000000 + round(v_pct * 10000)::bigint,
              (case when abs(v_pct) > 0.5 then 'variance' else 'ok' end)::public.reconciliation_status,
              jsonb_build_object('tank_id', md5('test:tank:' || st.slug || ':gasoil')::uuid, 'variance_pct', v_pct, 'threshold_pct', 0.5), (v_jour + time '21:40') at time zone v_tz);
      if abs(v_pct) > 0.5 then
        insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at, acknowledged_at, acknowledged_by)
        values (v_org, md5('test:station:' || st.slug)::uuid, v_shift, 'tank_variance', 'warning',
                jsonb_build_object('tank_id', md5('test:tank:' || st.slug || ':gasoil')::uuid, 'variance_pct', v_pct, 'threshold_pct', 0.5, 'employee_id', v_employee),
                (v_jour + time '21:40') at time zone v_tz, (v_jour + 1 + time '08:00') at time zone v_tz, md5('test:user:owner@test-demo.local')::uuid);
      end if;
    end loop;
  end loop;

  -- Passation attribuée à Ibrahima Sarr (J-8), annulation refusée de Khady Fall (J-11),
  -- index qui recule de Moussa Ndiaye (J-14) : entrées du score d'écart.
  insert into public.shift_handovers (organization_id, station_id, device_id, from_shift_id, to_shift_id, outgoing_employee_id, incoming_employee_id, status,
    signed_out_at, signed_in_at, device_created_at, discrepancies, discrepancy_reported, discrepancy_reason, attributed_shift_id, created_at)
  values (v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, md5('test:shift:mbour:j-8')::uuid, md5('test:shift:mbour:j-7')::uuid, v_ibrahima, v_awa, 'disputed',
    (current_date - 8 + time '14:00') at time zone v_tz, (current_date - 8 + time '14:05') at time zone v_tz, (current_date - 8 + time '14:00') at time zone v_tz,
    jsonb_build_array(jsonb_build_object('label', 'P3-A', 'nozzle_id', md5('test:nozzle:mbour:P3-A')::uuid, 'index_outgoing_cl', 21509040, 'index_incoming_cl', 21508040, 'variance_cl', -1000)),
    true, 'Index relevé avant la fin du plein', md5('test:shift:mbour:j-8')::uuid, (current_date - 8 + time '14:05') at time zone v_tz);
  v_tx := gen_random_uuid();
  insert into public.transactions (id, organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, note, device_created_at, created_at)
  values (v_tx, v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_khady, md5('test:shift:mbour:j-11')::uuid, 'shop', 18000, 'Ticket boutique 0977', (current_date - 11 + time '11:00') at time zone v_tz, (current_date - 11 + time '11:00') at time zone v_tz);
  insert into public.payments (organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, device_created_at, created_at)
  values (v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_khady, v_tx, 'cash', 18000, (current_date - 11 + time '11:00') at time zone v_tz, (current_date - 11 + time '11:00') at time zone v_tz);
  v_void := gen_random_uuid();
  insert into public.voids (id, organization_id, station_id, device_id, employee_id, transaction_id, reason, amount_fcfa, shift_id, device_created_at, created_at)
  values (v_void, v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_khady, v_tx, 'Client parti sans payer', 18000, md5('test:shift:mbour:j-11')::uuid, (current_date - 11 + time '11:05') at time zone v_tz, (current_date - 11 + time '11:05') at time zone v_tz);
  insert into public.void_approvals (organization_id, station_id, void_id, decision, decided_by, note, decided_at)
  values (v_org, md5('test:station:mbour')::uuid, v_void, 'rejected', md5('test:user:owner@test-demo.local')::uuid, 'Pas de preuve', (current_date - 10 + time '08:00') at time zone v_tz);
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (md5('test:evidence:mbour:regression:j-14')::uuid, v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_moussa, 'meter_photo',
          v_org::text || '/' || md5('test:station:mbour')::uuid::text || '/' || md5('test:evidence:mbour:regression:j-14')::uuid::text || '.jpg', md5('test:r1') || md5('test:r2'), (current_date - 14 + time '21:45') at time zone v_tz, (current_date - 14 + time '21:45') at time zone v_tz);
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (md5('test:evidence:mbour:regression:j-14')::uuid, v_org, md5('test:station:mbour')::uuid, 120000);
  -- (relevé placé juste après la clôture d'avant-hier : 14 229 500 < 14 230 000 → régression détectée par le déclencheur)
  insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, justification, device_created_at, created_at)
  values (v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_moussa, md5('test:shift:mbour:avant-hier-soir')::uuid, md5('test:nozzle:mbour:P2-A')::uuid, 'close', 14229500, md5('test:evidence:mbour:regression:j-14')::uuid, 'Erreur de lecture', (current_date - 2 + time '22:05') at time zone v_tz, (current_date - 2 + time '22:05') at time zone v_tz);

  -- Aujourd'hui : Mbour a un shift ouvert (Awa Diop), Thiès et Kaolack ont clôturé.
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, status, device_created_at, label)
  values (md5('test:shift:mbour:aujourdhui')::uuid, v_org, md5('test:station:mbour')::uuid, md5('test:device:mbour')::uuid, v_awa, least(now() - interval '12 hours', (current_date + time '06:00') at time zone v_tz), 'open', least(now() - interval '12 hours', (current_date + time '06:00') at time zone v_tz), 'Shift matin');
  -- L'horodatage serveur d'ouverture est imposé à l'insertion : on le recale sur l'heure d'ouverture de démo.
  update public.shifts set opened_at = least(now() - interval '12 hours', (current_date + time '06:00') at time zone v_tz) where id = md5('test:shift:mbour:aujourdhui')::uuid;
  for st in select * from (values ('thies', v_fatou, 4205000, 0.40), ('kaolack', v_cheikh, 3443000, 0.35)) as s(slug, emp, fuel, super_share) loop
    v_shift := md5('test:shift:' || st.slug || ':aujourdhui')::uuid;
    v_closing := md5('test:cash_closing:' || st.slug || ':aujourdhui')::uuid;
    v_super_fcfa := round(st.fuel * st.super_share)::bigint;
    v_gasoil_fcfa := st.fuel - v_super_fcfa;
    v_wave := round(st.fuel * 0.16)::bigint;
    v_om := round(st.fuel * 0.11)::bigint;
    -- Horaires bornés par now() : la seed doit passer à n'importe quelle heure (tests autonomes, tôt le matin UTC).
    insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
    values (v_shift, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, st.emp, st.emp,
            least(now() - interval '2 hours', (current_date + time '06:00') at time zone v_tz),
            greatest(least(now(), (current_date + time '14:00') at time zone v_tz), least(now() - interval '2 hours', (current_date + time '06:00') at time zone v_tz) + interval '1 minute'),
            'closed',
            greatest(least(now(), (current_date + time '13:45') at time zone v_tz), least(now() - interval '2 hours', (current_date + time '06:00') at time zone v_tz) + interval '1 minute'),
            least(now() - interval '2 hours', (current_date + time '06:00') at time zone v_tz), 'Shift matin');
    insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
    values (md5('test:cash_count:' || st.slug || ':aujourdhui')::uuid, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, st.emp, v_shift, jsonb_build_object('10000', (st.fuel - v_wave - v_om) / 10000, '1000', ((st.fuel - v_wave - v_om) % 10000) / 1000), least(now(), (current_date + time '13:50') at time zone v_tz), least(now(), (current_date + time '13:50') at time zone v_tz));
    insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
      expected_fuel_fcfa, expected_shop_fcfa, expected_wash_fcfa, expected_garage_fcfa, credit_repayments_fcfa, approved_voids_fcfa, expected_total_fcfa,
      wave_fcfa, orange_money_fcfa, card_fcfa, credit_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, deposit_mode, details, closed_at, created_at)
    values (v_closing, v_org, md5('test:station:' || st.slug)::uuid, md5('test:device:' || st.slug)::uuid, st.emp, v_shift, md5('test:cash_count:' || st.slug || ':aujourdhui')::uuid,
      st.fuel, 0, 0, 0, 0, 0, st.fuel, v_wave, v_om, 0, 0, st.fuel - v_wave - v_om, st.fuel - v_wave - v_om, 0, 'later',
      jsonb_build_array(
        jsonb_build_object('nozzle_id', md5('test:nozzle:' || st.slug || ':P1-A')::uuid, 'label', 'P1-A', 'fuel_product_code', 'super', 'slices', jsonb_build_array(jsonb_build_object('litres_cl', round(v_super_fcfa::numeric / 990 * 100)::bigint, 'price_fcfa_per_litre', 990, 'amount_fcfa', v_super_fcfa)), 'amount_fcfa', v_super_fcfa),
        jsonb_build_object('nozzle_id', md5('test:nozzle:' || st.slug || ':P1-B')::uuid, 'label', 'P1-B', 'fuel_product_code', 'gasoil', 'slices', jsonb_build_array(jsonb_build_object('litres_cl', round(v_gasoil_fcfa::numeric / 755 * 100)::bigint, 'price_fcfa_per_litre', 755, 'amount_fcfa', v_gasoil_fcfa)), 'amount_fcfa', v_gasoil_fcfa)),
      least(now(), (current_date + time '14:00') at time zone v_tz), least(now(), (current_date + time '14:00') at time zone v_tz));
  end loop;
  -- Cuve Gasoil de Kaolack : −0,9 % ce matin (seuil 0,5 %) → alerte du jour, routée « rapport du soir ».
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details, created_at)
  values (v_org, md5('test:station:kaolack')::uuid, md5('test:shift:kaolack:aujourdhui')::uuid, 'tank', 1000000, 991000, 'variance',
          jsonb_build_object('tank_id', md5('test:tank:kaolack:gasoil')::uuid, 'variance_pct', -0.9, 'threshold_pct', 0.5), least(now(), (current_date + time '11:40') at time zone v_tz));
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, md5('test:station:kaolack')::uuid, md5('test:shift:kaolack:aujourdhui')::uuid, 'tank_variance', 'warning',
          jsonb_build_object('tank_id', md5('test:tank:kaolack:gasoil')::uuid, 'variance_pct', -0.9, 'threshold_pct', 0.5, 'litres_sold_cl', 1000000, 'employee_id', v_cheikh), least(now(), (current_date + time '11:40') at time zone v_tz));

  perform set_config('app.shift_rpc', 'off', true);
  alter table public.cash_closings enable trigger after_cash_closing_notify;
  alter table public.alerts enable trigger after_alert_notify;

  -- File de notifications (mode test) : le rapport du soir de Mbour (maquette 04 / 06) et une
  -- alerte immédiate de passation (écran 06, 14:03) qui passe par le déclencheur.
  perform public.enqueue_evening_report(md5('test:cash_closing:mbour:avant-hier-soir')::uuid);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, md5('test:station:mbour')::uuid, md5('test:shift:mbour:aujourdhui')::uuid, 'handover_mismatch', 'critical',
          jsonb_build_object('handover_id', gen_random_uuid(), 'outgoing_employee_id', v_awa, 'incoming_employee_id', v_moussa, 'employee_id', v_awa,
                             'mismatches', jsonb_build_array(jsonb_build_object('label', 'P3-A', 'nozzle_id', md5('test:nozzle:mbour:P3-A')::uuid, 'index_outgoing_cl', 21509040, 'index_incoming_cl', 21508040, 'variance_cl', -1000))),
          least(now(), (current_date + time '14:03') at time zone v_tz));
end
$$;

-- -----------------------------------------------------------------------------
-- Lot de correctifs n°1 : rattachement des stations de démo à leur commune.
-- -----------------------------------------------------------------------------
update public.stations s
set commune_code = c.code
from public.sn_communes c
where s.commune_code is null
  and public.normaliser_localite(s.city) = public.normaliser_localite(c.name)
  and (select count(*) from public.sn_communes c2 where public.normaliser_localite(c2.name) = public.normaliser_localite(s.city)) = 1;
-- Thiès et Mbour sont des communes d'arrondissement / chefs-lieux : rattachement explicite.
update public.stations set commune_code = 'thies/thies/thies-nord' where id = md5('test:station:thies')::uuid and commune_code is null;
update public.stations set commune_code = (select code from public.sn_communes where code like 'thies/mbour/mbour%' order by code limit 1) where id = md5('test:station:mbour')::uuid and commune_code is null;

-- Phase 5 : paramètres (org → station, verrouillés), destinataires, outbox, rapport du soir,
-- alertes immédiates / rapport, anti-spam 10 min, score d'écart, invitations superviseurs.
create temp table ctx_p5 as select
  md5('test:org:demo')::uuid as org,
  md5('test:station:mbour')::uuid as mbour,
  md5('test:station:thies')::uuid as thies,
  md5('test:station:kaolack')::uuid as kaolack,
  md5('test:cash_closing:mbour:avant-hier-soir')::uuid as closing_mbour,
  md5('test:recipient:proprietaire')::uuid as dest_owner,
  md5('test:recipient:associe')::uuid as dest_associe;
grant select on ctx_p5 to authenticated, service_role, anon;
select pg_temp.new_auth_user('supervisor-p5@test.local') as sup_id \gset
insert into public.org_members (organization_id, user_id, role) values (pg_temp.org_demo(), :'sup_id', 'supervisor');

-- ---------------------------------------------------------------- Paramètres
select is((select count(*)::int from public.organization_settings where organization_id = pg_temp.org_demo()), 1, 'paramètres créés avec l''organisation');
select is(public.effective_setting(pg_temp.station('mbour'), 'tank_variance_pct'), 0.5::numeric, 'défaut écart de cuve 0,5 %');
select is(public.effective_setting(pg_temp.station('mbour'), 'delivery_variance_pct'), 0.3::numeric, 'défaut écart de livraison 0,3 %');
select is(public.effective_setting(pg_temp.station('mbour'), 'cash_tolerance_fcfa'), 1000::numeric, 'défaut tolérance espèces 1 000 FCFA');
select is(public.effective_setting(pg_temp.station('mbour'), 'deposit_missing_hours'), 24::numeric, 'défaut bordereau manquant 24 h');

select pg_temp.login(pg_temp.owner_demo());
update public.organization_settings set tank_variance_pct = 1.2, cash_tolerance_fcfa = 2500 where organization_id = pg_temp.org_demo();
select is(public.effective_setting(pg_temp.station('mbour'), 'tank_variance_pct'), 1.2::numeric, 'seuil lu depuis l''organisation');
select is(public.effective_setting(pg_temp.station('thies'), 'cash_tolerance_fcfa'), 2500::numeric, 'tolérance lue depuis l''organisation');
insert into public.station_settings (station_id, organization_id, tank_variance_pct) values (pg_temp.station('thies'), pg_temp.org_demo(), 0.2);
select is(public.effective_setting(pg_temp.station('thies'), 'tank_variance_pct'), 0.2::numeric, 'la surcharge station prime sur l''organisation');
select is(public.effective_setting(pg_temp.station('mbour'), 'tank_variance_pct'), 1.2::numeric, 'les autres stations gardent la valeur de l''organisation');
select is((select count(*)::int from public.audit_log where table_name in ('organization_settings', 'station_settings') and at >= now() and organization_id = pg_temp.org_demo() and action <> 'INSERT') + (select count(*)::int from public.audit_log where table_name = 'station_settings' and action = 'INSERT' and at >= now() and organization_id = pg_temp.org_demo()), 2, 'modifications des paramètres tracées dans l''audit');
select pg_temp.logout();

-- Verrouillé : aucune colonne pour les tolérances des paiements électroniques / passation / index.
select hasnt_column('public', 'organization_settings', 'electronic_payment_tolerance_fcfa', 'pas de colonne « tolérance paiements électroniques »');
select hasnt_column('public', 'organization_settings', 'handover_tolerance_cl', 'pas de colonne « tolérance passation »');
select is(public.locked_tolerances(), '{"handover_cl": 0, "meter_regression_cl": 0, "electronic_payments_fcfa": 0}'::jsonb, 'tolérances verrouillées à 0');

-- Le superviseur lit mais n'écrit pas ; personne (authentifié) ne modifie le schéma.
select pg_temp.login(:'sup_id');
select throws_ok($$ alter table public.organization_settings add column handover_tolerance_cl integer $$, '42501', null, 'un utilisateur authentifié ne peut pas ajouter une colonne de tolérance');
select is((select tank_variance_pct from public.organization_settings where organization_id = pg_temp.org_demo()), 1.2::numeric, 'le superviseur lit les paramètres');
update public.organization_settings set tank_variance_pct = 9 where organization_id = pg_temp.org_demo();
select is((select tank_variance_pct from public.organization_settings where organization_id = pg_temp.org_demo()), 1.2::numeric, 'le superviseur ne modifie pas les paramètres (RLS)');
select throws_ok($$ insert into public.station_settings (station_id, organization_id, cash_tolerance_fcfa) values (md5('test:station:mbour')::uuid, md5('test:org:demo')::uuid, 5) $$, '42501', null, 'le superviseur ne crée pas de surcharge station');
select pg_temp.logout();

-- (Le rapprochement de cuve et la livraison avec seuils modifiés sont testés dans 100_carburant.)
select pg_temp.open_shift('mbour', 'Ibrahima Sarr') as shift_p5 \gset

-- Bordereau manquant : délai lu depuis les paramètres (48 h → la clôture de 36 h de Thiès n'est plus en retard).
select pg_temp.login(pg_temp.owner_demo());
update public.organization_settings set deposit_missing_hours = 72 where organization_id = pg_temp.org_demo();
select pg_temp.logout();
delete from public.alerts where type = 'deposit_missing';
select public.flag_missing_deposits();
select is((select count(*)::int from public.alerts where type = 'deposit_missing' and organization_id = pg_temp.org_demo()), 0, 'délai 72 h : aucun bordereau en retard');
select pg_temp.login(pg_temp.owner_demo());
update public.organization_settings set deposit_missing_hours = 24 where organization_id = pg_temp.org_demo();
select pg_temp.logout();
select public.flag_missing_deposits();
select is((select count(*)::int from public.alerts where type = 'deposit_missing' and organization_id = pg_temp.org_demo()), 2, 'délai 24 h : Thiès (36 h) et Mbour (avant-hier) sont signalées');

-- ---------------------------------------------------------------- Destinataires
select pg_temp.login(pg_temp.owner_demo());
select is((select count(*)::int from public.notification_recipients where organization_id = pg_temp.org_demo()), 2, 'l''owner lit les 2 destinataires de démo');
select throws_ok($$ insert into public.notification_recipients (organization_id, name, phone_e164) values (md5('test:org:demo')::uuid, 'Test', '77 000 00 03') $$, '23514', null, 'numéro non E.164 refusé');
select lives_ok($$ insert into public.notification_recipients (organization_id, name, phone_e164, receives_report, receives_alerts) values (md5('test:org:demo')::uuid, 'Comptable', '+221770000003', true, false) $$, 'numéro E.164 accepté');
select pg_temp.logout();
select pg_temp.login(:'sup_id');
select is((select count(*)::int from public.notification_recipients), 0, 'le superviseur ne lit aucun numéro de destinataire');
select is((select count(*)::int from public.notification_outbox), 0, 'le superviseur ne lit pas la file de messages');
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select is((select count(*)::int from public.notification_recipients), 0, 'l''appareil ne lit aucun numéro de destinataire');
select is((select count(*)::int from public.notification_outbox), 0, 'l''appareil ne lit pas la file de messages');
select is((select count(*)::int from public.organization_settings), 1, 'l''appareil lit les paramètres de son organisation (seuils)');
select pg_temp.logout();

-- Routage : défauts puis surcharge.
select is(public.alert_route_for(pg_temp.org_demo(), 'cash_variance'), 'immediate', 'écart de caisse : immédiat par défaut');
select is(public.alert_route_for(pg_temp.org_demo(), 'pin_lockout'), 'immediate', 'PIN bloqué : immédiat par défaut');
select is(public.alert_route_for(pg_temp.org_demo(), 'tank_variance'), 'report', 'écart de cuve : rapport du soir par défaut');
select pg_temp.login(pg_temp.owner_demo());
insert into public.alert_routing (organization_id, alert_type, route) values (pg_temp.org_demo(), 'tank_variance', 'immediate');
select pg_temp.logout();
select is(public.alert_route_for(pg_temp.org_demo(), 'tank_variance'), 'immediate', 'routage modifié par l''owner');

-- ---------------------------------------------------------------- Rapport du soir
select pg_temp.as_service();
select is((select count(*)::int from public.notification_outbox where kind = 'evening_report' and idempotency_key like 'report:' || (select closing_mbour from ctx_p5)::text || '%'), 2,
          'la seed a mis en file UN rapport par destinataire « rapport du soir » (2)');
select is(public.enqueue_evening_report((select closing_mbour from ctx_p5)), 1, 'remettre en file le même rapport n''ajoute que le nouveau destinataire « Comptable »');
select is(public.enqueue_evening_report((select closing_mbour from ctx_p5)), 0, 'troisième appel : rien (idempotent)');
select is((select count(*)::int from public.notification_outbox where kind = 'evening_report' and idempotency_key like 'report:' || (select closing_mbour from ctx_p5)::text || '%'), 3, '3 messages, un par destinataire');
select is((select body from public.notification_outbox where idempotency_key = 'report:' || (select closing_mbour from ctx_p5)::text || ':' || (select dest_owner from ctx_p5)::text),
  E'Station Mbour · Clôture du ' || to_char(current_date - 2, 'DD/MM') || E'\n'
  || E'Chiffre d''affaires : 2 385 000 FCFA\n'
  || E'Carburant 2 190 000 · Boutique 145 000 · Garage 0 · Lavage 50 000\n'
  || E'Litres : Super 1 067 · Gasoil 1 500\n'
  || E'⚠️ Écart caisse Shift soir (démo) : −35 000 FCFA (gérant : Ibrahima Sarr)\n'
  || E'✅ Passations OK\n'
  || E'⚠️ Bordereau de versement : manquant\n'
  || E'⚠️ Wave / Orange Money : 1 050 000 FCFA, en attente de rapprochement\n'
  || E'✅ Cuves : pas de jaugeage rapproché\n'
  || E'✅ Photos d''index : 13/13\n'
  || 'Détail : http://localhost:3000/caisse/' || md5('test:shift:mbour:avant-hier-soir')::uuid::text,
  'texte du rapport identique à l''écran 06 et à renderRapportSoir (core)');
select is((select r ->> 'ca_total_fcfa' from public.build_evening_report((select closing_mbour from ctx_p5)) r), '2385000', 'rapport construit depuis les valeurs figées');
select is(public.format_fcfa(-35000), '−35 000', 'format_fcfa miroir de formatFCFA');
select is(public.format_litres(1000), '10,00', 'format_litres miroir de formatLitres');
select is(public.format_pct(-0.9), '−0,9 %', 'format_pct miroir de formatPourcent');
select is((select count(*)::int from public.notification_outbox_events e join public.notification_outbox o on o.id = e.outbox_id where o.kind = 'evening_report' and e.status = 'queued' and o.organization_id = pg_temp.org_demo()), 3, 'historique : un événement « queued » par message');

-- Mode heure fixe : rien n'est envoyé après une clôture, tout part à l'heure choisie.
update public.organization_settings set report_mode = 'fixed_time', report_time = (now() at time zone 'Africa/Dakar')::time where organization_id = pg_temp.org_demo();
select pg_temp.open_shift('thies', 'Fatou Faye') as shift_fixe \gset
update public.shifts set status = 'closed', closed_at = now() where id = :'shift_fixe';
insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at)
values (md5('test:cash_count:test:fixe')::uuid, pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.device('thies'), pg_temp.employee('thies', 'Fatou Faye'), :'shift_fixe', '{"10000": 10}'::jsonb, now());
insert into public.cash_closings (organization_id, station_id, device_id, employee_id, shift_id, cash_count_id, expected_fuel_fcfa, expected_total_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, deposit_mode)
values (pg_temp.org_demo(), pg_temp.station('thies'), pg_temp.device('thies'), pg_temp.employee('thies', 'Fatou Faye'), :'shift_fixe', md5('test:cash_count:test:fixe')::uuid, 100000, 100000, 100000, 100000, 0, 'later');
select is((select count(*)::int from public.notification_outbox where kind = 'evening_report' and idempotency_key like 'report:' || (select id from public.cash_closings where shift_id = :'shift_fixe')::text || '%'), 0, 'heure fixe : aucun rapport immédiatement après la clôture');
select cmp_ok(public.dispatch_scheduled_reports(), '>=', 3, 'heure fixe atteinte : les rapports du jour partent (un par destinataire)');
select is((select count(*)::int from public.notification_outbox where kind = 'evening_report' and idempotency_key like 'report:' || (select id from public.cash_closings where shift_id = :'shift_fixe')::text || '%'), 3, 'rapport de la clôture du jour en file (3 destinataires)');
select is(public.dispatch_scheduled_reports(), 0, 'second passage dans la même tranche : rien de plus (idempotent)');
update public.organization_settings set report_mode = 'after_each_closing' where organization_id = pg_temp.org_demo();

-- Résumé multi-stations (3 stations) : une ligne par station clôturée.
select is((select jsonb_array_length(r -> 'stations') from public.build_summary_report(pg_temp.org_demo(), current_date - 5) r), 3, 'résumé du J-5 : 3 stations');
select alike(public.render_summary_report(public.build_summary_report(pg_temp.org_demo(), current_date - 5)), 'Résumé du ' || to_char(current_date - 5, 'DD/MM') || ' · 3 clôture(s) sur 3 station(s)%', 'texte du résumé');

-- ---------------------------------------------------------------- Alertes immédiates + anti-spam
insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
values (pg_temp.org_demo(), pg_temp.station('mbour'), :'shift_p5', 'cash_variance', 'critical', jsonb_build_object('variance_fcfa', -12000, 'employee_id', pg_temp.employee('mbour', 'Ibrahima Sarr')));
select is((select count(*)::int from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), 1, 'alerte immédiate → un message pour le seul destinataire « alertes graves »');
select is((select to_phone from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), '+221770000001', 'envoyé au destinataire qui reçoit les alertes');
select is((select body from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), E'⚠️ Mbour · Écart de caisse −12 000 FCFA · Ibrahima Sarr\nhttp://localhost:3000/alertes?id=' || (select id from public.alerts where type = 'cash_variance' and shift_id = :'shift_p5')::text, 'message court : quoi, où, qui, montant, lien');
insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
values (pg_temp.org_demo(), pg_temp.station('mbour'), :'shift_p5', 'cash_variance', 'critical', jsonb_build_object('variance_fcfa', -12000, 'employee_id', pg_temp.employee('mbour', 'Ibrahima Sarr')));
select is((select count(*)::int from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), 1, 'anti-spam : alerte identique (station + type) dans les 10 min → regroupée');
select is((select variables ->> 'count' from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), '2', 'le message regroupé compte 2 alertes');
insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
values (pg_temp.org_demo(), pg_temp.station('thies'), null, 'cash_variance', 'critical', jsonb_build_object('variance_fcfa', -3000));
select is((select count(*)::int from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), 2, 'même type sur une autre station : nouveau message');
insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
values (pg_temp.org_demo(), pg_temp.station('mbour'), null, 'void_requested', 'warning', jsonb_build_object('amount_fcfa', 5000));
select is((select count(*)::int from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), 2, 'annulation demandée : routée « rapport du soir », rien en file');

-- Relance du gérant (écran 17).
select pg_temp.login(pg_temp.owner_demo());
select is((select r ->> 'ok' from public.remind_manager(md5('test:shift:thies:avant-hier-soir')::uuid) r), 'true', 'relance WhatsApp du gérant qui a un numéro');
select is((select r ->> 'error' from public.remind_manager(md5('test:shift:thies:avant-hier-soir')::uuid) r), 'ALREADY_SENT', 'seconde relance dans l''heure refusée');
update public.employees set phone_e164 = null where id = pg_temp.employee('thies', 'Fatou Faye');
select is((select r ->> 'error' from public.remind_manager(md5('test:shift:mbour:j-5')::uuid) r), null, 'relance possible pour un autre shift (Ibrahima a un numéro)');
select is((select r ->> 'error' from public.remind_manager(md5('test:shift:thies:j-5')::uuid) r), 'NO_PHONE', 'gérant sans numéro : NO_PHONE');
select pg_temp.logout();
select pg_temp.login(:'sup_id');
select throws_ok($$ select public.remind_manager(md5('test:shift:mbour:j-6')::uuid) $$, '42501', null, 'le superviseur ne relance pas');
select pg_temp.logout();

-- ---------------------------------------------------------------- Worker (réclamation, statut, secours SMS, webhook)
select pg_temp.as_service();
select cmp_ok((select count(*)::int from public.claim_notifications(50)), '>=', 3, 'le worker réclame les messages en file');
select is((select count(*)::int from public.notification_outbox where status = 'queued' and next_attempt_at <= now()), 0, 'rien ne reste réclamable dans l''instant… ');
select is((select min(attempts) from public.notification_outbox where kind = 'alert' and created_at >= now() and organization_id = pg_temp.org_demo() and (variables ->> 'type') = 'cash_variance'), 1, '…et chaque message compte une tentative');
select o.id as msg_id from public.notification_outbox o where o.kind = 'alert' and o.to_phone = '+221770000001' and o.created_at >= now() and o.organization_id = pg_temp.org_demo() and (o.variables ->> 'type') = 'cash_variance' limit 1 \gset
select public.set_notification_status(:'msg_id', 'sent', null, 'wamid.TEST1');
select is((select status from public.notification_outbox where id = :'msg_id'), 'sent', 'statut sent');
select is(public.record_delivery_status('wamid.TEST1', 'delivered'), 1, 'webhook : statut de livraison rattaché par identifiant fournisseur');
select is((select status from public.notification_outbox where id = :'msg_id'), 'delivered', 'statut delivered');
select is((select array_agg(status::text order by id) from public.notification_outbox_events where outbox_id = :'msg_id'), array['queued', 'sent', 'delivered'], 'historique append-only : queued → sent → delivered');
select throws_ok($$ delete from public.notification_outbox_events where outbox_id = (select id from public.notification_outbox limit 1) $$, 'P0001', null, 'l''historique des statuts est append-only');
-- SMS de secours : activé, un message envoyé mais non délivré depuis 11 min → copie SMS.
update public.organization_settings set sms_fallback = true where organization_id = pg_temp.org_demo();
select o.id as msg_sms from public.notification_outbox o where o.kind = 'alert' and o.to_phone = '+221770000001' and o.created_at >= now() and o.organization_id = pg_temp.org_demo() and (o.variables ->> 'type') = 'cash_variance' and o.id <> :'msg_id' limit 1 \gset
select public.set_notification_status(:'msg_sms', 'sent', null, 'wamid.TEST2');
update public.notification_outbox set sent_at = now() - interval '11 minutes' where id = :'msg_sms';
select is(public.escalate_undelivered(), 1, 'un message WhatsApp non délivré après 10 min → SMS de secours');
select is((select channel::text from public.notification_outbox where fallback_of = :'msg_sms'), 'sms', 'copie SMS liée au message d''origine');
select is(public.escalate_undelivered(), 0, 'pas de second SMS');

-- ---------------------------------------------------------------- Score d'écart
select pg_temp.login(pg_temp.owner_demo());
select is((select cash_variances from public.employee_variance_scores(30) where full_name = 'Ibrahima Sarr'), 4, 'Ibrahima Sarr : 4 écarts de caisse sur 30 jours');
select is((select handover_variances from public.employee_variance_scores(30) where full_name = 'Ibrahima Sarr'), 1, 'Ibrahima Sarr : 1 passation attribuée');
select is((select rejected_voids from public.employee_variance_scores(30) where full_name = 'Khady Fall'), 1, 'Khady Fall : 1 annulation refusée');
select is((select meter_regressions from public.employee_variance_scores(30) where full_name = 'Moussa Ndiaye'), 1, 'Moussa Ndiaye : 1 index qui recule');
select cmp_ok((select score from public.employee_variance_scores(30) where full_name = 'Fatou Faye'), '<=', 10, 'Fatou Faye : seulement des petits écarts (poids 0,25) → score faible');
select is((select score from public.employee_variance_scores(30) where full_name = 'Ibrahima Sarr'),
          (select least(100, round(400 * (4 * 1.0 + 1 * 1.0) / greatest(shifts, 1)))::int from public.employee_variance_scores(30) where full_name = 'Ibrahima Sarr'), 'score = min(100, 400 × pondéré / shifts)');
select is((select score from public.employee_variance_scores(30) where full_name = 'Khady Fall'), 100, 'employée sans shift mais avec un incident : score plafonné à 100');
select cmp_ok((select score from public.employee_variance_scores(30) where full_name = 'Ibrahima Sarr'), '>', (select score from public.employee_variance_scores(30) where full_name = 'Cheikh Mbaye'), 'plus d''écarts = score plus haut');
select is((select count(*)::int from public.employee_variance_scores(30, pg_temp.station('thies'))), (select count(*)::int from public.employees where station_id = pg_temp.station('thies') and active), 'filtre par station');
-- Tableau de bord
select is((select r ->> 'shifts' from public.dashboard_summary(now() - interval '30 days', now() + interval '1 day') r), (select count(*)::text from public.cash_closings c where c.closed_at >= now() - interval '30 days' and c.id = (select c2.id from public.cash_closings c2 where c2.shift_id = c.shift_id order by c2.closed_at desc limit 1)), 'tableau de bord : nombre de clôtures sur 30 jours');
select is((select jsonb_array_length(r -> 'stations') from public.dashboard_summary(now() - interval '1 day', now() + interval '1 day') r), 3, 'une ligne par station');
select is((select jsonb_array_length(r -> 'stations') from public.dashboard_summary(now() - interval '1 day', now() + interval '1 day', pg_temp.station('mbour')) r), 1, 'filtre une station');
select pg_temp.logout();

-- ---------------------------------------------------------------- Invitations de superviseurs
select pg_temp.new_auth_user('invite-p5@test.local') as inv_user \gset
select pg_temp.as_service();
select throws_ok(format($$ select public.register_supervisor_invitation(md5('test:org:demo')::uuid, 'invite-p5@test.local', %L, %L) $$, :'inv_user', :'sup_id'), '42501', null, 'un superviseur ne peut pas inviter');
select lives_ok(format($$ select public.register_supervisor_invitation(md5('test:org:demo')::uuid, 'Invite-P5@test.local', %L, %L) $$, :'inv_user', pg_temp.owner_demo()), 'l''owner invite');
select is((select count(*)::int from public.org_members where user_id = :'inv_user' and role = 'supervisor'), 1, 'l''invité devient superviseur');
select pg_temp.login(pg_temp.owner_demo());
select is((select status::text from public.supervisor_invitations where email = 'invite-p5@test.local'), 'sent', 'statut « invitation envoyée »');
select pg_temp.logout();
update auth.users set last_sign_in_at = now() where id = :'inv_user';
select pg_temp.login(pg_temp.owner_demo());
select is(public.supervisor_invitation_status((select id from public.supervisor_invitations where email = 'invite-p5@test.local'))::text, 'accepted', 'première connexion → « acceptée »');
select lives_ok($$ select public.revoke_supervisor((select id from public.supervisor_invitations where email = 'invite-p5@test.local')) $$, 'révocation par l''owner');
select is((select count(*)::int from public.org_members where user_id = :'inv_user'), 0, 'le superviseur révoqué n''est plus membre');
select pg_temp.logout();
select pg_temp.login(:'sup_id');
select is((select status::text from public.supervisor_invitations where email = 'invite-p5@test.local'), 'revoked', 'le superviseur voit la liste (lecture seule)');
select throws_ok($$ select public.revoke_supervisor((select id from public.supervisor_invitations where email = 'invite-p5@test.local')) $$, '42501', null, 'le superviseur ne révoque pas');
select throws_ok($$ insert into public.supervisor_invitations (organization_id, email) values (md5('test:org:demo')::uuid, 'x@y.z') $$, '42501', null, 'insertion directe interdite');
select pg_temp.logout();

select * from finish();
rollback;
