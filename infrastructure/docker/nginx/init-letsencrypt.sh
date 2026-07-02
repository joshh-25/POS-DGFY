#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap for the nginx + certbot Let's Encrypt setup. Run this
# ONCE on the server, from infrastructure/docker/, after the very first
# `docker compose up -d` on a fresh server (or after wiping
# ./data/certbot/). It exists to solve the chicken-and-egg problem: nginx's
# real config references certificate files that don't exist yet, but
# certbot's HTTP-01 webroot validation needs nginx already serving plain
# HTTP on port 80.
#
# Steps: generate a throwaway self-signed cert so nginx can start at all,
# start nginx, delete the dummy cert, request the real multi-domain
# certificate via the webroot challenge (nginx is already up to serve it),
# then reload nginx to pick up the real cert.
#
# Domains and the cert name come from .env (SKUPERVISOR_DOMAIN, POS_DOMAIN,
# STOREFRONT_DOMAIN, STOREFRONT_ALT_DOMAIN, CERT_DOMAIN, CERTBOT_EMAIL) --
# the same file docker-compose.yml reads, so this stays in sync with
# whatever domains nginx.conf.template is actually serving for this
# environment (DEV/QA/PROD/beta).
#
# Usage (from infrastructure/docker/): ./nginx/init-letsencrypt.sh

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a

: "${SKUPERVISOR_DOMAIN:?Set SKUPERVISOR_DOMAIN in .env}"
: "${POS_DOMAIN:?Set POS_DOMAIN in .env}"
: "${STOREFRONT_DOMAIN:?Set STOREFRONT_DOMAIN in .env}"
: "${CERT_DOMAIN:?Set CERT_DOMAIN in .env}"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env}"

DOMAINS=("$SKUPERVISOR_DOMAIN" "$POS_DOMAIN" "$STOREFRONT_DOMAIN")
if [ -n "${STOREFRONT_ALT_DOMAIN:-}" ]; then
  DOMAINS+=("$STOREFRONT_ALT_DOMAIN")
fi
RSA_KEY_SIZE=4096
DATA_PATH="./data/certbot"

if [ -d "$DATA_PATH/conf/live/$CERT_DOMAIN" ]; then
  echo "Existing certificate data found for $CERT_DOMAIN in $DATA_PATH -- skipping bootstrap."
  echo "(Delete $DATA_PATH/conf/live/$CERT_DOMAIN first if you really want to re-run this.)"
  exit 0
fi

echo "### Creating a temporary self-signed certificate for $CERT_DOMAIN ..."
mkdir -p "$DATA_PATH/conf/live/$CERT_DOMAIN"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
    -keyout '/etc/letsencrypt/live/$CERT_DOMAIN/privkey.pem' \
    -out '/etc/letsencrypt/live/$CERT_DOMAIN/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx ..."
docker compose up -d nginx

echo "### Deleting the temporary certificate ..."
docker compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$CERT_DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$CERT_DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$CERT_DOMAIN.conf" certbot

echo "### Requesting the real Let's Encrypt certificate ..."
domain_args=""
for domain in "${DOMAINS[@]}"; do
  domain_args="$domain_args -d $domain"
done

# shellcheck disable=SC2086
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $domain_args \
    --cert-name $CERT_DOMAIN \
    --email $CERTBOT_EMAIL \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

echo "### Reloading nginx ..."
docker compose exec nginx nginx -s reload

echo "### Done. https://$CERT_DOMAIN should now serve a real certificate."
echo "Note: certbot's renewal loop (see docker-compose.yml) renews the cert automatically"
echo "when it's within 30 days of expiry, but nginx must be reloaded afterward to pick it"
echo "up -- 'docker compose exec nginx nginx -s reload' isn't triggered automatically."
