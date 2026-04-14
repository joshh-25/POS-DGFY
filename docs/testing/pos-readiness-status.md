# POS Readiness Status (Canonical)

Status: authoritative-for-pos-readiness
Last updated: 2026-04-14
Overall status: in_progress

## 1) Canonical Blockers

1. Human cashier/admin UAT signoff is pending.
2. Release-gate/nightly browser E2E evidence is configured but still needs sustained green history capture.
3. Terminal identity is policy-driven (`warn`/`enforce`) but centralized admin-managed registry governance still requires operational rollout discipline.

## 2) Current Behavior Snapshot

1. IMS to POS handoff now includes guided POS readiness behavior:
- item-level POS visibility and media controls are explicit
- readiness blockers are surfaced before cashier flow handoff
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
- tenant workflow mode (`manufacturing`/`msme`) remains independent from compliance lifecycle
- MSME uses simplified inventory/POS surfaces while preserving manufacturing data
17. Single-item POS setup is wizard-first:
- item cards are compact and do not host single-item POS setup widgets
- enabling POS visibility is readiness-gated with deterministic denial metadata (`reason_code`, `missing_requirements`)
18. Final Review documentary readiness is tenant self-serve:
- requirements are completed in Settings > Compliance > Final review (upload or external URL)
- `Go to step` targets deep-link to per-document anchors (`#final-review-doc-...`)

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

## 4) Canonical UAT Assets

1. Checklist: `docs/testing/pos-e2e-uat-checklist.md`
2. Execution script: `docs/testing/pos-e2e-uat-execution-script.md`
3. Evidence template: `docs/testing/pos-e2e-uat-evidence-template.md`
4. Current run log: `docs/testing/pos-e2e-uat-run-2026-03-28.md`
5. Canonical IMS to POS to Sales role journey: `docs/features/IMS_POS_SALES_UX_JOURNEY.md`

## 5) Update Rule

When POS readiness status changes, update this file first, then align references in:

1. `docs/testing/nonprod-gap-closure-checklist.md`
2. `docs/testing/production-readiness-audit.md`
