# Deployment Hardening Closure - 2026-04-19

## Summary
- Scope: deploy reliability hardening + runbook synchronization + production rollout + merged-branch cleanup.
- Classification: within-existing-boundary.
- Deployed commit: `f0e5549a5340c59bba0bf851dd9c4158e013deea` on `master`.

## What Changed
- `scripts/deploy.sh`
  - Help output now matches strict runtime defaults for tenant sync/index gates.
  - Added deterministic `npm ci` retry/backoff controls:
    - `DEPLOY_NPM_CI_RETRIES` (default `3`)
    - `DEPLOY_NPM_CI_RETRY_DELAY_SECONDS` (default `5`)
  - Replaced brittle `ls|tail|xargs` log pruning with null-safe grouped rotation.
  - Added deep-verify tenant controls:
    - `DEPLOY_VERIFY_TENANT_NAME`
    - `DEPLOY_VERIFY_TENANT_TOKEN`
    - `DEPLOY_VERIFY_SKIP_IF_MISSING` (default `1`)
- `backend/scripts/qa_30_questions_verification.js`
  - Added CLI/env-based tenant selection and skip-if-missing policy.
- Deployment docs aligned:
  - `DEPLOYMENT_GUIDE.md`
  - `docs/guides/SCRIPTS_GUIDE.md`
  - `docs/ops/PRODUCTION_CHECKLIST.md`

## Validation Evidence
- Local governance checks:
  - `npm run lint:docs` -> pass
  - `npm run check:architecture` -> pass
  - `node --check backend/scripts/qa_30_questions_verification.js` -> pass
- Production deploy execution:
  - Host: `root@192.53.116.33:64428` (`/var/www/skupervisor`)
  - Deploy summary: `/var/www/skupervisor/logs/deploy/deploy_20260419_161625.summary.txt`
  - Tenant schema sync report: `/var/www/skupervisor/logs/deploy/deploy_20260419_161625.tenant_schema_sync.json`
  - Tenant index headroom report: `/var/www/skupervisor/logs/deploy/deploy_20260419_161625.tenant_index_headroom.json`
  - PM2 reload + backend/runtime/public endpoint checks passed.

## Branch Consolidation Outcome
- Remote branches deleted (fully merged): `origin/Creatives`, `origin/scaling`.
- Local branches deleted (fully merged): `Creatives`, `feat/compliance-clean`, `integration/preserve-validated-behavior`, `safety/pre-sync-2026-04-06`, `scaling`.
- Remaining local branches:
  - `master` (active)
  - `hotfix/ims-pos-403-ux` (checked out in linked worktree; not force-removed here)
  - `backup/all-dirty-2026-04-07` (snapshot branch; intentionally retained)
  - `wip/parallel-changes` (contains local-only commit; intentionally retained)

## Residual Gap
- Separate QA and Staging deployment targets are not currently discoverable from the configured deploy infrastructure (only production host is configured in active runbooks/scripts).  
- To fully satisfy multi-environment rollout policy, add explicit QA/Staging hosts/profiles and repeat the same commit-pinned deploy evidence workflow per environment.
