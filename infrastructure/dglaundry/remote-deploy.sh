#!/usr/bin/env bash
# Runs ON either the staging or prod host (as whichever shared deploy user
# that host already runs every app's deploys as -- `sieitz` on staging,
# `gha` on prod; no per-app OS user split exists anywhere on either box, so
# DGLaundry doesn't get one either, see README.md's "Why one shared OS
# user"), from inside <host-root>/current (/opt/dglaundry-stage on staging,
# /opt/dglaundry on prod). Invoked by .github/workflows/deploy-dglaundry.yml
# (staging) or deploy-dglaundry-prod.yml (prod) over SSH, with the GHCR
# login token piped in via the overall SSH session's stdin -- never as an
# argv or env var on this host, matching publish-platform.yml's existing
# discipline for the same reason. Environment-agnostic itself: every path
# is passed in as an argument (see Usage below), not derived from the
# filename or hardcoded -- this file is identical for both environments.
#
# The `trap ... EXIT` below is what actually delivers "the host never stores
# a GHCR credential": docker login's result lives in this user's
# ~/.docker/config.json until logged out, so logout must fire on every exit
# path, not just the happy one at the bottom of the script -- a mid-script
# failure (mysql never healthy, migrate fails, etc.) must not leave a
# working credential sitting on disk indefinitely. Registered BEFORE
# `docker login` itself runs (not after), so an interrupted login attempt
# is covered too (PR #2448 review, RF-5).
#
# Only docker-compose.production.yml is layered here -- NOT
# docker-compose.surebizcorp-lean.yml. That overlay was written for
# Surebizcorp's own closed qualification and additionally requires several
# live DGFY integration variables that don't exist while
# DGLAUNDRY_DGFY_MODE=disabled; layering it in made `docker compose config`
# fail outright (caught in PR #2448 review, RF-2). production.yml's own
# mem_limit/cpus fields already read the exact variable names stage.env
# sets directly, so nothing about resource sizing is lost by dropping it --
# see stage.env's own comment on those variables.
#
# No explicit `migrate` step: `api`'s `depends_on: migrate:
# {condition: service_completed_successfully}` already makes `docker
# compose up api` run `migrate` to completion before starting `api`, exactly
# once. An earlier version of this script ran `compose run --rm migrate`
# as its own explicit step first -- empirically confirmed (PR #2448 review,
# RF-4) that `up`'s own dependency resolution re-runs `migrate` as a brand
# new container regardless of whether a prior `run`/`up` invocation already
# completed it, so that explicit step only caused migrate to execute twice.
# Letting `up -d api worker gateway` run it exactly once, instead, avoids
# that without losing failure propagation -- `up` itself exits non-zero if
# `migrate` fails, same as before.
#
# Usage: GITHUB_ACTOR=<actor> bash remote-deploy.sh <secrets-dir> <env-file>
# (GHCR token read from stdin)
set -euo pipefail

SECRETS_DIR="${1:?Usage: GITHUB_ACTOR=<actor> $0 <secrets-dir> <env-file> (token on stdin)}"
ENV_FILE="${2:?Usage: GITHUB_ACTOR=<actor> $0 <secrets-dir> <env-file> (token on stdin)}"
: "${GITHUB_ACTOR:?GITHUB_ACTOR must be set}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.production.yml)

cleanup() { docker logout ghcr.io >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM

docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin

pull_with_retry() {
  local ok=0
  for delay in 0 15 45; do
    if [ "$delay" -gt 0 ]; then
      echo "::warning::docker compose pull failed, retrying in ${delay}s" >&2
      sleep "$delay"
    fi
    if "${COMPOSE[@]}" pull "$@"; then ok=1; break; fi
  done
  [ "$ok" = 1 ] || { echo "::error::docker compose pull $* failed after 3 attempts" >&2; exit 1; }
}

# Pull everything up front -- mysql is needed first, but api/worker/gateway
# are needed within the same ephemeral login window anyway, so there is no
# benefit to splitting this into two logins.
pull_with_retry mysql api worker gateway

"${COMPOSE[@]}" up -d mysql

echo "== waiting for mysql to report healthy =="
healthy=0
for _ in $(seq 1 30); do
  status="$("${COMPOSE[@]}" ps mysql --format '{{.Health}}')"
  if [ "$status" = "healthy" ]; then
    healthy=1
    break
  fi
  sleep 5
done
[ "$healthy" = 1 ] || { echo "::error::mysql did not become healthy within 150s" >&2; exit 1; }

./provision-migration-identity.sh "$(pwd)" "$SECRETS_DIR" "$ENV_FILE"

if ! "${COMPOSE[@]}" up -d api worker gateway; then
  echo "::error::docker compose up api/worker/gateway failed. Dumping migrate logs:" >&2
  "${COMPOSE[@]}" logs --tail=100 migrate >&2 || true
  exit 1
fi

echo "== deploy complete =="
