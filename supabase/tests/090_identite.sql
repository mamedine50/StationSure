-- GÉNÉRÉ par _build.sh à partir de _src/090_identite.sql.src — ne pas éditer à la main.
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

-- Phase 2 : create_organization, jumelage, verify_employee_pin, sessions employé.
create temporary table ctx as
select pg_temp.new_auth_user('nouveau@test.local') as nouveau,
       pg_temp.new_auth_user('supervisor-a@test.local') as supervisor_a,
       pg_temp.new_auth_user('device-new@test.local') as device_new;
-- Résultat (texte) d'un essai de PIN ou de code : 'OK' ou le code d'erreur renvoyé.
create or replace function pg_temp.try_pin(p_emp uuid, p_pin text) returns text language sql as $$
  select case when (r ->> 'ok')::boolean then 'OK' else r ->> 'error' end from public.verify_employee_pin(p_emp, p_pin) r $$;
create or replace function pg_temp.try_consume(p_code text, p_ip text, p_id uuid default null) returns text language sql as $$
  select case when (r ->> 'ok')::boolean then 'OK' else r ->> 'error' end from public.consume_pairing_code(p_code, p_ip, p_id) r $$;
grant select on ctx to authenticated, service_role, anon;
insert into public.org_members (organization_id, user_id, role) select pg_temp.org_demo(), supervisor_a, 'supervisor' from ctx;

-- ---- create_organization
select pg_temp.login((select nouveau from ctx));
select lives_ok(format('select public.create_organization(%L, %L)', 'Ma station', 'solo'), 'create_organization : un nouvel utilisateur crée son organisation');
select is((select count(*) from public.org_members where user_id = (select nouveau from ctx) and role = 'owner'), 1::bigint, 'create_organization : l''utilisateur est owner');
select is((select plan_code from public.organizations where id in (select public.current_org_ids())), 'solo'::public.plan_code, 'create_organization : formule enregistrée');
select throws_like(format('select public.create_organization(%L, %L)', 'Une autre', 'solo'), 'ALREADY_MEMBER%', 'create_organization : refusée si déjà membre');
select lives_ok(format('insert into public.stations (organization_id, name) select id, %L from public.organizations', 'Première'), 'owner solo : 1re station acceptée');
select throws_like(format('insert into public.stations (organization_id, name) select id, %L from public.organizations', 'Deuxième'), 'STATION_LIMIT%', 'owner solo : 2e station refusée (limite de formule)');
select pg_temp.logout();
select pg_temp.as_anon();
select throws_ok(format('select public.create_organization(%L, %L)', 'Anon', 'solo'), '42501', null, 'create_organization : anon refusé');
select pg_temp.logout();

-- ---- create_pairing_code
select pg_temp.login(pg_temp.owner_demo());
create temporary table pairing as select public.create_pairing_code(pg_temp.station('mbour')) as res;
grant select on pairing to authenticated, service_role, anon;
select matches((select res ->> 'code' from pairing), '^[0-9]{6}$', 'create_pairing_code : code à 6 chiffres renvoyé en clair');
select matches((select res ->> 'qr' from pairing), '^stationsure://pair\?code=[0-9]{6}&id=', 'create_pairing_code : charge utile QR');
select is((select count(*) from public.device_pairing_codes where code_hash = (select res ->> 'code' from pairing)), 0::bigint, 'create_pairing_code : le code n''est pas stocké en clair');
select is((select count(*) from public.device_pairing_codes where code_hash like '$2a$%' and used_at is null), 1::bigint, 'create_pairing_code : hash bcrypt');
select is((select expires_at > now() + interval '9 minutes' and expires_at <= now() + interval '10 minutes' from public.device_pairing_codes where id = (select (res ->> 'pairing_id')::uuid from pairing)), true, 'create_pairing_code : valable 10 minutes');
select throws_ok(format('select public.create_pairing_code(%L)', gen_random_uuid()), '42501', null, 'create_pairing_code : station inconnue refusée');
select throws_ok('select public.consume_pairing_code(''123456'', ''1.1.1.1'')', '42501', null, 'consume_pairing_code : owner refusé (service_role uniquement)');
select pg_temp.logout();
select pg_temp.login((select supervisor_a from ctx));
select throws_ok(format('select public.create_pairing_code(%L)', pg_temp.station('mbour')), '42501', null, 'create_pairing_code : supervisor refusé');
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(format('select public.create_pairing_code(%L)', pg_temp.station('mbour')), '42501', null, 'create_pairing_code : appareil refusé');
select pg_temp.logout();

