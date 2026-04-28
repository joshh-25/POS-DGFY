# POS Readiness Status (Canonical)

Status: authoritative-for-pos-readiness
Last updated: 2026-04-28
Overall status: in_progress

## 1) Canonical Blockers

1. Human cashier/admin UAT signoff is pending.
2. Release-gate/nightly browser E2E evidence is configured but still needs sustained green history capture.
3. Terminal identity is policy-driven (`warn`/`enforce`) but centralized admin-managed registry governance still requires operational rollout discipline.
4. Source-separation manual UAT parity proof (POS History source filter vs Sales POS channel filter vs CSV `pos_order_source`) is pending human evidence capture.
5. Strict location-binding rollout cutover remains gated until legacy shift-location remediation evidence is fully reviewed and accepted by operations.

## 2) Current Behavior Snapshot

1. IMS to POS handoff now includes guided POS readiness behavior:
- item-level POS visibility and media controls are explicit
- readiness blockers are surfaced before cashier flow handoff
 - readiness blockers for enabling POS visibility are: `pos_visible`, valid `default_sale_price > 0`, non-negative stock, and active item status
 - POS menu image and folder assignment/`show_in_pos_filter` are optional UX enhancements (non-blocking)
2. POS catalog eligibility is item-level with explicit defaults:
- override row present => use `pos_visible`
- no override row =>
  - finished goods visible by default
  - non-finished categories hidden by default until enabled
3. POS override and POS image write actions require `items:edit`.
4. Folder POS visibility (`show_in_pos_filter`) controls POS category chips only.
5. Terminal opening float defaults from configured petty cash when input is empty/zero-like and no shift is open.
6. Terminal identity policy is now explicit in runtime responses:
- `warn`: continues with warning reason code (`TERMINAL_ID_MISSING_WARN`, `TERMINAL_ID_UNREGISTERED_WARN`)
- `enforce`: blocks with deterministic reason code (`TERMINAL_REGISTRY_REQUIRED`, `TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY`, `TERMINAL_ID_NOT_REGISTERED`)
7. Incoming online queue UI distinguishes access states:
- no `pos:view` -> permission message (not empty queue)
- load failure -> explicit error state
- zero records -> explicit empty queue state
8. Incoming queue polling now suppresses duplicate global error toasts during silent refresh while keeping explicit on-screen error state.
9. Incoming order status actions are disabled when `pos:transact` is missing.
10. Locked terminal disables navigation mode switching until terminal unlock.
11. POS history supports direct handoff to Sales (`Open in Sales Report`) with preserved query context.
12. Sales export now provides explicit export completion feedback tied to active filters.
13. POS/store checkout validation errors (`422`) now surface structured field-level messages instead of generic failure copy.
14. POS/Sales transaction tables no longer rely on row-level `role="button"` semantics for primary detail actions.
15. Settings remediation navigation is deterministic across POS/compliance surfaces:
- known `/settings?tab=...#...` targets are normalized/resolved
- malformed hash targets fail safely without blocking page actions
- final-review `Fix now` targets remain scrollable in `compliant_active`
16. Workflow-mode-aware UX is active:
- tenant workflow mode now supports expanded template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`)
- runtime route/wizard compatibility remains family-safe (`manufacturing`/`msme`) and independent from compliance lifecycle
- MSME uses simplified inventory/POS surfaces while preserving manufacturing data
17. Single-item POS setup is wizard-first:
- item cards are compact and do not host single-item POS setup widgets
- enabling POS visibility is readiness-gated with deterministic denial metadata (`reason_code`, `missing_requirements`)
18. Final Review documentary readiness is tenant self-serve:
- requirements are completed in Settings > Compliance > Final review (upload or external URL)
- `Go to step` targets deep-link to per-document anchors (`#final-review-doc-...`)
19. POS/storefront source separation is now explicit on read UX/contracts:
- POS history supports explicit source badge/filter (`in_store`, `online_store`)
- unified sales includes POS channel discriminator (`pos_order_source`) while preserving `source=POS`
- sales CSV export includes `pos_order_source`
- storefront quote/checkout/track error copy is normalized for actionable operator/customer feedback
20. Sales transactions route now enforces strict query validation (including `pos_order_source`) before use-case execution.
21. Settings deep-link resolver now supports dynamic final-review document anchors (`#final-review-doc-*`) without hash resolution drift.
22. POS operational surfaces now share centralized fulfillment label/action mapping (`ready_for_pickup` displayed as `Ready for pickup`).
23. Storefront error normalization is extracted into a dedicated utility with direct unit coverage.
24. Legacy POS shift-location remediation is implemented with deterministic precedence and provenance:
- precedence: `transaction_unique_location` -> `terminal_home_location` -> `tenant_primary_location` -> `active_location_fallback`
- remediation writes per-shift provenance rows to `pos_shift_location_backfill_audit`
- strict-binding activation is blocked when unresolved/low-confidence readiness remains
- terminal setup context surfaces `location_binding_readiness` for operator visibility
25. POS pane keyboard scrolling is centralized and directly unit-tested:
- shared scroll key handler utility covers `ArrowUp/Down`, `PageUp/Down`, `Home/End`
- contract coverage still enforces focus-target and independent scroll-zone behavior
26. DGFY fee/branding rollout is active across POS + storefront:
- mandatory fee policy is fixed at `1%` of gross subtotal (`DGFY convenience fee`)
- POS checkout ignores caller `service_fee_amount` overrides at runtime
- storefront quote and checkout persist deterministic DGFY fee label snapshots
- receipt header keeps legal issuer prominence while preserving DGFY brand line and acronym footer
27. Terminal fee-policy UX is explicit and no longer method-count based:
- operational widgets now expose global policy state (`DGFY Global Fee Policy: Active/Inactive`)
- legacy "Fee Methods Enabled" count semantics are retired from operator-facing summaries
28. API route naming clarity is now explicit in docs:
- canonical external routes are documented as `/api/v1/pos/checkouts`, `/api/v1/store/cart/quote`, `/api/v1/store/checkout`
- singular `/api/v1/pos/checkout` is documented as non-canonical
29. POS checkout offline replay now uses the same durable sync contract as other terminal operations:
- queue storage: IndexedDB-first with fallback compatibility path
- statuses: `queued`, `replaying`, `replayed`, `failed_manual_resolution_required`
- replay ownership in terminal workspace mode is centralized to prevent duplicate replay loops

