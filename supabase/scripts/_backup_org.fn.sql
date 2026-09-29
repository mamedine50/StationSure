-- Fonctions TEMPORAIRES (pg_temp) de sauvegarde / restauration d'UNE organisation, LOCAL UNIQUEMENT.
-- Chargées par backup-org-local.sh et restore-org-local.sh (et par le test pgTAP 140).
create or replace function pg_temp.backup_org(p_email text)
returns jsonb
language plpgsql
as $$
declare
  v_user uuid;
  v_org uuid;
  t record;
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then raise exception 'BACKUP_REFUSE: aucun utilisateur %', p_email; end if;
  select m.organization_id into v_org from public.org_members m where m.user_id = v_user and m.role = 'owner' limit 1;
  if v_org is null then raise exception 'BACKUP_REFUSE: % n''est propriétaire d''aucune organisation', p_email; end if;
  for t in
    select c.table_name as name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'organization_id' order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.organization_id = $1', t.name) into v_rows using v_org;
    v_tables := v_tables || jsonb_build_object(t.name, v_rows);
  end loop;
  return jsonb_build_object(
    'version', 1,
    'exported_at', now(),
    'email', p_email,
    'organization', (select to_jsonb(o) from public.organizations o where o.id = v_org),
    'auth_users', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'instance_id', u.instance_id, 'aud', u.aud, 'role', u.role, 'email', u.email,
        'encrypted_password', u.encrypted_password, 'email_confirmed_at', u.email_confirmed_at, 'raw_app_meta_data', u.raw_app_meta_data,
        'raw_user_meta_data', u.raw_user_meta_data, 'created_at', u.created_at, 'updated_at', u.updated_at, 'is_sso_user', u.is_sso_user)), '[]'::jsonb)
      from auth.users u where u.id in (select m.user_id from public.org_members m where m.organization_id = v_org)
        or u.id in (select d.auth_user_id from public.devices d where d.organization_id = v_org)),
    'auth_identities', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from auth.identities i
      where i.user_id in (select m.user_id from public.org_members m where m.organization_id = v_org)
         or i.user_id in (select d.auth_user_id from public.devices d where d.organization_id = v_org)),
    'storage_objects', (select coalesce(jsonb_agg(o.name), '[]'::jsonb) from storage.objects o
      where o.bucket_id = 'evidence' and o.name in (select e.storage_path from public.evidence_files e where e.organization_id = v_org)),
    'tables', v_tables
  );
end;
$$;

-- Restauration : insertions « on conflict do nothing » par passes (ordre des clés étrangères),
-- déclencheurs utilisateur désactivés le temps de la transaction. Les fichiers du bucket ne sont
-- pas restaurés (liste conservée dans storage_objects pour information).
create or replace function pg_temp.restore_org(p jsonb, p_confirm boolean)
returns table (table_name text, rows_in_file bigint, rows_inserted bigint)
language plpgsql
as $$
declare
  t record;
  v_n bigint;
  v_restants text[] := array[]::text[];
  v_suivants text[];
  v_passes integer := 0;
  v_tbl text;
  v_inserted jsonb := '{}'::jsonb;
begin
  if coalesce((p ->> 'version')::int, 0) <> 1 or p -> 'organization' is null then
    raise exception 'RESTORE_REFUSE: fichier de sauvegarde invalide';
  end if;
  table_name := 'organizations'; rows_in_file := 1; rows_inserted := 0;
  if p_confirm then
    insert into public.organizations select * from jsonb_populate_record(null::public.organizations, p -> 'organization') on conflict do nothing;
    get diagnostics v_n = row_count; rows_inserted := v_n;
  end if;
  return next;
  table_name := 'auth.users'; rows_in_file := jsonb_array_length(coalesce(p -> 'auth_users', '[]'::jsonb)); rows_inserted := 0;
  if p_confirm then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    select u.id, u.instance_id, u.aud, u.role, u.email, u.encrypted_password, u.email_confirmed_at, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at, coalesce(u.is_sso_user, false), '', '', '', ''
    from jsonb_to_recordset(coalesce(p -> 'auth_users', '[]'::jsonb)) as u(id uuid, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
         raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, is_sso_user boolean)
    on conflict do nothing;
    get diagnostics v_n = row_count; rows_inserted := v_n;
    insert into auth.identities select * from jsonb_populate_recordset(null::auth.identities, coalesce(p -> 'auth_identities', '[]'::jsonb)) on conflict do nothing;
  end if;
  return next;
  for t in
    select c.table_name as name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'organization_id' and (p -> 'tables') ? c.table_name order by c.table_name
  loop
    if jsonb_array_length(p -> 'tables' -> t.name) > 0 then
      v_restants := array_append(v_restants, t.name);
      if p_confirm then execute format('alter table public.%I disable trigger user', t.name); end if;
    end if;
  end loop;
  if p_confirm then
    while coalesce(array_length(v_restants, 1), 0) > 0 and v_passes < 20 loop
      v_passes := v_passes + 1;
      v_suivants := array[]::text[];
      foreach v_tbl in array v_restants loop
        begin
          execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', v_tbl, v_tbl) using p -> 'tables' -> v_tbl;
          get diagnostics v_n = row_count;
          v_inserted := v_inserted || jsonb_build_object(v_tbl, v_n);
        exception when foreign_key_violation then
          v_suivants := array_append(v_suivants, v_tbl);
        end;
      end loop;
      if array_length(v_suivants, 1) = array_length(v_restants, 1) then
        raise exception 'RESTORE_ECHEC: dépendances circulaires entre %', v_suivants;
      end if;
      v_restants := v_suivants;
    end loop;
    for t in select key as name from jsonb_object_keys(p -> 'tables') as key loop
      begin execute format('alter table public.%I enable trigger user', t.name); exception when undefined_table then null; end;
    end loop;
  end if;
  for t in select key as name, jsonb_array_length(value) as n from jsonb_each(p -> 'tables') where jsonb_array_length(value) > 0 loop
    table_name := t.name; rows_in_file := t.n; rows_inserted := coalesce((v_inserted ->> t.name)::bigint, 0);
    return next;
  end loop;
  return;
end;
$$;
