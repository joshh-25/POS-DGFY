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
docker compose exec -T mysql sh -c \
  'until mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" --silent; do sleep 1; done'

echo "==> Restoring database from ${DB_DUMP}..."
gunzip -c "$DB_DUMP" | docker compose exec -T mysql sh -c \
  "mysql -u root -p\"\${MYSQL_ROOT_PASSWORD}\" \"${DB_NAME}\""

echo "==> Restoring files from ${FILES_ARCHIVE}..."
rm -rf data/backend/uploads data/backend/storage
tar -xzf "$FILES_ARCHIVE" -C "$COMPOSE_DIR"

echo "==> Restarting backend (re-runs pending migrations via its entrypoint)..."
docker compose up -d backend

echo "==> Restore complete."
