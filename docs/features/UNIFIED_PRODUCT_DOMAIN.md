---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-25
applies_to: catalog,inventory,pos,services,storefront,onboarding,reports
topic: unified_product_domain
---

# Unified Product Domain and Capability-Driven Store Types

**Status: design (not yet implemented).** This is the detailed design and
phased roadmap for uniting the platform's products behind one product concept
and one line-item model, for letting any store — native vertical or long-tail
seller — select and sell the right items through the POS, and for treating
inventory tracking as a spectrum instead of one heavyweight model every
product inherits. The ratifying decisions live in
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`.
The archetype/trait catalog lives in `docs/features/OFFERING_ARCHETYPES.md`;
the tracking-mode catalog lives in
`docs/features/INVENTORY_TRACKING_MODES.md`. Read `docs/START_HERE.md`,
`docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and
`docs/architecture/ARCHITECTURE_GOVERNANCE.md` first.

## Why this exists

DGFY began food/restaurant-centric. It now natively supports three verticals —
**F&B** (a menu item like kare-kare or menudo, plus add-ons: extra egg, extra
rice, bottled water), **Retail** (chippy, Nutri-Star, per-kilogram raw goods, a
water refill station, packs sold by the piece), and **Services** (bookable
labor: computer/TV/phone repair, private massage, shoe cleaning) — but those
three verticals are **not the model**. The platform must also reach long-tail
sellers nobody can enumerate up front: a farmer selling crops, a bracelet
maker, a broom seller. It needs a lower "basic" tier for future verticals
(Hospitality, Doctors, Cinemas). And it will eventually need to surface domains
whose authoritative backend lives in a different application — a ticketing
app, a clinic app, the separate Taxi app being built.

A single store is also often a **mix**: a computer-repair shop that fixes a PC
(labor) and sells the replacement CPU on the same receipt; a motorcycle shop
that charges service labor and sells the oil and chain it installed. The goal
is to manage order items *dynamically* — one product entity, one sale-line
model — **without splitting into a separate table per product type**, and
without needing a new engineering "mode" every time a new kind of seller shows
up.

**A second, equally important problem: the platform is IMS-first.** DGFY was
cloned from SKUpervisor, an Inventory Management System, before it grew a POS
and a storefront. That history baked in an assumption — every sellable product
carries an accurate, batch-tracked quantity — that is simply false for large
classes of products. A restaurant menu item cannot be honestly tracked as "10
servings"; cooking isn't that consistent, so its availability is either
*declared* (an operator on/off switch) or *derived* (computed from ingredient
stock), never a maintained count. A service cannot be inventoried at all — its
constraint is time and capacity, not units on a shelf. SKUpervisor is now
being built **separately** as a dedicated IMS, and DGFY will *optionally* tap
into it for deep, accurate tracking. So DGFY's own inventory needs to become a
**spectrum** — no tracking, a simple ledger-backed count, or delegation to the
external IMS — with today's heavyweight FIFO-batch machinery demoted from "the
baseline" to "one frozen, selectable tier."

**This document supersedes its own earlier framing, twice.** First, an earlier
pass described "three product domains" (food/services/retail) as the target
model and proposed a closed `sell_food`/`sell_services`/`sell_retail`
capability trio — a closed enumeration with the same shape as the platform's
original food-centric mistake, unable to express a farmer or a bracelet maker
without a new value per category. Second, that same pass implicitly assumed
inventory is one model every product shares. This revision replaces the closed
trio with the open model below, and adds tracking mode as its own axis.

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
| Archetype vocabulary (dormant) | `offering_types`, `fulfillment_methods` | `backend/src/modules/onboarding/domain/businessClassification.js` (zero importers today) |
| Stock-exempt policy | `isStockExemptServiceItem()` | `backend/src/modules/shared/utils/stockBearingPolicy.js` |
| Mixed-basket line effect | per-line `stock_effect_type` + `stock_exempt_reason` | `backend/src/models/PosTransactionLine.js`; `posUseCases.js` |
| Add-ons/modifiers | `fnb_modifier_groups`/`_options` (`price_delta`, `sku_item_id`)/`fnb_item_modifier_groups` | `backend/src/models/FnbModifier*.js`; `backend/src/modules/fnb/` |
| Advance booking (full stack) | `service_item_details`, `service_bookings`, `service_resources`, `service_provider_assignments`, holds/waitlist/reminders; availability engine | `backend/src/models/Service*.js`; `backend/src/modules/services/usecases/serviceUseCases.js`; `frontend/apps/store/src/modes/services/` |
| Booking→sale link (reserved) | `service_bookings.pos_transaction_id`; `pos_transactions.scheduled_for`, `order_method='appointment'` | `backend/src/models/ServiceBooking.js`, `PosTransaction.js` |
| Per-kg / fractional qty | `DECIMAL(24,12)` quantities + `weight` UOM group | `backend/src/utils/uomConverter.js` |
| Pack-to-unit | `ItemBarcode.packaging_level` + `quantity_multiplier` (already used at sale scan) | `backend/src/models/ItemBarcode.js`; `posUseCases.js` |
| External-origin seam (dormant) | `HospitalityReservation.{source:'ota', external_source, external_reference, channel_metadata}`; `DeliveryJob.{provider, provider_delivery_id, provider_payload}` | `backend/src/models/HospitalityModels.js`, `DeliveryJob.js` |
| Cross-tenant activity feed | `DgfyCustomerActivity` (snapshot-rendered, per-type action matrix) | `backend/src/models/Landlord/DgfyCustomerActivity.js` |
| "Simple count" tracking (already production) | `items.fifo_enabled: false` → scalar balance + ledger, no batches; location-less variant also runs | `backend/src/services/stockMovementService.js` |
| "No tracking" prototype | `pos_catalog_overrides.pos_always_available` | `backend/src/models/PosCatalogOverride.js`; `posUseCases.js` |
| Recipe consumption (shipped, frozen — see Axis 4) | `buildFnbRecipeConsumptionPlan` | `backend/src/modules/shared/utils/fnbRecipeConsumption.js` |
| Inventory command port (swap point for delegation) | 10 intention-named commands, DI-injected, duck-typed with 409 fallback | `backend/src/modules/inventory/commands/stockCommandService.js`; `posUseCases.js` |
| POS cart/checkout UI | `addToCart`, order-method `<select>` | `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` |
| Mode-adaptive POS panels | Services queue / `FnbDiningPanel` / `HospitalityPosPanel` | `frontend/src/features/pos/pages/PosPageShell.jsx` |

