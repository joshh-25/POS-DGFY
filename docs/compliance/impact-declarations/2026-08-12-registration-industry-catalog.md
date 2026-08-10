---
status: reference
owner: engineering
last_reviewed: 2026-08-12
declaration_id: 2026-08-12-registration-industry-catalog
classification: regulatory
surfaces: settings,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.09
verification_evidence: registrationIndustries.contract.test.js,seedRegistrationIndustries.migration.test.js,foldRegistrationIndustryVisibility.migration.test.js,dropRegistrationIndustryVisibility.migration.test.js,registrationIndustries.transport.test.js,registerCompanyRequestUseCase.registrationIndustry.test.js,adminRegistrationIndustries.transport.test.js,adminRegistrationIndustryUseCases.test.js,runtimeSchemaAuditService.test.js,whatYoullGet.test.js,IndustrySelect.test.jsx,IndustryPicker.test.jsx,StoreTemplateManager.registrationIndustries.integration.test.jsx,check:architecture
rollback_note: The migration chain is reversible in the order it applied. 20260812000004 (drop the Phase 39 visibility store) recreates both tables and best-effort repopulates them from registration_industries/registration_industry_audit_logs -- its down() JSON-encodes the before_snapshot/after_snapshot columns it copies forward (toJsonColumnValue helper) so the reconstructed audit rows insert cleanly; this is the exact path that was broken and fixed post-review (see Verification Evidence). 20260812000003 (fold) is additive-only and its down() is a documented no-op -- it never dropped anything to undo. 20260812000002 (seed) removes only is_system rows matching REGISTRATION_INDUSTRIES's keys, never an admin-created row. 20260812000001 (create tables) drops registration_industries and registration_industry_audit_logs outright -- safe only after 20260812000002-000004 have been reverted first, since those depend on the tables existing. On the application side, registerCompanyRequestUseCase.js's DB-first resolution is wrapped in its own try/catch and falls back to the pre-existing resolveRegistrationIndustry() constant path when registrationIndustryRepository is absent or errors -- reverting the DI wiring in tenants/index.js alone (leaving the migrations in place) is also a safe partial rollback, restoring byte-identical pre-issue-#316 behavior. The admin CRUD routes/validators/use-cases/handlers can be reverted independently of the read/write path changes -- none of the other consumers depend on POST/PATCH existing.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-12T00:00:00+08:00
preflight_request_ref: STORE-TEMPLATES-REGISTRATION-INDUSTRY-CATALOG-20260812
---

# Registration Industry Catalog — DB-Driven, Admin-Creatable Business Types (issue #178 follow-up, issue #316)

## Compliance Impact Classification

Regulatory, per the classification matrix's floor for
`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`
(`scripts/check-compliance-impact.js`), which carries an explicit
`regulatory` rule with the `settings,compliance` surfaces regardless of
which part of the file changes — the same floor the two prior declarations
in this arc (`2026-08-09-registration-industry-templates`,
`2026-08-11-registration-industry-visibility`) were filed against.
`frontend/src/services/adminService.js` independently carries the same
regulatory floor, already covered by those declarations' presence in this
branch's history; this declaration is filed new rather than amending
either prior one, since amending would entangle three independent
rollback stories (template linkage, visibility toggling, and this phase's
full DB-driven catalog + CRUD) under one declaration. `surfaces` is
declared as `settings,pos,terminal,compliance` — the same superset
convention the sibling declarations use — matching regardless of which
base ref the eventual PR is diffed against.

No fiscal, VAT, payment, or receipt logic is touched. This work converts
the registration Industry catalog from a hardcoded constant to a landlord
database table with admin CRUD, retires the Phase 39 visibility-only
store (folding its state in first), and threads the catalog's live
template module list through to the frontend's "What you'll get" display.
Every write remains actor- and reason-audited; every read remains
fail-open on a landlord-DB outage, exactly as the two prior phases in this
arc established.

## Affected Surfaces

1. **Registration write path** (`registerCompanyRequestUseCase.js`,
   regulatory floor). `industryKey` resolution is now DB-first:
   `registrationIndustryRepository.findByKey()` replaces the Phase 39
   `isHidden()` lookup, resolving mode/template/hidden in one query. On
   any lookup error, an absent repository, or the DB having no row for
   the key, resolution falls back fail-open to the pre-existing
   `resolveRegistrationIndustry()` constant path — byte-identical to
   pre-issue-#316 behavior in every failure mode. Rejection order, failure
   codes (`unknown_industry_key`, `industry_workflow_mode_conflict`,
   `hidden_industry_key`), and response messages are unchanged. The row
   and the constant entry share field names, so derivation logic
   (`workflow_mode`, `store_template_key`) is unchanged regardless of
   source.
