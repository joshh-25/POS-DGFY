---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-pos-accountable-void-refund-lifecycle
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: ACCOUNTABLE_POS_VOID_REFUND
policy_version: 2026.08.20
verification_evidence: backend POS refund and reporting matrix 22 suites 190 tests,frontend POS and F&B regression 104 files 515 tests,authenticated administrator void and cashier cash-refund E2E 1 passed,POS production build,architecture compliance ADR and docs checks,landlord migration and tenant schema report 14 of 14
rollback_note: Revert the POS refund API and UI commits together while retaining the additive adjustment tables and existing evidence rows. Do not drop or rewrite adjustment or split-allocation data. Disable the Refund action if backend rollback precedes frontend rollback; internal void continues under ADR 0031 without claiming that customer money was refunded.
preflight_result: no_breach
preflight_reason_code: APPROVED_ACCOUNTABLE_POS_REFUND
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: ISSUE-754-POS-VOID-REFUND-LIFECYCLE
---

# POS Accountable Void and Refund Lifecycle

## Compliance Impact Classification

Major. The change affects POS financial evidence, physical cash-drawer
movement, provider-refund submission, payment-status transitions, cashier/shift
attribution, and immutable close/Z-reading reporting. It does not change the
recognized-sales formula or rewrite historical fiscal snapshots.

## Affected Surfaces

1. POS internal void authorization, reason capture, actor attribution, fiscal
   and inventory reversal evidence.
2. Cash refunds and their atomic linked `cash_out` drawer event.
3. Merchant-owned digital reversal evidence and explicit confirmation.
4. Server-verified provider-owned online refunds and retry/failure evidence.
5. Split-tender allocation reversal and payment-status aggregation.
6. POS History, receipts, cashier shift history, daily reports, and Z-reading
   disclosure of post-close adjustments.

## Compliance Preconditions

1. An internal void never claims customer money was refunded. The server
   classifies the required financial follow-up from persisted tender evidence.
2. The original cashier and shift remain immutable. Administrator no-shift
   void records a separate actor with a null actor shift.
3. Physical cash movement requires `pos:cash_drawer_adjust` and the acting
   cashier's owned open shift; one successful refund creates one linked drawer
   event under an idempotent database transaction.
4. Walk-in merchant-owned GCash/Maya/card/bank transfers never call PayMongo.
   They require external evidence and explicit later confirmation.
5. Provider refunds derive provider, payment ID, amount, currency, method, and
   commerce-session ownership from server records and fail closed on mismatch.
6. Post-close adjustments are append-only. Prior close summaries and Z-reading
   snapshots are never updated or recalculated.
7. Migrations are additive. Runtime schema auditing and tenant repair include
   every new table, column, and index; rollback preserves existing evidence.

## Verification Evidence

- Backend POS refund, void, adjustment, provider, split, history, and reporting
  matrix: 22 suites and 190 tests passed.
- Frontend POS/F&B regression: 104 test files and 515 tests passed.
- Authenticated state-changing Chrome E2E passed: closed-shift cash sale,
  administrator no-shift void, cashier cash refund, linked drawer event,
  cashier-history attribution, and event-date report evidence.
- POS production build passed with 4,072 modules transformed.
- Landlord migrations are current and tenant schema report passed 14/14 at
  capability version `2026-08-20.1`.
- Architecture, controller boundaries, compliance API contracts, strict ADR,
  and governed-document lint passed.

## Rollback Considerations

Revert backend routes/use cases, frontend workflow, and their tests together.
Leave the additive adjustment table, split-allocation columns, and all existing
evidence rows in place. A partial rollback must hide/disable the POS Refund
action until the matching backend contract is available. No rollback may
reclassify an internal void as a completed customer refund or rewrite a saved
shift close/Z-reading.