### Why this needs an open model, not a bigger enum

Exploration surfaced the concrete cost of the closed-enum status quo — this is
why the design below composes from small open axes instead of adding vertical
#4, #5, #6:

- Adding **one** vertical today touches roughly **35 source files and 5
  contract tests**, because mode constants are byte-duplicated between
  `backend/src/modules/shared/constants/workflowModes.js` and
  `frontend/src/features/settings/workflowMode.js`, and
  `backend/tests/workflowModes.crossLayer.contract.test.js` **enforces** that
  duplication rather than removing it. `MODE_ITEM_TAXONOMY` is duplicated the
  same way.
- `normalizeWorkflowMode` silently coerces any unrecognized mode to
  `food_manufacturing` — an unregistered vertical doesn't degrade gracefully,
  it becomes a food factory.
- **Retail itself — a stated native vertical — is currently in the worst
  tier.** It is a `PLACEHOLDER_ITEM_TAXONOMY_MODES` entry: item validation is
  skipped entirely, Job Orders/Dispatch Orders appear in the sidebar and then
  hard-403, the served CSV template is `food_manufacturing`'s (sample rows like
  "Chocolate Cake"), there is no retail storefront template, RBAC falls back to
  `food_manufacturing` roles, and operators see the literal string "Placeholder
  mode: conservative default" in the Items list.
- The `msme` catch-all — today's closest thing to a long-tail bucket — cannot
  hold the long tail: its capabilities omit `inventory`, and its two presets
  only allow `pcs`/count+packaging units, so a farmer selling by the kilo is
  flatly rejected, and it has no `service` preset, so a shoe cleaner or
  masahista must adopt the full `services` mode.
- There is no real business-type taxonomy separate from the engineering mode:
  onboarding's `industry_tags` is unconstrained free text, the classification
  engine (`businessClassification.js`) has zero importers, and
  `frontend/Pages/RegisterCompany.jsx` labels the **11 engineering modes** as
  "Business Industry" — a broom seller has nowhere to record what they sell
  except by picking an engineering mode.
- Adding a vertical is, by policy, a governed multi-week program
  (`docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`'s 11-step build order plus
  RBAC/provisioning/taxonomy checklists and an accepted ADR) — appropriate for
  F&B/Retail/Services, impossible to run per long-tail seller.

## The model: four orthogonal axes

Stop treating "what kind of business" — and "how is it tracked" — as one
exclusive value. Split it into four independent axes.

### Axis 1 — Offering archetype (open, composable, line-level)

*What kind of thing is being sold.* Drives stock effect, scheduling, UOM, tax,
and fulfillment. Activates the existing dead `offering_types` vocabulary in
`businessClassification.js` — `physical_product`, `time_service`,
`ticketed_seat`, `capacity_slot`, `rental` — composed with traits for long-tail
variation (`weighed`, `pack_to_unit`, `serialized`, `refill`, `made_to_order`,
`prepared_food`). Item taxonomy presets are derived from archetype + trait
instead of hand-authored per mode; today's corrected presets are already
expressible this way (e.g. `menu_item` = `physical_product` + `prepared_food`,
`service` = `time_service`, `room_night` = `capacity_slot`). Full catalog, plus
a worked mapping for every seller type named in scoping (farmer, bracelet
maker, broom seller, jewelry, shoe cleaner, masahista, cinema, doctor, taxi):
`docs/features/OFFERING_ARCHETYPES.md`.

**This axis is what makes the long tail free.** A seller answers "what do you
sell" and gets archetype-derived defaults — no new vertical, no new code, no
governed mode pass.

### Axis 2 — Vertical preset (optional packaging, tiered)

*How the product is dressed for a business type* — labels, nouns, defaults, UI
template. A vertical is a **thin preset selecting a composition of
capabilities**, not a new engineering mode, in three tiers:

- **Tier 1 — Native.** F&B, Retail, Services — the full governed
  `MODE_DEVELOPMENT_PLAYBOOK` pass (mode-native nouns, dedicated RBAC catalog,
  dedicated storefront template, IMS/POS-native workflow). **Retail must be
  lifted out of the placeholder tier to actually earn this tier.**
- **Tier 2 — Basic.** Hospitality (already has a taxonomy), Healthcare,
  Ticketing — a thin preset over generic capabilities plus a **generic** RBAC
  preset family (see Phase 1). No governed pass required; explicitly labelled
  basic in the UI rather than pretending to be a full native vertical.
- **Tier 3 — None.** The long tail. The seller picks archetypes only and gets a
  neutral, capable generic experience. Zero new code per seller type.

