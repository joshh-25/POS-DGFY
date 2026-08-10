---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-12
last_reviewed: 2026-08-12
review_by: 2027-02-12
applies_to: registration, templates, admin
topic: registration_industry_catalog
---

# ADR 0058: Registration Industry Catalog

## Status

Accepted (2026-08-12).

## Context

Issue #178 built three layers for what a merchant can become on DGFY:
Capability Modules (real features, code-owned), Workflow Modes (the base
transaction-lifecycle shape, code-owned), and Store Templates (curated
bundles of Capability Modules, DB-driven and admin-creatable since Phase
14). The registration Industry catalog — the list a merchant actually
picks from at `/business/grow` — stayed the odd one out: a hardcoded
constant, `REGISTRATION_INDUSTRIES`
(`packages/shared-constants/src/registrationIndustries.js`). Adding a new
industry, or hiding one from signup without a developer, required a code
change and a PR. Issue #178 Phase 39 added an admin **hide/show** toggle
over the 11 hardcoded entries, but an admin still could not author a
wholly new industry entry.

Issue #316 closes that gap: `REGISTRATION_INDUSTRIES` is demoted from the
runtime catalog to its **seed baseline and fail-open fallback**, and a new
landlord table, `registration_industries`, becomes the DB-driven
authority — seeded from the constant on deploy (idempotent, never
overwriting an admin edit), curated through an admin CRUD API, and read by
every signup surface via the existing public catalog endpoint.

This mirrors ADR 0057 clause 1's own convention almost exactly, and
explicitly departs from it for this one constant: ADR 0057 names
`registrationIndustries.js` as one of four exemplars of "shared,
engineering-owned constant, not a database concept." This ADR is that
amendment's counterpart for the Industry catalog specifically — the
`describeRegistrationIndustry`/`withEngineClassification` derivation
functions and the constant's shape are unchanged; only its role changes,
from source-of-truth to seed source.

Two things this issue does **not** touch, by design: Capability Modules
and Workflow Modes remain entirely code-owned (ADR 0056 clause 3). A
registration industry is a *composition* — it names an existing mode and
an existing (already admin-creatable, per ADR 0056) template — never a new
primitive. An admin authoring a new business type combines two things that
already exist: pick a mode, author or reuse a template, then author the
industry entry that surfaces the pairing at signup. No code ships for a
new business type unless it requires a genuinely new transaction-lifecycle
shape (new page mechanics) — which remains, correctly, engineering work.

## Decision

1. **The registration Industry catalog is database-owned.** `[binding]`
   `registration_industries` (landlord-only; see
   `backend/src/models/Landlord/RegistrationIndustry.js`) is the runtime
   source for every signup surface and the admin curation UI. The
   `REGISTRATION_INDUSTRIES` constant is seeded into that table on deploy
   (migration `20260812000002-seed-registration-industries.cjs`,
   idempotent per key) and thereafter serves only as: (a) the seed
   baseline, and (b) the fail-open fallback the read and write paths
   already used for every other landlord-DB lookup in this feature area
   (`listRegistrationIndustriesUseCase`, `registerCompanyRequestUseCase`).
   This is a deliberate, explicit departure from ADR 0057 clause 1's
   listing of `registrationIndustries.js` as a shared-constant exemplar —
   noted there is superseded by this ADR for that one constant only; the
   other three exemplars (`workflowModes.js`, `capabilityModules.js`,
   `fulfillmentProfiles.js`) are untouched.
2. **A catalog row composes only engineering-owned vocabulary; it may
   never introduce it.** `[binding]` `workflow_mode` is validated against
   the code-owned, de-aliased `WORKFLOW_MODE_VALUES` enum
   (`packages/shared-constants/src/workflowModes.js`) — the column itself
   is a plain string, deliberately not a database ENUM, so the vocabulary
   never becomes something the database defines. `template_key` is null
   iff the mode's engine classification is `external`; otherwise it must
   reference an existing `store_configuration_templates` row with
   `status: 'published'` and a matching `base_mode`. This keeps every
   admin-authored industry inside ADR 0056 clause 3's boundary — the same
   clause that already governs Store Templates — by construction, not by
   convention: `adminRegistrationIndustryUseCases.js`'s
   `validateModeAndTemplate()` enforces it server-side on every create and
   edit.
