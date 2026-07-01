# Production Deployment Checklist

Use this checklist for every production rollout.

Development-to-production promotion is governed by `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`. Developers open PRs into `staging`; `master` is production-only and is updated through the governed promotion PR.

## 0. One-Time Access Setup (Per Operator Machine)
- [ ] Configure SSH key-based access for production deploy user.
- [ ] Confirm server allows key auth (`pubkeyauthentication yes`).
- [ ] Verify non-interactive login works:
  ```bash
  ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
  ```

## 1. Pre-Deployment (Local)
- [ ] All intended code/docs changes are committed
- [ ] Local worktree is clean; local-only changes are not deployable:
  ```bash
  git status --short
  RELEASE_TARGET_SHA="$(git rev-parse HEAD)" npm run check:deploy-source-contract -- --target-sha "$(git rev-parse HEAD)" --skip-remote-match
  ```
- [ ] Changes are pushed to the remote branch you will deploy
- [ ] Staging qualification and exact master requalification are green
- [ ] Batch inventory exists for the exact target SHA and all batches are `ship`:
  ```bash
  npm run check:batch-inventory -- --base origin/master --head "<target_sha>" --write --require-ship --inventory ".tmp/release-gates/<target_sha>/batch_inventory.json" --markdown ".tmp/release-gates/<target_sha>/batch_inventory.md"
  npm run validate:batch-inventory -- --inventory ".tmp/release-gates/<target_sha>/batch_inventory.json" --base origin/master --head "<target_sha>" --require-ship
  ```
- [ ] Local production PM2 preview is healthy when using the VPS profile:
  ```bash
  npm run preflight:vps
  npm run doctor:runtime
  pm2 startOrReload ecosystem.config.cjs --env production --update-env
  pm2 save
  ```
- [ ] Confirm PM2 is using `ecosystem.config.cjs` as the only production ecosystem file. The old two-process `ecosystem.prod.config.cjs` shape is obsolete and must not be used.
- [ ] No-staging hard gate passes for the exact target SHA:
  ```bash
  # Required QA inputs:
  # export QA_BASE_URL="https://<qa-host>"
  # export QA_DEPLOY_SUMMARY_FILE=".tmp/release-gates/<sha>/qa_deploy_summary.txt"
  RELEASE_TARGET_SHA="<target_sha>" npm run gate:release:no-staging
  ```
- [ ] If this release adopts PR, branch, or `merge-docs/` behavior, merge-adoption proof passes:
  ```bash
  MERGE_ADOPTION_MANIFEST="path/to/merge-adoption.json" RELEASE_TARGET_SHA="<target_sha>" npm run gate:release:no-staging
  ```
- [ ] For high-risk Storefront, checkout, DGFY auth, tracking, customer dashboard, Store API, or customer-order changes, the release verdict must show `merge.adoption.required` passing. `merge.adoption.not_required` is valid only when the required-proof gate found no high-risk changes.
- [ ] Payment-sensitive changes are excluded or explicitly approved for payment release. PayMongo live split checkout remains blocked unless ADR 0027 provider-confirmation requirements are met.
- [ ] QA target proof is real, isolated, and not production:
  ```bash
  RELEASE_TARGET_SHA="<target_sha>" npm run check:qa-target-proof -- --target-sha "<target_sha>" --summary ".tmp/release-gates/<target_sha>/qa_deploy_summary.txt" --report ".tmp/release-gates/<target_sha>/qa_target_proof.json"
  ```
- [ ] Production multi-location contract smoke gate is green:
  ```bash
  # one-time local setup
  # cp .env.prod.local.example .env.prod.local
  # set PROD_COMPANY_TOKEN to active production tenant token
  npm run gate:release:prod-contracts:env
  # or run directly if env is already exported in shell
  # Prefer cached JWT to avoid auth rate limits:
  # export PROD_AUTH_JWT="<valid_jwt>"
  npm run gate:release:prod-contracts
  ```

## 2. Server Prep
- [ ] SSH to server
- [ ] Go to project root: `cd /var/www/skupervisor`
- [ ] Confirm server working tree is clean:
  ```bash
  git status --short
  ```
