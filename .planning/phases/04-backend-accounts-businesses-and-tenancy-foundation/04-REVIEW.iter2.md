---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
reviewed: 2026-07-11T13:33:54Z
depth: standard
files_reviewed: 57
files_reviewed_list:
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/config/db.js
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/middleware/tenantContextResolver.js
  - apps/dgfy-api/src/models/Landlord/Account.js
  - apps/dgfy-api/src/models/Landlord/Business.js
  - apps/dgfy-api/src/models/Landlord/BusinessDatabaseRegistry.js
  - apps/dgfy-api/src/models/Landlord/BusinessMembership.js
  - apps/dgfy-api/src/models/Tenant/AccountStaffAssignment.js
  - apps/dgfy-api/src/models/Tenant/Location.js
  - apps/dgfy-api/src/models/Tenant/StaffAccount.js
  - apps/dgfy-api/src/models/Tenant/TerminalIdentity.js
  - apps/dgfy-api/src/modules/accounts/README.md
  - apps/dgfy-api/src/modules/accounts/controllers/accountController.js
  - apps/dgfy-api/src/modules/accounts/entities/accountEntity.js
  - apps/dgfy-api/src/modules/accounts/index.js
  - apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js
  - apps/dgfy-api/src/modules/accounts/repositories/accountRepository.js
  - apps/dgfy-api/src/modules/accounts/routes.js
  - apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js
  - apps/dgfy-api/src/modules/businesses/README.md
  - apps/dgfy-api/src/modules/businesses/controllers/businessController.js
  - apps/dgfy-api/src/modules/businesses/controllers/locationController.js
  - apps/dgfy-api/src/modules/businesses/controllers/tenantSessionController.js
  - apps/dgfy-api/src/modules/businesses/index.js
  - apps/dgfy-api/src/modules/businesses/infra/sendInvitationEmail.js
  - apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/businessDatabaseRegistryRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js
  - apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js
  - apps/dgfy-api/src/modules/businesses/routes.js
  - apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js
  - apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js
  - apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js
  - apps/dgfy-api/src/routes/index.js
  - apps/dgfy-api/src/shared/contracts/applicationResult.js
  - apps/dgfy-api/src/shared/contracts/domainErrors.js
  - apps/dgfy-api/src/shared/controllers/useCaseResponder.js
  - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js
  - apps/dgfy-api/tests/integration/accounts/accountFlows.test.js
  - apps/dgfy-api/tests/integration/accounts/accountPersistence.test.js
  - apps/dgfy-api/tests/integration/accounts/accountRepository.test.js
  - apps/dgfy-api/tests/integration/accounts/accountRoutes.test.js
  - apps/dgfy-api/tests/integration/accounts/accountValidation.test.js
  - apps/dgfy-api/tests/integration/businesses/businessFlows.test.js
  - apps/dgfy-api/tests/integration/businesses/businessRepository.test.js
  - apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js
  - apps/dgfy-api/tests/integration/businesses/businessValidation.test.js
  - apps/dgfy-api/tests/integration/businesses/locationRepository.test.js
  - apps/dgfy-api/tests/integration/businesses/locationRoutes.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js
  - apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js
  - apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/locationUseCases.test.js
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-11T13:33:54Z
**Depth:** standard
**Files Reviewed:** 57
**Status:** issues_found

## Summary

Reviewed the accounts, businesses, and tenancy-foundation modules built in Phase 4 (clean-architecture routes -> controllers -> usecases -> repositories -> models across `apps/dgfy-api`). The layering is disciplined and consistently applied — controllers stay transport-only, use cases always return `ApplicationResult`, repositories own all persistence, and access control (membership/owner-role/tenant-assignment checks) is applied uniformly across business, location, and tenant-session use cases with solid test coverage for the happy paths and most rejection paths. The known accepted tradeoffs called out in the phase's own SUMMARY.md files (in-memory Maps for staff onboarding/location persistence, integration tests gated behind `RUN_*_INTEGRATION` env flags, the unmounted `tenantContextResolver`) are not re-flagged here.

The most significant issue is a genuine correctness gap: none of the "create with a uniqueness constraint" use cases (account registration/profile update, business creation/update) catch the database-level unique-constraint violation that can occur under a race between the pre-check (`findByEmail`/`findByHandle`) and the actual `create()`/`update()` call. This is provably a real bug, not a hypothetical — `tests/integration/accounts/accountFlows.test.js` contains a test that explicitly issues two concurrent duplicate-email registrations and asserts the second returns HTTP 409, but the implementation has no code path that would produce that result; it would surface as an unstructured HTTP 500 instead. Several other WARNING-level gaps (HTML injection in invitation emails, missing email-format validation on staff onboarding, no current-password confirmation on password change, and an unhandled tenant-DB-connection failure path that contradicts its own doc comment) round out the findings below.

## Critical Issues

### CR-01: Unhandled race condition on unique-constraint violations produces HTTP 500 instead of the documented 409

**File:** `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js:100-158` (`buildRegisterAccountUseCase`), `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js:232-294` (`buildUpdateAccountProfileUseCase`), `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:78-115` (`buildCreateBusinessUseCase`), `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:161-203` (`buildUpdateBusinessUseCase`)

