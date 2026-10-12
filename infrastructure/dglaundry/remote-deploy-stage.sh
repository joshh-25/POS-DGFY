#!/usr/bin/env bash
# Runs ON the staging host (as the dedicated `dglaundry` user), from inside
# /opt/dglaundry-stage/current. Invoked by .github/workflows/deploy-dglaundry.yml
# over SSH, with the GHCR login token piped in via the overall SSH session's
# stdin -- never as an argv or env var on this host, matching
# publish-platform.yml's existing discipline for the same reason.
#
# The `trap ... EXIT` below is what actually delivers "the host never stores
# a GHCR credential": docker login's result lives in this user's
# ~/.docker/config.json until logged out, so logout must fire on every exit
# path, not just the happy one at the bottom of the script -- a mid-script
# failure (mysql never healthy, migrate fails, etc.) must not leave a
# working credential sitting on disk indefinitely.
#
# Usage: GITHUB_ACTOR=<actor> bash remote-deploy-stage.sh <secrets-dir> <env-file>
# (GHCR token read from stdin)
set -euo pipefail

SECRETS_DIR="${1:?Usage: GITHUB_ACTOR=<actor> $0 <secrets-dir> <env-file> (token on stdin)}"
ENV_FILE="${2:?Usage: GITHUB_ACTOR=<actor> $0 <secrets-dir> <env-file> (token on stdin)}"
: "${GITHUB_ACTOR:?GITHUB_ACTOR must be set}"

COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.production.yml -f docker-compose.surebizcorp-lean.yml"

docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin

cleanup() { docker logout ghcr.io >/dev/null 2>&1 || true; }
trap cleanup EXIT

pull_with_retry() {
  local ok=0
  for delay in 0 15 45; do
    if [ "$delay" -gt 0 ]; then
      echo "::warning::docker compose pull failed, retrying in ${delay}s" >&2
      sleep "$delay"
    fi
    if $COMPOSE pull "$@"; then ok=1; break; fi
  done
  [ "$ok" = 1 ] || { echo "::error::docker compose pull $* failed after 3 attempts" >&2; exit 1; }
}

# Pull everything up front -- mysql is needed first, but api/worker/gateway
# are needed within the same ephemeral login window anyway, so there is no
# benefit to splitting this into two logins.
pull_with_retry mysql api worker gateway

$COMPOSE up -d mysql

echo "== waiting for mysql to report healthy =="
healthy=0
for _ in $(seq 1 30); do
  status="$($COMPOSE ps mysql --format '{{.Health}}')"
  if [ "$status" = "healthy" ]; then
    healthy=1
    break
  fi
  sleep 5
done
[ "$healthy" = 1 ] || { echo "::error::mysql did not become healthy within 150s" >&2; exit 1; }

./provision-migration-identity.sh "$(pwd)" "$SECRETS_DIR" "$ENV_FILE"

$COMPOSE run --rm migrate

$COMPOSE up -d api worker gateway

echo "== deploy complete =="
