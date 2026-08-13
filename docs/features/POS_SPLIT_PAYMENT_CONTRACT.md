---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-13
review_by: 2027-02-13
applies_to: pos_split_tender_v1
topic: pos_split_tender_contract
---

# POS Split Payment Contract

This document is the Phase 57 product and transport contract for split tender,
the Phase 58 persistence foundation, the Phase 59 collection transport, the
Phase 60 cashier collection UI, the Phase 61 atomic completion operation, and
the Phase 62 provider-confirmation and reporting hardening, the Phase 63
PayMongo reconciliation and refund-safety gate, the Phase 64 manual walk-in
digital tender correction, the Phase 65 manager reconciliation record, and
the Phase 66 quick two-way cashier entry, the Phase 67 refresh-recovery sale
lock and read-only snapshot summary, and the Phase 68 MariaDB snapshot
serialization correction, and the Phase 69 automatic-finalization cashier
flow simplification, the Phase 74 silent recovery and explicit-resume
correction, the Phase 82 sequential cashier-flow simplification, and the Phase
83 Cash-and-GCash two-field cashier flow, and the Phase 84 configurable
payment-row cashier flow.
The governing architecture decision is
[ADR 0062](../architecture/adr/0062-pos-split-tender-and-manual-walk-in-payment-recording.md).

## Goal

Allow a cashier to collect one POS sale with multiple payment methods:

```text
Total       PHP 1,250.00
Cash          PHP 500.00
GCash         PHP 750.00
Paid        PHP 1,250.00
Remaining       PHP 0.00
```

The sale remains one transaction. The payment methods are separate allocation
rows in the server-owned collection record.

## V1 scope

Included:

- Cash, GCash, Maya, Card, and Bank Transfer.
- Configurable Method of Payment plus Amount rows, with GCash and Cash visible
  by default and additional unused methods available on demand.
- One completion action for all active rows, with non-cash persisted before
  cash so change is calculated against the final non-cash balance.
- Cash tendered amount and server-calculated change.
- Optional reference for store-owned GCash, Maya, card terminal, and bank
  transfers.
- Explicit cashier confirmation that a manual digital payment was received.
- Explicit accept and cancel actions, plus automatic completion at zero balance.
- Refresh recovery of the active collection session.
- One sale, one inventory posting, one receipt/fiscal result, and one audit
  trail after successful completion.

Deferred:

- Equal split by two, three, or more customers.
- Split by person, item, table, or guest.
- Employee Credit combined with another tender.
- Offline split payment or offline digital confirmation.
- New provider checkout integrations and automatic provider refunds.

## Cashier flow

1. Cashier builds or resumes one active cart and selects Pay.
2. Cashier chooses Split Payment.
3. The server creates or resumes a scoped payment session from the checkout
   inputs and authoritative total.
4. The UI displays Total, Paid, Remaining, and successful/pending allocations.
5. The UI shows two configurable Method of Payment plus Amount rows, defaulted
   to GCash and Cash. The cashier may change either dropdown or add an unused
   third or later payment method.
6. Every active merchant-owned non-cash row requires explicit receipt
   confirmation. The UI previews non-cash applied, cash applied, cash change,
   and amount still due. Complete Payment is enabled only when the entered
   values cover Remaining without duplicate methods.
7. The server validates the allocation and returns the updated session. The UI
   never increments Paid from local state alone.
8. The UI submits active non-cash rows first and cash last as separate
   idempotent allocations. When Remaining reaches exactly zero, the POS
   requests automatic idempotent completion without another cashier action.
9. The server completes one normal POS checkout transaction atomically and
   returns the canonical receipt contract.

## Operation contract

The Phase 59 transport uses the existing `/pos` router/controller placement.
The operations and semantics below are fixed for this implementation:

