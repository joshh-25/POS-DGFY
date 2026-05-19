# Deployment Guide - SKU Inventory Manager

## Purpose
Canonical production deployment runbook for `/var/www/skupervisor`.

Use this guide for:
1. Standard deploys via `scripts/deploy.sh`
2. Recovery from deploy gate failures
3. Post-deploy verification

Hosting profile reference:
- `docs/ops/HOSTING_PROFILES.md`

Namecheap shared hosting GitHub Actions lane:
- `docs/ops/NAMECHEAP_SHARED_CICD.md`

No-staging release policy reference:
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md`

## Prerequisites
- SSH access to server (`root@192.53.116.33 -p 64428`)
- Prefer key-based SSH auth for non-interactive deploys:
  ```bash
  ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
  ```
- Clean local git state for the commit you intend to deploy
- Required backend env vars present on server in `backend/.env`:
  - `HOSTING_PROFILE` (`shared` or `vps`)
  - `DB_HOST`
  - `DB_USER`
  - `DB_NAME`
  - `JWT_SECRET`
  - `REFRESH_TOKEN_SECRET`
  - `CORS_ORIGIN`
  - `AUTH_BLACKLIST_FAILURE_MODE`
  - `TEMP_FILE_STORAGE`
  - `TENANT_REGISTRATION_APPROVAL_MODE` (`auto_standard` by default; `manual` only for explicit admin-review rollback)
  - `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS`
  - `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`
  - `REDIS_URL` when `HOSTING_PROFILE=vps`
  - Payment-provider config only when `PAYMENTS_ENABLED=true`
- Current production `CORS_ORIGIN` must include every public IMS/POS/storefront domain that calls backend APIs directly:
  - `https://skupervisor.surebizcorp.com`
  - `https://surebizcorp.com`
  - `https://pos.surebizcorp.com`
  - `https://store.surebizcorp.com`
  - `https://skupervisor.dgfy.ph`
  - `https://pos.dgfy.ph`
  - `https://dgfy.ph`
  - `https://store.dgfy.ph`
  - `https://staging.dgfy.ph` (staging IMS — added 2026-05-19)
- Optional deploy override:
  - `DEPLOY_RUN_BILLING_VERIFY=auto|0|1` (default `auto`)
    - `auto`: billing checks run only when `PAYMENTS_ENABLED=true`
    - `0`: billing checks always skipped
    - `1`: force billing checks even if payments are disabled

## Standard Deployment (Simplified)
For Namecheap shared hosting, use the artifact-based GitHub Actions lane in `docs/ops/NAMECHEAP_SHARED_CICD.md`. That lane deploys with FTP plus cPanel Node.js App, uses `backend/app.js` as the startup shim, restarts through Passenger `tmp/restart.txt`, and blocks backend deploys when migrations changed.

Before deploying to a new host type, validate the selected profile:

```bash
# Shared hosting without Redis
npm run preflight:shared
npm run test:hosting:shared

# Redis-capable VPS
npm run preflight:vps
npm run test:hosting:vps
```

Shared hosting uses `backend/.env.shared.example` and `frontend/.env.shared.example` as templates. VPS/Redis hosting uses `backend/.env.vps.example` and `frontend/.env.vps.example` as templates. Do not leave placeholder secrets or `DB_AUTO_SYNC=true` in production.

Tenant registration rollout note:
1. Keep `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` for the default public company registration flow.
2. Verify public registration rate limits are present and strict before deploy because accepted registrations provision isolated tenant databases.
3. Set `TENANT_REGISTRATION_APPROVAL_MODE=manual` only when intentionally restoring platform-admin review before provisioning; keep `PAYMENTS_ENABLED=false` billing-disabled behavior unchanged unless payment workflows are being intentionally re-enabled.

Run on the production server for a one-command deploy:

```bash
cd /var/www/skupervisor
npm run deploy:auto
```

Required before production (no-staging hard gate):
```bash
# Required QA inputs:
# export QA_BASE_URL="https://<qa-host>"
# export QA_DEPLOY_SUMMARY_FILE=".tmp/release-gates/<sha>/qa_deploy_summary.txt"
RELEASE_TARGET_SHA="<target_sha>" npm run gate:release:no-staging
```

Recommended local setup (keeps gate inputs consistent across runs):
```bash
cp .env.qa.local.example .env.qa.local
# fill values, then load them into your shell before deploy/gates
```

Recommended local secret overlay (gitignored):
```bash
cp .env.qa.secrets.local.example .env.qa.secrets.local
# put QA_COMPANY_TOKEN and optional QA_AUTH_JWT here
```

Recommended local setup for production contract gate inputs:
```bash
cp .env.prod.local.example .env.prod.local
# set PROD_COMPANY_TOKEN to active production tenant token
```

