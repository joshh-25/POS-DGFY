---
description: Deploy updates to production hosting server (skupervisor.surebizcorp.com)
---
// turbo-all

# Production Deployment Workflow

## Prerequisites
- SSH access to the hosting server (`root@hermes-cloud` / `root@192.53.116.33 -p 64428`)
- Git credentials for GitHub repository
- All local changes committed and pushed to `master`
- QA release-gate secrets configured locally in `.env.qa.secrets.local` (gitignored):
  - `QA_COMPANY_TOKEN=<active tenant token>`
  - optional `QA_AUTH_JWT=<cached jwt>`

## Option A: One-Command Remote Deploy (Recommended)

Run **locally** from the repo root. This pushes your code, SSHes into production, and runs everything:

```bash
bash scripts/deploy-remote.sh
```

`deploy-remote.sh` auto-loads `.env.qa.local` and `.env.qa.secrets.local` when present.

You will be prompted to confirm, and optionally auto-commit uncommitted changes.

## Option B: SSH + Server Deploy

### 1. Push your changes locally first
```bash
git push origin master
```

### 2. SSH into the server
```bash
ssh -p 64428 root@192.53.116.33
cd /var/www/skupervisor
```

### 3. Run the deployment script
```bash
bash scripts/deploy.sh
```

That single command handles **everything**:
1. Validates env requirements and Node.js version
2. Fetches and pulls code (fast-forward only)
3. Re-executes itself to pick up script changes
4. Creates database backup (pre-deploy)
5. Installs deterministic dependencies (`npm ci`)
6. Runs docs lint and architecture gates
7. Builds frontend
8. Runs DB migrations
9. Runs index self-heal + strict index audit
10. Runs billing-funnel audit
11. Runs tenant schema sync
12. Reloads PM2 and verifies backend/frontend health
13. Automatically rolls back if health check fails
14. Rotates old deploy logs

> **Do NOT** run `git pull` or `pm2 restart all` separately — `deploy.sh` handles both internally.

### 4. (Optional) Pin to a specific commit
```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

## Verify Deployment
```bash
# Check PM2 status
pm2 status

# Check backend logs for errors
pm2 logs sku-backend --lines 20

# Test health endpoint
curl http://localhost:5001/health
```

Open https://skupervisor.surebizcorp.com and hard-refresh (`Ctrl+Shift+R`).

---

## Troubleshooting

### Lock Error
```
Another deployment appears to be running (lock: /tmp/skupervisor_deploy.lock)
```
Check if a deploy is actually running: `ps -ef | grep deploy.sh | grep -v grep`

If not: `rm -f /tmp/skupervisor_deploy.lock` and retry.

### 502 Bad Gateway
- Check logs: `pm2 logs sku-backend --lines 50`
- Usually caused by missing npm dependencies: `cd backend && npm ci`
- Restart: `pm2 startOrReload ecosystem.config.cjs --env production --update-env`

### Migration Errors
- "Table already exists": Schema already applied, usually safe to skip
- Check status: `cd backend && npx sequelize-cli db:migrate:status`

### Manual Fallback (Last Resort)
Only if `deploy.sh` itself is broken:
```bash
cd /var/www/skupervisor
git pull --ff-only origin master
npm ci --no-audit --no-fund
cd backend && npm ci --no-audit --no-fund && npx sequelize-cli db:migrate && npm run repair:indexes && npm run audit:indexes && npm run audit:billing-funnel && cd ..
cd frontend && npm ci --no-audit --no-fund && npm run build && cd ..
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```
