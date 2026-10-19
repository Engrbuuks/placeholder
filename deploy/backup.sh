#!/bin/sh
# Backs up the database straight away, then once a day. Keeps BACKUP_KEEP_DAYS days of backups in ./backups.
# A backup is only kept once it has finished, so a half written file never replaces a good one.
set -u
keep="${BACKUP_KEEP_DAYS:-7}"
every="${BACKUP_EVERY_SECONDS:-86400}"
mkdir -p /backups

while true; do
  file="/backups/placeholder-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump -h db -U placeholder_owner -d placeholder --format=custom --file="$file.part"; then
    mv "$file.part" "$file"
    echo "$(date -u) backup saved: $file"
  else
    rm -f "$file.part"
    echo "$(date -u) backup FAILED" >&2
  fi
  find /backups -name 'placeholder-*.dump' -mtime +"$keep" -delete
  sleep "$every"
done
