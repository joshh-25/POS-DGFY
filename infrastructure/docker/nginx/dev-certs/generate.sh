#!/usr/bin/env bash
# Generates a throwaway self-signed cert at the same path structure certbot
# would use (./data/certbot/conf/live/<domain>/), so docker-compose.yml's
# nginx service (which always mounts ./data/certbot/conf at
# /etc/letsencrypt) works unmodified for local dev -- no override needed
# for its volumes, just different domain env vars (see
# docker-compose.override.yml).
#
# Usage: ./generate.sh [cert-domain]   (default: dev.localhost)
#
# Not for production use -- see infrastructure/docker/nginx/init-letsencrypt.sh
# for the real, certbot-managed flow.
set -euo pipefail

CERT_DOMAIN="${1:-dev.localhost}"
# dev-certs/generate.sh -> nginx -> docker/ (where docker-compose.yml and
# ./data/ live) is two levels up, not three.
DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/data/certbot/conf/live/${CERT_DOMAIN}"

mkdir -p "$DATA_DIR"

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DATA_DIR/privkey.pem" \
  -out "$DATA_DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=${CERT_DOMAIN}" \
  -addext "subjectAltName=DNS:skupervisor.localhost,DNS:pos.localhost,DNS:localhost,DNS:${CERT_DOMAIN}"

echo "Dev cert generated at $DATA_DIR (CERT_DOMAIN=${CERT_DOMAIN})."
echo "docker-compose.yml's nginx service already mounts ./data/certbot/conf -- no extra volume needed."
