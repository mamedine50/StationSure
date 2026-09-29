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
    # Tests autonomes : le jeu de données de démo (seed.sql) est créé DANS la transaction du test,
    # sous l'espace de noms « test: » (voir le sed ci-dessous), puis annulé par le rollback.
    cat ../seed.sql
    echo
    # `-- @include chemin` (relatif à supabase/tests) insère un fichier, ex. la fonction du script de nettoyage.
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == "-- @include "* ]]; then cat "${line#-- @include }"; else printf '%s\n' "$line"; fi
    done < "$src"
    echo
    echo "select * from finish();"
    echo "rollback;"
  } | sed -E -e "s/md5\\('/md5('test:/g" -e "s/@demo\\.local/@test-demo.local/g" -e "s/md5\\('test:employee_type:(gerant|chef_de_piste|pompiste|caissier_boutique|mecanicien|laveur|gardien_nuit|adjoint_station)'/md5('employee_type:\\1'/g" > "${name}.sql"
  # ↑ Les 8 types système viennent des migrations : leurs identifiants ne sont pas namespacés.
  # ↑ Espace de noms « test: » : les identifiants et courriels du jeu de démo créé par le test ne
  #   croisent jamais ceux de la seed ni ceux des vraies données de la base locale.
done
echo "tests assemblés : $(ls *.sql | tr '\n' ' ')"
