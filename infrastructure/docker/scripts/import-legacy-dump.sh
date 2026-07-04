#!/usr/bin/env bash
set -euo pipefail

# Imports a full-server `mysqldump --all-databases`-style dump (e.g. a copy
# of a shared-hosting server's all_databases.sql) into this stack's mysql
# container, keeping ONLY the databases this app actually owns.
#
# Unlike restore.sh (which restores backup.sh's own single-database dump +
# files tarball), this is for a raw, external dump that typically also
# contains MySQL's own `mysql` system database and unrelated projects
# sitting on the same source server -- importing those as-is would
# overwrite this container's own auth tables and pull in data that has
# nothing to do with this app. This script filters the dump down to just
# the landlord database (DB_NAME in .env) and every `sku_tenant_*` tenant
# database before importing anything.
#
# It also strips `NO_AUTO_CREATE_USER` from any `sql_mode` SET statement --
# a deprecated MariaDB/MySQL 5.x sql_mode value that MySQL 8 rejects
# outright, commonly found in trigger definitions in older dumps.
#
# This OVERWRITES the landlord database and any existing tenant databases
# already present under the same names -- use with care.
#
# Usage: ./import-legacy-dump.sh <path-to-all_databases.sql>

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-all_databases.sql>" >&2
  exit 1
fi

RAW_DUMP="$1"
[ -f "$RAW_DUMP" ] || { echo "Dump file not found: $RAW_DUMP" >&2; exit 1; }

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a
: "${DB_NAME:?Set DB_NAME in .env}"
: "${DB_USER:?Set DB_USER in .env}"
: "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD in .env}"

FILTERED_DUMP="$(mktemp -t import-legacy-dump.XXXXXX.sql)"
trap 'rm -f "$FILTERED_DUMP"' EXIT

echo "==> Filtering ${RAW_DUMP} down to \`${DB_NAME}\` + \`sku_tenant_*\` databases..."
# LC_ALL=C: dumps of BLOB columns (e.g. images) commonly contain raw
# non-UTF8 bytes inline. awk under a UTF-8 locale tries to multibyte-decode
# every line and fails hard on those ("towc: multibyte conversion
# failure"); C locale treats input as raw bytes, which is all the pattern
# matching below actually needs (it only looks for a plain-ASCII marker
# line, never touches the binary content itself).
LC_ALL=C awk -v landlord_db="$DB_NAME" '
  BEGIN { keep = 1 }
  /^-- Current Database: `/ {
    keep = 0
    line = $0
    start = index(line, "`") + 1
    rest = substr(line, start)
    dbname = substr(rest, 1, index(rest, "`") - 1)
    if (dbname == landlord_db || index(dbname, "sku_tenant_") == 1) keep = 1
  }
  keep { print }
' "$RAW_DUMP" | LC_ALL=C sed "s/,NO_AUTO_CREATE_USER//g" > "$FILTERED_DUMP"

KEPT_DBS="$(LC_ALL=C grep -c '^-- Current Database: `' "$FILTERED_DUMP" || true)"
echo "    -> ${KEPT_DBS} database(s) kept (filtered dump: $(du -h "$FILTERED_DUMP" | cut -f1))"
if [ "$KEPT_DBS" -eq 0 ]; then
  echo "No matching databases found (looked for \`${DB_NAME}\` and \`sku_tenant_*\`)." >&2
  echo "Check that DB_NAME in .env matches what's actually in the dump." >&2
  exit 1
fi

echo "==> This will OVERWRITE ${KEPT_DBS} database(s) in the running mysql container."
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

echo "==> Importing filtered dump..."
docker compose exec -T mysql sh -c "mysql -u root -p\"\${MYSQL_ROOT_PASSWORD}\"" < "$FILTERED_DUMP"

echo "==> Granting ${DB_USER} access to all imported databases..."
# Wildcard grant first: the app dynamically creates a new sku_tenant_<slug>_<id>
# database on every business registration (see backend/src/services/
# tenantProvisioningService.js), and that new database's name can't be known
# in advance -- an enumerated per-database GRANT list (below) only ever
# covers databases that already existed at import time. Without this, every
# registration after the import silently fails with "Access denied ... to
# database 'sku_tenant_...'" (root-caused on beta 2026-07-04; see
# docs/ops/BETA_TENANT_PROVISIONING_INCIDENT_2026-07-04.md).
GRANT_SQL="GRANT ALL PRIVILEGES ON \`sku_tenant_%\`.* TO '${DB_USER}'@'%'; "
while IFS= read -r dbname; do
  GRANT_SQL="${GRANT_SQL}GRANT ALL PRIVILEGES ON \`${dbname}\`.* TO '${DB_USER}'@'%'; "
done < <(LC_ALL=C grep '^-- Current Database: `' "$FILTERED_DUMP" | LC_ALL=C sed -E 's/^-- Current Database: `(.*)`$/\1/')
GRANT_SQL="${GRANT_SQL}FLUSH PRIVILEGES;"
docker compose exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "$GRANT_SQL"

echo "==> Restarting backend (re-runs pending migrations on the landlord DB via its entrypoint)..."
docker compose up -d backend

echo "==> Import complete. ${KEPT_DBS} database(s) imported: $(LC_ALL=C grep '^-- Current Database: `' "$FILTERED_DUMP" | LC_ALL=C sed 's/^-- Current Database: //')"
echo "Note: tenant databases are NOT auto-migrated -- there's no per-tenant migration runner in this app"
echo "(see docs/ai/CLAUDE.md). A tenant DB slightly behind current code degrades gracefully per-repository"
echo "rather than erroring; check backend logs / /api/v1/health if something looks off for a specific tenant."