-- ---- consume_pairing_code (service_role)
select pg_temp.as_service();
select is(pg_temp.try_consume('000000', '10.0.0.1'), 'PAIRING_INVALID', 'consume : faux code refusé (message générique)');
select is((select attempts from public.device_pairing_codes where id = (select (res ->> 'pairing_id')::uuid from pairing)), 1, 'consume : un échec consomme une tentative');
select is(pg_temp.try_consume((select res ->> 'code' from pairing), '10.0.0.1'), 'OK', 'consume : bon code accepté');
select is((select used_at is not null from public.device_pairing_codes where id = (select (res ->> 'pairing_id')::uuid from pairing)), true, 'consume : code marqué utilisé');
select is(pg_temp.try_consume((select res ->> 'code' from pairing), '10.0.0.1'), 'PAIRING_INVALID', 'consume : code déjà utilisé refusé');
select lives_ok(format('select public.register_paired_device(%L, %L, %L)', (select (res ->> 'pairing_id')::uuid from pairing), (select device_new from ctx), 'Tablette test'), 'register : appareil créé');
select is((select count(*) from public.devices where label = 'Tablette test' and station_id = pg_temp.station('mbour') and active), 1::bigint, 'register : appareil lié à la station du code');
select throws_like(format('select public.register_paired_device(%L, %L, %L)', (select (res ->> 'pairing_id')::uuid from pairing), gen_random_uuid(), 'Encore'), 'PAIRING_INVALID%', 'register : un code ne crée qu''un seul appareil');
select pg_temp.logout();

-- 5 échecs tuent le code même si le 6e essai est le bon
select pg_temp.login(pg_temp.owner_demo());
create temporary table pairing2 as select public.create_pairing_code(pg_temp.station('thies')) as res;
grant select on pairing2 to authenticated, service_role, anon;
select pg_temp.logout();
select pg_temp.as_service();
select is(pg_temp.try_consume('111111', '10.0.0.2'), 'PAIRING_INVALID', 'consume : échec 1');
select is(pg_temp.try_consume('222222', '10.0.0.2'), 'PAIRING_INVALID', 'consume : échec 2');
select is(pg_temp.try_consume('333333', '10.0.0.2'), 'PAIRING_INVALID', 'consume : échec 3');
select is(pg_temp.try_consume('444444', '10.0.0.2'), 'PAIRING_INVALID', 'consume : échec 4');
select is(pg_temp.try_consume('555555', '10.0.0.2'), 'PAIRING_INVALID', 'consume : échec 5');
select is(pg_temp.try_consume((select res ->> 'code' from pairing2), '10.0.0.2'), 'PAIRING_INVALID', 'consume : 6e tentative refusée même avec le bon code');
-- expiration
update public.device_pairing_codes set expires_at = now() - interval '1 second' where id = (select (res ->> 'pairing_id')::uuid from pairing2);
select is(pg_temp.try_consume((select res ->> 'code' from pairing2), '10.0.0.3'), 'PAIRING_INVALID', 'consume : code expiré refusé');
-- limite par IP : 10 tentatives / 15 min
select lives_ok('update public.pairing_rate_limits set attempts = 10 where ip = ''10.0.0.9''', 'préparation limite IP');
insert into public.pairing_rate_limits (ip, attempts) values ('10.0.0.9', 10) on conflict (ip) do update set attempts = 10, window_start = now();
select is(pg_temp.try_consume('123456', '10.0.0.9'), 'PAIRING_INVALID', 'consume : 11e tentative d''une même IP refusée');
select pg_temp.logout();

