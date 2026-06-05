---
status: reference
owner: engineering
last_reviewed: 2026-05-30
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md
declaration_id: 2026-05-30-dgfy-pos-surface-split
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY,TERMINAL_ID_NOT_REGISTERED,COMPLIANCE_BLOCKED
policy_version: 2026.05.30
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix backend test -- --runInBand --runTestsByPath tests/posUsecases.applicationResult.test.js tests/posSalesReconciliation.db.integration.test.js,npm --prefix frontend run build:pos,npm --prefix frontend run build:skupervisor
rollback_note: Revert the DGFY POS standalone surface routing and SKUpervisor POS page split to the prior shared POS page wiring, keep backend POS checkout and receipt contracts unchanged, and redeploy the previous POS and SKUpervisor frontend bundles after release gates pass.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-30T18:20:00+08:00
preflight_request_ref: https://github.com/BBLabs-Albert/SKU-Inventory-Manager/pull/11
---

# DGFY POS Surface Split and Terminal UI Refresh

## Compliance Impact Classification

Major.

This declaration covers the PR #11 frontend split between the standalone DGFY POS app surface and the SKUpervisor embedded POS page. The change is compliance-sensitive because it modifies POS terminal layout, checkout controls, receipt/history navigation, barcode scan placement, terminal notifications, offline queue visibility, and POS/Sales handoff behavior. It does not intentionally change backend fiscal receipt issuance, DGFY convenience-fee calculation, stock deduction, payment authorization, tax calculation, compliance activation, or terminal-registry policy.

## Affected Surfaces

- Standalone POS app routing now serves the terminal at `/` and `/terminal`, redirects `/sales` to the SKUpervisor app origin, and shows a POS-specific fallback page for unsupported routes.
- SKUpervisor IMS `/pos` now loads `SkupervisorPOSPage` and keeps Services, F&B, Hospitality, and history/reporting context inside the admin surface.
- `POSCheckoutTerminal` now carries DGFY standalone visual treatment, catalog pagination, checkout confirmation, receipt modal, category filters, and SKUpervisor handoff utilities.
- `SkupervisorPOSCheckoutTerminal` preserves the prior admin-style POS terminal behavior for the embedded SKUpervisor page.
- Terminal shell, sidebar, notification, queue, barcode, history, lock-drawer, and workspace components were restyled or split for the new surfaces.
- Static POS sample imagery and DGFY logo assets were added to both POS and SKUpervisor public asset trees.
- Frontend toolchain metadata now targets Vite 8 and `@vitejs/plugin-react` 6; operators must ensure Node support before deterministic CI/deploy installs.

## Compliance Preconditions

1. POS checkout totals must remain backend-owned; frontend display of the 1% DGFY convenience fee must continue to match ADR 0012 and must not revive caller-controlled `service_fee_amount` overrides.
2. Terminal registry enforcement, terminal ID warnings, and compliance blockers must remain backend-driven and must fail closed when policy requires it.
3. Receipt preview and Sales handoff must preserve transaction identity, source filters, and reporting context; a cross-surface redirect must not create a second checkout path.
4. Offline checkout replay and Sync Queue operations must continue using the existing durable terminal operation queue contract.
5. The standalone POS surface may simplify cashier UI, but any removed admin affordance, price override, modifier editing, or history/reporting action must be intentionally documented and covered by tests before release.
6. Browser-rendered evidence is required before production promotion because this change is primarily a cashier UI and surface-routing change.
7. Frontend budget and lint gates must pass before claiming production readiness; a missing or renamed route chunk must update the budget contract rather than silently bypassing it.
8. Deployment must confirm that the production POS and SKUpervisor bundles are built with the same Vite/toolchain versions declared in the lockfile.

## Verification Evidence

Passing evidence captured on the PR #11 merge commit `6ca61e8d01e304a75f078d11f937aec4425c944e`:

1. `npm run lint:docs` -> PASS.
2. `npm run check:architecture` -> PASS.
3. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js` -> PASS (`30` tests).
4. `npm --prefix backend test -- --runInBand --runTestsByPath tests/posUsecases.applicationResult.test.js tests/posSalesReconciliation.db.integration.test.js` -> PASS (`39` tests).
5. `npm --prefix frontend run build:pos` -> PASS after installing the declared Vite 8 toolchain.
6. `npm --prefix frontend run build:skupervisor` -> PASS after installing the declared Vite 8 toolchain.

Blocking evidence that must be resolved before production readiness:

1. `npm run gate:release:local` -> FAIL on compliance, frontend lint, and frontend budgets.
2. `npm run check:frontend-budgets` -> FAIL because `POSCheckoutTerminal-*.js` exceeds the `54KB` ceiling and the expected `POSPage-` chunk is missing after the surface split.
3. Focused ESLint on changed POS files -> FAIL on `TerminalPageLayout.jsx` due synchronous `setNotificationReadState` inside an effect; additional unused-variable warnings remain.
4. Full frontend lint still includes pre-existing Storefront lint debt; the POS-specific lint error is new and release-blocking for this merge.
5. No rendered browser UAT evidence was captured yet for desktop and mobile POS/SKUpervisor surfaces.
6. Production health is green, but live deploy state does not show merge commit `6ca61e8d` as deployed.

## No Architecture Exception Required

The merge is frontend-surface work and does not add backend routes, repositories, use cases, models, or architecture allowlist entries. Existing architecture checks pass. The unresolved release blockers are compliance documentation closure, POS lint, frontend budget alignment, rendered UI evidence, and deploy parity.