Production release contract gate (run before and after deploy):
```bash
# Optional: avoid auth/login lockouts by reusing an active JWT session
# export PROD_AUTH_JWT="<valid_jwt>"
npm run gate:release:prod-contracts
# or load .env.prod.local first, then run the same gate
npm run gate:release:prod-contracts:env
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

### Remote Deploy Trigger (Local)
For operator flow via local machine:
```bash
bash scripts/deploy-remote.sh
```

Behavior:
1. Pushes target commit.
2. Runs no-staging preflight (`npm run gate:release:no-staging:preflight`) before push when `DEPLOY_ENFORCE_NO_STAGING_GATE=1`.
3. Auto-fetches QA deploy summary evidence (`npm run evidence:qa:deploy-summary`) when local summary file is missing.
4. Runs no-staging hard gate (`npm run gate:release:no-staging`) for pushed SHA.
5. Proceeds to production SSH deploy only when gate verdict is pass/bypassed.
6. Auto-loads `.env.qa.local` and `.env.qa.secrets.local` if present.

No-staging preflight checks:
1. `QA_BASE_URL` configured (for QA smoke contract).
2. `QA_SSH_HOST` configured (for QA drills/evidence fetch).
3. Local runtime has `ssh` and `powershell`/`pwsh`.
4. QA deploy summary can be sourced (existing local file or SSH fetch path).

### QA Gate Input Hygiene (Recommended)
Before running `gate:release:no-staging` or `deploy-remote.sh`:
1. Set `QA_COMPANY_TOKEN` to an active tenant token in QA.
2. Ensure `QA_EMAIL`/`QA_PASSWORD` belongs to that same tenant context.
3. Refresh deploy summary evidence so `deployed_head` matches your `RELEASE_TARGET_SHA`:
```bash
# PowerShell
powershell -ExecutionPolicy Bypass -File scripts/load-qa-env.ps1 -EnvFile .env.qa.local
$env:RELEASE_TARGET_SHA="<target_sha>"
powershell -ExecutionPolicy Bypass -File scripts/fetch-qa-deploy-summary.ps1
```

Optional strictness:
1. Set `RELEASE_ENFORCE_PREDEPLOY_SUMMARY_SHA_MATCH=1` when you need hard fail on pre-deploy summary SHA mismatch.

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
3. Installs deterministic dependencies (`npm ci`) with bounded retry/backoff
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
    - Hosting capability status is available at `/health`, `/api/v1/health`, and Admin > Hosting.
    - In `shared` mode, Redis absence is expected and should be visible as an optional/degraded capability, not a failed deploy by itself.
    - In `vps` mode, configured but disconnected Redis is a degraded runtime and should block production-ready sign-off.
14. Verifies public endpoints (unless `DEPLOY_VERIFY_PUBLIC_ENDPOINTS=0`):
  - `https://skupervisor.surebizcorp.com`
  - `https://pos.surebizcorp.com`
  - `https://surebizcorp.com`
  - `https://surebizcorp.com/tenant-store`
  - `https://skupervisor.dgfy.ph`
  - `https://pos.dgfy.ph`
  - `https://dgfy.ph`
  - `https://store.dgfy.ph`
15. Verifies served frontend entry asset parity against freshly built artifacts for IMS, POS, and Tenant Store

Deployment evidence files:
- `logs/deploy/deploy_<timestamp>.log`
- `logs/deploy/deploy_<timestamp>.changed_files.txt`
- `logs/deploy/deploy_<timestamp>.summary.txt`
- `logs/deploy/deploy_<timestamp>.tenant_schema_sync.json`
- `.deploy-state/last_deployed_commit` (runtime marker, not source-controlled)

Tenant sync baseline file (repo-tracked):
- `backend/config/deploy/tenant-schema-sync-failure-baseline.json`

Tenant schema/index risk controls:
- `DEPLOY_TENANT_SCHEMA_SYNC_MODE=report|alter` (default: `report`)
- `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=0|1` (default: `1`; set `0` only for controlled exception windows)
- `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=0|1` (default: `1`; set `0` only for controlled exception windows)

Deterministic install retry controls:
- `DEPLOY_NPM_CI_RETRIES=<n>` (default: `3`)
- `DEPLOY_NPM_CI_RETRY_DELAY_SECONDS=<n>` (default: `5`)

Frontend asset parity controls:
- `DEPLOY_FRONTEND_ASSET_PARITY_STRICT=0|1` (default: `1`)
  - `1`: fail deployment on public/local asset hash mismatch.
  - `0`: log warning and continue (incident-only override).

Windows lock cleanup controls:
- `DEPLOY_WINDOWS_LOCK_CLEANUP=auto|0|1` (default: `auto`)
  - `auto`: enable cleanup only on Windows runtimes.
  - `0`: disable cleanup.
  - `1`: force-enable cleanup.
