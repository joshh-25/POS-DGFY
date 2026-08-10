---
status: reference
owner: engineering
last_reviewed: 2026-08-09
declaration_id: 2026-08-11-registration-industry-visibility
classification: regulatory
surfaces: settings,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.09
verification_evidence: registrationIndustries.transport.test.js,registerCompanyRequestUseCase.registrationIndustry.test.js,adminRegistrationIndustries.transport.test.js,adminRegistrationIndustryUseCases.test.js,runtimeSchemaAuditService.test.js,IndustrySelect.test.jsx,RegisterCompanyLoginHandoff.test.jsx,StorefrontBusinessGrowPage.test.jsx,IndustryPicker.test.jsx,StoreTemplateManager.registrationIndustries.integration.test.jsx,TenantManager.assistedProvisioning.integration.test.jsx,check:architecture
rollback_note: Drop the two new landlord tables (registration_industry_visibility, registration_industry_visibility_audit_logs) via the migration's down() -- both are additive with no foreign keys into any existing table, and row absence already means "visible" so dropping them returns every industry to fully visible with zero data loss elsewhere. Revert the hidden-flag addition in listRegistrationIndustriesUseCase.js and the hidden_industry_key rejection block in registerCompanyRequestUseCase.js -- both are wrapped in their own try/catch and default to the pre-change behavior (no hidden field, no rejection) if the visibility repository is absent or errors, so a partial rollback (route/handlers reverted, migration left in place) is also safe. Revert the new admin route/validator/use-case/handler/repository files and their server.js mount -- none are referenced by any other module.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-09T00:00:00+08:00
preflight_request_ref: STORE-TEMPLATES-REGISTRATION-VISIBILITY-20260811
---

# Registration Industry Visibility — Admin Show/Hide + Merchant UX Rework (issue #178 follow-up, Phases 38-41)

## Compliance Impact Classification