-- ---- verify_employee_pin
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.try_pin(pg_temp.employee('mbour', 'Awa Diop'), '0000'), 'PIN_INVALID', 'PIN faux → PIN_INVALID');
select is(pg_temp.try_pin(gen_random_uuid(), '4062'), 'PIN_INVALID', 'employé inconnu → même message PIN_INVALID');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '9034'), 'PIN_INVALID', 'employé d''une autre station → refus (même message)');
select is(public.current_employee_id(), null, 'pas de session tant que le PIN n''est pas validé');
create temporary table sess as select public.verify_employee_pin(pg_temp.employee('mbour', 'Awa Diop'), '4062') as res;
grant select on sess to authenticated, service_role, anon;
select is((select res ->> 'full_name' from sess), 'Awa Diop', 'bon PIN → session avec le nom');
select is((select res ->> 'role' from sess), 'pump_attendant', 'bon PIN → rôle');
select is((select (res ->> 'expires_at')::timestamptz <= now() + interval '12 hours' from sess), true, 'bon PIN → expiration ≤ 12 h');
select is(public.current_employee_id(), pg_temp.employee('mbour', 'Awa Diop'), 'current_employee_id() = employé connecté');
select is((select public.current_employee_session() ->> 'session_id'), (select res ->> 'session_id' from sess), 'current_employee_session() renvoie la session active');
-- Nouvelle connexion : la session précédente est fermée
create temporary table sess2 as select public.verify_employee_pin(pg_temp.employee('mbour', 'Moussa Ndiaye'), '7391') as res;
grant select on sess2 to authenticated, service_role, anon;
select is(public.current_employee_id(), pg_temp.employee('mbour', 'Moussa Ndiaye'), 'nouvelle session → nouvel employé courant');
select is((select ended_reason from public.employee_sessions where id = (select (res ->> 'session_id')::uuid from sess)), 'replaced'::public.session_end_reason, 'la session précédente de l''appareil est fermée (replaced)');
select is((select count(*) from public.employee_sessions where device_id = pg_temp.device('mbour') and ended_at is null), 1::bigint, 'une seule session active par appareil');
-- end_employee_session
select lives_ok(format('select public.end_employee_session(%L)', (select (res ->> 'session_id')::uuid from sess2)), 'end_employee_session : ferme la session');
select is(public.current_employee_id(), null, 'après fermeture, plus d''employé courant');
select is((select ended_reason from public.employee_sessions where id = (select (res ->> 'session_id')::uuid from sess2)), 'logout'::public.session_end_reason, 'motif logout');
select pg_temp.logout();

-- Employé inactif → refus
update public.employees set active = false where id = pg_temp.employee('mbour', 'Pape Seck');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.try_pin(pg_temp.employee('mbour', 'Pape Seck'), '5817'), 'PIN_INVALID', 'employé inactif → refus');
select pg_temp.logout();

-- Owner et supervisor ne peuvent pas ouvrir de session employé
select pg_temp.login(pg_temp.owner_demo());
select throws_like(format('select public.verify_employee_pin(%L, %L)', pg_temp.employee('mbour', 'Awa Diop'), '4062'), 'DEVICE_NOT_PAIRED%', 'owner → refus (pas un appareil)');
select pg_temp.logout();

-- ---- Blocage après 5 échecs + alerte
select pg_temp.login(pg_temp.device_user('thies'));
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '1111'), 'PIN_INVALID', 'échec 1');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '1111'), 'PIN_INVALID', 'échec 2');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '1111'), 'PIN_INVALID', 'échec 3');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '1111'), 'PIN_INVALID', 'échec 4');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '1111'), 'PIN_INVALID', 'échec 5');
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '9034'), 'PIN_LOCKED', '6e essai avec le BON PIN → PIN_LOCKED');
select pg_temp.logout();
select is((select count(*) from public.alerts where type = 'pin_lockout' and station_id = pg_temp.station('thies') and payload ->> 'employee_id' = pg_temp.employee('thies', 'Fatou Faye')::text), 1::bigint, 'une alerte pin_lockout est créée pour le propriétaire');
select is((select count(*) from public.pin_attempts where employee_id = pg_temp.employee('thies', 'Fatou Faye') and not success), 5::bigint, '5 échecs enregistrés');
-- La réponse porte le temps restant
select pg_temp.login(pg_temp.device_user('thies'));
select is((public.verify_employee_pin(pg_temp.employee('thies', 'Fatou Faye'), '9034') ->> 'retry_after_seconds')::int between 1 and 900, true, 'PIN_LOCKED : retry_after_seconds entre 1 et 900');
select pg_temp.logout();
select is((select count(*) from public.pin_attempts where employee_id = pg_temp.employee('thies', 'Fatou Faye') and not success), 5::bigint, 'un essai pendant le blocage n''est pas compté');
-- Après 15 minutes, le blocage est levé
update public.pin_attempts set at = at - interval '16 minutes' where employee_id = pg_temp.employee('thies', 'Fatou Faye');
select pg_temp.login(pg_temp.device_user('thies'));
select is(pg_temp.try_pin(pg_temp.employee('thies', 'Fatou Faye'), '9034'), 'OK', 'après 15 min, le bon PIN ouvre une session');
select pg_temp.logout();

