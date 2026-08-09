---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-07-25
last_reviewed: 2026-07-25
review_by: 2027-01-25
applies_to: architecture_decision
topic: unified_product_domain_and_capability_driven_store_types
---

# ADR 0037: Open Multi-Vertical Product Model and Capability-Driven Store Types

## Context

DGFY began food/restaurant-centric and is becoming a platform for many kinds of
sellers: restaurants (F&B), retail stores (tiangges to groceries to raw-meat
and water sellers), and services (computer/TV/phone repair, private massage,
shoe cleaning). Those three are today's natively-supported verticals, **not**
the model — the platform must also reach long-tail sellers nobody can
enumerate up front (a farmer selling crops, a bracelet maker, a broom seller),
support a lower "basic" tier for future verticals (Hospitality, Doctors,
Cinemas), and eventually surface domains whose authoritative backend lives in a
different application entirely (a ticketing app, a clinic app, a Taxi app being
built separately). A single store is also often a *mix*: a repair shop that, in
one transaction, charges labor **and** sells the replaced CPU / oil / chain.

**This ADR supersedes its own earlier draft, twice.** A first pass described
"three product domains" (`sell_food`/`sell_services`/`sell_retail`) as the
target capability set — repeating the platform's original mistake, a closed,
food-shaped enumeration, with three values instead of one. This version
replaces the closed trio with an **open, composable model**. A second gap
surfaced during the same design pass: the platform is also **IMS-first** — it
was cloned from SKUpervisor, an Inventory Management System, before it grew a
POS and storefront — so it assumes every sellable product carries an accurate,
batch-tracked quantity. It doesn't. A restaurant menu item cannot be honestly
tracked as "10 servings" — cooking isn't that consistent — so its availability
must be *declared* (on/off) or *derived* (from ingredient stock), never
maintained as a fictional count. A service cannot be inventoried at all; its
constraint is time and capacity, not units on a shelf. This version therefore
adds a fourth axis — availability/tracking mode — alongside the open product
domain model, and treats DGFY's existing heavyweight FIFO/batch/costing
machinery as one **frozen, selectable tier** rather than the implicit
baseline. SKUpervisor is being built **separately** as a dedicated IMS; DGFY
will optionally delegate deep inventory to it rather than deepen its own.

Much of the mechanical core is already true in the live backend, and this ADR
ratifies that direction:

1. There is already **one universal product table** — `backend/src/models/Item.js`
   (`items`) — discriminated by `category` (`raw_material`, `packaging`,
   `product`, `supplies`, `service`), `product_type`, and `mode_item_preset`,
   resolved through the per-mode `MODE_ITEM_TAXONOMY`
   (`backend/src/modules/shared/constants/modeItemTaxonomy.js`). There is no
   per-domain product table, and this ADR forbids adding one.
2. **Mixed baskets already work mechanically.** Each POS line
   (`backend/src/models/PosTransactionLine.js`) carries `stock_effect_type`
   (`inventory_issue` vs `stock_exempt`); `backend/src/modules/pos/usecases/posUseCases.js`
   issues inventory for stock-bearing lines and skips it for stock-exempt
   service lines within one `pos_transactions` row. A labor line and a parts
   line already coexist in a single sale.
3. A **mature Services Mode** (ADR 0016) already does advance booking end to end:
   availability engine, holds, waitlists, resources/technicians, reminders, and
   a storefront booking flow (`backend/src/modules/services/`,
   `frontend/apps/store/src/modes/services/`).
4. The archetype vocabulary this ADR activates already exists as **dead code**:
   `backend/src/modules/onboarding/domain/businessClassification.js` declares
   `offering_types: ['physical_product','time_service','ticketed_seat','capacity_slot','rental']`
   and `fulfillment_methods` including `platform_delivery`/`on_site_service`,
   with zero importers anywhere in the codebase.
5. Mode storage is already schemaless — no DB ENUM anywhere for the workflow
   mode (`system_settings.ops_workflow_mode` TEXT, `tenants.settings` JSON,
   `items.mode_item_preset` STRING(64)). Adding a vertical needs no migration.
6. **A "simple count, no batches" tracking tier already exists and is in
   production.** `items.fifo_enabled: false` yields exactly a scalar
   `current_stock` balance plus append-only `stock_movements`, with no
   `FIFOBatch`/`BatchTransaction`/reconciliation guard
   (`backend/src/services/stockMovementService.js`); the F&B `menu_item`
   preset already ships this way. A location-less variant of the same write
   path also already runs (writes only the scalar balance + one movement row
   when no location resolves).
7. **A "no tracking" prototype already exists**, scoped to POS:
   `pos_catalog_overrides.pos_always_available`
   (`backend/src/models/PosCatalogOverride.js`) already sets
   `stock_effect_type='stock_exempt'` and skips inventory movement entirely;
   both frontends already represent it as `Number.POSITIVE_INFINITY`.
8. **A real recipe-consumption engine already exists and ships at checkout** —
   `backend/src/modules/shared/utils/fnbRecipeConsumption.js` deducts
   ingredient stock, location-scoped and UOM-converting, when a menu item with
   a defined recipe (`ProductComposition`) is sold. It coexists with a live
   contradiction this ADR must resolve, not extend: no catalog read anywhere
   (POS or storefront) consults ingredient stock, so a correctly-configured,
   fully-stocked dish with `current_stock = 0` renders "Sold Out" and cannot be
   added to a cart, even though checkout would have exempted it. Per confirmed
   product direction, this local engine is **frozen** rather than extended — see
   Decision 11.

