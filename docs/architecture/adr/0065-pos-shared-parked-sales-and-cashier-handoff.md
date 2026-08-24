---
status: amended
authority_level: authoritative
owner: pos
date: 2026-08-15
last_reviewed: 2026-08-15
review_by: 2027-02-15
applies_to: architecture_decision
topic: pos_shared_parked_sales_and_cashier_handoff
supersedes: 0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md
---

# ADR 0065: POS Shared Parked Sales and Cashier Handoff

## Status

Amended on 2026-08-15. This ADR supersedes ADR 0061 for parked-sale visibility
and ownership. The original shift and terminal ownership rules for cash drawers
remain governed by ADR 0031. Read the Amendments section last.

## Context

Parked carts are unfinished POS work, not completed sales. Restricting the
queue to the cashier and shift that created each cart prevents normal branch
handoff when a cashier changes. A safe shared queue must allow a new cashier
to continue the cart without erasing who created it, leaking carts across
locations, or allowing two terminals to edit the same cart.

## Decision

1. Active parked carts are visible to authorized POS users within the same
   tenant location. Location scope is mandatory; a cart never becomes visible
   across branches. `[binding]`
2. A cashier with `pos:transact` and an open shift at that location may
   explicitly resume an unclaimed parked cart. The claim transfers the cart's
   current operational cashier, shift, and terminal to the authenticated
   actor. `[binding]`
3. The original cashier and shift are preserved in immutable origin fields and
   the `pos_parked_sale_created` audit event. The transfer is recorded as an
   explicit `pos_parked_sale_resumed` audit event with both origin and new
   ownership. `[binding]`
4. A claimed cart remains an exclusive recoverable lease. Another terminal may
   view its status but cannot resume, cancel, re-park, or complete it until the
   current claimant releases it by re-parking, completes it, or an explicitly
   authorized recovery workflow resolves it. `[binding]`
5. Re-park, cancellation, payment-session creation, and checkout authorize the
   current operational owner and active shift, not the historical origin
   owner. An unclaimed cart remains owned by the cashier/shift that parked it;
   another cashier must claim it before making lifecycle changes. `[binding]`
6. Shift-close blockers count only claimed carts by current operational shift.
   An unclaimed cart may remain attached to a closed shift as branch-shared
   handoff work; a cart transferred to another cashier no longer blocks the
   previous shift. Claimed unresolved carts still block the shift that currently
   owns them. `[default]`
7. This handoff changes parked-cart ownership only. It does not create
   parallel open shifts, reassign cash drawers, bypass terminal occupancy, or
   allow a cashier to mutate another operator's shift or drawer. `[binding]`
8. Parking remains free of inventory, payment, receipt, Z-reading, and sales
   history effects until normal checkout completes the cart. `[binding]`

## Consequences

- Cashiers at the same branch can continue unfinished carts after a normal
  cashier handoff.
- Audit can answer both “who parked this?” and “who resumed this?” without
  relying on mutable ownership fields.
- The queue is branch-shared but still tenant- and location-isolated.
- A claimed cart cannot be silently taken over by another terminal; an
  explicit recovery action remains a separate future workflow.
- The database migration is additive and backfills origin fields from the
  existing operational owner for older parked carts.

## Amendments

### 2026-08-15: Unclaimed carts may outlive the originating shift

The shift-close guard now counts only `claimed` parked carts owned by the
closing shift. An unclaimed `parked` cart is explicitly handoff-ready and
remains visible to an authorized cashier at the same location after the
originating shift closes. Pending offline parked-sale syncs remain blocking,
and claimed carts remain exclusive work that must be completed or released
before their current owner's shift can close. `[default]`

## Validation

1. Backend tests prove same-location cross-cashier listing and resume,
   different-location denial, origin preservation, claimed-sale exclusivity,
   and current-owner authorization for re-park/checkout/cancellation.
2. Repository tests prove the shared location query does not add cashier or
   shift predicates.
3. Frontend tests prove the branch-shared empty-state copy and claimed-sale
   lock presentation.
4. Migration and runtime schema checks prove origin columns exist for every
   tenant schema.
5. POS build, architecture gates, and rendered POS smoke checks remain
   required before release.

## References

- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/database/schema.md`
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