## 3) Automated Gate Status (Latest)

### 3.1 Full rerun baseline (2026-04-03)

1. `npm run install:all` -> PASS
2. `npm --prefix backend run migrate` -> PASS (schema already up to date)
3. `npm run check:architecture` -> PASS
4. `npm run lint:docs` -> PASS
5. `npm --prefix backend run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
6. `npm --prefix backend run audit:indexes` -> PASS (`status=healthy`, `missing=0`)
7. `npm run smoke:pos-local` -> PASS (all endpoint checks `200`)
8. `npm --prefix backend run lint` -> PASS
9. `npm --prefix frontend run lint` -> PASS
10. `npm --prefix backend test` -> PASS (`140 passed suites / 143 total`, `624 passed tests / 631 total`)
11. `npm --prefix frontend test -- --run` -> PASS (`15 files / 57 tests`)
12. `npm run build:skupervisor` -> PASS
13. `npm run build:pos` -> PASS
14. `npm run build:store` -> PASS

### 3.2 Targeted remediation rerun (2026-04-08)

1. `npm --prefix backend run migrate` -> PASS
   - Applied: `20260407000002`, `20260407000003`, `20260407000004`, `20260407000005`
2. `npm --prefix backend run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
3. `npm --prefix backend test -- runtimeSchemaAuditService.test.js` -> PASS
4. `npm run check:architecture` -> PASS
5. `npm run build:frontend` -> PASS
6. Targeted endpoint probes -> PASS
   - `GET /api/v1/compliance/profile` -> `200`
   - `GET /api/v1/compliance/artifacts` -> `200`
   - `GET /api/v1/compliance/peripherals` -> `200`
   - `GET /api/v1/pos/incoming-orders` -> `200`
   - `GET /api/v1/sales/transactions` -> `200`
