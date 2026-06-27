#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_BRANCH="master"
REMOTE_HOST="${DEPLOY_PROD_REMOTE_HOST:-${REMOTE_HOST:-192.53.116.33}}"
REMOTE_PORT="${DEPLOY_PROD_REMOTE_PORT:-${REMOTE_PORT:-64428}}"
REMOTE_USER="${DEPLOY_PROD_REMOTE_USER:-${REMOTE_USER:-root}}"
REMOTE_DIR="${DEPLOY_PROD_REMOTE_DIR:-${REMOTE_DIR:-/var/www/skupervisor}}"
RELEASE_TARGET_SHA="${RELEASE_TARGET_SHA:-}"

if [[ -z "$RELEASE_TARGET_SHA" ]]; then
  echo "[deploy-master-ci] Missing RELEASE_TARGET_SHA" >&2
  exit 1
fi

if [[ ! "$RELEASE_TARGET_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "[deploy-master-ci] RELEASE_TARGET_SHA must be a 40-character git SHA" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[deploy-master-ci] Working tree is dirty; refusing CI production deploy" >&2
  git status --short >&2
  exit 1
fi

git fetch --prune origin "$TARGET_BRANCH"
ORIGIN_MASTER_SHA="$(git rev-parse "origin/${TARGET_BRANCH}^{commit}")"

if [[ "$ORIGIN_MASTER_SHA" != "$RELEASE_TARGET_SHA" ]]; then
  echo "[deploy-master-ci] origin/${TARGET_BRANCH} mismatch. expected=${RELEASE_TARGET_SHA} actual=${ORIGIN_MASTER_SHA}" >&2
  exit 1
fi

REPORT_DIR=".tmp/release-gates/${RELEASE_TARGET_SHA}"
mkdir -p "$REPORT_DIR"

RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" \
DEPLOY_REQUIRE_REMOTE_MATCH=1 \
DEPLOY_SOURCE_CONTRACT_REPORT="${REPORT_DIR}/deploy_source_contract.production_ci.json" \
npm run check:deploy-source-contract -- \
  --target-sha "$RELEASE_TARGET_SHA" \
  --remote-ref "origin/${TARGET_BRANCH}" \
  --require-remote-match \
  --report "${REPORT_DIR}/deploy_source_contract.production_ci.json"

RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run gate:release:no-staging:preflight
RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run evidence:qa:deploy-summary
RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run gate:release:no-staging

REMOTE_COMMAND="set -e; cd '${REMOTE_DIR}'; git fetch origin ${TARGET_BRANCH}; bash scripts/deploy.sh --branch ${TARGET_BRANCH} --expect-commit ${RELEASE_TARGET_SHA}"
ssh -p "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_COMMAND"
