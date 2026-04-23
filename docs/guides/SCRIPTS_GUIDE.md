# Scripts Guide

This guide documents operational scripts used in this repository.

## 1. `scripts/deploy.sh`
Production deployment pipeline run on the server.

Usage:
```bash
cd /var/www/skupervisor
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

What it does:
1. Validates required env vars in `backend/.env`
2. Pulls from git (fast-forward only)
3. Re-executes script after pull to use latest logic
4. Runs deterministic installs (`npm ci`) with bounded retry/backoff for transient lock failures
5. On Windows hosts, runs a pre-install process lock cleanup (terminates `node`/`esbuild` holders) before `npm ci` and between retries (configurable)
6. Runs docs lint and architecture checks
7. Builds frontend
8. Runs DB migrations
9. Normalizes the original legacy tenant account path (idempotent)
10. Audits original legacy tenant invariants (report-only by default; strict when `DEPLOY_STRICT_LEGACY_AUDIT=1`)
11. Skips optional legacy maintenance hooks by default
12. Repairs required indexes (`npm run repair:indexes`)
13. Runs strict index audit (`npm run audit:indexes`)
14. Runs billing telemetry checks only when billing checks are enabled (`PAYMENTS_ENABLED` + `DEPLOY_RUN_BILLING_VERIFY`)
15. Runs tenant schema sync in `report` mode and writes report artifact
16. Applies tenant schema sync regression gate against baseline
17. Runs tenant index headroom audit in strict mode by default
18. Reloads PM2 and runs runtime/public health checks
19. Runs public frontend asset parity checks for IMS/POS/Tenant Store and fails by default on hash mismatch

Important strict defaults:
- `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1` by default (set `0` only for controlled exception windows)
- `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1` by default (set `0` only for controlled exception windows)

Deterministic install retry controls:
- `DEPLOY_NPM_CI_RETRIES` (default `3`)
- `DEPLOY_NPM_CI_RETRY_DELAY_SECONDS` (default `5`)

Windows lock cleanup controls:
- `DEPLOY_WINDOWS_LOCK_CLEANUP=auto|0|1` (default `auto`)
  - `auto`: enabled only on Windows runtimes
  - `0`: disabled
  - `1`: forced enabled
- `DEPLOY_WINDOWS_LOCK_CLEANUP_DELAY_SECONDS` (default `2`)
  - short cooldown after terminating lock-holding processes before retrying `npm ci`

Billing verification mode override:
```bash
DEPLOY_RUN_BILLING_VERIFY=auto|0|1
```
- `auto` (default): run billing hooks only when `PAYMENTS_ENABLED=true`
- `0`: force skip billing hooks
- `1`: force run billing hooks

Frontend asset parity controls:
- `DEPLOY_FRONTEND_ASSET_PARITY_STRICT=1` (default)
  - `1`: fail deployment when served public asset hashes do not match freshly built artifacts
  - `0`: warn-only parity mode (incident/recovery use only)

Optional flag:
```bash
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --run-legacy-hooks
```

Use `--run-legacy-hooks` only for targeted recovery.

Deep verification controls (`--verify` mode):
- `DEPLOY_VERIFY_TENANT_NAME` (default `Premium Corp`)
- `DEPLOY_VERIFY_TENANT_TOKEN` (optional explicit tenant selector)
- `DEPLOY_VERIFY_SKIP_IF_MISSING=1` by default; deep verify skips cleanly when the target tenant is absent

Recommended by environment:
- QA: run `--verify` with seeded QA tenant data
- Staging/Production: run `--verify` only when a known verification tenant/dataset is available

## 2. `scripts/deploy-remote.sh`
Local convenience script that pushes to GitHub and triggers remote deploy over SSH.

Usage:
```bash
bash scripts/deploy-remote.sh
```

Notes:
- Operates on local `master` branch by design.
- Meant to run locally, not on the production server.
- Requires working SSH auth to production. Prefer key-based auth over password prompts.
- Enforces no-staging release hard gate by default after push and before production SSH deploy (`DEPLOY_ENFORCE_NO_STAGING_GATE=1`).
- Runs no-staging preflight before push (`npm run gate:release:no-staging:preflight`) when gate enforcement is enabled.
- Auto-fetches QA deploy summary evidence (`npm run evidence:qa:deploy-summary`) if local summary file is missing before hard gate execution.

One-time setup for persistent passwordless deploy access (per machine):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/skupervisor_deploy_ed25519 -C "skupervisor-deploy"
cat ~/.ssh/skupervisor_deploy_ed25519.pub | ssh -p 64428 root@192.53.116.33 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
```

