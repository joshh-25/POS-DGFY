---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-16
declaration_id: 2026-10-16-pos-pending-cash-refund-recovery
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: focused POS Vitest suites (49 tests), focused POS API Jest suites (22 tests), POS/IMS/Storefront production builds, targeted POS lint, architecture checks, repository compliance gate, git diff --check, read-only staging verification
rollback_note: Revert the pending cash-refund recovery UI, transaction-detail financial follow-up section, focused regression tests, and this declaration together; the existing administrator no-shift void exception, cash-drawer ownership rule, server APIs, database schema, and persisted transaction records remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-16T12:11:42+08:00
preflight_request_ref: NOT-EXECUTED-2519-PENDING-CASH-REFUND
---

# POS pending cash-refund recovery

## Compliance Impact Classification

Major because the changed shared POS paths are subject to the repository's major classification
floor for the `pos` and `terminal` surfaces, and the user-facing flow describes a payment-related
cash-refund follow-up. This change improves recovery and evidence display after an administrator
records a valid no-shift void; it does not move financial authority into the client or alter the
existing server-side cash-drawer ownership checks.

## Affected Surfaces

- `pos` — History refund workflow, Shift Controls recovery navigation, and transaction details.
- `terminal` — active-terminal navigation between History and Shift Controls.
- `payments` — presentation of the server-provided cash-refund requirement and amount; actual
  cash-refund and cash-drawer mutations remain server-authorized.

## Compliance Preconditions

- The documented administrator no-shift void exception remains unchanged.
- Cash can still be returned only by an acting cashier with an open shift and drawer permission.
- The client continues to block cash-refund submission when no acting shift is active and passes
  the active shift to the existing refund use case when retrying.
- No API route, database field, migration, payment calculation, authorization rule, or persisted
  transaction record is changed.
- A live compliance preflight was not run in this local PR workspace; the `NOT-EXECUTED-*`
  reference is the repository's accepted PR-open state and is expected to be reconciled by the
  compliance sweep after the declaration reaches `develop`.

## Verification Evidence

- 49 focused POS frontend tests passed, covering no-shift recovery navigation, active-shift retry,
  duplicate-submit prevention, and transaction-detail financial follow-up evidence.
- 22 focused POS API tests passed for global PIN policy, refund authorization, cash-refund
  idempotency/shift ownership, and void financial-outcome classification.
- POS, IMS, and Storefront production builds passed.
- Targeted POS lint passed with no errors; only existing warnings remain.
- Read-only staging verification confirmed the current deployment remains on POS v1.40.0 and does
  not yet contain the new recovery action or financial follow-up section.
