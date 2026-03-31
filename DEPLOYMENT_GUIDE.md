# Deployment Guide - SKU Inventory Manager

## Purpose
Canonical production deployment runbook for `/var/www/skupervisor`.

Use this guide for:
1. Standard deploys via `scripts/deploy.sh`
2. Recovery from deploy gate failures
3. Post-deploy verification

## Prerequisites
- SSH access to server (`root@192.53.116.33 -p 64428`)
- Clean local git state for the commit you intend to deploy
- Required backend env vars present on server in `backend/.env`:
  - `DB_HOST`
  - `DB_USER`
  - `DB_NAME`
  - `JWT_SECRET`
  - Payment-provider config (default deploy mode: PayMongo)
    - `PAYMONGO_MODE`
    - `PAYMONGO_STANDARD_PLAN_ID`
    - `PAYMONGO_PREMIUM_PLAN_ID`
    - mode-resolved key pair (`PAYMONGO_*_PUBLIC_KEY` + `PAYMONGO_*_SECRET_KEY` or generic fallback)
    - `PAYMONGO_WEBHOOK_SECRET`

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
10. Runs strict billing-funnel audit (`npm run audit:billing-funnel`)
11. Runs tenant schema sync
12. Reloads PM2 and verifies backend + IMS + POS + Store runtime health
13. Verifies public endpoints (unless `DEPLOY_VERIFY_PUBLIC_ENDPOINTS=0`):
  - `https://skupervisor.surebizcorp.com`
  - `https://pos.surebizcorp.com`
  - `https://surebizcorp.com`
  - `https://surebizcorp.com/tenant-store`

Deployment evidence files:
- `logs/deploy/deploy_<timestamp>.log`
- `logs/deploy/deploy_<timestamp>.changed_files.txt`
- `logs/deploy/deploy_<timestamp>.summary.txt`
- `.deploy-state/last_deployed_commit`

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

## If Billing-Funnel Audit Fails With `webhook_without_telemetry`
Common cause:
- synthetic rows in `webhook_logs` (for example `test_webhook_*` from old verification flow)

Cleanup:

```bash
mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
cd backend
npm run audit:billing-funnel
```

Audit must return healthy (`exit 0`) before deploy can complete.

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
cd backend && npm ci --no-audit --no-fund && npx sequelize-cli db:migrate && npm run repair:indexes && npm run audit:indexes && npm run audit:billing-funnel && cd ..
cd frontend && npm ci --no-audit --no-fund && npm run build && cd ..
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```
