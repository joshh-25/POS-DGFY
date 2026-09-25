---
status: accepted
authority_level: authoritative
owner: pos
date: 2026-09-24
last_reviewed: 2026-09-24
review_by: 2027-03-24
applies_to: architecture_decision
topic: pos_parked_sale_stock_and_high_risk_approval_lifecycle
supersedes: 0065-pos-shared-parked-sales-and-cashier-handoff.md (Decision 8 only)
---

# ADR 0086: POS Parked-Sale Stock and High-Risk Approval Lifecycle

## Status

Accepted on 2026-09-24 following the operator's explicit approval. This ADR
supersedes only ADR 0065 Decision 8; all other parked-sale ownership and
handoff rules in ADR 0065 remain in force.

## Context

ADR 0065 Decision 8 defines parking as free of inventory effects. The approved
POS behavior instead treats a parked cart as goods already consumed: stock must
be deducted when the cashier parks it, while payment, receipt, Z-reading, and
sales-history effects remain deferred until checkout. Voids and parked-sale
cancellations also need a reason and independent Back Office review, without
creating a second stock or transaction mutation owner.

## Decision

1. Parking resolves stock effects through the canonical POS checkout planner
   and applies them through Inventory-owned commands in the same database
   transaction that saves the parked snapshot. A failed issue rolls back the
   park operation. `[binding]`
2. Re-parking reverses the currently active movements for the old parked-sale
   revision and issues the revised snapshot within one transaction. A failure
   leaves both the old snapshot and its stock effects intact. `[binding]`
3. Checkout of a claimed parked snapshot honors its stored prices and does not
   issue the already-deducted snapshot lines again. New lines use ordinary POS
   validation and stock handling. A missing or unavailable historical item may
   settle as a note-only line at its stored price, without another stock issue.
   `[binding]`
4. Cancelling a parked sale requires a reason and creates a pending Back Office
   approval request. While pending, the row is not payable or editable. Approval
   reverses its active Inventory-owned movements and marks it cancelled in one
   transaction; rejection restores its prior `parked` or `claimed` status and
   leaves stock untouched. `[binding]`
5. Voiding a POS transaction requires a reason and creates a pending Back
   Office approval request. Approval invokes the canonical POS void use case,
   which records the void and reverses checkout-created and linked parked-sale
   movements in the same transaction. The internal void does not itself refund
   customer money; existing tender-specific refund workflows remain required.
   Rejection leaves transaction and stock unchanged. `[binding]`
6. Back Office supplies reviewer authorization and the decision surface only.
   POS owns transaction/parked-sale lifecycle changes; Inventory owns all stock
   movements and FIFO reversals. A requester cannot approve or reject their
   own request. Request evidence, decisions, reasons, and execution outcomes
   are audited. `[binding]`
7. Approval execution is idempotent and atomic with its approval state. Cache
   invalidation is post-commit and best-effort; it cannot reverse a committed
   stock or transaction change. `[binding]`

## Consequences

- New parked sales reduce location stock immediately; payment remains a
  separate checkout action.
- Existing parked rows without `inventory_deducted_at` are treated as not yet
  issued. Their eventual checkout follows the ordinary stock path; cancelling
  them does not invent a stock return.
- During rollout, all POS API writers must run the compatible lifecycle code
  together. A mixed old/new writer set could update a snapshot without
  reconciling its stock movements.
- A completed sale void remains distinct from a payment refund. Paid-cash and
  merchant/provider-owned tenders continue through their existing refund
  workflows.

## Validation

1. Backend tests cover park/re-park stock movements, void and cancellation
   requests, approval/rejection, self-review denial, transaction rollback,
   idempotency, and preservation of historical parked prices.
2. Schema and migration tests cover `cancel_pending`, parked stock evidence,
   and approval action types; rollback never erases stock-ledger evidence.
3. POS and Back Office tests confirm pending requests are presented as pending,
   reviewer-visible reasons/targets are shown, and rejected requests do not
   appear as completed mutations.
4. Architecture, compliance, lint, and scoped build checks pass before review.
   A live tenant-database/browser acceptance run remains a deployment gate.

## References

- [ADR 0065](0065-pos-shared-parked-sales-and-cashier-handoff.md)
- [ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posExceptionApprovalUseCases.js`
- `apps/dgfy-api/src/modules/inventory/commands/stockCommandService.js`
- `docs/database/schema.md`