| Operation | Required behavior |
| --- | --- |
| Create or resume session | `POST /pos/payment-sessions`; require authenticated POS operator, `pos:transact`, selected terminal/location, and open shift. Repeated idempotency key returns the original session. |
| Read session | `GET /pos/payment-sessions/:id`; return only the active tenant/location/terminal/cashier/shift scope. Include server total, paid, remaining, state, and allocation statuses. |
| Add allocation | `POST /pos/payment-sessions/:id/allocations`; validate method, amount, cash tendered/change, optional reference, and session state under a lock. Store-owned digital tender requires `manual_payment_received=true`, is saved as `payment_provider=merchant_owned`, and becomes successful from that authenticated cashier attestation. Explicit provider-owned attempts remain pending. |
| Confirm digital allocation | `POST /pos/payment-sessions/:id/allocations/:allocation_id/confirm`; accept only a pending non-cash allocation, require the configured server-side HMAC provider verifier to validate the provider event, persist the event identity, and then recalculate Paid under the session lock. Cash cannot use this operation. |
| Reconcile PayMongo allocation | `POST /pos/payment-sessions/:id/allocations/:allocation_id/reconcile`; retrieve the PayMongo Payment server-to-server and accept only exact paid-status, PHP currency, amount, method, payment identity, and POS session/allocation metadata matches. Stable payment/refund identities make retries safe. |
| Cancel allocation/session | `POST /pos/payment-sessions/:id/allocations/:allocation_id/cancel` or `POST /pos/payment-sessions/:id/cancel`; require an allowed actor and reason. Pending/failed attempts may be cancelled; successful cash or merchant-owned tender becomes an auditable reversal; PayMongo-confirmed money requires provider refund evidence. |
| Complete sale | Accept no client authority for totals or paid amounts. Require remaining zero, revalidate checkout inputs, and atomically create one POS transaction. |

Every mutating operation accepts an idempotency key and returns the persisted
result for a safe retry. Duplicate requests must not double-charge, double-count
cash, create a second transaction, or create a second inventory movement.

## Server invariants

- `paid = sum(successful applied amounts)`.
- `remaining = server_total - paid`.
- `remaining` cannot be negative.
- A zero or negative allocation is rejected.
- Cash `applied_amount <= remaining`; `cash_tendered >= applied_amount`;
  `change = cash_tendered - applied_amount`.
- Non-cash `applied_amount <= remaining` and has no change.
- Pending or failed provider-owned payment is excluded from Paid.
- Merchant-owned digital payment is included in Paid only after explicit
  authenticated cashier confirmation; it carries no provider event identity.
- Completion is disabled unless remaining is exactly zero at the canonical POS
  precision.
- Client-supplied totals, balances, stock, selling prices, discount values,
  service fees, and provider status are display inputs only; the server
  revalidates them.
- Successful partial allocations are accountable records. They cannot vanish
  because the browser refreshes, closes, or loses connectivity.
- A completed transaction stores a server-derived `payment_breakdown` snapshot;
  receipts and reports may display it, but allocation rows remain the financial
  source of truth.

## Compatibility and boundaries

- Existing single-tender `POST /pos/checkouts` behavior remains unchanged while
  split tender is introduced additively.
- The existing `pos_transactions.payment_type` snapshot remains readable for
  historical and single-tender rows. A future mixed-payment summary must not
  replace allocation rows as the financial source of truth.
- `employee_credit` remains governed by ADR 0051 and is not accepted as one
  leg of a V1 split session.
- Parked carts remain non-financial snapshots under ADR 0060. Resuming a
  parked cart into split collection is explicit and must not merge carts.
- Split collection is online-only until a separate offline contract is
  approved.

## Security, accountability, and close behavior

- Scope every read and write by tenant, location, terminal, cashier, and shift.
- Do not store PINs, passwords, access tokens, provider secrets, QR
  credentials, or raw card
  data in payment-session snapshots.
- Require the existing POS permissions and terminal/shift guards.
- Record actor, reason, idempotency key, and before/after state for cancellation
  and reversal actions.
- Shift close must surface unresolved sessions with successful allocations and
  require explicit completion, cancellation, or authorized recovery.
- Collected tender contributes to cash accountability only through persisted
  allocation evidence; it is not recognized as completed sales until checkout.

## Phase 58 persistence mapping

The additive tenant-local implementation uses:

- `pos_payment_sessions` for the scoped checkout snapshot, lifecycle state,
  total, denormalized paid/remaining values, parked-sale lineage, and final
  transaction linkage.
- `pos_payment_allocations` for each tender attempt, including status, method,
  applied amount, cash tender/change, provider reference, provider event
  identity, failure details, actor scope, and idempotency evidence.
