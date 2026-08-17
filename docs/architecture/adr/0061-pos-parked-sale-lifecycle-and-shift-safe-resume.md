---
status: superseded
authority_level: historical
owner: pos
date: 2026-08-12
last_reviewed: 2026-08-13
review_by: 2027-02-12
applies_to: architecture_decision
topic: pos_parked_sale_lifecycle_and_shift_safe_resume
superseded_by: 0065-pos-shared-parked-sales-and-cashier-handoff.md
---

# ADR 0061: POS Parked Sale Lifecycle and Shift-Safe Resume

## Status

Superseded on 2026-08-15 by ADR 0064. Use ADR 0064 for current parked-sale
visibility, ownership, and cashier-handoff decisions.

## Context

POS currently has one browser-local cart draft for refresh and crash recovery.
That draft is shift-scoped and temporary; it is not a multi-sale workflow. The
requested Park Sale behavior needs a cashier to save the current cart, start a
new sale immediately, and keep the saved cart available without automatically
loading it into the new sale.

A parked cart must not be confused with a sale. Before checkout it must not
create a transaction, payment, receipt, inventory movement, Z-reading amount,
or unified Sales read-model row. The workflow must also survive refresh,
terminal changes, duplicate button presses, and an interrupted shift without
silently losing or duplicating a cart.

## Decision

1. POS provides a `Park & New Sale` action. A successful park persists an
   immutable cart snapshot, acknowledges the park reference, and then clears
   the active cart so the cashier can start a fresh sale. It never
   automatically retrieves a parked cart. `[default]`
2. Parked carts remain explicitly resumable through a POS-only Parked Sales
   queue. Resume requires an empty active cart and an explicit cashier action;
   the client must never merge a parked cart into an active cart implicitly.
   `[default]`
3. The MVP parked-sale lifecycle is `parked`, `claimed`, `completed`, or
   `cancelled`. `claimed` is an exclusive, recoverable resume lease rather
   than a second sale. Checkout moves the record to `completed` with the
   resulting transaction reference; explicit cancellation moves it to
   `cancelled`. There is no automatic expiry in the MVP: shift close resolves
   active parked carts, and any later archival/retention policy is a separate
   governed change that must preserve audit evidence. `[default]`
4. A parked sale is scoped to its tenant, location, owning cashier, terminal,
   and open shift. A cashier may resume or cancel only their own parked sale in
   the active shift. A separately authorized recovery actor may resolve
   another cashier's parked sale only through an explicit audited action.
   `[binding]`
5. Parked snapshots preserve the checkout inputs needed for review and
   revalidation, including item identity, quantity, selling-price context,
   discounts, modifiers, notes, customer/order context, and the originating
   tenant/location/shift/terminal/cashier scope. They must not contain access
   tokens, passwords, PINs, or other secrets. `[binding]`
6. Resume and checkout revalidate current item eligibility, availability,
   selling prices, modifiers, discounts, permissions, location, shift, and
   compliance/output policy. A stale or unavailable line is shown as a
   deterministic conflict requiring correction; the snapshot is not silently
   rewritten. `[binding]`
7. Parking has no inventory reservation or stock decrement. Inventory and
   financial effects begin only in the existing checkout transaction after
   server-side validation succeeds. `[binding]`
8. Park requests use a client-generated idempotency key. Repeated submits for
   the same key return the original park result and never create duplicate
   parked records or clear the active cart before durable acknowledgement.
   `[binding]`
9. Offline parking is allowed only within the authenticated, terminal-scoped
   offline contract. An offline park is visibly pending, stored in the
   durable replay queue, and replayed only by the existing operator-controlled
   sync action. Reconnect, page load, or service-worker events must not
   automatically submit or resume a parked sale. `[binding]`
10. Shift close must surface unresolved parked and pending-sync carts. The
    default policy requires each active parked sale to be completed or
    explicitly cancelled before the owning shift can close; no parked sale may
    disappear silently during close or terminal unlock. `[default]`
11. Parked carts are excluded from POS Sales History, Order History, Z-reading
    totals, receipts, payment reports, and the unified Sales read model until
    normal checkout creates the authoritative transaction. `[binding]`
12. Parked-sale reads and mutations remain inside the POS module and follow
    `routes -> controllers -> usecases -> repositories -> models`. The
   read-only Sales module must not become a parked-sale write path. `[binding]`

## Amendments

### 2026-08-13 — Stable identity for explicit claimed-sale re-park

This amendment changes the `[default]` behavior in Decision clauses 1 and 3.
After an explicit resume, `Park & New Sale` may replace the snapshot on that
same claimed parked-sale record instead of creating another record. This is an
explicit cashier re-park action, not an automatic retrieval or silent stale
rewrite.

The re-park must preserve `pos_parked_sale_id` and `park_reference`, require
the same cashier, shift, terminal, and location scope, compare an optimistic
`revision`, increment that revision, and release the claim back to `parked` in
one transaction. A revision mismatch is a visible conflict and leaves the
current cart open. Checkout from a resumed sale must carry the stable parked
sale identity and atomically move it to `completed` with the resulting POS
transaction. Re-park and checkout continue to create no extra financial or
inventory effects beyond the one authoritative checkout.

## Consequences

- Cashiers can continue serving the next customer without losing unfinished
  carts or replacing the new active cart.
- The system retains a recoverable, auditable workflow instead of relying on a
  single browser-local draft.
- Resume can surface price, modifier, permission, and availability conflicts;
  this is required because a parked cart does not reserve inventory or freeze
  checkout policy.
- Shift close becomes stricter when parked carts exist, which prevents orphaned
  operational work but requires a clear cashier recovery experience.
- The implementation needs additive tenant persistence, idempotent APIs,
  frontend queue state, offline replay integration, and lifecycle tests.

## Validation

1. Contract tests prove park idempotency, scope authorization, lifecycle
   transitions, secret exclusion, and no financial or inventory side effect.
2. Resume tests prove empty-cart gating, exclusive claim/recovery behavior,
   stale-line conflicts, and explicit cancellation.
3. Frontend tests prove `Park & New Sale` clears only after acknowledgement,
   duplicate-submit protection, no automatic retrieval, and mobile/desktop
   empty/loading/error states.
4. Offline tests prove pending-sync visibility and operator-controlled replay.
5. Shift-close and Z-reading tests prove unresolved parked carts are surfaced
   and parked carts are excluded from recognized totals.
6. Architecture, documentation, affected-app build, and rendered POS checks
   remain required before implementation phases are complete.

## References

- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