**Issue:** Every one of these use cases does a "check-then-write" against a uniqueness constraint (`repository.findByEmail`/`findByPhone`/`findByHandle`, then `repository.create()`/`repository.update()`) with no try/catch around the write. If two requests race between the check and the write (a realistic scenario for registration forms under double-submit or client-side retry-on-timeout), both checks can pass and the second Sequelize `create()`/`update()` call throws a `SequelizeUniqueConstraintError`. That error is never caught by the use case, so it propagates uncaught through the controller's `.catch(next)` straight to the generic Express error handler (`apps/dgfy-api/src/middleware/errorHandler.js`), which has no `statusCode` on a raw Sequelize error and therefore returns an unstructured HTTP 500 ("Internal Server Error") — not the `ApplicationResult`-shaped 409 Conflict every other duplicate-detection path in this codebase returns.

This is not speculative: `apps/dgfy-api/tests/integration/accounts/accountFlows.test.js:155-166` contains a test explicitly named "rejects a concurrent duplicate-email registration: first succeeds, second fails with 409" that fires two `Promise.all`-concurrent registrations with the same email and asserts `[201, 409]`. Given the current implementation, the losing request would instead receive a 500, failing this test outright. Because this suite is gated behind `RUN_ACCOUNT_FLOWS_INTEGRATION=true` and was very likely never run against a real MySQL instance in this sandbox, the gap has shipped undetected. The identical pattern exists for `business_handle` uniqueness in `buildCreateBusinessUseCase`/`buildUpdateBusinessUseCase` and for `phone` uniqueness in both account use cases — none of these guard against the DB-level race.

**Fix:** Wrap the write call in each of these use cases and translate `SequelizeUniqueConstraintError` (or a generic catch on the create/update call) into the same `conflictError(...)` this codebase already builds for the pre-check path, e.g.:
```javascript
let created;
try {
    created = await repository.create({ email, password_hash: passwordHash, ... });
} catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
        const field = error.errors?.[0]?.path?.includes('phone') ? 'phone' : 'email';
        return ApplicationResult.failure(conflictError(field));
    }
    throw error;
}
```
Apply the same pattern to `buildUpdateAccountProfileUseCase`, `buildCreateBusinessUseCase`, and `buildUpdateBusinessUseCase`.

## Warnings

### WR-01: Unescaped business name interpolated into invitation email HTML (HTML injection)

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:249-258`
**Issue:** `buildOnboardStaffViaInvitationUseCase` builds the invitation email's HTML body by directly interpolating `business.display_name`/`business.legal_name` (`businessLabel`) with no escaping: `` `<p>You have been invited to join <strong>${businessLabel}</strong> on DGFY.</p>` ``. Business `display_name`/`legal_name` are only normalized for whitespace (`normalizeText` in `businessUseCases.js:16-19`) — they are never restricted to safe characters, so an owner can set a business name containing arbitrary HTML/markup that will render unescaped in the invitee's email client (phishing/spoofing risk — e.g. injecting a fake "reset your password" link or spoofed branding into what looks like a legitimate DGFY transactional email).
**Fix:** HTML-escape `businessLabel` (and any other user-supplied value) before interpolating into the `html` field, e.g. a small `escapeHtml()` helper, or switch to a templating approach that escapes by default.

### WR-02: Staff invitation/direct-add accepts any non-empty string as an email address

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:212-265` (`buildOnboardStaffViaInvitationUseCase`), `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:274-306` (`buildOnboardStaffDirectUseCase`)
**Issue:** Both use cases only check `!businessId || !email` (non-empty) via `normalizeEmail`, unlike `accountUseCases.js` which calls `AccountEntity.validateEmailFormat()` before accepting an email. A malformed value (e.g. `"not-an-email"`) is accepted, stored as a "pending invitation", and passed straight to `nodemailer.sendMail({ to: email, ... })` in `sendInvitationEmail.js`, where it will fail at SMTP-submission time rather than being rejected with a clear 400 at the API boundary.
**Fix:** Reuse `AccountEntity.validateEmailFormat(email)` (or an equivalent regex) in both use cases before proceeding, returning the same `validationError('Enter a valid email address.', { field: 'email' })` shape used elsewhere.

### WR-03: Password change via `PATCH /accounts/me` does not require the current password

**File:** `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js:276-289` (`buildUpdateAccountProfileUseCase`), `apps/dgfy-api/src/modules/accounts/controllers/accountController.js:31-45`
**Issue:** Any request bearing a valid session bearer token can change the account's email and/or password via `PATCH /accounts/me` without supplying/confirming the current password. This widens the blast radius of a stolen/leaked session token: an attacker who obtains a token (e.g. via XSS, log leakage, or a compromised device) can silently take over the account by changing its password and email, locking the legitimate owner out, with no additional proof of possession of the original credential.
**Fix:** Require `current_password` in the request body and verify it via `bcrypt.compare` before allowing an `email` or `password` change in `buildUpdateAccountProfileUseCase`.

### WR-04: Tenant-session resolution has no error handling around the live tenant-database query, contradicting its own doc comment