Regulatory, per the classification matrix's floor for
`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`
(`scripts/check-compliance-impact.js`), which carries an explicit
`regulatory` rule with the `settings,compliance` surfaces regardless of
which part of the file changes. This is the same stacked-PR posture as the
`2026-08-09-registration-industry-templates` declaration: a new declaration
is filed here rather than amending that one, since amending it would
entangle two independent rollback stories (Phases 31-34's template-linkage
work vs. this phase's visibility-toggle work) under one declaration.
`surfaces` is declared as `settings,pos,terminal,compliance` — a strict
superset of what this phase's own files require — matching the sibling
declarations' convention so it stays correct regardless of which base ref
the eventual PR is diffed against.

No fiscal, VAT, payment, or receipt logic is touched. This phase adds two
new, additive-only landlord tables (no tenant-database schema change, no
migration touching any tenant-scoped table) and a `hidden_industry_key`
rejection branch that fails OPEN on any lookup error — a landlord-DB outage
degrades to "every industry visible", never to "registration blocked".

## Affected Surfaces

1. **Registration write path** (`registerCompanyRequestUseCase.js`,
   regulatory floor). Gains an optional injected
   `registrationIndustryVisibilityRepository` dependency and one new
   rejection branch: an `industryKey` an admin has hidden from registration
   is rejected with a 400 (`hidden_industry_key`), inserted after the
   existing `unknown_industry_key`/`industry_workflow_mode_conflict`
   checks and before any database write. Absent the dependency, or on any
   lookup failure, the check is skipped entirely (fail-open) — byte-identical
   to pre-Phase-39 behavior. This is additive only: no existing rejection
   path, field, or payload shape changes.
2. **New landlord-only tables** (`registration_industry_visibility`,
   `registration_industry_visibility_audit_logs`; migration
   `20260811000001-create-registration-industry-visibility.cjs`). Not
   independently compliance-sensitive (no file under a matched pattern),
   but part of the same write surface: a row's absence means "visible" —
   only a deliberate admin hide/unhide creates or updates a row, always
   with an actor and a reason, audited in the sibling table. Neither table
   is cloned into any tenant database (`NON_TENANT_MODEL_EXPORTS`).
3. **New admin API** (`GET/PATCH /api/v1/admin/registration-industries*`,
   `backend/src/routes/adminRegistrationIndustries.js` — not itself matched
   by a compliance-sensitivity rule). Gated by the same `authenticateAdmin`
   middleware as `adminTemplates.js`; every visibility write requires a
   human-readable reason (min 3 characters, same convention as template
   publish/deprecate) and is unconditionally audited with a before/after
   snapshot, except a same-state toggle, which is treated as an idempotent
   no-op and writes no new audit row (mirroring
   `buildPublishTemplateUseCase`'s existing idempotency pattern).
4. **Public catalog endpoint** (`GET /api/v1/registration/industries`,
   already declared under the prior registration-industry declaration).
   Gains a `hidden: boolean` field per entry; the response array is never
   shortened — a hidden industry stays present, flagged, so a network
   failure that falls back to the frontend's local catalog constant (which
   carries no `hidden` field at all) fails open to "show everything" rather
   than silently un-hiding a deliberately hidden industry through omission.
5. **Merchant-facing signup surfaces** (`StorefrontBusinessGrowPage.jsx`,
   `RegisterCompany.jsx` — neither independently compliance-sensitive).
   The Phase 33 card-based Industry picker is replaced with a dropdown
   (`IndustrySelect.jsx`) that filters out any `hidden: true` entry and
   drops all engine-classification display (native/transitional/external
   badges and notes) — that distinction is admin-surface-only as of this
   phase. Submitted payload shape (`industryKey`, `industryTag`) is
   unchanged.
6. **Admin curation UI** (`frontend/Pages/admin/StoreTemplateManager.jsx`,
   `frontend/src/services/adminService.js` — `adminService.js` carries the
   `settings,compliance` regulatory floor independently, already covered
   by the `2026-08-09-registration-industry-templates` declaration's
   presence in this branch's history). A new "Registration industries"
   panel lists all 11 industries with live visibility state and a
   Hide/Show action using the existing publish/deprecate `window.prompt`
   reason convention; three new read-only wrappers added to
   `adminService.js` alongside the existing template ones. The admin-only
   `IndustryPicker.jsx` (TenantManager's assisted-provisioning consumer)
   gains a data-driven "Hidden from registration" badge — no new prop, no
   change to `TenantManager.jsx` itself, since the public catalog response
   already carries `hidden` per Affected Surface 4 above.
7. **POS/terminal surface — unaffected, declared defensively.** No file
   under `frontend/src/features/pos/` or the POS/terminal request path is
   touched. `pos`/`terminal` are declared solely because this declaration's
   `surfaces` field is deliberately a superset (see Classification section
   above); nothing in items 1-5 changes POS checkout, pricing, or receipt
   behavior.

## Compliance Preconditions

1. No fiscal, VAT, payment, or receipt logic is touched anywhere in this
   phase — entirely within the registration-funnel visibility/curation
   surface.
2. Every visibility write is actor- and reason-required, exactly mirroring
   the existing template curation pattern (`requireActorUsername`/
   `requireReason` in `storeConfigurationTemplateUseCases.js`), and is
   audited with before/after snapshots — proven by
   `adminRegistrationIndustryUseCases.test.js`.
3. Both the catalog-read `hidden` flag and the registration-write
   `hidden_industry_key` rejection fail OPEN on any landlord-DB error —
   proven by dedicated fail-open test cases in
   `registrationIndustries.transport.test.js` and
   `registerCompanyRequestUseCase.registrationIndustry.test.js`. A
   landlord-DB outage never blocks or reshapes registration.
4. The public catalog response never shortens its 11-entry array —
   `hidden` is metadata for the client to filter on, not an omission —
   proven by `registrationIndustries.transport.test.js`'s explicit
   length-11 assertions on both the hidden and fail-open cases.
5. The admin assisted-provisioning surface (`TenantManager.jsx`) sends
   `workflowMode`/`templateKey` directly, never `industryKey`, so the new
   `hidden_industry_key` rejection cannot affect it by construction —
   admins can always provision any industry type regardless of its
   registration-visibility state.
6. `buildStoreProfile()` and its 11 golden equivalence snapshots
   (`storeProfile.equivalence.contract.test.js`) are unmodified —
   `STORE_PROFILE_VERSION` stays at 5. `registrationIndustries.contract.test.js`
   (the constants-level catalog contract) is unmodified — visibility is
   database state, not a catalog edit.

## Verification Evidence

1. `backend/tests/registrationIndustries.transport.test.js` — extended
   with two new cases: admin-hidden industries flagged `hidden: true`
   without shortening the response array, and fail-open to `hidden: false`
   on every entry when the visibility lookup fails outright.
2. `backend/tests/registerCompanyRequestUseCase.registrationIndustry.test.js`
   — extended with a `describe` block covering the hidden-key rejection
   (with an explicit assertion on the exact key `isHidden()` is called
   with), the fail-open-on-lookup-error case, and the
   dependency-not-injected backward-compatibility case.
3. `backend/tests/adminRegistrationIndustries.transport.test.js` (new) —
   the auth gate, the Joi validator's reason/boolean requirements, and the
   `industryKey` route param reaching the handler intact.
4. `backend/tests/adminRegistrationIndustryUseCases.test.js` (new) — actor/
   reason requirements, 404 on an unknown key, the hide→unhide audit trail
   with before/after snapshots, and the same-state idempotency short-circuit.
5. `backend/tests/runtimeSchemaAuditService.test.js` — extended with the
   new migration filename in `REQUIRED_RUNTIME_MIGRATIONS`'s mock; the two
   failures present in this suite (`returns healthy when required
   migrations and columns are present`, `reports warnings for optional
   columns without degrading healthy required checks`) are confirmed
   pre-existing — reproduced identically with this phase's changes to the
   file fully reverted via `git stash`.
6. `npm run check:architecture` — clean (47 modules, 459 code files; no
   unauthorized model imports; the new `registrationIndustryVisibilityRepository.js`
   is the `registration` module's first `repositories/` directory, the
   only place the architecture guardrail permits a model import).
7. Full backend Jest suite not run (hangs without MySQL in this sandbox) —
   targeted pattern sweeps used per the repository's established
   convention; no test outside the files listed above references any file
   this phase touches.
8. `frontend/src/features/registration/__tests__/IndustrySelect.test.jsx`
   (new) — the dropdown/modal UX, hidden-entry filtering, fail-open on the
   raw local-constant fallback, and a genuine-regression pin proving no
   engine-classification text renders anywhere (reverted/confirmed-failing/
   restored).
9. `frontend/Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx` and
   `frontend/apps/store/src/business/pages/StorefrontBusinessGrowPage.test.jsx`
   — updated for the select-based interaction; submitted payload
   assertions (`industryKey`, no raw `workflowMode`) unchanged.
10. `frontend/src/features/registration/__tests__/IndustryPicker.test.jsx`
    — extended for the "Hidden from registration" badge and continued
    selectability of a hidden entry.
11. `frontend/src/pages/__tests__/StoreTemplateManager.registrationIndustries.integration.test.jsx`
    (new) — the admin panel's list rendering, hide-reason/actor display,
    and the prompt-confirm/cancel/too-short-reason paths.
12. `frontend/src/pages/__tests__/TenantManager.assistedProvisioning.integration.test.jsx`
    — extended to close the coverage gap noted since Phase 33: selecting
    an industry via `IndustryPicker` now has an explicit assertion that it
    derives `workflowMode`/`templateKey` and sends no `industryKey`. This
    file's pre-existing "Refresh" button duplication failure (unrelated to
    this phase) reproduces identically against the pre-Phase-40 version of
    the file — confirmed via `git stash`.
13. `npx vite build` succeeded for both `frontend/` and
    `frontend/apps/store/` after every frontend-touching phase (38, 40).