### Axis 3 — Provider/source (native vs. external)

*Who owns the authoritative record.* Orthogonal to the other axes, and
deliberately shallow for now per product direction:

- `dgfy_native` (default) — today's behavior: DGFY catalog, inventory,
  checkout.
- `external_listing` — **the only external tier built in this rollout.** A
  cross-platform store/listing (a ticketing app's cinema, a clinic app's
  doctor, the Taxi app) appears in DGFY discovery and on the DGFY map; booking
  **redirects the customer to the other app**. Reuses the existing outbound
  deep-link pattern (`sanitizeExternalLink`/`openStorefrontActionLink` in
  `frontend/apps/store/src/shared/utils/externalLinks.js`), precedented by
  `storefront_delivery_partners`.
- **Reserved, documented, not built:** `adapter_booked` (in-app booking against
  an external authority — reuse seam:
  `HospitalityReservation.{source:'ota', external_source, external_reference,
  channel_metadata}`) and `proxied` (DGFY owns checkout/settlement — reuse
  seam: `DeliveryJob.{provider, provider_delivery_id, provider_payload}` with
  its `'manual'` null-adapter). Recording these now — without building them —
  means a domain can be **promoted `external_listing` → `dgfy_native` later
  without changing the customer-facing model.**

Whether Cinema and Doctors end up as Tier 2 native or stay `external_listing`
is **explicitly undecided per domain** — this design must not force that
choice.

Known schema blockers for `external_listing`, to resolve when Phase 7 is
implemented: `StorefrontDiscoveryIndex.{tenant_id, tenant_name,
tenant_company_token, slug}` are all `NOT NULL` with no `entity_type`/`source`
discriminator, and reconciliation
(`backend/src/services/storefrontDiscoveryIndexService.js`) hard-gates on
`Tenant.findOne({ status: 'active' })`, so a non-tenant row cannot exist today.
`DgfyCustomerActivity.tenant_id` is similarly `NOT NULL`, blocking a later
unified native+external "my bookings" surface.

### Axis 4 — Availability & tracking mode (per product, permissive)

*"How do we know we can sell this right now?"* has different answer sources
depending on what's being sold, and conflating them is the IMS-first legacy
described above. Seven modes, full catalog in
`docs/features/INVENTORY_TRACKING_MODES.md`:

| Source | Mode | Exists today? |
|---|---|---|
| Counted | `untracked` | Prototype — generalize `pos_always_available` |
| Counted | `count_ledger` | **Yes** — `fifo_enabled: false`; already the F&B `menu_item` default |
| Counted | `full_fifo` | **Yes — FROZEN legacy tier**, not the baseline |
| Counted | `external_ims` | No — new seam, delegated to SKUpervisor |
| Declared | `toggle` | No — new cross-surface column |
| Capacity | `capacity` | **Yes** — `service_resources`, the availability engine; not inventory at all |
| Derived | `recipe_derived` | **Reserved for `external_ims`** — the local engine is frozen, not extended |

Design rules:

1. **Archetype suggests, seller decides — always permissive.** The archetype
   sets a sensible default (`physical_product` → `count_ledger`;
   `made_to_order`/`prepared_food` → `toggle`; `time_service`/`ticketed_seat`/
   `capacity_slot` → `capacity`), but the seller may switch to **any valid
   mode**, including putting a real, maintained count on a food item — a
   carinderia tracking "20 servings of menudo left," a bakery counting 30
   loaves. This is deliberately the **opposite posture** to today's
   restrictive `validateItemAgainstModeTaxonomy`, which throws
   `MODE_ITEM_CATEGORY_UNSUPPORTED`/`MODE_ITEM_UOM_UNSUPPORTED` on an
   unexpected combination — tracking mode must never throw on a valid pairing.
2. **A service is not inventoried — it is scheduled.** `capacity` mode routes
   to the booking/resource engine, never to stock math. A service can still
   *consume* countable inventory (massage oil, a repair part); that lands on
   the parts line via `stock_effect_type`, which is exactly why that field is
   already per-line rather than per-product.
3. **One resolver.** `backend/src/modules/shared/utils/stockBearingPolicy.js`
   becomes the *only* interpreter of tracking mode, returning a descriptor —
   `{tracks_quantity, uses_batches, blocks_on_shortfall, emits_movements,
   carries_cost, valuation_participant, availability_source}` — instead of a
   boolean. No call site reads `items.current_stock` without resolving this
   first.
4. **Reports must tolerate every mode.** `buildStockBearingItemWhere` already
   excludes exempt items from `reportService`/`dashboardService`/
   `costValuationService`; its predicate widens to the new descriptor. Five
   services currently bypass it and must be brought in:
   `alertService.getLowStockAlerts`, `forecastService`, `analyticsService`,
   `itemGroupingService`, `aiContextService`.

## Corrections to earlier claims in this document

**`FnbModifierOption.sku_item_id` does not deplete inventory.** An earlier pass
of this document (Capability B, below) described it as an existing reuse path
for an inventory-depleting add-on. The column, its migration, and the
`belongsTo(Item, {as:'skuItem'})` association exist, but **nothing consumes
it**: the alias is never used in any query `include`, and neither
`resolveFnbLineModifiers` nor `resolveStorefrontLineModifiers`
(`backend/src/modules/pos/usecases/posUseCases.js`,
`backend/src/modules/store/usecases/storeUseCases.js`) reads it. "Extra rice"
up-charges the customer and prints on the kitchen ticket but **never
decrements rice**. It remains the right target shape; wiring it up is new
work, not reuse.

