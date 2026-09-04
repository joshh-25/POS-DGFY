---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-08-15
applies_to: catalog,inventory,pos,services,storefront,settings
topic: store_templates_and_profiles
---

# Store Templates & Capability Configuration

**Status: the full three-layer model is built, curatable, applicable, seeded,
and enforced at every affordance (Phases 6d, 6e, 10-23 all shipped).** A
template's module list can genuinely diverge a tenant's Profile from its
base mode and be applied at provisioning or to an existing tenant (Phases
16-17); every affordance consumer — POS defaults, the POS workflow panel,
item taxonomy, and the fail-closed capability gate itself — honors that
divergence (Phases 18, 19, 21). The catalog is seeded on deploy (Phase 20)
and both the capability gate and item-taxonomy validation invalidate their
caches on a template write (Phase 22). See below for the one candidate
that remains deliberately unwired (storefront order methods) and why. This
is the classification that grounds the Store Templates work (ADR 0037
Axis 2): what the platform actually sells today, which behaviors are fixed
engineering-owned code, and which are curatable per store. The integration
plan and phase numbering live in GitHub issue #178; the four-axis product
model lives in
`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`;
the cross-boundary binding clauses live in
`docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`.
For a developer-facing "how do I extend this" guide — deploy impact, admin
how-to, and the extension recipes for a new template/module/lifecycle —
see `docs/development/STORE_TEMPLATES_HANDOFF.md`.

The model in one line: **Capability Modules** (fixed units of selling
behavior, catalogued in `packages/shared-constants/src/capabilityModules.js`)
are composed into **Store Templates** (curated, versioned bundles — today's
"industry types" become presets), which materialize into a per-tenant
**Store Profile** (independently editable, with provenance back to its source
template that is never dereferenced at runtime). One layer sits above all
three, merchant-facing rather than engineering-facing: the **Registration
Industry** catalog (issue #178 Phases 31-33) is what a business owner
actually picks at signup — DGFY's own business-niche classification, not a
raw mode or template key — with `workflow_mode` and `store_template_key`
derived from it server-side. See "Registration Industry layer" below.

## The three transaction lifecycles

Everything the platform sells flows through exactly one of three availment
lifecycles. These are the top-level modules — every template picks one or
more:

| Lifecycle | Record | Entry points | Notes |
|---|---|---|---|
| **Order** | `pos_transactions` directly | POS checkout (`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`), storefront checkout (`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`) | The shared spine. Mode-agnostic: the checkout use case never reads `ops_workflow_mode`; F&B behavior (kitchen orders, service charge, recipes) is triggered by payload shape. |
| **Booking → settle** | `service_bookings` → `pos_transactions` | `apps/dgfy-api/src/modules/services/usecases/serviceUseCases.js` | Full engine: availability, holds, waitlist, reminders, idempotent settlement. Settlement can mix a stock-exempt labor line with `inventory_issue` parts lines on one receipt (service fee + parts sold together). |
| **Folio** | hospitality folios | `apps/dgfy-api/src/modules/hospitality/usecases/hospitalityUseCases.js` | Never settles into `pos_transactions`. |

Order methods are one shared vocabulary
(`packages/shared-constants/src/orderMethods.js`), mirroring the
`pos_transactions.order_method` DB ENUM and pinned by
`apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js`. Surfaces use
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
  determined, `apps/dgfy-api/src/modules/compliance/policy/`) and the customer
  access ceiling (`customerAccessPolicy.js` — effective value is the minimum
  of requested, platform max, and registration-stage max).

Enforcement classes per module — `gate` (403/422 when absent), `affordance`
(UI shape only), `locked` — are declared in the catalog and verified by
`apps/dgfy-api/tests/workflowCapabilities.enforcement.contract.test.js`, which
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
packages (`apps/dgfy-api/tests/capabilityModules.contract.test.js`).

**Every workflow mode carries a native/transitional/external engine
classification** (`WORKFLOW_MODE_ENGINE` in `workflowModes.js`, issue #178
final-touch pass): `native` modes (`retail`, `services`, `fnb`, `msme`) run
their full selling engine inside DGFY; `transitional` modes
(`hospitality`, `food_manufacturing`) run natively today but are planned to
move to a sibling app; `external` modes are the four below. Only `native`
and `transitional` modes are authorable in Store Template curation
(`TEMPLATE_AUTHORABLE_MODES`) — `external` modes are hidden from the
create-draft base-mode dropdown and rejected server-side with a 422.

