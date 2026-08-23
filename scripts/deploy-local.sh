#!/usr/bin/env bash
# Build (and optionally push/deploy) images locally, bypassing the self-
# hosted runner pool entirely -- Pat's ask: "potentially even deploy this
# with local scripts myself." Mirrors the same Dockerfiles and build-arg
# shape CI uses (deploy-api.yml / deploy-frontend.yml / deploy-migration-
# runner.yml / publish-platform.yml) so a local build isn't a second,
# silently-diverging definition of the pipeline.
#
# What this CANNOT do, by GitHub's own design, not a gap here: read back
# the *values* of GitHub Actions secrets (SSH_PRIVATE_KEY, SSH_TARGET,
# SENTRY_AUTH_TOKEN, ...) via `gh` or the API -- GitHub never exposes a
# secret's value again once set. Non-secret GitHub Environment *variables*
# (the VITE_* build args) ARE readable and this script fetches them for
# you. For everything that's actually secret, this script expects you to
# already have local access (your own SSH key that can reach the deploy
# target, your own Sentry token, `docker login ghcr.io` already done) --
# see the flags below.
#
# Usage:
#   scripts/deploy-local.sh --env DEV --components all|backend|frontend \
#     [--push] [--deploy] [--ssh-target user@host] [--docker-dir /opt/dgfy-platform]
#
# --push requires `docker login ghcr.io` already done locally (your own PAT
#         or `gh auth token | docker login ghcr.io -u <you> --password-stdin`).
# --deploy requires --ssh-target (or $DEPLOY_SSH_TARGET) reachable with your
#          own SSH key/agent, and --docker-dir (or $DEPLOY_DOCKER_DIR,
#          default /opt/dgfy-platform) on that host.
#
# --components used to also accept `auto` (read the deployed revision's OCI
# label, build only what changed since then). Dropped 2026-08-14 (#420) for
# the same reason deploy.yml's auto mode was dropped: this script exists so
# you explicitly pick what to build, not so something decides for you.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENVIRONMENT=""
COMPONENTS="all"
DO_PUSH=false
DO_DEPLOY=false
SSH_TARGET="${DEPLOY_SSH_TARGET:-}"
DOCKER_DIR="${DEPLOY_DOCKER_DIR:-/opt/dgfy-platform}"

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --components) COMPONENTS="$2"; shift 2 ;;
    --push) DO_PUSH=true; shift ;;
    --deploy) DO_DEPLOY=true; shift ;;
    --ssh-target) SSH_TARGET="$2"; shift 2 ;;
    --docker-dir) DOCKER_DIR="$2"; shift 2 ;;
    *) echo "Unrecognized argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$ENVIRONMENT" ]; then
  echo "::error:: --env is required (DEV or STAGING)." >&2
  exit 1
fi

case "$ENVIRONMENT" in
  DEV) TAG="develop" ;;
  STAGING) TAG="staging" ;;
  # BETA removed 2026-08-23 (#329/#895) -- beta.dgfy.ph now redirects to
  # prod, so there is no BETA deploy target left to build/push for. PROD
  # deploys go through deploy-main.yml, not this script -- see its own
  # header comment.
  *) echo "::error:: --env must be DEV or STAGING (got '$ENVIRONMENT')." >&2; exit 1 ;;
esac

REGISTRY="ghcr.io/sieitzz/dgfy-platform"
REVISION="$(git rev-parse HEAD)"

echo "== deploy-local: environment=$ENVIRONMENT tag=$TAG components=$COMPONENTS revision=$REVISION =="

build_backend() {
  echo "-- building api (tag: $TAG, sha-$( echo "$REVISION" | cut -c1-7)) --"
  docker build -f infrastructure/docker/dgfy-api/Dockerfile \
    -t "$REGISTRY/api:$TAG" -t "$REGISTRY/api:sha-${REVISION:0:7}" \
    --label "org.opencontainers.image.revision=$REVISION" .

  echo "-- building migration-runner (tag: $TAG, sha-$( echo "$REVISION" | cut -c1-7)) --"
  # Single-platform locally (no QEMU setup implied) -- deliberately not
  # dual-arch like CI's deploy-migration-runner.yml. If you need arm64,
  # add --platform linux/amd64,linux/arm64 yourself once buildx has a
  # multi-platform builder configured (docker buildx create --use).
  docker build -f infrastructure/docker/dgfy-migration-runner/Dockerfile \
    -t "$REGISTRY/migration-runner:$TAG" -t "$REGISTRY/migration-runner:sha-${REVISION:0:7}" \
    --label "org.opencontainers.image.revision=$REVISION" .
}