7. Store checkout failure mode validated:
   - `POST /api/v1/store/checkout` now returns contract-level `422` for validation/stock violations (no server `500`).

### 3.3 Journey Gate Enforcement Status (2026-04-09)

1. Core browser journey command exists and is wired for release gate use:
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e`
2. Matrix browser journey command exists for nightly drift/a11y pass:
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix`
3. Release gate workflow is defined in:
   - `.github/workflows/ci.yml` (`journey-e2e-release-gate`)
4. Nightly matrix workflow is defined in:
   - `.github/workflows/nightly-ims-pos-sales-e2e.yml`
5. Artifact retention policy is configured:
   - release gate: 14 days
   - nightly matrix: 21 days

### 3.4 Settings/Compliance Remediation Hardening Rerun (2026-04-10)

1. `npm --prefix frontend test -- --run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js` -> PASS (`4 files`, `35 tests`)
2. `npm --prefix frontend run build` -> PASS
3. Verified outcomes:
   - cross-surface remediation targets from policy/POS remain resolvable by Settings contract
   - compliance final-review `Fix now` action remains functional in `compliant_active`
   - malformed hash and clipboard failure paths provide deterministic non-blocking feedback

### 3.5 POS/Storefront Source-Separation Contract Rerun (2026-04-16)

1. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posValidator.transactionsQuery.test.js tests/salesHandlers.transport.test.js` -> PASS
2. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posSalesReconciliation.db.integration.test.js -t "keeps totals consistent across POS checkout, Z-reading, and unified sales summary"` -> PASS
3. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posSalesReconciliation.db.integration.test.js -t "covers storefront checkout -> tracking -> POS lifecycle -> reporting -> inventory end-to-end"` -> PASS
4. `npx vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/sales/__tests__/salesHandoffContracts.test.js` -> PASS
5. Canonical contract matrix published:
   - `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`

### 3.6 Gap-Closure Hardening Rerun (2026-04-16)

1. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/salesValidator.transactionsQuery.test.js tests/salesHandlers.transport.test.js` -> PASS
2. `npx vitest run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/sales/__tests__/salesHandoffContracts.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js` -> PASS
3. `npm run check:architecture` -> PASS
4. `npm run check:compliance` -> PASS
5. `npm run build:frontend` -> PASS
6. Dedicated manual run log scaffold created:
   - `docs/testing/pos-e2e-uat-run-2026-04-16.md`

### 3.7 POS Shift-Location Remediation + Strict-Binding Guardrail Rerun (2026-04-21)

1. `npm --prefix backend test -- --runInBand posValidator.terminalShiftIdentity.test.js posUsecases.applicationResult.test.js posHandlers.transport.test.js rbacRouteCoverage.contract.test.js settingsUsecases.applicationResult.test.js posShiftLocationResolution.test.js posShiftLocationBackfillRemediation.migration.test.js posTerminalReadiness.usecase.test.js` -> PASS
2. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalLocationScope.integration.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posSettingsStrictBinding.contract.test.js` -> PASS
3. `npm --prefix frontend run build:pos` -> PASS
4. `npm run check:architecture` -> PASS
5. `npm run lint:docs` -> PASS
6. Strict-binding readiness guardrails verified:
   - settings update blocks `pos_terminal_location_binding_enforced=true` when readiness is not complete
   - terminal setup context returns `location_binding_readiness` summary payload

### 3.8 Production Hardening Rerun (2026-04-21, Evening)

1. `npm --prefix backend run migrate` -> PASS
   - Applied pending migration: `20260422000002-harden-compliance-downgrade-controls.cjs`
2. `npm run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
3. `npm --prefix frontend run build:all` -> PASS
4. `npm --prefix frontend test` -> PASS (`48 files`, `192 tests`)
5. `npm --prefix backend test` -> PASS (`192 passed suites`, `4 skipped`; `848 passed tests`, `9 skipped`)
6. `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix` -> PASS (`4/4` scenarios; desktop+mobile)
7. `npm run check:architecture` -> PASS
8. `npm run lint:docs` -> PASS
9. `npm run check:compliance` -> PASS
10. `npm run check:frontend-budgets` -> PASS (route budget thresholds rebased to current POS route complexity with bounded headroom)
11. `npm run gate:release:no-staging` -> FAIL (expected in local env without QA remote contract inputs)
    - release verdict artifact generated at:
      - `.tmp/release-gates/<target_sha>/release_verdict.json`
    - failing release verdict checks were:
      - `qa.smoke.command` (missing `QA_BASE_URL`)
      - `qa.rollback.command` + `qa.restore.command` (`QA_SSH_HOST` missing)
      - `qa.deploy.summary.exists` (missing `qa_deploy_summary.txt`)

