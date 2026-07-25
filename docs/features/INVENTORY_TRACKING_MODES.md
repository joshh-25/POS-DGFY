---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-25
applies_to: catalog,inventory,pos,storefront,reports
topic: inventory_tracking_modes
---

# Inventory Tracking Modes

**Status: design (not yet implemented).** This is the tracking/availability
mode catalog that backs Axis 4 of
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`
and `docs/features/UNIFIED_PRODUCT_DOMAIN.md`. Read those first for why this
axis exists and how it composes with offering archetypes
(`docs/features/OFFERING_ARCHETYPES.md`).

## Why this exists

DGFY was **IMS-first** — cloned from SKUpervisor, an Inventory Management
System, before it grew a POS and storefront. That history baked in an
assumption: every sellable product has an accurate, batch-tracked quantity.
It doesn't, and forcing one model onto every product produces exactly the
symptom that prompted this doc: **a restaurant menu item cannot be honestly
tracked as "10 servings."** Cooking isn't that consistent, and portions vary.
Two honest answers exist instead — declare the dish available/unavailable, or
derive availability from the ingredients actually in stock — and neither is
"maintain a serving count."

Generalizing that observation: **"can I sell this right now?" has different
answer sources depending on what's being sold**, and the platform must stop
picking one source (a maintained quantity) for everything.

| Question source | Answers with | Applies to |
|---|---|---|
| **Counted** | a quantity, decremented on sale | retail goods, packaged snacks |
| **Declared** | an operator on/off switch | made-to-order dishes, anything too variable to count |
| **Capacity** | schedule + slots/resources — **not a stock quantity at all** | services, tickets, bookable slots |
| **Derived** | computed from a recipe/BOM against ingredient stock | menu items with a defined recipe |

SKUpervisor — the dedicated IMS this project was cloned from — is being built
**separately**. DGFY's own inventory should therefore become **light by
default**: a scalar count backed by an append-only ledger, with the existing
heavyweight FIFO-batch/costing/expiry machinery demoted to **one selectable,
frozen tier** rather than the baseline every product inherits. Deep,
accurate tracking becomes something a tenant can *optionally* delegate to the
external SKUpervisor once that integration exists.

## The seven modes

One `items`-level setting selects the mode; a POS-line-level `stock_effect_type`
(already `inventory_issue` | `stock_exempt` on
`backend/src/models/PosTransactionLine.js`) still decides what a *specific
sale* does, informed by the mode. Nothing here replaces that per-line
mechanism — it decides what feeds it.

### `untracked` — no quantity, sales recorded only

No stock number is maintained at all; the product is always sellable (subject
to catalog visibility) and every sale is still recorded as a normal POS line.
**Prototype already shipped:** `pos_catalog_overrides.pos_always_available`
(`backend/src/models/PosCatalogOverride.js`) is exactly this, scoped to POS
only — it already sets `stock_effect_type='stock_exempt'`,
`stock_exempt_reason='pos_always_available'`, and skips any inventory
movement. Both frontends already represent it as `Number.POSITIVE_INFINITY`
(`frontend/src/features/pos/components/POSCheckoutTerminal.jsx`;
`frontend/apps/store/src/shared/hooks/useCartMutations.js`'s cart has no
quantity clamp at all). **What's new:** generalizing the POS-only override into
a per-item mode honoured on the storefront too, and — a real bug today —
making sure `cost_snapshot` is still recorded for an untracked *physical*
good, unlike labor (see Known Issues below).

### `count_ledger` — simple count, ledger-backed, no batches

A scalar `items.current_stock` balance, decremented/incremented on every
sale/receipt/adjustment, with every change recorded as an append-only
`stock_movements` row — but **no FIFO batches, no expiry, no
per-batch cost**. **Already in production**: `items.fifo_enabled: false`
delivers exactly this in `backend/src/services/stockMovementService.js` (no
`FIFOBatch` created on inbound, no batch consumption on outbound, the
reconciliation guard is bypassed), and the F&B `menu_item` preset already ships
`fifo_enabled: false` while remaining stock-bearing. A **location-less**
variant of this path also already runs: when no location resolves, the service
writes only `items.current_stock` and one movement row — i.e. count + ledger
with no location dimension either, matching the light ledger already specified
in `docs/database/legacy-stock-movement-type-remap.md` (which collapses the 8
legacy movement types to 4: `restock`, `loss`, `adjustment`, `sale`).
**This is the default for `physical_product`.**

### `full_fifo` — batches, expiry, weighted-average cost, per-location (frozen legacy tier)

The full heavyweight model: `FIFOBatch`, `BatchTransaction`, `BatchLineage`,
per-location `ItemLocationStock`, weighted-average costing
(`backend/src/modules/inventory/services/costValuationService.js`), expiry/
shelf-life tracking. **Frozen, not removed** — existing tenants relying on it
keep working exactly as today, with no data migration, and it stops being the
implicit baseline every new product inherits. Precedent for freezing rather
than deleting: ADR 0029's own compatibility decisions require additive
facades before any legacy path is removed.

### `external_ims` — delegated to SKUpervisor

The authoritative stock number lives in the separately-built SKUpervisor
product; DGFY keeps a local mirror plus its own append-only ledger row per
effect (so POS/receipts/void/Z-reading never depend on a remote call
succeeding), and reconciles asynchronously. **Does not exist yet** — this is
new work, arriving in Phase 8 of the roadmap in
`docs/features/UNIFIED_PRODUCT_DOMAIN.md`. The reuse path: ADR 0029's core
rule — *"POS and Storefront may request stock effects. Only Inventory records
stock effects."* — already permits the recorder to be external; the seam is
`backend/src/modules/inventory/commands/stockCommandService.js`, already a
duck-typed, DI-injected port with a 409-on-absence fallback in
`backend/src/modules/pos/usecases/posUseCases.js`. See the compatibility-seam
prerequisite below.

### `toggle` — operator-declared availability

A boolean (plus optional reason and until-when), set by the operator, honoured
consistently across **both** POS and storefront. **Does not exist as a
cross-surface concept today** — the closest primitives are narrower or
inconsistent:
- `pos_catalog_overrides.pos_visible` / `storefront_catalog_overrides.storefront_visible`
  remove the item from a catalog entirely — a bigger hammer than "temporarily
  unavailable."
- `storefront_location_item_overrides.storefront_available` is a **per-branch**
  storefront-only toggle.
- The de-facto mechanism today is setting `current_stock = 0`, which reads as
  "sold out" everywhere but destroys the actual count in the process — an
  operator cannot record "42 in stock, but I've turned selling off."

**This is the default for `prepared_food` and `made_to_order`** — a carinderia
dish that's too variable to count precisely gets a clean on/off switch instead
of a fictional serving number. Per the confirmed direction (see
`docs/features/UNIFIED_PRODUCT_DOMAIN.md`), this is also **the near-term fix**
for the browse-vs-checkout contradiction described under Known Issues below:
menu items get `toggle`, not a wired-up recipe projection.

### `capacity` — not inventory at all

Availability comes from a schedule and a capacity ceiling — slots, resources,
technicians — never a stock quantity. **Fully built and in production** via
Services Mode: `service_resources.capacity`, `weekly_availability`,
`blackout_dates`, and the availability engine in
`backend/src/modules/services/usecases/serviceUseCases.js`. This is the
mechanical reason **"a service cannot really be inventoried"** — the
constraint that governs sellability is time and concurrent capacity, not
units on a shelf. A service can still *consume* countable inventory (massage
oil, a repair part); that consumption is expressed on the *parts* line via
`stock_effect_type`, not on the service line's own (nonexistent) stock.
**Default for `time_service`, `ticketed_seat`, `capacity_slot`.**

### `recipe_derived` — reserved for the external IMS

Availability computed from a recipe/BOM against live ingredient stock — "can I
make 8 more servings from what's in the fridge." **A real, shipped
*consumption* engine already exists** at checkout time
(`backend/src/modules/shared/utils/fnbRecipeConsumption.js` — location-scoped,
UOM-converting, pre-commit validated, void-reversible), but **no read path
anywhere projects it into browse-time availability** — see Known Issue 1. Per
the confirmed direction, this local engine is **frozen**: no further
investment goes into building a producibility projection inside DGFY itself.
Ingredient-driven menu availability becomes a capability the external
SKUpervisor provides once connected (`external_ims` above); until then, a
recipe-backed dish uses `toggle`.

## Design rules

1. **Archetype suggests, seller decides.** The default tracking mode is derived
   from the Axis 1 offering archetype (table below), but the seller may always
   override it — **including putting a real, maintained count on a food item**
   (a carinderia tracking "20 servings of menudo left," a bakery counting 30
   loaves). This is deliberately the opposite posture from today's restrictive
   `validateItemAgainstModeTaxonomy`, which *throws*
   (`MODE_ITEM_CATEGORY_UNSUPPORTED` / `MODE_ITEM_UOM_UNSUPPORTED`) on an
   unexpected combination. Tracking mode must never throw on a valid
   archetype/mode pairing — it only defaults.
2. **One resolver, not a scattered boolean.**
   `backend/src/modules/shared/utils/stockBearingPolicy.js` (today 49 lines, a
   plain `category`/`mode_item_preset` string test, ~30 backend call sites)
   becomes the **only** place that interprets tracking mode, returning a
   descriptor rather than a boolean:
   ```
   { tracks_quantity, uses_batches, blocks_on_shortfall, emits_movements,
     carries_cost, valuation_participant, availability_source }
   ```
   No call site should read `items.current_stock` directly without resolving
   this descriptor first — that discipline is what prevents the "0 means sold
   out" collision between "genuinely zero" and "not counted" that recurs
   throughout the current codebase (Known Issue 5).
3. **The ledger is invariant across every counted mode.** `untracked` is the
   only mode that skips it; `count_ledger`, `full_fifo`, and the local mirror
   of `external_ims` all record every effect as an append-only movement — this
   is already the platform's behavior (opening balances themselves go through
   a movement, per `backend/src/modules/inventory/repositories/itemRepository.js`),
   not a new invariant.
4. **Reports must tolerate every mode**, not just `stock_exempt` services.
   `backend/src/modules/shared/utils/stockBearingPolicy.js`'s
   `buildStockBearingItemWhere` already excludes exempt items from
   `reportService.js` (6 sites), `dashboardService.js` (10 sites), and
   `costValuationService.js` — that predicate widens to the new descriptor.
   Five services currently **bypass** it and must be brought in:
   `alertService.getLowStockAlerts`, `forecastService`, `analyticsService`,
   `itemGroupingService`, `aiContextService`. `docs/features/SERVICES_MODE.md`
   already states the rule for services specifically ("must not appear in
   stock aging, low-stock, surplus/shortage, inventory valuation,
   weighted-average cost, FIFO batch, or stock-movement reports") — this
   generalizes that rule to every non-`count_ledger`/`full_fifo` mode.

## Default tracking mode by offering archetype

| Archetype (+ trait) | Default mode | Why |
|---|---|---|
| `physical_product` | `count_ledger` | a countable good |
| `physical_product` + `weighed`/`refill` | `count_ledger` | fractional quantity, still a real count |
| `physical_product` + `pack_to_unit` | `count_ledger` | base-unit ledger after receiving-side conversion |
| `physical_product` + `made_to_order` | `toggle` | built on demand, no standing stock to count |
| `physical_product` + `prepared_food` | `toggle` (today); `recipe_derived` reserved for `external_ims` | the motivating example — servings aren't honestly countable |
| `time_service` | `capacity` | scheduled, not stocked |
| `ticketed_seat` | `capacity` | fixed-capacity schedule |
| `capacity_slot` | `capacity` | bookable slot |
| `rental` | *(open gap — see below)* | neither counted, declared, nor scheduled cleanly fits "out vs. returned" |

**The `rental` archetype has no honest home yet.** It needs a fourth kind of
"can I sell this" answer — occupancy (out vs. returned), not a decrementing
count, a toggle, or a schedule. `docs/features/OFFERING_ARCHETYPES.md` records
this as a deferred gap; it is out of scope for this design pass to resolve.

## Known issues this design must account for

Full detail and file-level citations live in
`docs/features/UNIFIED_PRODUCT_DOMAIN.md`'s Known Issues section; the ones most
load-bearing for this axis:

- **Browse-vs-checkout contradiction.** Checkout already exempts a
  recipe-backed line from its own-stock check, but every catalog read (POS and
  storefront alike) computes availability purely from
  `items.current_stock > 0`. A correctly-configured dish with full ingredient
  stock but `current_stock = 0` renders **Sold Out** and cannot be added to
  cart — the exact contradiction this axis exists to resolve, via `toggle`
  rather than wiring recipes into browse-time reads.
- **`pos_always_available` (the `untracked` prototype) silently disables
  ingredient deduction** at checkout today, because the stock-exempt skip runs
  before the recipe-consumption branch. The mode/descriptor model must define
  this interaction explicitly rather than leaving it as an accidental
  ordering bug.
- **`cost_snapshot` is forced to `null` for every exempt line today**, which
  is correct for labor but wrong for an untracked *physical* good — an
  `untracked` product must still carry cost into profit reporting.

## Governance and sequencing

This is a design document, not an implementation plan. Persisting the mode,
building the resolver, wiring `toggle`, and building the `external_ims` seam
are sequenced in `docs/features/UNIFIED_PRODUCT_DOMAIN.md`'s roadmap (Phases
1, 3, and 8 respectively). The `external_ims` mode additionally requires the
governance prerequisites recorded there: an ADR 0029 amendment (the recorder
may be external), an ADR 0009 amendment (codifying the FIFO-opt-out exception
`menu_item` already exercises), a new reservations ADR, and an
`api-boundary` compatibility seam per ADR 0035.