2. **New landlord-only tables** (`registration_industries`,
   `registration_industry_audit_logs`; migrations `20260812000001`
   through `20260812000004`). Not independently compliance-sensitive (no
   file under a matched pattern), but part of the same write surface: a
   catalog row's `hidden` column controls merchant-visibility, mirroring
   the retired Phase 39 store's semantics but as a column rather than a
   separate row's existence. `workflow_mode` is deliberately a plain
   string column, not a database ENUM — the mode vocabulary stays
   engineering-owned (ADR 0056 clause 3, ADR 0058 clause 2). Neither table
   is cloned into any tenant database (`NON_TENANT_MODEL_EXPORTS`).
3. **Retirement of the Phase 39 visibility store**
   (`registration_industry_visibility`,
   `registration_industry_visibility_audit_logs`; migrations
   `20260812000003` fold, `20260812000004` drop). Data-preserving: the
   fold migration copies every `hidden`/`reason`/`updated_by` value and
   every audit row into the new table before the drop migration removes
   the old tables. Safe because PR #311 (which shipped the Phase 39 store)
   had not reached `main`/production as of this work — verified via
   `git merge-base --is-ancestor` against `origin/main` before this arc
   began.
4. **New admin CRUD API**
   (`POST/PATCH /api/v1/admin/registration-industries*`,
   `backend/src/routes/adminRegistrationIndustries.js` — not itself
   matched by a compliance-sensitivity rule, alongside the pre-existing
   Phase 39 `GET`/`PATCH .../visibility`/`GET .../audit-logs` routes, now
   re-backed onto the same repository). Gated by the same
   `authenticateAdmin` middleware as `adminTemplates.js`; every write
   requires a human-readable reason (min 3 characters, the same convention
   as template publish/deprecate) and is unconditionally audited with a
   before/after snapshot, except a genuinely no-op update, which is
   treated as idempotent and writes no new audit row (mirroring
   `buildPublishTemplateUseCase`'s existing idempotency pattern).
   Cross-field validation (`validateModeAndTemplate` in
   `adminRegistrationIndustryUseCases.js`) enforces server-side, on every
   create and edit, that `workflow_mode` is a real de-aliased mode and
   that `template_key` is null iff the mode is external-engine, otherwise
   a published, base_mode-matching template — the same invariant the
   original contract test pinned for the hardcoded constant, now enforced
   at write time for both seeded and admin-authored rows.
5. **Baseline-row protection.** `is_system: true` rows (the 11 seeded
   industries) have `industry_key` and `workflow_mode` permanently
   immutable through the admin API; `label`, `summary`, `niches`,
   `display_order`, `template_key`, and `hidden` remain editable. No route
   performs a hard delete on any row, seeded or admin-created — matching
   the pre-existing Store Template curation surface's own no-DELETE
   precedent.
6. **Public catalog endpoint** (`GET /api/v1/registration/industries`,
   already declared under the prior two registration-industry
   declarations). Now DB-first (`listRegistrationIndustriesUseCase`
   reads `registration_industries` before falling back to the constant);
   gains a `template_modules` field per entry — the paired template's
   live module list, so "What you'll get" renders for an admin-created
   template not present in the code-owned `STORE_TEMPLATE_PRESETS`. The
   response array is never shortened; `hidden` remains metadata for the
   client to filter on, not an omission.
7. **Merchant-facing signup surfaces** (`IndustrySelect.jsx`,
   `IndustryPicker.jsx`, `whatYoullGet.js` — none independently
   compliance-sensitive). `resolveWhatYoullGet(templateKey,
   templateModules)` prefers the live `template_modules` array over the
   local `STORE_TEMPLATE_PRESETS` lookup when present; submitted
   registration payload shape (`industryKey`, `industryTag`) is
   unchanged.
8. **Admin curation UI** (`frontend/Pages/admin/StoreTemplateManager.jsx`,
   `frontend/src/services/adminService.js` — `adminService.js` carries the
   `settings,compliance` regulatory floor independently, already covered
   by this branch's prior declarations). Extends the existing
   "Registration industries" panel (hide/show-only since Phase 39) with a
   "New industry" create form and a per-row edit form. The
   `RegistrationReachabilityNote` component, which previously read the
   hardcoded `REGISTRATION_INDUSTRIES`/`REGISTRATION_EXCLUDED_TEMPLATE_KEYS`
   constants directly, now derives from the loaded API state — a bug fix
   that keeps it accurate the moment an admin edits or creates an
   industry, rather than silently reading stale hardcoded data (not
   independently compliance-sensitive; corrects existing behavior rather
   than introducing new write surface).
9. **POS/terminal surface — unaffected, declared defensively.** No file
   under `frontend/src/features/pos/` or the POS/terminal request path is
   touched. `pos`/`terminal` are declared solely because this
   declaration's `surfaces` field is deliberately a superset (see
   Classification section above); nothing in items 1-8 changes POS
   checkout, pricing, or receipt behavior.

## Compliance Preconditions

1. No fiscal, VAT, payment, or receipt logic is touched anywhere in this
   work — entirely within the registration-funnel catalog/curation
   surface.
2. Every catalog write is actor- and reason-required and audited with
   before/after snapshots, exactly mirroring the existing template
   curation pattern (`requireActorUsername`/`requireReason` in both
   `storeConfigurationTemplateUseCases.js` and
   `adminRegistrationIndustryUseCases.js`) — proven by
   `adminRegistrationIndustryUseCases.test.js`'s create/update/visibility
   audit-trail assertions.
3. Both the catalog-read resolution and the registration-write
   `industryKey` resolution fail OPEN on any landlord-DB error — proven by
   dedicated fail-open test cases in `registrationIndustries.transport.test.js`
   and `registerCompanyRequestUseCase.registrationIndustry.test.js`. A
   landlord-DB outage never blocks or reshapes registration.
4. The public catalog response never shortens its entry array — proven by
   `registrationIndustries.transport.test.js`'s length-preserving
   assertions across the fail-open, hidden-flagging, and admin-created-row
   cases.
5. A workflow_mode change is rejected on a system (seeded baseline) row
   with a 422, but a template_key-only change on the same row succeeds —
   proven by `adminRegistrationIndustryUseCases.test.js`'s explicit
   rejects/allows pair (the latter closing a defect found and fixed during
   this work, where the original implementation incorrectly blocked
   template_key edits on baseline rows too).
6. `template_key` is null iff the paired mode's engine classification is
   `external`, and otherwise must reference a published, base_mode-matching
   template — enforced identically for the seed migration (contract-pinned)
   and for every admin create/update (use-case-pinned), so the invariant
   cannot drift between the two write paths.
7. `buildStoreProfile()` and its 11 golden equivalence snapshots
   (`storeProfile.equivalence.contract.test.js`) are unmodified —
   `STORE_PROFILE_VERSION` stays at 5. `approveTenantUseCase.js` reads only
   the tenant's persisted settings, never the catalog, so this work has no
   effect on already-approved or in-flight tenant provisioning.
8. The admin assisted-provisioning surface (`TenantManager.jsx`) sends
   `workflowMode`/`templateKey` directly, never `industryKey`, so none of
   this work's enforcement (hidden-key rejection, mode/template
   cross-validation) can affect it by construction.