## How each vertical sells today, and where mixed fits

| Vertical (Tier 1) | Sells | Line stock effect | Fulfillment | Notes |
|---|---|---|---|---|
| F&B | menu items + add-ons | `toggle` default (see Axis 4); parts/add-ons `inventory-issue` | `dine_in`/`takeout`/`pickup`/`delivery` | modifiers = add-ons |
| Services | labor (service items) + parts (products) | labor = `capacity` (not stock); parts = `inventory_issue` | `appointment` (booked) or walk-in | advance booking via Services Mode |
| Retail | packaged goods, weighed goods, refills, pack-to-unit | `count_ledger` | `pickup`/`delivery`/counter | per-kg = fractional qty; pack-to-unit = base-unit ledger |
| Mixed / long-tail (any archetype combination) | any of the above in one basket | per line, independently | any enabled method | the repair-shop case; also the natural home for a farmer + retail stall, a masahista who also sells oils, etc. |

The mixed row is the crux: it is **already representable** at the line level;
what is missing is a store being *allowed* to compose more than one archetype
and the POS presenting them cleanly.

## Capability A — Mixed store + capability-driven POS *(largest gap)*

**Problem.** `ops_workflow_mode` is a single, exclusive value per tenant
(`workflowModes.js`, `DEFAULT_WORKFLOW_MODE='food_manufacturing'`,
master-admin-gated in `backend/src/modules/settings/`). A store cannot
declaratively sell food + services + retail together. Separately, the POS
order-method control in `POSCheckoutTerminal.jsx` is a hardcoded, always-visible
Dine-In/Takeout/Pickup/Delivery/Appointment `<select>` defaulting to `dine_in`,
regardless of what the store actually does.

**Design.**

- A tenant **composes** sell capabilities derived from Axis 1 archetypes
  (e.g. `sell_time_service` + `sell_physical_product` for a repair shop) rather
  than selecting one exclusive mode; the effective item taxonomy is the
  **union** of the enabled archetypes' presets. An additive
  `enabled_capabilities` setting on the existing
  `WORKFLOW_MODE_CAPABILITIES` shape is the extensible mechanism.
- Existing single-mode tenants are unchanged: their mode maps to one composed
  capability set, so `MODE_ITEM_TAXONOMY` and POS behavior are identical to
  today.
- Make the POS **capability-driven**: `order_method` options and the mode panels
  chosen in `PosPageShell.jsx` derive from enabled capabilities; the default
  `order_method` is derived, not the literal `dine_in`. A services+retail store
  never shows `Dine In`.
- **Labor** stays a `category='service'` catalog item line (archetype
  `time_service`, mode `capacity`; already works; preserves VAT/reporting). A
  one-off ad-hoc labor line (no catalog item) is an **open decision**,
  deferred; if adopted it still carries `stock_effect_type` and tax treatment.

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
- Reuse `FnbModifierOption.price_delta` for the up-charge. **`sku_item_id`
  (modifier → real stock item) is the correct target shape for an add-on that
  depletes inventory, but per the correction above it does not do so today —
  wiring its consumption at checkout is new work**, not a reuse item. Once
  wired, its stock effect flows through the same per-line `stock_effect_type`
  path as any other line.
- A physical table rename to neutral names is **optional and deferred** behind a
  facade to avoid a destructive migration.

**Reuse vs new.** Mostly reuse for the structure (`price_delta`,
group/option/min/max/required already exist, de-gating is a mode-check
removal). New: wiring `sku_item_id` consumption at checkout (not previously
reuse), removing the mode gate, letting non-F&B item forms attach modifier
groups, generalizing the snapshot field name in docs/read paths.

## Capability C — Retail as first-class (lifted out of the placeholder tier)

**Problem.** `retail` is absent from `MODE_ITEM_TAXONOMY`
(`PLACEHOLDER_ITEM_TAXONOMY_MODES`), so `validateItemAgainstModeTaxonomy`
returns `skipped: 'placeholder_mode'` and retail items are unvalidated — with
the live breakages listed above (nav→403, wrong CSV template, no storefront
template, wrong RBAC, visible "Placeholder mode" copy). There is no model for
per-kilogram goods, refill stations, or pack-to-unit selling.

**Design.** Add corrected presets under `retail` (and the shared `msme`) using
the existing `preset()`/`taxonomy()` builders, each an Axis 1 archetype/trait
projection, defaulting to `count_ledger` (Axis 4):

- `retail_good` — `physical_product`, stock-bearing packaged product (chippy,
  Nutri-Star).
