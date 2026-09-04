#!/bin/sh
set -e

# .sequelizerc resolves all its paths via path.resolve(...), which is
# relative to process.cwd() -- make sure that's /app (the WORKDIR root
# layout) regardless of how the container was invoked.
cd /app

if [ "$(id -u)" = '0' ]; then
  exec su-exec app "$0" "$@"
fi

# ADR 0081 Decision 4 (#1548 Wave 3, Phase 278): APP_VERSION is the published image tag, baked
# in as a build-arg/env var since Phase 277. This is a one-shot CLI with no HTTP server -- see
# the header comment above -- so it has no /health route to surface this on; the startup log line
# is its only runtime-observable surface. Falls back to package.json's version (via `node -p`,
# available in this node:22-alpine image) for a local `docker build` with no --build-arg set.
RESOLVED_APP_VERSION="${APP_VERSION:-}"
if [ -z "$RESOLVED_APP_VERSION" ]; then
  RESOLVED_APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
fi

echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} DB_HOST=${DB_HOST} DB_NAME=${DB_NAME}"
echo "[entrypoint] dgfy-migration-runner version=${RESOLVED_APP_VERSION}"
echo "[entrypoint] Running database migrations..."

# db:migrate is idempotent (tracked via the SequelizeMeta table), so it's
# safe to run on every invocation. Retry a few times in case the mysql
# container's healthcheck passes before the specific database/user grants
# are fully ready.
MAX_RETRIES=30
RETRY_DELAY=2
i=0
until "$@"; do
  i=$((i + 1))
  if [ "$i" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] Migrations failed after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Migration attempt ${i} failed, retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "[entrypoint] Migrations complete."