The gaps that make this an architecture decision, not a code change:

- **Store type is a single, exclusive `ops_workflow_mode`** per tenant (11 modes,
  `DEFAULT_WORKFLOW_MODE='food_manufacturing'`,
  `backend/src/modules/shared/constants/workflowModes.js`). There is no
  composed/mixed store, even though the basket mechanics allow one.
- **Adding one vertical costs roughly 35 source files and 5 contract tests.**
  Mode constants are byte-duplicated between
  `backend/src/modules/shared/constants/workflowModes.js` and
  `frontend/src/features/settings/workflowMode.js`, and
  `backend/tests/workflowModes.crossLayer.contract.test.js` reaches across the
  repo boundary to **enforce** that duplication rather than eliminate it.
  `MODE_ITEM_TAXONOMY` is duplicated the same way. This is the largest concrete
  barrier to the openness this ADR requires.
- **`normalizeWorkflowMode` silently coerces any unrecognized mode value to
  `food_manufacturing`.** An unregistered vertical does not degrade gracefully —
  it becomes a food factory (wrong nav, wrong CSV template, wrong RBAC catalog,
  wrong item defaults).
- **`retail` — one of the three native verticals — is a placeholder taxonomy in
  the worst possible way, not merely unfinished.** It is absent from
  `MODE_ITEM_TAXONOMY` (`PLACEHOLDER_ITEM_TAXONOMY_MODES`), so
  `validateItemAgainstModeTaxonomy` returns `skipped: 'placeholder_mode'` and
  retail items are unvalidated. Live consequences: Job Orders/Dispatch Orders
  render in the sidebar then hard-403 from
  `requireWorkflowCapability('productionWorkflows')`; the served CSV import
  template is `food_manufacturing_items_import_template.csv`; there is no
  `retail` storefront template; RBAC falls back to
  `food_manufacturing`-family roles; and operators see the literal string
  "Placeholder mode: conservative default" in the Items list.
- **The `msme` catch-all cannot hold the long tail.** Its capabilities are
  `['catalog', 'pos', 'storefront']` — no `inventory` — and its two item
  presets allow only `pcs`/count+packaging units, so a farmer selling by the
  kilo is rejected (`MODE_ITEM_UOM_UNSUPPORTED`), and it has no `service`
  preset, forcing a shoe cleaner or masahista onto the full heavyweight
  `services` mode.
- **Business type is conflated with operating mode, and there is no real
  business-type taxonomy.** `industry_tags` in onboarding is unconstrained free
  text with no allow-list; the classification engine
  (`businessClassification.js`) has zero importers; and
  `frontend/Pages/RegisterCompany.jsx` renders the platform's **11 engineering
  modes** under the label "Business Industry" — a broom seller has nowhere to
  record what they actually sell except by picking an engineering mode.
- **Adding a vertical is a governed, multi-week program by policy.**
  `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md` requires an 11-step build
  order plus RBAC, provisioning, and item-correction checklists and an accepted
  ADR before a mode is production-ready. This is appropriate for F&B/Retail/
  Services; it cannot be the onboarding path for a broom seller.
- **Add-ons are F&B-only** (`fnb_modifier_groups` / `fnb_modifier_options` /
  `fnb_item_modifier_groups`), gated by `fnb` mode and not attachable to service
  or retail items.
- **Booking is siloed** in Services Mode and not wired to add consumed parts to
  the same sale at fulfillment time.
- **A native-vs-external distinction does not exist anywhere** — no vocabulary,
  no adapter/port abstraction (PayMongo and PayPal are two unrelated singleton
  services, not a shared port). Forward-compat seams exist and are the intended
  reuse path: `HospitalityReservation.{source:'ota', external_source,
  external_reference, channel_metadata}`
  (`backend/src/models/HospitalityModels.js`), `DeliveryJob.{provider,
  provider_delivery_id, provider_payload, tracking_url}` with a `'manual'`
  null-adapter (`backend/src/models/DeliveryJob.js`, ADR 0034), a
  provider-agnostic `backend/src/models/Landlord/WebhookLog.js`, and
  `DgfyCustomerActivity` — a cross-tenant, snapshot-rendered activity feed with
  a per-type action matrix that is close to a free unified "my orders/my
  bookings" surface.

This ADR governs the **`backend/` + `frontend/`** product system. `backend/` is
being mechanically relocated (and rewritten) into `apps/*` on a separate
branch; that relocation is not a competing product model, and this ADR governs
the backend wherever it lands — it does not read or reference the in-progress
relocation while it is mid-rewrite. Detailed design, the archetype/trait
catalog, and the phased roadmap live in
`docs/features/UNIFIED_PRODUCT_DOMAIN.md` and
`docs/features/OFFERING_ARCHETYPES.md`.

## Decision

1. **One universal product entity across all domains.** `items` remains the
   single product table. Domain is expressed by `category` + `mode_item_preset`
   resolved through `MODE_ITEM_TAXONOMY`. No per-domain product table
   (`menu_items`, `service_products`, `retail_products`, etc.) may be introduced.
   All selling flows through `pos_transactions` / `pos_transaction_lines`, and
   per-line `stock_effect_type` is the mechanism that makes a basket dynamic
   (labor + parts + food together).

