---
status: amended
authority_level: authoritative
owner: pos
date: 2026-08-13
last_reviewed: 2026-08-31
review_by: 2027-02-13
applies_to: architecture_decision
topic: pos_split_tender_collection
---

# ADR 0063: POS Split Tender and Manual Walk-in Payment Recording

## Status

Amended (2026-08-13). This ADR supersedes ADR 0062. Read the Amendments
section last.

## Context

Walk-in stores commonly accept GCash or Maya through a merchant-owned printed
QR, cards through a merchant-owned terminal, and transfers through a
merchant-owned bank account. These payments do not pass through DGFY or
PayMongo. The POS needs to record the cashier-observed tender breakdown, such
as PHP 500 cash plus PHP 750 GCash, without creating a PayMongo checkout or
misrepresenting the record as provider-verified.

The existing split-payment ledger already owns the tenant-local session,
allocation amount, method, cashier, shift, terminal, location, optional
reference, status, and confirmation time. The correction therefore changes
the authorization meaning of one allocation class rather than adding a new
financial store or provider integration.

## Decision

1. One split-tender collection completes as one POS transaction. Equal split,
   split by person, item, table, or guest, and Employee Credit mixed tender
   remain deferred. `[binding]`
2. Split collection uses server-owned payment sessions and allocation rows.
   Allocation rows remain the financial source of truth; the existing
   single-tender checkout remains backward compatible. `[binding]`
3. Every session and mutation is scoped to the authenticated tenant, location,
   terminal, cashier, and open shift. Client totals and balances are never
   authoritative. `[binding]`
4. V1 methods are `cash`, `gcash`, `maya`, `card`, and `bank_transfer`.
   Store-owned GCash/Maya QR, card terminal, and bank-account tenders are
   classified as `merchant_owned`; they are separate from PayMongo and
   Storefront commerce payments. `[binding]`
5. A merchant-owned digital allocation may become successful from an explicit
   authenticated cashier attestation that the store received the money. The
   server persists the method, applied amount, `merchant_owned`
   classification, cashier/shift/terminal/location, optional customer or
   terminal reference, idempotency evidence, and confirmation time. It must
   never claim a provider event or provider verification. `[binding]`
6. The confirmation action must be explicit in the UI and request. Selecting
   a digital method alone is insufficient. Missing confirmation fails closed,
   and duplicate requests are idempotent. `[binding]`
7. A merchant-owned reference number is optional because a printed store QR
   may not expose a usable transaction reference at the counter. When entered,
   it is an audit aid, not proof that DGFY verified payment. `[default]`
8. Explicit PayMongo allocations retain server-to-server verification from
   ADR 0062's Phase 63 amendment: paid status, PHP currency, exact amount,
   method, payment identity, session/allocation metadata, and replay evidence
   must match before success. Manual attestation cannot relabel or bypass a
   PayMongo allocation. `[binding]`
9. `paid` is the sum of successful applied allocations; `remaining` is the
   server-owned total minus `paid`. Non-cash cannot exceed remaining. Cash may
   exceed remaining only as tender, with server-calculated change. `[binding]`
10. While a payment session is incomplete, successful cash or merchant-owned
    tender may be corrected only through an append-only reversal with the
    authenticated cashier and a required reason. PayMongo-confirmed tender
    still requires provider refund evidence. Completed-sale void/refund and
    fiscal effects remain governed by their existing workflows. `[binding]`
11. Completion remains one idempotent server transaction and requires exactly
    zero remaining balance. It creates one sale, inventory movement set,
    receipt/fiscal result, and immutable payment breakdown. `[binding]`
12. No walk-in manual allocation creates a PayMongo checkout, public webhook,
    platform fee, provider fee, tenant revenue settlement row, or automatic
    refund. PayMongo remains available only through explicitly provider-owned
    flows. `[binding]`
13. Secrets, PINs, payment credentials, full card data, provider tokens, and
    QR credentials are never stored in payment records. `[binding]`
14. Split tender remains online-only and follows `routes -> controllers ->
    usecases -> repositories -> models`. Unified Sales is a read consumer, not
    a payment write path. `[binding]`

## Consequences

- The cashier can record a UTAK-style cash plus store-GCash sale quickly.
- Reports and receipts preserve the tender split without implying PayMongo
  processed the merchant-owned leg.
- Cashier attestation is operational evidence, not independent provider proof;
  stores must reconcile their own QR, terminal, and bank statements.
- PayMongo reconciliation remains available for historical or explicitly
  PayMongo-owned allocations and cannot be triggered by the manual UI flow.
- No additive database migration is required because the allocation ledger
  already contains every required audit field.

## Amendments

### 2026-08-13: Shift-scoped manager reconciliation evidence

The store-reconciliation consequence is implemented as an additive,
tenant-local manager review record:

1. The server computes the expected merchant-owned total per shift. It counts
   financially recognized in-store single-tender GCash, Maya, card, and bank
   transfer sales plus successful `merchant_owned` split allocations. It
   excludes online/Storefront payments, PayMongo-owned allocations, pending or
   failed allocations, and append-only reversals. `[default]`
2. A manager with `pos:close_day` enters only the observed external totals and
   an optional note. A method-level variance requires a note. The client cannot
   provide expected totals, status, reviewer identity, or variance. `[default]`
3. Every review is an immutable `pos_merchant_tender_reconciliations` row with
   expected, observed, and variance snapshots, shift/location/terminal scope,
   reviewer, timestamp, idempotency evidence, and optional supersession link.
   A later review appends a new row and never updates or deletes prior evidence.
   `[default]`
4. Reconciliation never changes a POS transaction, payment allocation,
   receipt, inventory movement, fiscal document, settlement row, or provider
   state. It is operational review evidence only. `[binding]`

### 2026-08-31: Proof-of-payment image on a balance settlement (#965, Phase 204)

Clause 7 above is `[default]`; per ADR 0039's tier rules, the cheapest correct route for extending
it is this dated Amendments block in the same PR, not a new superseding ADR. Confirmed with Pat
before landing (#965 explicitly asked for that confirmation given clause 3 below touches a
`[binding]`-adjacent guarantee even though its own text is new).

1. A proof-of-payment image may be attached to a recorded merchant-owned settlement. It **extends**
   the clause-7 audit aid; it does **not** become independent verification. `[default]`
2. Clause 5 `[binding]` is **unweakened**: an attached image is cashier-captured operational
   evidence and must never be presented, in UI copy or in any serialized field, as DGFY having
   verified the payment against a provider. `[binding]` — restated, not amended.
3. Proof imagery is served only through an authenticated, tenant-scoped route; no public or static
   path may serve it. `[binding]`
4. Attach-once in this phase; replacement/deletion is not authorized and is deferred. `[default]`

## References

- ADR 0077 (POS Cheque Tender Method) — scoped-supersedes clause 4 only, replacing the V1
  five-tender enumeration with a six-tender set adding `cheque`. Clauses 1, 2, 3, and 5 through 14
  are unaffected.
- `docs/compliance/impact-declarations/2026-08-31-pos-balance-payment-proof-image.md` — Phase 204
  (#965), the proof-of-payment image amendment above.
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`
- `docs/architecture/adr/0051-pos-employee-credit-tender-and-ledger.md`
- `docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md`
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
