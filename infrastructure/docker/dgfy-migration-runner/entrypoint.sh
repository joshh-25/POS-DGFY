#!/bin/sh
set -e

cd /app

# Same bind-mount-ownership-fixup pattern as dgfy-api/entrypoint.sh — /reports
# is the only writable bind mount this service has (maps to REPORT_DIR).
if [ "$(id -u)" = '0' ]; then
  mkdir -p "${REPORT_DIR:-/reports}"
  chown -R app:app "${REPORT_DIR:-/reports}" 2>/dev/null || true
  exec su-exec app "$0" "$@"
fi

echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} RUNTIME_MODE=${RUNTIME_MODE:-development} command=$*"
exec "$@"
