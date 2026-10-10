---
status: authoritative
authority_level: authoritative
owner: inventory
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: inventory_pos_storefront
topic: per_terminal_stock_allocation
---

# Per-Terminal Stock Allocation

## Purpose and scope

This contract defines Inventory-owned stock slices for POS terminals that must continue selling
cash transactions while offline. It is the governed design for issue #997 under the Offline-first
POS epic #993, and is shared by native DGFY POS and authorized partner terminals. A slice prevents
two terminals from promising the same stock and keeps Storefront from offering stock already
assigned to a terminal.

Phase 488 is governance and design only. It changes no schema, API, runtime code, POS client, or
admin UI. Later implementation is split into separately scoped issues.

## Governance classification

This is a cross-boundary change spanning Inventory, POS, Storefront, and offline replay. ADR 0029
Decision ownership clauses 1-4 and Boundary Rules 1-2 remain `[binding]` and unchanged: Inventory
owns stock truth and records stock effects; POS and Storefront request them. The 2026-08-21 ADR
0029 online-reservation amendment and the offline replay decisions in ADR 0014 are `[default]`
clauses. This design extends those defaults with a non-expiring terminal allocation lifecycle, so
the selected path is a dated amendment to ADRs 0029 and 0014 under ADR 0039. It does not need a new
superseding ADR or tech-lead approval unless a future implementation makes terminal state
authoritative or bypasses Inventory commands.

The ADR 0029 call-site check found the online reservation implementation in
`apps/dgfy-api/src/modules/inventory/services/inventoryReservationService.js`, called from
Storefront checkout at `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`. POS checkout
builds stock effects and calls the Inventory `issueStockForPosSale` command in
`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`; that command delegates to
`createStockMovement`, which checks live on-hand quantity. The POS issue path does not yet consume
or account for outstanding terminal allocations. Storefront catalog presentation reads scoped
stock in its store use cases/repository and does not yet subtract terminal allocations. These are
required follow-on enforcement gaps, not claims that the guarantee is implemented in Phase 488.

## Allocation identity and quantities

- Inventory owns the durable allocation ledger. Each grant is scoped to tenant, location,
  registered terminal, app attachment/device identity, and the operator authority that requested
  it. The server validates these bindings when granting, topping up, returning, and reconciling.
- A grant is made only while online. Top-ups and returns also require an online Inventory command
  and a transaction. The terminal may cache its remaining slice for local checkout, but the cache
  is a use of server-issued authority, never stock truth.
- Allocation lines represent concrete Inventory effects by item and quantity. This includes direct
  stock items plus recipe ingredients and modifier SKUs derived by the existing online/POS effect
  planning helpers. A `stock_exempt` sale line has no allocation and creates no stock movement.
- The initial admin sizing surface is an explicit quantity per stock-bearing item per terminal. A
  helper may suggest an even split of the currently allocatable quantity across active terminals;
  that result is advisory and must not silently change a grant. Allocation configuration belongs to
  this shared model so OPIS and future partner-connection settings consume one policy. UI work is
  out of scope here.

## Available-to-sell and competing stock issues

For each location and stock-bearing item, Inventory computes the allocatable remainder as:

```text
on_hand
- active online-order reservation holds
- remaining quantities in active or quarantined terminal allocations
```

The sum is computed under deterministic stock-row locking when a grant or stock issue is accepted.
An allocation's holder may use its own remaining quantity. Other terminals may use only the
unallocated remainder. Storefront quote and checkout must also honor that remainder. Public
availability output continues through ADR 0017's `inventory_display_mode`; exact quantities remain
hidden unless the tenant explicitly selects `exact_quantity`.

Every competing stock-decreasing flow must honor active allocations, including live POS sales,
Storefront fulfillment, dispatch, and manual stock issues. An explicit stock loss or authorized
adjustment that would consume allocated units must first enter audited reconciliation/recovery.
No path may silently spend or reassign another terminal's slice. This is necessary for the
allocation guarantee: protecting only offline replay while allowing an online path to consume the
same units would leave the conflict unresolved.

## Offline use, replay, and idempotency

- A previously authenticated operator may create new local operations for at most 24 hours after
  the last server authorization. Expiry stops new local operations. It does not release the slice,
  delete queue entries, or discard pending records.
