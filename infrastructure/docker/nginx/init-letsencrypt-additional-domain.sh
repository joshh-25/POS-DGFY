#!/usr/bin/env bash
set -euo pipefail

# Issue a real Let's Encrypt certificate for an ADDITIONAL domain group on a
# server where nginx + certbot are ALREADY running (mirrors init-letsencrypt.sh
# but for a second cert-name added alongside an existing one -- e.g. the
# dgfy.ph production group brought up next to beta.dgfy.ph in the 2026-07-20
# cutover).
#
# Preconditions:
#   * nginx is already up and its config references a PRE-STAGED dummy cert at
#     live/${CERT_DOMAIN_PROD}/ (so nginx could start), AND it already serves
#     the ACME webroot (/.well-known/acme-challenge/) for the prod domains on
#     port 80. Both are true once the prod server blocks are deployed.
#   * .env defines SKUPERVISOR_DOMAIN_PROD / POS_DOMAIN_PROD /
#     STOREFRONT_DOMAIN_PROD / CERT_DOMAIN_PROD / CERTBOT_EMAIL.
#
# Usage (from the compose dir, e.g. /opt/dgfy-platform):
#   ./nginx/init-letsencrypt-additional-domain.sh

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a

: "${SKUPERVISOR_DOMAIN_PROD:?Set SKUPERVISOR_DOMAIN_PROD in .env}"
: "${POS_DOMAIN_PROD:?Set POS_DOMAIN_PROD in .env}"
: "${STOREFRONT_DOMAIN_PROD:?Set STOREFRONT_DOMAIN_PROD in .env}"
: "${CERT_DOMAIN_PROD:?Set CERT_DOMAIN_PROD in .env}"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env}"

RSA_KEY_SIZE=4096

echo "### Deleting any dummy/prior certificate for $CERT_DOMAIN_PROD ..."
docker compose run --rm --entrypoint "sh -c \"\
  rm -rf /etc/letsencrypt/live/$CERT_DOMAIN_PROD \
         /etc/letsencrypt/archive/$CERT_DOMAIN_PROD \
         /etc/letsencrypt/renewal/$CERT_DOMAIN_PROD.conf\"" certbot

echo "### Requesting the real certificate for:"
echo "###   $SKUPERVISOR_DOMAIN_PROD $POS_DOMAIN_PROD $STOREFRONT_DOMAIN_PROD"
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    -d $SKUPERVISOR_DOMAIN_PROD -d $POS_DOMAIN_PROD -d $STOREFRONT_DOMAIN_PROD \
    --cert-name $CERT_DOMAIN_PROD \
    --email $CERTBOT_EMAIL \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos --non-interactive" certbot

echo "### Reloading nginx to pick up the real certificate ..."
docker compose exec nginx nginx -s reload

echo "### Done. The existing certbot renew loop will renew this cert-name too."
