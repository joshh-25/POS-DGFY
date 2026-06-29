#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_BRANCH="master"
RELEASE_TARGET_SHA="${RELEASE_TARGET_SHA:-}"
DRY_RUN="${PRODUCTION_DEPLOY_DRY_RUN:-1}"
REVIEWED_MANIFEST="${BATCH_REVIEWED_MANIFEST:-}"

if [[ ! "$RELEASE_TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[deploy-master-ci] RELEASE_TARGET_SHA must be a lowercase 40-character git SHA" >&2
  exit 1
fi

if [[ "$DRY_RUN" != "1" && "$DRY_RUN" != "true" && "$DRY_RUN" != "yes" ]]; then
  echo "[deploy-master-ci] Live production deployment from candidate code is disabled. Use the installed external signed release controller." >&2
  exit 1
fi

if [[ -z "$REVIEWED_MANIFEST" ]]; then
  echo "[deploy-master-ci] BATCH_REVIEWED_MANIFEST is required" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[deploy-master-ci] Working tree is dirty" >&2
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

npm run check:deploy-source-contract -- \
  --target-sha "$RELEASE_TARGET_SHA" \
  --remote-ref "origin/${TARGET_BRANCH}" \
  --require-remote-match \
  --report "${REPORT_DIR}/deploy_source_contract.production_candidate.json"

npm run check:batch-inventory -- \
  --base "origin/${TARGET_BRANCH}~1" \
  --head "$RELEASE_TARGET_SHA" \
  --reviewed-manifest "$REVIEWED_MANIFEST" \
  --write \
  --require-ship \
  --inventory "${REPORT_DIR}/batch_inventory.json" \
  --markdown "${REPORT_DIR}/batch_inventory.md"

npm run validate:batch-inventory -- \
  --inventory "${REPORT_DIR}/batch_inventory.json" \
  --base "origin/${TARGET_BRANCH}~1" \
  --head "$RELEASE_TARGET_SHA" \
  --require-ship

npm run check:regression-risk -- \
  --inventory "${REPORT_DIR}/batch_inventory.json" \
  --output "${REPORT_DIR}/regression_risk_notice.json" \
  --markdown "${REPORT_DIR}/regression_risk_notice.md" \
  --target-sha "$RELEASE_TARGET_SHA"

cat > "${REPORT_DIR}/deploy_ci_plan.json" <<JSON
{
  "schema": "sku-production-candidate-plan/v1",
  "target_sha": "${RELEASE_TARGET_SHA}",
  "dry_run": true,
  "production_mutation": false,
  "external_signed_controller_required": true
}
JSON

echo "[deploy-master-ci] Candidate dry run complete. Production mutation is disabled."