- Offline checkout is limited to the current terminal's remaining allocation. It may not sell
  beyond that quantity, grant stock, top up, return stock, or change allocation identity.
- Replay stays operator-triggered through the existing `Sync All Pending Records` action and its
  daily limit. Reconnect, page load, retry timers, and Service Worker events do not submit records.
- For each replayed stock-bearing sale, the server derives effects from the validated sale snapshot,
  verifies the terminal scope and remaining allocation, consumes the matching allocation, and
  records the Inventory goods issue atomically. The allocation check may replace the ordinary
  live on-hand shortfall check only for the quantity covered by that allocation. Inventory still
  records the movement and updates stock truth. The POS operation replay key makes retries return
  the prior outcome without another allocation consumption or stock movement.
- An over-allocation attempt fails closed with a stable reason such as
  `TERMINAL_ALLOCATION_EXCEEDED`; it enters `failed_manual_resolution_required` and never becomes a
  silent success. A failure rolls back both allocation consumption and the stock movement.
- Replay validates current server-side operator and terminal authority. If that validation fails,
  pending evidence remains intact for manual resolution; a stale offline credential is not accepted
  as current authority.

## Lifecycle and recovery

Terminal allocations have the conceptual states `active`, `consumed`, `released`, and `quarantined`.
Granted quantities are immutable. Consumption and lifecycle transitions are append-only evidence;
remaining quantity is derived from those records. A consumed allocation has no remaining quantity.

There is no automatic release on a TTL, disconnect, device loss, or idle timeout. A stale or
unreachable terminal is quarantined and its remaining quantity stays excluded from availability.
Remaining quantity returns to the allocatable pool only after one of these explicit paths:

1. the terminal reconnects and returns its unused quantity online;
2. shift close completes with the terminal's pending work synchronized and reconciled; or
3. an administrator reviews the terminal's persisted/pending sale evidence and performs an audited
   recovery.

If a device is lost or its queue cannot be recovered, the allocation remains quarantined until an
authorized administrator resolves the uncertainty. Recovery cannot assume that an offline sale
did not happen merely because the server has not received it.

## Implementation boundaries and rollout order

1. Add additive tenant schema and an Inventory allocation service beside the online reservation
   service. Migration-runner changes require the Worker checkpoint before commit.
2. Extend the Inventory command contract so POS replay can consume a proven allocation atomically;
   make every competing stock issue and Storefront availability calculation honor the same ledger.
3. Add POS client awareness of server-issued allocation quantities and the offline authorization
   deadline. Keep existing manual replay and durable pending-record behavior.
4. Add allocation sizing and recovery visibility in OPIS, the designated back-office surface.
   Partner-terminal settings must consume the same Inventory-owned contract.
5. Keep the Storefront freshness contract as the sibling issue under #993; it consumes the
   availability contract defined here and does not define a second allocation policy.

## Acceptance evidence for implementation

- Two terminals cannot sell the same allocated SKU beyond their separate slices, including when
  both sell offline and replay concurrently.
- Replay is idempotent: duplicate submissions do not consume twice or create another stock
  movement. An overrun has a deterministic reason and enters manual resolution.
- Direct SKU, recipe ingredient, and modifier-derived stock effects are all included; `stock_exempt`
  lines remain outside allocation and movement.
- Live POS, Storefront, dispatch, and manual stock issues cannot spend another terminal's active or
  quarantined slice. Storefront availability and public display policy reflect the unallocated
  remainder.
- Disconnect, device loss, idle timeout, and 24-hour authorization expiry do not free inventory.
  Pending records survive expiry, and only explicit online return, reconciled shift close, or
  audited admin recovery releases a remainder.
- Grant, consumption, return, quarantine, and recovery validate tenant/location/terminal/app
  attachment/operator scope and preserve append-only audit evidence.

## Authoritative references

- ADR 0009 — multi-location Inventory ledger and safety-first rollout.
- ADR 0014 — POS offline replay and local persistence rules.
- ADR 0017 — customer inventory display policy.
- ADR 0029 — Catalog, Inventory, POS, and Storefront ownership boundaries and online reservation
  precedent.
- ADR 0031 and ADR 0044 — terminal pairing, device binding, and operator authority.
- ADR 0039 — ADR strictness tiers and amendment path.
- ADR 0043 — standalone native hardware POS runtime.
- Issue #997, including its 2026-10-09 consumer requirements from #796.