**Four registration-offered modes are deliberately preset-less and
engine-external** (issue #178 final-touch hardening): `healthcare`,
`ticketing_transport`, `logistics_distribution`, `education_institutions`.
Pinned by `STORE_TEMPLATE_PRESETLESS_MODES` in `capabilityModules.js` and
the accompanying contract test — not an oversight, but a hold on verticals
that may end up powered by separate sibling apps under the same parent
company, with DGFY providing registration and UI/UX visibility only. A
tenant registering in one of these modes provisions with null template
provenance, which the platform already tolerates by design; they remain
fully registerable and listable, only template *authoring* is restricted.
See `docs/development/STORE_TEMPLATES_HANDOFF.md` §4 for the full engine
classification, the flip recipe, and the open product question these four
modes are tracked against.

## Registration Industry layer (issue #178 Phases 31-33)

Operating Mode and Store Template used to look like two unrelated
concepts to anyone outside the codebase, because registration only ever
exposed the mode: a hardcoded enum with a fixed capability list. But a
canonical template's module list is *contractually equal* to its base
mode's capability list (pinned by `capabilityModules.contract.test.js`) —
picking a template already implies a mode, so a merchant should never be
asked to pick both. `packages/shared-constants/src/registrationIndustries.js`
is the layer that makes that true at signup: `REGISTRATION_INDUSTRIES`
transcribes DGFY's own "Sample Business Niches by Industry" classification
guide (`docs/features/INDUSTRY_CLASSIFICATION.md`) into 11 entries, each
`{ label, summary, niches, workflow_mode, template_key }`. A merchant picks
an industry; the server derives everything else.

`micro_fnb` ("Micro Food & Beverage" — carinderia, turo-turo, food cart) is
the entry that proves the point: it is the classification guide's own
industry #05, and before this phase it existed in the platform only as a
template (`fnb_counter_service`) with no mode of its own — unreachable from
registration, so every carinderia signup fell back to the full-service
`fnb_full_service` bundle and had to be repaired afterward by a platform
admin. It is now reachable with no new mode added.

`GET /api/v1/registration/industries` serves the catalog (joined against
live template publish-status and, since Phase 39, admin visibility state —
see below) to all three signup surfaces —`/business/grow`,
`/register-company`, and the admin assisted-provisioning panel.
`registerCompanyRequestUseCase.js` resolves an optional `industryKey`
server-side into `workflow_mode` and `store_template_key`; the client can
never request an arbitrary `templateKey` directly. `approveTenantUseCase.js`
forwards that `templateKey` into the same `provisionTenant({...})` call the
admin-initiated endpoints already used, closing the gap the previous
section used to describe as open.

**The merchant and admin surfaces render differently as of issue #178
Phase 38.** `/business/grow` and `/register-company` use `IndustrySelect`
(`packages/web-core/src/features/registration/IndustrySelect.jsx`) — a dropdown of
industry names, with an (i) button opening a catalog-detail modal and a
per-selection "What you'll get" modal, and **no engine classification
display at all**. The admin assisted-provisioning panel keeps the original
card-based `IndustryPicker` (same directory), which still shows engine
badges/notes — that distinction is deliberately admin-only now.

**Two published presets are deliberately excluded from the registration
catalog** — `services_with_parts_retail` and `hospitality_guesthouse`
(`REGISTRATION_EXCLUDED_TEMPLATE_KEYS`). Both are real refinements *within*
an industry a merchant has already registered into, applied afterward by a
platform admin via `POST /admin/tenants/:id/apply-template` rather than
offered as a thirteenth choice at signup. A contract test enforces that
every published preset appears either as a `template_key` in
`REGISTRATION_INDUSTRIES` or in this exclusion list — a new preset must
consciously choose to be registerable or not.

**External-engine industries stay self-registerable, honestly — on the
admin surface.** The four registration-offered, preset-less modes from the
previous section (`healthcare`, `ticketing_transport`,
`logistics_distribution`, `education_institutions`) each get an entry with
`template_key: null`; the admin-only `IndustryPicker` renders a "Listing
only" note sourced from `WORKFLOW_MODE_ENGINE`/`WORKFLOW_MODE_ENGINE_NOTES`
rather than hiding them. As of Phase 38, the merchant-facing
`IndustrySelect` shows none of this — a merchant just sees the industry
name and its plain-language summary. Registering into one provisions with
null template provenance, exactly as it always has.

**Admin visibility toggle (issue #178 Phase 39-40).** An admin can hide
any industry from merchant signup — not remove it — via a new landlord
table (`registration_industry_visibility`, row absence = visible) curated
through a "Registration industries" panel on the Store Template Manager
page. The catalog response gains a `hidden: boolean` field per entry and
never shortens its 11-entry array; `IndustrySelect` filters hidden entries
out, `IndustryPicker` annotates them but keeps them selectable (assisted
provisioning never sends `industryKey`, so it's unaffected either way).
`registerCompanyRequestUseCase.js` also rejects a hidden `industryKey`
server-side, as defense in depth. Every lookup fails open on a landlord-DB
error. See `docs/development/STORE_TEMPLATES_HANDOFF.md` §5 for the full
mechanics and the now-superseded `visibility` ENUM this feature does
*not* reuse.

**Deliberately not modeled**: the classification guide's industry #12,
"Technology and Digital Products" (software/SaaS/subscriptions) — it needs
its own lifecycle (licensing, renewals, entitlement), not a POS/stock
template, and is tracked as a separate issue rather than forced into this
catalog. See `docs/features/INDUSTRY_CLASSIFICATION.md` for the full guide
and the out-of-scope note.

## The four dimensions of "how we do business"

Templating governs one of four independent dimensions a store's operations
can vary along — a merchant-facing way of asking the same question this
whole doc answers technically:

| Dimension | Governs | Template-driven today? |
|---|---|---|
| **POS** | How items/services are added, priced, and billed at the counter | Yes — `profile.pos_workflow` (issue #178 Phase 21) |
| **Delivery** | How items reach the customer | No |
| **Online Store** | How a customer avails an item (purchase, booking, deposit, time selection) | No — see "Services fulfillment profiles" below for the one place this axis has a named seed |
| **Online Checkout** | How the customer pays (cash, GCash, credit, downpayment) | No |

**Services fulfillment profiles** (issue #178, ADR 0057,
`docs/features/SERVICES_FULFILLMENT_PROFILES.md`) is the Online Store
dimension's first named seed, scoped to Services: a client-side-only
vocabulary (`packages/shared-constants/src/fulfillmentProfiles.js`) that
maps `ServiceItemDetail.service_area_type` onto which checkout fields a
booking flow shows and what its final action is called. Per ADR 0057
clause 3 it is explicitly **not** wired into `buildStoreProfile()`,
`STORE_TEMPLATE_PRESETS`, or any database column — a services-domain
concept the template/profile layer may eventually compose with, not a
template-layer feature itself. Delivery and Online Checkout remain fully
open dimensions.

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

## Runtime read-path resolver — now wired to the capability gate (issue #178 Phase 19)

`apps/dgfy-api/src/modules/settings/usecases/resolveStoreProfile.js` resolves a
tenant's effective Store Profile, gated by the master-admin-only
`ops_store_profile_read` setting (default off, same governance shape as
`ops_enabled_capabilities`). It always rebuilds the profile from the live
registries as well as reading the persisted one, and logs a structured
divergence warning whenever they disagree — the differ issue #178 Phase 11
called for, now real rather than only tested by the equivalence harness. A
divergent or version-stale persisted profile is never served, even with the
flag on; a fresh rebuild is always correct by construction.

**`requireWorkflowCapability` (`apps/dgfy-api/src/middleware/workflowModeCapability.js`)
is this resolver's first real consumer**, and — deliberately — its only one.
Two things had to exist before wiring the fail-closed gate could mean
anything beyond latency: a template entity (Phase 13) and a way for a
template's module list to actually subtract from a mode's base capabilities
(Phase 16's `ops_disabled_capabilities` overlay, below). Both now exist. The
gate's behavior per tenant:

- **`ops_store_profile_read` off (the default, and every tenant not
  explicitly opted in):** gates on the registries directly —
  `modeHasCapability(mode, capability, enabledCapabilities,
  disabledCapabilities)` — now honoring the disabled overlay as well as the
  enabled one. This is the **permanent** fallback, not a temporary one, and
  costs the one cached settings query gating already paid before this
  phase (`workflowCapabilitySettingsCache.js`, extended to read the flag in
  the same query).
- **`ops_store_profile_read` on (master-admin, per tenant):** gates on
  `resolveStoreProfile()`'s resolution instead. Because the resolver never
  serves a divergent or version-stale persisted profile, this is provably
  equivalent to the registry path for every tenant today — the flag
  controls rollout order, not the answer.
- **Any resolver or settings-read failure denies.** Both paths' errors fall
  through to `next(error)`, mapped to a 5xx by the global error handler —
  there is no "allow on error" branch anywhere in the gate.

Storefront order methods remain unwired, as scoped in ADR 0037's amendment:
`STOREFRONT_ORDER_METHODS` is a mode-independent constant, so wiring it
would be pure churn. Item taxonomy is wired too now (issue #178 Phase
21) — see below; it was initially believed to "inherit subtraction for
free," which turned out to be false when checked (it only ever saw the raw
enabled overlay, never the disabled one) and is corrected there. **The
registries are not retired** — `WORKFLOW_MODE_CAPABILITIES` stays the
differ's oracle and the gate's permanent flag-off path.

A Phase 20-23 audit found three further gaps — full definitions in ADR
0037's amendment ("What Phase 20-23's audit found and left deliberately
out"). Two remain open; the third has since shipped (issue #178 Phases
31-33, "templates become the registration Industry"):

- **The public storefront doesn't see subtraction.**
  `storeUseCases.js`'s catalog listing reads only the enabled overlay from
  `resolveWorkflowCapabilitySettings()`, never the disabled one, and
  `apps/dgfy-storefront`'s own capability model
  (`shared/model/workflowCapabilities.js`, `modePresentationRegistry.js`)
  has no subtractive concept at all — a counter-service tenant's backend
  and admin POS both correctly deny table/kitchen capabilities, but its
  public storefront can still present them.
- **`storefrontLayout` is declared but never materialized** — the catalog
  names `storefrontTemplateRegistry.js`/`modePresentationRegistry.js` as
  its `enforced_by`, but `buildStoreProfile()` never reads either; unlike
  `posWorkflowPanel` (fixed in Phase 21), the storefront's own presentation
  affordance has no Profile equivalent yet.
- ~~**`templateKey` at provisioning only reaches the three
  admin-initiated endpoints**~~ **Shipped (Phases 31-33).** The organic
  signup→approval funnel now reaches it too. Registration no longer asks
  for a raw `workflowMode`; it asks which of DGFY's 11 registration
  Industries the business is (`packages/shared-constants/src/registrationIndustries.js`,
  transcribed from DGFY's own business-niche classification guide — see
  `docs/features/INDUSTRY_CLASSIFICATION.md`). The server derives both
  `workflow_mode` and `store_template_key` from the chosen industry — the
  client can request an industry, never a raw template — and
  `approveTenantUseCase.js` now forwards that `templateKey` into the same
  `provisionTenant({...})` call the three admin-initiated endpoints already
  used. `resolveProvisioningTemplateSelection`'s existing validation and
  canonical-fallback behavior (Phase 6/17) is unchanged; every existing
  tenant and every registration that supplies only a legacy `workflowMode`
  keeps behaving exactly as before. See the "Registration Industry layer"
  section below.

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
via the same `validateModuleSelection()` the template catalog itself uses,
and (issue #178 Phase 22) so is a write that would leave a capability
requested in both overlays at once (`CAPABILITY_SELECTION_CONTRADICTORY`) —
subtraction wins over addition either way, but a contradictory request is
rejected rather than silently resolved. `STORE_PROFILE_VERSION` moved to 4
to carry `source.disabled_capabilities`, then to 5 (Phase 21) when
`pos_workflow` and `item_taxonomy` started deriving from the effective
module set instead of the base mode alone.

## Frontend affordance consumers now read the Profile (issue #178 Phase 18)

`packages/web-core/src/features/settings/WorkflowModeContext.jsx` distributes the
tenant's Store Profile (`profile`) and `disabledCapabilities` alongside the
existing `workflowMode`/`enabledCapabilities`. The Profile it distributes is
the tenant's own shadow-written `ops_store_profile` setting when present
(already shipped in every `GET /settings` response, at zero extra request
cost), or an identical local rebuild via the same `buildStoreProfile` pure
function otherwise. **This is a different, lower-stakes read path than**
`resolveStoreProfile.js` above — it reads the shadow-write directly rather
than going through that resolver's flag/differ machinery, because a stale
POS default is cosmetic where a stale capability grant is a security
concern; the resolver stays reserved for Phase 19's gate flip.

`packages/web-core/src/features/pos/pages/TerminalPage.jsx` reads `profile.pos_defaults`
instead of recomputing it from `businessModeTemplates.js`'s frontend-only
copy. Tracing every other original Phase 12 affordance candidate found two
corrections to make while implementing, not just a flip:

- **`terminology` had zero live readers anywhere in the codebase** —
  `resolveBusinessModeWizardLabels` and its `wizardLabels` registry field
  were dead code (materialized into the Profile for completeness at Phase 11,
  never actually read by anything). Removed rather than flipped.
- **`itemDefaults`/`productDefaults` are a different shape with no Profile
  equivalent** — per-field item/product creation defaults (category, unit of
  measure, VAT type...), not POS terminal preferences. `ItemFormModal.jsx`
  and `ProductCreateWizard.jsx` still read these from
  `businessModeTemplates.js`, which is trimmed to just these two fields, not
  retired.

## Subtraction reaches every affordance (issue #178 Phase 21)

Phase 19 made the backend gate honor a template's subtractive overlay, but
a pre-PR audit found three affordance paths still resolving from the base
mode alone — reintroducing the render-then-403 failure ADR 0037 Phase 5
spent a sub-phase eliminating: a `fnb_counter_service` tenant would still
see the tables/kitchen POS panel and full-service floor plan even though
its own API 403'd those routes.

- **`resolvePosWorkflow(workflowMode, effectiveCapabilities)`**
  (`packages/shared-constants/src/posWorkflows.js`) now takes an optional
  second argument: an fnb-family store missing both `tableService` and
  `kitchenQueue` resolves to the existing `POS_WORKFLOW_CONFIGS.counter`
  instead of the full-service `fnb` config. Scoped to the fnb family
  deliberately — hospitality never carries those two keys in its own base
  capability list, so a family-blind version of this rule would misroute
  every hospitality tenant regardless of curation.
  `POSCheckoutTerminal.jsx` now threads `profile.modules` down as this
  argument (prop-drilled through `TerminalPageLayout.jsx`, the same way
  `workflowMode` already is).
- **`WorkflowModeContext.jsx`'s `hasCapability`** moved onto the 4-arg
  `modeHasCapability(mode, capability, enabled, disabled)` call — the one
  hook Phase 19 missed when it flipped `Layout.jsx` and
  `WorkflowModeRouteGate.jsx`. `PosPageShell.jsx`'s vertical-panel rendering
  is the consumer this fixes.
- **Item taxonomy honors subtraction too**, both in the Profile
  (`buildStoreProfile` now derives `item_taxonomy` from the effective
  module set, not the raw enabled overlay) and at the backend validation
  layer (`validateItemAgainstModeTaxonomy` gained a `disabledCapabilities`
  parameter; `itemRepository.js`'s `resolveCachedDisabledCapabilities`
  mirrors its enabled-overlay counterpart). Before this, a capability
  additively enabled and later subtracted kept granting its item-taxonomy
  presets forever.

`STORE_PROFILE_VERSION` moved to 5; the re-recorded equivalence snapshot
changes only `profile_version` across all 11 modes, proving the default
(no-subtraction) path is unaffected.
`apps/dgfy-api/tests/fnbKitchenQueueTemplateGate.route.test.js` mounts the real
`requireWorkflowCapability` exactly as `apps/dgfy-api/src/routes/fnb.js` wires
it and proves two differently-templated tenants get different real
200/403 outcomes — the acceptance criterion Phase 19's own plan called for
but that had only ever been covered by a mocked-middleware unit test.

## Seeding the catalog and cache invalidation (issue #178 Phases 20, 22)

Two more gaps a pre-PR audit found in Phases 13-19: `seedCanonicalTemplatePresetsUseCase`
had zero production call sites and neither Phase 13 migration inserted a
row, so in any real environment the template catalog was empty — the
TenantManager picker had nothing to show and `findPublishedCanonicalForMode`
returned null for every tenant. A new landlord data migration seeds
`STORE_TEMPLATE_PRESETS` on deploy, reading the constant via a dynamic
import rather than restating its content (ADR 0056 clause 3). A new
`is_canonical` column replaces `findPublishedCanonicalForMode`'s previous
"lowest `template_id` wins" resolution order, which was correct only
because `Object.entries(STORE_TEMPLATE_PRESETS)` happened to list each
canonical preset before its non-canonical sibling.

Separately, `applyTemplateToTenantUseCase` committed its settings
transaction and invalidated nothing — the capability gate's 15s cache and
item-taxonomy validation's 5-minute settings cache would keep serving the
pre-apply overlay, making a just-applied template appear not to have taken
effect. The same pre-existing gap existed in the ordinary settings write
path. All three write paths now clear the capability-gate cache, the Store
Profile resolver's cache, and the item-repository settings cache whenever
a write touches `ops_workflow_mode` / `ops_enabled_capabilities` /
`ops_disabled_capabilities` / `ops_store_profile_read`.

## The landlord Store Template catalog

`store_configuration_templates` / `store_configuration_template_modules`
(issue #178 Phase 13, `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`)
are landlord-DB-only tables — registered in `NON_TENANT_MODEL_EXPORTS`
(`apps/dgfy-api/src/utils/tenantModelFactory.js`), never cloned into a tenant
database. A template is a versioned, curated bundle of Capability Module
keys with a lifecycle: `draft` (module list editable) →
`published` (frozen — editing a published template's modules is rejected at
the use-case layer, not just discouraged; to change content, deprecate and
create a new template) → `deprecated`. Publishing validates the module
selection against the same `validateModuleSelection()` the catalog itself
uses.

`seedCanonicalTemplatePresetsUseCase`
(`apps/dgfy-api/src/modules/templates/usecases/seedCanonicalTemplatePresets.js`)
materializes `STORE_TEMPLATE_PRESETS` into rows once; re-running it never
overwrites an existing `template_key`.

**Provenance, captured once, never dereferenced again.** At tenant
provisioning, `buildProvisioningStoreProfile`
(`apps/dgfy-api/src/services/tenantProvisioningService.js`) resolves a template —
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
`apps/dgfy-api/tests/tenantProvisioningStoreProfileProvenance.test.js`.

**A template's module list becomes real settings, not just a Profile.**
`materializeTemplateModuleSelection`
(`apps/dgfy-api/src/modules/templates/usecases/materializeTemplateModuleSelection.js`)
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

Frontend: a per-tenant template picker on `apps/dgfy-ims/Pages/admin/TenantManager.jsx`
(published templates only, loaded via `listStoreTemplates` from
`packages/web-core/src/services/adminService.js`), gated to active tenants, with the
same reason-required confirmation-modal pattern the capability controls on
the same page already use.

## Platform-admin curation surface

`/api/v1/admin/templates` (issue #178 Phase 14) — Platform Master Admin
only (`resolvePlatformAdminRoutePolicy` in `apps/dgfy-api/src/middleware/auth.js`
routes it to `masterOnly`, not a delegable page permission: a published
template shapes what every future tenant provisions with, platform-wide).
Frontend: `apps/dgfy-ims/Pages/admin/StoreTemplateManager.jsx`, wired into
`AdminLayout.jsx`'s sidebar as "Store Templates".

- `POST /admin/templates` — create a draft. `base_mode` must be an
  authorable mode (`TEMPLATE_AUTHORABLE_MODES`: `native` or `transitional`
  engine classification, issue #178 final-touch pass) — the four
  `external`-engine modes and the deprecated `manufacturing` alias are
  rejected with a 422. `GET /admin/templates?base_mode=` is unrestricted —
  existing templates of any mode remain listable/filterable.
- `PATCH /admin/templates/:id/modules` — edit a draft's modules (draft only;
  requires a reason).
- `POST /admin/templates/:id/publish` — validate and freeze (requires a
  reason).
- `POST /admin/templates/:id/deprecate` — retire (requires a reason).
  **Rejected (409) for a preset (`is_preset`) or canonical
  (`is_canonical`) template** (issue #178 final-touch hardening) — both
  are platform-owned and unremovable through this surface; deprecating a
  canonical row would permanently break `findPublishedCanonicalForMode`
  for that base mode, since the seed migration is idempotent-by-key and
  never repairs a deprecated row.
- `GET /admin/templates`, `GET /admin/templates/:id`,
  `GET /admin/templates/:id/audit-logs` — read paths.

`is_preset`/`is_canonical` can only ever be set by the platform seed (never
by `POST /admin/templates`, which ignores both even if a client sends
them) — an admin-authored template can never claim platform-preset or
canonical provenance.

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

- `apps/dgfy-api/tests/workflowModeCapability.middleware.test.js` (issue #178
  Phase 19) — the gate: grants/denies via the registry path honoring the
  disabled overlay when the flag is off; grants/denies via
  `resolveStoreProfile()` when the flag is on (subtraction actually
  enforced, not just resolvable); fails closed (never grants, always
  `next(error)`) when either resolver throws.
- `apps/dgfy-api/tests/workflowCapabilitySettingsCache.test.js` — the
  `ops_store_profile_read` flag is read in the same cached query as
  mode/enabled/disabled, so the common flag-off gate check pays no extra
  cost.
- `packages/web-core/src/features/settings/__tests__/WorkflowModeContext.profile.test.jsx`
  (issue #178 Phase 18) — the context distributes the server-persisted
  profile when present and an identical local rebuild otherwise.
- `apps/dgfy-api/tests/storeProfile.equivalence.contract.test.js` — `pos_defaults`/
  `terminology` byte-identical to `resolvePosDefaultsAndTerminology` directly
  (the frontend cross-check this test used before Phase 18 retired the
  second implementation it compared against).
- `apps/dgfy-api/tests/capabilityModules.contract.test.js` — catalog ↔ capability
  vocabulary lockstep; per-mode bundle equivalence; preset validity.
- `apps/dgfy-api/tests/workflowCapabilities.enforcement.contract.test.js` — no
  decorative capabilities.
- `apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js` — order-method
  vocabulary ↔ DB ENUM.
- `apps/dgfy-api/tests/resolveStoreProfile.usecase.test.js` — the read-path
  resolver's flag/version/divergence logic, including that template
  provenance and a curated disabled-capabilities overlay never trip a false
  divergence, and that a genuine drift in the disabled overlay is still
  caught.
- `apps/dgfy-api/tests/workflowModes.crossLayer.contract.test.js` — the
  `ops_disabled_capabilities` overlay resolves identically across the
  backend and frontend copies of `resolveEffectiveCapabilities`, cannot
  reach a `locked` module, and reproduces `fnb_counter_service` exactly.
- `apps/dgfy-api/tests/storeProfile.equivalence.contract.test.js` — the
  disabled-capabilities overlay reproduces both non-canonical presets
  (`fnb_counter_service`, `hospitality_guesthouse`) byte-for-byte via
  subtraction, and a subtraction breaking a `requires` edge is rejected.
- `apps/dgfy-api/tests/settingsUsecases.applicationResult.test.js` — the
  `ops_disabled_capabilities` write gate (master-admin only, normalized,
  deduped) and the `CAPABILITY_SELECTION_UNBUILDABLE` rejection for both the
  bulk and single-key settings write paths.
- `apps/dgfy-api/tests/storeConfigurationTemplateUseCases.test.js` — template
  lifecycle (draft → published → deprecated), publish-time validation, and
  published-template module immutability.
- `apps/dgfy-api/tests/seedCanonicalTemplatePresetsUseCase` (`seedCanonicalTemplatePresets.usecase.test.js`) —
  idempotent seeding from `STORE_TEMPLATE_PRESETS`.
- `apps/dgfy-api/tests/tenantProvisioningStoreProfileProvenance.test.js` — the
  Phase 13 acceptance criterion, proven end-to-end (Phase 23 rewrite):
  resolves a provisioned tenant's Profile through `resolveStoreProfile()`
  after its source template has been edited, and asserts both that the
  resolution is unchanged and that the template repository is never
  called during the read; Phase 17's explicit `templateKey` selection
  (mode-matching, mode-mismatched, draft, and not-found cases, each
  falling back to the pre-Phase-17 canonical lookup).
- `apps/dgfy-api/tests/materializeTemplateModuleSelection.test.js` — the pure
  template→overlay diff: empty overlays for a canonical template, a real
  disabled overlay for a subtractive one, a real enabled overlay for an
  additive one, both non-canonical presets reproduced exactly.
- `apps/dgfy-api/tests/applyTemplateToTenantUseCase.test.js` — the existing-tenant
  apply-template action: settings seeded correctly for both a canonical and
  a subtractive template, the audit trail, and every rejection path (tenant
  not found/inactive, template not found/unpublished, missing reason).
- `apps/dgfy-api/tests/adminTenantCapabilities.transport.test.js` — apply-template
  route validation gates (`templateKey`/`reason` required, no unknown
  fields) and request/response wiring.
- `apps/dgfy-api/tests/adminTemplates.transport.test.js` — curation route
  validation gates and request/response wiring.
- `apps/dgfy-api/tests/platformAdminRouteClassification.test.js` — `/admin/templates`
  resolves to `masterOnly` (curation, platform-wide); `/admin/tenants/:id/apply-template`
  resolves to the delegable `admin.tenants` permission (a single tenant).
- `apps/dgfy-api/tests/seedStoreConfigurationTemplatePresets.migration.test.js`
  (issue #178 Phase 20) — pins the seed migration's row-builders against
  `STORE_TEMPLATE_PRESETS` directly, and exercises `up()`/`down()`
  idempotency and FK-safe delete order against a mocked `queryInterface`.
- `apps/dgfy-api/tests/storeConfigurationTemplateRepository.canonical.test.js`
  (issue #178 Phase 20) — canonical resolution filters on `is_canonical`
  rather than `template_id` order, with a case where the canonical row does
  not have the lowest id.
- `apps/dgfy-api/tests/storeProfile.equivalence.contract.test.js` (issue #178
  Phase 21 additions) — a counter-service Profile resolves
  `pos_workflow.mode === 'counter'`; a capability additively enabled and
  then subtracted drops out of `item_taxonomy`.
- `apps/dgfy-api/tests/modeItemTaxonomy.contract.test.js` (issue #178 Phase 21) —
  the same additive-then-subtracted taxonomy fix at the item-validation
  layer, plus proof that disabling a base-mode (non-taxonomy-overlay)
  capability leaves taxonomy resolution unaffected.
- `packages/web-core/src/features/settings/__tests__/WorkflowModeContext.profile.test.jsx`
  (issue #178 Phase 21 addition) — `hasCapability` honors the disabled
  overlay, the exact gap that let the 3-arg call survive Phase 19.
- `apps/dgfy-api/tests/fnbKitchenQueueTemplateGate.route.test.js` (issue #178
  Phase 21) — mounts the real `requireWorkflowCapability` exactly as
  `routes/fnb.js` wires it; two differently-templated tenants get
  different real 200/403 outcomes.
- `apps/dgfy-api/tests/applyTemplateToTenantUseCase.cacheInvalidation.test.js`
  (issue #178 Phase 22) — all three capability-related caches are cleared
  on a successful apply, cleared on nothing when the write is rejected,
  the `CAPABILITY_SELECTION_UNBUILDABLE` rejection for a materialized
  selection that isn't buildable, and `base_mode` normalization.
- `apps/dgfy-api/tests/settingsUsecases.applicationResult.test.js` (issue #178
  Phase 22 additions) — `CAPABILITY_SELECTION_CONTRADICTORY` rejection for
  a capability requested in both overlays at once, on both the bulk and
  single-key write paths.