## Verification Evidence

1. `backend/tests/registrationIndustries.contract.test.js` — re-scoped to
   pin seed-baseline integrity (all 9 original invariants survive
   unchanged, now describing the constant's role as seed source).
2. `backend/tests/seedRegistrationIndustries.migration.test.js` (new) —
   row-builder output pinned against `REGISTRATION_INDUSTRIES` with no
   DB, plus idempotency and no-op-on-missing-table cases.
3. `backend/tests/foldRegistrationIndustryVisibility.migration.test.js`
   (new) — the Phase 39 data-copy migration's column-for-column fidelity,
   no-op-when-source-absent, and idempotency-guard cases.
4. `backend/tests/registrationIndustries.transport.test.js` — re-mocked
   on the catalog repository; extended with an admin-created-row case, a
   hidden-from-row case, a catalog-throws fail-open case (reproduced as a
   genuine regression), and `template_modules` propagation.
5. `backend/tests/registerCompanyRequestUseCase.registrationIndustry.test.js`
   — re-mocked on `findByKey`; extended with a DB-only industry
   registering correctly, a hidden-row rejection (regression-proven), a
   lookup-failure fail-open case, and the repository-absent backward-
   compatibility case.
6. `backend/tests/adminRegistrationIndustries.transport.test.js` and
   `backend/tests/adminRegistrationIndustryUseCases.test.js` — full CRUD
   matrices: mode/template cross-validation (unknown mode, alias
   rejection, external+template conflict, missing/unpublished/mismatched
   template), duplicate-key 409, hidden-by-default creation, display-order
   defaulting, system-row mode-immutability (with the template-key-editable
   correction), idempotent no-op updates, and the re-backed
   visibility/audit-log endpoints.
7. `backend/tests/runtimeSchemaAuditService.test.js` — extended with the
   four new migration filenames; the two failures present in this suite
   are confirmed pre-existing — reproduced identically with this work's
   changes fully reverted via `git stash`.
8. `npm run check:architecture` — clean at every phase (47 modules; the
   new `registrationIndustryRepository.js` is the `registration` module's
   `repositories/` directory, the only place the architecture guardrail
   permits a model import).
9. Full backend Jest suite not run (hangs without MySQL in this sandbox) —
   targeted pattern sweeps used per the repository's established
   convention; no test outside the files listed above references any file
   this work touches.
10. `frontend/src/features/registration/__tests__/whatYoullGet.test.js`
    (new) — source-precedence pins between the live `template_modules`
    array and the local `STORE_TEMPLATE_PRESETS` fallback.
11. `frontend/src/features/registration/__tests__/IndustrySelect.test.jsx`
    — extended with an admin-created-industry case proving "What you'll
    get" renders from live `template_modules` (regression-proven against
    the pre-change resolver signature).
