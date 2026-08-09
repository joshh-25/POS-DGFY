---
status: reference
owner: engineering
last_reviewed: 2026-08-09
declaration_id: 2026-08-09-registration-industry-templates
classification: regulatory
surfaces: settings,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.09
verification_evidence: registrationIndustries.contract.test.js,registrationIndustries.transport.test.js,registerCompanyRequestUseCase.registrationIndustry.test.js,approveTenantUseCase.storeTemplateKey.test.js,tenantProvisioningStoreProfileProvenance.test.js,capabilityModules.contract.test.js,storeProfile.equivalence.contract.test.js,RegisterCompanyLoginHandoff.test.jsx,StorefrontBusinessGrowPage.test.jsx,IndustryPicker.test.jsx,registrationIndustryService.test.js,TenantManager.assistedProvisioning.integration.test.jsx,check:architecture
rollback_note: Revert registerCompanyRequestUseCase.js's industryKey derivation block (the industryKeyUnresolvable/industryModeConflict rejections and the resolved workflow_mode/store_template_key), approveTenantUseCase.js's extractStoreTemplateKeyFromTenant and the templateKey argument it now passes to provisionTenant, companyRegistrationRepository.js's registrationIndustry/storeTemplateKey persistence, the new GET /api/v1/registration/industries route/controller/use case, and the IndustryPicker/registrationIndustryService frontend module together with the three signup-surface wirings (StorefrontBusinessGrowPage.jsx, RegisterCompany.jsx, TenantManager.jsx) -- verified and reviewed as one batch. Each falls back to its pre-change behavior (registration accepts only a raw workflowMode again; approval provisions from canonical-template fallback only, exactly as before Phase 17's templateKey parameter was ever threaded through; the three signup surfaces show the raw Operating Mode <select> again) -- no data migration, no schema change, nothing to unwind. The new registrationIndustries.js shared constant and its contract test are additive and inert if unreferenced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-09T00:00:00+08:00
preflight_request_ref: STORE-TEMPLATES-REGISTRATION-INDUSTRY-20260809
---

# Registration Industry Catalog — Templates Become the Registration Choice (issue #178 follow-up, Phases 31-33)

## Compliance Impact Classification

