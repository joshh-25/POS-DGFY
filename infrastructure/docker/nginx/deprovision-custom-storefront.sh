#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--remove-certificate] <verified-hostname>"
}

REMOVE_CERTIFICATE=0
if [[ "${1:-}" == "--remove-certificate" ]]; then
  REMOVE_CERTIFICATE=1
  shift
fi

DOMAIN="${1:-}"
if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]] || [[ "$DOMAIN" != *.* ]]; then
  usage
  exit 2
fi

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$COMPOSE_DIR/data/nginx/custom-storefronts"
TARGET_FILE="$TARGET_DIR/$DOMAIN.conf"
BACKUP_FILE="$TARGET_FILE.deprovision-backup"
mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  cp "$TARGET_FILE" "$BACKUP_FILE"
  rm "$TARGET_FILE"
fi

rollback() {
  if [[ -f "$BACKUP_FILE" ]]; then
    mv "$BACKUP_FILE" "$TARGET_FILE"
  fi
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -t >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -s reload >/dev/null 2>&1 || true
}
trap rollback ERR

docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -t
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -s reload
rm -f "$BACKUP_FILE"
trap - ERR

if [[ "$REMOVE_CERTIFICATE" == "1" ]]; then
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" run --rm --entrypoint certbot certbot \
    delete --cert-name "$DOMAIN" --non-interactive
fi

echo "Disabled HTTPS routing for $DOMAIN."
