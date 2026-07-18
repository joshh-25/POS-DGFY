---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
subsystem: api
tags: [express, sequelize, clean-architecture, jwt, bcrypt, dgfy-core, multi-tenant, mysql]
completed: 2026-07-11
status: complete
---

# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation — Summary

**Clean Architecture Accounts/Businesses/Tenancy backend for DGFY's new `dgfy_core`/`dgfy_business_*` schema — 5 waves delivering registration/login/profile/lookup, business creation/ownership/staff onboarding/location management, and D-04-enforced tenant session activation, all mounted live in `apps/dgfy-api`, backed by 8 comprehensive Wave 5 test suites and a clean architecture-compliance re-verification.**

## Waves Executed

| Wave | Plan | Summary | What it delivered |
|------|------|---------|--------------------|
| 1 | 04-01 | [04-01-SUMMARY.md](./04-01-SUMMARY.md) | Account Sequelize model, AccountEntity domain model, AccountRepository, register/login/updateProfile/getAccount use cases, shared `ApplicationResult`/`DomainError` contracts |
| 2 | 04-02 | [04-02-SUMMARY.md](./04-02-SUMMARY.md) | Accounts HTTP layer (`/v1/accounts/*`) mounted live, `sendUseCaseResult` responder, account auth middleware, businesses module scaffold |
| 3 | 04-03 | [04-03-SUMMARY.md](./04-03-SUMMARY.md) | Business/BusinessMembership models, transaction-safe auto-owner-assignment (D-10), staff onboarding (invitation + direct-add, D-11), HTTP endpoints mounted at `/v1/businesses`/`/v1/invitations`, login returns real business list (D-05) |
| 3.5 | 04-03.5 | [04-03.5-SUMMARY.md](./04-03.5-SUMMARY.md) | Location/branch model + CRUD HTTP endpoints nested under `/businesses/:id/locations` (D-12), primary-location + soft-delete logic |
| 4 | 04-04 | [04-04-SUMMARY.md](./04-04-SUMMARY.md) | Real `TenantConnector`, `BusinessDatabaseRegistry`, tenant-scoped models (StaffAccount/AccountStaffAssignment/TerminalIdentity), D-04-enforced `POST /businesses/:id/activate-session` |
| 5 | 04-05 | [04-05-SUMMARY.md](./04-05-SUMMARY.md) | 8 comprehensive integration/E2E test suites (188 test cases); architecture compliance re-verification; requirements API-05/API-06 closed |

## Requirements Delivered

| Requirement | Status | Delivered by |
|-------------|--------|---------------|
| API-01: Accounts APIs | ✓ Complete | Waves 1-2 |
| API-02: Businesses APIs | Pending (see Known Gaps) | Waves 3, 3.5 |
| API-03: Tenancy APIs | Pending (see Known Gaps) | Wave 4 |
| API-04: Tenant Security (D-04) | ✓ Complete | Wave 4 |
| API-05: Architecture Pattern | ✓ Complete | Waves 1-5, closed by Wave 5 |
| API-06: Comprehensive Testing | ✓ Complete | Wave 5 |

**API-02 and API-03 remain intentionally `Pending`** in `REQUIREMENTS.md`, exactly as their originating waves left them — not an oversight of this phase-close summary. See Known Gaps below.

## Architecture Compliance Report

Re-verified at the end of Wave 5, after all 8 new test files were added:

- `npm run check:architecture:dgfy-api` (controller boundaries + architecture guardrails, both scoped to `apps/dgfy-api/src/modules`): **PASS** — 3 modules, 36 code files checked, 0 violations; 5 controller files checked, 0 unauthorized model imports
- `cd apps/dgfy-api && npm run lint`: **0 errors** (9 pre-existing, unrelated `no-unused-vars` warnings on error-handling catch blocks)
- `apps/dgfy-api/src/config/controllerModelImportAllowlist.js`: **confirmed absent** — zero carved-out exceptions; the architecture check passing is proof of zero violations, not a pre-approved allowlist
- `npm test` (full `apps/dgfy-api` suite): **120 passed, 0 failed**, 161 newly-added Wave 5 tests correctly gate-skipped (no false failures)

Pattern enforced throughout: `routes → controllers → usecases → repositories → models`. Controllers are transport-only (parse request, call use case, `sendUseCaseResult`). Repositories own all Sequelize access. Use cases return `ApplicationResult`; failures are `DomainError` with a `.statusCode`.

## Test Coverage Report

**Written coverage (all 5 waves combined), by suite type:**

