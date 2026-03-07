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
8. Skips legacy maintenance hooks by default
9. Repairs required indexes (`npm run repair:indexes`)
10. Runs strict index audit (`npm run audit:indexes`)
11. Runs strict billing-funnel audit (`npm run audit:billing-funnel`)
12. Runs tenant schema sync
13. Reloads PM2 and runs health checks

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

## 6. `backend/scripts/sync-tenant-schemas.js`
Attempts `sequelize.sync({ alter: true })` for active tenant databases.

Usage:
```bash
cd backend
node scripts/sync-tenant-schemas.js
```

Note:
- Logs and continues when a stale tenant points to a non-existent DB.

## 7. Legacy Recovery Scripts
These scripts exist for recovery, not normal deploy flow:
- `backend/scripts/surgical_migrate.js`
- `backend/scripts/deploy_fix_precision.js`
- `backend/scripts/deploy_fix_precision_v2.js`
- `backend/scripts/register_legacy_tenant.js`

Run only with explicit intent and verified backup.

## 8. Fast Troubleshooting
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
