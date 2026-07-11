---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/models/Tenant/StaffInvitation.js
  - apps/dgfy-api/src/models/Tenant/TerminalIdentity.js
  - apps/dgfy-api/src/modules/businesses/controllers/tenantRegistryController.js
  - apps/dgfy-api/src/modules/businesses/entities/businessEntity.js
  - apps/dgfy-api/src/modules/businesses/index.js
  - apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/businessDatabaseRegistryRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/staffOnboardingRepository.js
  - apps/dgfy-api/src/modules/businesses/routes.js
  - apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js
  - apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js
  - apps/dgfy-api/src/modules/businesses/usecases/tenantRegistryUseCases.js
  - apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js
  - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js
  - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js
  - apps/dgfy-api/tests/integration/businesses/businessFlows.test.js
  - apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js
  - apps/dgfy-api/tests/integration/businesses/businessValidation.test.js
  - apps/dgfy-api/tests/integration/businesses/locationRepository.test.js
  - apps/dgfy-api/tests/integration/businesses/staffOnboardingRepository.test.js
  - apps/dgfy-api/tests/integration/businesses/tenantRegistryRoutes.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js
  - apps/dgfy-api/tests/unit/infra/tenantConnector.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/businessEntity.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/locationUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260711143000-add-dgfy-business-staff-invitations.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
  - apps/dgfy-migration-runner/tests/phase04StaffInvitationsSchema.test.js
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 04: Code Review Report (Gap-Closure Waves 04-06/04-07/04-08)

**Reviewed:** 2026-07-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

This review's scope is narrowed to the three gap-closure plans executed this run: 04-06 (tenant registry read-only lookup), 04-07 (durable staff invitation/onboarding persistence + `staff_invitations` migration), and 04-08 (TerminalIdentity wiring gap-closure + owner-bypass provisioning fail-closed fix). Plans 04-01 through 04-05 were reviewed in a separate prior cycle (see `04-REVIEW.iter2.md`/`04-REVIEW.iter3.md`/`04-REVIEW-FIX.md` in this directory) and are out of scope here; this file overwrites the prior full-phase `04-REVIEW.md` and is now the authoritative review state for the gap-closure work.