2. **"What kind of business" and "how is it tracked" split into four
   orthogonal axes instead of one exclusive mode.** This replaces the closed
   `sell_food`/`sell_services`/`sell_retail` capability trio from the
   superseded draft of this ADR.

   - **Axis 1 — Offering archetype (open, composable, line-level).** What kind
     of thing is being sold, mechanically: `physical_product`, `time_service`,
     `ticketed_seat`, `capacity_slot`, `rental` — the existing
     `offering_types` vocabulary in `businessClassification.js`, activated
     rather than replaced — composed with traits (`weighed`, `pack_to_unit`,
     `serialized`, `refill`, `made_to_order`, `prepared_food`) for long-tail
     variation. Item taxonomy presets are derived from archetype + trait
     instead of hand-authored per mode. Full catalog:
     `docs/features/OFFERING_ARCHETYPES.md`.
   - **Axis 2 — Vertical preset (optional packaging, tiered).** How a product
     is dressed for a business type — labels, nouns, defaults, UI template. A
     vertical is a thin preset selecting a composition of capabilities, not a
     new engineering mode, in three tiers: **Tier 1 Native** (F&B, Retail,
     Services — the full governed `MODE_DEVELOPMENT_PLAYBOOK` pass), **Tier 2
     Basic** (Hospitality, Healthcare, Ticketing — a thin preset over generic
     capabilities plus a generic RBAC preset family, no governed pass
     required), **Tier 3 None** (the long tail — archetypes only, zero new code
     per seller type).
   - **Axis 3 — Provider/source (native vs. external).** Who owns the
     authoritative record: `dgfy_native` (default, everything today) or
     `external_listing` (the only external tier built now — see Decision 8).
     `adapter_booked` and `proxied` are reserved and documented, not built.
   - **Axis 4 — Availability/tracking mode (per product, permissive).** How
     "can I sell this right now" is answered — not one model, but a per-product
     choice among seven modes: `untracked`, `count_ledger`, `full_fifo`,
     `external_ims` (counted sources); `toggle` (declared); `capacity`
     (scheduled, not stocked at all); `recipe_derived` (derived, reserved for
     `external_ims`). Full catalog, including which modes already exist versus
     are new, and the default-per-archetype table:
     `docs/features/INVENTORY_TRACKING_MODES.md`. See Decision 11 for the
     governing rules.

   A tenant composes sell capabilities derived from Axis 1 archetypes (e.g.
   `sell_time_service` + `sell_physical_product` for a repair shop) rather than
   selecting one exclusive mode; the effective item
   taxonomy for a composed tenant is the **union** of the enabled archetypes'
   presets. Existing single-mode tenants are unchanged — their mode maps to one
   composed capability set. Changing a store's capabilities stays
   **master-admin gated**, exactly like today's `ops_workflow_mode` setting.

