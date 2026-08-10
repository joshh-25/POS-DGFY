#!/usr/bin/env bash
set -euo pipefail

# Restores a MySQL dump and uploaded-files archive produced by backup.sh.
# This OVERWRITES the current database and uploaded files -- use with care.
#
# Usage: ./restore.sh <db_dump.sql.gz> <files_archive.tar.gz>
#   e.g. ./restore.sh backups/db_sku_inventory_manager_20260701_120000.sql.gz \
#                      backups/files_20260701_120000.tar.gz

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <db_dump.sql.gz> <files_archive.tar.gz>" >&2
  exit 1
fi

DB_DUMP="$1"
FILES_ARCHIVE="$2"

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a

[ -f "$DB_DUMP" ] || { echo "DB dump not found: $DB_DUMP" >&2; exit 1; }
[ -f "$FILES_ARCHIVE" ] || { echo "Files archive not found: $FILES_ARCHIVE" >&2; exit 1; }

echo "==> This will OVERWRITE the current database (${DB_NAME}) and uploaded files."
read -r -p "Continue? [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || { echo "Aborted."; exit 1; }

echo "==> Ensuring mysql is up..."
docker compose up -d mysql
# Poll compose's own reported health status directly rather than `docker
# compose up --wait` (observed to report a container as unhealthy in this
# environment even while its actual health log showed nothing but passing
# checks the whole time -- an unreliable signal here) or a bare `docker
# compose exec` right after `up -d` (can hit "container is restarting,
# wait until running" if mysql's init/health cycle hasn't settled yet).
MYSQL_WAIT_RETRIES=60
i=0
while true; do
  STATUS="$(docker compose ps mysql --format json | python3 -c 'import json,sys; print(json.loads(sys.stdin.read().splitlines()[0]).get("Health",""))' 2>/dev/null || true)"
  [ "$STATUS" = "healthy" ] && break
  i=$((i + 1))
  if [ "$i" -ge "$MYSQL_WAIT_RETRIES" ]; then
    echo "mysql did not become healthy after ${MYSQL_WAIT_RETRIES} attempts (last status: ${STATUS:-unknown})." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Restoring database from ${DB_DUMP}..."
gunzip -c "$DB_DUMP" | docker compose exec -T mysql sh -c \
  "mysql -u root -p\"\${MYSQL_ROOT_PASSWORD}\" \"${DB_NAME}\""

echo "==> Restoring files from ${FILES_ARCHIVE}..."
rm -rf data/dgfy-api/uploads data/dgfy-api/storage
tar -xzf "$FILES_ARCHIVE" -C "$COMPOSE_DIR"

echo "==> Restarting dgfy-api (its dgfy-migration-runner dependency re-runs pending migrations first)..."
docker compose up -d dgfy-api

echo "==> Restore complete."
