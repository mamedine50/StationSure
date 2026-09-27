#!/usr/bin/env bash
# Nettoyage LOCAL de la configuration d'une organisation de test (voir reset-station-config-local.sql).
# Usage : bash supabase/scripts/reset-station-config-local.sh --email <courriel> [--confirm]
set -euo pipefail
cd "$(dirname "$0")/../.."
EMAIL=""; CONFIRM="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --email=*) EMAIL="${1#--email=}"; shift ;;
    --confirm) CONFIRM="true"; shift ;;
    --dry-run) CONFIRM="false"; shift ;;
    *) echo "Argument inconnu : $1" >&2; exit 2 ;;
  esac
done
[[ -n "$EMAIL" ]] || { echo "Usage : pnpm db:reset-station-config -- --email <courriel> [--confirm]" >&2; exit 2; }

# Garde-fou 1 : la pile Supabase locale doit être celle de ce projet, sur 127.0.0.1:54722.
STATUS="$(supabase status -o env 2>/dev/null || true)"
DB_URL="$(printf '%s\n' "$STATUS" | sed -n 's/^DB_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
[[ -n "$DB_URL" ]] || { echo "REFUS : pile Supabase locale introuvable (supabase status)." >&2; exit 1; }
DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^postgres(ql)?://[^@]*@([^:/]+):([0-9]+)/.*$#\2#')"
DB_PORT="$(printf '%s' "$DB_URL" | sed -E 's#^postgres(ql)?://[^@]*@([^:/]+):([0-9]+)/.*$#\3#')"
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]] || [[ "$DB_PORT" != "54722" ]]; then
  echo "REFUS : base non locale ($DB_HOST:$DB_PORT). Ce script ne touche jamais une base en ligne." >&2
  exit 1
fi
CONTAINER="supabase_db_stationsure"
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "REFUS : conteneur $CONTAINER absent." >&2; exit 1; }

# Garde-fou 2 (mode confirm) : fichiers du bucket supprimés via l'API Storage locale avant les lignes.
if [[ "$CONFIRM" == "true" ]]; then
  SERVICE_KEY="$(printf '%s\n' "$STATUS" | sed -n 's/^SERVICE_ROLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  API_URL="$(printf '%s\n' "$STATUS" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  PATHS="$(docker exec -i "$CONTAINER" psql -U postgres -At -c "select o.name from storage.objects o join public.evidence_files e on e.storage_path = o.name and o.bucket_id = 'evidence' join public.org_members m on m.organization_id = e.organization_id and m.role = 'owner' join auth.users u on u.id = m.user_id where lower(u.email) = lower('$EMAIL')")"
  if [[ -n "$PATHS" && -n "$SERVICE_KEY" ]]; then
    JSON="$(printf '%s\n' "$PATHS" | python3 -c 'import json,sys; print(json.dumps({"prefixes": [l.strip() for l in sys.stdin if l.strip()]}))')"
    curl -s -X DELETE "$API_URL/storage/v1/object/evidence" -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H "Content-Type: application/json" -d "$JSON" >/dev/null || echo "Avertissement : suppression des fichiers du bucket échouée (lignes supprimées quand même)." >&2
    echo "Fichiers du bucket supprimés : $(printf '%s\n' "$PATHS" | grep -c .)"
  fi
fi

echo "Organisation de : $EMAIL · mode : $([[ "$CONFIRM" == "true" ]] && echo CONFIRM || echo DRY-RUN) · base : $DB_HOST:$DB_PORT"
cat supabase/scripts/_reset_station_config.fn.sql supabase/scripts/reset-station-config-local.sql \
  | docker exec -i "$CONTAINER" psql -U postgres -v email="$EMAIL" -v confirm="$CONFIRM" -v db_port="$DB_PORT" -q
