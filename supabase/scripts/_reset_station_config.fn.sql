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