- [ ] Resolve target commit:
  ```bash
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch origin "$BRANCH"
  EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
  ```
- [ ] Optional sanity check for deploy script parseability:
  ```bash
  bash scripts/deploy.sh --help
  ```

If server worktree is not clean, snapshot and stash before deploy:
```bash
STAMP=$(date +'%Y%m%d_%H%M%S')
mkdir -p /root/deploy-prep
git status --short > /root/deploy-prep/status_$STAMP.txt
git diff > /root/deploy-prep/working_$STAMP.patch || true
git diff --cached > /root/deploy-prep/index_$STAMP.patch || true
git stash push -u -m "predeploy-$STAMP"
```

## 3. Run Deployment
- [ ] Execute:
  ```bash
  bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
  ```

Notes:
- Strict tenant gates are on by default:
  - `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`
  - `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`
- **Key Limit Fix**: If schema sync fails with "Too many keys", run:
  ```bash
  node backend/scripts/cleanup-duplicate-indexes.js
  ```
- **Seeding Quality Data**: To reset the QA environment with 100% verified data:
  ```bash
  node backend/scripts/seed_qa_data.js
  ```
- Strict gates must pass:
  - `npm run audit:indexes`
- Frontend builds included by deploy script:
  - `build:skupervisor`
  - `build:pos`
  - `build:store` (root-scoped Storefront build for `/map-dgfy` and `/:store_tenant_slug`; legacy `/tenant-store/*` remains compatibility only)

Optional deep verification gate:
```bash
DEPLOY_VERIFY_TENANT_NAME="Premium Corp" DEPLOY_VERIFY_SKIP_IF_MISSING=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --verify
```

If using local one-command remote deploy:
```bash
# This command now runs no-staging hard gate after push and before prod SSH deploy.
# It refuses dirty local worktrees even with --yes.
bash scripts/deploy-remote.sh
```

If using CI production deployment:
```bash
RELEASE_TARGET_SHA="<origin_master_sha>" npm run deploy:prod:ci
```

Dry-run CI deployment:
```bash
PRODUCTION_DEPLOY_DRY_RUN=1 RELEASE_TARGET_SHA="<origin_master_sha>" npm run deploy:prod:ci
```

CI deployment must remain disabled until branch protection, exact master SHA qualification, failure simulations, and a distinct QA target are proven. The workflow file is `.github/workflows/deploy-production.yml`.

## 4. If Lock Error Appears
- [ ] Check active deploy process:
  ```bash
  ps -ef | grep deploy.sh | grep -v grep
  ```
- [ ] If no process exists, clear stale lock and rerun with:
  ```bash
  rm -f /tmp/skupervisor_deploy.lock
  DEPLOY_REEXECED=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
  ```

## 5. Post-Deploy Verification
- [ ] `pm2 list` shows services online
- [ ] `GET /health` returns healthy status with expected production capability values:
  - [ ] `environment=production`
  - [ ] `capabilities.hostingProfile=vps`
  - [ ] `capabilities.redis.configured=true`
  - [ ] `capabilities.redis.connected=true`
  - [ ] `capabilities.tokenBlacklist.mode=fail_closed`
  - [ ] `capabilities.rateLimitStore.mode=redis`
  - [ ] `capabilities.schedulerLock.mode=distributed`
- [ ] Login and critical flows work
- [ ] Re-run production multi-location contract smoke gate:
  ```bash
  npm run gate:release:prod-contracts:env
  # or run directly if env is already exported in shell
  # Use fresh token or cached JWT from active session
  npm run gate:release:prod-contracts
  ```
- [ ] Public endpoints respond with 2xx/3xx:
  - [ ] `https://skupervisor.surebizcorp.com`
  - [ ] `https://pos.surebizcorp.com`
  - [ ] `https://surebizcorp.com`
  - [ ] `https://surebizcorp.com/map-dgfy`
  - [ ] `https://skupervisor.dgfy.ph`
  - [ ] `https://pos.dgfy.ph`
  - [ ] `https://dgfy.ph`
  - [ ] `https://store.dgfy.ph`