- `pos_transactions.payment_breakdown` stores the immutable successful-tender
  summary created at atomic completion for mixed-tender receipts and reports.

The allocation rows remain the recalculation source of truth. Session totals are
stored for deterministic reads and reconciliation, then recomputed and checked
by the Phase 59 payment engine under a database lock. The migration is additive,
tenant-schema coverage is registered, and no session/allocation write creates a
completed sale or inventory effect by itself.

## Acceptance gates for Phase 57

- [x] ADR 0061 accepted and linked from the feature contract.
- [x] V1 method scope and deferred capabilities are explicit.
- [x] Session/allocation lifecycle and server invariants are explicit.
- [x] Existing checkout, parked-sale, offline, Employee Credit, receipt, and
      Unified Sales boundaries are preserved.
- [x] API operation semantics and database persistence responsibilities are
      documented without prematurely creating implementation tables or routes.
- [x] Phase 58 is the next eligible phase for additive schema and API work.

## Phase 63 status

Phase 63 is complete: PayMongo allocations have a production server-to-server
reconciliation adapter. The adapter fails closed unless the provider Payment
is paid and matches the allocation's PHP amount, method, payment ID, session
reference, and allocation reference. Provider payment/refund event identities
are replay protected. A full provider refund reverses an incomplete-session
allocation without deleting its original paid evidence; a partial refund is
left unchanged for manual review. Successful digital allocations can no longer
be erased through ordinary cancellation.

## Phase 64 status

Phase 64 replaces the previously planned provider-native checkout direction
with manual walk-in digital tender recording. GCash and Maya use the store's
own QR, cards use the store's own terminal, and transfers use the store's own
account. The POS records the tender method and amount after an explicit cashier
confirmation, stores an optional reference, and never creates a PayMongo
checkout, webhook route, or provider fee for this flow.

Provider initiation, automatic provider refund submission, partial-refund
allocation, and reversal of completed sales remain deferred.

## Phase 65 status

Phase 65 adds shift-scoped reconciliation for store-owned GCash, Maya, card
terminal, and bank-transfer tenders. The server computes expected amounts from
financially recognized in-store single-tender sales and successful
`merchant_owned` split allocations. Online/Storefront payments, PayMongo-owned
allocations, pending/failed attempts, and reversed allocations are excluded.

Managers with `pos:close_day` enter the totals observed in the store's external
statements. Any method-level difference requires a review note. The saved row
contains immutable expected, observed, and variance snapshots plus reviewer,
shift, terminal, location, idempotency, timestamp, and supersession evidence.
A new review appends another row; it never edits the prior review or adjusts a
sale/allocation/provider record.

## Phase 66 status

Phase 66 adds a quick two-way cashier entry for the most common Cash plus
GCash/Maya/Card/Bank Transfer split. The cashier enters cash, the UI calculates
the other amount, and explicit store-received confirmation remains mandatory.
The existing single-allocation entry remains available for uncommon
combinations and extra methods.

The UI still sends one idempotent allocation at a time because allocation rows
remain the financial source of truth. If cash is saved but the other request
fails, the dialog displays the saved cash and prepares only the remaining
payment. It never hides, rolls back locally, or blindly resubmits the cash leg.
No database migration or PayMongo integration is introduced.

## Phase 67 status

Phase 67 hardens refresh recovery when the browser cart draft is empty but a
server-owned split-payment session remains unresolved. The recovered dialog
shows a read-only item summary from the session snapshot, including the saved
quantity, unit price, total, and payment-session reference. Catalog data may
provide the display name, but the stored item ID and server snapshot remain
authoritative.

While the payment session is active, the Current Sale panel shows Payment in
Progress instead of Empty, provides a Resume Payment action, and blocks catalog,
cart, parked-sale, and checkout actions that could start or alter another sale.
The UI releases this lock only after successful completion, valid cancellation,
or a confirmed missing session. It does not rebuild an editable cart from the
financial snapshot.

## Phase 68 status

Phase 68 corrects the tenant-runtime representation of
`pos_payment_sessions.snapshot`. MariaDB may return the JSON column as text,
so the POS repository normalizes it into an object before the session reaches
the payment use case or API response. This lets refresh recovery display the
saved lines and lets atomic completion submit the original server-owned
checkout lines instead of an empty array.

