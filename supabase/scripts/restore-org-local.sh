#!/usr/bin/env bash
# Restaure LOCALEMENT une organisation depuis un fichier produit par backup-org-local.sh.
# Usage : pnpm db:restore-org -- --file <fichier.json> [--confirm]   (dry-run par défaut)
set -euo pipefail
cd "$(dirname "$0")/../.."
FILE=""; CONFIRM="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --file=*) FILE="${1#--file=}"; shift ;;
    --confirm) CONFIRM="true"; shift ;;
    --dry-run) CONFIRM="false"; shift ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done
[[ -f "$FILE" ]] || { echo "Usage : pnpm db:restore-org -- --file <fichier.json> [--confirm]" >&2; exit 2; }
source supabase/scripts/_local-guard.sh
echo "Fichier : $FILE · mode : $([[ "$CONFIRM" == "true" ]] && echo CONFIRM || echo DRY-RUN) · base : $DB_HOST:$DB_PORT"
cat supabase/scripts/_backup_org.fn.sql - <<SQL | docker exec -i "$CONTAINER" psql -U postgres -q -v confirm="$CONFIRM" -v json="$(cat "$FILE")"
begin;
select table_name as "table", rows_in_file as "lignes (fichier)", rows_inserted as "insérées" from pg_temp.restore_org(:'json'::jsonb, :'confirm'::boolean) order by 1;
\if :confirm
  \echo 'Restauration validée (COMMIT).'
  commit;
\else
  \echo 'Mode dry-run : rien n''a été écrit (ROLLBACK). Relancer avec --confirm pour restaurer.'
  rollback;
\endif
SQL
