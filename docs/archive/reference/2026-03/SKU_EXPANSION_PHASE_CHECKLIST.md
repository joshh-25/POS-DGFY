---
status: reference
authority_level: reference
owner: expansion_program
last_reviewed: 2026-03-31
applies_to: skupervisor_expansion
topic: phased_expansion_checklist
---

# SKUpervisor Expansion Phase Checklist

Source plan: `skupervisor_expansion_plan.md` + ADR 0006

Remediation plan (post-implementation audit, 2026-03-31):

- `docs/reference/SKU_EXPANSION_REMEDIATION_PLAN.md`
- `docs/reference/SKU_EXPANSION_FINDINGS_PHASED_PLAN_2026-03-31.md`

## Baseline Evidence Snapshot

Run these before stage implementation and log outputs/dates:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. `npm --prefix backend run doctor:runtime`
4. `npm --prefix backend run audit:indexes`

Latest prerequisite execution run (2026-03-31):

1. `npm run install:all` -> pass
2. `npm --prefix backend run migrate` -> pass (`No migrations were executed, database schema was already up to date`)
3. `npm run check:architecture` -> pass
4. `npm run lint:docs` -> pass
5. `npm --prefix backend run doctor:runtime` -> healthy (`missing_migrations=0`, `missing_columns=0`)
6. `npm --prefix backend run audit:indexes` -> healthy (`missing=0`)

## Stage 0 - Program Control And Governance

- [x] ADR 0006 created and accepted
- [x] Living checklist created and committed
- [x] Baseline evidence captured
- [x] Rollback note template defined

Evidence links:
- Architecture check: `npm run check:architecture` (pass, 2026-03-30)
- Docs lint: `npm run lint:docs` (pass, 2026-03-30)
- Runtime doctor: `npm --prefix backend run doctor:runtime` (healthy, 2026-03-30)
- Index audit: `npm --prefix backend run audit:indexes` (healthy, 2026-03-30)

Rollback notes:
- Use phase rollback template:
- Scope:
- Trigger:
- Forward fix path:
- Last known good commit:

## Stage 1 - Foundation

- [x] Staged app topology scaffolded (`frontend/apps/skupervisor`, `frontend/apps/pos`, `frontend/apps/store`)
- [x] Shared package scaffolds added (`packages/ui`, `packages/types`)
- [x] Root and frontend app-specific scripts added
- [x] CORS and environment strategy updated for multi-surface setup
- [x] Existing IMS/POS workflows remain operational

Evidence links:
- Build/test command outputs:
- `npm --prefix frontend run build` (pass, 2026-03-30)
- `npm run build:skupervisor` (pass, 2026-03-30)
- `npm run build:pos` (pass, 2026-03-30)
- `npm run build:store` (pass, 2026-03-30)
- `npm --prefix frontend run lint` (pass, 2026-03-30)
- `npm --prefix frontend test` (pass, 14 files / 51 tests, 2026-03-30)
- `npm --prefix backend run lint` (pass, 2026-03-30)
- `npm --prefix backend test` (pass, 138 suites / 603 tests with 3 skipped suites, 2026-03-30)
- `npm --prefix frontend run lint` (pass, 2026-03-31)
- `npm --prefix frontend test -- --run` (pass, 15 files / 57 tests, 2026-03-31)
- `npm --prefix backend run lint` (pass, 2026-03-31)
- `npm --prefix backend test` (pass, 139 suites / 616 tests with 3 skipped suites, 2026-03-31)
- `npm --prefix backend test` (pass, 140 suites / 631 tests with 3 skipped suites, 2026-03-31)
- `npm run build:skupervisor` (pass, 2026-03-31)
- `npm run build:pos` (pass, 2026-03-31)
- `npm run build:store` (pass, 2026-03-31)
- Smoke verification:
- `npm run check:architecture` (pass, 2026-03-30)
- `npm --prefix backend run doctor:runtime` (healthy, 2026-03-30)
- `npm run check:architecture` (pass, 2026-03-31)
- `npm run lint:docs` (pass, 2026-03-31)
- `npm --prefix backend run doctor:runtime` (healthy, 2026-03-31)
- `npm --prefix backend run audit:indexes` (healthy, 2026-03-31)

Rollback notes:
- Revert staged app entry files and script additions if rollout needs to pause.

## Stage 2 - Vertical Slice Core

- [x] Tenant locations migration/model/routes/usecases added
- [x] Storefront/POS settings extension completed
- [x] Store checkout + tracking backend contracts implemented
- [x] Dedicated store auth + tenant-isolated customer accounts implemented
- [x] POS incoming online queue + status progression implemented
- [x] `pickup` support added across backend/frontend contracts
- [x] In-store POS behavior remains backward-compatible

