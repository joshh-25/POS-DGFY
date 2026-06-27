#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_BRANCH="master"
REMOTE_HOST="${DEPLOY_PROD_REMOTE_HOST:-${REMOTE_HOST:-192.53.116.33}}"
REMOTE_PORT="${DEPLOY_PROD_REMOTE_PORT:-${REMOTE_PORT:-64428}}"
REMOTE_USER="${DEPLOY_PROD_REMOTE_USER:-${REMOTE_USER:-root}}"
REMOTE_DIR="${DEPLOY_PROD_REMOTE_DIR:-${REMOTE_DIR:-/var/www/skupervisor}}"
RELEASE_TARGET_SHA="${RELEASE_TARGET_SHA:-}"
DRY_RUN="${PRODUCTION_DEPLOY_DRY_RUN:-${DEPLOY_PROD_CI_DRY_RUN:-0}}"

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
PROOF_DIR="${REPORT_DIR}/production-proof"
mkdir -p "$REPORT_DIR"
mkdir -p "$PROOF_DIR"

RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" \
DEPLOY_REQUIRE_REMOTE_MATCH=1 \
DEPLOY_SOURCE_CONTRACT_REPORT="${REPORT_DIR}/deploy_source_contract.production_ci.json" \
npm run check:deploy-source-contract -- \
  --target-sha "$RELEASE_TARGET_SHA" \
  --remote-ref "origin/${TARGET_BRANCH}" \
  --require-remote-match \
  --report "${REPORT_DIR}/deploy_source_contract.production_ci.json"

if [[ ! -f "${REPORT_DIR}/batch_inventory.json" ]]; then
  npm run check:batch-inventory -- \
    --base "origin/${TARGET_BRANCH}~1" \
    --head "$RELEASE_TARGET_SHA" \
    --write \
    --require-ship \
    --inventory "${REPORT_DIR}/batch_inventory.json" \
    --markdown "${REPORT_DIR}/batch_inventory.md"
fi

npm run validate:batch-inventory -- \
  --inventory "${REPORT_DIR}/batch_inventory.json" \
  --require-ship

RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run gate:release:no-staging:preflight
RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run evidence:qa:deploy-summary
RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" \
QA_TARGET_PROOF_REPORT="${REPORT_DIR}/qa_target_proof.json" \
npm run check:qa-target-proof -- \
  --target-sha "$RELEASE_TARGET_SHA" \
  --summary "${REPORT_DIR}/qa_deploy_summary.txt" \
  --report "${REPORT_DIR}/qa_target_proof.json"
RELEASE_TARGET_SHA="$RELEASE_TARGET_SHA" npm run gate:release:no-staging

REMOTE_COMMAND="set -e; cd '${REMOTE_DIR}'; git fetch origin ${TARGET_BRANCH}; bash scripts/deploy.sh --branch ${TARGET_BRANCH} --expect-commit ${RELEASE_TARGET_SHA}"

{
  echo "{"
  echo "  \"target_sha\": \"${RELEASE_TARGET_SHA}\","
  echo "  \"remote_host\": \"${REMOTE_HOST}\","
  echo "  \"remote_dir\": \"${REMOTE_DIR}\","
  echo "  \"dry_run\": \"${DRY_RUN}\","
  echo "  \"remote_command\": \"${REMOTE_COMMAND//\"/\\\"}\""
  echo "}"
} > "${REPORT_DIR}/deploy_ci_plan.json"

if [[ "$DRY_RUN" == "1" || "$DRY_RUN" == "true" || "$DRY_RUN" == "yes" ]]; then
  echo "[deploy-master-ci] Dry-run mode enabled; production SSH deploy skipped after gates and command construction."
  exit 0
fi

ssh -p "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_COMMAND"

REMOTE_PROOF_COMMAND="set -e; cd '${REMOTE_DIR}'; summary=\$(ls -1t logs/deploy/deploy_*.summary.txt | head -1); contract=\$(ls -1t logs/deploy/deploy_*.production_contract.json | head -1); frontend=\$(ls -1t logs/deploy/deploy_*.frontend_build_manifest.json | head -1); printf 'remote_head=%s\n' \"\$(git rev-parse HEAD)\"; printf 'deploy_state=%s\n' \"\$(cat .deploy-state/last_deployed_commit)\"; printf 'deploy_summary_path=%s\n' \"\$summary\"; printf 'production_contract_path=%s\n' \"\$contract\"; printf 'frontend_build_manifest_path=%s\n' \"\$frontend\""
ssh -p "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_PROOF_COMMAND" > "${PROOF_DIR}/production_proof.txt"

summary_path="$(sed -n 's/^deploy_summary_path=//p' "${PROOF_DIR}/production_proof.txt" | head -1)"
contract_path="$(sed -n 's/^production_contract_path=//p' "${PROOF_DIR}/production_proof.txt" | head -1)"
frontend_manifest_path="$(sed -n 's/^frontend_build_manifest_path=//p' "${PROOF_DIR}/production_proof.txt" | head -1)"

if [[ -n "$summary_path" ]]; then
  scp -P "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${summary_path}" "${PROOF_DIR}/deploy_summary.txt"
fi
if [[ -n "$contract_path" ]]; then
  scp -P "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${contract_path}" "${PROOF_DIR}/production_contract.json"
fi
if [[ -n "$frontend_manifest_path" ]]; then
  scp -P "$REMOTE_PORT" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${frontend_manifest_path}" "${PROOF_DIR}/frontend_build_manifest.json"
fi

npm run review:deployed-change-accuracy -- \
  --inventory "${REPORT_DIR}/batch_inventory.json" \
  --deploy-summary "${PROOF_DIR}/deploy_summary.txt" \
  --production-contract "${PROOF_DIR}/production_contract.json" \
  --output "${REPORT_DIR}/deployed_change_accuracy.json" \
  --markdown "${REPORT_DIR}/deployed_change_accuracy.md"