- `DEPLOY_WINDOWS_LOCK_CLEANUP_DELAY_SECONDS=<n>` (default: `2`)
  - cooldown after terminating lock-holding `node`/`esbuild` processes before retrying `npm ci`.

Deep verification controls (`--verify`):
- `DEPLOY_VERIFY_TENANT_NAME=<tenant name>` (default: `Premium Corp`)
- `DEPLOY_VERIFY_TENANT_TOKEN=<company token>` (optional explicit selector)
- `DEPLOY_VERIFY_SKIP_IF_MISSING=0|1` (default: `1`, skip deep verify if tenant is absent)

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

## If QA Drill Checks Fail Due to SSH Warning Text
Symptom:
- `qa.rollback.exception` or `qa.restore.exception` includes a warning banner instead of a real SSH failure.

Current behavior:
1. QA drill scripts now run SSH with explicit quiet options to suppress warning-only stderr noise.
2. If you still see this, upgrade OpenSSH and verify host-level SSH policy.

## If `npm ci` Fails with `EPERM` or File Lock
Common cause:
- Transient file lock on dependency binaries (for example `esbuild.exe`) in Windows or shared runners.

Recovery:
1. Re-run deploy; script retries `npm ci` automatically.
2. If still failing, stop processes that hold `node_modules` binaries, then re-run.
3. Keep deterministic installs enabled; do not switch to `npm install` during production deploy.

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
The canonical PM2 entrypoint is the root `ecosystem.config.cjs`. It defines the four production processes and two staging processes:

**Production processes (`--env production`):**
1. `sku-backend` on port `5000`
2. `sku-frontend` on port `5173`
3. `sku-pos-frontend` on port `5174`
4. `sku-store-frontend` on port `5175`

**Staging processes (`--env staging`, serving `staging.dgfy.ph`):**
5. `sku-staging-backend` on port `5002`
6. `sku-staging-frontend` (SKUpervisor IMS) on port `5183`

`ecosystem.config.cjs` includes non-secret production defaults for the VPS profile:

```env
NODE_ENV=production
HOSTING_PROFILE=vps
HOSTING_INSTANCE_COUNT=1
AUTH_BLACKLIST_FAILURE_MODE=fail_closed
TEMP_FILE_STORAGE=auto
STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED=true
CUSTOMER_ACCESS_MODES_ENABLED=true
TENANT_REGISTRATION_APPROVAL_MODE=auto_standard
PAYMENTS_ENABLED=false
DB_AUTO_SYNC=false
```

Secrets and host-specific values still belong in `backend/.env`; do not put database passwords, JWT secrets, SMTP credentials, payment credentials, or Redis credentials in the ecosystem file. Generate dotenv-safe secrets without `#` or unquoted shell metacharacters, or quote them explicitly, because dotenv treats inline `#` as comment syntax.

