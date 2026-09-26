-- GÉNÉRÉ par _build.sh à partir de _src/060_audit_prix.sql.src — ne pas éditer à la main.
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

-- Garde-fous 3 et 4 : prix verrouillés, audit des changements de configuration.
create temporary table ctx as
select pg_temp.new_auth_user('supervisor-a@test.local') as supervisor_a;
grant select on ctx to authenticated, service_role, anon;
insert into public.org_members (organization_id, user_id, role) select pg_temp.org_demo(), supervisor_a, 'supervisor' from ctx;

select is((select price_fcfa_per_litre from public.current_fuel_prices where station_id = pg_temp.station('mbour') and fuel_product_code = 'super'), 990::bigint, 'prix de démo en vigueur : Super 990');

-- ---- owner : publie un prix, audit écrit
select pg_temp.login(pg_temp.owner_demo());
select lives_ok(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'super', 1000, pg_temp.owner_demo()),
  'owner : publie un nouveau prix'
);
select is((select price_fcfa_per_litre from public.current_fuel_prices where station_id = pg_temp.station('mbour') and fuel_product_code = 'super'), 1000::bigint, 'la vue current_fuel_prices reflète le nouveau prix');
select is(
  (select count(*) from public.audit_log where table_name = 'price_changes' and action = 'INSERT' and actor_user_id = pg_temp.owner_demo()
     and (new_data ->> 'price_fcfa_per_litre')::bigint = 1000),
  1::bigint, 'un changement de prix crée une ligne dans audit_log, attribuée à l''owner'
);
select throws_ok(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'super', 1001, (select supervisor_a from ctx)),
  '42501', null, 'owner : ne peut pas attribuer un prix à quelqu''un d''autre (created_by)'
);
-- Audit d'une modification d'employé
select lives_ok(format('update public.employees set full_name = %L where id = %L', 'Awa Diop Sène', pg_temp.employee('mbour', 'Awa Diop')), 'owner : renomme un employé');
select is(
  (select count(*) from public.audit_log where table_name = 'employees' and action = 'UPDATE' and row_id = pg_temp.employee('mbour', 'Awa Diop')
     and old_data ->> 'full_name' = 'Awa Diop' and new_data ->> 'full_name' = 'Awa Diop Sène'),
  1::bigint, 'la modification d''un employé est journalisée avec l''ancienne et la nouvelle valeur'
);
select is((select count(*) from public.audit_log where organization_id = pg_temp.org_demo()) > 0, true, 'owner : lit le journal d''audit de son organisation');
select pg_temp.logout();

-- ---- supervisor : ne publie pas de prix
select pg_temp.login((select supervisor_a from ctx));
select throws_ok(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'gasoil', 800, (select supervisor_a from ctx)),
  '42501', null, 'supervisor : ne peut pas publier de prix'
);
select pg_temp.logout();

-- ---- service_role : même lui ne peut pas attribuer un prix à un non-owner (trigger)
select pg_temp.as_service();
select throws_like(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'gasoil', 800, pg_temp.device_user('mbour')),
  'PRICE_LOCKED%', 'service_role : un prix signé par un appareil est refusé'
);
select throws_like(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'gasoil', 800, (select supervisor_a from ctx)),
  'PRICE_LOCKED%', 'service_role : un prix signé par un superviseur est refusé'
);
select pg_temp.logout();

-- ---- Les tables de configuration sont toutes auditées
select is(
  (select count(*) from (values ('stations'), ('devices'), ('employees'), ('tanks'), ('tank_calibrations'), ('pumps'), ('nozzles'),
                                ('price_changes'), ('plans'), ('org_members'), ('organizations'), ('products'), ('credit_accounts')) as t(name)
   where not exists (select 1 from pg_trigger tr join pg_class c on c.oid = tr.tgrelid
                     where c.relname = t.name and tr.tgname = 'audit')),
  0::bigint, 'trigger audit présent sur toutes les tables de configuration'
);
select is((select count(*) from public.audit_log where table_name = 'stations' and action = 'INSERT'), 3::bigint, 'la seed a journalisé la création des 3 stations');

select * from finish();
rollback;
