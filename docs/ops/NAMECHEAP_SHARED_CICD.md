---
status: authoritative
authority_level: authoritative
owner: operations
last_reviewed: 2026-05-04
applies_to: namecheap_shared_hosting_deployment
topic: namecheap_shared_cicd
---

# Namecheap Shared CI/CD

## Purpose
This runbook describes the GitHub Actions deployment lane for Namecheap shared hosting. It is an artifact deploy path for the `shared` hosting profile and does not replace the SSH/PM2 VPS deploy path in `docs/ops/DEPLOYMENT_GUIDE.md`.

Authoritative planning inputs:
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- ADR 0001, ADR 0003, ADR 0004, ADR 0014
- `docs/ops/HOSTING_PROFILES.md`
- `docs/ops/DEPLOYMENT_GUIDE.md`

External operations assumptions:
- Namecheap cPanel Setup Node.js App manages the backend process.
- The cPanel Node.js application root is `backend`.
- The cPanel startup file is `app.js`.
- Passenger restart is triggered by writing `backend/tmp/restart.txt`.
- The deploy control URL serves PHP helper scripts from a PHP-capable document root, default `https://dgfy.ph`.

## What CI Publishes
On pushes to `main`, `.github/workflows/ci.yml` now publishes deploy artifacts after normal gates pass:
- `backend-shared-<sha>`: backend source plus production `node_modules`, excluding `.env`, tests, logs, uploads, and generated temp storage.
- `skupervisor-dist-<sha>`: SKUpervisor static bundle.
- `pos-dist-<sha>`: POS static bundle.
- `storefront-dist-<sha>`: public storefront static bundle built with `VITE_STORE_BASE_PATH=/` and root tenant slugs enabled.
- `deploy-metadata-<sha>`: changed-surface flags and `changed_migrations`.

The shared preflight gate validates a generated production-safe env file with `HOSTING_PROFILE=shared`, no `REDIS_URL`, local temp files, fail-open token blacklist mode, and `DB_AUTO_SYNC=false`.

## Production Workflow
The deploy lane lives at `.github/workflows/deploy-namecheap-shared.yml`.

Required GitHub secrets:
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `DEPLOY_TOKEN`

Required GitHub variables:
- `PROD_IMS_URL=https://skupervisor.dgfy.ph`
- `PROD_POS_URL=https://pos.dgfy.ph`
- `PROD_STOREFRONT_URL=https://dgfy.ph`
- `PROD_BACKEND_URL=<backend Node app URL>`
- `PROD_API_URL=<backend Node app URL>/api/v1`
- `PROD_DEPLOY_CONTROL_URL=https://dgfy.ph`
- `PROD_STORE_TEST_SLUG=<known live tenant slug for deploy canary>` is optional for a brand-new empty host. Set it after the database has a tenant store to enable tenant-route canary checks.
- `FTP_DEPLOY_CONTROL_DIR=public_html`
- `FTP_BACKEND_DIR=backend`
- `FTP_IMS_DIR=skupervisor.dgfy.ph`
- `FTP_POS_DIR=pos.dgfy.ph`
- `FTP_STOREFRONT_DIR=public_html`

Use `.cicd/production.deploy.config.example.json` as the local template, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/cicd/bootstrap-and-deploy.ps1 -ConfigureOnly
```

To configure and dispatch the latest configured branch SHA:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/cicd/bootstrap-and-deploy.ps1
```

Use `-DryRun` first to verify values without writing GitHub secrets/vars or dispatching the workflow.

## Remote Helpers
GitHub renders and uploads token-protected PHP helpers to the deploy control directory:
- `preflight.php`: validates token, `ZipArchive`, configured target directories, and writability.
- `unzip-backend.php`: extracts the backend artifact, preserves `.env`, `uploads`, `storage`, and logs, and keeps a rollback backup.
- `unzip-frontend.php`: extracts `ims`, `pos`, or `storefront` static artifacts with rollback backups.
- `rollback-backend.php`: restores the previous backend managed package.
- `rollback-frontend.php`: restores a previous frontend bundle for one surface.
- `restart-node.php`: writes `backend/tmp/restart.txt`.

The helpers are deployment controls, not public application APIs. Keep `DEPLOY_TOKEN` long, random, and rotated after a suspected leak.

## Migration Boundary
Backend deploys are blocked when `backend/migrations/**` changed. FTP-only shared hosting does not provide a safe server-side command lane for Sequelize migrations in this first implementation.

When migrations changed:
1. Stop the auto backend deploy.
2. Apply migrations through an approved manual host path.
3. Verify database state.
4. Re-dispatch the workflow with `deploy_backend=false` if only frontends need release, or re-run after a migration-safe lane exists.

## Storefront Routes
The Storefront bundle supports:
- `https://dgfy.ph/<tenant-name>` for production tenant stores.
- Existing compatibility paths `/tenant-store/<tenant-name>` and `/store/<tenant-name>`.

Reserved root paths such as `/assets`, `/api`, `/uploads`, `/tenant-store`, and `/store` are not treated as tenant slugs.

## Verification
The production workflow checks:
- backend `/health` includes shared hosting capability status,
- backend `/api/v1/health` responds,
- deployed frontend roots return HTML,
- `https://dgfy.ph/<PROD_STORE_TEST_SLUG>` returns HTML when `PROD_STORE_TEST_SLUG` is set,
- the Storefront tenant page references static assets that are not served as fallback HTML.

Operator follow-up after deploy:
1. Open Admin > Hosting and confirm shared profile readiness.
2. Run an authenticated AI export download.
3. Confirm `/uploads/temp/ai-export-*.json` remains inaccessible.
4. Confirm tenant store route `https://dgfy.ph/<tenant-name>`.
