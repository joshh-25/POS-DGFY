#!/bin/sh
set -e

# backend/.sequelizerc resolves all its paths via path.resolve(...), which
# is relative to process.cwd() -- make sure that's /app (the WORKDIR/backend
# root layout) regardless of how the container was invoked.
cd /app

# Bind-mounted volumes (uploads/storage/logs -- see docker-compose.yml) are
# owned by whatever created them on the HOST, usually root, since Docker
# auto-creates missing bind-mount host directories as root. That overrides
# whatever ownership the Dockerfile set at build time. Fix it up here, on
# every container start, then drop to the unprivileged `app` user for
# everything else -- the same pattern official images like postgres/mysql
# use to handle bind-mounted data directory ownership.
if [ "$(id -u)" = '0' ]; then
  mkdir -p uploads/temp storage/temp-ai-exports logs
  # Best-effort: some bind mounts (e.g. a pre-populated read-only data
  # dump) can't be chown'd at all, or only partially -- don't let that
  # crash-loop the container. Ownership only matters for paths the app
  # actually needs to WRITE to (new uploads); read access to existing
  # files works regardless of uid ownership as long as the mode bits allow
  # it, which is the common case for a data dump extracted on the host.
  chown -R app:app uploads storage logs 2>/dev/null || true
  exec su-exec app "$0" "$@"
fi

echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} DB_HOST=${DB_HOST} DB_NAME=${DB_NAME}"
echo "[entrypoint] Running database migrations..."

# db:migrate is idempotent (tracked via the SequelizeMeta table), so it's
# safe to run on every container start/restart. Retry a few times in case
# the mysql container's healthcheck passes before the specific database/
# user grants are fully ready.
MAX_RETRIES=30
RETRY_DELAY=2
i=0
until npx --no-install sequelize-cli db:migrate --config src/config/sequelize.config.cjs; do
  i=$((i + 1))
  if [ "$i" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] Migrations failed after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Migration attempt ${i} failed, retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "[entrypoint] Migrations complete."

# --- Tenant schema drift repair (best-effort, non-blocking) ---------------
#
# db:migrate above only touches the landlord DB (DB_NAME). Each tenant has
# its own physically separate database whose schema must be kept in sync
# separately -- see backend/scripts/sync-tenant-schemas.js. This runs on
# every container start/restart; every check in that script is gated on a
# "missing" check, so a tenant that's already caught up is a fast no-op.
#
# Deliberately NOT using --fail-on-error, and deliberately not allowed to
# `exit` this script nonzero: at least one known orphaned tenant row
# (tenant_premium, points at a database that no longer exists) will ALWAYS
# fail this check until that row is cleaned up manually, and one bad tenant
# record must never prevent the API from starting for every tenant. The
# `node ... | tee ...` pipeline's exit status here is tee's (almost always
# 0) even under `set -e`, since POSIX sh has no `pipefail` -- that's
# intentional, not a bug; don't "fix" it into a hard failure.
echo "[entrypoint] Running tenant schema drift repair for active tenants..."
TENANT_SCHEMA_SYNC_REPORT="logs/tenant-schema-sync-report.json"
TENANT_SCHEMA_SYNC_LOG="logs/tenant-schema-sync-last-run.log"

node scripts/sync-tenant-schemas.js \
  --mode repair-apply \
  --report-file "$TENANT_SCHEMA_SYNC_REPORT" 2>&1 | tee "$TENANT_SCHEMA_SYNC_LOG" || true

if grep -qE '^\[TenantSchemaSync\] completed .* failed=0$' "$TENANT_SCHEMA_SYNC_LOG" 2>/dev/null; then
  echo "[entrypoint] Tenant schema sync: all active tenants OK."
else
  echo "[entrypoint] ============================================================"
  echo "[entrypoint] WARNING: tenant schema sync reported unresolved drift on one"
  echo "[entrypoint] WARNING: or more tenants (or the sync step itself failed to"
  echo "[entrypoint] WARNING: complete). This is NON-BLOCKING by design -- the"
  echo "[entrypoint] WARNING: server will still start. Inspect"
  echo "[entrypoint] WARNING: ${TENANT_SCHEMA_SYNC_REPORT} and the log lines above"
  echo "[entrypoint] WARNING: for the affected tenant_db + error_code."
  echo "[entrypoint] ============================================================"
fi

echo "[entrypoint] Starting server..."
exec "$@"