Evidence links:
- API/tests:
- `npm run check:architecture` (pass, 2026-03-30)
- `npm --prefix backend run lint` (pass, 2026-03-30)
- `npm --prefix backend test` (pass, 138 suites / 603 tests with 3 skipped suites, 2026-03-30)
- `npm --prefix frontend test` (pass, 14 files / 51 tests, 2026-03-30)
- `npm --prefix frontend run build` (pass, 2026-03-30)
- `npm --prefix backend run doctor:runtime` (healthy, 2026-03-30)
- `npm --prefix backend run audit:indexes` (healthy, 2026-03-30)
- `npm --prefix backend run migrate` (pass, schema already up to date, 2026-03-31)
- `npm --prefix backend run migrate` (pass, applied `20260331000008-make-pos-cashier-nullable-for-online-store`, 2026-03-31)
- `npm run check:architecture` (pass, 2026-03-31)
- `npm --prefix backend run lint` (pass, 2026-03-31)
- `npm --prefix backend test` (pass, 139 suites / 616 tests with 3 skipped suites, 2026-03-31)
- `npm --prefix backend test` (pass, 140 suites / 631 tests with 3 skipped suites, 2026-03-31)
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "covers storefront checkout -> tracking"` (pass, 2026-03-31)
- `npm --prefix frontend test -- --run` (pass, 15 files / 57 tests, 2026-03-31)
- `npm run smoke:pos-local` (pass, all endpoint checks 200, 2026-03-31)
- `npm --prefix backend run doctor:runtime` (healthy, 2026-03-31)
- `npm --prefix backend run audit:indexes` (healthy, 2026-03-31)
- `npm --prefix backend test -- storeRouteTenantContext.integration.test.js` (pass, 2026-03-31)
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "does not deduct inventory for cancelled placed orders"` (pass, 2026-03-31)
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "covers online order tracking"` (pass, 2026-03-31)
- Implementation artifacts:
- `backend/src/modules/tenantLocations/**`
- `backend/src/modules/store/**`
- `backend/src/routes/store.js`
- `backend/src/middleware/storeAuth.js`
- `backend/src/routes/tenantLocations.js`
- `backend/src/validators/tenantLocationValidator.js`
- `backend/src/validators/storeValidator.js`
- `backend/src/modules/pos/usecases/posUseCases.js`
- `backend/src/modules/pos/repositories/posRepository.js`
- `backend/src/routes/pos.js`
- `backend/migrations/20260330000003-create-tenant-locations.cjs`
- `backend/migrations/20260330000004-add-storefront-operational-settings.cjs`
- `backend/migrations/20260330000005-add-pickup-to-pos-order-method-enums.cjs`
- `backend/migrations/20260330000006-expand-pos-transactions-for-online-orders.cjs`
- `backend/migrations/20260330000007-create-store-customers-and-addresses.cjs`
- `backend/migrations/20260331000008-make-pos-cashier-nullable-for-online-store.cjs`
- `frontend/src/services/tenantLocationService.js`
- `frontend/Pages/Settings.jsx`
- `frontend/src/features/pos/services/posService.js`
- `frontend/src/features/pos/components/TerminalSidebarPanel.jsx`
- `frontend/src/features/pos/pages/TerminalPage.jsx`

Rollback notes:
- Revert Stage 2 migration files and tenant-location module registration/mounting as one batch.

## Stage 3 - General Store Discovery

- [x] Secure landlord discovery index model implemented
- [x] Public search/profile/catalog bridge endpoints implemented
- [x] Ranking/filtering/geolocation behavior implemented
- [x] Frontend list/map/board discovery views implemented
- [x] Discovery payload token exposure removed (`company_token` no longer public)
- [x] Discovery endpoints now use dedicated route limiter
- [x] Public store tenant resolution supports `x-store-slug`
- [x] Discovery per-tenant failure telemetry added
- [x] Discovery read path migrated to landlord index (no hot-path tenant fan-out)

Evidence links:
- Backend routes:
- `backend/src/routes/storefrontDiscovery.js`
- `backend/src/controllers/storefrontDiscoveryController.js`
- `backend/src/modules/storefrontDiscovery/**`
- `backend/src/routes/store.js` (`GET /catalog`)
- `backend/src/services/storefrontDiscoveryIndexService.js`
- `backend/src/services/storefrontTenantResolver.js`
- `backend/src/models/Landlord/StorefrontDiscoveryIndex.js`
- `backend/migrations/20260331000009-create-storefront-discovery-index.cjs`
- Store UI:
- `frontend/apps/store/src/main.jsx` (list/grid/map discovery + guest checkout + tracking)
- Validation/build:
- `npm run check:architecture` (pass, 2026-03-31)
- `npm --prefix backend run lint` (pass, 2026-03-31)
- `npm --prefix backend test -- storeHandlers.transport.test.js storeRouteTenantContext.integration.test.js` (pass, 2026-03-31)
- `npm --prefix backend test -- storefrontDiscoveryRepository.test.js` (pass, 2026-03-31)
- `npm --prefix backend test -- storefrontTenantResolver.test.js` (pass, 2026-03-31)
- `npm run lint:docs` (pass, 2026-03-31)
- `npm run build:store` (pass, 2026-03-31)
- `npm --prefix backend run lint` (pass, 2026-03-31)
- `npm run check:architecture` (pass, 2026-03-31)
- `npm --prefix backend run migrate` (pass, applied `20260331000009-create-storefront-discovery-index`, 2026-03-31)
- Search correctness tests:
- `backend/tests/storefrontDiscoveryRepository.test.js`
- `backend/tests/storefrontTenantResolver.test.js`
- Performance smoke:
- `npm --prefix backend run doctor:runtime` (healthy with `storefront_discovery_index`, 2026-03-31)
- `npm --prefix backend run audit:indexes` (healthy, 2026-03-31)

Rollback notes:
-

## Stage 4 - PWA And Cross-App UX Hardening

- [x] Store/POS manifests and worker scaffolds added
- [x] Responsive behavior validated
- [x] Offline degradation UX validated
- [x] Map integration and attribution finalized

Evidence links:
- Lighthouse/PWA audits:
- Mobile smoke tests:
- `frontend/apps/store/manifest.webmanifest`
- `frontend/apps/store/sw.js`
- `frontend/apps/pos/manifest.webmanifest`
- `frontend/apps/pos/sw.js`
- `frontend/apps/store/src/main.jsx` (offline banner + SW registration)
- `frontend/apps/pos/src/main.jsx` (offline banner + SW registration)
- `frontend/src/features/pos/pages/TerminalPage.jsx` (offline banner + queue offline messaging)
- `npm run build:store` (pass, 2026-03-31)
- `npm run build:pos` (pass, 2026-03-31)

Rollback notes:
-

## Stage 5 - Integration And Compliance Closure

- [x] Unit/integration/frontend smoke suites completed
- [x] Architecture/docs/runtime/schema gates passed
- [ ] UAT evidence and signoff completed
- [x] API/database/testing/readiness docs updated

Evidence links:
- Final gate outputs:
- `npm run check:architecture` (pass, 2026-03-31)
- `npm run lint:docs` (pass, 2026-03-31)
- `npm --prefix backend run doctor:runtime` (healthy, 2026-03-31)
- `npm --prefix backend run audit:indexes` (healthy, 2026-03-31)
- `npm --prefix backend run lint` (pass, 2026-03-31)
- `npm --prefix frontend run lint` (pass, 2026-03-31)
- `npm --prefix backend test` (pass, 140 passed suites / 143 total, 624 passed tests / 631 total, 2026-03-31)
- `npm --prefix frontend test -- --run` (pass, 15 files / 57 tests, 2026-03-31)
- `npm run build:skupervisor` (pass, 2026-03-31)
- `npm run build:pos` (pass, 2026-03-31)
- `npm run build:store` (pass, 2026-03-31)
- Remediation checklist: `docs/reference/SKU_EXPANSION_REMEDIATION_PLAN.md`
- UAT artifacts:

Rollback notes:
-

## Risk Burn-Down Tracking

| Stage | Risk | Mitigation | Owner | Exit Proof |
|---|---|---|---|---|
| Stage 0 | Architecture drift | ADR + checklist + gate evidence | Tech Lead | ADR merged + checklist active |
| Stage 1 | Foundation breakage | Staged migration + compatibility checks | Frontend Lead | Existing workflows unchanged |
| Stage 2 | Tenant leakage | Strict tenant boundaries + separate store auth | Backend Lead | Isolation tests pass |
| Stage 2 | POS regression | Preserve in-store path + new online routes | POS Lead | POS regression tests pass |
| Stage 3 | Search scalability | Landlord index strategy | Backend Lead | Search performance proof |
| Stage 4 | PWA confusion | Explicit offline states + audit | Frontend Lead | PWA smoke evidence |
| Stage 5 | Readiness drift | Checklist as source of truth | QA Lead | Final docs + gate evidence |

## Findings Remediation Progress (2026-03-31)

- [x] Phase A (evidence lock) complete
- [x] Phase B (POS scroll reliability hardening) complete in code/build
- [x] Phase C (view-mode content integrity) complete in code/tests
- [x] Phase D (documentation convergence) complete for active source-of-truth links
- [ ] Phase E (manual UAT signoff) pending human execution and approval