- `weighed_good` — `physical_product` + `weighed`, per-kilogram (raw meat,
  farmers' crops). Reuse the `weight` UOM group in
  `backend/src/utils/uomConverter.js` and `DECIMAL(24,12)` fractional
  quantities: line total = unit price × fractional kg. No new pricing table; the
  POS needs a **weight/quantity entry** affordance (manual entry first; scale
  integration later).
- `refill_good`/`refill_service` — `physical_product` + `refill`, water refill
  station (sold by volume/per-container).
- pack-to-unit ("mini tiangge") — `physical_product` + `pack_to_unit`, received
  as a pack, sold by the piece. Adopt the recommendation in
  `docs/proposals/2026-07-06-flexible-item-types-mini-tiangge-jewelry.md`: reuse
  `ItemBarcode.packaging_level` + `quantity_multiplier` as the single conversion
  factor and extend the **receiving** side (PO receipt, manual stock adjustment,
  CSV import) to convert pack→base units, keeping the stock ledger in base units
  so FIFO/audit semantics are unchanged.

Jewelry (`physical_product` + `serialized`) is a **retail trait**, not a
separate vertical — it stays a deferred follow-up (new `ItemUnit`/`ItemSerial`
table, per the flexible-item-types proposal).

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
  booking subpage (`frontend/apps/store/src/modes/services/`). Keep it —
  this *is* Axis 4's `capacity` mode, already built.
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

## Capability E — External listings (shallow, Axis 3)

**Problem.** No native-vs-external distinction exists anywhere; a cross-platform
store (a cinema, a clinic, the Taxi app) has no way to appear in DGFY at all.

**Design (near-term scope only).** Add an `entity_type`/`source` discriminator
to `StorefrontDiscoveryIndex` so an `external_listing` row can exist without a
backing `Tenant`; relax the `NOT NULL` tenant-identity columns or provide
external equivalents; extend `match_reasons` and `BUSINESS_MODE_PIN_META`
(`frontend/apps/store/src/discovery/model/businessModePins.js`, which already
ships `ticketing_transport`/`healthcare` icons safely) for the new pin type. On
"book," redirect via the existing sanitized external-link opener — the customer
leaves DGFY, matching the confirmed near-term product direction. Do not build
`adapter_booked` or `proxied` in this rollout; document the promotion path so a
future phase can add them without changing the discovery/map contract.

**Reuse vs new.** Reuse the discovery index, map pin registry, and outbound-link
pattern. New: the discriminator column, a non-tenant reconciliation path, and
the redirect affordance on listing cards.

## Capability F — Availability & tracking modes (Axis 4)

**Problem.** Inventory tracking is one heavyweight model that every stock-bearing
product inherits, and no product-level choice exists between "count it," "don't
count it," "declare it available/unavailable," or "let an external IMS own it."
The consequence is a live, shipped contradiction: checkout already exempts a
recipe-backed line from its own-stock check
(`backend/src/modules/shared/utils/fnbRecipeConsumption.js`), but **every
catalog read anywhere — POS or storefront — computes availability purely from
`items.current_stock > 0`**, and no read path consults `product_composition`.
A correctly-configured dish with a full fridge and `current_stock = 0` renders
**Sold Out** and cannot be added to cart, even though the sale would have gone
through.

**Design.** Persist the tracking mode per product and route every stock read
through the `stockBearingPolicy` resolver (Axis 4, design rule 3). Full mode
catalog: `docs/features/INVENTORY_TRACKING_MODES.md`. Resolution for the
motivating contradiction, per confirmed product direction: **freeze the local
recipe engine** — it keeps working exactly as today at checkout, receives no
further investment — and give recipe-backed menu items the `toggle` mode
instead of wiring recipes into browse-time reads. Ingredient-driven browse-time
availability (`recipe_derived`) becomes reachable only through `external_ims`,
once the separately-built SKUpervisor integration exists.

**Reuse vs new.** Reuse `fifo_enabled: false` as `count_ledger`, generalize
`pos_always_available` into `untracked`, reuse the Services Mode availability
engine as `capacity`. New: the persisted mode column, the resolver descriptor,
the `toggle` column and its cross-surface (POS + storefront) enforcement, and —
much later, Phase 8 — the `external_ims`/`recipe_derived` delegation seam.

## Known issues (fold into design now, fix in the phases below)

1. **Browse-vs-checkout availability contradiction** *(the headline symptom;
   see Capability F)* — resolved via `toggle`, not by extending the recipe
   engine.
2. **`pos_always_available` silently disables recipe deduction today** — the
   `stock_effect_type === 'stock_exempt'` `continue` in `posUseCases.js` runs
   *before* the recipe-consumption branch, so "always sellable" also turns off
   ingredient depletion. The Axis 4 resolver must define this interaction
   explicitly instead of leaving it an accidental ordering bug.
3. **`BASE_POS_ITEM_ATTRIBUTES` omits `mode_item_preset`** (`posRepository.js`)
   — so the `mode_item_preset === 'service'` half of `isStockExemptServiceItem`
   **can never fire on the POS catalog or checkout path**, only
   `category === 'service'` does. Also omits `min_threshold` (silently always
   `NaN`, falls back to a hardcoded 5) and `fifo_enabled`.
4. **`cost_snapshot: null` for every stock-exempt line → ₱0 COGS.** Correct for
   labor, wrong for an `untracked` *physical* good — POS profit/Z-reading
   reports would understate cost. Needs a third branch in the checkout
   snapshot logic.
5. **`?? 0` conflates "no ledger row" with "zero on hand"** in both
   `posRepository.applyLocationStockMap` and
   `storeRepository.applyLocationStock` — an untracked item and a genuinely
   sold-out item are indistinguishable until the mode is authoritative.
6. **False `has_drift: true` for every non-FIFO item** in
   `costValuationService` (batch quantity reads as 0 while ledger quantity
   isn't, for any `count_ledger` item) — a reporting bug independent of this
   design, worth fixing alongside the resolver work.
7. **`hasFnbCheckoutContext` is a fragile gate** — the shipped POS terminal
   always sends `course: 'main'`, so the gate is effectively always true in
   *every* workflow mode (not just F&B); a bare API call or a replayed mobile
   payload silently skips composition loading instead.
8. **Dead/misleading code**, to clean up alongside this work rather than let
   mislead future implementers: `frontend/Components/utils/fifoCalculations.js`
   and `frontend/Components/ai/ProductionFeasibilityCard.jsx` (zero importers
   each; the latter's props don't even match its data source),
   `Item.is_leaf_node`/`composition_hash` (declared, never written),
   `ProductComposition.is_subproduct` (a writer exists but the Sequelize model
   field doesn't, so the value is silently dropped), and
   `batchLineageService.createBatchLineage` (zero callers, yet
   `docs/features/NESTED_PRODUCTS.md` documents it as working).

## Governance prerequisites (named here; not performed in this pass)

Required before Phase 8 (`external_ims`) can ship — amending an accepted ADR
is its own governance action, out of scope for this documentation pass:

- **ADR 0029 amendment** — its core rule ("Only Inventory records stock
  effects") already permits an external recorder; state so explicitly and
  define the Inventory-owned port boundary
  (`backend/src/modules/inventory/commands/stockCommandService.js`).
- **ADR 0009 amendment** — its 2026-05-06 "FIFO and location stock are paired"
  addendum currently prohibits a stock-bearing item from opting out of FIFO;
  the F&B `menu_item` preset (`STOCK_BEARING`, `fifo_enabled: false`) already
  violates it in production. The amendment codifies that existing exception.
- **A new reservations ADR** — ADR 0029's Compatibility Decision 4 explicitly
  defers reservation state/expiry/commit/release; an external stock authority
  plus ADR 0014's offline-capable POS makes this unavoidable.
- **A registered compatibility seam** — `external-inventory-authority` as an
  `api-boundary` entry in `docs/architecture/compatibility-seams.json` per
  ADR 0035 (`api-boundary` exists as a seam type today and is unused).
- **Closing capability-gate gaps** — `routes/purchaseOrders.js`,
  `routes/suppliers.js`, and `routes/items.js` currently have **no**
  `requireWorkflowCapability` guard; when inventory is external these must fail
  closed with the existing `WORKFLOW_MODE_CAPABILITY_DENIED` contract.

## Re-sequenced roadmap

Foundations first — per-vertical and per-mode work is unsafe while mode
constants are duplicated, unknown modes coerce to `food_manufacturing`, and
`current_stock` is read without resolving a tracking mode.

- **Phase 0 (this doc + ADR 0037 + `OFFERING_ARCHETYPES.md` +
  `INVENTORY_TRACKING_MODES.md`):** ratify the open model and decisions.
- **Phase 1 — De-risk foundations** *(separable; no user-visible change)*
  - Move mode + taxonomy constants to a single source of truth (today
    duplicated between `backend/src/modules/shared/constants/workflowModes.js`
    and `frontend/src/features/settings/workflowMode.js`); change
    `backend/tests/workflowModes.crossLayer.contract.test.js` to assert one
    source instead of enforcing duplication.
  - Replace the `normalizeWorkflowMode` unknown → `food_manufacturing` coercion
    with a neutral generic baseline.
  - Add a **generic RBAC preset family**
    (`generic_admin`/`manager`/`cashier`/`staff`/`viewer`) in
    `backend/src/config/modeRolePresets.js` as the declared fallback, replacing
    the `food_manufacturing` role fallback in `getRoleCatalogMode`.
  - Build the **Axis 4 `stockBearingPolicy` descriptor resolver** (Capability F
    design rule 3) — the foundation every later tracking-mode phase depends on.
  - Fix bug 3 (POS attribute omissions) and the drift bugs: the 11-value enum
    in `backend/src/config/aiTools.js`; `ItemsPage.jsx`'s `placeholderModes`
    Set wrongly including `hospitality`; the three divergent copies of
    `ONBOARDING_CUSTOMER_FACING_PRESETS`; the four copies of the mode label
    map.
  - Representative: `workflowModes.js`, `frontend/src/features/settings/workflowMode.js`,
    `backend/src/config/modeRolePresets.js`, `backend/src/config/aiTools.js`,
    `frontend/src/features/inventory/pages/ItemsPage.jsx`,
    `backend/src/modules/shared/utils/stockBearingPolicy.js`,
    `backend/src/modules/pos/repositories/posRepository.js`.
- **Phase 2 — Retail taxonomy correction (shipped).** Promoted `retail` out of
  `PLACEHOLDER_ITEM_TAXONOMY_MODES` into `CORRECTED_ITEM_TAXONOMY_MODES` with
  four real presets (`general_merchandise`, `weighed_goods`, `refill_product`,
  `supplies`), so `validateItemAgainstModeTaxonomy` runs real validation for
  retail instead of returning `{ ok: true, skipped: 'placeholder_mode' }`.
  Fixed the CSV import template, `catalogSetupPolicy.js`, the onboarding preset
  map, and gave retail a real storefront template/theme.
  - **Not** included, contrary to an earlier draft of this roadmap:
    `offering_types`/traits activation (still unscheduled —
    `businessClassification.js` remains at zero importers), and modifier
    de-gating (moved to Phase 5).
  - **Operational note:** this switched retail item validation on for the first
    time with no migration or grace period. Retail items that do not fit the
    four presets throw `422` on their next create, taxonomy-touching edit, or
    draft-finalize.
- **Phase 3 — Report tolerance + non-schema bug fixes (shipped).** Widened
  `buildStockBearingItemWhere` into the five bypassing services
  (`alertService`, `forecastService`, `analyticsService`, `itemGroupingService`,
  `aiContextService`); fixed bug 4 (`cost_snapshot` wrongly nulled for
  untracked physical goods) and bug 6 (false `has_drift` on every non-FIFO
  item).
  - **Not** included, contrary to an earlier draft: the persisted tracking-mode
    column, the `toggle` column, the `untracked` generalization, and bugs 1, 2
    and 5 — all of which need the schema change and moved to Phase 5.
- **Phase 4 — Business type ≠ mode (shipped).** Relabelled
  `RegisterCompany.jsx`'s operating-mode select (it called the 11 engineering
  modes "Business Industry") and added a separate, optional, purely descriptive
  `industry_tag` persisted in `Tenant.settings`. `businessClassification.js`
  was deliberately left in place, neither wired up nor deleted — its fate is
  still an open product decision.
- **Phase 5 — Finish the foundations.** The work Phases 2 and 3 deferred, plus
  the capability-gating that Phase 6 depends on. Ships as two PRs because a
  tenant schema migration should not share a diff with routing/UI changes.
  - *Nav and route capability-gating.* `Layout.jsx` declared
    `requiredCapability` on three nav entries but the nav filter never read it;
    visibility came from hardcoded per-family lists covering only 4 of the 10
    mode families. Job Orders and Dispatch Orders therefore rendered — then
    hard-403'd — in five modes (`retail`, `healthcare`, `ticketing_transport`,
    `logistics_distribution`, `education_institutions`). Both nav and routes
    now derive from the same capability their backend routes enforce.
  - *Modifier de-gating (Capability B).* `routes/fnb.js` blanket-gated all 24
    of its endpoints behind `fnbDining`, including the 4 modifier-management
    routes. Those now sit behind `menuModifiers`, which every mode holds.
    Checkout, the catalog includes and the cart layer were already
    mode-agnostic, and the join table's `item_id` already targets generic
    `items`, so no data work was needed. `sku_item_id` consumption remains
    unwired — see the correction above.
  - *Persisted tracking-mode column (Capability F, second PR).* Persist the
    mode; migrate the boolean call sites onto `resolveStockBearingDescriptor`;
    add `toggle`; generalize `pos_always_available` into `untracked`; make
    `count_ledger` the archetype default; resolve bugs 1, 2 and 5.
  - Representative: `Layout.jsx`, `frontend/src/main.jsx`,
    `frontend/src/features/settings/workflowMode.js`, `routes/fnb.js`,
    `packages/shared-constants/src/workflowModes.js`,
    `stockBearingPolicy.js`, `Item.js` (new column), `posUseCases.js`,
    `storeUseCases.js`/`storeRepository.js`.
- **Phase 6 — Composed store capabilities + capability-driven POS**
  (Capability A). Ships as two PRs; POS weight entry (6c) turned out to be a
  genuine UI build rather than a tweak, so it stays separate.
  - **6a+6b — Composed capability model + capability-driven POS (shipped).**
    Added `ops_enabled_capabilities`, a per-tenant setting mirroring
    `ops_workflow_mode`'s own storage/authorization shape (master-admin gated,
    validated against a closed capability vocabulary) that lets a tenant
    additively opt into capabilities beyond its base mode — a `retail`-mode
    repair shop can enable `services` and sell parts and labor on one receipt.
    `modeHasCapability`, `resolveEffectiveCapabilities`, and item-taxonomy
    validation all gained an optional overlay parameter that every pre-Phase-6
    call site continues to omit, so single-mode tenants are byte-identical to
    before. `requireWorkflowCapability` now reads through a new short-TTL
    (15s), tenant-scoped cache instead of an uncached `SystemSetting.findOne`
    per request. `PosPageShell.jsx`'s three vertical panels (Services queue,
    Hospitality front desk, F&B dining) now render on the tenant's *effective*
    capability set rather than a single mutually-exclusive `isXWorkflowMode`
    check, so a composed tenant sees every panel it's entitled to. Also fixed
    the mixed-basket `order_method` bug: adding a service line used to
    unconditionally force `order_method` to `'appointment'` on every add,
    silently reclassifying an in-progress mixed basket; it now only defaults
    when the service is the first line in an otherwise-empty cart.
    **Deliberately not done this sub-phase:** enforcing or deleting the 15 of
    21 declared capabilities that are still dead (no guard reads them) — that
    is a per-capability product decision, not a mechanical follow-on to the
    overlay mechanism; unifying the two POS shells (the admin `/pos` route's
    `PosPageShell` vs. the standalone `frontend/apps/pos` terminal, which has
    no vertical panel at all) — flagged as its own decision, not attempted
    unsupervised; and surfacing `stock_effect_type`/UOM on POS cart lines,
    which remains entirely absent from the frontend.
  - **6c — POS weight entry (not started).** Manual decimal quantity entry for
    the `weighed_goods` preset. The backend is already decimal-capable
    (`quantity` is `DECIMAL(24,12)`); every manual POS entry path is
    integer-only today (regex strips the decimal point, `Math.floor` on
    commit).
  - Representative: `backend/src/modules/settings/`,
    `backend/src/middleware/workflowModeCapability.js`,
    `packages/shared-constants/src/workflowModes.js`,
    `packages/shared-constants/src/modeItemTaxonomy.js`,
    `POSCheckoutTerminal.jsx`, `PosPageShell.jsx`, `frontend/apps/pos/`.
