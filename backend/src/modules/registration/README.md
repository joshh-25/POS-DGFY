# Registration Module

Public, pre-tenant-context module: serves the merchant-facing registration
Industry catalog (issue #178 Phases 31-33,
`docs/features/STORE_TEMPLATES_AND_PROFILES.md`, "Registration Industry
layer").

`REGISTRATION_INDUSTRIES` (`packages/shared-constants/src/registrationIndustries.js`)
is the code-owned catalog — DGFY's own business-niche classification guide
(`docs/features/INDUSTRY_CLASSIFICATION.md`), transcribed into entries of
`{ label, summary, niches, workflow_mode, template_key }`. This module joins
that constant against the *live* landlord template catalog
(`templates` module's `storeConfigurationTemplateRepository`) so a
degraded (missing/unpublished) template shows as `template_key: null`
rather than erroring — mode-only registration, identical to the platform's
pre-existing fallback behavior.

Flow:

`GET /api/v1/registration/industries -> registrationIndustryHandlers ->
listRegistrationIndustriesUseCase -> describeRegistrationIndustry (per key)
+ storeConfigurationTemplateRepository.findByKey (live status check)`

## Rules

- **No auth, no tenant context.** Mounted in `server.js` *before*
  `app.use(tenantHandler)`, alongside `geoSearchRoutes` — the catalog is
  public marketing-grade information consumed by all three signup surfaces
  (`/business/grow`, `/register-company`, the admin assisted-provisioning
  panel), which each authenticate differently or not at all at this point
  in their flow.
- **Read-only.** This module never writes. The write side of "an industry
  becomes a tenant's workflow_mode/template" lives in
  `backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`
  (resolves `industryKey` -> `{workflow_mode, store_template_key}` at
  registration) and `approveTenantUseCase.js` (forwards the resolved
  `templateKey` into provisioning at approval).
- **Never throws.** `listRegistrationIndustriesUseCase` catches any
  per-entry template lookup failure internally and degrades that entry's
  `template_key` to `null` rather than failing the whole response; a
  landlord-DB outage degrades the entire response the same way. Registration
  must never be blocked by this endpoint being unavailable — the frontend's
  `registrationIndustryService.js` additionally falls back to the local
  `REGISTRATION_INDUSTRIES_DESCRIBED` constant on any fetch failure.
- The catalog itself is never mutated here — adding an industry is a
  constant edit in `packages/shared-constants/src/registrationIndustries.js`,
  pinned by `backend/tests/registrationIndustries.contract.test.js`. See
  `docs/development/STORE_TEMPLATES_HANDOFF.md` §5, "The registration
  Industry catalog".
