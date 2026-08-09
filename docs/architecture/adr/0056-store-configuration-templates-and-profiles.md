---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-09
last_reviewed: 2026-08-09
review_by: 2027-02-09
applies_to: settings, catalog, pos, storefront, compliance
topic: store_configuration_templates_and_profiles
---

# ADR 0056: Store Configuration Templates and Profiles

## Status

Amended (2026-08-09). Read the Amendments section last.

## Context

ADR 0037 Decision 2's Axis 2 ("vertical preset") described a thin,
composition-only layer over capabilities but stopped short of giving it an
entity, a version, or a non-engineering write path. GitHub issue #178
("Store Templates & Capability Configuration") reconciled an uploaded
proposal against what actually ships on `develop` and found the diagnosis
correct — roughly half the proposed model already exists under different
names (`WORKFLOW_MODE_CAPABILITIES`, `ops_enabled_capabilities`, five
hard-coded per-mode registries) — but two of its premises don't hold in this
codebase and are corrected here rather than in ADR 0037 itself, because they
touch content ADR 0037 amends this same day but that pre-dates this
decision:

1. **Enforcement posture.** The proposal treats configuration as uniformly
   "an affordance, not a restriction," with hard enforcement reserved for
   locked modules. That is the opposite of what ADR 0008 Decision 7 already
   accepted ("hidden module access in MSME is enforced at route level, not
   only navigation rendering") and what `requireWorkflowCapability` already
   does. A blanket affordance rule would reverse an accepted decision.
2. **Provenance dereference.** A template/profile system that resolves
   effective behavior by joining back to its source template at request time
   reintroduces the exact coupling issue #178 is designed to avoid: editing
   a published template could retroactively change every store built from
   it. The whole point of materializing a profile is that it stops being
   derived once written.

This ADR records the resulting model and binds the three clauses that follow
from those corrections, cross-boundary between the landlord and tenant
databases. Everything else about the model — the enforcement trichotomy's
day-to-day application, storage shape, module catalog content, and phasing —
is recorded as `[default]` in ADR 0037's amendment
(`docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`),
which this ADR supplements rather than duplicates.

## Decision

1. **A Capability Module's `locked` modules are compliance-determined, never
   template-determined.** The fiscal/BIR profile and the customer access
   ceiling (`backend/src/modules/compliance/policy/`,
   `backend/src/modules/shared/utils/customerAccessPolicy.js`) are resolved
   by compliance state at request time. No Store Template or Store Profile
   may set, override, or widen either value. This is the ceiling-over-request
   shape `customerAccessPolicy.js` already implements (effective value = min
   of requested, platform max, registration-stage max), generalized as the
   rule for every `locked`-class module the catalog declares now or later.
   `[binding]`
2. **A Store Profile's provenance is never dereferenced at runtime.**
   `source_template_id` / `source_template_version` (Phase 13) record where a
   profile came from for display, audit, and future review-and-accept
   tooling only. No request-serving code path may read a template row to
   determine a tenant's effective configuration; the tenant's own persisted
   Profile is always the sole source of truth once materialized. Editing a
   published template must provably change zero existing tenants' profiles
   — this is tested explicitly (`backend/tests/`), not assumed. `[binding]`
3. **A template or profile never introduces a new enum value, database
   column, or business logic.** Both layers compose *from* the Capability
   Module catalog; they cannot add to it. Widening an underlying enum (for
   example, the `order_method` DB ENUM fix in ADR 0037's Phase 6e) is
   engineering work gated by the normal migration and schema-coverage
   process, never a template-authoring action, even when performed by a
   platform admin through the Phase 14 curation surface. `[binding]`
4. Store Profile materialization derives from each tenant's *current
   effective configuration*, not a freshly authored preset, so the
   materialized profile is behavior-identical to today by construction
   (proven by the equivalence harness,
   `backend/tests/storeProfile.equivalence.contract.test.js`). Preset content
   for new tenants (Phase 13) is itself seeded from materialized profiles,
   not hand-written, so it inherits the same guarantee. `[default]`
5. Landlord-owned template tables (`store_configuration_template`,
   `store_configuration_template_module`, Phase 13) are added to
   `NON_TENANT_MODEL_EXPORTS` in `backend/src/utils/tenantModelFactory.js`.
   They must never be cloned into a tenant database — clause 2 depends on
   templates staying a landlord-only concern the tenant Profile is
   materialized from once, not read from continuously. `[default]`
6. Curation (author/version/publish/deprecate a template) is a platform-admin
   action, reusing ADR 0047's identity/RBAC and the audited-write pattern
   already shipped for tenant capability edits
   (`PATCH /admin/tenants/:id/capabilities` +
   `GET /admin/tenants/:id/capabilities/audit-logs`). No new authorization
   model is introduced. `[default]`

## Consequences

- Clause 1 means a template can request a customer-access mode but can never
  grant one beyond what compliance state allows — templates propose, policy
  disposes, exactly as today for a manual per-tenant request.
- Clause 2 means the Store Profile, once materialized, is the durable
  contract for "what does this tenant's store do" — deleting or corrupting a
  template row must never be able to break a live tenant. It also means
  Phase 12's runtime read-path (ADR 0037 Amendment, Phase 12) reads the
  tenant's own `ops_store_profile` setting, never a template table, keeping
  the landlord/tenant database boundary intact on the hot path.
  Non-canonical, hand-curated templates (e.g. `fnb_counter_service`) are
  validated at publish time only (`validateModuleSelection()`); the
  equivalence harness's byte-identical guarantee applies to canonical
  presets, whose module list equals a mode's own capability list — it is not
  a substitute for publish-time validation.
- Clause 3 keeps the template/profile layer metadata-only in perpetuity.
  Any new selling behavior (the catalog's `status: 'planned'` modules —
  labor tracking, POS-created bookings, booking reschedule, pickup-and-return
  logistics) ships as ordinary engineering work with its own design and, if
  cross-boundary, its own ADR — never as a template edit.

## Rollout

Phases 10 and 11 (Capability Module catalog; Store Profile shadow-write)
shipped ahead of this ADR under ADR 0037's `[default]`-tier phased rollout
and are unaffected by it. Phase 12 (runtime read-path) shipped as tested
scaffolding only — a resolver and a divergence differ, gated by a flag no
consumer read through yet — scoped by clause 2 above from its first commit.
Phases 13 (landlord template catalog) and 14 (curation surface) shipped
next, scoped by clauses 1, 3, 5, and 6; Phase 13's existence is what would
make wiring a real Phase 12 consumer meaningful, which is why it landed
first. Phase 16 (this amendment's subtractive overlay) and Phase 17
(apply-template) closed the remaining gap — a template's module list can
genuinely diverge a Profile from its base mode, at provisioning or applied
to an existing tenant. Phases 18 and 19 have since wired the first two real
Phase 12 consumers: POS affordances (a shadow-write read, not through the
resolver), then the fail-closed capability gate last — the resolver's first
actual consumer, and the only one, with the registries kept as its
permanent flag-off fallback rather than retired. All phases through 19 are
now shipped; issue #178's remaining scope (storefront order methods, item
taxonomy validation wiring, the four `planned` catalog modules) is
deliberately out of this ADR's rollout, per the reasons recorded in ADR
0037's amendment.

## Validation

- `npm run check:architecture` — `store_configuration_template*` never
  appears among tenant-cloned models.
- A test proving a published template edit changes zero existing tenants'
  Profiles (Phase 13 acceptance criterion, issue #178).
- `backend/tests/capabilityModules.contract.test.js` and
  `backend/tests/storeProfile.equivalence.contract.test.js` continue passing
  unmodified by this ADR — it constrains future phases, not shipped ones.
- `npm run lint:docs`.

## Amendments (2026-08-09)

### A subtractive capability overlay, so a template can actually change a store

Phases 13-14 gave templates a persisted, curatable, versioned home, but two of
the three non-canonical presets seeded at Phase 13 (`fnb_counter_service`,
`hospitality_guesthouse`) *remove* modules from their base mode's list. Until
now, `buildStoreProfile` only accepted an additive `enabledCapabilities`
overlay (`resolveEffectiveCapabilities` was a strict union), so those rows
were inexpressible as a Profile — nothing could ever apply them. Phase 16
adds `ops_disabled_capabilities`, mirroring `ops_enabled_capabilities`'
governance shape exactly (same master-admin write gate, same 15s
tenant-scoped cache, same `ALL_WORKFLOW_CAPABILITIES` normalization) rather
than inventing a second authorization model — consistent with Decision 6's
`[default]`. Effective capabilities become `(base ∪ enabled) \ disabled`,
validated against `validateModuleSelection()`'s `requires`/`conflicts_with`
edges before the write is accepted, so a subtraction can never leave a store
requesting a module whose dependency it just removed. `STORE_PROFILE_VERSION`
moves to 4 to carry `source.disabled_capabilities`.

**Decision 1 is strengthened by this, not weakened.** The disabled overlay
is normalized against `ALL_WORKFLOW_CAPABILITIES` — the same gate/affordance
vocabulary `WORKFLOW_MODE_CAPABILITIES` entries are drawn from. Neither
`fiscalProfile` nor `customerAccessMode` (the catalog's two `locked`
modules) appears in any mode's base list or in `ALL_WORKFLOW_CAPABILITIES`,
so no disabled-capabilities write can reach them; they stay
compliance-determined exactly as before. Decision 2 (provenance never
dereferenced at runtime) is unaffected: Phase 17's apply-template action
writes `{mode, enabled, disabled}` and stamps provenance once, at write
time, and never re-reads the template row afterward — the same shape as
provisioning's existing one-time lookup.

### Phase 17 — applying a template is now possible, not just curating one

A template can now actually be applied: at provisioning via an optional
`templateKey`, and to an already-provisioned tenant via a new audited
platform-admin action, `POST /admin/tenants/:id/apply-template` (mirrors the
existing `PATCH /:id/capabilities` pattern — same `authenticateAdmin` gate,
same before/after audit snapshot). Both paths share one materializer so they
cannot compute `{mode, enabled, disabled}` differently. Non-destructive per
ADR 0008/0019: a settings write only, no data migration, switching back
restores access.

## Authoritative Sources

- `docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md`
  (2026-08-09 Amendment)
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0039-adr-lifecycle-strictness-tiers-and-amendment-path.md`
- `docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md`
- `docs/features/STORE_TEMPLATES_AND_PROFILES.md`
- GitHub issue #178