- **Phase 7 — Booking generalization + mixed fulfillment** (Capability D):
  generalized service presentation, booking→sale settlement, parts-on-booking.
  Builds on Services Mode + Phase 6 mixed basket.
  - Representative: `backend/src/modules/services/usecases/serviceUseCases.js`,
    `ServiceBooking.js`, `posUseCases.js`,
    `frontend/apps/store/src/modes/services/`.
- **Phase 8 — External listings (shallow)** (Capability E): `entity_type`/
  `source` discriminator, map display for cross-platform stores, redirect on
  book. A **separate axis** (Axis 3) — discovery and display of stores that
  transact elsewhere; it does not extend the product-classification work.
- **Phase 9 — External IMS delegation** (Capability F's `external_ims` /
  `recipe_derived`): the stock port contract, converting the ~4 direct
  `stockCommandService`-bypassing importers to DI, an `inventory_authority`
  tenant setting, the registered compatibility seam, and closing the
  capability-gate gaps named above. Also a **separate axis** (Axis 4) — it
  changes who owns the ledger, not how products are classified. Requires the
  governance prerequisites to have landed first.
  - Representative: `stockCommandService.js`, `jobOrderService.js`,
    `dispatchOrderService.js`, `stockMovementToolRegistry.js`,
    `docs/architecture/compatibility-seams.json`,
    `scripts/dgfy-seam-smoke.js`.
