# Templates Module

Landlord-DB-only: the curated Store Template catalog (issue #178 Phase 13,
`docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`).

A `StoreConfigurationTemplate` is a versioned, curated bundle of Capability
Module keys (`packages/shared-constants/src/capabilityModules.js`). It
materializes into a tenant's own Store Profile
(`packages/shared-constants/src/storeProfile.js`, `ops_store_profile`
tenant setting) once, at provisioning time, and is never read again to
determine a live tenant's effective configuration
(ADR 0056 clause 2 — `[binding]`).

Flow:

`Tenant provisioning -> templates.findPublishedCanonicalForMode ->
buildStoreProfile + applyTemplateProvenance -> persisted once`

`Future curation surface (Phase 14) -> template use cases -> repository ->
landlord models`

## Rules

- `StoreConfigurationTemplate`/`StoreConfigurationTemplateModule` are
  landlord models, registered in `NON_TENANT_MODEL_EXPORTS`
  (`backend/src/utils/tenantModelFactory.js`) — never cloned into a tenant
  database.
- A template's module list is only editable while `status = 'draft'`.
  Publishing freezes it; to change a published template's content, deprecate
  it and create a new one. This is what makes "editing a published template
  changes zero existing tenants' Profiles" true by construction rather than
  by convention.
- Publishing validates the module selection against
  `validateModuleSelection()` (requires/conflicts graph, no `planned`
  modules) — the same validator `capabilityModules.contract.test.js` already
  pins.
- The canonical preset of a base mode (`is_preset: true`) must carry exactly
  that mode's own capability list, so materializing it is provably
  behavior-identical to the mode itself.
- `seedCanonicalTemplatePresetsUseCase` materializes
  `STORE_TEMPLATE_PRESETS` into rows once; re-running it never overwrites an
  existing `template_key`.

See `docs/features/STORE_TEMPLATES_AND_PROFILES.md`.