3. **Seeded (baseline) rows are undeletable and mode-immutable; no row of
   any kind can be hard-deleted.** `[binding]` `is_system: true` (set only
   by the seed migration, never by the admin API) marks the 11 baseline
   industries. On a system row, `industry_key` and `workflow_mode` can
   never change; `label`, `summary`, `niches`, `display_order`,
   `template_key`, and `hidden` remain fully editable. No route in
   `adminRegistrationIndustries.js` performs a delete — matching the
   precedent already set for Store Templates (which also has no DELETE
   endpoint). `hidden` is the sole removal-from-merchant-view mechanism.
   Genuine delete/archive semantics are explicitly out of scope for this
   decision and are tracked as future work (see Consequences).
4. **Every write is actor- and reason-audited.** `[binding]` Create,
   update, hide, and unhide all require a non-empty actor username and a
   reason of at least 3 characters, and each is recorded in
   `registration_industry_audit_logs` with a before/after snapshot —
   reusing the exact pattern ADR 0056 clause 6 already established for
   Store Template curation (itself inherited from tenant capability
   audit-logging). No new authorization model is introduced.

## Consequences

- **Positive.** Adding a new registration-reachable business type — the
  concrete example the issue was filed against ("Micro-Service / Massage &
  Wellness") — is now an admin action: pick or author a template, then
  author the industry entry. No code change, no PR, no redeploy. Editing a
  baseline industry's copy (label, summary, niches) or repointing it at a
  different published template is likewise an admin action.
- **Negative / deferred.** No hard-delete exists for any row (clause 3) —
  an admin-created industry can only ever be hidden, never removed
  outright. This is deliberate for this decision (matching the Store
  Template precedent) but is flagged as a real gap if the catalog grows
  large enough that stale hidden rows become noise; a delete/archive
  affordance is future work, not authorized here. Hierarchical grouping of
  industries (e.g. Food & Beverage → Full-service / Micro F&B) remains an
  unbuilt roadmap sketch (`docs/features/INDUSTRY_CLASSIFICATION.md`),
  unaffected by this decision either way.
- **Reversible.** The seed migration's `down()` removes only the rows it
  would have inserted (`is_system = 1`, matching the constant's keys); an
  admin-created row is never touched by it. The fold migration
  (`20260812000003-fold-registration-industry-visibility.cjs`) and the
  Phase 39 store's drop migration
  (`20260812000004-drop-registration-industry-visibility.cjs`) both ship
  `down()` implementations, the latter reconstructing (best-effort, not an
  exact restore) the Phase 39 visibility table from
  `registration_industries` if ever needed.

## Related

- ADR 0056 (Store Configuration Templates and Profiles) — clause 3 is the
  governing constraint this ADR's clause 2 enforces for the Industry
  catalog specifically; clause 6's audited-write pattern is reused
  verbatim (clause 4 above).
- ADR 0057 (Services Fulfillment Profiles) — clause 1 named
  `registrationIndustries.js` as a shared-constant exemplar; this ADR is
  the explicit, scoped amendment to that listing for the Industry catalog
  only.
- `docs/development/STORE_TEMPLATES_HANDOFF.md` §5 — the registration
  Industry catalog's mechanics, updated for the DB-driven cutover.
- `docs/features/INDUSTRY_CLASSIFICATION.md` — the merchant-facing
  classification reference and the hierarchical-grouping roadmap sketch.
- Issues #178 (Store Templates & Profiles) and #316 (this decision's
  tracking issue).
