#!/usr/bin/env bash
# Generates a throwaway self-signed cert laid out the same way /etc/letsencrypt
# is on the VPS, so the nginx edge container's conf.d/*.conf files (which
# hardcode /etc/letsencrypt/live/dgfy.ph/... paths) can start locally without
# modification. Not for production use — see infrastructure/docker/nginx/conf.d
# for the real, certbot-managed cert paths.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

mkdir -p live/dgfy.ph

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout live/dgfy.ph/privkey.pem \
  -out live/dgfy.ph/fullchain.pem \
  -days 365 \
  -subj "/CN=dgfy.ph" \
  -addext "subjectAltName=DNS:skupervisor.dgfy.ph,DNS:pos.dgfy.ph,DNS:dgfy.ph,DNS:store.dgfy.ph"

cat > options-ssl-nginx.conf <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF

openssl dhparam -out ssl-dhparams.pem 2048

echo "Dev certs generated under $(pwd). Mounted by docker-compose.override.yml at /etc/letsencrypt."
