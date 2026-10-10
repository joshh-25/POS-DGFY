---
status: authoritative
authority_level: authoritative
owner: inventory
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: inventory_pos_storefront
topic: storefront_stock_freshness_contract
---

# Storefront Stock Freshness Contract

## Purpose and scope

This contract defines the stock availability shown by Storefront after per-terminal allocations are
implemented, its freshness bound, and customer behavior when stock becomes unavailable during
checkout. It is the design slice for issue #998 under epic #993 and consumes the Inventory-owned
allocation model in `PER_TERMINAL_STOCK_ALLOCATION.md` (Phase 490, #997). It does not define a
second allocation policy.

This is a documentation-only design. It authorizes no schema, API, runtime, cache configuration,
client, or UI change. Implementation must be separately scoped and must sequence Storefront read-path
adoption with or after the root-cause fix for #947.

## Governance classification

This crosses Inventory, POS, and Storefront ownership boundaries. ADR 0029's Inventory ownership
clauses and ADR 0055's POS event-stream access and authoritative-read clauses remain unchanged.
ADR 0014's Storefront cache choices are untagged `[default]` clauses, so this contract extends them
with a dated amendment in ADR 0014 under ADR 0039. No new ADR or tech-lead approval is required while
no `[binding]` clause changes. ADRs 0017, 0029, and 0055 are references and are not amended here.

## Availability rule

For each location and stock-bearing item, Storefront availability is the Inventory-computed
remainder:

```text
max(0, location on-hand
    - active online-order holds whose expires_at is later than the read time
    - remaining quantities in active or quarantined terminal allocations)
```

The remainder never includes any terminal's allocated-but-unsold quantity. It is location-scoped and
uses the allocation and reservation rules in `PER_TERMINAL_STOCK_ALLOCATION.md`. Recipe ingredients
and modifier SKUs follow Inventory's planned stock-effect derivation. `stock_exempt` lines have no
allocation and retain their existing exemption behavior.

One Inventory-owned availability function is the source for Storefront browse, quote preflight, and
the authoritative commit check. Storefront must not duplicate the arithmetic. Quote is a fresh,
uncached preflight; commit repeats the check under stock-row locks and is the only authority that
prevents oversell. Browse freshness is advisory and does not provide that guarantee.

## Read tiers and freshness bound

| Surface | Contract | Cache behavior | Authority |
| --- | --- | --- | --- |
| `GET /store/catalog` | May show bounded-stale availability | Existing public HTTP policy: `max-age=45`, `s-maxage=45`, `stale-while-revalidate=90`, `stale-if-error=180`; buyer-specific pricing requests remain `no-store` | Advisory |
| `POST /cart/quote` | Fresh stock preflight with customer-safe line-level unavailability | `no-store` | Advisory; may become stale before commit |
| Checkout commit | Recheck availability while holding the relevant stock rows; reject a shortfall atomically | `no-store` | Authoritative |

There is no catalog Redis cache-aside layer in the Storefront origin path. Therefore, the freshness
bound comes from the existing HTTP cache policy, not an origin-side catalog cache:

- A shared response is fresh for at most 45 seconds.
- Stale-while-revalidate can serve a response for approximately 45 + 90 = **135 seconds** after
  origin generation.
- When revalidation fails, stale-if-error can serve it for approximately 45 + 180 = **225 seconds**
  after origin generation.

These are upper bounds implied by the configured directives; an intermediary's implementation and
clock behavior can affect observed timing. The existing TTL values remain unchanged in this design.
Shorter `s-maxage` or `no-store` on stock-bearing catalog reads is an available stricter option if a
future product decision requires a tighter bound; it trades shared-cache hit rate for freshness.

Offline replay lag contributes **zero** to the Storefront remainder: replay consumes the terminal's
allocation and records its goods issue atomically, reducing on-hand and remaining allocation by the
same quantity. The remainder therefore stays unchanged. Unsynced offline sales against a terminal's
own allocation do not change the Storefront number.

The direction of stale display matters:

- Changes that lower the remainder (new allocations or top-ups, new online holds, live sales/issues,
  and quarantine after a loss or adjustment) can leave the catalog over-displaying availability for
  up to the HTTP bound.
- Changes that raise the remainder (online returns, allocation recovery, hold expiry, or hold
  cancellation) can leave the catalog under-displaying availability for up to the same bound. This
  is conservative.
- Quarantined allocations stay subtracted indefinitely until explicit return, reconciliation, or
  audited recovery. Their conservative display effect is intentional; recovery visibility is
  back-office work owned by OPIS and outside this contract.

Epic #993's "storefront stock never higher than sellable" criterion applies to the origin-computed
remainder: it never counts allocated units. A cached copy may lag within the bound above, and commit
always rechecks. A literal guarantee for every served cache copy would require the stricter cache
policy described above.

## Cache and invalidation contract

ADR 0014 part 3 remains the governing cache contract. Keep the current catalog Cache-Control values,
keep quote and checkout `no-store`, and do not add an origin-side catalog Redis cache in this slice.
Since no new origin cache is introduced, this contract adds no invalidation mechanism for Storefront
browse; HTTP TTL is its freshness bound.

Reuse ADR 0055's existing tenant-scoped `publishCatalogChange` bus as the server-side signal. The
separately scoped #997 runtime implementation must publish a catalog change after each successful
allocation lifecycle mutation that can affect remaining stock: grant, top-up, return, quarantine,
recovery, and consume. A reason such as `terminal_allocation_changed` lets POS terminals refetch
their remaining slice and gives any future server-side cache a tenant/item invalidation signal.

Do not expose the POS SSE stream to anonymous Storefront clients. `GET /pos/catalog/events` remains
authenticated and `pos:view`-protected, emits only invalidation metadata, and prompts POS to refetch
its authoritative catalog. Storefront browse is not event-purged; its current HTTP TTL remains the
contract.

## Zero stock during checkout

When a quote finds insufficient availability, it returns the existing 422 insufficient-stock
contract with affected item identifiers and a customer-safe availability state. The customer can
remove the unavailable line or reduce its quantity and request a new quote. If stock becomes
insufficient after quote but before commit, commit returns 422 with reason
`ONLINE_STOCK_RESERVATION_SHORTFALL` and commits no order. Allocation-caused shortage is presented
like any other stock shortage; customer-facing copy must not mention POS terminals or allocations.

Quote and commit use the same Inventory availability rule. A quote that passes and a commit that
fails is therefore a normal race caused by an intervening stock change, not a difference in stock
arithmetic.

This is a target contract, not a statement that today's read paths already satisfy it. Current
catalog stock mapping reads location `quantity_on_hand`, and quote preflight uses the current item
stock map; neither currently subtracts active online holds or terminal allocations. Reservation
commit already performs the authoritative on-hand-minus-active-holds check. The Inventory
availability/read-path follow-on must close the browse and quote gaps before allocation enforcement
is claimed complete.

Public quantity output continues to follow ADR 0017's `inventory_display_mode`: `hidden` exposes no
availability text, `availability` exposes an available/unavailable state, `low_stock` may use the
configured low-stock copy, and `exact_quantity` may expose exact quantities. Violations must identify
the item and a customer-safe availability state; exact quantities are public only in
`exact_quantity` mode.

**Existing finding for PM:** current quote and reservation shortfall details include exact
`available_stock` (and quote details include requested quantity) without a visible
`inventory_display_mode` redaction in the Store module. The storefront model can consume those
details. This appears inconsistent with ADR 0017's binding exact-quantity rule. It is recorded for
separate PM triage and is not fixed or claimed verified at runtime by this design PR.

## Fail-closed and #947 boundary

Every availability read must be location-scoped. If location scope cannot be resolved, or the
allocation ledger errors while allocation enforcement is enabled, browse treats affected
stock-bearing items as unavailable or unknown and checkout fails closed. No read path may fall back
to tenant-wide `current_stock` when scoped stock or allocation data cannot be read.

An absent allocation table during a feature-not-deployed rollout is distinct from a read error: if
the feature is not deployed and no allocations can exist, availability is scoped on-hand minus
active online holds. A present-but-unreadable allocation ledger is an error and fails closed.

Issue #947 owns the current location-scope fallback defect. This contract requires the new read path
not to inherit that fail-open fallback; it does not absorb #947's fix. Read-path adoption must land
with or after #947's root-cause correction.

## Follow-on implementation slices

The design does not implement these items. PM should separately shape and sequence them:

1. Inventory availability function and Storefront browse/quote/commit adoption, depending on the
   #997 runtime ledger and sequenced with #947.
2. Redaction of current exact stock values in public shortfall payloads, with ADR 0017 coverage.
3. Allocation lifecycle publication through the existing catalog-change bus as part of #997 runtime.
4. A tighter stock-bearing catalog cache policy only if a product decision rejects the documented
   origin-versus-cached interpretation of epic #993's criterion.

## Acceptance evidence for implementation

- Origin availability subtracts active online holds and all active or quarantined allocation
  remainder, including recipe/modifier effects, and never includes allocated stock.
- Replay atomically decrements on-hand and the matching allocation by the same amount, leaving the
  Storefront remainder unchanged for unsynced terminal sales.
- Browse, quote, and commit share one Inventory-owned availability rule; quote is uncached and commit
  rechecks under stock-row locks.
- Public availability respects all four ADR 0017 display modes, and failure details do not reveal
  exact quantities outside `exact_quantity` mode.
- Cache policy and invalidation behavior match the bounds and boundaries in this contract.
- Zero-stock quote and commit responses identify affected items with safe copy; commit shortfall
  leaves no order committed.
- Missing/unresolved location scope and allocation ledger read errors fail closed; the known #947
  fallback is not carried into the adopted path.

## Authoritative references

- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- ADR 0014 — Storefront HTTP cache contracts and POS offline replay.
- ADR 0017 — customer inventory display policy and exact-quantity boundary.
- ADR 0029 — Catalog, Inventory, POS, and Storefront ownership and availability.
- ADR 0039 — ADR strictness tiers and amendment path.
- ADR 0055 — tenant-scoped POS catalog invalidation.
- `docs/features/PER_TERMINAL_STOCK_ALLOCATION.md` — allocation authority and remainder.
- Issues #947, #993, #997, and #998.