build_frontend() {
  echo "-- building frontend (tag: $TAG, sha-${REVISION:0:7}) --"
  if ! command -v gh >/dev/null; then
    echo "::error:: gh CLI required to fetch this environment's VITE_* build vars." >&2
    exit 1
  fi
  BUILD_ARGS=()
  while IFS=$'\t' read -r name value; do
    BUILD_ARGS+=(--build-arg "${name}=${value}")
  done < <(gh variable list --env "$ENVIRONMENT" --json name,value --jq '.[] | [.name, .value] | @tsv' 2>/dev/null || true)
  BUILD_ARGS+=(--build-arg "VITE_BUILD_STAMP=${REVISION}")
  BUILD_ARGS+=(--build-arg "VITE_SENTRY_RELEASE=${REVISION}")
  if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
    echo "SENTRY_AUTH_TOKEN found in your local env -- source maps will upload."
  else
    echo "No local SENTRY_AUTH_TOKEN -- building without sourcemap upload (fine for a local test build)."
  fi
  docker build -f infrastructure/docker/frontend/Dockerfile \
    -t "$REGISTRY/frontend:$TAG" -t "$REGISTRY/frontend:sha-${REVISION:0:7}" \
    --label "org.opencontainers.image.revision=$REVISION" \
    "${BUILD_ARGS[@]}" .
}

case "$COMPONENTS" in
  all) build_backend; build_frontend ;;
  backend) build_backend ;;
  frontend) build_frontend ;;
  *) echo "::error:: --components must be all, backend, or frontend (got '$COMPONENTS')." >&2; exit 1 ;;
esac

if $DO_PUSH; then
  echo "== pushing (requires docker login ghcr.io already done locally) =="
  if [ "$COMPONENTS" = "all" ] || [ "$COMPONENTS" = "backend" ]; then
    docker push "$REGISTRY/api:$TAG"
    docker push "$REGISTRY/api:sha-${REVISION:0:7}"
    docker push "$REGISTRY/migration-runner:$TAG"
    docker push "$REGISTRY/migration-runner:sha-${REVISION:0:7}"
  fi
  if [ "$COMPONENTS" = "all" ] || [ "$COMPONENTS" = "frontend" ]; then
    docker push "$REGISTRY/frontend:$TAG"
    docker push "$REGISTRY/frontend:sha-${REVISION:0:7}"
  fi
fi

if $DO_DEPLOY; then
  if ! $DO_PUSH; then
    echo "::error:: --deploy without --push would restart the server against whatever's already in GHCR, not what you just built. Pass --push too, or drop --deploy." >&2
    exit 1
  fi
  if [ -z "$SSH_TARGET" ]; then
    echo "::error:: --deploy requires --ssh-target (or \$DEPLOY_SSH_TARGET) -- this script has no access to the SSH_TARGET GitHub secret's value, by GitHub's own design." >&2
    exit 1
  fi
  echo "== deploying to $SSH_TARGET:$DOCKER_DIR (same staleness guard as publish-platform.yml) =="
  ssh -o StrictHostKeyChecking=yes "$SSH_TARGET" \
    "cd $DOCKER_DIR && \
     COMPOSE_IMAGES=\$(docker compose config --images) && \
     { echo \"\$COMPOSE_IMAGES\" | grep -q 'dgfy-platform/api' && echo \"\$COMPOSE_IMAGES\" | grep -q 'dgfy-platform/migration-runner'; } || { echo '::error:: compose is stale, refusing to deploy.' >&2; exit 1; } && \
     docker compose pull && docker compose up -d --remove-orphans"
fi

echo "== done =="