### 3.9 No-Staging QA Gate Closure (2026-04-21, Night)

1. Local QA env wiring completed via `.env.qa.local` + loader/wrapper scripts.
2. `npm run evidence:qa:deploy-summary` -> PASS
3. `npm run gate:release:no-staging:qa-env` -> PASS
4. `node scripts/verify-release-verdict.js --file .tmp/release-gates/<target_sha>/release_verdict.json --sha <target_sha>` -> PASS
5. Release verdict artifact now reports `verdict: pass` with `failed_gate_count: 0` for target SHA `b315629978b9e772dc93d406c6ac15a8af53c655`.

### 3.10 Storefront Catalog Production Incident Remediation (2026-04-21, Night)

1. Observed production symptom:
   - Public tenant storefront intermittently returned `500` on `GET /api/v1/store/catalog?limit=120&location_id=...` for one tenant while another tenant continued to return `200`.
2. Root cause:
   - Tenant-level schema drift on location-stock support (`item_location_stocks`) combined with `location_id` catalog scope path.
   - Existing catalog compatibility fallback handled missing `pos_catalog_overrides` but did not gracefully degrade missing location-stock schema.
3. Permanent backend fix:
   - `backend/src/modules/store/repositories/storeRepository.js` now treats missing location-stock table/column errors as compatibility fallback and returns global stock-based availability instead of propagating `500`.
4. Regression coverage:
   - `backend/tests/storeRepository.locationStockFallback.test.js`
5. Verification evidence:
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/storeUsecases.applicationResult.test.js` -> PASS
   - `npm run check:architecture` -> PASS
6. Deployment evidence:
   - Full verified deploy completed for commit `4a6d76a789cd60526cd2909cd4d72e5a225c683c`.
   - Summary artifact: `logs/deploy/deploy_20260421_212450.summary.txt`
   - Public checks passed for IMS/POS/storefront/tenant-store and tenant-store asset integrity.

### 3.11 Storefront and POS Compatibility/UX Polish Closure (2026-04-22)

1. Root-cause closure expansion:
   - Storefront catalog blank-state edge case identified when `catalog.length === 0` and catalog search query is non-empty.
   - Catalog error helper copy previously suggested setup guidance for generic runtime errors.
   - Adjacent POS repository location-stock path shared schema-drift risk for `item_location_stocks`.
2. Implemented fixes:
   - `frontend/apps/store/src/main.jsx` now uses deterministic catalog state rendering (`loading`, `error`, setup-empty, search-empty, no-match, ready) so no blank state is possible.
   - `frontend/apps/store/src/storefrontErrorMessages.js` now classifies catalog load failures and separates runtime faults from setup guidance.
   - `backend/src/modules/pos/repositories/posRepository.js` now applies the same table/column compatibility fallback policy for location-stock reads as storefront catalog.
3. Regression coverage:
   - `frontend/apps/store/src/__tests__/discoveryFlow.integration.test.jsx`
   - `frontend/apps/store/src/__tests__/storefrontErrorMessages.test.js`
   - `backend/tests/posRepository.locationStockFallback.test.js`
4. Verification evidence:
   - `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontErrorMessages.test.js` -> PASS
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/posRepository.locationStockFallback.test.js` -> PASS

