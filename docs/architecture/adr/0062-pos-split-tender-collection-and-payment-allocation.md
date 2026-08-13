---
status: superseded
authority_level: historical
owner: pos
date: 2026-08-12
last_reviewed: 2026-08-13
review_by: 2027-02-12
applies_to: architecture_decision
topic: pos_split_tender_collection
superseded_by: 0063-pos-split-tender-and-manual-walk-in-payment-recording.md
---

# ADR 0062: POS Split-Tender Collection and Payment Allocation

## Status

Superseded on 2026-08-13 by ADR 0063. Use ADR 0063 for current split-tender
and store-owned walk-in payment decisions.

## Context

The POS checkout contract currently creates one atomic `pos_transactions` row
with one `payment_type`, plus optional cash and provider reference snapshots.
Cashiers need to collect one sale with more than one tender, such as PHP 500
cash plus PHP 750 GCash, without creating multiple sales or allowing the
browser to become the financial source of truth.

The change crosses POS checkout, payment evidence, cash accountability,
receipts, reporting, and fiscal output. It must also preserve the parked-sale
boundary from ADR 0061: parking and an unfinished payment collection must not
create inventory, a completed-sale row, a receipt, or a Z-reading sale total.

## Decision

1. V1 supports split by payment method only. One customer sale remains one POS
   transaction; equal split, split by person, split by item, table transfers,
   and restaurant guest billing are deferred. `[binding]`
2. Split collection uses a server-owned payment session and payment-allocation
   records before final checkout. The existing one-shot checkout path remains
   backward-compatible for single-tender sales until a later implementation
   phase deliberately migrates it. `[binding]`
3. The payment session is scoped to the authenticated tenant, location,
   terminal, cashier, and open shift. It carries a server-validated checkout
   snapshot and is not a second cart or a substitute for a parked sale.
   `[binding]`
4. A payment session may be `open`, `partially_paid`, `ready_to_complete`,
   `completed`, or `cancelled`. An allocation may be `pending`, `successful`,
   `failed`, `cancelled`, or `reversed`. There is no silent timeout or
   automatic expiry in V1; unresolved sessions are surfaced during shift
   close for explicit recovery or cancellation. `[default]`
5. Each allocation records the method, applied amount, status, reference when
   applicable, cashier, shift, terminal, location, idempotency key, and audit
   timestamps. Cash additionally records tendered amount and change. Secrets,
   payment credentials, PINs, and provider tokens are never stored in the
   session or allocation snapshot. `[binding]`
6. The server calculates `paid` from successful applied allocations and
   `remaining` from the server-owned total. Zero or negative allocations are
   rejected. Cash may be tendered above the remaining balance, but only the
   remaining amount is applied and the difference is recorded as change. A
   non-cash allocation must not exceed the remaining balance. `[binding]`
7. Non-cash success requires the existing payment-handoff and compliance
   contract. A pending or failed provider handoff is not included in `paid`,
   and the cashier cannot complete the sale from client-side confirmation.
   `[binding]`
8. Completion is one idempotent server transaction. It requires `remaining`
   to be exactly zero at the canonical POS precision, then creates the single
   POS transaction, lines, inventory effects, receipt/fiscal evidence, and
   completed-session linkage together. A retry returns the original result;
   it must not create a second sale, stock movement, receipt, or payment
   allocation. `[binding]`
9. Partial successful payments are durable and auditable but are not counted
   as completed sales, fiscal output, inventory effects, or Z-reading sales
   until completion. Shift close must not silently abandon a session that has
   collected cash or another successful tender. `[binding]`
10. Payment cancellation, reversal, void, and refund are append-only actions.
    No successful allocation or posted financial evidence is deleted or
    rewritten. Provider refunds remain in the provider/commercial payment
    boundary and are not fabricated by POS. `[binding]`
11. V1 split tender supports the existing cashier POS methods `cash`, `gcash`,
    `maya`, `card`, and `bank_transfer`. `employee_credit` remains a complete
    single-tender workflow under ADR 0051; `qrph` commerce sessions remain a
    separate Storefront/provider contract. `[default]`
12. Split tender is online-only in V1. The existing offline POS contract
    remains cash-only and operator-synchronized; no offline digital or split
    collection is implied by this ADR. `[binding]`
13. The implementation follows `routes -> controllers -> usecases ->
    repositories -> models`. POS owns tenant-scoped collection orchestration;
    the read-only Unified Sales module remains a reporting consumer and never
    becomes a payment write path. `[binding]`

## Consequences

- Cashiers get one fast split-payment flow while sales, inventory, receipts,
  and reports retain one sale identity.
- Payment sessions require durable tenant storage, idempotency, locking, and
  shift-close recovery before the UI can be enabled.
- Reports must distinguish collected tender from completed sales and must not
  treat cash tendered or change as revenue.
- Existing single-tender checkout remains stable during the additive rollout.
- Refund and provider reconciliation work remains a later implementation gate;
  this ADR does not authorize a new payment-provider integration.

## Amendments

### 2026-08-12 — PayMongo read-only reconciliation adapter

Phase 63 authorizes one bounded provider integration: authenticated POS
operators may reconcile a tenant-local digital allocation against a PayMongo
Payment resource. The adapter is read-only and must verify paid status, PHP
currency, exact allocation amount, payment method, payment identity, and exact
session/allocation metadata before changing the allocation ledger. Stable
payment and refund identities provide replay protection.

This amendment does not authorize POS to create provider payments, submit
automatic refunds, expose a tenant-local public webhook route, accept partial
refunds automatically, or reverse an already completed POS sale. A successful
digital allocation cannot be cleared through ordinary POS cancellation; a
full provider refund may be observed and recorded as a `reversed` allocation
only while its payment session remains incomplete. All binding decisions above
remain unchanged.

## References

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`
- `docs/architecture/adr/0051-pos-employee-credit-tender-and-ledger.md`
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