- **Deferred:** the F&B prep workflow gap (ADR 0019,
  `docs/features/FOOD_AND_BEVERAGE_MODE.md` — noted, not designed here;
  `toggle` is the interim workaround); the `rental` archetype's
  occupancy-tracking gap; storefront `isXMode` boolean de-fanning (measured
  2026-07-26: 39 files / 375 occurrences, of which 35 files / 358 occurrences
  are production and roughly 173 are true conditional branches;
  `StorefrontApp.jsx` alone 50); jewelry serialization;
  `adapter_booked`/`proxied` external tiers; dead-code cleanup (bug 8).

**Every phase that adds a column must also update the tenant-schema registry**
(`backend/scripts/sync-tenant-schemas.js`) **and**
`backend/src/services/runtimeSchemaAuditService.js`, and pass
`npm run check:tenant-schema-coverage` — the runtime audit **503s tenants**
whose schema lacks a required column; see
`docs/ops/BETA_TENANT_PROVISIONING_INCIDENT_2026-07-04.md` for the postmortem
on skipping this step.

## Open decisions

1. Composed `enabled_capabilities` overlay vs. a composite mode *value* as the
   primary configuration surface (leaning capabilities-overlay per ADR 0037's
   rejection of a single new exclusive mode).
2. Whether to allow an **ad-hoc/custom labor line** with no catalog item
   (default: no — use a catalog service item for tax/reporting correctness).
