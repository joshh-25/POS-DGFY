---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
reviewed: 2026-07-11T14:20:00Z
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
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-11T14:20:00Z
**Depth:** standard
**Files Reviewed:** 57
**Status:** issues_found

## Summary

This is a re-review after commits `5062d6b9`, `6c4b9459`, `061c4def`, `9b6fad1c`, `113d4e98`, `f1f61ecf` claimed to fix the previous review's CR-01 and WR-01..WR-05 findings. All six fixes were verified by reading the actual diffs and current source, not just trusting the fix report:

- **CR-01** (unhandled unique-constraint race → 500 instead of 409): confirmed fixed. `mapUniqueConstraintError()` is now applied around `repository.create()`/`repository.update()` in `buildRegisterAccountUseCase`, `buildUpdateAccountProfileUseCase` (accounts), `buildCreateBusinessUseCase`, and `buildUpdateBusinessUseCase` (businesses), translating `SequelizeUniqueConstraintError` into the same `conflictError()`/409 shape the pre-check path already returns, and re-throwing anything unrecognized.
- **WR-01** (unescaped business name in invitation HTML email): confirmed fixed. `escapeHtml()` is applied to `businessLabel` before interpolation into the `html` field in `buildOnboardStaffViaInvitationUseCase`; the plain-text `text` field is correctly left unescaped.
- **WR-02** (no email-format validation on staff onboarding): confirmed fixed. Both `buildOnboardStaffViaInvitationUseCase` and `buildOnboardStaffDirectUseCase` now call a local `isValidEmailFormat()` (mirroring `accountEntity.js`'s pattern) before any repository call.
- **WR-03** (no current-password confirmation to change email/password): confirmed fixed. `buildUpdateAccountProfileUseCase` now requires and `bcrypt.compare()`-verifies `updates.current_password` whenever `email` and/or `password` is being changed, ordered after field-level validation/conflict checks so those status codes are unaffected. `accountController.js` forwards the new field.
- **WR-04** (unhandled tenant-DB connection failure in `resolveTenantSession`): confirmed fixed. The `accountStaffAssignmentRepository.findActiveAssignment()` call in `tenantSessionUseCases.js`'s Step 3 is now wrapped in try/catch, mapping connection errors to a `503 SERVICE_UNAVAILABLE` `ApplicationResult.failure(...)`.
- **WR-05** (no JWT algorithm pin / no `JWT_SECRET` guard): confirmed fixed. `accountAuthMiddleware.js` now pins `{ algorithms: ['HS256'] }` on `jwt.verify()`, and both `buildRegisterAccountUseCase`/`buildLoginAccountUseCase` guard against an unset `process.env.JWT_SECRET` before any token-generating write, returning a 503 instead of letting `jwt.sign()` throw synchronously.

All fixes were verified against the actual code (not just the fix report's prose), `node -c` syntax-checked, and the fast unit suites (`tests/unit/modules/accounts`, `tests/unit/modules/businesses`) were re-run and pass (19/19 and 73/73 respectively). No regressions were found in the gated integration test suites that could be inspected statically (the accounts/businesses/tenancy integration and validation suites that touch `email`/`password` updates all hit an earlier validation/conflict check before reaching the new `current_password` gate, so they remain correct under the new logic).

One new, provable issue was found in this re-review pass: none of the six fixes above have any fast, CI-safe automated test coverage that actually exercises their new behavior — the only verification performed by the fix commits was "the pre-existing test suite still passes" (regression-safety, not fix-verification), plus a single gated integration test update for WR-03 that requires real MySQL credentials unavailable in this sandbox/CI. This is flagged below as WR-01 (re-review) given it is exactly the same class of blind spot that let the original CR-01 defect ship undetected in the first place. The previously-scoped, out-of-fix-scope IN-01 (`business.status` not enforced by access control) remains unaddressed, as expected — it is intentionally out of scope for this fix pass and is re-noted here as Info only for completeness.

## Warnings

### WR-01 (re-review): None of the six CR-01/WR-01..05 fixes have automated test coverage verifying their actual behavior

**File:** `apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js`, `apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js`, `apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js`, `apps/dgfy-api/tests/integration/businesses/businessValidation.test.js`

**Issue:** Every one of the six fixes applied in this iteration changed security- or correctness-relevant behavior, but none of them added a test — in either the fast unit suite (which actually runs without a database) or a gated integration suite — that exercises the new code path and asserts the new expected result:

- **CR-01** (`mapUniqueConstraintError`): no unit test in `accountUseCases.test.js`/`businessUseCases.test.js` mocks `repository.create()`/`repository.update()` to reject with a `SequelizeUniqueConstraintError` and asserts the use case now returns a 409 `ApplicationResult.failure(...)` instead of re-throwing. The only test that exercises this scenario end-to-end is `accountFlows.test.js`'s "rejects a concurrent duplicate-email registration" test, which is gated behind `RUN_ACCOUNT_FLOWS_INTEGRATION=true` and requires real MySQL admin credentials unavailable in this sandbox — it has not actually been run against the fix.
- **WR-01** (`escapeHtml`): no test anywhere in the repo asserts the invitation email's `html` field HTML-escapes a business name containing `<`, `>`, `&`, `"`, or `'`. `businessUseCases.test.js`'s "sends an invitation and returns it with a token" test uses a plain alphanumeric business name, so it would pass identically with or without the fix.
- **WR-02** (`isValidEmailFormat`): no test anywhere sends a syntactically malformed but non-empty email (e.g. `"not-an-email"`) to `POST /businesses/:id/staff` or the underlying use cases. `businessValidation.test.js`'s "rejects an invalid email format with HTTP 400" test actually sends `email: ''` (empty string), which is caught by the pre-existing `!businessId || !email` guard, not the new format check — it would pass identically with or without the fix.
- **WR-03** (`current_password` requirement): no unit test in `accountUseCases.test.js` passes `bcrypt` into `buildUpdateAccountProfileUseCase`'s deps or exercises an email/password change; the only coverage is the updated `accountFlows.test.js` password-change test, which is gated behind `RUN_ACCOUNT_FLOWS_INTEGRATION=true` and has not been run. There is also no test anywhere asserting the 400 (missing `current_password`) or 401 (wrong `current_password`) paths this fix specifically introduced.
- **WR-04** (tenant-DB connection-error try/catch): `tenantSessionUseCases.test.js` never mocks `accountStaffAssignmentRepository.findActiveAssignment` to reject/throw; every test either resolves it to `null` or a valid assignment. The new `catch` block that maps a connection failure to 503 is therefore never executed by any test in the repository.
- **WR-05** (JWT algorithm pin / `JWT_SECRET` guard): no test unsets `process.env.JWT_SECRET` (every test file sets it via `process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-...'` at import time) and asserts registration/login now returns 503 instead of throwing. No test asserts `jwt.verify()` rejects a token signed with a different algorithm.

This is a direct repeat of the exact failure mode that let the original CR-01 defect ship: the previous review's CR-01 finding was only discoverable because a gated integration test already existed and explicitly asserted the 409 status — and it was noted in that review that the gap "shipped undetected" precisely because the gated suite was never run in this sandbox. Applying the same "write the fix, rely on a gated/unrunnable test, verify only that pre-existing tests still pass" pattern to all six fixes means none of them are actually proven correct by CI in this environment — a regression to any of the six (e.g. someone later removing the try/catch in `resolveTenantSession`, or loosening `isValidEmailFormat`) would not be caught until it reaches an environment with real MySQL credentials, if ever.

**Fix:** Add fast, dependency-injected unit tests (no real database required, following this codebase's own established mocking pattern in `accountUseCases.test.js`/`businessUseCases.test.js`) for each of the six fixes, e.g.:
```javascript
it('translates a SequelizeUniqueConstraintError from create() into a 409 conflict', async () => {
    const err = new Error('dup'); err.name = 'SequelizeUniqueConstraintError';
    err.errors = [{ path: 'email' }];
    const repository = {
        findByEmail: jest.fn().mockResolvedValue(null),
        findByPhone: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(err)
    };
    const useCase = buildRegisterAccountUseCase({ repository, hashPassword: jest.fn().mockResolvedValue('h') });
    const result = await useCase({ email: 'a@b.com', password: 'StrongPass123' });
    expect(result.isSuccess).toBe(false);
    expect(result.error.code).toBe('CONFLICT');
});
```
Mirror this pattern for the WR-01 (assert `result.data.invitation` came from a `sendEmail` call whose `html` arg contains `&lt;` for an injected `<script>` business name), WR-02 (assert `'not-an-email'` → 400), WR-03 (assert missing/wrong `current_password` → 400/401, and correct `current_password` → 200), WR-04 (mock `findActiveAssignment` to `mockRejectedValue(new Error('ECONNREFUSED'))` → 503), and WR-05 (temporarily `delete process.env.JWT_SECRET` in a test → 503) cases.

## Info

### IN-01 (carried over, out of fix scope): `business.status` is still never enforced by access-control logic

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:99-108` (`requireMembership`), `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js:60-86` (`requireMembership`/`guardBusinessAccess`), `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js:88-153`
**Issue:** Unchanged from the previous review — `buildUpdateBusinessUseCase` still allows setting `status` to `suspended`/`archived`, but no access-control helper checks it anywhere, so a suspended/archived business remains fully operable. Explicitly noted as out of scope for this fix pass per the task instructions; re-noted here only for completeness/traceability, not as a new action item.
**Fix:** No action requested this pass — deferred as previously agreed.

---

_Reviewed: 2026-07-11T14:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
