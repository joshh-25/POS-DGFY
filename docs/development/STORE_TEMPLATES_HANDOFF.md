---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-09
applies_to: settings,catalog,pos,storefront
topic: store_templates_handoff
---

# Store Templates & Profiles — Developer Handoff

This is the "how do I actually work with this" guide for the Store
Configuration Template system (issue #178, ADR 0037 Axis 2, ADR 0056). It
complements, and does not replace, the two documents that govern the
system:

- **`docs/features/STORE_TEMPLATES_AND_PROFILES.md`** — the system
  reference. What was built, phase by phase, with the exact files and
  tests for each piece. Read that first if you need to know *what exists*.
- **`docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`**
  and its sibling amendment in **ADR 0037** — the binding decisions and
  *why* the boundaries are where they are.

This doc exists for a narrower job: helping the next developer (human or
AI) extend the system correctly, understand what changes on merge, and
know where the guardrails are before they write code.

## 1. The system, in one page

Three layers, each with a distinct owner:

```
Capability Module catalog  →  Store Template  →  Store Profile
   (code, fixed)               (curated, DB)      (per-tenant, JSON)
```

- **Capability Modules** (`packages/shared-constants/src/capabilityModules.js`)
  are the fixed vocabulary of sellable behavior — `tableService`,
  `hospitalityFolios`, `services`, `inventory`, and so on. Each one is
  either a `gate` (403/422 without it), an `affordance` (UI shape only),
  or `locked` (compliance-determined, never template-selectable). New
  vocabulary is engineering work, always — see §6.
- **Store Templates** (`store_configuration_templates` /
  `_modules` / `_audit_logs`, landlord-DB-only) are curated, versioned
  bundles of module keys. Nine are seeded platform presets (one canonical
  per base mode, plus scale-tier variants like `fnb_counter_service`).
  Platform admins curate more at `/admin/store-templates`. A template
  never adds new vocabulary — it only composes what the catalog already
  declares (ADR 0056 clause 3, `[binding]`).
- **Store Profile** (`ops_store_profile`, a per-tenant JSON setting) is
  what a template — or a raw mode/capability selection — materializes
  into. It's a snapshot, not a live reference: once resolved at
  provisioning or a settings write, it is never re-derived from the
  template that produced it (ADR 0056 clause 2, `[binding]` — "provenance
  is captured once, never dereferenced again").

Effective capabilities for a tenant are always
`(base_mode capabilities ∪ ops_enabled_capabilities) \ ops_disabled_capabilities`
— additive and subtractive overlays over a fixed base. This is what lets
`fnb_counter_service` exist as "fnb, minus the dining-floor modules"
instead of a second hard-coded mode.

## 2. The "ways to sell" vocabulary

If you're used to thinking of businesses by industry ("a restaurant", "a
clinic"), the terms below are how this codebase actually carves it up —
useful to get straight before you touch anything:

| Term | What it means here | Where it lives |
|---|---|---|
| **Transaction lifecycle** | The shape of *how a sale settles*. There are exactly three today: **Order** (`pos_transactions` directly — POS/storefront checkout), **Booking → settle** (`service_bookings` → `pos_transactions` — Services mode), **Folio** (hospitality stays, never settles into `pos_transactions`). | `docs/features/STORE_TEMPLATES_AND_PROFILES.md` §"The three transaction lifecycles"; `posWorkflows.js`'s `transactionRecord` field (`'order'` / `'booking'`) |
| **Capability module** | One switchable unit of behavior *within* a lifecycle — `tableService`, `hospitalityHousekeeping`, `inventory`. Composable, not a lifecycle of its own. | `capabilityModules.js` |
| **Workflow mode** | A named, hard-coded *base bundle* of capability modules — `fnb`, `retail`, `services`, `hospitality`, `msme`, plus four more that share retail's shape (see §4). | `workflowModes.js` |
| **Store Template** | A curated bundle of capability modules, optionally diverging from its base mode's default set. "Industry types" as your users see them are templates, not modes. | `capabilityModules.js`'s `STORE_TEMPLATE_PRESETS`, DB rows |
| **Store Profile** | The materialized, per-tenant result: modules, POS workflow config, item taxonomy, storefront order methods, terminology — all derived from the effective capability set. | `storeProfile.js`, `ops_store_profile` setting |

The layer that owns a given kind of change:

- **New "way to sell" that's just a new combination of existing
  capabilities** (a leaner F&B tier, a hospitality variant without
  housekeeping) → **new Store Template**. No code. See §6.1.
- **New "way to sell" that needs a genuinely new switchable behavior**
  within an existing lifecycle (a new kind of add-on, a new booking
  constraint) → **new Capability Module**. Code, but bounded — see §6.2.
- **New "way to sell" that doesn't fit Order/Booking-settle/Folio at all**
  — a fundamentally different settlement shape → **new transaction
  lifecycle**. Full engineering arc, ADR required — see §6.3. **Software
  sales (subscription / license / one-time-with-down-payment) is this
  category** — worked through in detail below because it's the next
  concrete case on the table.

## 3. What happens when this merges — deploy impact

This is the section written to answer "does the current system still
work the same after this ships." Each claim below states the mechanism,
not just the conclusion, so it can be checked rather than trusted.

**Registration is visually and functionally unchanged.** Both
registration UIs (`frontend/Pages/RegisterCompany.jsx` and
`frontend/apps/store/src/business/pages/StorefrontBusinessGrowPage.jsx`)
still show the same 10 "Operating Mode" choices, built from
`WORKFLOW_MODE_SELECT_VALUES`. There is no template picker on the organic
signup path. Nothing about what a merchant sees or fills in changes.

**Under the hood, a template now assigns itself automatically.** The
organic funnel (`POST /register` → `registerCompanyRequestUseCase` →
`approveTenantUseCase` → `tenantProvisioningService.provisionTenant`)
calls `resolveProvisioningTemplateSelection`, which falls back to
`findPublishedCanonicalForMode(mode)` whenever no explicit `templateKey`
is given (which is always, on this path). For the 6 modes with a
canonical preset, this stamps the tenant's `ops_store_profile` with real
`source_template_id`/`source_template_version` provenance — previously
this either didn't happen (before Phase 20's seed migration existed) or
happened against an empty catalog. **The materialized capability set is
unchanged**: a canonical preset's module list is defined to equal its
base mode's own capability list
(`backend/tests/capabilityModules.contract.test.js` pins this), so a
tenant provisioned today gets exactly the same effective capabilities it
would have gotten before this template existed. The only visible change
is that the Profile now carries a provenance stamp instead of nulls.

**Existing (legacy) tenants are untouched, and there is no backfill.**
This is deliberate, not an oversight. A tenant provisioned before this
arc has only an `ops_workflow_mode` setting — no `ops_store_profile`, no
overlay settings. The runtime fallback chain handles this by construction:
`requireWorkflowCapability` (the capability gate) reads the
`ops_store_profile_read` flag, which **defaults off** for every tenant
not explicitly opted in, and in that case gates directly off the mode
registries (`modeHasCapability`), the same code path that has always
existed. `resolveWorkflowCapabilitySettings` defaults missing overlay
settings to `[]`/`[]`/mode default. `resolveStoreProfile()` — the
opt-in-only read path — never serves a persisted profile that's missing
or version-stale; it always falls back to a fresh rebuild. The one lazy
"backfill" that does happen: any settings write that touches
`ops_workflow_mode`/`ops_enabled_capabilities`/`ops_disabled_capabilities`
materializes and persists `ops_store_profile` as a side effect
(`storeProfileShadowWrite.js`) — but a legacy tenant that never writes
those settings again simply keeps behaving exactly as it always has. The
only way a legacy tenant acquires template provenance is the explicit
`POST /admin/tenants/:id/apply-template` admin action — never automatic.

**The seed migration only touches the landlord catalog.** The Phase 20
migration (`20260810000002-seed-store-configuration-template-presets.cjs`)
inserts 9 rows into `store_configuration_templates`/`_modules`, reading
`STORE_TEMPLATE_PRESETS` via a dynamic import so there's no second copy of
the preset data to drift. It is idempotent per `template_key` and touches
**zero** tenant databases or tenant settings.

**Net effect:** if you're checking "did this change behavior for anyone",
the honest answer is: new tenants get a provenance stamp they didn't have
before (no behavior change, since canonical ≡ base mode by construction);
existing tenants get nothing until an admin explicitly applies a template
to them; the UI a merchant sees at signup is byte-identical.

## 4. The native/transitional/external engine classification

Every workflow mode is classified by **who runs its selling engine** —
`WORKFLOW_MODE_ENGINE` in `packages/shared-constants/src/workflowModes.js`:

- **`native`** (`retail`, `services`, `fnb`, `msme`) — DGFY runs the engine
  end-to-end: catalog, POS, storefront, fulfillment all live inside this
  platform.
- **`transitional`** (`hospitality`, `food_manufacturing`) — DGFY runs the
  engine **today** (hospitality alone is ~2,100 LOC across 22 tables with a
  public booking API; food_manufacturing has job/dispatch orders and the
  richest per-mode RBAC preset set), but the product direction is to move
  it to a **separate sibling app** under the same parent company (Sieitz) —
  hospitality to "Sync Core", food_manufacturing to an external Skupervisor
  engine. `WORKFLOW_MODE_ENGINE_NOTES` names the planned engine per mode.
  These stay fully authorable in Store Template curation and keep their
  seeded presets (`hospitality_property`, `hospitality_guesthouse`,
  `food_manufacturer`) — nothing about how they run changes today, only
  the admin-visible label ("Native today · external engine planned").
- **`external`** (`healthcare`, `ticketing_transport`,
  `logistics_distribution`, `education_institutions`) — the engine already
  lives, or will live, in a separate app; DGFY provides registration and
  UI/UX visibility only. These are exactly `STORE_TEMPLATE_PRESETLESS_MODES`
  (below) and are hidden from Store Template authoring
  (`TEMPLATE_AUTHORABLE_MODES` excludes them; `adminTemplateValidator.js`'s
  create-draft schema rejects them server-side with a 422).

**Flipping a mode's classification is meant to be a one-line change** in
`WORKFLOW_MODE_ENGINE` — but check what moves with it:

1. `backend/tests/capabilityModules.contract.test.js`'s "engine
   classification contracts" suite pins the *current* membership of each
   tier by name — update the expected arrays in the same commit as the flip,
   or the test fails loudly (that's the point).
2. Flipping a mode to `external` automatically removes it from
   `TEMPLATE_AUTHORABLE_MODES` (derived, not separately maintained) — but
   **does not** by itself retire its seeded presets.
   `STORE_TEMPLATE_PRESETLESS_MODES` is a distinct list; the engine
   classification contract test only pins `external ⊆ presetless`
   (subset, not equality) precisely so a transitional mode can flip to
   external while keeping its presets until a separate, deliberate product
   decision retires them (that retirement is itself nontrivial — see §7's
   note on `capabilityModules.contract.test.js`'s "canonical preset per
   offered mode" test, which would need updating, plus a new down-migration
   for the already-seeded rows; do not do this casually).
3. If a `transitional` mode's engine genuinely moves, more changes than
   this one constant — the native backend module doesn't switch itself off.

### The four preset-less external modes, specifically

`healthcare`, `ticketing_transport`, `logistics_distribution`, and
`education_institutions` are offered at registration and are real,
provisionable modes (`WORKFLOW_MODE_CAPABILITIES` has an entry for each),
but have **no** template preset — pinned by
`STORE_TEMPLATE_PRESETLESS_MODES` in `capabilityModules.js` and a contract
test that fails if this set drifts in either direction. They stay
retail-shaped (identical capability list to `retail`) and preset-less. A
tenant registering in one of them provisions with null template
provenance, which — per §3 above — the whole system already tolerates by
design.

If you're picking this up: check whether a follow-up issue exists for
"externally-powered verticals" before assuming these four need a preset
(or a fifth mode should join them). Adding one without that product
decision would be exactly the kind of undocumented drift
`STORE_TEMPLATE_PRESETLESS_MODES` and its contract test exist to prevent —
the test will fail loudly if you try.

## 5. Admin how-to

**Curating templates** — `/admin/store-templates`
(`frontend/Pages/admin/StoreTemplateManager.jsx`), Platform Master Admin
only (`masterOnly` in `middleware/auth.js`, not a delegable permission —
a published template shapes every future tenant, platform-wide):

- Create a draft: key, label, base mode (must be an authorable mode —
  `TEMPLATE_AUTHORABLE_MODES`, i.e. `native` or `transitional` engine
  classification; the four `external` modes and the deprecated
  `manufacturing` alias are rejected with a 422, see §4), and a module
  selection (validated against `validateModuleSelection` —
  unknown/planned/`requires`-violating selections are rejected). The
  module grid groups and describes modules (`description`/`surface`/
  `group` fields on `CAPABILITY_MODULES`), filtered by default to the
  selected base mode's relevant groups (`MODE_FAMILY_MODULE_GROUPS`) with
  a "show all module groups" toggle — this is presentation only, it
  narrows what the grid *shows*, never what a selection can validly
  contain.
- Edit a draft's modules (draft-only; requires a reason).
- Publish (freezes the module list — publishing again is idempotent;
  editing a published template is rejected, not just discouraged).
- Deprecate — **rejected for a preset or canonical template** (issue #178
  final-touch hardening). Platform-seeded presets and canonical defaults
  are unremovable through this surface; only admin-authored templates can
  be deprecated. This exists because deprecating a canonical row would
  permanently break `findPublishedCanonicalForMode` for that base mode —
  the seed migration is idempotent-by-key and will never repair a
  deprecated row.
- `is_preset`/`is_canonical` can only ever be set by the platform seed
  (`seedCanonicalTemplatePresets.js`, which calls the repository
  directly). `POST /admin/templates` ignores both fields even if a client
  sends them — an admin-authored template can never claim
  platform-preset or canonical provenance.

**Applying a template to an existing tenant** — the per-tenant picker on
`frontend/Pages/admin/TenantManager.jsx` (published templates only,
active tenants only), or `POST /admin/tenants/:id/apply-template`
directly. Requires `templateKey` and a reason (≥3 characters). One
transaction: seeds the three overlay settings from the materialized
selection, writes a fresh `ops_store_profile` with this template's
provenance, clears the capability-gate/profile-resolver/item-taxonomy
caches, and audits to `TenantAdminAuditLog`. Non-destructive — applying a
different template later fully restores whatever the previous one
granted; nothing is deleted.

**`templateKey` at provisioning time** — reachable on the three admin-only
endpoints (`POST /admin/tenants/provision` (legacy), `/admin-provision`,
and `/admin-provision-with-account`) **and, since issue #178 Phases
31-33, the organic `/register` → `/approve` funnel too** (§3). Registration
no longer accepts a raw `templateKey` from the client — it accepts an
`industryKey` (see "The registration Industry catalog" below), which
`registerCompanyRequestUseCase.js` resolves server-side into
`workflow_mode` and `store_template_key`; `approveTenantUseCase.js`
forwards the resolved `templateKey` into the same
`provisionTenant({...})` call every other path already used.
`buildProvisioningStoreProfile` itself is unchanged — it always accepted a
`templateKey` option, the gap was purely that the organic funnel never
populated it.

### The registration Industry catalog (DB-driven since issue #316)

The `registration_industries` landlord table is the merchant-facing layer
above Store Templates and the runtime source `GET
/api/v1/registration/industries` reads: one row per industry, each
`{ industry_key, label, summary, niches, workflow_mode, template_key,
display_order, hidden, is_system }`. It is seeded on deploy from
`packages/shared-constants/src/registrationIndustries.js`'s
`REGISTRATION_INDUSTRIES` (the 11 entries transcribed from
`docs/features/INDUSTRY_CLASSIFICATION.md`, DGFY's own business-niche
guide) via `20260812000002-seed-registration-industries.cjs` — idempotent
per key, never overwriting an admin edit. **That constant is now the seed
baseline and the read/write paths' fail-open fallback, not the runtime
catalog** — see ADR 0058.

The endpoint (joined against live template publish-status) serves
`frontend/src/features/registration/`'s two components: `IndustrySelect.jsx`
(the merchant dropdown on `/business/grow` and `/register-company`, since
Phase 38) and `IndustryPicker.jsx` (admin-only, TenantManager's
assisted-provisioning panel).

**To add a new registration industry — an admin action, no code, no PR:**

1. If the industry needs a template that doesn't exist yet, create and
   publish one first (§5 above, "Curating templates").
2. Open the "Registration industries" panel on the Store Template Manager
   page (`frontend/Pages/admin/StoreTemplateManager.jsx`) and use the "New
   industry" form: key, label, summary, niches, workflow mode, and (for
   any non-`external`-engine mode) the published template to pair it with
   — the panel only offers templates whose `base_mode` matches the chosen
   mode. A reason is required and audited. The new industry starts
   **hidden**; unhide it via the same panel once it's ready for merchants.
3. Backend: `POST /api/v1/admin/registration-industries`
   (`adminRegistrationIndustryUseCases.js`'s `validateModeAndTemplate()`
   enforces the same base_mode/published/null-iff-external invariants the
   old contract test pinned for the constant — now enforced server-side
   for every write, seeded or admin-created).
4. Optionally update `docs/features/INDUSTRY_CLASSIFICATION.md` with the
   new industry's write-up for narrative/reference purposes — the catalog
   itself no longer depends on that doc or the constant to function.

`backend/tests/registrationIndustries.contract.test.js` still exists and
still runs on every change to the constant, but its role changed: it now
pins **seed-baseline integrity** (the 11 shipped entries stay internally
consistent — mode/template pairing, `order` contiguity, null-iff-external)
rather than the live registration catalog's shape.

**Why adding a *template* (or a registration-catalog entry) is now
usually the right move instead of adding a mode.** Before issue #178, the
only way to make a new kind of business registerable was a new
`workflow_mode` — code, migration, playbook, a new capability list. Now: a
template is a curated bundle of existing capability modules (a UI action,
no code); a registration-catalog entry is likewise a UI action (an admin
form, no code, no migration) since issue #316. `micro_fnb` ("Micro Food &
Beverage") was the original proof of the first half: it needed zero new
modes, zero new capabilities — only a template (`fnb_counter_service`,
already existed) and a catalog entry pointing at it. Reach for a new
`workflow_mode` only when the business genuinely needs a capability,
transaction lifecycle, or POS workflow shape that no existing mode's
capability list can express even with the additive/subtractive overlays —
see `MODE_DEVELOPMENT_PLAYBOOK.md` for that heavier path, which now also
requires declaring (or explicitly opting out of) a registration Industry
entry for the new mode.

### Admin visibility, create, and edit (issue #178 Phase 39; full CRUD via issue #316)

An admin curates the entire catalog — hide/show, create, and edit — through
the "Registration industries" panel on the Store Template Manager page
(`frontend/Pages/admin/StoreTemplateManager.jsx`), backed by
`GET/POST/PATCH /api/v1/admin/registration-industries*`.

Mechanics:

- `hidden` (plus `hidden_reason`, `updated_by`) is a column on
  `registration_industries` itself — every offered industry has a row, so
  "row absence" no longer means anything about visibility (contrast with
  the retired Phase 39 store below, where it did). `registration_industry_audit_logs`
  records every create/update/hide/unhide, with actor + required reason
  and a before/after snapshot.
- `GET /api/v1/registration/industries` always returns every row, each
  carrying `hidden: boolean` and (since issue #316) `template_modules`
  (the paired template's live module list, so "What you'll get" renders
  even for an admin-created template not in `STORE_TEMPLATE_PRESETS`); the
  array is never shortened.
- `IndustrySelect.jsx` filters hidden entries out; `IndustryPicker.jsx`
  (admin-only) annotates them "Hidden from registration" but leaves them
  selectable, since assisted provisioning bypasses `industryKey` entirely.
- `registerCompanyRequestUseCase.js` resolves `industryKey` against the
  catalog table first (async), falling back fail-open to the seed-baseline
  constant on any lookup error or absent row; it rejects a hidden
  `industryKey` server-side (400, `hidden_industry_key`) as defense in
  depth against a direct API call bypassing the dropdown's filtering.
- Every lookup — catalog read and registration-write enforcement alike —
  fails OPEN on a landlord-DB error: registration is never blocked by this
  feature being unavailable.
- **Seeded (baseline) rows are protected**: `is_system: true`, set only by
  the seed migration. Their `industry_key` and `workflow_mode` can never
  be edited; `label`, `summary`, `niches`, `display_order`, `template_key`,
  and `hidden` remain editable. No route performs a hard delete — matching
  Store Templates' own no-DELETE precedent; `hidden` is the only
  removal-from-merchant-view mechanism (ADR 0058 clause 3).

**Retired: the Phase 39 `registration_industry_visibility` store.** Its
`hidden` state and audit trail were folded into `registration_industries`
(migration `20260812000003-fold-registration-industry-visibility.cjs`)
and the tables themselves dropped
(`20260812000004-drop-registration-industry-visibility.cjs`) once every
consumer had cut over — safe because PR #311 (which shipped that store)
had not yet reached `main`/production when issue #316 landed. The admin
API's route shapes (`PATCH /:industryKey/visibility`, `GET
/:industryKey/audit-logs`) are unchanged; only their backing table moved.

**The pre-existing `visibility` ENUM on `store_configuration_templates`
(shipped with the original template catalog migration, Phase 13) remains
dead**, now superseded twice over — first by the Phase 39 visibility
store, now by `registration_industries.hidden` directly. It was
write-only from day one (set on create, never read by any consumer), and
even wired up would only ever have covered template-backed industries,
never the mode-only ones. Left in place rather than removed to avoid
churning `adminTemplateValidator.js` and several test files for zero
behavioral gain; a candidate for a future cleanup migration if it's ever
worth the churn.

## 6. Extension recipes, cheapest first

### 6.1 New template (no code)

If what you need is expressible as "some subset/superset of an existing
mode's capability modules" — a new operational tier, a new curated
combination — this is a **Store Template**, authored entirely through the
admin UI (§5). No PR needed. This is the majority case: most new
"industry types" your users will ask for are this.

### 6.2 New capability module

A genuinely new switchable behavior within an existing lifecycle. Traced
end-to-end using `services` (the booking→settle lifecycle) as the worked
example — every layer a new module or a new mode variant touches:

1. **Catalog entry** — `capabilityModules.js`: key, label, `enforcement`
   class (`gate`/`affordance`/`locked`), `requires`/`conflicts_with`,
   `enforced_by` (must point at a real guard — see step 5).
2. **Mode wiring** (only if the module belongs to a mode's base set, not
   just an optional add-on) — `workflowModes.js`'s
   `WORKFLOW_MODE_CAPABILITIES`.
3. **POS workflow shape** (if it changes what the terminal shows) —
   `posWorkflows.js`'s `POS_WORKFLOW_CONFIGS` and `resolvePosWorkflow`'s
   family dispatch.
4. **Order method vocabulary** (only if a new settlement method is
   needed) — `orderMethods.js`. **This one is a DB migration in the same
   PR**: `ALL_ORDER_METHODS` must stay identical to the
   `pos_transactions.order_method` ENUM, enforced by
   `backend/tests/orderMethods.crossLayer.contract.test.js`.
5. **The actual guard** — a `requireWorkflowCapability(...)` route gate,
   or an entry in `CAPABILITY_TAXONOMY_OVERLAY_MODES`
   (`modeItemTaxonomy.js`) for item-taxonomy-shaped capabilities. This is
   not optional: `backend/tests/workflowCapabilities.enforcement.contract.test.js`
   fails if a declared capability has no real reader — decorative
   capabilities cannot land.
6. **Store Profile** — if the module affects a Profile block (`modules`,
   `pos_workflow`, `item_taxonomy`, `terminology`), check
   `storeProfile.js`'s `buildStoreProfile` derives it from the *effective*
   module set, not just the base mode — and bump `STORE_PROFILE_VERSION`
   if the Profile's shape changes at all.
7. **Frontend affordance consumers** — `frontend/src/features/settings/workflowMode.js`
   (`WORKFLOW_PAGE_CAPABILITIES`/`WORKFLOW_ROUTE_CAPABILITIES`),
   `WorkflowModeContext.jsx`'s `hasCapability`, and any POS/storefront
   component that renders conditionally on the capability.
8. **Storefront presentation** (`frontend/apps/store/src/app/runtime/`) —
   `storefrontTemplateRegistry.js` / `modePresentationRegistry.js`, if the
   module changes what the public storefront shows.

**The tests that catch a skipped layer** — run these after any capability
module change: `capabilityModules.contract.test.js`,
`workflowCapabilities.enforcement.contract.test.js`,
`orderMethods.crossLayer.contract.test.js` (if you touched order methods),
`workflowModes.crossLayer.contract.test.js`, `storeProfile.equivalence.contract.test.js`.

### 6.3 New transaction lifecycle (engineering-owned, ADR required)

Only when the existing three lifecycles (Order / Booking-settle / Folio)
genuinely cannot express the new selling shape — not a new combination of
capabilities, a new *kind* of settlement. This is
`docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`'s "genuinely new mode
family" case, and ADR 0056 clause 3 is explicit that a template can never
introduce new business logic — so this is never a template-authoring
action, always an engineering arc with its own ADR.

**Worked example: software sales (subscription / license / one-time with
a down payment).** This doesn't fit today's three lifecycles cleanly —
it's not a single-settlement Order, not a Booking that settles once, and
definitely not a Folio. Before writing any code, work through:

- **What record does it settle into?** A brand-new table (like
  `service_bookings`), or does it eventually still produce a
  `pos_transactions` row (like Booking-settle does) for the parts of it
  that *are* one-shot? A recurring subscription probably needs its own
  entitlement/billing-cycle table that Order/Booking-settle/Folio have no
  equivalent of.
- **Does it need a new `order_method`?** Only if it settles into
  `pos_transactions` at all. If it doesn't (like Folio doesn't), it needs
  none — the cheaper precedent to follow if the settlement shape allows
  it.
- **Down-payment specifically** is a partial-settlement pattern none of
  the three lifecycles have today — Order settles once and in full,
  Booking-settle settles once at completion, Folio never settles into
  POS at all. This needs new modeling, not a flag on an existing one.
- **Fiscal/VAT implications** of a recurring or partial-payment sale are
  a compliance-surface question — loop in whoever owns
  `backend/src/modules/compliance/` before designing the settlement
  shape, not after.
- **The layer checklist from §6.2 still applies**, plus: a new backend
  module under `backend/src/modules/`, a new `frontend/apps/store/src/modes/<x>/`
  storefront tree, an ADR, and the lifecycle table in
  `STORE_TEMPLATES_AND_PROFILES.md` growing from three rows to four.
- **No catalog slot is reserved for this today, deliberately.** The four
  `status: 'planned'` modules in `capabilityModules.js` are all
  scoped to the `services` lifecycle (`requires: ['services']`) — none of
  them anticipate a new lifecycle, and adding a slot for one that doesn't
  exist yet would misrepresent a product decision that hasn't been made.
  The slot gets added when this lifecycle's own arc lands, not before.

A GitHub issue draft covering this scope was prepared alongside this
handoff doc — check issue #178's linked issues, or ask whoever did the
final-touch hardening pass, if you can't find it.

## 7. The contract-test safety net

Run these after any change in this area — they're what catches a skipped
layer, not code review:

- `backend/tests/capabilityModules.contract.test.js` — catalog ↔
  capability vocabulary lockstep, per-mode bundle equivalence, preset
  validity, and (issue #178 final-touch) the bare-mode partition.
- `backend/tests/workflowCapabilities.enforcement.contract.test.js` — no
  capability may be declared without a real reader.
- `backend/tests/orderMethods.crossLayer.contract.test.js` — order-method
  vocabulary ↔ DB ENUM.
- `backend/tests/workflowModes.crossLayer.contract.test.js` — backend and
  frontend copies of `resolveEffectiveCapabilities` stay in lockstep.
- `backend/tests/storeProfile.equivalence.contract.test.js` — Profile
  byte-equivalence; this is what catches an unbumped `STORE_PROFILE_VERSION`.
- `backend/tests/workflowModeCapability.middleware.test.js` — the
  fail-closed gate itself: grants/denies on both the registry and
  resolver paths, always denies on error.

Run targeted, not the full suite:

```bash
cd backend && node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config jest.config.cjs --runInBand <pattern>
```

The full backend Jest suite requires a live MySQL connection and hangs
without one in most sandboxes — use pattern matching, not `jest` bare.

Frontend:

```bash
cd frontend && npx vitest run <paths>
cd frontend && npx eslint <files>
cd frontend && npx vite build
```

## 8. Known limitations & deliberate deferrals

**`DEFAULT_WORKFLOW_MODE` is `food_manufacturing`, a `transitional`-engine
mode.** It is the pre-selected default on all three registration surfaces
and the fallback for automatic business classification
(`businessClassification.js`). This predates the engine classification
(§4) and was deliberately left unchanged in that pass — the registration
UX guarantee for this arc was "as if nothing happened". Whether the
platform default should be a `native` mode (e.g. `retail`) instead is an
open follow-up product decision, not a bug; if you pick it up, the touch
points are the three registration forms' default form values, the
classification fallback, and the discovery-index fallbacks (grep
`DEFAULT_WORKFLOW_MODE` usages before changing it).

**`template.version` is always `1`.** Set at creation, never incremented
anywhere in the codebase. Provenance stamps (`source_template_version`)
are therefore not discriminating on that axis today — every template's
provenance reads version 1 forever. Not fixed in this pass; if you need
real versioning, that's new work, not a bug fix.

**Two gaps from ADR 0037's amendment are deliberately deferred — do not
reopen without a product decision. A third has since shipped:**

1. **The public storefront doesn't see subtraction.** `storeUseCases.js`'s
   catalog listing and `frontend/apps/store`'s capability model both read
   only the enabled overlay, never the disabled one. Backend and admin
   POS correctly deny subtracted capabilities; the public storefront can
   still present them. A separate app, a separate phase's worth of work.
2. **`storefrontLayout` is declared but never materialized** into the
   Store Profile — the catalog names `storefrontTemplateRegistry.js` /
   `modePresentationRegistry.js` as its `enforced_by`, but
   `buildStoreProfile()` never reads either.
3. ~~**`templateKey` is unreachable from the organic signup funnel**~~
   **Shipped (issue #178 Phases 31-33).** See §5's "registration Industry
   catalog" subsection above.
4. **The Online Store and Online Checkout dimensions have no template
   seam yet** (issue #178 Phases 35-36, ADR 0057). Only POS is
   profile-driven today (§ "the four dimensions of 'how we do business'"
   in `docs/features/STORE_TEMPLATES_AND_PROFILES.md`). The Services
   fulfillment-profile vocabulary
   (`packages/shared-constants/src/fulfillmentProfiles.js`,
   `docs/features/SERVICES_FULFILLMENT_PROFILES.md`) is a first named seed
   for Online Store, scoped to Services and deliberately client-side-only
   — ADR 0057 clause 3 forbids wiring it into `buildStoreProfile()`,
   `STORE_TEMPLATE_PRESETS`, or any database column until a superseding or
   amending decision. Delivery and Online Checkout have no seed at all
   yet. Do not add template linkage for any of these without first reading
   ADR 0057 and (for Delivery/Online Checkout) writing an equivalent ADR —
   this is a repeat of the same governance ordering issue #178 established
   for the Template/Profile layer itself (ADR 0056 clause 3).

## 9. AI-agent orientation

If you're an AI assistant picking up work in this area:

- **Lookup order**: root `CLAUDE.md` (pointer) → `docs/ai/CLAUDE.md` →
  this doc → `docs/features/STORE_TEMPLATES_AND_PROFILES.md` → ADR 0056 →
  ADR 0037's amendment (for the deferred-gaps list in §8).
- **The single source of truth for presets and modules** is
  `packages/shared-constants/src/capabilityModules.js` — never restate
  `STORE_TEMPLATE_PRESETS` content anywhere else (the seed migration reads
  it via a dynamic import for exactly this reason).
- **Compliance tripwires** — changes under `backend/src/modules/settings/**`
  or `frontend/src/features/pos/**` require a compliance impact
  declaration (`docs/compliance/impact-declarations/`,
  `npm run check:compliance`). `backend/src/routes/adminTenants.js`,
  `frontend/src/services/adminService.js`, and
  `frontend/Pages/admin/TenantManager.jsx` carry a `regulatory` floor
  specifically — see `scripts/check-compliance-impact.js`'s sensitivity
  matrix before assuming a `major` classification is enough. A clean
  local git tree makes `npm run check:compliance` report "no
  compliance-sensitive changes" even when a PR's full diff would fail it
  — simulate against the real diff before trusting a local pass:
  `COMPLIANCE_CHANGED_FILES="$(git diff --name-only origin/develop...HEAD | tr '\n' ',')" node scripts/check-compliance-impact.js`.
- **Circular-import hazard**: `backend/src/modules/inventory/repositories/itemRepository.js`
  statically imports `settings/index.js`, so any static reverse edge from
  a settings use case into `inventory/index.js` throws at module load.
  Use dynamic `await import()` if you need that direction.
- **Don't restate presets, don't add a hard-coded mode for a new
  industry** — read §6 first. The `MODE_DEVELOPMENT_PLAYBOOK.md` build
  order still governs a genuinely new mode *family*; everything else goes
  through the Store Template layer.