- [ ] Backend CORS allows each public DGFY origin:
  ```bash
  curl -sS -D - -o /dev/null https://skupervisor.dgfy.ph/api/v1/health -H "Origin: https://store.dgfy.ph"
  ```
- [ ] Public upload assets proxy correctly on all surfaces:
  - [ ] `https://skupervisor.surebizcorp.com/uploads/...` returns `200 image/*`
  - [ ] `https://pos.surebizcorp.com/uploads/...` returns `200 image/*`
  - [ ] `https://surebizcorp.com/uploads/...` returns `200 image/*`
  - [ ] `https://skupervisor.dgfy.ph/uploads/...` returns `200 image/*`
  - [ ] `https://pos.dgfy.ph/uploads/...` returns `200 image/*`
  - [ ] `https://dgfy.ph/uploads/...` returns `200 image/*`
- [ ] Storefront asset URLs from both root storefront domains resolve correctly:
  - [ ] `https://surebizcorp.com/map-dgfy`
  - [ ] `https://dgfy.ph/map-dgfy`
  - [ ] At least one visible tenant root handle, for example `https://dgfy.ph/<store_tenant_slug>`
  - [ ] Legacy compatibility path, for example `https://dgfy.ph/tenant-store/<store_tenant_slug>`, redirects/canonicalizes to the root handle after profile resolution
  - [ ] JS bundle URL returns JavaScript (not HTML fallback)
  - [ ] Manifest URL returns manifest/json (not HTML fallback)
- [ ] Root storefront Nginx for `surebizcorp.com` and `dgfy.ph` serves `/map-dgfy`, root tenant handles, and legacy `/tenant-store/*` compatibility paths through the Storefront app shell before proxying to `127.0.0.1:5175`
- [ ] Latest deploy summary exists under `logs/deploy/`
- [ ] Summary commit matches target commit:
  ```bash
  ls -1t logs/deploy/deploy_*.summary.txt | head -1 | xargs -I{} tail -n 30 {}
  ```
- [ ] Latest production deployment contract exists and passed:
  ```bash
  ls -1t logs/deploy/deploy_*.production_contract.json | head -1 | xargs -I{} cat {}
  ```
- [ ] Latest frontend build manifest exists for the deployed SHA:
  ```bash
  ls -1t logs/deploy/deploy_*.frontend_build_manifest.json | head -1 | xargs -I{} cat {}
  ```
- [ ] `qa.deploy.summary.sha_match` passes for the exact production target SHA. A stale QA deploy summary blocks normal release.
- [ ] If `MERGE_ADOPTION_MANIFEST` was used, `release_verdict.json` includes `merge_adoption_report_file` and the report is `pass`.
- [ ] Deployed-change accuracy review is complete for each shipped batch:
  ```bash
  npm run review:deployed-change-accuracy -- --inventory ".tmp/release-gates/<sha>/batch_inventory.json" --deploy-summary "<latest_summary_file>" --production-contract "<latest_contract_file>" --output ".tmp/release-gates/<sha>/deployed_change_accuracy.json" --markdown ".tmp/release-gates/<sha>/deployed_change_accuracy.md"
  ```
- [ ] Any batch marked `partially reflected`, `source-current only`, `deployed but behavior not proven`, `docs overclaim`, or `deployed but inaccurate` is fixed, explicitly deferred, or documented as residual risk.

## 6. If `npm ci` Fails with `EPERM`/File Lock
- [ ] Treat as transient lock unless repeated after retries.
- [ ] Re-run deploy (script now retries automatically with backoff).
- [ ] If lock persists on Windows/local runners, close processes holding `node_modules` binaries (commonly `esbuild.exe`) and re-run.
- [ ] Do not bypass `npm ci` unless incident commander approves.

## 7. Rollback (If Needed)
1. Revert safely with a new commit:
   ```bash
   git revert --no-edit <deployed_commit_sha>
   git push origin <branch>
   ```
2. Re-run deployment with pinned expected commit.
3. If server drift was stashed pre-deploy, inspect and re-apply intentionally:
   ```bash
   git stash list
   git stash show -p stash@{0}
   ```
