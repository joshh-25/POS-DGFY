#!/bin/sh
set -e

# .sequelizerc resolves all its paths via path.resolve(...), which is
# relative to process.cwd() -- make sure that's /app (the WORKDIR root
# layout) regardless of how the container was invoked.
cd /app

if [ "$(id -u)" = '0' ]; then
  exec su-exec app "$0" "$@"
fi

echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} DB_HOST=${DB_HOST} DB_NAME=${DB_NAME}"
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
