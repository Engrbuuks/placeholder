#!/bin/sh
# Restores the database from a backup file made by the backup service.
# Usage, from the project folder on the server:  sh deploy/restore.sh backups/placeholder-20261019-060000.dump
set -eu
file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Give the backup file to restore, for example: sh deploy/restore.sh backups/placeholder-20261019-060000.dump" >&2
  exit 1
fi
echo "Stopping the app and worker so nothing writes during the restore..."
docker compose stop app worker
echo "Restoring $file ..."
docker compose exec -T db pg_restore --clean --if-exists --no-owner --role=placeholder_owner -U placeholder_owner -d placeholder < "$file"
echo "Applying any newer migrations and starting again..."
docker compose up -d
echo "Restore finished."
