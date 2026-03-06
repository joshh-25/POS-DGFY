# Production Deployment Checklist

Use this guide to ensure a safe and successful deployment to the production server.

## 1. Pre-Deployment Checks (Local)
- [ ] **Code Status**: All changes committed and pushed to `main`.
- [ ] **Method Selection**: Prefer using `./scripts/deploy.sh --expect-commit <sha>` for full automation.
- [ ] **Build Check**: storage (if manual)
    ```bash
    cd frontend
    npm run build
    # Verify 'dist' folder is created without errors
    ```
- [ ] **Environment Variables**:
    - Check `.env.production` in backend (if used, or ensure pm2 env is set).
    - Ensure `VITE_API_URL` in frontend points to the production domain.

## 2. Server Access
- [ ] SSH into the server.
- [ ] Navigate to project root: `cd /path/to/project`.
- [ ] Resolve target commit:
  ```bash
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch origin "$BRANCH"
  EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
  ```

## 3. Database Backup (Critical)
Before applying any changes, backup the database.
```bash
# Example for MySQL
mysqldump -u [user] -p [database_name] > backup_$(date +%F_%H-%M).sql
```

## 4. Pull Latest Code
```bash
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

Notes:
- `deploy.sh` skips legacy maintenance hooks by default. Use `--run-legacy-hooks` only for intentional legacy recovery.
- The script now runs a required-index self-heal pass before the strict index audit gate.

The deployment script now handles:
- pull (fast-forward only)
- deterministic `npm ci` installs
- docs lint + architecture gates
- migration + schema audits
- PM2 reload
- backend/frontend health verification
- deploy evidence artifacts under `logs/deploy/`

## 5. Install Dependencies
If `package.json` changed:
```bash
# Backend
npm install

# Frontend
cd frontend
npm install
```

## 6. Rebuild Frontend
```bash
cd frontend
npm run build
```

## 7. Migration (If applicable)
If database schema changed:
```bash
cd backend
npm run migrate # or equivalent command
```

## 8. Schema Index Contract Audit (Required)
Run the index drift guard immediately after migrations:
```bash
cd backend
npm run audit:indexes
```
- [ ] Command exits `0` with `status=healthy`.
- [ ] If degraded, fix missing indexes before restart/deployment.

## 9. Multi-Tenancy Onboarding (One-time after migration)
If upgrading to Multi-Tenancy from a single-tenant version:
```bash
node backend/scripts/onboard-production-tenant.js
```

## 10. Restart Services
Use PM2 to zero-downtime reload or restart.
```bash
pm2 restart ecosystem.config.cjs --env production
```

## 11. Verification
- [ ] **Health Check**: Load the website in incognito.
- [ ] **API Check**: Login and verify data loads.
- [ ] **Schema Guard Check**: `GET /health` returns `services.schemaIndexes.status: "healthy"`.
- [ ] **Telemetry Integrity Check**: `GET /health` returns `services.billingFunnelTelemetry.status: "healthy"`.
- [ ] **Telemetry Audit Script**: `cd backend && npm run audit:billing-funnel` exits `0`.
- [ ] **Logs**: Check for startup errors.
    ```bash
    pm2 logs
    ```
- [ ] **PayPal Sandbox Canary**: Trigger and verify the GitHub Actions canary passes.
    - Workflow: `.github/workflows/paypal-sandbox-canary.yml`
    - Ensure repository secrets are configured: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_SANDBOX_ACTIVE_SUBSCRIPTION_ID`
    - Optional secret: `PAYPAL_SANDBOX_NONACTIVE_SUBSCRIPTION_ID`
    - Manual trigger: GitHub Actions -> `PayPal Sandbox Canary` -> `Run workflow`
    - Expected result: workflow exits green, does not report skipped assertions, and passes the post-canary billing-funnel audit

## 12. Rollback (If needed)
If major issues occur:
1. Revert code safely with a new commit (do not rewrite history):
   ```bash
   git revert --no-edit <deployed_commit_sha>
   git push origin main
   ```
2. Re-run deployment steps (`git pull`, install if needed, build, migrate if required).
3. Restart services:
   ```bash
   pm2 restart ecosystem.config.cjs --env production
   ```
