---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-16
declaration_id: 2026-10-16-pos-pending-cash-refund-recovery
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: focused POS Vitest regression suites, POS API handler and use-case regression suites, automatic-refund telemetry regression coverage, POS production build, local POS UI verification, repository compliance gate, git diff --check, read-only staging verification
rollback_note: Revert the automatic cash-refund void path and its product-usage telemetry, pending cash-refund recovery UI, active-shift recognition and terminal-availability guards, F&B navigation visibility change, focused regression tests, and this declaration together; the existing administrator no-shift void exception, cash-drawer ownership rule, database schema, and persisted transaction records remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-16T12:11:42+08:00
preflight_request_ref: NOT-EXECUTED-2519-PENDING-CASH-REFUND
---

# POS void, cash-refund, and shift recovery

## Compliance Impact Classification

Major because the changed shared POS paths are subject to the repository's major classification
floor for the `pos` and `terminal` surfaces, and the user-facing flow describes a payment-related
cash-refund follow-up. This change adds a server-authorized automatic cash-refund path for eligible
paid cash voids, preserves recovery after an administrator records a valid no-shift void, restores
an authenticated owner's active shift when a stale branch filter hides it, and fails closed while
terminal availability is unverified. It does not move financial authority into the client or
weaken the existing server-side cash-drawer and shift-ownership checks.

## Affected Surfaces

- `pos` — History void-and-refund action, pending refund workflow, Shift Controls recovery
  navigation, and transaction details.
- `terminal` — active-terminal navigation between History and Shift Controls, active-shift
  recognition, terminal availability, and primary navigation visibility.
- `payments` — presentation of the server-provided cash-refund requirement and amount; actual
  cash-refund and cash-drawer mutations remain server-authorized.

## Compliance Preconditions

- The documented administrator no-shift void exception remains unchanged.
- Cash can still be returned only by an acting cashier with an open shift and drawer permission.
- A cash refund is recorded automatically only when the server confirms paid single-tender cash,
  an open owned shift, and the acting user's drawer-adjustment permission.
- The void and automatic cash-out evidence share one database transaction; a failed automatic
  refund does not leave a committed void behind when the automatic path was eligible.
- A no-shift administrator void still completes the internal void and returns an explicit pending
  cash-refund state; no cash movement is attempted without an eligible shift.
- The existing manual cash-refund endpoint remains available for recovery and keeps its own
  idempotency and authorization rules.
- An authenticated user's own open shift may be recovered through a terminal-only lookup when a
  stale location filter returns no shift; the server's owner scope remains authoritative, and an
  `occupied_by_other` terminal is never adopted.
- Shift opening stays disabled while branch terminal availability is loading or unavailable, and
  confirmed occupancy by another cashier remains blocked.
- F&B service is hidden only from the primary POS navigation; its existing route, capability
  checks, and backend remain unchanged.
- No database field or migration is changed; the API accepts an additive `auto_refund` request
  intent and the server remains the authority for payment and cash-drawer mutations.
- A completed automatic cash refund emits the existing `pos_cash_refund_completed` product-usage
  event with transaction, shift, and drawer-event identifiers plus `automatic: true`; idempotent
  replays do not emit a duplicate event. This changes observability only and does not change
  financial authority or the event schema.
- A live compliance preflight was not run in this local PR workspace; the `NOT-EXECUTED-*`
  reference is the repository's accepted PR-open state and is expected to be reconciled by the
  compliance sweep after the declaration reaches `develop`.

## Verification Evidence

- Focused POS frontend tests passed for automatic-refund success, no-shift pending recovery,
  active-shift retry, duplicate-submit prevention, transaction-detail financial follow-up,
  active-shift visibility, operational refresh sequencing, and F&B navigation visibility.
- Focused POS API tests passed for atomic void-and-refund execution, caller-owned transaction
  boundaries, global PIN policy, refund authorization, cash-refund idempotency/shift ownership,
  void financial-outcome classification, and automatic-refund handler telemetry.
- The related API handler, cash-refund use-case, and F&B contract suites passed 111/111 tests;
  the handler telemetry suite passed 38/38 tests with explicit idempotent-replay coverage.
- POS production build passed; only existing Vite chunk-placement warnings were emitted.
- Local POS UI verification confirmed the F&B navigation entry is absent, the direct F&B route
  remains reachable, and no browser console errors were emitted.
- Read-only staging verification confirmed the current deployment remains on POS v1.40.0 and does
  not yet contain the new recovery action or financial follow-up section.
