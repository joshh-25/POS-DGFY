---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-07-04
applies_to: deploy_operations
topic: beta_tenant_provisioning_incident_2026_07_04
---

# Beta Tenant Provisioning Incident (2026-07-04)

## Summary

On `beta.dgfy.ph`, new business registrations were completely broken, and one existing tenant's POS checkout was throwing schema errors. Both were live-fixed directly on the beta server (`dgfy-gha`); this doc records what broke, why, what was changed, and what's still only live on the server (not yet durable in the repo) versus what's now fixed at the source.

## Issue 1: `Unknown column 'pos_always_available'` / `'stock_effect_type'` on POS checkout

**Symptom**: POS catalog-override actions failed with `Unknown column` errors referencing `pos_catalog_overrides.pos_always_available` and `pos_transaction_lines.stock_effect_type` / `stock_exempt_reason`.

**Root cause**: Migration `backend/migrations/20260629000001-add-pos-always-available-contract.cjs` (2026-06-29) added these columns to **tenant-scoped** tables. `npm run migrate` only ever touches the landlord DB — tenant schema changes require a separate manual step, `backend/scripts/sync-tenant-schemas.js --mode repair-apply`, which was never run against beta after this migration landed.

**Fix applied (live, beta only)**: Ran `sync-tenant-schemas.js --mode repair-apply` inside beta's backend container. Repaired 27 of 28 active tenants (the 28th, `tenant_premium`, is unrelated — see Issue 3).

**Durability**: The migration itself is in the repo and will apply correctly to any *new* tenant provisioned from now on (see `tenantProvisioningService.js`'s `tenantSequelize.sync({ alter: true })` step). The gap is that **nothing in the deploy pipeline re-runs `sync-tenant-schemas.js` for existing tenants after a migration adds a tenant-scoped column** — this will recur for the next such migration unless that step is added to the deploy pipeline (e.g. `deploy-backend.yml` or a post-deploy hook). Not yet fixed at the source; flagged here as the actionable follow-up.

## Issue 2: New business registrations stuck in `pending`, "Access denied" errors

**Symptom**: `Failed to connect to tenant DB ...: Access denied for user 'sieitzsqladmin'@'%' to database 'sku_tenant_...'`, plus `[Provisioning] CRITICAL: Failed to drop zombie database`. Two real signups (`Lola's Store`, `Pat's Resto`) were stuck in `status='pending'`.

**Root cause**: `infrastructure/docker/scripts/import-legacy-dump.sh` grants the app DB user (`sieitzsqladmin`) access via an **enumerated list of per-database `GRANT` statements**, built from whatever databases existed in the dump at import time. It never granted a wildcard covering the `sku_tenant_%` naming pattern that `tenantProvisioningService.js` uses for every *new* tenant created after that point — so every registration after the initial import was permanently broken.

**Fix applied**:
1. **Live, beta only**: `GRANT ALL PRIVILEGES ON \`sku_tenant_%\`.* TO 'sieitzsqladmin'@'%'; FLUSH PRIVILEGES;` — run directly against beta's MySQL container.
2. **Source-fixed**: `infrastructure/docker/scripts/import-legacy-dump.sh` now issues this same wildcard grant as part of its normal grant step (alongside the existing enumerated per-database grants, kept for non-conforming legacy names). Any future fresh import will get this automatically — this is the fix that survives a server recreation.

**Recovery of the two stuck tenants**: Both had a `CREATE DATABASE IF NOT EXISTS` that never completed (their databases genuinely didn't exist yet). After the grant fix, re-ran the existing `approveTenantUseCase` (`backend/src/modules/tenants/usecases/approveTenantUseCase.js`) directly for each tenant ID via a one-off script inside the container — the same code path `POST /:id/approve` (admin route, `adminTenants.js`) uses. Both are now `status='active'` with schemas synced and approval emails sent. This was a one-time data recovery for these two specific tenants; not something a server recreation would need to repeat unless a DB restore rolls back to a point before this fix.

## Issue 3: `tenant_premium` "Access denied" / "Unknown database"

**Not a real customer.** The `tenants` row for `tenant_premium` ("Premium Corp") has `company_token='qa-test-token'`, `admin_email=NULL`, `admin_password_hash=NULL`, and `created_at == updated_at` — it's the QA fixture referenced by `backend/scripts/seed-test-dbs.js` (`premium@test.com` → `tenant_premium`). Its database was never created on beta (confirmed absent from the raw `app_databases.sql` dump too, not just excluded by import filtering) and no real user has credentials to log into it. Left as-is — harmless, just produces log noise whenever something iterates all tenants. No fix needed unless someone wants to actually run the QA seed flow on beta.

## What survives a server/database recreation, and what doesn't

| Item | Durable? | Notes |
|---|---|---|
| `pos_always_available` / `stock_effect_type` columns on **new** tenants | Yes | Created correctly by the migration + `tenantSequelize.sync({ alter: true })` during provisioning |
| Same columns on tenants imported from an **old dump** | No | Still needs a manual `sync-tenant-schemas.js --mode repair-apply` after any fresh legacy-dump import, until the deploy-pipeline gap above is closed |
| `sku_tenant_%` wildcard DB grant | **Yes, now** | Fixed at the source in `import-legacy-dump.sh` — any fresh import gets it automatically |
| `EMAIL_DELIVERY_PROVIDER=brevo_api` + real `BREVO_API_KEY` in beta's `.env` | No | Plain server-side `.env` file, not tracked in git. A fresh server needs these set manually — see the email-delivery incident notes in `infrastructure/docker/.env.example`'s comments for context on *why* (Linode blocks outbound SMTP by default; Brevo's HTTPS API is the working path) |
| Lola's Store / Pat's Resto tenant approval | Only via DB backup | If the DB is restored from a snapshot taken before this fix, both would revert to `pending` and need the same one-off `approveTenantUseCase` re-run described above |

## Related

- `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` — a separate, pre-existing tracked risk (`OPS-TSYNC-001`) about FK/index drift on the older PM2-based production server. Different issue, same general theme (tenant schema drift being under-automated).
