-- Nettoyage d'une organisation de TEST — base LOCALE uniquement.
-- Lancer via : pnpm db:reset-station-config -- --email <courriel> [--confirm]
-- Variables psql attendues : email, confirm (true/false), db_port. Précédé de _reset_station_config.fn.sql.
\set ON_ERROR_STOP on
select (:'db_port' = '54722') as port_ok \gset
\if :port_ok
\else
  \echo 'REFUS : ce script ne s''exécute que sur la base locale (port 54722).'
  \quit 1
\endif
select exists (select 1 from public.organizations where id = md5('org:demo')::uuid) as local_ok \gset
\if :local_ok
\else
  \echo 'REFUS : organisation de démo absente, cette base n''est pas la base locale de développement.'
  \quit 1
\endif
begin;
select table_name as "table", rows_count as "lignes" from pg_temp.reset_station_config(:'email', :'confirm'::boolean) where rows_count > 0 order by 1;
\if :confirm
  \echo 'Suppression validée (COMMIT).'
  commit;
\else
  \echo 'Mode dry-run : rien n''a été supprimé (ROLLBACK). Relancer avec --confirm pour exécuter.'
  rollback;
\endif
