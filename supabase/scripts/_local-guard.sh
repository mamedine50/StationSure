# Garde-fou commun (sourcé) : la pile Supabase doit être la pile LOCALE de ce projet (127.0.0.1:54722).
STATUS="$(supabase status -o env 2>/dev/null || true)"
DB_URL="$(printf '%s\n' "$STATUS" | sed -n 's/^DB_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
[[ -n "$DB_URL" ]] || { echo "REFUS : pile Supabase locale introuvable (supabase status)." >&2; exit 1; }
DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^postgres(ql)?://[^@]*@([^:/]+):([0-9]+)/.*$#\2#')"
DB_PORT="$(printf '%s' "$DB_URL" | sed -E 's#^postgres(ql)?://[^@]*@([^:/]+):([0-9]+)/.*$#\3#')"
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]] || [[ "$DB_PORT" != "54722" ]]; then
  echo "REFUS : base non locale ($DB_HOST:$DB_PORT). Ces scripts ne touchent jamais une base en ligne." >&2
  exit 1
fi
CONTAINER="supabase_db_stationsure"
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "REFUS : conteneur $CONTAINER absent." >&2; exit 1; }
export DB_HOST DB_PORT CONTAINER
