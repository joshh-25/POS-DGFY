---
status: reference
owner: engineering
last_reviewed: 2026-07-02
related_adr: 0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md,0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-02-pos-item-creation-onboarding-schema-repair
classification: major
surfaces: pos,terminal,onboarding,tenant_schema,storefront_catalog
reason_codes_impacted: POS_READINESS_INCOMPLETE
policy_version: 2026.07.02
verification_evidence: npm --prefix backend test -- --runInBand tests/runtimeSchemaAuditService.test.js tests/tenantSchemaSyncScripts.test.js,npm --prefix frontend exec vitest run src/features/pos/utils/__tests__/setupFlow.test.js src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js --pool=threads,npm run check:architecture,npm run lint:docs
preflight_result: no_breach
preflight_reason_code: POS_ITEM_CREATION_ONBOARDING_SCHEMA_REPAIR
preflight_run_at: 2026-07-02T13:30:00+08:00
preflight_request_ref: POS-ITEM-CREATION-ONBOARDING-SCHEMA-REPAIR-2026-07-02
rollback_note: Revert the application changes and ADR addenda. Tenant schema repair is additive only; do not drop repaired columns during rollback without a separate governed data-retention review.
---

# POS Item Creation, Onboarding Starter Item, And Tenant Schema Repair

## Compliance Impact Classification
Major.

## Affected Surfaces
- POS Add Item post-create image, barcode, Storefront visibility, Always Available, POS visibility, and catalog readback setup.
- POS tenant onboarding step order and starter-item creation.
- Tenant schema report/repair evidence for POS Always Available and POS stock-effect columns.
- Storefront catalog visibility setup for newly created POS items.

## Compliance Preconditions
- POS onboarding reuses `POST /api/v1/onboarding/items/bulk`; no POS-only onboarding item API or separate POS item model is introduced.
- POS and Storefront visibility remain separate controls.
- Optional image upload failure is recoverable post-create work and must preserve the created item ID.
- Retry/resume must not create a duplicate item.
- Tenant schema repair is dry-run-first and limited to declared additive POS columns.
- No PayMongo/payment files are changed.

## Verification Evidence
- `npm --prefix backend test -- --runInBand tests/runtimeSchemaAuditService.test.js tests/tenantSchemaSyncScripts.test.js`
- `npm --prefix frontend exec vitest run src/features/pos/utils/__tests__/setupFlow.test.js src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js --pool=threads`
- Final focused frontend verification also includes `src/features/pos/__tests__/posSettingsCashier.contract.test.js`; 73 tests passed after aligning the contract assertions with the DGFY Email label and batched terminal-metadata refresh.
- `npm run check:architecture`
- `npm run lint:docs`

## Rollback
Revert this source slice and redeploy the prior production SHA through the governed release flow. Additive tenant schema repair columns should remain in place unless a separate ADR-backed rollback accepts column removal and data-retention risk.
