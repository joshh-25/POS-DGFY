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
4. Runs deterministic installs (`npm ci`)
5. Runs docs lint and architecture checks
6. Builds frontend
7. Runs DB migrations
8. Normalizes the original legacy tenant account path (idempotent)
9. Audits original legacy tenant invariants (strict; deploy fails on unresolved risks)
10. Skips optional legacy maintenance hooks by default
11. Repairs required indexes (`npm run repair:indexes`)
12. Runs strict index audit (`npm run audit:indexes`)
13. Runs strict billing-funnel audit (`npm run audit:billing-funnel`)
14. Runs tenant schema sync
15. Reloads PM2 and runs health checks

Optional flag:
```bash
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --run-legacy-hooks
```

Use `--run-legacy-hooks` only for targeted recovery.

## 2. `scripts/deploy-remote.sh`
Local convenience script that pushes to GitHub and triggers remote deploy over SSH.

Usage:
```bash
bash scripts/deploy-remote.sh
```

Notes:
- Operates on local `master` branch by design.
- Meant to run locally, not on the production server.

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

## 5. `backend/scripts/audit-billing-funnel.js`
Strict telemetry integrity gate for billing funnel events.

Usage:
```bash
cd backend
npm run audit:billing-funnel
```

Common failure:
- `webhook_without_telemetry` due to synthetic `test_webhook_*` rows in `webhook_logs`.

Cleanup example:
```bash
mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
```

## 6. `backend/scripts/cleanup-duplicate-indexes.js`
Removes duplicate indexes (e.g., `email_2`, `sku_code_3`) that accumulate from repeated Sequelize syncs and hit the MySQL 64-key limit.

Usage:
```bash
cd backend
node scripts/cleanup-duplicate-indexes.js
```

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
