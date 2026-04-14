# Deployment Guide - SKU Inventory Manager

## Purpose
Canonical production deployment runbook for `/var/www/skupervisor`.

Use this guide for:
1. Standard deploys via `scripts/deploy.sh`
2. Recovery from deploy gate failures
3. Post-deploy verification

## Prerequisites
- SSH access to server (`root@192.53.116.33 -p 64428`)
- Prefer key-based SSH auth for non-interactive deploys:
  ```bash
  ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
  ```
- Clean local git state for the commit you intend to deploy
- Required backend env vars present on server in `backend/.env`:
  - `DB_HOST`
  - `DB_USER`
  - `DB_NAME`
  - `JWT_SECRET`
  - Payment-provider config only when `PAYMENTS_ENABLED=true`
- Optional deploy override:
  - `DEPLOY_RUN_BILLING_VERIFY=auto|0|1` (default `auto`)
    - `auto`: billing checks run only when `PAYMENTS_ENABLED=true`
    - `0`: billing checks always skipped
    - `1`: force billing checks even if payments are disabled

## Standard Deployment (Simplified)
Run on the production server for a one-command deploy:

```bash
cd /var/www/skupervisor
npm run deploy:auto
```

This command will:
1. Auto-detect your current branch.
2. Auto-detect the latest commit from origin.
3. Perform all safety audits and deployment steps automatically.

### Automated Verification Mode
To run a deep AI verification gate after deployment:

```bash
npm run deploy:verify
```

## Advanced Deployment (SHA Pinning)
If you need to ensure a specific commit is deployed (e.g., to prevent race conditions during parallel pushes):

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

What `deploy.sh` does:
1. Validates env requirements
2. Pulls fast-forward only
3. Installs deterministic dependencies (`npm ci`)
4. Runs docs lint and architecture gates
5. Builds frontend surfaces (`skupervisor`, `pos`, `store`)
6. Runs DB migrations
7. Skips legacy maintenance hooks by default
8. Runs required-index self-heal (`npm run repair:indexes`)
9. Runs strict index audit (`npm run audit:indexes`)
10. Runs billing verification/audit only when billing checks are enabled (`DEPLOY_RUN_BILLING_VERIFY` + `PAYMENTS_ENABLED`)
11. Runs tenant schema sync and emits machine-readable report
12. Applies tenant schema sync regression gate (`fail on new/mutated failures` vs baseline)
13. Reloads PM2 and verifies backend + IMS + POS + Store runtime health
14. Verifies public endpoints (unless `DEPLOY_VERIFY_PUBLIC_ENDPOINTS=0`):
  - `https://skupervisor.surebizcorp.com`
  - `https://pos.surebizcorp.com`
  - `https://surebizcorp.com`
  - `https://surebizcorp.com/tenant-store`

Deployment evidence files:
- `logs/deploy/deploy_<timestamp>.log`
- `logs/deploy/deploy_<timestamp>.changed_files.txt`
- `logs/deploy/deploy_<timestamp>.summary.txt`
- `logs/deploy/deploy_<timestamp>.tenant_schema_sync.json`
- `.deploy-state/last_deployed_commit`

Tenant sync baseline file (repo-tracked):
- `backend/config/deploy/tenant-schema-sync-failure-baseline.json`

## Legacy Hook Mode (Recovery Only)
Legacy hooks are intentionally disabled by default.

Enable only for targeted recovery:

```bash
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --run-legacy-hooks
```

## If Deploy Stops on Lock Error
Symptom:
- `Another deployment appears to be running (lock: /tmp/skupervisor_deploy.lock)`

Recovery:

```bash
cd /var/www/skupervisor
ps -ef | grep deploy.sh | grep -v grep
```

If no deploy process exists:

```bash
rm -f /tmp/skupervisor_deploy.lock
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
DEPLOY_REEXECED=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

## If Deploy Stops on `Working tree is not clean on server`
Snapshot and stash server drift before re-running deploy:

```bash
cd /var/www/skupervisor
STAMP=$(date +'%Y%m%d_%H%M%S')
mkdir -p /root/deploy-prep
git status --short > /root/deploy-prep/status_$STAMP.txt
git diff > /root/deploy-prep/working_$STAMP.patch || true
git diff --cached > /root/deploy-prep/index_$STAMP.patch || true
git stash push -u -m "predeploy-$STAMP"
```

After deployment, inspect stash entries intentionally before applying anything back:
```bash
git stash list
git stash show -p stash@{0}
```

## If Deploy Script Fails With `$'\\r': command not found`
Normalize shell line endings, then re-run:
```bash
cd /var/www/skupervisor
sed -i 's/\r$//' scripts/deploy.sh
bash scripts/deploy.sh --help
```

## If Billing-Funnel Audit Fails With `webhook_without_telemetry`
Common cause:
- synthetic rows in `webhook_logs` (for example `test_webhook_*` from old verification flow)

Cleanup:

```bash
mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
cd backend
npm run audit:billing-funnel
```

Audit must return healthy (`exit 0`) before deploy can complete when billing checks are enabled.

If your current business model has billing paused, keep `PAYMENTS_ENABLED=false` and leave `DEPLOY_RUN_BILLING_VERIFY=auto` (or set `0` explicitly) so billing hooks are skipped by policy.

## Tenant Schema Sync Regression Gate
Deploy now fails only when tenant schema sync introduces a new failure signature or mutates an existing baseline signature.

Operational workflow:
1. Review latest report: `logs/deploy/deploy_<timestamp>.tenant_schema_sync.json`
2. If failure is known/accepted, update `backend/config/deploy/tenant-schema-sync-failure-baseline.json` in Git with the new normalized fingerprint.
3. If failure is not expected, fix root cause and redeploy (do not baseline unknown regressions).

## Local-to-Production Safety Rules
1. Push your commit to GitHub first. Server deploy pulls from remote only.
2. Do not rely on uncommitted local files.
3. Prefer commit-pinned deploys (`--expect-commit`) to avoid drift.
4. Use `tail -f` on latest deploy log if terminal seems idle:

```bash
cd /var/www/skupervisor
LOG=$(ls -1t logs/deploy/deploy_*.log | head -1)
tail -f "$LOG"
```

## PM2 Notes
Use ecosystem reload flow (already handled by deploy script):

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```

Do not use `pm2 restart all` as primary deployment strategy.

## Endpoint Targets
- IMS: `https://skupervisor.surebizcorp.com`
- POS: `https://pos.surebizcorp.com`
- Storefront: `https://surebizcorp.com`
- Tenant Store: `https://surebizcorp.com/tenant-store`

### Nginx Path-Base Requirement (Tenant Store)
When store is hosted via Vite preview on port `5175` with base path `/tenant-store/`, Nginx must rewrite `/tenant-store/*` before proxying to `5175`.

Required behavior:
1. `location = /tenant-store` redirects to `/tenant-store/`
2. `location /tenant-store/` rewrites `^/tenant-store/(.*)$` to `/$1` before `proxy_pass http://127.0.0.1:5175`

Without this rewrite, tenant-store asset URLs (for example `/tenant-store/assets/*.js` and manifest) can return HTML fallback and cause blank-page + manifest syntax errors.

## Manual Fallback (Last Resort)
Use only if deploy script itself is broken:

```bash
cd /var/www/skupervisor
git pull --ff-only origin master
npm ci --no-audit --no-fund
cd backend && npm ci --no-audit --no-fund && npx sequelize-cli db:migrate && npm run repair:indexes && npm run audit:indexes && cd ..
cd frontend && npm ci --no-audit --no-fund && npm run build && cd ..
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```
