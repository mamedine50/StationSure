-- GÉNÉRÉ par _build.sh à partir de _src/080_pin_credit_storage.sql.src — ne pas éditer à la main.
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
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug),
          pg_temp.employee(p_slug, p_employee), now(), now());
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

-- PIN hashés, plafond de crédit, bucket de preuves.
create temporary table ctx as
select pg_temp.new_auth_user('supervisor-a@test.local') as supervisor_a,
       gen_random_uuid() as account;
grant select on ctx to authenticated, service_role, anon;
insert into public.org_members (organization_id, user_id, role) select pg_temp.org_demo(), supervisor_a, 'supervisor' from ctx;

-- ---- PIN
select is((select count(*) from public.employee_pins), 9::bigint, 'seed : 9 PIN hashés');
select is(
  (select count(*) from public.employee_pins where pin_hash = extensions.crypt('1234', pin_hash)),
  9::bigint, 'seed : tous les PIN de démo valent 1234 (bcrypt)'
);
select is((select count(*) from public.employee_pins where pin_hash like '$2a$%' or pin_hash like '$2b$%'), 9::bigint, 'les PIN sont hashés en bcrypt (gen_salt bf)');

select pg_temp.login(pg_temp.owner_demo());
select throws_ok('select * from public.employee_pins', '42501', null, 'owner : ne lit pas les hash de PIN');
select lives_ok(format('select public.set_employee_pin(%L, %L)', pg_temp.employee('mbour', 'Awa Diop'), '4321'), 'owner : définit un PIN via set_employee_pin');
select throws_like(format('select public.set_employee_pin(%L, %L)', pg_temp.employee('mbour', 'Awa Diop'), '12'), 'PIN_INVALID%', 'un PIN trop court est refusé');
select pg_temp.logout();
select is(
  (select pin_hash = extensions.crypt('4321', pin_hash) from public.employee_pins where employee_id = pg_temp.employee('mbour', 'Awa Diop')),
  true, 'le nouveau PIN est bien hashé'
);
select pg_temp.login((select supervisor_a from ctx));
select throws_like(format('select public.set_employee_pin(%L, %L)', pg_temp.employee('mbour', 'Awa Diop'), '9999'), 'FORBIDDEN%', 'supervisor : ne définit pas de PIN');
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_like(format('select public.set_employee_pin(%L, %L)', pg_temp.employee('mbour', 'Awa Diop'), '9999'), 'FORBIDDEN%', 'appareil : ne définit pas de PIN');
select pg_temp.logout();

-- ---- Crédit client : plafond en base
insert into public.credit_accounts (id, organization_id, station_id, customer_name, limit_fcfa)
select account, pg_temp.org_demo(), pg_temp.station('mbour'), 'Transport Ndiaye', 50000 from ctx;
select lives_ok(
  format('insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, device_created_at)
          values (%L, %L, %L, %L, %L, %L, 30000, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'), (select account from ctx), 'sale'),
  'crédit : vente de 30 000 sous le plafond'
);
select throws_like(
  format('insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, device_created_at)
          values (%L, %L, %L, %L, %L, %L, 30000, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'), (select account from ctx), 'sale'),
  'CREDIT_LIMIT%', 'crédit : la 2e vente dépasse le plafond et est refusée'
);
select lives_ok(
  format('insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, device_created_at)
          values (%L, %L, %L, %L, %L, %L, -30000, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'), (select account from ctx), 'repayment'),
  'crédit : remboursement accepté'
);
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(
  format('insert into public.credit_accounts (organization_id, station_id, customer_name, limit_fcfa) values (%L, %L, %L, 1000000)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'Client pirate'),
  '42501', null, 'appareil : ne crée pas de compte crédit (plafond = propriétaire)'
);
select pg_temp.logout();

-- ---- Storage : bucket privé + policies alignées
select is((select public from storage.buckets where id = 'evidence'), false, 'bucket evidence privé');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'evidence_%' and cmd in ('UPDATE', 'DELETE')), 0::bigint, 'storage : aucune policy update/delete sur les preuves');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'evidence_objects_insert' and cmd = 'INSERT'), 1::bigint, 'storage : policy d''insertion appareil présente');
-- Une preuve doit être rangée dans {organization_id}/{station_id}/
select throws_ok(
  format('insert into public.evidence_files (organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %L, now(), now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Awa Diop'),
         'meter_photo', 'ailleurs/photo.jpg', repeat('b', 64)),
  '23514', null, 'evidence_files : chemin hors du dossier organisation/station refusé'
);

select * from finish();
rollback;