12. `frontend/src/features/registration/__tests__/IndustryPicker.test.jsx`
    — unchanged, still passing (the `template_modules` change is additive
    and backward-compatible for callers that don't pass it).
13. `frontend/src/pages/__tests__/StoreTemplateManager.registrationIndustries.integration.test.jsx`
    — rewritten: existing hide/show tests updated to target the Hide/Show
    button specifically (an Edit button was added to the same cell); new
    cases cover create-form submission, 409 surfacing, system-row mode
    lock, changed-fields-only edit submission, and a genuine-regression
    proof for the `RegistrationReachabilityNote` fix (fails against the
    reverted constant-based lookup).
14. `npx vite build` succeeded for both `frontend/` and
    `frontend/apps/store/` after every frontend-touching phase.
15. **Post-review fix (reported against a running deploy, PR #317 review
    comments):** `20260812000003`'s `up()` and `20260812000004`'s `down()`
    both read `before_snapshot`/`after_snapshot` (`Sequelize.JSON` columns)
    via a raw `SELECT`, which mysql2 deserializes into plain JS objects, and
    handed those objects straight to `queryInterface.bulkInsert()`. Because
    `bulkInsert()` has no attribute-type metadata to re-encode a JSON
    column, Sequelize's `SqlString.escape()` throws
    (`Invalid value {...}`) on any object it doesn't otherwise know how to
    serialize — this crash-looped `20260812000003`'s `up()` on any
    environment with at least one real Phase 39 `hidden`/`unhidden` audit
    row (a fresh, activity-free DB never notices, since the audit-copy loop
    is skipped when there are zero source rows to copy). Fixed by adding a
    `toJsonColumnValue()` helper (JSON.stringify, pass-through if already a
    string so it can never double-encode) to both migrations, duplicated
    rather than shared per this repo's migration-is-a-frozen-artifact
    convention. `foldRegistrationIndustryVisibility.migration.test.js` was
    extended with an object-shaped-fixture regression pin (the prior
    fixture used an unrealistic pre-stringified snapshot, which is why the
    original test suite did not catch this) and a new
    `dropRegistrationIndustryVisibility.migration.test.js` was added — the
    `down()` path had no coverage at all before this fix. Both files also
    gained an escape-harness case that runs the migration's exact
    `bulkInsert` payload through the real Sequelize mysql dialect generator
    (`getQueryInterface().queryGenerator.bulkInsertQuery(...)`, no
    connection opened) to reproduce the literal `Invalid value {...}` throw
    against unpatched code and prove its absence against the fix — the
    strongest DB-free proof available in this sandbox (no Docker/MySQL
    access here). This is not a substitute for a live migration run against
    real data; final confirmation is the reporter re-running the fix
    against their persisted local-test database.
