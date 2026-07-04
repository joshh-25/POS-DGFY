---
status: draft
owner: engineering
last_reviewed: 2026-07-04
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md,docs/architecture/adr/0028-dgfy-account-company-switching.md,docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-04-pos-development-bundle
classification: regulatory
surfaces: pos,terminal,settings,authentication,receipt,checkout,shift,storefront,compliance
reason_codes_impacted: ALLOWED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED,VALIDATION_FAILED
policy_version: 2026.07.04
verification_evidence: npm --prefix backend test -- --runInBand tests/posCashierLoginRoute.transport.test.js tests/posDiscountCalculator.test.js tests/posGovernedDiscountLineId.contract.test.js tests/rbacRouteCoverage.contract.test.js,npm --prefix frontend test -- src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js,npm --prefix frontend run build:pos,npm exec eslint -- src/features/pos/components/PosTenantSetupModal.jsx src/features/pos/pages/TerminalPage.jsx
rollback_note: Revert the POS development bundle as one branch-level rollback if terminal login, shift control, checkout, governed discount, receipt, or storefront onboarding regressions appear. Preserve tenant data and do not drop POS transaction or discount records during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-04T05:50:00+08:00
preflight_request_ref: POS-DEVELOPMENT-BUNDLE-2026-07-04
---

# POS Development Bundle

## Compliance Impact Classification

Regulatory.

This bundle changes POS terminal authentication, terminal setup, cashier access, shift handling, checkout discount persistence, receipt rendering, history behavior, and storefront onboarding behavior. These surfaces affect governed POS operation and must be reviewed as a regulatory POS change before promotion.

## Affected Surfaces

1. POS DGFY account and cashier login flow.
2. POS terminal registry and terminal selection behavior.
3. Cashier access, permissions, and shift actions.
4. POS checkout, governed discount calculation, and transaction discount persistence.
5. POS receipt preview and print contract rendering.
6. POS history and reporting views.
7. POS onboarding storefront asset upload behavior.
8. POS build chunking and Browserslist warning suppression for the standalone POS app.

## Compliance Preconditions

1. Tenant and DGFY account identity remain authoritative for business access.
2. Cashier accounts remain role-scoped and cannot bypass tenant permissions.
3. Checkout discount calculation must persist auditable discount and VAT breakdowns.
4. Receipt rendering must preserve non-fiscal/fiscal contract fields and avoid hiding required totals.
5. Shift close/open behavior must remain permission-gated and tied to the active cashier/terminal context.
6. Storefront onboarding uploads must not change fiscal receipt, payment, or transaction records.

## Verification Evidence

Run the commands listed in the front matter before promotion. Manual QA should also verify:

1. Owner/admin can select an incomplete business and enter onboarding instead of being blocked by terminal unlock.
2. Cashier can sign in, open shift, checkout items, view history, and close shift.
3. Company icon and cover upload in POS onboarding updates smoothly without remounting the modal.
4. Receipt preview remains compact for receipt paper width.
5. POS production build keeps the terminal layout and operations workspace split into separate chunks without hiding real build failures.