-- ---- Session expirée → current_employee_id() = null
update public.employee_sessions set started_at = now() - interval '13 hours', expires_at = now() - interval '1 second' where device_id = pg_temp.device('thies') and ended_at is null;
select pg_temp.login(pg_temp.device_user('thies'));
select is(public.current_employee_id(), null, 'session expirée → current_employee_id() = null');
select is(public.current_employee_session(), null, 'session expirée → current_employee_session() = null');
select pg_temp.logout();

-- ---- Opération attribuée à un employé sans session → refusée ; avec session → acceptée
create temporary table ops as select pg_temp.open_shift('kaolack', 'Cheikh Mbaye') as shift, pg_temp.new_evidence('kaolack', 'Cheikh Mbaye') as evidence;
grant select on ops to authenticated, service_role, anon;
select pg_temp.login(pg_temp.device_user('kaolack'));
select throws_ok(
  format('insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('kaolack'), pg_temp.device('kaolack'), pg_temp.employee('kaolack', 'Cheikh Mbaye'),
         (select shift from ops), pg_temp.nozzle('kaolack', 'P1-A'), 'open', 100, (select evidence from ops)),
  '42501', null, 'sans session active : insertion refusée'
);
select is(pg_temp.try_pin(pg_temp.employee('kaolack', 'Cheikh Mbaye'), '1748'), 'OK', 'Cheikh Mbaye se connecte');
select lives_ok(
  format('insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('kaolack'), pg_temp.device('kaolack'), pg_temp.employee('kaolack', 'Cheikh Mbaye'),
         (select shift from ops), pg_temp.nozzle('kaolack', 'P1-A'), 'open', 100, (select evidence from ops)),
  'avec session active : insertion acceptée'
);
select throws_ok(
  format('insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('kaolack'), pg_temp.device('kaolack'), pg_temp.employee('kaolack', 'P. Sow'),
         (select shift from ops), pg_temp.nozzle('kaolack', 'P1-B'), 'open', 100, (select evidence from ops)),
  '42501', null, 'attribution à un autre employé que celui connecté : refusée'
);
select pg_temp.logout();

-- ---- Révocation d'un appareil
select pg_temp.login(pg_temp.owner_demo());
select lives_ok(format('select public.revoke_device(%L)', pg_temp.device('kaolack')), 'owner : révoque l''appareil de Kaolack');
select pg_temp.logout();
select is((select active from public.devices where id = pg_temp.device('kaolack')), false, 'révocation : appareil inactif');
select is((select count(*) from public.employee_sessions where device_id = pg_temp.device('kaolack') and ended_at is null), 0::bigint, 'révocation : sessions employé fermées');
select is((select banned_until > now() from auth.users where id = pg_temp.device_user('kaolack')), true, 'révocation : utilisateur auth banni');
select is((select count(*) from public.alerts where type = 'device_revoked' and station_id = pg_temp.station('kaolack')), 1::bigint, 'révocation : alerte device_revoked');
select pg_temp.login(pg_temp.device_user('kaolack'));
select throws_like(format('select public.verify_employee_pin(%L, %L)', pg_temp.employee('kaolack', 'Cheikh Mbaye'), '1748'), 'DEVICE_NOT_PAIRED%', 'appareil révoqué → verify_employee_pin refusé');
select is((select count(*) from public.stations), 0::bigint, 'appareil révoqué → ne voit plus rien');
select pg_temp.logout();
select pg_temp.login((select supervisor_a from ctx));
select throws_ok(format('select public.revoke_device(%L)', pg_temp.device('thies')), '42501', null, 'supervisor : ne peut pas révoquer');
select pg_temp.logout();

select * from finish();
rollback;
