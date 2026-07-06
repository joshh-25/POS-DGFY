#!/usr/bin/env bash
set -euo pipefail

# Dumps the MySQL database and archives uploaded files (uploads + storage)
# so data can be migrated between hosts or restored later via restore.sh.
#
# Usage: ./backup.sh
# Run from anywhere -- it locates docker-compose.yml/.env relative to its
# own location (../docker-compose.yml), or set COMPOSE_DIR to override.

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

echo "==> Backing up MySQL database (${DB_NAME})..."
docker compose exec -T mysql sh -c \
  "mysqldump -u root -p\"\${MYSQL_ROOT_PASSWORD}\" --single-transaction --routines --triggers \"${DB_NAME}\"" \
  | gzip > "${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
echo "    -> ${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "==> Archiving uploaded files (uploads + storage)..."
tar -czf "${BACKUP_DIR}/files_${TIMESTAMP}.tar.gz" \
  -C "$COMPOSE_DIR" \
  data/backend/uploads data/backend/storage
echo "    -> ${BACKUP_DIR}/files_${TIMESTAMP}.tar.gz"

echo "==> Backup complete: ${TIMESTAMP}"
echo "    DB:    ${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
echo "    Files: ${BACKUP_DIR}/files_${TIMESTAMP}.tar.gz"