**File:** `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js:88-140` (`resolveTenantSession`), `apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js:61-68` (`findActiveAssignment`)
**Issue:** `resolveTenantSession` calls `accountStaffAssignmentRepository.findActiveAssignment(registryEntry.database_name, accountId)` with no try/catch. `findActiveAssignment` resolves a real Sequelize connection via `TenantConnector.getConnection()` (lazy-connect, `apps/dgfy-api/src/infra/tenantConnector.js:48-77`) and then calls `model.findOne(...)`, which is the point at which a connection to a nonexistent/unreachable database actually fails (e.g. `ER_BAD_DB_ERROR`, `ECONNREFUSED`). Since `businessDatabaseRegistryRepository.create()` is documented as "not exercised by any use case in this wave" and no tenant-database *provisioning* flow exists yet, a `business_database_registry` row can point at a `database_name` that was never actually created — a state this codebase does not currently prevent. In that state, activating a tenant session throws an uncaught rejection that surfaces as a generic 500, directly contradicting `accountStaffAssignmentRepository.js`'s own doc comment: "This is expected and handled gracefully by tenantSessionUseCases.js's NO_TENANT_DATABASE / NO_TENANT_ASSIGNMENT rejection paths, not a crash." A registry row with no backing database is a `NO_TENANT_DATABASE`-shaped situation in intent, but the code does not detect or handle it as one.
**Fix:** Wrap the `findActiveAssignment` (and/or the whole Step 2/3 tenant-DB resolution) in a try/catch inside `resolveTenantSession`, mapping connection errors to a `SERVICE_UNAVAILABLE` `ApplicationResult.failure(...)` rather than letting them propagate as an unhandled rejection.

### WR-05: JWT signing/verification lacks an explicit algorithm allowlist and no startup validation that `JWT_SECRET` is configured

**File:** `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js:88-93` (`generateAccountSessionToken`), `apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js:62-67`
**Issue:** `jwt.sign(..., process.env.JWT_SECRET, { expiresIn })` and `jwt.verify(token, process.env.JWT_SECRET)` are called with no `algorithms` option and no guard verifying `JWT_SECRET` is actually set. Two consequences: (1) defense-in-depth best practice is to pin `algorithms: ['HS256']` on `verify()` rather than relying on the library's default inference; (2) if `JWT_SECRET` is unset (e.g. a misconfigured environment), `jwt.sign()` throws synchronously inside `generateAccountSessionToken`, which is called directly (no try/catch) from `buildRegisterAccountUseCase`/`buildLoginAccountUseCase`. That throw propagates past the `ApplicationResult` contract those use cases are documented to always return, producing the same unstructured 500 path described in CR-01/WR-04 instead of a clean `SERVICE_UNAVAILABLE` failure.
**Fix:** Pass `{ algorithms: ['HS256'] }` to `jwt.verify()`, and either validate `JWT_SECRET` at module load (fail fast on boot) or wrap `generateAccountSessionToken()` calls in the use cases with a guard that returns `serviceUnavailableError(...)` when `process.env.JWT_SECRET` is falsy.

## Info

### IN-01: `business.status` is never enforced by access-control logic

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:61-70` (`requireMembership`), `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js:60-86` (`requireMembership`/`guardBusinessAccess`), `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js:88-140`
**Issue:** `buildUpdateBusinessUseCase` allows an owner to set `status` to any of `pending|active|suspended|archived` (`ALLOWED_BUSINESS_STATUSES`), but no access-control helper (`requireMembership`, `guardBusinessAccess`, `resolveTenantSession`) ever checks `business.status`. A business marked `suspended` or `archived` remains fully operable — staff onboarding, location management, and tenant-session activation all continue to succeed identically to an `active` business. If `status` is intended to gate business functionality (its enum strongly suggests so), that enforcement is currently missing everywhere it would need to apply.
**Fix:** If `status !== 'active'` is meant to restrict business operations, add an explicit check (e.g. in `guardBusinessAccess`/`requireMembership` or `resolveTenantSession`) that rejects non-active businesses with a clear domain error. If this is intentionally out of scope for Phase 4, consider a comment noting the deferral so it isn't mistaken for an oversight later.

### IN-02: SMTP-not-configured degradation logs via `console.log` instead of a structured logger

**File:** `apps/dgfy-api/src/modules/businesses/infra/sendInvitationEmail.js:37`
**Issue:** `sendEmail()`'s graceful-degradation path logs `` `[businesses/sendInvitationEmail] SMTP not configured — skipping email to ${to}: ${subject}` `` via `console.log`. This mirrors `apps/dgfy-api/src/config/db.js`'s existing `console.log` convention for dev-mode query logging, so it's consistent with the codebase's current logging approach, but it also means an invitee's email address is written to stdout in any environment where SMTP isn't configured (including, potentially, production if SMTP env vars are ever misconfigured) rather than going through a structured/leveled logger.
**Fix:** Low priority given the existing project convention; consider routing through a shared logger utility if one exists elsewhere in the monorepo, to make log level and PII exposure easier to control centrally.

---

_Reviewed: 2026-07-11T13:33:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
