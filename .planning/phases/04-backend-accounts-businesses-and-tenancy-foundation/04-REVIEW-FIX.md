---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
fixed_at: 2026-07-11T14:35:00Z
review_path: .planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-07-11T14:35:00Z
**Source review:** .planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 1 (WR-01 re-review)
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WR-01 (re-review): None of the six CR-01/WR-01..05 fixes had automated test coverage verifying their actual behavior

**Files modified:**
- `apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js`
- `apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js`
- `apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js` (new file)
- `apps/dgfy-api/tests/unit/modules/accounts/accountAuthMiddleware.test.js` (new file)

**Commits:**
- `1e070df3` — CR-01 (accounts), WR-03, WR-05 (register/login JWT_SECRET guard) tests in `accountUseCases.test.js`
- `adcf7a2f` — CR-01 (businesses), WR-01, WR-02 tests in `businessUseCases.test.js`
- `cda197e5` — WR-04 tests in new `tenantSessionUseCases.test.js`
- `07146653` — WR-05 (JWT algorithm allowlist) tests in new `accountAuthMiddleware.test.js`

**Applied fix:** Added fast, fully-mocked unit tests (no real database, no gated `RUN_*_INTEGRATION` env flags) that exercise the actual new behavior introduced by each of the six prior fixes, rather than relying on "the pre-existing suite still passes":

- **CR-01** (`mapUniqueConstraintError`): Added tests in both `accountUseCases.test.js` (`buildRegisterAccountUseCase`, `buildUpdateAccountProfileUseCase`) and `businessUseCases.test.js` (`buildCreateBusinessUseCase`, `buildUpdateBusinessUseCase`) that mock `repository.create()`/`repository.update()` to reject with a `SequelizeUniqueConstraintError` and assert the use case returns a 409 `CONFLICT` `ApplicationResult.failure(...)` instead of throwing. Also added a companion test per use case asserting an *unrecognized* error is re-thrown rather than swallowed, proving `mapUniqueConstraintError`'s `return null` / re-throw branch. The account-side update test intentionally uses a phone-only patch so it exercises the CR-01 catch block without also depending on the WR-03 `current_password` gate.
- **WR-01** (`escapeHtml`): Added a test in `businessUseCases.test.js`'s `buildOnboardStaffViaInvitationUseCase` block that sets `business.display_name` to `'<script>alert(1)</script>'` and asserts the sent email's `html` field contains the HTML-entity-escaped form (`&lt;script&gt;...`) and never the raw `<script>` tag, while the `text` field is asserted to still contain the raw string (proving the fix is scoped to the HTML body only).
- **WR-02** (`isValidEmailFormat`): Added a test in each of `buildOnboardStaffViaInvitationUseCase` and `buildOnboardStaffDirectUseCase` that sends `email: 'not-an-email'` (non-empty but syntactically invalid — distinct from the empty-string case the pre-existing `!businessId || !email` guard already covered) and asserts a 400 `VALIDATION_FAILED` result with `details.field === 'email'`, and that no repository write occurs.
- **WR-03** (`current_password` requirement): Added three tests in `accountUseCases.test.js`'s `buildUpdateAccountProfileUseCase` block: (1) an email change with no `current_password` supplied returns 400 with `details.field === 'current_password'` and never calls `bcrypt.compare` or `repository.update`; (2) a password change with a wrong `current_password` returns 401 `AUTHENTICATION_FAILED` and never calls `repository.update`; (3) a password change with the correct `current_password` succeeds and asserts `bcrypt.compare` was called with the supplied value against the account's stored hash.
- **WR-04** (tenant-DB connection-error try/catch): Created a new unit test file, `tests/unit/modules/businesses/tenantSessionUseCases.test.js` (no prior unit-suite location existed for this use case — the only existing coverage lived under `tests/integration/tenancy/`, which despite its directory name is also fully mocked/fast but was excluded per this fix pass's explicit scope of "existing unit test locations"). Mocks `accountStaffAssignmentRepository.findActiveAssignment` to reject with a connection-style error (`ECONNREFUSED`, `ER_BAD_DB_ERROR`) and asserts both `buildCreateTenantSessionUseCase` and `buildActivateBusinessSessionUseCase` (which share the same `resolveTenantSession` implementation) return a 503 `SERVICE_UNAVAILABLE` result rather than letting the rejection propagate. A third test confirms the owner-bypass path never calls `findActiveAssignment` at all, so the throw is never reached for owners.
- **WR-05** (JWT algorithm pin / `JWT_SECRET` guard): Split into two test additions. The `JWT_SECRET`-guard half was added to `accountUseCases.test.js`: both `buildRegisterAccountUseCase` and `buildLoginAccountUseCase` are tested with `process.env.JWT_SECRET` temporarily deleted (restored in a `finally` block), asserting a 503 `SERVICE_UNAVAILABLE` result and that no repository write (`create`/`update`) occurs. The algorithm-pin half needed a middleware-level test, for which no unit test file previously existed — created `tests/unit/modules/accounts/accountAuthMiddleware.test.js`, which signs real JWTs with `jsonwebtoken` (HS256 vs. HS384, both using the correct `JWT_SECRET`) and asserts the middleware accepts the HS256 token and rejects the HS384 token with 401, without ever calling the injected `getAccount` use case. This is a behavioral assertion (signs-and-verifies real tokens) rather than a spy on `jwt.verify`'s call arguments, so it proves the actual runtime algorithm-pinning behavior.

All four modified/new test files were run together (`node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/unit/modules`): **95/95 passing**, up from the pre-fix 19+73=92 (the two new files add 3 tests each; the two extended files add 9 and 7 tests respectively). Each commit was verified independently before being made (ran only the file(s) it touched, confirmed all new and pre-existing tests in that file still pass) per this agent's per-finding rollback protocol; no rollbacks were needed.

**New files created (documented per `<critical_rules>`):**
- `apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js` — required because WR-04's fix lives in `tenantSessionUseCases.js`, which had no prior file under `tests/unit/modules/businesses/`.
- `apps/dgfy-api/tests/unit/modules/accounts/accountAuthMiddleware.test.js` — required because WR-05's algorithm-pin half lives in `accountAuthMiddleware.js`, which had no prior unit test file anywhere in the repo (only indirect exercise via integration route tests that don't assert algorithm-pinning behavior).

## Skipped Issues

None — the single in-scope finding (WR-01 re-review) was fully fixed. `IN-01` (out-of-scope, carried over `business.status` access-control gap) remains intentionally unaddressed per the review's own note that it is deferred, not part of this fix pass's scope.

---

_Fixed: 2026-07-11T14:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
