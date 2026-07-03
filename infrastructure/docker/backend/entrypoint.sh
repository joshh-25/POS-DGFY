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

echo "[entrypoint] Migrations complete. Starting server..."
exec "$@"