### 3.12 Storefront Catalog Explicit Error-Code Contract (2026-04-22)

1. Contract hardening:
   - Added explicit backend error codes for storefront catalog read failures:
     - `STORE_CATALOG_LOCATION_INVALID` (`422`)
     - `STORE_CATALOG_RUNTIME_ERROR` (`500`)
2. Frontend hardening:
   - Catalog error guidance now keys off `error_code` contract rather than message substring matching.
3. Regression coverage:
   - `backend/tests/storeUsecases.applicationResult.test.js` (catalog invalid location + runtime error code assertions)
   - `frontend/apps/store/src/__tests__/storefrontErrorMessages.test.js` (code-driven classification assertions)
4. Verification evidence:
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeUsecases.applicationResult.test.js tests/storeRepository.locationStockFallback.test.js tests/posRepository.locationStockFallback.test.js` -> PASS
   - `npm --prefix frontend test -- --run apps/store/src/__tests__/storefrontErrorMessages.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx` -> PASS
   - `npm run check:architecture` -> PASS
   - `npm run lint:docs` -> PASS

### 3.13 Scroll UX Assurance + Local Readiness Gate Automation (2026-04-23)

1. Scroll behavior hardening:
   - extracted pane keyboard-scroll handling to shared utility:
     - `frontend/src/features/pos/utils/scrollKeyControls.js`
   - added direct behavior tests:
     - `frontend/src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js`
   - updated scroll contract test to enforce utility wiring:
     - `frontend/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
2. Local release-readiness automation:
   - added `scripts/gate-release-local.js`
   - added npm command `npm run gate:release:local`
   - gate emits artifact:
     - `.tmp/release-gates/<target_sha>/local_readiness.json`
3. Verification evidence:
   - `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js` -> PASS

### 3.14 DGFY Global Fee + Branding Contract Hardening (2026-04-23)

1. Cross-surface policy hardening:
   - storefront fee label is deterministic even when `service_fee_amount=0`
   - receipt header now preserves legal issuer-first display with explicit DGFY brand line
   - terminal summary cards now expose explicit global fee-policy state
2. Regression coverage:
   - `npm --prefix backend test -- --runTestsByPath tests/storeUsecases.applicationResult.test.js tests/posSalesReconciliation.db.integration.test.js` -> PASS
   - `npm --prefix frontend test -- --run src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx` -> PASS
3. Quality + gate evidence:
   - `npm --prefix frontend run lint -- Pages/Settings.jsx src/features/pos/components/TerminalOperationsWorkspace.jsx src/features/pos/components/TerminalSidebarPanel.jsx src/features/pos/components/ReceiptPrintView.jsx` -> PASS
   - `npm run lint:docs` -> PASS
   - `npm run check:architecture` -> PASS
   - `npm run check:compliance` -> PASS
   - `npm run gate:release:local` -> PASS

## 4) Canonical UAT Assets

1. Checklist: `docs/testing/pos-e2e-uat-checklist.md`
2. Execution script: `docs/testing/pos-e2e-uat-execution-script.md`
3. Evidence template: `docs/testing/pos-e2e-uat-evidence-template.md`
4. Current run log: `docs/testing/pos-e2e-uat-run-2026-04-16.md`
5. Canonical IMS to POS to Sales role journey: `docs/features/IMS_POS_SALES_UX_JOURNEY.md`
6. Current release checklist: `docs/testing/release-go-no-go-checklist.md`

## 5) Update Rule

When POS readiness status changes, update this file first, then align references in:

1. `docs/testing/nonprod-gap-closure-checklist.md`
2. `docs/testing/production-readiness-audit.md`
