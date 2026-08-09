---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-08-09
applies_to: catalog,inventory,pos,services,storefront,settings
topic: store_templates_and_profiles
---

# Store Templates & Capability Configuration

**Status: the full three-layer model is built and curatable (Phases 6d, 6e,
10-14 shipped); a template's module list can now genuinely diverge a
tenant's Profile from its base mode (Phase 16's subtractive overlay); the
runtime read-path (Phase 12) is still deliberately scaffolded and not wired
to any consumer yet — see below.** This is the classification
that grounds the Store Templates work (ADR 0037 Axis 2): what the platform
actually sells today, which behaviors are fixed engineering-owned code, and
which are curatable per store. The integration plan and phase numbering live
in GitHub issue #178; the four-axis product model lives in
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`;
the cross-boundary binding clauses live in
`docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`.

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

**Nothing reads through this resolver yet**, deliberately — but as of Phase
16 it is no longer true that nothing *could*. Two things had to exist before
any Phase 12 flip could mean anything: a template entity (Phase 13) and a
way for a template's module list to actually subtract from a mode's base
capabilities (Phase 16's `ops_disabled_capabilities` overlay, below —
without it, a template like `fnb_counter_service` was a landlord-DB row
nothing could ever apply). Both now exist, so the differ above is live
infrastructure, not a permanently-inert one: a tenant curated with a
non-canonical template genuinely can diverge from its base mode, and the
resolver will catch it. Wiring a real consumer is still separate future
work (storefront order methods, item taxonomy validation, POS terminal
defaults, capability gating) — deferred a little longer to keep this change
isolated to the mechanism, not the flip, and because capability gating in
particular needs its own care (see below).

### The subtractive overlay (`ops_disabled_capabilities`)

`packages/shared-constants/src/workflowModes.js`'s `resolveEffectiveCapabilities`
now computes `(base mode ∪ ops_enabled_capabilities) \ ops_disabled_capabilities`.
`ops_disabled_capabilities` mirrors `ops_enabled_capabilities` exactly —
same master-admin write gate, same 15s tenant-scoped cache, same
`ALL_WORKFLOW_CAPABILITIES` allowlist (which is why neither overlay can ever
reach a `locked` module: `fiscalProfile` and `customerAccessMode` belong to
no mode's base list and so never enter `ALL_WORKFLOW_CAPABILITIES` either).
A write that would leave an enabled module without a `requires` dependency
it needs — disabling `catalog` while `pos` stays enabled, for example — is
rejected at the settings-write layer with `CAPABILITY_SELECTION_UNBUILDABLE`
via the same `validateModuleSelection()` the template catalog itself uses.
`STORE_PROFILE_VERSION` is now 4, carrying `source.disabled_capabilities`.

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
provisioning, `buildProvisioningStoreProfile`
(`backend/src/services/tenantProvisioningService.js`) resolves a template —
an explicit `templateKey` if provided and it is both published and matches
the requested mode (issue #178 Phase 17), otherwise falling back to the
published canonical template for that mode (Phase 13's original behavior) —
looks it up exactly once, and stamps the resulting Profile's `provenance`
block (`source_template_id`, `source_template_version`,
`diverged_from_source`). Template lookup is best-effort — a failure falls
back to a plain mode-derived profile rather than blocking provisioning. No
other code path ever reads a template row again: a later settings-driven
mode/capability change carries the origin pointer forward and flags
`diverged_from_source: true`, but never re-derives anything from the
template itself (ADR 0056 clause 2). This is what makes "editing a
published template changes zero existing tenants' Profiles" true by
construction, not by convention — proven in
`backend/tests/tenantProvisioningStoreProfileProvenance.test.js`.

**A template's module list becomes real settings, not just a Profile.**
`materializeTemplateModuleSelection`
(`backend/src/modules/templates/usecases/materializeTemplateModuleSelection.js`)
diffs a template's flat `modules` list against its `base_mode`'s own
capability list to produce `{enabledCapabilities, disabledCapabilities}` —
the same two overlay settings `ops_enabled_capabilities` /
`ops_disabled_capabilities` (Phase 6 / Phase 16) already govern. Both
provisioning and the apply-template action below share this one function,
so they can never compute a template's effective settings differently.

## Applying a template to an existing tenant

`POST /admin/tenants/:id/apply-template` (issue #178 Phase 17) — an
audited, platform-admin write, delegable under the `admin.tenants`
permission (same classification as `PATCH /:id/capabilities`, unlike
template curation itself which is platform-wide and master-only). Requires
`templateKey` and a `reason` (≥3 characters, mirroring every other audited
platform-admin write in this codebase). Rejects a tenant that isn't
`active`, a `templateKey` that doesn't resolve to any template, or one that
resolves to a template that isn't `published`.

In one transaction: seeds `ops_workflow_mode` /
`ops_enabled_capabilities` / `ops_disabled_capabilities` from the
materialized selection, writes a fresh `ops_store_profile` stamped with this
template's provenance, and — best-effort, after the transaction commits —
appends a `workflow_mode_change_log` row via the same `applyWorkflowModeAuditLog`
helper a settings write already uses. **Non-destructive per ADR 0008/0019**:
a settings write only, no data migration; applying a different template
later fully restores whatever the previous one granted. Every write is also
recorded in `TenantAdminAuditLog` (before/after settings snapshot), the same
trail `PATCH /:id/capabilities` uses.

## Platform-admin curation surface

`/api/v1/admin/templates` (issue #178 Phase 14) — Platform Master Admin
only (`resolvePlatformAdminRoutePolicy` in `backend/src/middleware/auth.js`
routes it to `masterOnly`, not a delegable page permission: a published
template shapes what every future tenant provisions with, platform-wide).
Frontend: `frontend/Pages/admin/StoreTemplateManager.jsx`, wired into
`AdminLayout.jsx`'s sidebar as "Store Templates".

- `POST /admin/templates` — create a draft.
- `PATCH /admin/templates/:id/modules` — edit a draft's modules (draft only;
  requires a reason).
- `POST /admin/templates/:id/publish` — validate and freeze (requires a
  reason).
- `POST /admin/templates/:id/deprecate` — retire (requires a reason).
- `GET /admin/templates`, `GET /admin/templates/:id`,
  `GET /admin/templates/:id/audit-logs` — read paths.

Every write is recorded in `store_configuration_template_audit_logs`
(actor, reason, before/after snapshot) — a purpose-built table, not a reuse
of `TenantAdminAuditLog` (that model's `tenant_id` FK doesn't fit an action
that targets a template, not a tenant).

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
  provenance and a curated disabled-capabilities overlay never trip a false
  divergence, and that a genuine drift in the disabled overlay is still
  caught.
- `backend/tests/workflowModes.crossLayer.contract.test.js` — the
  `ops_disabled_capabilities` overlay resolves identically across the
  backend and frontend copies of `resolveEffectiveCapabilities`, cannot
  reach a `locked` module, and reproduces `fnb_counter_service` exactly.
- `backend/tests/storeProfile.equivalence.contract.test.js` — the
  disabled-capabilities overlay reproduces both non-canonical presets
  (`fnb_counter_service`, `hospitality_guesthouse`) byte-for-byte via
  subtraction, and a subtraction breaking a `requires` edge is rejected.
- `backend/tests/settingsUsecases.applicationResult.test.js` — the
  `ops_disabled_capabilities` write gate (master-admin only, normalized,
  deduped) and the `CAPABILITY_SELECTION_UNBUILDABLE` rejection for both the
  bulk and single-key settings write paths.
- `backend/tests/storeConfigurationTemplateUseCases.test.js` — template
  lifecycle (draft → published → deprecated), publish-time validation, and
  published-template module immutability.
- `backend/tests/seedCanonicalTemplatePresetsUseCase` (`seedCanonicalTemplatePresets.usecase.test.js`) —
  idempotent seeding from `STORE_TEMPLATE_PRESETS`.
- `backend/tests/tenantProvisioningStoreProfileProvenance.test.js` — the
  Phase 13 acceptance criterion: editing a template after provisioning
  changes zero already-provisioned tenants' Profiles; Phase 17's explicit
  `templateKey` selection (mode-matching, mode-mismatched, draft, and
  not-found cases, each falling back to the pre-Phase-17 canonical lookup).
- `backend/tests/materializeTemplateModuleSelection.test.js` — the pure
  template→overlay diff: empty overlays for a canonical template, a real
  disabled overlay for a subtractive one, a real enabled overlay for an
  additive one, both non-canonical presets reproduced exactly.
- `backend/tests/applyTemplateToTenantUseCase.test.js` — the existing-tenant
  apply-template action: settings seeded correctly for both a canonical and
  a subtractive template, the audit trail, and every rejection path (tenant
  not found/inactive, template not found/unpublished, missing reason).
- `backend/tests/adminTenantCapabilities.transport.test.js` — apply-template
  route validation gates (`templateKey`/`reason` required, no unknown
  fields) and request/response wiring.
- `backend/tests/adminTemplates.transport.test.js` — curation route
  validation gates and request/response wiring.
- `backend/tests/platformAdminRouteClassification.test.js` — `/admin/templates`
  resolves to `masterOnly` (curation, platform-wide); `/admin/tenants/:id/apply-template`
  resolves to the delegable `admin.tenants` permission (a single tenant).
