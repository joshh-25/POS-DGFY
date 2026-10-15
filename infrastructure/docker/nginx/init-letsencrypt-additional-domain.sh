#!/usr/bin/env bash
set -euo pipefail

# Issue, or EXPAND, the production Let's Encrypt certificate (cert-name
# ${CERT_DOMAIN_PROD}, e.g. dgfy.ph) on a server where nginx + certbot are
# ALREADY running (mirrors init-letsencrypt.sh but for a second cert-name added
# alongside an existing one -- e.g. the dgfy.ph production group brought up next
# to beta.dgfy.ph in the 2026-07-20 cutover).
#
# Two modes, chosen automatically:
#
#   * EXPAND (a real certbot lineage already exists -- renewal/<cert-name>.conf):
#     reads the lineage's CURRENT SANs and re-requests them ALL plus
#     ${DGLAUNDRY_DOMAIN} with --expand. This matters: `certbot --expand`
#     REPLACES the SAN list, it does not add to it, and one cert-name is shared
#     by every prod domain -- listing only the new domain (or a stale subset)
#     would silently drop the others from the cert. Nothing is deleted first, so
#     a failed validation leaves the live cert untouched. (An earlier version of
#     this script deleted the live cert unconditionally and requested a fixed
#     4-domain list; run against the real multi-SAN cert it would have deleted
#     it and re-issued with only those 4 SANs.)
#
#   * FIRST ISSUE (no lineage yet, only a PRE-STAGED dummy cert so nginx could
#     start): removes the dummy and requests the full set from the env vars.
#
# Preconditions:
#   * nginx is already up and ALREADY serves ${DGLAUNDRY_DOMAIN} on port 80 (in
#     its server_name list) with the ACME webroot (/.well-known/acme-challenge/).
#     HTTP-01 validation fails otherwise ("Error getting validation data") --
#     that failure is harmless (the cert is not changed), just re-run after
#     nginx has the new server_name.
#   * .env (or the exported environment) defines SKUPERVISOR_DOMAIN_PROD /
#     POS_DOMAIN_PROD / STOREFRONT_DOMAIN_PROD / OPIS_DOMAIN_PROD /
#     DGLAUNDRY_DOMAIN / CERT_DOMAIN_PROD / CERTBOT_EMAIL. (On the prod host the
#     domain vars are literals inside docker-compose.proxy.yml, not in .env --
#     export them for this run.) STOREFRONT_ALT_DOMAIN_PROD is optional.
#
# Usage (from the compose dir, e.g. /opt/dgfy-platform):
#   ./nginx/init-letsencrypt-additional-domain.sh
#
# This only ever runs `docker compose run ... certbot` and `exec nginx`; never
# add an `up`/`restart` here -- on the prod host a bare `docker compose up`
# resolves the SOPS-backed secrets blank and recreates mysql/dgfy-api with them.

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_DIR"

# shellcheck disable=SC1091
[ -f .env ] && set -a && source .env && set +a

: "${SKUPERVISOR_DOMAIN_PROD:?Set SKUPERVISOR_DOMAIN_PROD in .env}"
: "${POS_DOMAIN_PROD:?Set POS_DOMAIN_PROD in .env}"
: "${STOREFRONT_DOMAIN_PROD:?Set STOREFRONT_DOMAIN_PROD in .env}"
: "${OPIS_DOMAIN_PROD:?Set OPIS_DOMAIN_PROD in .env}"
: "${DGLAUNDRY_DOMAIN:?Set DGLAUNDRY_DOMAIN in .env}"
: "${CERT_DOMAIN_PROD:?Set CERT_DOMAIN_PROD in .env}"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env}"

RSA_KEY_SIZE=4096

LINEAGE_EXISTS=0
if docker compose run --rm -T --entrypoint "test -f /etc/letsencrypt/renewal/$CERT_DOMAIN_PROD.conf" certbot; then
  LINEAGE_EXISTS=1
fi

if [ "$LINEAGE_EXISTS" = 1 ]; then
  echo "### Existing certificate lineage found for $CERT_DOMAIN_PROD -- EXPAND mode."
  EXISTING_SANS="$(docker compose run --rm -T --entrypoint "certbot certificates --cert-name $CERT_DOMAIN_PROD" certbot \
    | sed -n 's/^ *Domains: *//p')"
  if [ -z "$EXISTING_SANS" ]; then
    echo "ERROR: could not read the current SANs of $CERT_DOMAIN_PROD; refusing to continue" \
         "(a wrong list would drop domains from the cert)." >&2
    exit 1
  fi
  # shellcheck disable=SC2086
  ALL_DOMAINS="$(printf '%s\n' $EXISTING_SANS $DGLAUNDRY_DOMAIN | awk 'NF && !seen[$0]++')"
  CERTBOT_MODE_ARGS="--expand"
else
  echo "### No certbot lineage for $CERT_DOMAIN_PROD (dummy cert only) -- FIRST ISSUE mode."
  ALL_DOMAINS="$(printf '%s\n' \
    "$SKUPERVISOR_DOMAIN_PROD" "$POS_DOMAIN_PROD" "$STOREFRONT_DOMAIN_PROD" \
    "$OPIS_DOMAIN_PROD" "${STOREFRONT_ALT_DOMAIN_PROD:-}" "$DGLAUNDRY_DOMAIN" \
    | awk 'NF && !seen[$0]++')"
  CERTBOT_MODE_ARGS="--rsa-key-size $RSA_KEY_SIZE"

  echo "### Deleting the dummy certificate for $CERT_DOMAIN_PROD ..."
  docker compose run --rm --entrypoint "sh -c \"\
    rm -rf /etc/letsencrypt/live/$CERT_DOMAIN_PROD \
           /etc/letsencrypt/archive/$CERT_DOMAIN_PROD \
           /etc/letsencrypt/renewal/$CERT_DOMAIN_PROD.conf\"" certbot
fi

D_ARGS=""
for d in $ALL_DOMAINS; do D_ARGS="$D_ARGS -d $d"; done

echo "### Requesting the certificate for:"
echo "###   ${ALL_DOMAINS//$'\n'/ }"
# shellcheck disable=SC2086
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $D_ARGS \
    --cert-name $CERT_DOMAIN_PROD \
    --email $CERTBOT_EMAIL \
    $CERTBOT_MODE_ARGS \
    --agree-tos --non-interactive" certbot

echo "### Reloading nginx to pick up the certificate ..."
docker compose exec nginx nginx -s reload

echo "### Done. The existing certbot renew loop will renew this cert-name too."