Add local SSH config:
```sshconfig
Host skupervisor-prod
  HostName 192.53.116.33
  Port 64428
  User root
  IdentityFile ~/.ssh/skupervisor_deploy_ed25519
  IdentitiesOnly yes
```

Validate non-interactive auth:
```bash
ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
```

Server-side requirement (one-time):
```bash
sshd -T | grep pubkeyauthentication
```
Expected:
```text
pubkeyauthentication yes
```

## 2a. `scripts/check-frontend-asset-parity.js`
Asset parity guardrail script used by deploy.

Usage:
```bash
node scripts/check-frontend-asset-parity.js --label IMS --local-index dist-apps/skupervisor/index.html --public-url https://skupervisor.surebizcorp.com
node scripts/check-frontend-asset-parity.js --label POS --local-index dist-apps/pos/index.html --public-url https://pos.surebizcorp.com
node scripts/check-frontend-asset-parity.js --label "Tenant Store" --local-index dist-apps/store/index.html --public-url https://surebizcorp.com/tenant-store
```

Behavior:
- Compares local built entry script/CSS/manifest basenames against served public HTML refs.
- Returns non-zero on mismatch.
- Designed to catch stale frontend bundles served after deploy.

## 2b. `scripts/check-no-staging-prereqs.js`
Preflight validator for no-staging release gate prerequisites.

Usage:
```bash
RELEASE_TARGET_SHA=<sha> DEPLOY_ENFORCE_NO_STAGING_GATE=1 npm run gate:release:no-staging:preflight
```

Behavior:
- Fails fast before push/deploy when no-staging hard gate is enabled but required inputs are missing.
- Validates:
  - `QA_BASE_URL`
  - `QA_SSH_HOST`
  - `ssh` command availability
  - `powershell`/`pwsh` availability (used by QA gate wrapper scripts)
  - QA deploy summary source availability (local file or SSH-fetch path)

## 3. `backend/scripts/repair-required-indexes.js`
Self-heal script for required DB index contract.

Usage:
```bash
cd backend
npm run repair:indexes
```

Behavior:
- Audits required index contract
- Creates missing actionable indexes
- Re-audits and exits non-zero if still degraded

## 4. `backend/scripts/audit-indexes.js`
Strict schema index gate.

Usage:
```bash
cd backend
npm run audit:indexes
```

Exit code:
- `0`: healthy
- non-zero: degraded

Local readiness variants:
```bash
cd backend
npm run audit:indexes:local
npm run audit:indexes:local:apply-cleanup
```

Notes:
- `audit:indexes:local` is safe-by-default: runs test-tenant cleanup in dry-run mode, then audits with local/test-only exclusion settings.
- `audit:indexes:local:apply-cleanup` is destructive: removes stale `test_tenant_*` landlord rows/databases before audit and should only be used intentionally.

## 5. `backend/scripts/audit-billing-funnel.js`
Legacy script for subscription-billing telemetry integrity. Do not include this as a required deploy gate while `PAYMENTS_ENABLED=false`.

## 5a. `backend/scripts/sync-tenant-schemas.js`
Tenant schema sync audit script with machine-readable reporting.

Usage:
```bash
cd backend
node scripts/sync-tenant-schemas.js --report-file ../logs/deploy/tenant_schema_sync.json
node scripts/sync-tenant-schemas.js --mode report --report-file ../logs/deploy/tenant_schema_sync.json
node scripts/sync-tenant-schemas.js --mode alter --report-file ../logs/deploy/tenant_schema_sync.json
```

Report includes:
- per-tenant status
- normalized error code
- normalized message
- stable fingerprint
- summary counts

Notes:
- Default mode is `report` (connectivity + model load only, no `sync({ alter: true })`).
- `--mode alter` is legacy emergency mode and should be used only in controlled recovery windows.

## 5b. `backend/scripts/check-tenant-schema-sync-regressions.js`
Regression gate for tenant schema sync failures.

Usage:
```bash
cd backend
node scripts/check-tenant-schema-sync-regressions.js --report-file ../logs/deploy/tenant_schema_sync.json --baseline-file config/deploy/tenant-schema-sync-failure-baseline.json
node scripts/check-tenant-schema-sync-regressions.js --report-file ../logs/deploy/tenant_schema_sync.json --baseline-file config/deploy/tenant-schema-sync-failure-baseline.json --require-zero
```