The gap-closure work itself is generally solid: the Wave 8 owner-bypass fix in `tenantSessionUseCases.js` (requiring `status==='active' && verified_at` before an owner can activate a session) is a real, well-targeted fix with test coverage (`tenantSessionFlows.test.js`'s "Pre-Handoff Fail-Closed Behavior" describe block), the token-hash-only invitation persistence (T-04-07-02) is correctly implemented end-to-end (model, migration, repository), and the new `TenantConnector.getModels()` registry closes the TerminalIdentity orphan finding with real test evidence (association wiring, idempotency, reachability from `buildBusinessesModule()`).

However, four issues were found that should be addressed: (1) invitations never transition out of `status: 'pending'` on expiry/revocation, permanently blocking re-invitation of an email address after the 7-day expiry window; (2) the new `TenantConnector.getModels()` idempotent-registry guarantee is not honored by the sibling repositories that independently define the same tenant models on the same connection, which — demonstrated by this review's own trace of `tenantSessionFlows.test.js`'s actual call order — causes model redefinition/association loss whenever call order varies; (3) the additive migration's `down()` includes a MySQL-incompatible `DROP TYPE` statement that is dead code (always throws, silently swallowed); and (4) the staff invitation creation path has no protection against a concurrent-request race that can create two pending invitations for the same email (mirrors a race the sibling `business_handle` path already guards against via `CR-01`, but this path does not).

## Warnings

### WR-01: Invitations never expire in the database — expired invitations permanently block re-invitation of the same email

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:362-370`
**Issue:** `buildOnboardStaffViaInvitationUseCase` rejects a new invitation with `CONFLICT` whenever `staffOnboardingRepository.findInvitationByEmail(businessId, email)` returns a row, and that lookup matches on `status: 'pending'` only (`apps/dgfy-api/src/modules/businesses/repositories/staffOnboardingRepository.js:162-169`). Nothing in this codebase ever transitions an invitation's status away from `'pending'` on expiry — `buildAcceptInvitationUseCase` only *checks* `expires_at` at accept-time (`businessUseCases.js:515-517`) and returns a validation error, but never calls an update to mark the row `'expired'`. The `'expired'`/`'revoked'` enum values exist on the model/migration/schema contract (`StaffInvitation.js:58`, the `20260711143000-...` migration, `dgfyBusinessContract.js:117`) but no code path ever sets them.

Net effect: once an invitation email is sent and the invitee doesn't accept within 7 days (`INVITATION_EXPIRY_MS`), the business owner can never send a new invitation to that same email address again — every future `POST /businesses/:id/staff` (invitation flow) call for that email will return `409 CONFLICT: "An invitation is already pending for this email."` forever, with no operator-facing way to clear it short of a direct DB write. This is not covered by any test in `businessUseCases.test.js` or `staffOnboardingRepository.test.js`.

**Fix:** Either (a) have `findInvitationByEmail` exclude rows whose `expires_at` has passed (treat them as not-blocking), or (b) lazily transition an expired `'pending'` row to `'expired'` the moment it's read (in `findInvitationByEmail`/`findInvitationByToken`), e.g.:
```js
async findInvitationByEmail(businessId, email) {
    return this.withModels(businessId, async ({ StaffInvitation }) => {
        const record = await StaffInvitation.findOne({
            where: {
                email: String(email || '').trim().toLowerCase(),
                status: 'pending',
                expires_at: { [Op.gt]: new Date() }
            }
        });
        return record ? this.toPlainInvitation(record) : null;
    });
}
```

### WR-02: `TenantConnector.getModels()`'s idempotent-registry guarantee is not honored by sibling repositories, risking model redefinition / association loss

**File:** `apps/dgfy-api/src/infra/tenantConnector.js:115-145`; `apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js:91-99`; `apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js:43-51`; `apps/dgfy-api/src/modules/businesses/repositories/staffOnboardingRepository.js:91-102`
**Issue:** `TenantConnector.getModels()` was added in Wave 8 specifically to be a single, idempotent tenant model registry — it checks `connection.models[name] || define(connection)` before defining a model (`tenantConnector.js:131`), so it never clobbers a model another caller already defined on that connection. But `LocationRepository.resolveModel()`, `AccountStaffAssignmentRepository.resolveModel()`, and `StaffOnboardingRepository.resolveModels()` do the opposite: they unconditionally call `defineLocationModel(connection)` / `defineAccountStaffAssignmentModel(connection)` / `defineStaffAccountModel(connection)`+`defineStaffInvitationModel(connection)` every time their own per-repository cache misses, with no check of `connection.models[name]` first.

Since each `defineXModel()` factory declares a brand-new `class X extends Model {}` on every call (see `StaffInvitation.js:17`, `TerminalIdentity.js:23`, etc.) and then calls `.init()` against the same shared Sequelize connection (all of these repositories share one `TenantConnector` instance via `buildBusinessesModule()`), calling `getModels()` and then having one of these sibling repositories independently resolve its own model on the *same* `databaseName` results in two different JS classes being registered under the same Sequelize model name on one connection — the second registration silently overwrites/duplicates the first, dropping whichever associations `getModels()`'s own `associate()` pass had wired.

This ordering is not hypothetical — it is the exact order this review traced through `apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js`: `createBusinessWithTenant()` calls `resolveTerminalModel(databaseName)` (→ `tenantConnector.getModels(databaseName)`, which defines `AccountStaffAssignment` via the idempotent path and wires its associations) *before* the "staff with membership + assignment" and "Staff Assignment Verification" tests call `accountStaffAssignmentRepository.create(databaseName, ...)` / `.findActiveAssignment(...)`, which independently redefines `AccountStaffAssignment` on the same connection via `AccountStaffAssignmentRepository.resolveModel()`. The existing unit test (`tenantConnector.test.js:65-80`, "reuses an already-defined model on the same connection instead of redefining it") only proves the *reverse* order (a sibling repository defines first, then `getModels()` reuses it) — the order that actually occurs in the traced integration test is untested and unguarded.

Currently this is latent (no production code path issues an `include`/eager-load against the tenant models that would surface missing associations), but it means `getModels()`'s doc comment claim — "a second call ... never re-defining anything" / "reuses that existing definition" — is only true in one direction, and any future caller relying on `TenantConnector.getModels()`'s associations being stable after other repositories have touched the same connection will hit silent, hard-to-debug data-shape drift.

**Fix:** Make every sibling repository resolve tenant models through `TenantConnector.getModels()` (or reuse `connection.models[name] || define(connection)`'s same idempotent check) instead of calling `defineXModel(connection)` unconditionally, e.g.:
```js
// AccountStaffAssignmentRepository.resolveModel()
resolveModel(databaseName) {
    if (this.modelsByDatabase.has(databaseName)) return this.modelsByDatabase.get(databaseName);
    const connection = this.tenantConnector.getConnection(databaseName);
    const model = connection.models.AccountStaffAssignment || defineAccountStaffAssignmentModel(connection);
    this.modelsByDatabase.set(databaseName, model);
    return model;
}
```

### WR-03: Additive migration's `down()` issues a MySQL-incompatible `DROP TYPE` statement (dead code, silently swallowed)

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260711143000-add-dgfy-business-staff-invitations.cjs:107-113`
**Issue:**
```js
async down(queryInterface) {
  await queryInterface.dropTable('staff_invitations');
  if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_staff_invitations_status').catch(() => {});
  }
}
```
`DROP TYPE` is PostgreSQL syntax for named enum types — MySQL has no equivalent statement (MySQL `ENUM` is an inline column type, not a named, droppable type), so this query always throws a syntax error inside the `dialect === 'mysql'` branch, and the error is unconditionally swallowed by `.catch(() => {})`. The statement never does anything useful and gives a false impression of enum cleanup on rollback for the dialect this migration explicitly targets (`meta.targetKind: 'business'` databases are always MySQL in this codebase).
**Fix:** Remove the dead `DROP TYPE` call entirely — `dropTable('staff_invitations')` alone is sufficient for MySQL (the ENUM type is dropped along with the column/table, there is no separate named type to clean up):
```js
async down(queryInterface) {
  await queryInterface.dropTable('staff_invitations');
}
```

### WR-04: Concurrent duplicate-invitation race — no unique constraint or DB-level conflict handling on `(business, email, pending)`

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:362-370`; `apps/dgfy-migration-runner/src/migrations/schema/20260711143000-add-dgfy-business-staff-invitations.cjs:99-101`
**Issue:** `buildOnboardStaffViaInvitationUseCase` guards against a duplicate pending invitation with a check-then-write: `findInvitationByEmail()` then, if null, `createInvitation()`. The `staff_invitations` table's `email` index (`idx_staff_invitations_email`) is non-unique — only `token_hash` is uniquely constrained. Two concurrent `POST /businesses/:id/staff` (invitation flow) requests for the same email can both pass the pre-check and both insert a `pending` row, since nothing at the DB layer rejects the second insert. This is the exact same class of race the business-creation path already explicitly guards against (see `mapUniqueConstraintError`/`CR-01` in the same file, applied to `business_handle`), but no equivalent guard exists for invitations.
**Fix:** Either add a partial/application-level uniqueness guard (e.g. a unique index on `(email, status)` filtered to `status='pending'` if the dialect supports it, or a second DB round-trip inside a transaction with `SELECT ... FOR UPDATE`), or at minimum document this as an accepted, low-severity race (duplicate pending invitations are not a security issue, just noise) rather than leaving it silently inconsistent with the `business_handle` path's stricter handling.

## Info

### IN-01: `BusinessDatabaseRegistryRepository.create()` still permits duplicate registry rows per business (acknowledged, unresolved elsewhere)

**File:** `apps/dgfy-api/src/modules/businesses/repositories/businessDatabaseRegistryRepository.js:73-81`; `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js:26-38`
**Issue:** `create()` inserts a `business_database_registry` row with no application-level check that a row for `business_id` doesn't already exist (only `findOrCreateForBusiness()`, used by the actual production request path, guards against this). The underlying table's only unique constraint is on `database_name`, not `business_id` (this is called out explicitly in this wave's own new test helper doc comment as "a genuine latent bug that would misroute production/test HTTP flows once real MySQL exists"). `create()` itself is not called from any use case in this diff, so the risk is currently confined to test misuse, but the method remains a foot-gun for any future caller.
**Fix:** No action required for this review's scope (the underlying schema/migration for `business_database_registry` predates this wave and is out of scope), but consider tracking this as a follow-up: either add a real unique constraint on `business_id` in a future migration, or have `create()` itself call `findByBusinessId()` first and reject/no-op on an existing row.

---

_Reviewed: 2026-07-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
