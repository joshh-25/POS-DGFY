#!/bin/sh
set -e

cd /app

# Same bind-mount-ownership-fixup pattern as backend/entrypoint.sh (logs is
# the only writable bind mount this service has — no uploads/storage, and no
# migrations to run: it reads/writes tables backend's own migrations own).
if [ "$(id -u)" = '0' ]; then
  mkdir -p logs
  chown -R app:app logs 2>/dev/null || true
  exec su-exec app "$0" "$@"
fi

echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} DB_HOST=${DB_HOST} PORT=${PORT:-5100}"
exec "$@"