Gate behavior:
- passes when failures are only known baseline signatures
- fails when new or mutated failure signatures appear
- logs resolved baseline signatures as informational output
- `--require-zero` additionally fails when any failure remains unresolved (use after debt cleanup)

## 5c. `backend/scripts/audit-tenant-index-headroom.js`
Per-tenant index headroom and redundant-index root-cause audit.

Usage:
```bash
cd backend
node scripts/audit-tenant-index-headroom.js --report-file ../logs/deploy/tenant_index_headroom.json
node scripts/audit-tenant-index-headroom.js --strict --report-file ../logs/deploy/tenant_index_headroom.json
```

Behavior:
- Enumerates landlord + active tenant databases.
- Audits per-table index counts against warning/critical thresholds.
- Detects redundant index groups with identical definitions.
- Emits machine-readable report for operational triage.

## 5d. `backend/scripts/remediate-tenant-redundant-indexes.js`
Safe redundant-index remediation planner/executor.

Usage:
```bash
cd backend
node scripts/remediate-tenant-redundant-indexes.js --report-file ../logs/deploy/tenant_index_remediation.json --sql-file ../logs/deploy/tenant_index_remediation.sql
node scripts/remediate-tenant-redundant-indexes.js --apply --yes --tenant-db sku_inventory_manager
```

Behavior:
- Dry-run by default (no DDL execution).
- Builds forward and rollback SQL statements for redundant index drops.
- `--apply` requires `--yes` for explicit confirmation.
- Supports tenant scoping with `--tenant-db`.

## 6. `backend/scripts/cleanup-duplicate-indexes.js`
Compatibility wrapper that now delegates to `remediate-tenant-redundant-indexes.js`.

Usage:
```bash
cd backend
node scripts/cleanup-duplicate-indexes.js
node scripts/cleanup-duplicate-indexes.js --apply --yes
```

Notes:
- Dry-run by default.
- Use `--apply --yes` for actual DDL execution.
- Prefer `remediate-tenant-redundant-indexes.js` directly for report/SQL artifact options.

## 7. `backend/scripts/seed_qa_data.js`
Resets the "Premium Corp" QA tenant with a 100% verified dataset for AI and business logic verification.

Usage:
```bash
cd backend
node scripts/seed_qa_data.js
```

## 8. Legacy Recovery Scripts
These scripts exist for recovery, not normal deploy flow:
- `backend/scripts/surgical_migrate.js`
- `backend/scripts/deploy_fix_precision.js`
- `backend/scripts/register_legacy_tenant.js`

Run only with explicit intent and verified backup.

## 9. `backend/scripts/register_original_tenant.js`
Idempotent legacy-account normalization script that promotes the recovered
legacy data path into the same tenant/user flow as regular accounts.

Usage:
```bash
cd backend
node scripts/register_original_tenant.js --dry-run
node scripts/register_original_tenant.js --apply
node scripts/register_original_tenant.js --apply --strict
```

Key behavior:
- Ensures landlord `tenants` row for the original legacy database exists and is active
- Ensures `user_tenant_mappings` exists for the configured legacy admin email
- Ensures the legacy tenant DB has an active admin user record with modern auth fields
- Defaults to non-destructive token behavior (`company_token` is not rotated unless explicitly allowed)

Important env overrides:
- `ORIGINAL_LEGACY_DB_NAME` (default: `sku_inventory_manager`)
- `ORIGINAL_LEGACY_COMPANY_TOKEN` (default: `token-original`)
- `ORIGINAL_LEGACY_TENANT_NAME` (default: `Original Legacy Data`)
- `ORIGINAL_LEGACY_ADMIN_EMAIL` (default: `admin@test.com`)
- `ORIGINAL_LEGACY_ADMIN_USERNAME` (default: inferred from admin email local-part)
- `ORIGINAL_LEGACY_ADMIN_PASSWORD` (used only when user creation/normalization needs a password source)
- `ORIGINAL_LEGACY_ACCOUNT_MODE` (`auto` or `required`; default: `auto`)
- `ORIGINAL_LEGACY_SCRIPT_MODE` (`apply` or `dry-run`; default: `apply`)
- `ORIGINAL_LEGACY_STRICT` (`true` to fail on warnings; default: `false`)
- `ORIGINAL_LEGACY_ALLOW_TOKEN_ROTATION` (`true` to force token alignment to `ORIGINAL_LEGACY_COMPANY_TOKEN`; default: `false`)