Use ecosystem reload flow (already handled by deploy script):

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```

Do not use `pm2 restart all` as primary deployment strategy.

After manual PM2 changes, verify production:

```bash
pm2 list
pm2 describe sku-backend
pm2 env sku-backend | grep '^CORS_ORIGIN'
curl -fsS http://127.0.0.1:5000/health
curl -fsS http://127.0.0.1:5173
curl -fsS http://127.0.0.1:5174
curl -fsS http://127.0.0.1:5175
curl -fsS -H "Host: dgfy.ph" http://127.0.0.1:5175/ >/dev/null
```

After staging PM2 changes, verify staging:

```bash
pm2 describe sku-staging-backend
pm2 env sku-staging-backend | grep '^CORS_ORIGIN'
curl -fsS http://127.0.0.1:5002/health
curl -fsS http://127.0.0.1:5183
```

If the browser shows `Blocked request. This host ("dgfy.ph") is not allowed. To allow this host, add "dgfy.ph" to preview.allowedHosts in vite.config.js`, Nginx is already reaching Vite but the Storefront preview process is running stale or incomplete config. Verify the deployed checkout is current, confirm `frontend/apps/store/vite.config.js` includes `dgfy.ph` and `store.dgfy.ph` in `allowedHosts`, then restart `sku-store-frontend` with `pm2 restart sku-store-frontend --update-env` and `pm2 save`.

If DGFY browser logins show `404` for `/api/v1/...` while the frontend page itself loads, verify the DGFY Nginx virtual host is proxying `/api` and `/uploads` to the active backend port `127.0.0.1:5001`. A proxy target of `127.0.0.1:5000` can route to the wrong local service and return empty 404s for valid backend routes such as `/api/v1/auth/lookup` and `/api/v1/admin/login`.

If IMS Settings storefront cover/profile uploads fail with `413 Payload Too Large`, verify the active Nginx config includes the deploy-managed upload guard:

```bash
nginx -T | grep -n "client_max_body_size"
```

The production deploy writes `/etc/nginx/conf.d/skupervisor-client-body-size.conf` with `client_max_body_size 8m;`. Backend storefront asset validation still enforces the 5 MiB image-file limit; the Nginx value is higher only to allow multipart overhead to reach the backend.

## Hosting Profile Verification
After every deploy or rollback:
1. Open `/health` or `/api/v1/health`.
2. Confirm `capabilities.hostingProfile` matches the intended host.
3. For shared mode, expected values include:
   - `redis.configured=false`
   - `redis.connected=false`
   - `tokenBlacklist.mode=fail_open`
   - `tempFileStorage.mode=local`
   - `rateLimitStore.mode=memory`
   - `schedulerLock.mode=single_instance`
4. For VPS mode, expected values include:
   - `redis.configured=true`
   - `redis.connected=true`
   - `tokenBlacklist.mode=fail_closed`
   - `tempFileStorage.mode=cache` when Redis is connected
   - `rateLimitStore.mode=redis`
   - `schedulerLock.mode=distributed`
5. Open Admin > Hosting and use the readiness checklist, runbook actions, and copyable diagnostics before declaring the environment ready.

## Staging Environment

`staging.dgfy.ph` is a manually-managed VPS environment for pre-production QA. It is **not** part of the automated CI/CD pipeline (see `docs/ops/NO_STAGING_RELEASE_STANDARD.md`).

### Port Assignments

| Service | Production | Staging |
|---|---|---|
| Backend API | 5001 (nginx → 5000) | 5002 |
| IMS (SKUpervisor) frontend | 5173 | 5183 |
| POS frontend | 5174 | — |
| Storefront frontend | 5175 | — |

### Starting the Staging Processes

Staging reads secrets from `backend/.env` by default. Override the database by setting `DB_NAME` (and related credentials) in the `env_staging` block of `ecosystem.config.cjs`, or use a separate env file loaded before PM2 start.

```bash
cd /var/www/skupervisor
pm2 start ecosystem.config.cjs --only sku-staging-backend,sku-staging-frontend --env staging
pm2 save
```

### Nginx

The staging virtual host is defined alongside production in `nginx/dgfy.ph.conf` (server block for `staging.dgfy.ph`). Deploy and reload:

```bash
sudo cp nginx/dgfy.ph.conf /etc/nginx/sites-available/dgfy.ph
sudo nginx -t && sudo systemctl reload nginx
```

### SSL

Add `staging.dgfy.ph` to the certbot renewal:

```bash
sudo certbot --nginx -d skupervisor.dgfy.ph -d pos.dgfy.ph -d dgfy.ph -d store.dgfy.ph -d staging.dgfy.ph
```

### What Is NOT Covered by Staging

- POS and Storefront staging subdomains are not configured. Add `sku-staging-pos-frontend` (port 5184) and `sku-staging-store-frontend` (port 5185) to `ecosystem.config.cjs` and a corresponding server block in `nginx/dgfy.ph.conf` if needed.
- Staging is not verified by `deploy.sh` public endpoint checks. Run manual curl checks after each staging deploy.

## Endpoint Targets
- IMS: `https://skupervisor.surebizcorp.com`
- POS: `https://pos.surebizcorp.com`
- Storefront: `https://surebizcorp.com`
- Tenant Store: `https://surebizcorp.com/tenant-store`
- Staging IMS: `https://staging.dgfy.ph`

## Force Non-Compliant Observability
Backend now emits structured log signatures for force-mode operations:
- `"[Compliance][ForceNonCompliant] Blocked request {...}"` with `status_code` and `reason_code`
- `"[Compliance][ForceNonCompliant] Applied {...}"` on successful downgrade

Recommended alert:
1. Trigger investigation when repeated `status_code:422` blocked events occur for this operation in a short window (UI/backend state drift signal).

## Multi-Location Production Smoke Contract
Script: `scripts/verify-prod-multi-location.ps1`

Supported environment variables:
1. `PROD_COMPANY_TOKEN` (default `token-original`)
2. `PROD_EMAIL` (default `admin@test.com`)
3. `PROD_PASSWORD` (default `Admin123!`)
4. `PROD_AUTH_JWT` (optional; bypasses login to avoid rate limits)
5. `PROD_VERIFY_OUTPUT` (optional output JSON path; default `.tmp/prod-multi-location-check.result.json`)

Operational note:
1. `token-original` is a legacy fallback only. If the production tenant token has rotated, set `PROD_COMPANY_TOKEN` explicitly (or use `npm run gate:release:prod-contracts:env`) to avoid `TENANT_TOKEN_INVALID` false negatives.

Pass criteria:
1. Item detail payload includes `item_location_stocks`.
2. Stock movement CSV headers include `Location` (or `Movement Location`), `Source Location`, and `Destination Location`.
3. Expiry report CSV headers include `Location`.

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
