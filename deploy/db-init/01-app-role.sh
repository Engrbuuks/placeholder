#!/bin/sh
# Runs once, when the database is first created. Makes the role the app connects as.
# It does not own any tables, so row level security always applies to it.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set pw="$APP_DB_PASSWORD" <<'SQL'
create role placeholder_app login password :'pw';
grant connect on database placeholder to placeholder_app;
SQL