## 10. `backend/scripts/audit_original_legacy_account.js`
Read-only audit for legacy-account normalization readiness and drift detection.

Usage:
```bash
cd backend
node scripts/audit_original_legacy_account.js
node scripts/audit_original_legacy_account.js --strict
```

Key behavior:
- Verifies legacy DB existence
- Verifies tenant lookup consistency by `db_name` and `company_token`
- Verifies `user_tenant_mappings` coverage for configured legacy admin email
- Verifies legacy admin user exists in the legacy tenant DB
- Audits permission-shape drift across active tenant databases
- Prints machine-readable JSON summary with `findings` and `risks`
- In `--strict` mode, exits non-zero when any risk remains

## 11. `backend/scripts/audit-fifo-drift.js`
Strict multi-tenant FIFO consistency audit that compares `items.current_stock` versus
open FIFO batch availability and detects over-consumed batches.

Usage:
```bash
cd backend
npm run audit:fifo-drift
npm run audit:fifo-drift:repair
```

Behavior:
- Scans all active tenants from landlord `tenants` table.
- Fallbacks to `DB_NAME` when no active landlord tenant exists (local recovery mode).
- Flags as degraded when either condition is detected:
  1. `ABS(current_stock - open_batch_available) > FIFO_DRIFT_TOLERANCE`
  2. `fifo_batches.quantity_consumed > fifo_batches.quantity`
- Exits `0` when healthy, non-zero when degraded.

Optional env:
- `FIFO_DRIFT_TOLERANCE` (default `0.0001`)
- `FIFO_DRIFT_MAX_PRINT` (default `20`)

Repair mode:
- `npm run audit:fifo-drift:repair` inserts compensating FIFO batches only for positive
  drift (`current_stock > open_batch_available`), then re-audits.
- Negative drift (batch availability higher than `current_stock`) is never auto-fixed
  by this script and still returns degraded for manual investigation.

## 12. Fast Troubleshooting
If deploy appears stuck:
```bash
cd /var/www/skupervisor
LOG=$(ls -1t logs/deploy/deploy_*.log | head -1)
tail -f "$LOG"
```

If stale lock blocks deploy:
```bash
ps -ef | grep deploy.sh | grep -v grep
rm -f /tmp/skupervisor_deploy.lock
```

If deploy exits with `Working tree is not clean on server`:
```bash
cd /var/www/skupervisor
STAMP=$(date +'%Y%m%d_%H%M%S')
mkdir -p /root/deploy-prep
git status --short > /root/deploy-prep/status_$STAMP.txt
git diff > /root/deploy-prep/working_$STAMP.patch || true
git diff --cached > /root/deploy-prep/index_$STAMP.patch || true
git stash push -u -m "predeploy-$STAMP"
```

If deploy script errors with `$'\\r': command not found`:
```bash
cd /var/www/skupervisor
sed -i 's/\r$//' scripts/deploy.sh
bash scripts/deploy.sh --help
```

## 13. Local PM2 Startup Safety (Prevents Transient 500s)

When running locally with PM2:

```bash
pm2 start ecosystem.config.cjs
```

Use this backend env policy:

1. `NODE_ENV=development`
2. `DB_AUTO_SYNC=false` (default and recommended)

Reason:

- Auto schema mutation (`sequelize.sync({ alter: true })`) during app boot can hold metadata locks and cause temporary `500` responses while routes are already being hit.

Correct schema update workflow:

```bash
cd backend
npm run migrate
pm2 restart sku-backend
```

Quick triage checklist for startup 500s:

1. `pm2 logs sku-backend --lines 120 --nostream`
2. Confirm backend health: `curl http://localhost:5000/health`
3. Verify `DB_AUTO_SYNC` is not `true` in `backend/.env`
4. Hard-refresh frontend after backend restart

## 14. `scripts/check-compliance-impact.js`
Compliance-sensitive declaration gate used by local pre-commit and CI.

Usage:
```bash
npm run check:compliance
npm run check:compliance -- --staged
```

Behavior:
- Detects compliance-sensitive changed paths/surfaces.
- Requires declaration evidence in `docs/compliance/impact-declarations/*.md`.
- Enforces computed minimum classification floors.
- Enforces strict preflight metadata for `major|regulatory` declarations.

