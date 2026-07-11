---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
reviewed: 2026-07-11T15:05:00Z
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
  - apps/dgfy-api/tests/unit/modules/accounts/accountAuthMiddleware.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/locationUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-11T15:05:00Z
**Depth:** standard
**Files Reviewed:** 57
**Status:** clean

## Summary

This is the final re-review (iteration 3 of 3) after commits `1e070df3`, `adcf7a2f`, `cda197e5`, `07146653` added fast, dependency-injected unit tests intended to close the previous review's WR-01 (re-review) finding: "none of the six CR-01/WR-01..05 fixes have automated test coverage verifying their actual behavior."

Each of the four commits was verified individually — not trusted from its commit message — by reading the actual diff, cross-referencing every new assertion against the real (unmocked) source it targets, and executing the suite:

- `1e070df3` (`accountUseCases.test.js`, +192 lines): adds 4 register/login tests for CR-01 (`SequelizeUniqueConstraintError` → 409, unrecognized error → re-thrown, not swallowed) and WR-05 (`JWT_SECRET` unset → 503, verified *before* any repository write via `expect(repository.create).not.toHaveBeenCalled()`), plus 5 `buildUpdateAccountProfileUseCase` tests for CR-01 (update-path unique-constraint mapping, using a phone-only update to correctly avoid triggering the unrelated WR-03 gate) and WR-03 (missing `current_password` → 400 with `bcrypt.compare` never called; wrong `current_password` → 401 with `bcrypt.compare` called and verified against `account.password_hash`; correct `current_password` → success with the new password hash persisted).
- `adcf7a2f` (`businessUseCases.test.js`, +68 lines): adds CR-01 tests for `buildCreateBusinessUseCase`/`buildUpdateBusinessUseCase` (unique-constraint → 409 with `details.field === 'business_handle'`; unrecognized error re-thrown), a WR-01 test that injects `<script>alert(1)</script>` as the business `display_name` and asserts the invitation email's `html` field contains the escaped `&lt;script&gt;...` while the `text` field is correctly left un-escaped, and WR-02 tests for both `buildOnboardStaffViaInvitationUseCase` and `buildOnboardStaffDirectUseCase` that send a genuinely malformed (`'not-an-email'`), non-empty email and assert 400 with `repository.findInvitationByEmail`/`createStaffAccount` never called (correctly distinguishing this from the pre-existing empty-string-triggers-a-different-guard case called out in the prior review).
- `cda197e5` (new file `tests/unit/modules/businesses/tenantSessionUseCases.test.js`, +109 lines): adds 3 WR-04 tests exercising `resolveTenantSession` via both `buildCreateTenantSessionUseCase` and `buildActivateBusinessSessionUseCase` — a rejected `findActiveAssignment()` call maps to 503 `SERVICE_UNAVAILABLE` for a non-owner, and a control test confirms an owner-role membership bypasses the tenant-DB lookup entirely (so the throw never fires for owners), matching the source's `if (membership.role !== 'owner')` guard exactly.
- `07146653` (new file `tests/unit/modules/accounts/accountAuthMiddleware.test.js`, +84 lines): adds 3 WR-05 tests exercising the middleware behaviorally (real `jwt.sign()`/`jwt.verify()`, not spying on call args) — a token signed with `HS256` is accepted, a token signed with `HS384` using the *same correct secret* is rejected with 401 (proving the `{ algorithms: ['HS256'] }` pin, not just secret verification), and a missing bearer token is rejected with 401.

All four commits touch only test files — `git diff --stat` across the full commit range confirms zero `src/` changes — so this pass could not have introduced any new source-level regression. The full unit suite (`tests/unit/modules/accounts/*`, `tests/unit/modules/businesses/*`) was executed via the project's actual npm test invocation (`node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand`): **95/95 tests pass, 5/5 suites pass**. Every new test was also traced against the real (non-test) implementation it exercises (`accountUseCases.js`, `accountAuthMiddleware.js`, `businessUseCases.js`, `tenantSessionUseCases.js`) to confirm the assertions match actual runtime behavior rather than merely being self-consistent with the mocks — no case of a test asserting against a mock's own return value in a way that would pass regardless of the fix under test was found (the WR-02 tests in particular correctly avoid the exact false-positive trap the prior review called out).

No new bugs, security issues, or quality regressions were found in this pass. The previous review's WR-01 (re-review) finding is resolved: all six of the original CR-01/WR-01..05 fixes now have fast, CI-safe, database-free unit test coverage that genuinely exercises the new/changed behavior and would fail if any of the six fixes were reverted or weakened.

The previously-noted, explicitly out-of-fix-scope IN-01 (`business.status` not enforced by access control) remains unaddressed, as expected and agreed — re-noted below for traceability only, not as a new action item.

## Info

### IN-01 (carried over, out of fix scope): `business.status` is still never enforced by access-control logic

**File:** `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:99-108` (`requireMembership`), `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js:60-86` (`requireMembership`/`guardBusinessAccess`), `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js:88-153`
**Issue:** Unchanged from all prior reviews — `buildUpdateBusinessUseCase` still allows setting `status` to `suspended`/`archived`, but no access-control helper checks it anywhere, so a suspended/archived business remains fully operable. Explicitly agreed as out of scope for this phase's fix passes; re-noted here only for completeness/traceability, not as an action item.
**Fix:** No action requested — deferred as previously agreed.

---

_Reviewed: 2026-07-11T15:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