3. Pack-to-unit conversion factor: per-barcode only (as today) vs. also a
   simpler "default pack size" on the item (per the flexible-item-types
   proposal's open question).
4. Target **booking multiplicity** on the storefront (single vs. batch vs. true
   multi-line).
5. POS **weighed-goods capture**: manual weight entry first; scale/hardware
   integration later.
6. Whether Cinema and Doctors become Tier 2 Basic native verticals or stay
   `external_listing` — explicitly undecided per domain, not resolved here.
7. Where a resolved archetype-derived preset registry should live long-term
   (still inside `modeItemTaxonomy.js` as a projection, vs. a new
   archetype-first module) — a Phase 2 implementation-time call.
8. Whether `toggle` needs a reason code / "back by" timestamp at launch, or
   whether a bare boolean is sufficient for the first cut — a Phase 3
   implementation-time call.
9. The `rental` archetype's occupancy tracking model (out-vs-returned) is
   unresolved and explicitly deferred — see `docs/features/OFFERING_ARCHETYPES.md`.

## Validation (for implementation phases)

- Cross-layer constant contract test asserts a single source of truth (not
  duplication); `normalizeWorkflowMode` fallback tests for known-valid modes
  (unchanged behavior) vs. unrecognized values (new neutral baseline).
- Archetype/trait-derived preset tests; `modeItemTaxonomy` tests for new
  `retail` presets + non-regression of the five corrected modes; UOM/weight and
  pack-to-unit conversion tests.
- Modifier de-gating tests: service and retail items attach modifier groups;
  `sku_item_id` consumption issues stock via `stock_effect_type` once wired
  (Capability B).
- Generic RBAC preset family tests for Tier 3 (no-vertical) tenants.
- Axis 4 resolver tests for all seven modes; report-tolerance tests proving the
  five currently-bypassing services correctly exclude/mark non-counted
  products; a cost-snapshot test proving an `untracked` physical good still
  contributes COGS; a `toggle` cross-surface consistency test (POS and
  storefront agree).
- POS mixed-basket integration test (service labor + retail parts + food) with
  correct stock and VAT; capability-driven order-method/panel tests.
- Services booking→sale linkage test (idempotent; parts added to the same
  transaction); generalized service presentation renders a repair service.
- External-listing discovery test: an `external_listing` row renders on the map
  distinctly from a `dgfy_native` store and redirects on book, with no
  authoritative-seller confusion.
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
- Deep external integration (`adapter_booked`, `proxied`), cross-entity
  settlement, outbound webhooks/outbox, and any courier/driver entity — reserved
  and documented only, per the confirmed shallow-external decision.
- Editing accepted ADRs 0009 / 0010 / 0029 — the amendments needed are named
  above, not written, in this pass.
- The F&B prep workflow (ADR 0019, `FOOD_AND_BEVERAGE_MODE.md` — a known,
  deferred gap; `toggle` is the practical workaround for now).
- Jewelry per-piece serialization (deferred follow-up per the flexible-item
  proposal); the `rental` archetype's occupancy-tracking gap (see
  `OFFERING_ARCHETYPES.md`).
- The storefront `isXMode` boolean de-fanning refactor (39 files / 375
  occurrences as measured 2026-07-26).
- Payment/fiscal/promo redesign — bounded by ADR 0027/0033 and unchanged here.
