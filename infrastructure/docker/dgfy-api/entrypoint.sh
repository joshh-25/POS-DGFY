#!/bin/sh
set -e

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

# --- Tenant schema drift repair (best-effort, non-blocking) ---------------
#
# This service does NOT run `sequelize-cli db:migrate` -- that's the
# migration-runner container's job (see infrastructure/docker/
# dgfy-migration-runner/), which docker-compose.yml runs to completion
# before this service starts. Each tenant still has its own physically
# separate database whose schema must be kept in sync separately -- see
# scripts/sync-tenant-schemas.js. This runs on every container start/
# restart; every check in that script is gated on a "missing" check, so a
# tenant that's already caught up is a fast no-op.
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
