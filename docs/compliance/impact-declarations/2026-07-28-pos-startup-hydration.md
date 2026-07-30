---
status: reference
owner: engineering
last_reviewed: 2026-07-28
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-28-pos-startup-hydration
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.28
verification_evidence: npm --prefix frontend exec vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js
rollback_note: Revert the terminal startup readiness resets and onboarding-state snapshot fields in TerminalPage.jsx; no checkout, payment, receipt, shift accounting, authorization, or persistence contract is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-28T18:45:00+08:00
preflight_request_ref: POS-STARTUP-HYDRATION
---

# POS Startup Hydration

## Compliance Impact Classification

Major. The affected POS terminal page is governed by the `pos` and `terminal` compliance surfaces. The change delays protected workspace rendering until authentication and tenant setup hydration are complete and preserves the authoritative onboarding state in the loaded setup snapshot.

## Affected Surfaces

1. `frontend/src/features/pos/pages/TerminalPage.jsx` resets the startup-ready gate before terminal unlock and company-selection transitions.
2. `frontend/src/features/pos/pages/TerminalPage.jsx` no longer replaces the hydrated setup snapshot with a synthetic incomplete state while the terminal is locked.
3. `frontend/src/features/pos/__tests__/terminalViewModeContracts.test.js` verifies the startup gate and locked-state behavior.

## Compliance Preconditions

1. No checkout totals, discounts, taxes, payments, receipts, refunds, voids, or shift cash calculations are changed.
2. No backend endpoint, authorization policy, database schema, or persisted transaction record is changed.
3. Existing onboarding remains authoritative when incomplete; the change only prevents an intermediate protected page from flashing before hydration finishes.

## Verification Evidence

1. `npm --prefix frontend exec vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js` - 45 tests passed.
2. Repository compliance and documentation guards run during commit.