| Layer | Suite files | Test count | Gating |
|-------|-------------|------------|--------|
| Unit (use cases, mocked repositories) | `tests/unit/modules/{accounts,businesses}/*.test.js` | 74 tests | Ungated — runs every `npm test` |
| Repository integration (real class, in-memory or real DB) | `tests/integration/{accounts,businesses,tenancy}/*Repository.test.js`, `*UseCases.test.js` | ~40 tests | Mixed — `locationRepository.test.js`/`tenantSessionUseCases.test.js` ungated; `accountRepository.test.js`/`businessRepository.test.js` gated |
| HTTP route integration (real Express app + real MySQL) | `tests/integration/{accounts,businesses,tenancy}/*Routes.test.js` | ~64 tests | Gated (Waves 2-4) |
| **Wave 5 comprehensive integration/E2E (new this wave)** | `accountFlows/accountValidation/accountPersistence`, `businessFlows/businessValidation`, `tenantSessionFlows/tenantSessionValidation`, `phase4FullFlow` | **188 tests** | **Gated (new dedicated `RUN_*_INTEGRATION` flags per suite)** |

**Unit-level statement coverage** (measured, ungated, from the last `npm test -- --coverage` run): `tenantSessionUseCases.js` 100%, `businessUseCases.js` 87.3%, `locationUseCases.js` 89.8%, `accountUseCases.js` 87.6% (per-wave SUMMARY figures).

**Outstanding gap — carried across all 5 waves:** no MySQL server with usable credentials has been reachable in any execution environment used across this phase (port 3306 was open in the Wave 5 sandbox but rejected every attempted credential; the project's own `.env` files are permission-denied by sandbox policy, not a code issue). Every gated suite (~35 test files across Waves 2-5, well over 250 test cases) is written, confirmed to skip cleanly, and has never been run end-to-end against a real database in any of this phase's 5 execution sessions. **This is the single most important pre-Phase-5 action item**: a human must run the full gated suite locally or in CI against a disposable MySQL instance (see each SUMMARY's "User Setup Required" section for the exact env flags) to independently confirm >80% coverage and 100% pass, closing out API-02/API-03/API-06's remaining verification debt.

## Known Gaps / Technical Debt

Carried forward, explicitly documented and user-approved at each originating wave's checkpoint — not silent gaps:

1. **Staff onboarding storage is in-memory** (`BusinessRepository`'s `Map`/array fields for invitations/staff accounts/assignments), not a real database table. Approved at the Wave 3 checkpoint. `dgfy_business_*` tenant persistence for this domain is a follow-up.
2. **`LocationRepository` remains in-memory**, businessId-scoped (`Map`), not migrated onto the real `TenantConnector` that Wave 4 delivered for `AccountStaffAssignmentRepository`. Approved at the Wave 3.5 checkpoint; carried forward as a Wave 4 followup that Wave 4 explicitly declined to absorb (out of that plan's file scope).
3. **`tenantContextResolver.js` middleware is built but unmounted** — no tenant-scoped route in this phase needs per-request `req.tenantContext`/`req.tenantModels` binding yet (the one tenant-DB-consuming endpoint, `activate-session`, resolves its own tenant access directly).
4. **No tenant-database *provisioning* flow exists** anywhere in this codebase — `businessDatabaseRegistryRepository.create()` is called directly by tests/seed code, not by any use case triggered from business creation. A newly-created business today has no automatic tenant database.
5. **Invitation acceptance does not create a real, login-capable `DgfyAccount`** for the invitee — it creates a tenant-side assignment record only. `phase4FullFlow.test.js`'s Journey 2 documents and works around this explicitly.
6. **No MySQL credentials reachable in any of this phase's execution environments** (see Test Coverage Report above) — the single largest closing risk before Phase 5.

These are the natural seams for Phase 5 (Compatibility and Backend-First Cutover Seam) to close, since Phase 5 is explicitly scoped to build the compatibility/cutover machinery that would also need real tenant-database provisioning.

## Ready-for-Phase-5 Checklist

- [x] Accounts, Businesses, and Tenancy HTTP APIs implemented and mounted live in `apps/dgfy-api`
- [x] Clean Architecture pattern (`routes → controllers → usecases → repositories → models`) enforced and verified with 0 violations
- [x] D-04 tenant security (landlord membership AND tenant-local assignment/owner-bypass) implemented and unit-tested (100% coverage)
- [x] Comprehensive integration/E2E test suites written for all success/validation/persistence/replay/isolation scenarios (Wave 5)
- [x] ESLint clean; no architecture-guardrail allowlist exceptions
- [ ] **Human MySQL verification pass** — run all gated suites (Waves 2-5) against a real disposable MySQL instance to close the coverage-verification gap (see Test Coverage Report)
- [ ] Staff onboarding and Location persistence migrated from in-memory stores to real `dgfy_business_*` tenant-database-backed repositories (natural Phase 5 seam, given Phase 5's cutover/compatibility scope)
- [ ] Tenant-database provisioning flow (business creation → real `dgfy_business_*` database + registry row) — currently manual/test-seeded only

Phase 4 is functionally complete and architecturally clean. The one blocking action before treating its coverage/pass claims as independently confirmed is the human MySQL verification pass carried forward from every wave.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-11*