Related gate (executed as part of `npm run check:compliance`):
- `scripts/check-compliance-api-contracts.js`
  - Fails when compliance-sensitive runtime contracts drift from `docs/api/specification.md`.
  - Currently checks idempotency/replay fields, checklist evidence fields, and admin incident dispatch metadata fields.

## 15. `scripts/check-compliance-api-contracts.js`
Compliance-sensitive API contract/doc consistency gate.

Usage:
```bash
node scripts/check-compliance-api-contracts.js
npm run check:compliance
```

Behavior:
- Verifies key validator/runtime contract strings are present in docs for compliance-sensitive surfaces.
- Exits non-zero on missing doc/runtime pairs.
- Keeps doc updates coupled with runtime changes.

## 16. `backend/scripts/seed_compliance_activation_data.js`
Compliance readiness seed utility for non-production tenants. This script patches compliance profile fields and can optionally seed required settings, artifacts, and peripherals so checklist blockers can be validated deterministically.

Usage:
```bash
cd backend
npm run seed:compliance-activation -- --company-token=token-original --dry-run=true
npm run seed:compliance-activation -- --company-token=token-original --set-mode-pending=true
```

Optional flags:
- `--reference-file=path/to/payload.json` (defaults to embedded BIR/NPC reference payload)
- `--actor-user-id=<id>` (default `2`)
- `--readiness-passed=true|false`
- `--last-tested-at=YYYY-MM-DDTHH:mm:ss.sssZ`
- `--seed-settings=true|false`
- `--seed-artifacts=true|false`
- `--seed-peripherals=true|false`

Safety notes:
- Run `--dry-run=true` first to preview merged `compliance_profile`.
- Targeting is by `--company-token`; verify tenant/token mapping before apply.
- Script respects non-downgrade lifecycle behavior and will not demote `compliant_active`.

## 17. `scripts/verify-multi-location-contract.ps1`
Profile-based smoke/contract verifier for production or QA.

Usage:
```bash
powershell -ExecutionPolicy Bypass -File scripts/verify-multi-location-contract.ps1 -Profile prod
powershell -ExecutionPolicy Bypass -File scripts/verify-multi-location-contract.ps1 -Profile qa
```

Wrappers:
- `scripts/verify-prod-multi-location.ps1`
- `scripts/verify-qa-multi-location.ps1`

## 18. `scripts/run-qa-rollback-drill.ps1`
Rollback drill automation for QA with simulation-by-default mode.

Usage:
```bash
npm run drill:qa:rollback
# optional apply mode:
# QA_ROLLBACK_DRILL_APPLY=1 npm run drill:qa:rollback
```

Output:
- `.tmp/release-gates/<sha>/rollback_drill_result.json`

## 19. `scripts/run-qa-restore-drill.ps1`
Backup restore drill validator for QA with simulation-by-default mode.

Usage:
```bash
npm run drill:qa:restore
# optional apply mode:
# QA_RESTORE_DRILL_APPLY=1 QA_RESTORE_BACKUP_FILE=/path/to/backup.sql npm run drill:qa:restore
```

Output:
- `.tmp/release-gates/<sha>/restore_drill_result.json`

## 20. `scripts/gate-release-no-staging.js`
Hard-blocking release aggregator for environments without staging.

Usage:
```bash
RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging
```

Contract:
- fails when QA deploy summary, QA smoke, rollback drill, restore drill, or governance gates fail/mismatch.
- writes aggregated verdict:
  - `.tmp/release-gates/<sha>/release_verdict.json`

Emergency bypass (incident-only):
- `RELEASE_EMERGENCY_BYPASS=1`
- `RELEASE_EMERGENCY_REASON=...`
- `RELEASE_EMERGENCY_ACTOR=...`

## 21. `scripts/verify-release-verdict.js`
Validates release verdict artifact contract and SHA consistency.

Usage:
```bash
npm run verify:release-verdict -- --file .tmp/release-gates/<sha>/release_verdict.json --sha <sha>
```

## 22. `scripts/fetch-qa-deploy-summary.ps1`
Fetches latest QA deploy summary over SSH into local release evidence.

Usage:
```bash
RELEASE_TARGET_SHA=<sha> npm run evidence:qa:deploy-summary
```

Required environment:
1. `QA_SSH_HOST`
2. Optional: `QA_SSH_PORT`, `QA_SSH_USER`, `QA_DEPLOY_SUMMARY_REMOTE`, `QA_DEPLOY_SUMMARY_FILE`
