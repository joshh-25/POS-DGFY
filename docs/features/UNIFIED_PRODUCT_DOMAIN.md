---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-25
applies_to: catalog,inventory,pos,services,storefront,onboarding
topic: unified_product_domain
---

# Unified Product Domain and Capability-Driven Store Types

**Status: design (not yet implemented).** This is the detailed design and
phased roadmap for uniting the platform's product domains — food, services, and
retail — behind one product concept and one line-item model, and for letting a
single store sell across those domains through the POS. The ratifying decisions
live in `docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`.
Read `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and
`docs/architecture/ARCHITECTURE_GOVERNANCE.md` first.

## Why this exists

The system began food/restaurant-centric. It now serves three product domains
from one platform:

- **Food** — a menu item (kare-kare, menudo) plus add-ons (extra egg, extra
  rice, bottled water). Orderable.
- **Services** — labor provided (computer repair, TV repair, motorcycle
  service). Bookable in advance on a schedule.
- **Retail** — packaged goods (chippy, Nutri-Star), per-kilogram raw goods, a
  water refill station, packs bought as one but sold by the piece. Orderable.

And a store can be a **mix**: a computer-repair shop that fixes a PC (labor) and
sells the replacement CPU in the same receipt; a motorcycle shop that charges
service labor and sells the oil and chain it installed. The goal is to manage
order items *dynamically* — one product entity, one sale-line model — **without
splitting into a separate table per product type**, and to let each store type
select and sell the right items in the POS.

## Core principle: one product, many domains (mostly already true)

Keep `items` (`backend/src/models/Item.js`) as the single product table. A
product's domain is expressed by three fields resolved through the per-mode
taxonomy, not by a separate table:

- `category` — `raw_material` | `packaging` | `product` | `supplies` | `service`.
- `product_type` — e.g. `finished_goods` (required only for `category='product'`).
- `mode_item_preset` — the preset key that preserves the mode-native subtype.

`backend/src/modules/shared/constants/modeItemTaxonomy.js` maps each store type
to a set of presets (`category`, `product_type`, default/allowed UOMs,
`stock_behavior`, `financial_profile`) and validates items on create/edit via
`validateItemAgainstModeTaxonomy`.

All selling flows through one header + one line table:

- `pos_transactions` (`backend/src/models/PosTransaction.js`).
- `pos_transaction_lines` (`backend/src/models/PosTransactionLine.js`), where
  each line carries `item_id`, `sale_price` snapshot, VAT snapshot, and
  **`stock_effect_type`** (`inventory_issue` | `stock_exempt`).

`backend/src/modules/pos/usecases/posUseCases.js` issues inventory for
`inventory_issue` lines and skips it for `stock_exempt` lines within a single
transaction. **This is what makes a basket dynamic** — a stock-exempt labor line
and an inventory-issue parts line already coexist in one sale today. The
initiative closes the gaps around this core, it does not rebuild it.

### Current-state map (reuse, do not rebuild)

| Concern | Existing primitive | Path |
|---|---|---|
| Universal product | `items` (`category`, `product_type`, `mode_item_preset`) | `backend/src/models/Item.js` |
| Per-store-type presets | `MODE_ITEM_TAXONOMY`, `preset()`/`taxonomy()`, `validateItemAgainstModeTaxonomy` | `backend/src/modules/shared/constants/modeItemTaxonomy.js` |
| Store type + capabilities | `WORKFLOW_MODE_VALUES`, `WORKFLOW_MODE_CAPABILITIES`, `modeHasCapability` | `backend/src/modules/shared/constants/workflowModes.js` |
| Stock-exempt policy | `isStockExemptServiceItem()` | `backend/src/modules/shared/utils/stockBearingPolicy.js` |
| Mixed-basket line effect | per-line `stock_effect_type` + `stock_exempt_reason` | `backend/src/models/PosTransactionLine.js`; `posUseCases.js` |
| Add-ons/modifiers | `fnb_modifier_groups`/`_options` (`price_delta`, `sku_item_id`)/`fnb_item_modifier_groups` | `backend/src/models/FnbModifier*.js`; `backend/src/modules/fnb/` |
| Advance booking (full stack) | `service_item_details`, `service_bookings`, `service_resources`, `service_provider_assignments`, holds/waitlist/reminders; availability engine | `backend/src/models/Service*.js`; `backend/src/modules/services/usecases/serviceUseCases.js`; `frontend/apps/store/src/modes/services/` |
| Booking→sale link (reserved) | `service_bookings.pos_transaction_id`; `pos_transactions.scheduled_for`, `order_method='appointment'` | `backend/src/models/ServiceBooking.js`, `PosTransaction.js` |
| Per-kg / fractional qty | `DECIMAL(24,12)` quantities + `weight` UOM group | `backend/src/utils/uomConverter.js` |
| Pack-to-unit | `ItemBarcode.packaging_level` + `quantity_multiplier` (already used at sale scan) | `backend/src/models/ItemBarcode.js`; `posUseCases.js` |
| POS cart/checkout UI | `addToCart`, order-method `<select>` | `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` |
| Mode-adaptive POS panels | Services queue / `FnbDiningPanel` / `HospitalityPosPanel` | `frontend/src/features/pos/pages/PosPageShell.jsx` |

## How each store type sells

| Store type | Sells | Line stock effect | Fulfillment | Notes |
|---|---|---|---|---|
| Food | menu items + add-ons | inventory-issue (or exempt for made-to-order) | `dine_in`/`takeout`/`pickup`/`delivery` | modifiers = add-ons |
| Services | labor (service items) + parts (products) | labor = `stock_exempt`; parts = `inventory_issue` | `appointment` (booked) or walk-in | advance booking via Services Mode |
| Retail | packaged goods, weighed goods, refills, pack-to-unit | `inventory_issue` | `pickup`/`delivery`/counter | per-kg = fractional qty; pack-to-unit = base-unit ledger |
| Mixed (e.g. repair shop) | any of the above in one basket | per line, independently | any enabled method | the motorcycle/PC-repair case |

The mixed row is the crux: it is **already representable** at the line level;
what is missing is the store being *allowed* to hold multiple domains and the
POS presenting them cleanly. That is the capability model below.

## Capability A — Mixed store type + capability-driven POS *(largest gap)*

**Problem.** `ops_workflow_mode` is a single, exclusive value per tenant
(`workflowModes.js`, `DEFAULT_WORKFLOW_MODE='food_manufacturing'`,
master-admin-gated in `backend/src/modules/settings/`). A store cannot
declaratively sell food + services + retail together. Separately, the POS
order-method control in `POSCheckoutTerminal.jsx` is a hardcoded, always-visible
Dine-In/Takeout/Pickup/Delivery/Appointment `<select>` defaulting to `dine_in`,
regardless of what the store actually does.

**Design.**

- Introduce composed **sell-domain capabilities** — `sell_food`,
  `sell_services`, `sell_retail` — layered on the existing
  `WORKFLOW_MODE_CAPABILITIES` map (which already lists per-mode capabilities
  like `catalog`, `pos`, `serviceBookings`, `menuModifiers`). The primary
  surface is a composite/`mixed` configuration whose **effective item taxonomy
  is the union** of the enabled domains' presets; an additive
  `enabled_capabilities` setting is the extensible mechanism.
- Existing single-mode tenants are unchanged: their mode maps to exactly one
  sell-domain, so `MODE_ITEM_TAXONOMY` and POS behavior are identical to today.
- Make the POS **capability-driven**: `order_method` options and the mode panels
  chosen in `PosPageShell.jsx` derive from enabled capabilities; the default
  `order_method` is derived, not the literal `dine_in`. A services+retail store
  never shows `Dine In`.
- **Labor** stays a `category='service'`, stock-exempt catalog item line (already
  works; preserves VAT/reporting). A one-off ad-hoc labor line (no catalog item)
  is an **open decision**, deferred; if adopted it still carries
  `stock_effect_type` and tax treatment.

**Reuse vs new.** No schema change for the mixed basket itself — this is
configuration + taxonomy union + POS UI. New: the capability setting + its
master-admin gate, taxonomy-union resolution, and capability-driven POS
rendering.

## Capability B — Unified add-ons / modifiers

**Problem.** Add-ons (extra egg, extra rice, bottled water) exist only as
`fnb_modifier_*` tables gated to `fnb` mode. A service or retail item cannot
attach a modifier group.

**Design.**

- **De-gate** the existing modifier tables from `fnb`-only so any `items` row
  (any `category`) can attach a modifier group. Treat the per-line snapshot
  `fnb_modifiers_snapshot` as a generic `modifiers_snapshot`.
- Reuse `FnbModifierOption.price_delta` for the up-charge and
  `FnbModifierOption.sku_item_id` (modifier → real stock item) for an add-on
  that **depletes inventory** — this already models "extra rice" as a real rice
  item and equally models "add-on replacement part" for a service. The add-on's
  stock effect flows through the same per-line `stock_effect_type` path.
- A physical table rename to neutral names is **optional and deferred** behind a
  facade to avoid a destructive migration.

**Reuse vs new.** Almost entirely reuse (`price_delta`, `sku_item_id`,
group/option/min/max/required already exist). New: remove the mode gate; let
non-F&B item forms attach modifier groups; generalize the snapshot field name in
docs/read paths.

## Capability C — Retail as first-class

**Problem.** `retail` is absent from `MODE_ITEM_TAXONOMY`
(`PLACEHOLDER_ITEM_TAXONOMY_MODES`), so `validateItemAgainstModeTaxonomy`
returns `skipped: 'placeholder_mode'` and retail items are unvalidated. There is
no model for per-kilogram goods, refill stations, or pack-to-unit selling.

**Design.** Add corrected presets under `retail` (and the shared `msme`) using
the existing `preset()`/`taxonomy()` builders:

- `retail_good` — stock-bearing packaged product (chippy, Nutri-Star).
- `weighed_good` — per-kilogram (raw meat). Reuse the `weight` UOM group in
  `backend/src/utils/uomConverter.js` and `DECIMAL(24,12)` fractional
  quantities: line total = unit price × fractional kg. No new pricing table; the
  POS needs a **weight/quantity entry** affordance (manual entry first; scale
  integration later).
- `refill_good` / `refill_service` — water refill station (sold by volume /
  per-container).
- pack-to-unit ("mini tiangge") — received as a pack, sold by the piece. Adopt
  the recommendation in
  `docs/proposals/2026-07-06-flexible-item-types-mini-tiangge-jewelry.md`: reuse
  `ItemBarcode.packaging_level` + `quantity_multiplier` as the single conversion
  factor and extend the **receiving** side (PO receipt, manual stock adjustment,
  CSV import) to convert pack→base units, keeping the stock ledger in base units
  so FIFO/audit semantics are unchanged.

**Reuse vs new.** Reuse builders, weight UOM group, barcode multiplier,
fractional quantities. New: the `retail`/`msme` presets, POS weight entry, and
the receiving-side pack→base conversion. Correcting the placeholder must not
break existing retail items — rely on the taxonomy's
legacy-edit-without-taxonomy-change escape hatch and prove non-regression.

## Capability D — Advance service booking (+ mixed fulfillment)

**Problem.** Booking is mature but siloed in Services Mode, tuned narrowly
(`laundry`/`aircon_cleaning`), and not wired to add consumed parts to the sale.

**Design.** Reuse Services Mode wholesale — this is generalization + wiring, not
new booking infrastructure:

- Customers already book in advance on a specific schedule through
  `service_bookings` (`start_at`/`end_at`, status machine), the capacity-aware
  availability engine, short-lived holds, resources/technicians
  (`service_provider_assignments`, `service_resources`), and the storefront
  booking subpage (`frontend/apps/store/src/modes/services/`). Keep it.
- Generalize service-family presentation beyond `laundry`/`aircon_cleaning` (a
  generic category-presentation model) so repair services render cleanly; use
  `service_area_type='customer_location'` for on-site repair.
- **Booking → sale linkage:** a completed booking becomes a POS sale via the
  reserved `service_bookings.pos_transaction_id`; parts consumed during the
  repair are added as `inventory_issue` lines on that **same** `pos_transactions`
  row. This is where the mixed store and booking meet — the booked labor and the
  installed parts settle in one receipt.
- Revisit the current storefront single-service/single-unit constraint (partly
  addressed by the batch booking endpoint) and decide the target multiplicity.

**Reuse vs new.** Reuse the entire booking backend + storefront flow. New:
generic service-family presentation, booking→sale settlement, and adding parts
to a booked service's transaction at fulfillment.

## Phased roadmap

Sequenced by dependency and risk (foundations first); all four capabilities are
in scope.

- **Phase 0 (this doc + ADR 0037):** ratify the unified model and decisions.
- **Phase 1 — Catalog foundations (low risk):** corrected `retail` taxonomy
  (weighed, refill, pack-to-unit) **and** domain-neutral modifier de-gating.
  Both are catalog/taxonomy changes with no POS-flow rewrite.
  - Representative: `modeItemTaxonomy.js` (+ FE mirror
    `frontend/src/features/settings/modeItemTaxonomy.js`),
    `backend/src/modules/fnb/` (de-gate), receiving paths (PO receipt / stock
    adjustment / CSV import) for pack-to-unit, `ItemBarcode.js`,
    `backend/src/utils/uomConverter.js`.
- **Phase 2 — Mixed store + capability-driven POS:** composite capability
  configuration + master-admin gate, capability-driven `order_method` and
  panels, mixed-basket UX, POS weight entry. Depends on Phase 1 presets.
  - Representative: `workflowModes.js` (+ FE
    `frontend/src/features/settings/workflowMode.js`),
    `backend/src/modules/settings/`, `POSCheckoutTerminal.jsx`,
    `PosPageShell.jsx`.
- **Phase 3 — Booking generalization + mixed fulfillment:** generalized service
  presentation, booking→sale linkage, parts-on-booking. Builds on Services Mode
  + Phase 2 mixed basket.
  - Representative: `backend/src/modules/services/usecases/serviceUseCases.js`,
    `ServiceBooking.js`, `posUseCases.js`,
    `frontend/apps/store/src/modes/services/`.

**Every phase that adds a column must also update the tenant-schema registry
(`backend/scripts/sync-tenant-schemas.js`) and pass
`npm run check:tenant-schema-coverage`** — the multi-tenant per-database sync
step, not just a Sequelize migration.

## Open decisions

1. Composite `mixed` **mode value** vs. additive `enabled_capabilities` overlay
   as the primary configuration surface (ADR 0037 leans composite-primary with
   capabilities as the extensible mechanism).
2. Whether to allow an **ad-hoc/custom labor line** with no catalog item
   (default: no — use a catalog service item for tax/reporting correctness).
3. Pack-to-unit conversion factor: per-barcode only (as today) vs. also a
   simpler "default pack size" on the item (per the flexible-item-types
   proposal's open question).
4. Target **booking multiplicity** on the storefront (single vs. batch vs. true
   multi-line).
5. POS **weighed-goods capture**: manual weight entry first; scale/hardware
   integration later.

## Validation (for implementation phases)

- `modeItemTaxonomy` tests for new `retail` presets + non-regression of the five
  corrected modes; UOM/weight and pack-to-unit conversion tests.
- Modifier de-gating tests: service and retail items attach modifier groups;
  inventory-depleting add-on issues stock via `stock_effect_type`.
- POS mixed-basket integration test (service labor + retail parts + food) with
  correct stock and VAT; capability-driven order-method/panel tests.
- Services booking→sale linkage test (idempotent; parts added to the same
  transaction); generalized service presentation renders a repair service.
- `npm run check:architecture`, `npm run lint:docs`,
  `npm run check:tenant-schema-coverage`; rendered POS checks (desktop + one
  mobile viewport) per the hardening contract in
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.

## Out of scope

- Production code in this documentation pass.
- `apps/*` entirely — `backend/` is being mechanically relocated (and
  rewritten) there on a separate branch. This is not a competing product model;
  this design targets `backend/`+`frontend/` and follows the code to its new
  location, and does not read or reference the in-progress relocation while it
  is mid-rewrite.
- Jewelry per-piece serialization (deferred follow-up per the flexible-item
  proposal).
- Payment/fiscal/promo redesign — bounded by ADR 0027/0033 and unchanged here.
