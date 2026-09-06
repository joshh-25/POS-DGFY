---
status: reference
owner: engineering
last_reviewed: 2026-09-06
declaration_id: 2026-09-06-pos-exact-centavo-payment
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.06
verification_evidence: 39 focused POS checkout Vitest tests; POS production build; git diff --check
rollback_note: Revert the shared centavo comparison helper and its two POS checkout consumers. No API, database, receipt, or persisted transaction cleanup is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T17:09:54.586Z
preflight_request_ref: PREFLIGHT-34047481447-2026-09-06-POS-EXACT-CENTAVO-PAYMENT
---

# POS exact-centavo payment acceptance

## Compliance Impact Classification

Major. The compliance floor is set by changes under
`packages/web-core/src/features/pos/`. The change corrects cashier-side payment
sufficiency validation without changing payment authorization or fiscal rules.

## Affected Surfaces

- POS checkout payment entry and Confirm-button readiness.
- Cash, GCash, Maya, Card, Bank Transfer, and QR Ph single-payment methods.
- Shared POS financial workflow validation used by the checkout submission path.

## Compliance Preconditions

- The payable amount and entered payment are compared at integer-centavo precision,
  matching the two-decimal amount displayed to and accepted from the cashier.
- A payment one centavo below the displayed payable total remains insufficient.
- Employee Credit eligibility and split-payment completion rules remain unchanged.
- Tax, discount, receipt, API, database, and persisted transaction contracts remain
  unchanged.

## Verification Evidence

- Focused POS checkout Vitest suites: 3 files and 39 tests passed.
- POS production build passed.
- `git diff --check` passed.
- No browser or APK test was performed; the user will validate the physical POS flow.

Live compliance preflight has **not been executed** for this branch-local change.
The automated compliance sweep must replace the `NOT-EXECUTED-*` reference with
real evidence before ordinary promotion to main.
