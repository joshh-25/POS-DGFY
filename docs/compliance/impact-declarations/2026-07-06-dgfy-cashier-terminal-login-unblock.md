---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-07-06-dgfy-cashier-terminal-login-unblock
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_DGFY_CASHIER_UNLOCK_ADMIN_READINESS_BYPASS
policy_version: 2026.07.06
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js,npm run check:architecture,npm run check:compliance,npm run lint:docs
rollback_note: Revert the DGFY cashier terminal-login unblock commit; no schema migration, payment flow, fiscal calculation, or compliance policy change is introduced.
preflight_result: no_breach
preflight_reason_code: POS_DGFY_CASHIER_UNLOCK_ADMIN_READINESS_BYPASS
preflight_run_at: 2026-07-06T00:00:00+08:00
preflight_request_ref: DGFY-POS-CASHIER-UNBLOCK-2026-07-06
---

# DGFY Cashier Terminal Login Unblock

## Compliance Impact Classification

Major. This slice changes DGFY POS terminal unlock behavior for non-admin cashier users, which is guarded by the POS and terminal compliance surfaces. It does not change payment processing, fiscal computation formulas, receipt numbering, tax calculation rules, or compliance policy evaluation logic.

## Affected Surfaces

1. `frontend/src/features/pos/pages/TerminalPage.jsx` keeps admin setup readiness checks on the admin onboarding path, but removes the admin-only company-info and full user-list dependency from the non-admin DGFY cashier unlock path.
2. `frontend/src/features/pos/__tests__/terminalViewModeContracts.test.js` now proves the cashier unlock path does not block on the prior "POS setup is incomplete" readiness error while still reaching POS session creation and terminal selection checks.
3. The DGFY POS access contract remains aligned with `docs/testing/dgfy-company-access-security-control-matrix.md`: invited cashiers must be scoped to the selected company and terminal locations, while non-admin cashiers must not depend on admin-only setup endpoints before unlock.

## Compliance Preconditions

1. Accepted DGFY membership, active tenant status, POS permission, active registered terminal, terminal location binding, and authorized terminal location remain required before POS use.
2. Admin users with incomplete setup still route through the POS onboarding/setup flow rather than bypassing setup readiness.
3. Non-admin cashiers use only their selected tenant user payload for readiness snapshot users, avoiding admin-only company-info and user-list calls before unlock.
4. Existing POS session creation, terminal registry normalization, terminal selection, and location-authorization checks remain in effect.
5. No payment gateway, refund, settlement, VAT, service charge, DGFY fee, receipt numbering, or fiscal receipt calculation behavior is modified.

## Verification Evidence

- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`
