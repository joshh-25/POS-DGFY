# Registration Module

Public, pre-tenant-context module: serves the merchant-facing registration
Industry catalog (issue #178 Phases 31-33; made DB-driven by issue #316,
ADR 0058, `docs/features/STORE_TEMPLATES_AND_PROFILES.md`, "Registration
Industry layer").

`registration_industries` (a landlord-only table; see
`backend/src/models/Landlord/RegistrationIndustry.js`) is the runtime
catalog — one row per offered industry, `{ industry_key, label, summary,
niches, workflow_mode, template_key, display_order, hidden, is_system }`.
It is seeded on deploy from
`REGISTRATION_INDUSTRIES` (`packages/shared-constants/src/registrationIndustries.js`,
DGFY's own business-niche classification guide,
`docs/features/INDUSTRY_CLASSIFICATION.md`) via an idempotent migration
that never overwrites an admin edit. The constant is now the seed baseline
and fail-open fallback only — not the runtime source.

This module joins the catalog against the *live* landlord template catalog
(`templates` module's `storeConfigurationTemplateRepository`) so a
degraded (missing/unpublished) template shows as `template_key: null`
rather than erroring — mode-only registration, identical to the platform's
pre-existing fallback behavior.

Flow:

`GET /api/v1/registration/industries -> registrationIndustryHandlers ->
listRegistrationIndustriesUseCase -> registrationIndustryRepository.findAll()
(DB-first, fail-open to REGISTRATION_INDUSTRIES) +
storeConfigurationTemplateRepository.findByKey (live status check)`

Admin curation (create/edit/hide/unhide) flows through
`adminRegistrationIndustryHandlers -> adminRegistrationIndustryUseCases ->
registrationIndustryRepository`, behind `authenticateAdmin`
(`backend/src/routes/adminRegistrationIndustries.js`).

## Rules

- **Public read: no auth, no tenant context.** Mounted in `server.js`
  *before* `app.use(tenantHandler)`, alongside `geoSearchRoutes` — the
  catalog is public marketing-grade information consumed by all three
  signup surfaces (`/business/grow`, `/register-company`, the admin
  assisted-provisioning panel), which each authenticate differently or not
  at all at this point in their flow.
- **Admin write: `authenticateAdmin`, actor + reason required on every
  write, audited.** `registration_industry_audit_logs` records every
  create/update/hide/unhide with a before/after snapshot — the same
  audited-write pattern ADR 0056 clause 6 established for Store Template
  curation.
- **A catalog row composes only engineering-owned vocabulary; it never
  introduces it.** `workflow_mode` is validated against the code-owned
  `WORKFLOW_MODE_VALUES` enum; `template_key` must reference an existing,
  published `store_configuration_templates` row with a matching
  `base_mode`, or be null iff the mode's engine is `external` — enforced
  server-side in `adminRegistrationIndustryUseCases.js`'s
  `validateModeAndTemplate()` (ADR 0056 clause 3, ADR 0058 clause 2).
- **Seeded (baseline) rows are protected.** `is_system: true`, set only by
  the seed migration. `industry_key` and `workflow_mode` are immutable on
  those rows; `label`, `summary`, `niches`, `display_order`,
  `template_key`, and `hidden` stay editable. No route hard-deletes any
  row, seeded or admin-created — `hidden` is the only removal-from-
  merchant-view mechanism (ADR 0058 clause 3).
- **Never throws.** `listRegistrationIndustriesUseCase` catches a catalog
  or template lookup failure internally and degrades gracefully (constant
  fallback / `template_key: null`) rather than failing the whole response;
  the registration write path (`registerCompanyRequestUseCase.js`) does
  the same for its own resolution. Registration must never be blocked by
  this module being unavailable — the frontend's `registrationIndustryService.js`
  additionally falls back to the local `REGISTRATION_INDUSTRIES_DESCRIBED`
  constant on any fetch failure.
- Adding a new industry is now an **admin action** through the
  "Registration industries" panel (`StoreTemplateManager.jsx`) — not a
  constant edit. `backend/tests/registrationIndustries.contract.test.js`
  still pins the seed baseline's own internal consistency, but no longer
  describes the live catalog's shape. See
  `docs/development/STORE_TEMPLATES_HANDOFF.md` §5.
