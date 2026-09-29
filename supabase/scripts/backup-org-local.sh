#!/usr/bin/env bash
# Sauvegarde LOCALE des données d'UNE organisation (par courriel du propriétaire) dans un fichier JSON.
# Usage : pnpm db:backup-org -- --email <courriel> [--out <fichier.json>]
set -euo pipefail
cd "$(dirname "$0")/../.."
EMAIL=""; OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --email=*) EMAIL="${1#--email=}"; shift ;;
    --out) OUT="$2"; shift 2 ;;
    --out=*) OUT="${1#--out=}"; shift ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done
[[ -n "$EMAIL" ]] || { echo "Usage : pnpm db:backup-org -- --email <courriel> [--out fichier.json]" >&2; exit 2; }
source supabase/scripts/_local-guard.sh
mkdir -p supabase/backups
[[ -n "$OUT" ]] || OUT="supabase/backups/$(echo "$EMAIL" | tr -c 'a-zA-Z0-9' '_')-$(date +%Y%m%d-%H%M%S).json"
cat supabase/scripts/_backup_org.fn.sql - <<SQL | docker exec -i "$CONTAINER" psql -U postgres -At -q -v email="$EMAIL" > "$OUT"
select pg_temp.backup_org(:'email')::text;
SQL
if ! python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('Organisation :', d['organization']['name']); [print(f'  {t:32} {len(r):6}') for t, r in sorted(d['tables'].items()) if r]; print('  auth.users', len(d['auth_users']))" "$OUT"; then
  echo "Sauvegarde invalide, voir $OUT" >&2; exit 1
fi
echo "Fichier : $OUT"