3. **The POS is capability-driven, not food-hardcoded.** The `order_method`
   options and the mode panels selected in
   `frontend/src/features/pos/pages/PosPageShell.jsx` derive from the tenant's
   composed capabilities (Axis 2), not a hardcoded mode literal. A store without
   a food-selling capability never defaults to or shows `Dine In`. The default
   `order_method` in `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
   is derived, not the literal `dine_in` constant.

4. **Labor is a catalog service line.** A labor charge is a `category='service'`,
   stock-exempt `items` row (archetype `time_service`) sold as a normal line
   (already supported and preserved for tax/reporting correctness). A
   lightweight ad-hoc/custom one-off line with no catalog item is **deferred**
   and out of scope here; if later adopted it must still carry a
   `stock_effect_type` and tax treatment.

5. **Add-ons/modifiers are promoted to a domain-neutral model.** The existing
   `fnb_modifier_*` tables are de-gated from `fnb`-only so a modifier group can
   attach to any `items` row regardless of `category`. The per-line modifier
   snapshot (`fnb_modifiers_snapshot`) is treated as a generic
   `modifiers_snapshot`. **Correction (2026-07-25):** an earlier version of this
   decision described `FnbModifierOption.sku_item_id` (modifier → real stock
   item) as an existing reuse path for an inventory-depleting add-on. It is
   not — the column, its migration, and the `belongsTo(Item, {as:'skuItem'})`
   association exist, but nothing reads it: the alias is never used in any
   query `include`, and neither the POS nor the storefront modifier-resolution
   path (`resolveFnbLineModifiers`/`resolveStorefrontLineModifiers` in
   `backend/src/modules/pos/usecases/posUseCases.js` and
   `backend/src/modules/store/usecases/storeUseCases.js`) consumes it — "extra
   rice" up-charges the customer and prints on the kitchen ticket but never
   decrements rice. `sku_item_id` remains the correct **target** shape to wire
   up (its stock effect would flow through the same per-line
   `stock_effect_type` path), but wiring it is **new work**, not reuse. A
   physical table rename is optional and deferred behind a facade to avoid a
   destructive migration.

6. **Retail is lifted out of the placeholder tier into Tier 1 Native, with an
   archetype-derived taxonomy.** `retail` (and the shared `msme`) gain real
   presets in `MODE_ITEM_TAXONOMY` derived from Axis 1: `retail_good`
   (`physical_product`, stock-bearing), `weighed_good` (`physical_product` +
   `weighed`), `refill_good`/`refill_service` (`physical_product` + `refill`),
   and a pack-to-unit shape (`physical_product` + `pack_to_unit`, "mini
   tiangge"). Per-kilogram reuses the `weight` UOM group in
   `backend/src/utils/uomConverter.js` with `DECIMAL(24,12)` fractional
   quantities (price = unit price × fractional kg); no pricing table is added.
   Pack-to-unit reuses `ItemBarcode.packaging_level` + `quantity_multiplier` as
   the single conversion factor and extends the **receiving** side (PO receipt,
   manual adjustment, CSV import) to convert pack→base units, keeping the stock
   ledger in base units. Correcting the `retail` taxonomy must preserve
   existing retail tenants' items via the taxonomy's existing legacy-edit
   escape hatch. Jewelry (`physical_product` + `serialized`) stays a deferred
   follow-up — it is a retail trait, not a separate vertical.

7. **Advance booking reuses Services Mode and links to the sale.** A completed
   booking becomes a POS sale via the reserved
   `service_bookings.pos_transaction_id`; parts consumed during the service are
   added as `inventory_issue` lines on that same `pos_transactions` row. This is
   where the mixed store and booking meet. Service-family presentation is
   generalized beyond the current `laundry`/`aircon_cleaning` tuning so repair
   services render on the storefront.

8. **External listings are supported shallowly, by redirect, with the deeper
   tiers reserved and undecided per domain.** Per product direction, the
   near-term scope for Axis 3's `external_listing` tier is: a cross-platform
   store or listing (a ticketing app's cinema, a clinic app's doctor listing, a
   Taxi app trip) can appear in DGFY discovery and on the DGFY map, and booking
   **redirects the customer to the other app** — reusing the existing outbound
   deep-link pattern (`sanitizeExternalLink`/`openStorefrontActionLink` in
   `frontend/apps/store/src/shared/utils/externalLinks.js`, precedented by
   `storefront_delivery_partners`). Whether Cinema and Doctors become DGFY-Tier-2
   verticals or stay `external_listing` is explicitly **undecided per domain**
   and must not be forced by this ADR; the design must allow a domain to be
   promoted from `external_listing` to `dgfy_native` later **without changing
   the customer-facing model**. Deeper integration (`adapter_booked`: in-app
   booking against an external authority; `proxied`: DGFY owns checkout/
   settlement) is reserved, documented, and explicitly **not built** in this
   rollout. Known schema blockers to resolve when `external_listing` is
   implemented: `StorefrontDiscoveryIndex.{tenant_id, tenant_name,
   tenant_company_token, slug}` are all `NOT NULL` with no `entity_type`/
   `source` discriminator, and reconciliation
   (`backend/src/services/storefrontDiscoveryIndexService.js`) hard-gates on
   `Tenant.findOne({ status: 'active' })`, so a non-tenant row cannot exist
   today; `DgfyCustomerActivity.tenant_id` is similarly `NOT NULL`, which blocks
   a later unified native+external "my bookings" surface.

9. **Extensibility foundations are fixed before any new vertical is added.**
   Mode and item-taxonomy constants move to a single source of truth (see
   Migration and Rollback) instead of the enforced backend/frontend
   duplication; `normalizeWorkflowMode`'s unknown-mode fallback changes from
   `food_manufacturing` to a neutral generic baseline; and a generic RBAC
   preset family becomes the declared fallback in
   `backend/src/config/modeRolePresets.js` instead of silently inheriting
   `food_manufacturing` roles. These are prerequisites for Tier 3 (no vertical)
   to be safe, not optional cleanup.

10. **Ownership, additivity, and statutory boundaries are preserved.** Module
    ownership follows ADR 0029 (catalog/inventory/POS/storefront). All schema
    changes are additive; any new column also updates the tenant-schema
    registry (`backend/scripts/sync-tenant-schemas.js`) and passes
    `npm run check:tenant-schema-coverage`. Commercial-promo and statutory
    Senior/PWD discount behavior (ADR 0033) and fiscalization are unchanged by
    this ADR.

11. **Existing heavyweight inventory is frozen as one selectable tier, not
    removed; the local recipe engine is frozen, not extended.** DGFY's
    FIFO-batch/expiry/weighted-average-cost machinery
    (`FIFOBatch`/`BatchTransaction`/`BatchLineage`,
    `backend/src/modules/inventory/services/costValuationService.js`) becomes
    the `full_fifo` tracking mode: existing tenants keep working exactly as
    today, with **no data migration**, and it stops being the implicit
    baseline every new product inherits. `count_ledger` (already production
    behavior via `items.fifo_enabled: false`) becomes the default for
    `physical_product`. `untracked` generalizes the existing
    `pos_always_available` prototype across POS and Storefront. Separately,
    the shipped recipe-consumption engine
    (`backend/src/modules/shared/utils/fnbRecipeConsumption.js`) is **frozen**
    — it keeps working at checkout exactly as today, but receives no further
    investment, and the browse-time "Sold Out at zero count" contradiction it
    creates (Context, finding 8) is resolved by giving recipe-backed menu items
    the `toggle` mode, not by wiring recipes into catalog reads. Ingredient-
    driven menu availability (`recipe_derived`) is reserved for the
    `external_ims` tracking mode once the separately-built SKUpervisor
    integration exists — DGFY does not build a second recipe-projection
    engine. Full mode catalog and design rules (the permissive
    archetype-suggests-but-never-constrains rule; the single `stockBearingPolicy`
    resolver; report-tolerance requirements) live in
    `docs/features/INVENTORY_TRACKING_MODES.md`.

    This decision requires governance work this ADR does **not** perform —
    amending an accepted ADR is its own action, tracked here as a named
    prerequisite for Phase 8 (External IMS delegation), not written in this
    pass:
    - **ADR 0029 amendment** — its core rule ("Only Inventory records stock
      effects") already permits an external recorder; the amendment states so
      explicitly and defines the Inventory-owned port boundary
      (`backend/src/modules/inventory/commands/stockCommandService.js`).
    - **ADR 0009 amendment** — its 2026-05-06 addendum currently prohibits a
      stock-bearing item from opting out of FIFO/location accounting, which
      the `menu_item` preset (`stock_behavior: STOCK_BEARING`,
      `fifo_enabled: false`) already violates in production. The amendment
      codifies that existing exception rather than weakening the contract.
    - **A new reservations ADR** — ADR 0029's Compatibility Decision 4
      explicitly defers reservation state/expiry/commit/release; an external
      stock authority combined with ADR 0014's offline-capable POS makes this
      unavoidable once `external_ims` is built.
    - **A registered compatibility seam** — `external-inventory-authority` as
      an `api-boundary` entry in `docs/architecture/compatibility-seams.json`
      per ADR 0035 (the `api-boundary` seam type exists today and is unused).

## Alternatives Considered

1. **Split product domains into separate tables** (`menu_items`,
   `service_products`, `retail_products`). Rejected — it is the exact
   fragmentation this initiative removes, breaks the single mixed-basket
   line model, and duplicates pricing/inventory/tax logic per table.
2. **Add a single new exclusive `repair`/`mixed` workflow mode only.** Rejected
   as the sole solution: a new exclusive mode does not compose (a store is still
   one mode) and would multiply combinatorially as domains mix.
3. **This ADR's own earlier draft: a closed three-value capability trio
   (`sell_food`/`sell_services`/`sell_retail`).** Rejected on reconsideration —
   it composes, but it is still a closed enumeration that cannot express a
   farmer, a bracelet maker, or a masahista without adding a fourth value per
   long-tail category. Superseded by the open archetype axis (Decision 2),
   which composes at the *line* level from a small, closed set of mechanical
   shapes instead of enumerating business categories.
4. **Build new domain-neutral modifier tables from scratch.** Rejected for cost
   and duplication — the `fnb_modifier_*` tables already model groups, options,
   `price_delta`, required/min/max selection, and a `sku_item_id` column shaped
   for an inventory-depleting link (not yet wired — see Decision 5's
   correction). De-gating (Decision 5) reuses the shipped structure; wiring
   `sku_item_id` consumption is separate new work.
5. **Store per-kilogram/pack pricing in a new price-list table.** Rejected —
   fractional `DECIMAL(24,12)` quantity plus the existing weight UOM group and
   barcode multiplier already express weighed and pack-to-unit selling without a
   new pricing surface.
6. **Build deep external integration (adapter-booked or proxied) now.**
   Rejected for this rollout per explicit product direction — non-native depth
   is a future concern; only the shallow discovery + redirect tier is in scope,
   with the deeper tiers reserved in the model so no rework is needed later.
7. **Build a local ingredient-stock producibility projection to fix the
   browse-vs-checkout contradiction (Context, finding 8), instead of freezing
   the recipe engine.** Rejected per explicit product direction — DGFY should
   not duplicate recipe/BOM math that the separately-built SKUpervisor will
   own more accurately as `recipe_derived` (Decision 11). The `toggle` mode is
   the near-term fix; a local projection would be throwaway work once
   `external_ims` exists.

## Boundary Consequences

- **Onboarding** owns archetype/offering-type capture ("what do you sell")
  separately from the operating mode, and owns the vertical-tier assignment.
- **Settings** owns the composed store-capability configuration and its
  master-admin gate, mirroring how `ops_workflow_mode` is owned today.
- **Catalog/Inventory** owns archetype-derived item presets, the corrected
  `retail` presets, the domain-neutral modifier attachment, the pack-to-unit
  receiving conversion, and the Axis 4 tracking-mode resolver
  (`backend/src/modules/shared/utils/stockBearingPolicy.js`); the stock
  ledger stays in base units (ADR 0029, ADR 0009).
- **POS** owns capability-driven order-method/panel selection and the
  mixed-basket checkout; per-line `stock_effect_type` and VAT snapshots remain
  server-authoritative.
- **Services** owns booking→sale linkage and generalized service presentation;
  the availability/holds/capacity contracts (ADR 0016) are unchanged.
- **Storefront Discovery** owns the future `entity_type`/`source` discriminator
  and non-tenant listing path for `external_listing` (Decision 8), when that
  phase is implemented.
- No architecture allowlist or exception is introduced.

## Threat Model / Hardening Considerations

- **Elevation of privilege:** capability/mode changes stay master-admin gated;
  no client-supplied capability set is trusted at checkout.
- **Tampering (money/stock correctness):** mixed baskets keep per-line
  `stock_effect_type`, VAT, and price snapshots server-authoritative; retail
  weighed/pack conversions must never write non-base units into the ledger.
- **Replay/duplication:** booking→sale linkage reuses the existing service
  idempotency key and hold-consumption transaction so a completed booking cannot
  double-post or double-charge.
- **Regression on existing tenants:** correcting the `retail` placeholder
  taxonomy must not invalidate existing retail items; rely on the taxonomy's
  legacy-edit-without-taxonomy-change escape hatch and prove non-regression with
  tests. Changing the unknown-mode fallback away from `food_manufacturing`
  (Decision 9) must not change behavior for any currently-valid mode value —
  only the coercion target for genuinely unrecognized values.
- **Spoofing/confusion (external listings):** an `external_listing` row must be
  unambiguously distinguishable from a `dgfy_native` tenant storefront in every
  surface that renders it (discovery, map, search) so a customer is never misled
  into thinking DGFY is the authoritative seller or payment recipient for a
  redirect-only listing.
- **Information disclosure (external listings):** no external-listing sync path
  may store credentials, tenant secrets, or non-public partner data in
  landlord-visible tables — mirrors the existing `storefront_discovery_index`
  projection-only constraint.
- **Tampering (financial reporting correctness, tracking modes):** an
  `untracked` line for a physical good must still carry its cost snapshot into
  profit/COGS reporting — today's blanket `cost_snapshot: null` for every
  stock-exempt line is correct for labor but would silently understate cost
  for an untracked physical product; the Axis 4 resolver must distinguish
  these. Reports must positively exclude or mark every non-`count_ledger`/
  `full_fifo` mode rather than assume `stock_exempt` is the only exemption —
  five existing report services bypass the current exemption predicate and
  must be brought in before `untracked`/`toggle` ship broadly (see
  `docs/features/INVENTORY_TRACKING_MODES.md`).

## Migration and Rollback

- All migrations are additive and defensively guarded
  (`tableExists`/`columnExists`/`addIndexSafe` per repo convention); no
  destructive rename of `fnb_modifier_*` in this rollout (de-gate behind a
  facade). Any new column registers in the tenant-schema registry and passes
  `check:tenant-schema-coverage`.
- Store-capability configuration is stored in tenant `system_settings` (like
  `ops_workflow_mode`), so early phases need no new table.
- Consolidating the duplicated mode/taxonomy constants (Decision 9) is a
  refactor of import paths, not a data migration; the cross-layer contract test
  changes from *enforcing* duplication to *asserting a single source*.
- Rollback disables composed capabilities (tenants fall back to a single
  archetype/vertical) and hides new retail presets or external-listing rows
  without rewriting completed transactions.

## Phased Rollout

- **Phase 0 (this ADR + `docs/features/UNIFIED_PRODUCT_DOMAIN.md` +
  `docs/features/OFFERING_ARCHETYPES.md` +
  `docs/features/INVENTORY_TRACKING_MODES.md`):** ratify the model and
  decisions.
- **Phase 1 — De-risk foundations:** eliminate the enforced backend/frontend
  constant duplication (Decision 9), fix the `normalizeWorkflowMode` fallback,
  add the generic RBAC preset family, build the Axis 4
  `stockBearingPolicy` descriptor resolver, fix known drift bugs in
  hand-copied mode lists and the POS catalog attribute omissions.
- **Phase 2 — Retail taxonomy correction (shipped):** corrected the `retail`
  taxonomy (Decision 6) with four real presets and fixed its placeholder-tier
  breakages. `offering_types`/traits activation did **not** ship and remains
  unscheduled; modifier de-gating moved to Phase 5. Long-tail sellers are
  served by the retail presets rather than by the archetype layer.
- **Phase 3 — Report tolerance + non-schema bug fixes (shipped):** widened
  report tolerance into the five bypassing services and fixed the
  `cost_snapshot` and false-`has_drift` bugs. Persisting the mode, `toggle`,
  and the `untracked` generalization did **not** ship — they need the schema
  change and moved to Phase 5. The local recipe engine is frozen (Decision 11)
  — it keeps working, receives no further investment.
- **Phase 4 — Business type ≠ mode (shipped):** captured a descriptive
  `industry_tag` separate from the operating mode and fixed the
  `RegisterCompany.jsx` "Business Industry" mislabel.
  `businessClassification.js` was left in place pending a product decision.
- **Phase 5 — Finish the foundations:** make capability gating real for nav and
  routes (the declared `requiredCapability` was never read, so production
  modules rendered then 403'd in five modes); de-gate modifiers (Decision 5) by
  moving the 4 modifier routes off the `/fnb` router's blanket `fnbDining` gate
  onto `menuModifiers`, noting `sku_item_id` consumption is still new work; and
  persist the Axis 4 tracking mode (Decision 11) — route `current_stock` reads
  through the resolver, ship `toggle` across POS and Storefront, generalize
  `pos_always_available` into `untracked`, make `count_ledger` the archetype
  default.
- **Phase 6 — Composed store capabilities + capability-driven POS:** Decisions
  2–3, mixed-basket and weight-entry UX, and add-on selection surfaces for
  non-F&B items.
- **Phase 7 — Booking generalization + mixed fulfillment:** Decision 7.
- **Phase 8 — External listings (shallow):** Decision 8's `external_listing`
  tier only. A separate axis — discovery and display, not classification.
- **Phase 9 — External IMS delegation (Decision 11's `external_ims` mode):**
  the stock port contract, converting the ~4 direct
  `stockCommandService`-bypassing importers to injection, the
  `inventory_authority` tenant setting, the registered compatibility seam, and
  closing the capability-gate gaps on `routes/purchaseOrders.js` /
  `routes/suppliers.js` / `routes/items.js`. Requires the ADR 0029/0009
  amendments and the reservations ADR named in Decision 11 to have landed.
  `recipe_derived` availability becomes reachable here, via the external IMS —
  not before.
- **Deferred:** the F&B prep workflow gap (ADR 0019, `FOOD_AND_BEVERAGE_MODE.md`
  — noted, not designed here; `toggle` is the interim workaround); the `rental`
  archetype's occupancy-tracking gap; storefront `isXMode` boolean de-fanning
  (39 files / 375 occurrences as measured 2026-07-26); jewelry serialization;
  `adapter_booked`/`proxied` external tiers.

## Validation

1. Cross-layer constant contract test asserts a single source of truth instead
   of duplication; `normalizeWorkflowMode` fallback tests for known-valid modes
   (unchanged) vs. unrecognized values (new neutral baseline).
2. Archetype/trait-derived preset tests; `modeItemTaxonomy` tests for the new
   `retail` presets and non-regression of existing corrected modes; UOM/weight
   and pack-to-unit conversion tests.
3. Modifier de-gating tests: a service and a retail item can attach a modifier
   group; inventory-depleting add-on issues stock through `stock_effect_type`.
4. Composed-capability config unit tests (composition, master-admin gate,
   single-mode back-compat) and a POS checkout integration test for a mixed
   basket (service labor + retail parts + food) in one transaction with correct
   stock and VAT.
5. Services booking→sale linkage test (idempotent, parts added to the same
   transaction).
6. Generic RBAC preset family tests for Tier 3 (no-vertical) tenants.
7. Axis 4 resolver tests: each of the seven tracking modes returns the correct
   descriptor; report-tolerance tests proving the five currently-bypassing
   report services (`alertService.getLowStockAlerts`, `forecastService`,
   `analyticsService`, `itemGroupingService`, `aiContextService`) exclude or
   correctly mark non-counted products; a cost-snapshot test proving an
   `untracked` physical good still contributes COGS.
8. `npm run check:architecture`, `npm run lint:docs`, and
   `npm run check:tenant-schema-coverage` pass; rendered POS checks for desktop
   and one mobile viewport per the hardening contract.

## Authoritative Sources

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
- `docs/architecture/adr/0034-manual-delivery-job-foundation.md`
- `docs/architecture/adr/0035-compatibility-seam-governance.md`
- `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
- `docs/architecture/adr/0040-weighted-average-cost-valuation-and-variance-analytics.md`
- `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
- `docs/features/UNIFIED_PRODUCT_DOMAIN.md`
- `docs/features/OFFERING_ARCHETYPES.md`
- `docs/features/INVENTORY_TRACKING_MODES.md`
- `docs/features/SERVICES_MODE.md`
- `docs/features/FOOD_AND_BEVERAGE_MODE.md`
- `docs/database/legacy-stock-movement-type-remap.md`
- `docs/database/dgfy-data-migration-map.md`

## Amendments (2026-08-09)

### Axis 2 realized as a three-layer Capability Module / Store Template / Store Profile model

GitHub issue #178 ("Store Templates & Capability Configuration") reconciled an
uploaded proposal against this ADR and found Axis 2's "vertical preset" is the
right shape but was never given an entity, a version, or a curation surface.
Decision 2's Axis 2 is realized as three layers, in order of who owns them:

1. **Capability Module** (fixed, engineering-owned) — the existing
   `ALL_WORKFLOW_CAPABILITIES` vocabulary
   (`packages/shared-constants/src/workflowModes.js`), now catalogued with
   metadata (`label`, `enforcement`: `gate`/`affordance`/`locked`,
   `requires`/`conflicts_with`) in
   `packages/shared-constants/src/capabilityModules.js`. A module is composed
   FROM by templates and profiles; it never gains a new value, column, or
   business logic from either (binding in new ADR 0056, cited below).
2. **Store Template** (curated, versioned bundle) — today's "industry types"
   become presets (`STORE_TEMPLATE_PRESETS` in the same file for now; promoted
   to real landlord tables per the phased rollout below).
3. **Store Profile** (a tenant's materialized, independently-editable copy,
   with provenance back to its source template that is **never dereferenced
   at runtime** — binding in ADR 0056) — `ops_store_profile`
   (`packages/shared-constants/src/storeProfile.js`).

This replaces Decision 2's "thin preset selecting a composition of
capabilities, not a new engineering mode" language with the concrete
three-layer shape; the tiering (Tier 1 Native / Tier 2 Basic / Tier 3 None)
is unaffected — it becomes a property of which templates a mode's presets
belong to, not a separate mechanism.

The **enforcement posture correction** the issue made against the uploaded
proposal is binding here too: configuration is not uniformly "an affordance,
not a restriction." `gate` modules fail closed at the route
(`requireWorkflowCapability`, per ADR 0008 Decision 7's already-accepted
route-level enforcement); only `affordance` modules are presentation-only;
`locked` modules (fiscal profile, customer access ceiling) are
compliance-determined and never template-selectable.

### Phased rollout update

Prerequisite sub-phases were folded into Phase 6 (Phase numbers 7-9 are
already spoken for by booking generalization / external listings / external
IMS delegation); new phases use 10+. Status as of this amendment:

- **Phase 6d — Make the capability vocabulary real (shipped):** of 19
  declared capabilities, 13 were decorative (no route guard). Each is now
  either enforced by a real gate or intentionally split into finer-grained
  gates (e.g. `fnbDining` into `tableService`/`kitchenQueue`/
  `restaurantServiceCharge`); verified by
  `backend/tests/workflowCapabilities.enforcement.contract.test.js`.
- **Phase 6e — Fix the `order_method` divergence (shipped):** unified five
  divergent `ORDER_METHODS` lists into `packages/shared-constants/src/orderMethods.js`,
  pinned to the `pos_transactions.order_method` DB ENUM by
  `backend/tests/orderMethods.crossLayer.contract.test.js`; gave
  retail/msme/food_manufacturing a real counter-sale POS config instead of
  silently inheriting F&B's.
- **Phase 10 — Capability Module catalog (shipped):** frozen metadata
  constant, not a landlord table, per the original plan; verified by
  `backend/tests/capabilityModules.contract.test.js`.
- **Phase 11 — Store Profile shadow-write (shipped):** materializes each
  tenant's current effective config to `ops_store_profile` on every
  mode/overlay change; the equivalence harness
  (`backend/tests/storeProfile.equivalence.contract.test.js`) proves it
  byte-identical to the registries it derives from. Nothing reads the profile
  yet.
- **Phase 12 — Runtime reads the Profile, module by module, behind a
  per-tenant flag (scaffolding shipped in a first pass; consumers wired in
  Phases 18-19):** `resolveStoreProfile.js` and the `ops_store_profile_read`
  flag exist and are tested, including the live divergence differ. Initially
  shipped with no consumer wired: tracing every candidate (POS defaults,
  storefront order methods, item taxonomy, capability gating) found each
  produced a value mathematically identical to the registries, because
  nothing could make a tenant's Profile diverge from its mode until Phase 13
  shipped a curation mechanism and Phase 16 gave that mechanism a
  subtractive channel (below). Both now exist; Phase 18 flips the affordance
  consumers (POS defaults, terminology), Phase 19 flips the fail-closed
  capability gate last, with a permanent rebuild fallback there rather than
  a temporary one. The storefront-order-methods and item-taxonomy
  candidates stay unflipped: `STOREFRONT_ORDER_METHODS` is a mode-independent
  constant (flipping it would be pure churn), and item taxonomy already
  derives from mode + overlay so it inherits subtraction for free once
  Phase 16 lands.
- **Phase 13 — Landlord template catalog (shipped):**
  `store_configuration_templates` / `_modules`, landlord-only
  (`NON_TENANT_MODEL_EXPORTS`). A template's module list is frozen once
  published — editing is rejected at the use-case layer, not just
  discouraged. Provisioning stamps a Profile's `provenance` block from a
  published canonical template exactly once; no other code path
  dereferences a template again.
- **Phase 14 — Handler curation surface (shipped):** `/api/v1/admin/templates`,
  Platform Master Admin only (not a delegable page permission — a published
  template shapes every future tenant, platform-wide). Every write is
  audited in a purpose-built `store_configuration_template_audit_logs`
  table.
- **Phase 15 — Governance for the subtractive channel (this amendment):**
  recorded here and in ADR 0056's own amendment below.
- **Phase 16 — Subtractive capability overlay (shipped):**
  `ops_disabled_capabilities` mirrors `ops_enabled_capabilities`'
  governance shape (master-admin gated, 15s tenant-scoped cache) and lets a
  template's module list actually subtract from a mode's base capabilities,
  not just add to it — without it, non-canonical presets like
  `fnb_counter_service` and `hospitality_guesthouse` were rows in the
  landlord DB no Profile could ever express. `STORE_PROFILE_VERSION` moved
  to 4. Validated against `validateModuleSelection()`'s `requires`/
  `conflicts_with` edges so a subtraction can never leave a store in an
  unbuildable state, and filtered to `ALL_WORKFLOW_CAPABILITIES` so no
  `locked` module (`fiscalProfile`, `customerAccessMode` — catalog-only,
  never in any mode's base list) is reachable by curation either way.
- **Phase 17 — Apply a template to a tenant (shipped):** a shared
  materializer turns a template's module list plus its `base_mode` into
  `{workflowMode, enabledCapabilities, disabledCapabilities}`, used both at
  provisioning (an optional `templateKey` beyond the canonical default) and
  by a new audited platform-admin action,
  `POST /admin/tenants/:id/apply-template`, for already-provisioned tenants.
  Non-destructive per ADR 0008/0019: settings only, no data migration.

The three `[binding]` cross-boundary clauses this realization needs — never
dereferencing provenance at runtime, locked-module compliance determinism,
and templates never adding enum values/columns/logic — are recorded in the
new `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
rather than here, per ADR 0039's amendment-path guidance: this ADR is still
`status: proposed` so a same-document amendment is sufficient for
Decision-level content, but the binding clauses touch the already-**accepted**
ADR 0008 and warrant their own short ADR.
- `docs/proposals/2026-07-06-flexible-item-types-mini-tiangge-jewelry.md`
