#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--staging] [--alias-of <canonical-hostname>] <verified-hostname>"
}

STAGING=0
CANONICAL_DOMAIN=""
while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --staging)
      STAGING=1
      shift
      ;;
    --alias-of)
      CANONICAL_DOMAIN="${2:-}"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
DOMAIN="${1:-}"
if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]] || [[ "$DOMAIN" != *.* ]]; then
  usage
  exit 2
fi
if [[ -n "$CANONICAL_DOMAIN" ]]; then
  if [[ ! "$CANONICAL_DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]] \
    || [[ "$CANONICAL_DOMAIN" != *.* ]] \
    || [[ "$CANONICAL_DOMAIN" == "$DOMAIN" ]]; then
    usage
    exit 2
  fi
fi

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$COMPOSE_DIR/.env" ]]; then
  set -a
  source "$COMPOSE_DIR/.env"
  set +a
fi
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in infrastructure/docker/.env}"
TARGET_DIR="$COMPOSE_DIR/data/nginx/custom-storefronts"
TARGET_FILE="$TARGET_DIR/$DOMAIN.conf"
BACKUP_FILE="$TARGET_FILE.previous"
mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET_FILE" ]]; then
  cp "$TARGET_FILE" "$BACKUP_FILE"
fi

render_http_only() {
  cat > "$TARGET_FILE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
}

render_https() {
  if [[ -n "$CANONICAL_DOMAIN" ]]; then
    cat > "$TARGET_FILE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$CANONICAL_DOMAIN\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    return 301 https://$CANONICAL_DOMAIN\$request_uri;
}
EOF
    return
  fi

  cat > "$TARGET_FILE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    client_max_body_size 8m;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    location /api { set \$backend_upstream backend:5000; proxy_pass http://\$backend_upstream; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /uploads { set \$backend_upstream backend:5000; proxy_pass http://\$backend_upstream; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /openfreemap/ { rewrite ^/openfreemap/(.*)$ /\$1 break; proxy_pass https://tiles.openfreemap.org; proxy_ssl_server_name on; proxy_set_header Host tiles.openfreemap.org; }
    location / { set \$frontend_upstream frontend:8083; proxy_pass http://\$frontend_upstream; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
}
EOF
}

rollback() {
  if [[ -f "$BACKUP_FILE" ]]; then
    mv "$BACKUP_FILE" "$TARGET_FILE"
  else
    rm -f "$TARGET_FILE"
  fi
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -t >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -s reload >/dev/null 2>&1 || true
}
trap rollback ERR

render_http_only
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -t
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -s reload

CERTBOT_ARGS=(certonly --webroot -w /var/www/certbot -d "$DOMAIN" --cert-name "$DOMAIN" --email "$CERTBOT_EMAIL" --agree-tos --non-interactive)
if [[ "$STAGING" == "1" ]]; then
  CERTBOT_ARGS+=(--staging)
fi
docker compose -f "$COMPOSE_DIR/docker-compose.yml" run --rm --entrypoint certbot certbot "${CERTBOT_ARGS[@]}"

render_https
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -t
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec nginx nginx -s reload
rm -f "$BACKUP_FILE"
trap - ERR

if [[ -n "$CANONICAL_DOMAIN" ]]; then
  echo "Provisioned HTTPS alias redirect from $DOMAIN to $CANONICAL_DOMAIN."
else
  echo "Provisioned HTTPS routing for $DOMAIN. The controller must prove /api/v1/store/domain-context before reporting success."
fi
