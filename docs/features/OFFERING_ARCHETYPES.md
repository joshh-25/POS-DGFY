---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-25
applies_to: catalog,inventory,pos,onboarding,storefront
topic: offering_archetypes
---

# Offering Archetypes and Traits

**Status: design (not yet implemented).** This is the archetype + trait catalog
that backs Axis 1 (offering archetype) of
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`
and `docs/features/UNIFIED_PRODUCT_DOMAIN.md`. Read those first for the
four-axis model this doc fills in. Each archetype below also carries a
**default tracking mode (Axis 4)** — see
`docs/features/INVENTORY_TRACKING_MODES.md` for the full tracking-mode catalog
and the permissive-override rule referenced throughout this document.

## Why archetypes, not verticals

DGFY natively supports F&B, Retail, and Services, plus basic support for
Hospitality/Healthcare/Ticketing — but the platform must also reach sellers no
one can enumerate up front: a farmer selling crops, a bracelet maker, a broom
seller, a shoe cleaner, a freelance masahista, a jewelry seller. Today, "what
kind of business" is one exclusive `ops_workflow_mode` value
(`backend/src/modules/shared/constants/workflowModes.js`), and adding a new one
is a governed, multi-week program per
`docs/development/MODE_DEVELOPMENT_PLAYBOOK.md` — not something you can run
per long-tail seller.

**Archetypes replace "pick a vertical" with "describe what you sell."** An
offering archetype is a small, closed set of *mechanical* shapes — how a line
behaves in the POS, whether it holds stock, whether it is scheduled — composed
with optional *traits* that capture the long-tail variation (sold by weight,
sold from a pack, one-of-a-kind, refillable, made on demand). A vertical preset
(Axis 2) is then just a labelled bundle of archetype/trait defaults; it adds
polish, not capability.

This vocabulary is not new — `backend/src/modules/onboarding/domain/businessClassification.js`
already declares an `offering_types` allow-list
(`physical_product`, `time_service`, `ticketed_seat`, `capacity_slot`, `rental`)
and a `fulfillment_methods` allow-list including `on_site_service` and
`platform_delivery`. **That file has zero importers today** — this design
activates the vocabulary rather than inventing a new one.

## The five archetypes

Each archetype maps to an `items` row's `category`/`product_type` and to a
default `pos_transaction_lines.stock_effect_type`
(`backend/src/models/PosTransactionLine.js`), the mechanism that already lets a
mixed basket work.

| Archetype | Meaning | Default `category` | Default tracking mode (Axis 4) | Scheduling |
|---|---|---|---|---|
| `physical_product` | A tangible good sold as-is | `product` / `raw_material` / `supplies` | `count_ledger` | none |
| `time_service` | Labor/attention sold by the job or session | `service` | `capacity` — not inventory at all | optional — walk-in or advance-booked |
| `ticketed_seat` | A specific seat/slot in a fixed-capacity event | `service` | `capacity` — not inventory at all | fixed schedule + seat/slot capacity |
| `capacity_slot` | A generic bookable time slot, not seat-specific | `service` | `capacity` — not inventory at all | advance booking with capacity |
| `rental` | A physical asset lent for a duration, then returned | `product` | **gap — see below** | duration-bound occupancy |

**Permissive, always.** These are *defaults*, not constraints — a seller may
switch any product to any valid Axis 4 tracking mode. A carinderia may keep a
real, maintained count of "20 servings of menudo left" on a `physical_product`
+ `prepared_food` item even though the archetype default is `toggle`; a
service can still carry `stock_effect_type` on the *parts* it consumes even
though the service line itself is never inventoried. See
`docs/features/INVENTORY_TRACKING_MODES.md` design rule 1.

### `physical_product`

The default for anything sold as a tangible unit: chippy, a broom, a bracelet,
raw meat, a bottle of water. Stock-bearing by default
(`inventory_issue`), sold through `pos_transaction_lines` like any item today,
defaulting to Axis 4's `count_ledger` tracking mode (a real, ledger-backed
count — no batches). UOM groups: `count`, `packaging`, plus `weight`/`volume`
when a trait applies. POS + Storefront eligible by default. This is the
archetype every long-tail non-service seller starts from — **zero new code**
is needed to onboard one. The `prepared_food` and `made_to_order` traits shift
the *tracking-mode* default to `toggle` (see Traits below and
`docs/features/INVENTORY_TRACKING_MODES.md`) — the archetype and its stock
effect are unchanged, only how availability is determined changes.

### `time_service`

Labor sold by the job/session: computer repair, TV repair, phone repair, shoe
cleaning, a masahista's massage, a haircut. `category='service'`, and tracked
by Axis 4's `capacity` mode — **it is not inventoried at all**, because a
service cannot be honestly held as a stock quantity; its constraint is time
and (when scheduled) concurrent capacity, not units on a shelf. Can be sold as
a POS walk-in line exactly like today, or advance-booked through the existing
Services Mode stack (`backend/src/modules/services/`, `service_item_details`,
`service_bookings`). The service line itself carries no stock effect, but a
service can still *consume* countable inventory (massage oil, a repair part) —
that consumption is expressed on the *parts* line via `stock_effect_type`, not
on the service. A repair combined with `physical_product` parts consumed
during the job is the canonical mixed-basket case
(`docs/features/UNIFIED_PRODUCT_DOMAIN.md` Capability A).

### `ticketed_seat`

A specific seat or numbered slot in a fixed-capacity event — a cinema showing,
a bus seat, a concert ticket. Currently only reachable through the
`ticketing_transport` **placeholder** workflow mode
(`PLACEHOLDER_ITEM_TAXONOMY_MODES`, `backend/src/modules/shared/constants/modeItemTaxonomy.js`),
which has no real taxonomy, no seat map, and no booking engine of its own. This
is the clearest **Tier 2 / external-candidate** archetype (see
`docs/features/UNIFIED_PRODUCT_DOMAIN.md` provider axis) — cinema ticketing in
particular may be better served by a dedicated ticketing app with DGFY as a
discovery/redirect front door, per the user's shallow-external decision, rather
than a from-scratch seat-map engine inside DGFY.

### `capacity_slot`

A bookable time slot without seat identity — a doctor's consultation slot, a
class enrollment, a facility booking. Mechanically closest to `time_service`
plus a hard capacity ceiling; reuses the same booking primitives
(`service_resources.capacity`, the availability engine in
`backend/src/modules/services/usecases/serviceUseCases.js`). `healthcare` is a
placeholder mode today with no real doctor-scheduling taxonomy — this archetype
is the mechanical seam a future Healthcare Tier-2 preset would sit on.

### `rental`

A physical asset lent out and expected back — currently the weakest-supported
archetype. **Gap:** there is no "reserve without consuming" stock lifecycle
anywhere in the platform. `stock_effect_type` is binary
(`inventory_issue` | `stock_exempt`) with no `reserved`/`returned` state, and
there is no due-date/late-fee/deposit concept. Recording this gap explicitly
rather than forcing rentals into `inventory_issue` (which would permanently
deduct stock on every rental) — **out of scope for this design pass**, flagged
for a future rental-lifecycle proposal.

## Traits (composable modifiers)

Traits layer onto `physical_product` (mostly) to express the long-tail
variation without a new archetype or a new vertical.

| Trait | Meaning | Reuse | Status |
|---|---|---|---|
| `weighed` | Sold per kilogram/liter, fractional quantity | `weight`/`volume` UOM groups in `backend/src/utils/uomConverter.js` + `DECIMAL(24,12)` quantity columns (already the type on `items.current_stock` and `pos_transaction_lines.quantity`) | Mechanically ready; no preset exposes it outside `food_manufacturing`/`fnb` today |
| `pack_to_unit` | Received as a pack, sold by the piece ("mini tiangge") | `ItemBarcode.packaging_level` + `quantity_multiplier`, already used at POS-scan time (`backend/src/modules/pos/usecases/posUseCases.js`) | Sell-side works; receiving-side (PO receipt / adjustment / CSV import) conversion is a gap — see `docs/proposals/2026-07-06-flexible-item-types-mini-tiangge-jewelry.md` |
| `serialized` | Per-piece identity (jewelry: one specific necklace) | none yet | Deferred — needs a new `ItemUnit`/`ItemSerial` table per the flexible-item-types proposal; explicitly the riskier of its two recommendations |
| `refill` | Sold by dispensed volume from a station (water refill) | `volume` UOM group | No preset; operationally close to `weighed` (dispense-then-charge) |
| `made_to_order` | Built only on order, no standing stock (a bracelet maker) | Axis 4 `toggle` tracking mode instead of a maintained count | Mechanically already possible (`stock_effect_type='stock_exempt'`); no preset names it explicitly today, and `toggle` as a first-class cross-surface mode doesn't exist yet — see `docs/features/INVENTORY_TRACKING_MODES.md` |
| `prepared_food` | Recipe/composition-based, immediate consumption | `ProductComposition` (BOM) consumption engine (shipped, **frozen** — see below); Axis 4 `toggle` for browse-time availability | Ingredient *consumption* at checkout is fully built and shipped; browse-time availability is **not** ingredient-derived today (a live bug — see `docs/features/UNIFIED_PRODUCT_DOMAIN.md` Capability F) and is resolved via `toggle`, not by extending the recipe engine |

## Proof the axis is real: today's corrected presets are archetype projections

`MODE_ITEM_TAXONOMY` (`backend/src/modules/shared/constants/modeItemTaxonomy.js`)
already expresses every one of its five corrected modes' presets as an
archetype + trait combination — this design formalizes an axis that is
implicit in the code, it does not invent one:

| Existing preset (mode) | Archetype + traits |
|---|---|
| `menu_item` (fnb) | `physical_product` + `prepared_food` |
| `ingredient` (fnb, food_manufacturing) | `physical_product` |
| `packaged_beverage` (fnb) | `physical_product` + `pack_to_unit` |
| `service` (services) | `time_service` |
| `physical_add_on` (services, hospitality) | `physical_product` |
| `room_night` (hospitality) | `capacity_slot` |
| `paid_amenity` / `facility_booking` (hospitality) | `time_service` / `capacity_slot` |
| `product`/`supplies` (msme) | `physical_product` |

Once presets are *derived* from archetype + trait instead of hand-authored per
mode, a new preset (e.g. `weighed_good` for retail) is a declaration, not a new
branch in five duplicated files.

## Worked mapping for every seller type raised in scoping

| Seller | Archetype + traits | Works today? | Blocker if not |
|---|---|---|---|
| Restaurant menu item (kare-kare, menudo) | `physical_product` + `prepared_food` | Yes (fnb) | — |
| Food add-on (egg, extra rice, water) | modifier on a `physical_product`/`prepared_food` item | Yes, but F&B-only | `fnb_modifier_*` tables are gated to `fnb` mode |
| Computer/TV/phone repair | `time_service` | Yes (services) | — |
| Repair + replaced part (CPU, oil, chain) in one sale | `time_service` + `physical_product` | Mechanically yes (`stock_effect_type` per line) | No composed "mixed" store type to enable both catalogs at once |
| Chippy / Nutri-Star (retail good) | `physical_product` | Yes (msme/retail) | Retail is a broken placeholder tier (see ADR 0037 context) |
| Raw meat, farmer's crops | `physical_product` + `weighed` | **No** | `msme`'s two presets only allow `pcs`/count+packaging UOMs; `kg` is rejected (`MODE_ITEM_UOM_UNSUPPORTED`) |
| Water refill station | `physical_product` + `refill` | **No** | No refill preset anywhere |
| Chippy sold from a case ("mini tiangge") | `physical_product` + `pack_to_unit` | Partial | Sell-side barcode multiplier works; receiving-side conversion is unbuilt |
| Jewelry (one-of-a-kind piece) | `physical_product` + `serialized` | Partial | Sells as an ordinary stock-bearing item; no per-piece identity |
| Bracelet maker | `physical_product` (+ `made_to_order` optionally) | Yes (msme) | — |
| Broom seller | `physical_product` | Yes (msme) | — |
| Shoe cleaner, freelance masahista | `time_service` | **No** | `msme` capabilities omit `services`/`serviceBookings`; forces adoption of the full heavyweight `services` mode for a solo operator |
| Cinema seat | `ticketed_seat` | No | `ticketing_transport` is a placeholder mode with no seat/showtime model; likely better as an external listing (see provider axis) |
| Doctor consultation slot | `capacity_slot` | No | `healthcare` is a placeholder mode with no scheduling taxonomy |
| Taxi ride | out of this catalog | No | A distinct trip/dispatch domain, not a catalog item; tracked only as a future external-listing candidate |

## POS and Storefront eligibility defaults by archetype

| Archetype | POS default | Storefront default | Notes |
|---|---|---|---|
| `physical_product` | sellable, stock-clamped | orderable | weighed/refill need a POS quantity/weight-entry affordance (manual first) |
| `time_service` | sellable, walk-in or from booking queue | bookable if `is_bookable`-equivalent set | reuses Services Mode POS queue |
| `ticketed_seat` | not yet modeled | not yet modeled | candidate for external-listing redirect rather than native build |
| `capacity_slot` | sellable via booking check-in | bookable | reuses Services Mode availability engine |
| `rental` | not yet modeled | not yet modeled | reservation lifecycle gap, see above |

## Non-goals of this document

- Does not define the vertical presets (Axis 2), the provider/source axis
  (Axis 3), or the full availability/tracking-mode catalog (Axis 4) — see
  `docs/features/UNIFIED_PRODUCT_DOMAIN.md` and
  `docs/features/INVENTORY_TRACKING_MODES.md`. This document states each
  archetype's *default* tracking mode only; the mode catalog itself,
  including exactly which modes already exist versus are new, lives in
  `INVENTORY_TRACKING_MODES.md`.
- Does not implement archetype-derived presets, the retail taxonomy correction,
  or any migration — this is a reference catalog for that later implementation
  work (Phase 2 of the roadmap in `docs/features/UNIFIED_PRODUCT_DOMAIN.md`).
- Does not resolve the `rental` archetype's occupancy-tracking gap or jewelry
  serialization — both are named and deferred.
- Does not extend the local recipe-consumption engine
  (`fnbRecipeConsumption.js`) into a browse-time producibility projection —
  that work is frozen per confirmed product direction; ingredient-derived
  availability (`recipe_derived`) is reserved for the external IMS.
