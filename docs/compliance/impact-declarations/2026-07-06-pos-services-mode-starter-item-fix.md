---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: 0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md,0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-06-pos-services-mode-starter-item-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_STARTER_ITEM_SILENT_FAILURE
policy_version: 2026.07.06
verification_evidence: npm --prefix backend test -- --runInBand tests/runtimeSchemaAuditService.test.js tests/tenantSchemaSyncScripts.test.js,npm --prefix backend run lint,npm --prefix frontend run lint,npm run check:architecture,npm run lint:docs,docker --context dgfy compose --env-file infrastructure/docker/local-test/.env.compose up -d --build (backend/frontend healthy; RuntimeSchemaAudit logs Healthy)
preflight_result: no_breach
preflight_reason_code: POS_STARTER_ITEM_SILENT_FAILURE
preflight_run_at: 2026-07-06T02:00:00+08:00
preflight_request_ref: DGFY-STARTER-ITEM-FIX-2026-07-06
rollback_note: Revert the frontend response-key fix and the two additive backend schema-audit/repair declarations. No destructive migration is introduced; the `items.category` ENUM repair SQL is additive (widens an existing enum) and safe to leave in place even if the surrounding code is reverted.
---

# POS Starter Item Creation Fix For Service-Mode Businesses

## Compliance Impact Classification
Major.

## Affected Surfaces
- POS tenant onboarding "Starter Item" creation step (`PosTenantSetupModal.jsx`).
- Tenant schema drift detection (`runtimeSchemaAuditService.js`) and repair tooling
  (`sync-tenant-schemas.js`) for the `items.category` column.

## Compliance Preconditions
- No new API endpoint or item model is introduced; the fix corrects which existing response field
  (`results` instead of `rows`) the onboarding starter-item handler reads from the already-existing
  `POST /api/v1/onboarding/items/bulk` response.
- The schema-audit and repair changes are additive-only: they add a migration name and an ENUM-value
  contract to existing declarative registries and add one `MODIFY COLUMN` repair statement that only
  widens the `items.category` ENUM to include the already-shipped `'service'` value. No columns are
  dropped, no data is mutated, and no other business logic changes.
- Repair remains dry-run-first via the existing `report` / `repair-dry-run` / `repair-apply` modes in
  `sync-tenant-schemas.js`; no tenant database is auto-repaired without an explicit operator run.
- No PayMongo/payment files are changed.

## Verification Evidence
- `npm --prefix backend test -- --runInBand tests/runtimeSchemaAuditService.test.js tests/tenantSchemaSyncScripts.test.js` — 14 tests passed, including a new regression test asserting the audit reports `degraded` when `items.category` is missing the `'service'` enum value.
- `npm --prefix backend run lint` — 0 errors.
- `npm --prefix frontend run lint` — 0 errors (pre-existing warnings only, unrelated to this change).
- `npm run check:architecture` — OK.
- `npm run lint:docs` — passes (see governed docs lint run alongside this declaration).
- Local deploy: `docker --context dgfy compose --env-file infrastructure/docker/local-test/.env.compose up -d --build` — backend and frontend containers built and reported healthy; backend startup log shows `[RuntimeSchemaAudit] Healthy (warnings=0)`, confirming the new migration/enum contract check runs cleanly against the local tenant schema.

## Rollback
Revert this source slice and redeploy the prior production SHA through the governed release flow. The `items.category` ENUM widening repair SQL is additive and safe to leave applied even if the surrounding application code is rolled back.
