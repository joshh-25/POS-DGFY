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
phased roadmap for uniting the platform's products behind one product concept
and one line-item model, and for letting any store — native vertical or
long-tail seller — select and sell the right items through the POS. The
ratifying decisions live in
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`.
The archetype/trait catalog referenced throughout lives in
`docs/features/OFFERING_ARCHETYPES.md`. Read `docs/START_HERE.md`,
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

**This document supersedes its own earlier framing.** An earlier pass described
"three product domains" (food/services/retail) as the target model and proposed
a closed `sell_food`/`sell_services`/`sell_retail` capability trio. That is a
closed enumeration with the same shape as the platform's original food-centric
mistake — it cannot express a farmer or a bracelet maker without adding a new
value per category. This revision replaces the closed trio with the open
three-axis model below.

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

## The model: three orthogonal axes

Stop treating "what kind of business" as one exclusive value. Split it into
three independent axes.

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

*Who owns the authoritative record.* Orthogonal to axes 1 and 2, and
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

Known schema blockers for `external_listing`, to resolve when Phase 6 is
implemented: `StorefrontDiscoveryIndex.{tenant_id, tenant_name,
tenant_company_token, slug}` are all `NOT NULL` with no `entity_type`/`source`
discriminator, and reconciliation
(`backend/src/services/storefrontDiscoveryIndexService.js`) hard-gates on
`Tenant.findOne({ status: 'active' })`, so a non-tenant row cannot exist today.
`DgfyCustomerActivity.tenant_id` is similarly `NOT NULL`, blocking a later
unified native+external "my bookings" surface.

## How each vertical sells today, and where mixed fits

| Vertical (Tier 1) | Sells | Line stock effect | Fulfillment | Notes |
|---|---|---|---|---|
| F&B | menu items + add-ons | inventory-issue (or exempt for made-to-order) | `dine_in`/`takeout`/`pickup`/`delivery` | modifiers = add-ons |
| Services | labor (service items) + parts (products) | labor = `stock_exempt`; parts = `inventory_issue` | `appointment` (booked) or walk-in | advance booking via Services Mode |
| Retail | packaged goods, weighed goods, refills, pack-to-unit | `inventory_issue` | `pickup`/`delivery`/counter | per-kg = fractional qty; pack-to-unit = base-unit ledger |
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
- **Labor** stays a `category='service'`, stock-exempt catalog item line
  (archetype `time_service`; already works; preserves VAT/reporting). A one-off
  ad-hoc labor line (no catalog item) is an **open decision**, deferred; if
  adopted it still carries `stock_effect_type` and tax treatment.

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

## Capability C — Retail as first-class (lifted out of the placeholder tier)

**Problem.** `retail` is absent from `MODE_ITEM_TAXONOMY`
(`PLACEHOLDER_ITEM_TAXONOMY_MODES`), so `validateItemAgainstModeTaxonomy`
returns `skipped: 'placeholder_mode'` and retail items are unvalidated — with
the live breakages listed above (nav→403, wrong CSV template, no storefront
template, wrong RBAC, visible "Placeholder mode" copy). There is no model for
per-kilogram goods, refill stations, or pack-to-unit selling.

**Design.** Add corrected presets under `retail` (and the shared `msme`) using
the existing `preset()`/`taxonomy()` builders, each an Axis 1 archetype/trait
projection:

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

## Re-sequenced roadmap

Foundations first — per-vertical work is unsafe while mode constants are
duplicated and unknown modes coerce to `food_manufacturing`.

- **Phase 0 (this doc + ADR 0037 + `OFFERING_ARCHETYPES.md`):** ratify the open
  model and decisions.
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
  - Fix drift bugs from hand-copied lists: the 11-value enum in
    `backend/src/config/aiTools.js`; `ItemsPage.jsx`'s `placeholderModes` Set
    wrongly including `hospitality`; the three divergent copies of
    `ONBOARDING_CUSTOMER_FACING_PRESETS`; the four copies of the mode label map.
  - Representative: `workflowModes.js`, `frontend/src/features/settings/workflowMode.js`,
    `backend/src/config/modeRolePresets.js`, `backend/src/config/aiTools.js`,
    `frontend/src/features/inventory/pages/ItemsPage.jsx`.
- **Phase 2 — Offering archetypes + catalog:** activate `offering_types` +
  traits as the composable axis (Capability details above); correct the
  **Retail** taxonomy (Capability C) and fix its placeholder-tier breakages;
  de-gate modifiers (Capability B). **Long-tail sellers become supported here.**
  - Representative: `modeItemTaxonomy.js` (+ FE mirror), `backend/src/modules/fnb/`
    (de-gate), receiving paths (PO receipt / stock adjustment / CSV import) for
    pack-to-unit, `ItemBarcode.js`, `backend/src/utils/uomConverter.js`,
    `businessClassification.js` (activate).
- **Phase 3 — Business type ≠ mode:** capture a real business-type/industry tag
  at onboarding, separate from the operating mode; fix
  `RegisterCompany.jsx`'s "Business Industry" mislabel; wire up or remove the
  now-activated `businessClassification.js` cleanly (no dead code left behind).
- **Phase 4 — Composed store capabilities + capability-driven POS**
  (Capability A): composite capability configuration + master-admin gate,
  capability-driven `order_method` and panels, mixed-basket UX, POS weight
  entry. Depends on Phase 2 presets.
  - Representative: `backend/src/modules/settings/`, `POSCheckoutTerminal.jsx`,
    `PosPageShell.jsx`.
- **Phase 5 — Booking generalization + mixed fulfillment** (Capability D):
  generalized service presentation, booking→sale linkage, parts-on-booking.
  Builds on Services Mode + Phase 4 mixed basket.
  - Representative: `backend/src/modules/services/usecases/serviceUseCases.js`,
    `ServiceBooking.js`, `posUseCases.js`,
    `frontend/apps/store/src/modes/services/`.
- **Phase 6 — External listings (shallow)** (Capability E): `entity_type`/
  `source` discriminator, map display for cross-platform stores, redirect on
  book.
- **Deferred:** storefront `isXMode` boolean de-fanning (~38 files / ~250
  sites, `StorefrontApp.jsx` alone ~50) as capability/variant lookups; jewelry
  serialization; `adapter_booked`/`proxied` external tiers.

**Every phase that adds a column must also update the tenant-schema registry
(`backend/scripts/sync-tenant-schemas.js`) and pass
`npm run check:tenant-schema-coverage`** — the multi-tenant per-database sync
step, not just a Sequelize migration.

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

## Validation (for implementation phases)

- Cross-layer constant contract test asserts a single source of truth (not
  duplication); `normalizeWorkflowMode` fallback tests for known-valid modes
  (unchanged behavior) vs. unrecognized values (new neutral baseline).
- Archetype/trait-derived preset tests; `modeItemTaxonomy` tests for new
  `retail` presets + non-regression of the five corrected modes; UOM/weight and
  pack-to-unit conversion tests.
- Modifier de-gating tests: service and retail items attach modifier groups;
  inventory-depleting add-on issues stock via `stock_effect_type`.
- Generic RBAC preset family tests for Tier 3 (no-vertical) tenants.
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
- Jewelry per-piece serialization (deferred follow-up per the flexible-item
  proposal); the `rental` archetype's reservation-lifecycle gap (see
  `OFFERING_ARCHETYPES.md`).
- The storefront `isXMode` boolean de-fanning refactor (~38 files).
- Payment/fiscal/promo redesign — bounded by ADR 0027/0033 and unchanged here.