Regulatory, per the classification matrix's floor for
`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js` and
`frontend/Pages/admin/TenantManager.jsx` (`scripts/check-compliance-impact.js`),
both of which carry an explicit `regulatory` rule with the `settings,compliance`
surfaces regardless of which part of either file changes. This is a new
branch/PR stacked on PR #311's head, so the two existing Phase 17/24/28-30
declarations (`2026-08-09-store-template-writepath-hardening.md`,
`2026-08-09-store-template-curation-hardening.md`) do not automatically
cover it once this work lands in a PR of its own — `check-compliance-impact.js`
validates every declaration present in a PR's diff against the union of
surfaces across that diff's own sensitive files, and a separate PR's diff
will not carry those two files forward. `surfaces` is declared as
`settings,pos,terminal,compliance` (matching the two existing declarations,
a strict superset of what this phase's own files require) so this
declaration remains correct regardless of which base ref the eventual PR is
diffed against — full-stack (`develop`) or incremental (PR #311's branch).

No fiscal, VAT, payment, or receipt logic is touched. This closes a
previously-known gap (documented as deferred in ADR 0037/0056 and
`STORE_TEMPLATES_HANDOFF.md`): the organic registration funnel never
forwarded a `templateKey` to provisioning, so every signup fell back to the
canonical (mode-only) template regardless of which business niche a
merchant actually ran. The fix is entirely within the same
`ops_workflow_mode` / `ops_store_profile` / template-provisioning surface
issue #178 has governed since Phase 6 — no new setting key, table, or
provisioning code path is introduced; an existing, already-validated
parameter (`templateKey`, live since Phase 17's admin-provisioning use case)
is now also populated from the organic signup flow.

## Affected Surfaces

1. **Registration write path** (`registerCompanyRequestUseCase.js`, regulatory
   floor). Accepts a new optional `industryKey`. When present and valid, the
   server — never the client — derives `workflow_mode` and
   `store_template_key` from the new `REGISTRATION_INDUSTRIES` shared
   constant (`packages/shared-constants/src/registrationIndustries.js`); the
   client cannot request an arbitrary `templateKey` directly, only an
   `industryKey` that resolves through this server-owned catalog. An
   `industryKey` that fails to resolve, or that conflicts with an explicit
   `workflowMode` also present in the same request, is rejected with a 400
   rather than silently resolved. When `industryKey` is absent, the existing
   `workflowMode` path is byte-identical to pre-Phase-31 behavior — no
   existing client or test is affected. The derived values are persisted
   into the pending `Tenant` row's settings JSON and into the immutable
   `CompanyRegistrationAttempt.submission_snapshot` audit record
   (`companyRegistrationRepository.js`, not independently
   compliance-sensitive, but part of the same write).
2. **Approval path** (`approveTenantUseCase.js`, not independently
   compliance-sensitive but part of the same provisioning flow). Adds
   `extractStoreTemplateKeyFromTenant(tenant)`, mirroring the existing
   `extractWorkflowModeFromTenant`, and forwards the resolved `templateKey`
   into the pre-existing `provisionTenant({...})` call. This is the one-line
   change that makes a registration industry's chosen template actually take
   effect: `resolveProvisioningTemplateSelection` (unchanged, Phase 17)
   already validates the template's published status and mode-match, and
   already falls back to the canonical template on any mismatch or lookup
   failure — this phase only ensures a real `templateKey` reaches that
   existing, already-governed validation instead of always being `null`
   coming from an organic signup.
3. **New public read endpoint**, `GET /api/v1/registration/industries`
   (`backend/src/routes/registration.js`, not itself matched by a
   compliance-sensitivity rule — mounted before the tenant-resolution
   middleware alongside `geoSearchRoutes`, same pattern). Returns the
   registration Industry catalog joined against live template
   publish-status; a missing/unpublished template or a landlord-DB failure
   degrades the entry to `template_key: null` (mode-only registration,
   identical to today's behavior) rather than erroring. No write capability,
   no tenant-scoped data, behind the existing registration rate limiter.
4. **TenantManager.jsx** (regulatory floor, admin assisted-provisioning
   panel). The raw `workflowMode` `<select>` is replaced by the shared
   `IndustryPicker` component; selecting an industry now also sets
   `templateKey`, which both assisted-provisioning payload branches
   (`account_company` and `company`) now forward to the same
   `createAdminProvisionedTenant`/`createAdminProvisionedAccountAndTenant`
   endpoints Phase 17 already wired `templateKey` into — no new endpoint, no
   new payload field the backend didn't already accept and validate.
5. **Two merchant-facing signup surfaces** (`StorefrontBusinessGrowPage.jsx`,
   `RegisterCompany.jsx` — neither independently compliance-sensitive).
   Replace the same `<select>` with `IndustryPicker` and now require an
   `industryKey` before submitting; both post `industryKey` (and
   `industryTag`) instead of a raw `workflowMode`, matching item 1's server
   contract exactly.
6. **POS/terminal surface — unaffected, declared defensively.** No file
   under `frontend/src/features/pos/` or the POS/terminal request path is
   touched by this phase. `pos`/`terminal` are declared solely because this
   declaration's `surfaces` field is deliberately a superset (see
   Classification section above) to stay correct across possible diff
   bases; nothing in items 1-5 changes POS checkout, pricing, or receipt
   behavior.

## Compliance Preconditions

1. No fiscal, VAT, payment, or receipt logic is touched anywhere in this
   phase — entirely within the registration/provisioning settings surface.
2. The client can never supply a raw `templateKey` at registration — only an
   `industryKey`, resolved exclusively against the server-owned
   `REGISTRATION_INDUSTRIES` constant (contract-tested to only ever resolve
   to a `published` preset whose `base_mode` matches the derived
   `workflow_mode` — `registrationIndustries.contract.test.js`). This
   preserves the same trust boundary Phase 17's admin-only `templateKey`
   parameter already established; it is not weakened by adding a second,
   narrower caller.
3. `resolveProvisioningTemplateSelection`'s existing validation and
   canonical-fallback behavior (Phase 6/17, unchanged by this phase) is the
   single choke point both the admin-provisioning and organic-registration
   paths now share — there is no second, independent code path that could
   diverge from it.
4. A tenant registered before this change (no `industryKey`/`templateKey` in
   settings) forwards `templateKey: null` on approval and provisions exactly
   as it always has — proven by
   `approveTenantUseCase.storeTemplateKey.test.js`'s explicit
   backward-compatibility case.
5. `buildStoreProfile()` and its 11 golden equivalence snapshots
   (`storeProfile.equivalence.contract.test.js`) are unmodified by this
   phase — `STORE_PROFILE_VERSION` stays at 5.
6. External-engine registration industries (healthcare, ticketing/transport,
   logistics/distribution, education/institutions) resolve to
   `template_key: null` and provision exactly as a mode-only registration
   always has — contract-pinned as an exact-equivalence relationship
   (`entry.workflow_mode` has `engine: 'external'` if and only if
   `template_key` is `null`), not an incidental property.

## Verification Evidence

1. `backend/tests/registrationIndustries.contract.test.js` (9 tests) — mode
   membership/coverage, `template_key` ↔ `base_mode` pairing, the
   reachable-XOR-excluded preset accounting, the external-mode ↔
   null-`template_key` equivalence, and the `micro_fnb` ↔
   `fnb_counter_service` proof (industry #05, "Micro Food & Beverage", the
   concrete case this phase makes reachable at registration for the first
   time).
2. `backend/tests/registrationIndustries.transport.test.js` (4 tests) — the
   catalog endpoint's shape, the unpublished-template degradation, and the
   landlord-failure fallback.
3. `backend/tests/registerCompanyRequestUseCase.registrationIndustry.test.js`
   (6 tests) and `backend/tests/approveTenantUseCase.storeTemplateKey.test.js`
   (4 tests) — `industryKey` derivation, the 400 rejections, the settings/
   submission-snapshot persistence, `templateKey` forwarding on approval, and
   the pre-existing-tenant backward-compatibility case.
4. `backend/tests/tenantProvisioningStoreProfileProvenance.test.js` — the
   `micro_fnb` → `fnb_counter_service` subtractive-overlay proof end to end
   (`profile.pos_workflow.mode === 'counter'`, `tableService`/
   `kitchenQueue`/`restaurantServiceCharge` absent from the effective
   module set).
5. `backend/tests/capabilityModules.contract.test.js` and
   `backend/tests/storeProfile.equivalence.contract.test.js` — unmodified,
   confirming zero drift to the capability catalog or the Store Profile's
   11 golden snapshots.
6. Frontend: `frontend/Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`,
   `frontend/apps/store/src/business/pages/StorefrontBusinessGrowPage.test.jsx`,
   `frontend/src/features/registration/__tests__/IndustryPicker.test.jsx`,
   `frontend/src/features/registration/__tests__/registrationIndustryService.test.js`,
   and `frontend/src/pages/__tests__/TenantManager.assistedProvisioning.integration.test.jsx`
   — all green; every touched/new assertion proven a genuine regression via
   revert (`git stash` the component) → fail → restore → pass.
7. `npm run check:architecture` — clean (no unauthorized model imports, no
   controller/model boundary violation introduced by the new `registration`
   module or the `IndustryPicker`/`registrationIndustryService` frontend
   feature).
8. Full backend Jest suite not run (hangs without MySQL in this sandbox) —
   targeted pattern sweeps used per the repository's established
   convention; no test outside the files listed above references any file
   this phase touches.