Completion also fails closed with a payment-session recovery error when a
stored snapshot is invalid or contains no lines. It must not call normal
checkout with an empty cart. The correction changes no payment allocation,
transaction, inventory, or schema data and requires no migration.

## Phase 69 status

Phase 69 was completed on 2026-08-13. It removes the extra cashier-facing
completion step from the normal
split flow. When the server returns exactly zero remaining, the POS makes one
automatic, idempotent completion attempt, posts the single transaction and
inventory movement, opens the receipt, and returns Sell to the next sale. The
cashier no longer selects Complete Sale or Keep Session Open.

An active payment-session marker no longer disables the catalog, cart, parked
sales, or ordinary Sell actions globally. If automatic completion is
interrupted, the saved session remains recoverable and shows one Retry Finish
Sale action without looping. Cancellation is shown only before any successful
money is recorded. The server-owned balance, checkout snapshot, allocation
ledger, and atomic completion invariants remain unchanged.

## Phase 74 status

Phase 74 corrects navigation and refresh recovery without changing payment
ownership. Returning to Sell never opens the Split Payment dialog merely
because a browser recovery pointer exists. The POS validates that pointer
against the server in the background and keeps the dialog closed until the
cashier selects Resume Payment.

An open session with no recorded money exposes an explicit Discard Unpaid
action that cancels the server session with an audit reason and clears the
browser pointer. A session with successful money does not expose that shortcut;
the cashier must resume the existing allocation workflow. Completed,
cancelled, missing, malformed, or stale pointers are cleared without creating
a replacement session. Normal Sell controls remain governed by the existing
checkout blocker rather than the recovery marker.

## Phase 82 status

Phase 82 replaces the dual Quick Two-Way Split and Add Another Payment
interfaces with one sequential cashier flow. The cashier selects Cash, GCash,
Maya, Card, or Bank, accepts one amount, then repeats only if the server returns
a remaining balance. The next amount always defaults to that balance.

Cash is labeled Cash Received and provides Exact, PHP 100, PHP 500, and PHP
1,000 shortcuts. Over-tendered cash displays Applied to Bill and Change Due
before submission. Digital partial payments remain capped at Remaining and
retain the explicit store-received confirmation. This is a presentation-layer
simplification only: allocation persistence, idempotency, server-owned totals,
automatic completion, cancellation, recovery, and PayMongo boundaries are
unchanged.

Phase 83 supersedes only the Phase 82 primary presentation. The allocation,
recovery, and automatic-completion behavior remains authoritative.

## Phase 83 status

Phase 83 presents Cash and GCash as two manual fields in one primary form.
GCash is recorded first, then Cash Received is recorded against the resulting
server balance. This order supports a PHP 300 sale paid with PHP 250 GCash and
PHP 100 cash: PHP 250 is applied to GCash, PHP 50 is applied to cash, and PHP
50 is returned as change.

The form accepts cash-only, GCash-only, or mixed Cash-and-GCash completion.
GCash cannot exceed Remaining, GCash receipt confirmation is mandatory when a
GCash amount is entered, and mixed entry cannot include cash after GCash fully
covers the balance. If GCash persists but the cash request fails, the saved
GCash remains visible and retry submits only cash. Maya, Card, and Bank
Transfer remain under More Payment Methods. No database, API, PayMongo,
receipt, reporting, or payment-ownership contract changes.

## Phase 84 status

Phase 84 supersedes the Phase 83 fixed-method presentation with configurable
payment rows. Two rows are visible by default: Method of Payment plus Amount,
preselected as GCash and Cash. Each row can use Cash, GCash, Maya, Card, or Bank
Transfer, and Add Another Payment adds an unused method when a third or later
tender is needed.

Each active method may appear only once. Merchant-owned non-cash rows still
require explicit store-received confirmation and may not exceed Remaining in
aggregate. Cash may over-tender; the preview shows non-cash applied, cash
applied, change due, and still due. One Complete Payment action records active
non-cash rows first and cash last, each with its own idempotency key, so cash
change is calculated against the final digital balance. Successful earlier
rows remain visible and are cleared from the retry form if a later row fails.
The server-owned allocation, recovery, automatic-completion, and PayMongo
boundaries are unchanged.
