#!/bin/sh
# Draait alleen bij de allereerste start van de database, via de map
# /docker-entrypoint-initdb.d van het postgres-image.
#
# Dat image maakt maar EEN database aan (POSTGRES_DB). De OIDC-hub heeft een
# eigen database, dus die maken we hier bij. Zonder dit start de hub niet op:
# "database <naam> does not exist".
set -e

if [ -z "$OIDC_DB_NAME" ] || [ "$OIDC_DB_NAME" = "$POSTGRES_DB" ]; then
    exit 0
fi

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE DATABASE "$OIDC_DB_NAME";
SQL

echo "Database $OIDC_DB_NAME aangemaakt voor de OIDC-hub."
