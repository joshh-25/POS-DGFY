---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-08-09
applies_to: catalog,inventory,pos,services,storefront,settings
topic: store_templates_and_profiles
---

# Store Templates & Capability Configuration

**Status: design with prerequisite phases shipping.** This is the
classification that grounds the Store Templates work (ADR 0037 Axis 2): what
the platform actually sells today, which behaviors are fixed engineering-owned
code, and which are curatable per store. The integration plan and phase
numbering live in GitHub issue #178; the four-axis product model lives in
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`.

The model in one line: **Capability Modules** (fixed units of selling
behavior, catalogued in `packages/shared-constants/src/capabilityModules.js`)
are composed into **Store Templates** (curated, versioned bundles — today's
"industry types" become presets), which materialize into a per-tenant
**Store Profile** (independently editable, with provenance back to its source
template that is never dereferenced at runtime).

## The three transaction lifecycles

Everything the platform sells flows through exactly one of three availment
lifecycles. These are the top-level modules — every template picks one or
more:

| Lifecycle | Record | Entry points | Notes |
|---|---|---|---|
| **Order** | `pos_transactions` directly | POS checkout (`backend/src/modules/pos/usecases/posUseCases.js`), storefront checkout (`backend/src/modules/store/usecases/storeUseCases.js`) | The shared spine. Mode-agnostic: the checkout use case never reads `ops_workflow_mode`; F&B behavior (kitchen orders, service charge, recipes) is triggered by payload shape. |
| **Booking → settle** | `service_bookings` → `pos_transactions` | `backend/src/modules/services/usecases/serviceUseCases.js` | Full engine: availability, holds, waitlist, reminders, idempotent settlement. Settlement can mix a stock-exempt labor line with `inventory_issue` parts lines on one receipt (service fee + parts sold together). |
| **Folio** | hospitality folios | `backend/src/modules/hospitality/usecases/hospitalityUseCases.js` | Never settles into `pos_transactions`. |

Order methods are one shared vocabulary
(`packages/shared-constants/src/orderMethods.js`), mirroring the
`pos_transactions.order_method` DB ENUM and pinned by
`backend/tests/orderMethods.crossLayer.contract.test.js`. Surfaces use
declared subsets (POS writes everything except the reserved `online`;
storefront product checkout writes neither booking method).

## What is fixed vs curatable

- **Fixed (engineering-owned):** the three lifecycles, the order-method
  vocabulary, the capability module catalog, item-taxonomy validation, stock
  behavior resolution (`stockBearingPolicy.js`), VAT/fiscal logic. A template
  never adds an enum value, column, or business logic.
- **Curated (template layer, being built):** which modules a store starts
  with, presentation (storefront layout/journey, POS workflow panel),
  terminology, item-preset emphasis.
- **Locked (never curated):** the fiscal/BIR profile (compliance-pack
  determined, `backend/src/modules/compliance/policy/`) and the customer
  access ceiling (`customerAccessPolicy.js` — effective value is the minimum
  of requested, platform max, and registration-stage max).

Enforcement classes per module — `gate` (403/422 when absent), `affordance`
(UI shape only), `locked` — are declared in the catalog and verified by
`backend/tests/workflowCapabilities.enforcement.contract.test.js`, which
fails if any declared capability has no real reader.

## The two template dimensions

Templates vary on two independent axes, so the template library is not
one-preset-per-industry:

1. **Selling-behavior mix.** A repair shop is a booking business that also
   retails parts; practically no service business is service-only. The
   additive `ops_enabled_capabilities` overlay already supports this
   (`services_with_parts_retail` preset), and per-line `stock_effect_type`
   already mixes labor and goods on one receipt.
2. **Operational scale within one vertical.** A full-service restaurant runs
   `tableService` + `kitchenQueue` + `restaurantServiceCharge`; a
   counter-service carenderia runs none of them — both are F&B
   (`fnb_full_service` vs `fnb_counter_service` presets). Hospitality tiers
   the same way (`hospitality_guesthouse` drops the housekeeping/maintenance
   boards).

The canonical preset of each base mode equals the mode's own capability
list, so materializing a preset is provably behavior-identical to the mode it
packages (`backend/tests/capabilityModules.contract.test.js`).

## Template/mode switching and historical records

Doctrine (ADR 0008 Decision, ADR 0019): switching is allowed, master-admin
only, and **non-destructive** — hidden-domain data is never deleted or
rewritten, and switching back restores access. Concretely: after a
services→retail switch, booking tables remain in the tenant DB but their
routes 403; money, VAT, quantities, and `order_method` on historical
transactions are snapshotted and render correctly regardless of the current
mode. Item name and SKU are also snapshotted on every transaction line
(`pos_transaction_lines.item_name_snapshot` / `.sku_snapshot`, written at sale
time by POS checkout, storefront checkout, and booking settlement alike), so
receipts and reports never retro-change when an item is later renamed,
recategorized, or deleted. Every change to `ops_workflow_mode` or
`ops_enabled_capabilities` is recorded in `workflow_mode_change_log`
(who, when, from→to), written by `applyWorkflowModeAuditLog`.

The flexibility ladder, cheapest first:

1. **Add capabilities without switching** — the `ops_enabled_capabilities`
   overlay is additive and also re-legalizes item taxonomy via
   `CAPABILITY_TAXONOMY_OVERLAY_MODES`.
2. **Full template/mode switch** — allowed, records frozen in place and
   audited as above.
3. **Never** — migrating or rewriting historical rows on a switch. All
   schema work stays additive.

## Runtime read-path resolver (scaffolding, not wired to any consumer)

`backend/src/modules/settings/usecases/resolveStoreProfile.js` resolves a
tenant's effective Store Profile, gated by the master-admin-only
`ops_store_profile_read` setting (default off, same governance shape as
`ops_enabled_capabilities`). It always rebuilds the profile from the live
registries as well as reading the persisted one, and logs a structured
divergence warning whenever they disagree — the differ issue #178 Phase 11
called for, now real rather than only tested by the equivalence harness. A
divergent or version-stale persisted profile is never served, even with the
flag on; a fresh rebuild is always correct by construction.

**Nothing reads through this resolver yet**, deliberately. Every runtime
consumer identified for a Phase 12 flip — storefront order methods, item
taxonomy validation, POS terminal defaults, capability gating — currently
produces a value that is mathematically identical to what the Profile would
return, because no Store Template (Phase 13) exists yet to make a tenant's
Profile diverge from its base mode. Wiring a real consumer onto the resolver
before that point would add latency and a new failure surface (an async
settings fetch on payment/checkout paths, cache staleness, version
mismatches) for zero behavior change. The resolver stays as tested,
ready-to-wire infrastructure until Phase 13 gives templates a way to
actually curate a Profile away from its mode.

## The landlord Store Template catalog

`store_configuration_templates` / `store_configuration_template_modules`
(issue #178 Phase 13, `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`)
are landlord-DB-only tables — registered in `NON_TENANT_MODEL_EXPORTS`
(`backend/src/utils/tenantModelFactory.js`), never cloned into a tenant
database. A template is a versioned, curated bundle of Capability Module
keys with a lifecycle: `draft` (module list editable) →
`published` (frozen — editing a published template's modules is rejected at
the use-case layer, not just discouraged; to change content, deprecate and
create a new template) → `deprecated`. Publishing validates the module
selection against the same `validateModuleSelection()` the catalog itself
uses.

`seedCanonicalTemplatePresetsUseCase`
(`backend/src/modules/templates/usecases/seedCanonicalTemplatePresets.js`)
materializes `STORE_TEMPLATE_PRESETS` into rows once; re-running it never
overwrites an existing `template_key`.

**Provenance, captured once, never dereferenced again.** At tenant
provisioning, if a published canonical template exists for the chosen mode,
`buildProvisioningStoreProfile` (`backend/src/services/tenantProvisioningService.js`)
looks it up exactly once and stamps the resulting Profile's `provenance`
block (`source_template_id`, `source_template_version`,
`diverged_from_source`). Template lookup is best-effort — a failure falls
back to the pre-Phase-13 behavior rather than blocking provisioning. No
other code path ever reads a template row again: a later settings-driven
mode/capability change carries the origin pointer forward and flags
`diverged_from_source: true`, but never re-derives anything from the
template itself (ADR 0056 clause 2). This is what makes "editing a
published template changes zero existing tenants' Profiles" true by
construction, not by convention — proven in
`backend/tests/tenantProvisioningStoreProfileProvenance.test.js`.

## Planned modules (roadmap slots in the catalog, not implemented)

- `laborTracking` — who performed a job, actual start/finish, rate-based
  labor fees. Booking status transitions persist no timestamps today.
- `posBookings` — create a booking from the POS terminal
  (`ServiceBooking.source='pos'` is currently unreachable).
- `bookingRescheduling` — provider/resource/start time are write-once today.
- `pickupReturnLogistics` — the laundry round trip (scheduled pickup,
  custody, return delivery); `DeliveryJob` is one-way today.

Planned modules are declared with `status: 'planned'`, are excluded from the
grantable capability vocabulary, and fail template validation if selected.

## Verification

- `backend/tests/capabilityModules.contract.test.js` — catalog ↔ capability
  vocabulary lockstep; per-mode bundle equivalence; preset validity.
- `backend/tests/workflowCapabilities.enforcement.contract.test.js` — no
  decorative capabilities.
- `backend/tests/orderMethods.crossLayer.contract.test.js` — order-method
  vocabulary ↔ DB ENUM.
- `backend/tests/resolveStoreProfile.usecase.test.js` — the read-path
  resolver's flag/version/divergence logic, including that template
  provenance never trips a false divergence.
- `backend/tests/storeConfigurationTemplateUseCases.test.js` — template
  lifecycle (draft → published → deprecated), publish-time validation, and
  published-template module immutability.
- `backend/tests/seedCanonicalTemplatePresetsUseCase` (`seedCanonicalTemplatePresets.usecase.test.js`) —
  idempotent seeding from `STORE_TEMPLATE_PRESETS`.
- `backend/tests/tenantProvisioningStoreProfileProvenance.test.js` — the
  Phase 13 acceptance criterion: editing a template after provisioning
  changes zero already-provisioned tenants' Profiles.
