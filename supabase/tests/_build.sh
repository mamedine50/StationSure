#!/usr/bin/env bash
# Assemble chaque _src/<nom>.sql.src avec le préambule commun (_src/_preambule.sql.src)
# en un fichier de test pgTAP <nom>.sql. Chaque fichier est une transaction
# indépendante (rollback), d'où la duplication volontaire du préambule.
# Usage : bash supabase/tests/_build.sh && supabase test db
set -euo pipefail
cd "$(dirname "$0")"
for src in _src/*.sql.src; do
  name="$(basename "${src%.sql.src}")"
  [[ "$name" == _* ]] && continue
  {
    echo "-- GÉNÉRÉ par _build.sh à partir de _src/${name}.sql.src — ne pas éditer à la main."
    echo "begin;"
    echo "create extension if not exists pgtap with schema extensions;"
    echo "select no_plan();"
    echo
    cat _src/_preambule.sql.src
    echo
    # `-- @include chemin` (relatif à supabase/tests) insère un fichier, ex. la fonction du script de nettoyage.
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == "-- @include "* ]]; then cat "${line#-- @include }"; else printf '%s\n' "$line"; fi
    done < "$src"
    echo
    echo "select * from finish();"
    echo "rollback;"
  } > "${name}.sql"
done
echo "tests assemblés : $(ls *.sql | tr '\n' ' ')"
