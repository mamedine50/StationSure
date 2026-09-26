-- =============================================================================
-- 0001 — Fondations : extensions, schéma privé, journal d'audit, garde-fous
-- génériques (append-only, audit) et fabriques de policies RLS.
-- Tout ce qui suit est réutilisé par les migrations de domaine.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Schéma `private` : fonctions internes non exposées par l'API (PostgREST n'expose
-- que `public`). Les policies RLS peuvent y faire référence.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is 'Fonctions internes (triggers, fabriques de policies). Jamais exposé par l''API.';

-- -----------------------------------------------------------------------------
-- anon : aucun accès. On retire les privilèges par défaut que Supabase accorde
-- au rôle anon sur les futurs objets de `public`, et sur ceux déjà présents.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- -----------------------------------------------------------------------------
-- Enums transversaux
-- -----------------------------------------------------------------------------
create type public.audit_action as enum ('INSERT', 'UPDATE', 'DELETE');

-- -----------------------------------------------------------------------------
-- audit_log : journal append-only de toute modification de configuration.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  table_name text not null,
  row_id uuid,
  action public.audit_action not null,
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid,
  actor_employee_id uuid,
  actor_role text,
  at timestamptz not null default now()
);
comment on table public.audit_log is 'Journal d''audit append-only : qui a changé quoi, quand. Alimenté par trigger.';
comment on column public.audit_log.organization_id is 'Organisation concernée (null pour les référentiels globaux comme plans).';
comment on column public.audit_log.actor_user_id is 'auth.uid() de l''acteur (propriétaire, superviseur ou appareil).';
comment on column public.audit_log.actor_employee_id is 'Employé acteur, lu dans le paramètre de session app.employee_id (posé en phase 2).';
comment on column public.audit_log.actor_role is 'Rôle Postgres courant (authenticated, service_role, postgres).';

create index audit_log_org_at_idx on public.audit_log (organization_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;

-- -----------------------------------------------------------------------------
-- Garde-fou 1 : APPEND-ONLY. Bloque UPDATE et DELETE pour tout le monde,
-- propriétaire, service_role et postgres compris. Les corrections se font par
-- contre-écriture (colonne reverses_id ou nouvelle ligne).
-- -----------------------------------------------------------------------------
create or replace function private.forbid_update_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'APPEND_ONLY: la table % est en écriture seule (% interdit). Corrigez par contre-écriture.',
    tg_table_name, tg_op
    using errcode = 'P0001', hint = 'Insérez une ligne de correction (reverses_id) au lieu de modifier.';
end;
$$;

create or replace function private.enable_append_only(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger append_only before update or delete on %s for each row execute function private.forbid_update_delete()',
    p_table
  );
  -- Bloque aussi TRUNCATE.
  execute format(
    'create trigger append_only_truncate before truncate on %s for each statement execute function private.forbid_update_delete()',
    p_table
  );
end;
$$;
comment on function private.enable_append_only(regclass) is 'Rend une table append-only (UPDATE, DELETE, TRUNCATE interdits pour tous).';

-- -----------------------------------------------------------------------------
-- Garde-fou 4 : AUDIT. Trigger générique qui journalise INSERT / UPDATE / DELETE.
-- -----------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
  v_org uuid;
  v_employee uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  -- id de ligne : uuid si la PK est un uuid, sinon null (ex. plans dont la PK est un code).
  begin
    v_row_id := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  exception when others then
    v_row_id := null;
  end;

  begin
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  exception when others then
    v_org := null;
  end;

  -- Pour la table organizations elle-même, l'organisation est la ligne.
  if tg_table_name = 'organizations' then
    v_org := v_row_id;
  end if;

  begin
    v_employee := nullif(current_setting('app.employee_id', true), '')::uuid;
  exception when others then
    v_employee := null;
  end;

  insert into public.audit_log (organization_id, table_name, row_id, action, old_data, new_data,
                                actor_user_id, actor_employee_id, actor_role)
  values (v_org, tg_table_name, v_row_id, tg_op::public.audit_action, v_old, v_new,
          auth.uid(), v_employee, current_user);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.enable_audit(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger audit after insert or update or delete on %s for each row execute function private.audit_row()',
    p_table
  );
end;
$$;
comment on function private.enable_audit(regclass) is 'Journalise chaque INSERT/UPDATE/DELETE de la table dans audit_log.';

-- -----------------------------------------------------------------------------
-- updated_at automatique pour les tables de configuration.
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.enable_updated_at(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger touch_updated_at before update on %s for each row execute function private.touch_updated_at()',
    p_table
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Fabriques de policies RLS. Elles imposent un vocabulaire unique pour toutes
-- les tables (voir docs/schema.md, « ajouter une table »). Les fonctions
-- public.current_org_ids() etc. sont créées dans la migration 0002 ; les
-- policies ne sont évaluées qu'à l'exécution, donc l'ordre est sans importance.
--
-- Chaque table concernée DOIT porter organization_id et station_id.
-- -----------------------------------------------------------------------------

-- Nom de policy normalisé : <table>_<suffixe>.
create or replace function private.policy_name(p_table regclass, p_suffix text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(p_table::text, '^public\.', '') || '_' || p_suffix;
$$;

-- Lecture par les membres de l'organisation (owner et supervisor).
create or replace function private.policy_select_org(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for select to authenticated
       using (organization_id in (select public.current_org_ids()))$q$,
    private.policy_name(p_table, 'select_org'), p_table
  );
end;
$$;

-- Lecture par l'appareil de la station (sa station uniquement).
create or replace function private.policy_select_device(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for select to authenticated
       using (station_id = public.current_device_station_id())$q$,
    private.policy_name(p_table, 'select_device'), p_table
  );
end;
$$;

-- Écriture complète (insert / update / delete) réservée au propriétaire.
create or replace function private.policy_write_owner(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for insert to authenticated
       with check (public.is_org_owner(organization_id))$q$,
    private.policy_name(p_table, 'insert_owner'), p_table
  );
  execute format(
    $q$create policy %I on %s for update to authenticated
       using (public.is_org_owner(organization_id))
       with check (public.is_org_owner(organization_id))$q$,
    private.policy_name(p_table, 'update_owner'), p_table
  );
  execute format(
    $q$create policy %I on %s for delete to authenticated
       using (public.is_org_owner(organization_id))$q$,
    private.policy_name(p_table, 'delete_owner'), p_table
  );
end;
$$;

-- Insertion par l'appareil : sa station, son propre device_id, et l'organisation
-- de sa station (organization_id ne peut pas être falsifié).
create or replace function private.policy_insert_device(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for insert to authenticated
       with check (
         station_id = public.current_device_station_id()
         and device_id = public.current_device_id()
         and organization_id = public.current_device_organization_id()
       )$q$,
    private.policy_name(p_table, 'insert_device'), p_table
  );
end;
$$;

-- Mise à jour par l'appareil des lignes de sa station (tables à statut : shifts,
-- passations, comptages). Jamais sur une table append-only.
create or replace function private.policy_update_device(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for update to authenticated
       using (station_id = public.current_device_station_id())
       with check (
         station_id = public.current_device_station_id()
         and organization_id = public.current_device_organization_id()
       )$q$,
    private.policy_name(p_table, 'update_device'), p_table
  );
end;
$$;


-- audit_log : append-only, aucune écriture côté client (le trigger SECURITY DEFINER
-- écrit pour eux). La policy de lecture est posée en 0002, après les helpers RLS.
select private.enable_append_only('public.audit_log');
revoke insert, update, delete on public.audit_log from authenticated;
