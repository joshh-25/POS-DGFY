---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
verified: 2026-07-11T14:08:26Z
status: gaps_found
score: 12/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Staff can be onboarded via email invitation (async) or direct add (sync); both flows persist staff and permission records"
    status: failed
    reason: "BusinessRepository stores invitations/staff accounts/assignments in in-process JS Map/array fields (`this.invitationStore`, `this.staffAccountStore`, `this.assignmentStore`), not in any dgfy_core or dgfy_business_* table. Data is lost on every process restart and is not readable by any other process/replica. The Sequelize StaffAccount model (src/models/Tenant/StaffAccount.js) exists and matches the schema contract but is never imported or instantiated anywhere in src/ — it is completely disconnected from the staff onboarding code path."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js"
        issue: "Lines 28-39: staff/invitation stores are `new Map()`/`[]` constructed in the repository constructor, not Sequelize models/queries"
      - path: "apps/dgfy-api/src/models/Tenant/StaffAccount.js"
        issue: "Model file exists and matches dgfyBusinessContract but is never imported by any repository, use case, or the composition root (src/routes/index.js) — orphaned"
    missing:
      - "A real repository (or extension of accountStaffAssignmentRepository's TenantConnector pattern) that writes staff_accounts / invitation records to the actual dgfy_business_* tenant database"
      - "Wiring of src/models/Tenant/StaffAccount.js into that repository and into the composition root"

  - truth: "All flows persist correctly to DGFY schema; re-reading data confirms durability"
    status: failed
    reason: "Confirmed non-durable for two of the required domains: (1) staff onboarding (invitations/staff accounts/assignments — in-memory Map, see above), and (2) branch/location records (LocationRepository — in-memory Map keyed by businessId, see apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js lines 1-56). The `locationModel` (real Sequelize Location model) is accepted as a constructor parameter but the repository's own doc comment states explicitly it 'is NOT used for persistence yet.' Account, Business, and BusinessMembership records ARE durable (real Sequelize + MySQL, transaction-wrapped). Additionally, no tenant-database *provisioning* flow exists anywhere in the codebase — `businessDatabaseRegistryRepository.create()` is only called by tests/seed code, never by the business-creation use case — so a newly created business has no tenant database at all, and the tenant-scoped models (Location.js, StaffAccount.js, TerminalIdentity.js) are never wired into the running app's composition root (src/routes/index.js only instantiates BusinessDatabaseRegistryModel; Location/StaffAccount/TerminalIdentity are not instantiated anywhere)."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js"
        issue: "In-memory Map storage; real Location Sequelize model accepted but unused for persistence (self-documented in file's own header comment)"
      - path: "apps/dgfy-api/src/models/Tenant/Location.js"
        issue: "Model matches schema contract but is never queried/written by locationRepository.js — orphaned"
      - path: "apps/dgfy-api/src/models/Tenant/TerminalIdentity.js"
        issue: "Only referenced by the unmounted tenantContextResolver.js middleware — never instantiated in src/routes/index.js — orphaned"
      - path: "apps/dgfy-api/src/routes/index.js"
        issue: "No tenant-database provisioning call after business creation; Location/StaffAccount/TerminalIdentity models never instantiated"
    missing:
      - "LocationRepository backed by a real per-tenant database connection (via TenantConnector, matching AccountStaffAssignmentRepository's already-real pattern)"
      - "A tenant-database provisioning use case triggered from business creation (or an explicit, documented deferral with an override)"
      - "Wiring of Location.js/StaffAccount.js/TerminalIdentity.js models into the live app"

  - truth: "Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema (ROADMAP Success Criterion 2 / API-02)"
    status: failed
    reason: "Business creation/selection/membership IS durable and DGFY-schema-backed (Business.js, BusinessMembership.js are real Sequelize models used inside a transaction). But 'register branch basics... from the DGFY business schema' fails: branch/location records are stored in an in-memory Map, not the DGFY business schema, so they do not survive a restart and are not visible to any other process. This matches REQUIREMENTS.md's own current marking of API-02 as Pending (line 61: `- [ ] **API-02**`)."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js"
        issue: "Branch/location data is not in the DGFY business schema at runtime"
    missing:
      - "Durable, DGFY-schema-backed branch/location persistence (see missing items above)"

  - truth: "Operator or authenticated user can resolve tenant registry metadata, tenant context selection, and tenant session creation through DGFY tenancy APIs (ROADMAP Success Criterion 3 / API-03)"
    status: failed
    reason: "Tenant context selection (POST /businesses/:id/activate-session) and tenant session creation both exist and are well-implemented and tested. However there is no dedicated 'tenant registry lookup' endpoint that returns business metadata + database pointer independent of creating/activating a session — the only way to learn the tenant database pointer is as a side effect of activate-session. Tenant provisioning metadata is also incomplete: locations and staff assignments are the two provisioning-relevant resources called out in the master plan, and locations are non-durable (see above) while no tenant-database provisioning flow exists at all. This matches REQUIREMENTS.md's own current marking of API-03 as Pending (line 62: `- [ ] **API-03**`)."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/routes.js"
        issue: "No GET endpoint for tenant registry metadata independent of session activation"
    missing:
      - "A tenant registry lookup endpoint (or explicit override documenting that activate-session's response is the intended single source)"
      - "Durable tenant provisioning metadata (locations) — see persistence gap above"

  - truth: "Sequelize models -> Domain entities translation for the businesses module (Key Link 1 / entities layer)"
    status: failed
    reason: "apps/dgfy-api/src/modules/businesses/entities/businessEntity.js does not exist — there is no entities/ directory at all under src/modules/businesses/. businessRepository.js translates Sequelize model instances directly to plain JS objects (toPlainBusiness/toPlainMembership), not to a domain entity. This contradicts both the required-artifacts list and the master plan's explicit Clean Architecture layering (routes -> controllers -> usecases -> entities -> repositories -> models) for the businesses module specifically (the accounts module DOES have a real accountEntity.js). The businesses module's own README.md does not mention or justify this omission."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/entities/businessEntity.js"
        issue: "File and containing directory do not exist"
    missing:
      - "apps/dgfy-api/src/modules/businesses/entities/businessEntity.js implementing the domain entity Business creation/ownership/membership rules, per the plan's must_haves artifact list"
deferred: []
---

# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation Verification Report

**Phase Goal:** Users and operators can use backend Accounts, Businesses, and Tenancy APIs backed by the new DGFY schema and governed module boundaries.
**Verified:** 2026-07-11T14:08:26Z
**Status:** gaps_found
**Re-verification:** No — initial verification

**Note on ROADMAP checkbox:** ROADMAP.md's Phase 4 checkbox was marked `[x]` complete by the final wave's executor before this verification ran. That marking is a workflow-order deviation, not evidence, and this report does not rely on it. `REQUIREMENTS.md` itself (checked independently, not via the checkbox) already marks **API-02: Pending** and **API-03: Pending** — this verification confirms those two requirements are genuinely unmet in the codebase, not just administratively unclosed, and additionally finds a missing `businessEntity.js` artifact not previously called out in REQUIREMENTS.md's status.

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria (Primary Contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | User can register or log in, manage profile/session basics, and be looked up through the DGFY account schema | ✓ VERIFIED | `Account.js` is a real Sequelize model matching `dgfyCoreContract.accounts`; `accountUseCases.js` (428 lines) implements register/login/updateProfile/getAccount; `accountRepository.js` performs real queries; 95/95 unit tests pass (`accountUseCases.test.js`) |
| SC2 | Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema | ✗ FAILED | Business creation/selection/membership durable and real (`Business.js`, `BusinessMembership.js`, transaction-wrapped `create()`). **Branch registration is not durable to the DGFY schema** — `locationRepository.js` stores locations in an in-memory `Map`, and its own header comment states the real `Location` Sequelize model "is NOT used for persistence yet." Matches `REQUIREMENTS.md` API-02: Pending. |
| SC3 | Operator or authenticated user can resolve tenant registry metadata, tenant context selection, and tenant session creation through DGFY tenancy APIs | ✗ FAILED | Tenant context selection + session creation (`POST /businesses/:id/activate-session`) work and are well-tested. No standalone tenant registry lookup endpoint exists. No tenant-database provisioning flow exists — a newly created business has no tenant database. Tenant models `Location.js`, `StaffAccount.js`, `TerminalIdentity.js` are never instantiated in the composition root (`src/routes/index.js`). Matches `REQUIREMENTS.md` API-03: Pending. |
| SC4 | Tenant session creation is rejected unless landlord membership and tenant-local assignment or authorized scope evidence both exist | ✓ VERIFIED | `tenantSessionUseCases.js`'s `resolveTenantSession()` implements the exact 4-step algorithm (business existence → membership → registry lookup → tenant-local assignment, owner-bypass for "authorized scope"); `accountStaffAssignmentRepository.js` genuinely queries the real tenant DB via `TenantConnector`; unit tests (`tenantSessionUseCases.test.js`) assert 403/503 rejection paths |
| SC5 | Architecture and backend tests prove controllers are transport-only, use cases own business logic, repositories own Sequelize access, and persistence side effects are durable | ✗ FAILED (partial) | `npm run check:architecture:dgfy-api` passes (0 violations, 3 modules/36 files, 5 controllers/0 unauthorized model imports) — the routing/controller/use-case/repository layering IS proven for the code paths that exist. But (a) the businesses module has **no entities layer at all** (`businessEntity.js` missing), contradicting the plan's own layering diagram, and (b) "persistence side effects are durable" is **false** for staff onboarding and location/branch data (in-memory only) — see SC2/SC3 above. |

**Score (ROADMAP Success Criteria):** 2/5 verified

### Observable Truths — Plan-Level Detail (must_haves.truths, merged/deduplicated against SC above)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Registration creates unverified account; duplicate email rejected | ✓ VERIFIED | `accountUseCases.js` `buildRegisterAccountUseCase`; unit + integration tests |
| 2 | Login returns session token + business list; unverified accounts can log in | ✓ VERIFIED | `accountUseCases.js` `buildLoginAccountUseCase`; wired to real `businessRepository` per D-05 (04-03-SUMMARY.md) |
| 3 | Single business auto-binds session; multiple businesses require explicit selection | ✓ VERIFIED | Login use case queries `businessRepository.listMembershipsForAccount`; unit tests cover both branches |
| 4 | Profile update (email/password/name/phone) persists; `current_password` required for sensitive fields | ✓ VERIFIED | `buildUpdateAccountProfileUseCase`; WR-03 tests added in review-fix iteration confirm gating behavior |
| 5 | Account lookup: self-access and admin-access | ✓ VERIFIED | `GET /accounts/:id` route + `buildGetAccountUseCase` |
| 6 | Business creation auto-assigns creator as owner (transaction-safe) | ✓ VERIFIED | `businessRepository.create()` wraps business + owner-membership insert in one `sequelize.transaction()` |
| 7 | Owner can view business details, list branches, manage staff | ✓ VERIFIED (functional) — see SC2/SC3 for durability caveat | Endpoints exist and are exercised by unit tests; underlying branch/staff storage is non-durable (separately tracked as a gap) |
| 8 | Staff onboarding (invitation + direct add) persists staff/permission records | ✗ FAILED | In-memory `Map`/`array` storage in `businessRepository.js`; `StaffAccount.js` Sequelize model never wired in |
| 9 | Mid-session business switching via activate-session endpoint | ✓ VERIFIED | `POST /businesses/:id/activate-session`; `buildActivateBusinessSessionUseCase` shares `resolveTenantSession` with session creation |
| 10 | Tenant session creation requires membership AND tenant-local assignment/authorized scope | ✓ VERIFIED | See SC4 |
| 11 | Tenant session creation rejected when requirements unmet | ✓ VERIFIED | `noMembershipError`/`noTenantAssignmentError`/`noTenantDatabaseError` all return proper 403/404; unit-tested |
| 12 | Logout is stateless; tokens remain valid until natural expiration | ✓ VERIFIED | No backend logout route exists by design (D-08); this is the intended no-op — nothing to invalidate server-side |
| 13 | All flows persist correctly to DGFY schema; re-reading confirms durability | ✗ FAILED | See SC2/SC3/SC5 — staff/invitation and location data not in DGFY schema |
| 14 | Controllers transport-only; business logic in use cases; data access in repositories | ✓ VERIFIED | `npm run check:architecture:dgfy-api` passes with 0 violations |
| 15 | Tests cover success, validation, conflicts, replay rejection, logout, durable persistence | ? UNCERTAIN | 95/95 ungated unit tests independently executed and pass (see Behavioral Spot-Checks). ~35 gated integration/E2E test files (Waves 2-5, 250+ cases) exist and are substantive but **could not be executed in this sandbox** — port 3306 is open but no working MySQL credentials are reachable (`.env` files are permission-denied by sandbox policy), matching the SUMMARY's own documented limitation. This is a genuine execution gap, not a fabricated claim — the tests exist and gate-skip cleanly, but their "durable persistence" assertions for staff/location data would fail if run, since the underlying storage is in-memory. |

**Score (all merged truths):** 12/15 verified, 2 failed, 1 uncertain

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/models/Landlord/Account.js` | DgfyAccount model | ✓ VERIFIED | 92 lines, matches `dgfyCoreContract.accounts` |
| `src/models/Landlord/Business.js` | DgfyBusiness model | ✓ VERIFIED | 81 lines, real, wired |
| `src/models/Landlord/BusinessMembership.js` | Membership model | ✓ VERIFIED | 82 lines, real, wired |
| `src/models/Landlord/BusinessDatabaseRegistry.js` | Registry model | ✓ VERIFIED | 82 lines; instantiated in `src/routes/index.js`; queried by `tenantSessionUseCases.js` |
| `src/models/Tenant/Location.js` | Location model | ⚠️ ORPHANED | 97 lines, matches schema; never imported/queried by `locationRepository.js`; never instantiated in `src/routes/index.js` |
| `src/models/Tenant/StaffAccount.js` | StaffAccount model | ⚠️ ORPHANED | 86 lines, matches schema; not imported anywhere under `src/` |
| `src/models/Tenant/AccountStaffAssignment.js` | Assignment model | ✓ VERIFIED | 89 lines; imported directly by `accountStaffAssignmentRepository.js`; real per-tenant queries via `TenantConnector` |
| `src/models/Tenant/TerminalIdentity.js` | Terminal model | ⚠️ ORPHANED | 69 lines; only referenced by the unmounted `tenantContextResolver.js` middleware |
| `src/modules/accounts/{routes,controllers,usecases,repositories,entities,index}.js` | Accounts module (full layers) | ✓ VERIFIED | All 6 files present, substantive, wired; `accountEntity.js` present (79 lines) |
| `src/modules/businesses/{routes,controllers,usecases,repositories,index}.js` | Businesses module | ✓ VERIFIED | Present, substantive, wired |
| `src/modules/businesses/entities/businessEntity.js` | Business domain entity | ✗ MISSING | No `entities/` directory exists under `src/modules/businesses/` at all |
| `src/modules/businesses/controllers/tenantSessionController.js` | Tenant session transport | ✓ VERIFIED | 39 lines, transport-only, wired |
| `src/modules/businesses/usecases/tenantSessionUseCases.js` | Tenant session logic | ✓ VERIFIED | 173 lines, real 4-step algorithm, unit-tested |
| `tests/integration/accounts/{accountFlows,accountValidation,accountPersistence}.test.js` | Account test suites | ✓ VERIFIED (exists, substantive) — execution UNCERTAIN | 352/290/227 lines; gated behind `RUN_*_INTEGRATION`, not executed in this sandbox |
| `tests/integration/businesses/{businessFlows,businessValidation}.test.js` | Business test suites | ✓ VERIFIED (exists, substantive) — execution UNCERTAIN | 294/318 lines; gated, not executed |
| `tests/integration/tenancy/{tenantSessionFlows,tenantSessionValidation}.test.js` | Tenancy test suites | ✓ VERIFIED (exists, substantive) — execution UNCERTAIN | 336/337 lines; gated, not executed |
| `tests/e2e/phase4FullFlow.test.js` | E2E flow test | ✓ VERIFIED (exists, substantive) — execution UNCERTAIN | 480 lines; gated, not executed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `dgfyCoreContract.js` (landlord tables) | Sequelize models (Account/Business/BusinessMembership) | Column-by-column definition | ✓ WIRED | Spot-checked field types/constraints against contract; consistent with code-review's 57-file pass |
| Sequelize models | Domain entities (accounts) | `accountRepository.js` translation | ✓ WIRED | `accountEntity.js` exists and is used |
| Sequelize models | Domain entities (businesses) | `businessRepository.js` translation | ✗ NOT_WIRED | No `businessEntity.js`; repository translates directly to plain objects (`toPlainBusiness`/`toPlainMembership`) |
| `dgfyBusinessContract.js` (tenant tables) | Sequelize models (Location/StaffAccount/AccountStaffAssignment) | Model definitions | ⚠️ PARTIAL | Models match contract; only `AccountStaffAssignment` is actually queried at runtime — `Location`/`StaffAccount` are orphaned |
| Decision D-10 (creator-as-owner) | Business creation use case | Transaction-wrapped repository `create()` | ✓ WIRED | Verified in code + unit test `updates a business as the owner` etc. |
| Decision D-05 (session binding) | Login use case | `businessRepository.listMembershipsForAccount` | ✓ WIRED | Confirmed in `accountUseCases.js`, cross-module dependency documented in `businesses/index.js` header comment |
| Decision D-14 (tenant session security) | `tenantSessionUseCases.js` | `resolveTenantSession()` 4-step algorithm | ✓ WIRED | Confirmed, unit-tested, matches D-04/D-14 exactly |
| Dependency Injection | `accounts/index.js`, `businesses/index.js` | Single wiring point per module | ✓ WIRED | Both are the sole composition points; no circular imports found |
| Phase 3 migration metadata | Phase 4 account lookup | Legacy→DGFY ID mapping read | ✗ NOT_WIRED | No code under `src/modules/accounts/` reads `dgfy_migration_meta`; this key link is unimplemented (soft gap — plan phrased this as "if applicable" and `REQUIREMENTS.md`'s API-01 wording does not explicitly require it, so this does not block API-01, but the plan's own key-link contract is unmet) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `businessController.js` `onboardStaff` | staff/invitation record | `businessRepository.invitationStore`/`staffAccountStore` (in-memory `Map`) | No — lost on restart, not the DGFY schema | ✗ DISCONNECTED from DGFY schema |
| `locationController.js` `createLocation`/`listLocations` | location record | `locationRepository.store` (in-memory `Map`) | No — real `Location` model accepted but unused | ✗ DISCONNECTED from DGFY schema |
| `tenantSessionController.js` `activateSession` | tenant session context | `accountStaffAssignmentRepository.findActiveAssignment()` via real `TenantConnector` | Yes — genuine per-tenant DB query | ✓ FLOWING |
| `businessController.js` `createBusiness`/`getBusiness` | business record | `businessRepository` via real Sequelize `Business`/`BusinessMembership` models, transaction-wrapped | Yes | ✓ FLOWING |
| `accountController.js` `getMe`/`getAccount` | account record | `accountRepository` via real Sequelize `Account` model | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Ungated unit test suite passes (accounts + businesses use cases, auth middleware) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/unit` | `Test Suites: 5 passed, 5 total; Tests: 95 passed, 95 total` | ✓ PASS |
| Architecture guardrails + controller-boundary checks | `npm run check:architecture:dgfy-api` | `[ArchitectureGuardrails] OK. Checked 3 modules and 36 code files.` / `[ControllerBoundary] OK. Checked 5 controller files with no unauthorized model imports.` | ✓ PASS |
| Lint | `cd apps/dgfy-api && npm run lint` | `10 problems (0 errors, 10 warnings)` — all pre-existing `no-unused-vars` on catch blocks | ✓ PASS |
| Gated integration/E2E suites (real MySQL) | `RUN_*_INTEGRATION=true jest tests/integration/... tests/e2e/...` | Port 3306 reachable, but no usable MySQL credentials in this sandbox (`.env` read is permission-denied by sandbox policy) | ? SKIP — cannot execute, matches SUMMARY's own documented limitation |
| `businessEntity.js` presence | `find src -iname "*businessEntity*"` | No results | ✗ FAIL (confirms MISSING artifact) |
| `Location`/`StaffAccount`/`TerminalIdentity` model wiring in composition root | `grep -n "StaffAccount\|Location\b\|TerminalIdentity" src/routes/index.js` | No matches (only `BusinessDatabaseRegistry` is instantiated there) | ✗ FAIL (confirms ORPHANED artifacts) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| API-01 | 04-01, 04-02 | Accounts APIs: registration/login, profile/session, account lookup | ✓ SATISFIED | Real Sequelize model, full use-case coverage, tested, `REQUIREMENTS.md` marks Complete — verification agrees |
| API-02 | 04-03, 04-03.5 | Businesses APIs: creation, selection, branch registry, owner/manager scope | ✗ BLOCKED | Business creation/selection real; branch registry non-durable (in-memory). `REQUIREMENTS.md` marks Pending — verification agrees, confirms root cause |
| API-03 | 04-04 | Tenancy APIs: registry lookup, provisioning metadata, context selection, session creation | ✗ BLOCKED | Context selection/session creation real and secure; no standalone registry lookup endpoint; no provisioning flow; 3 of 4 tenant models orphaned. `REQUIREMENTS.md` marks Pending — verification agrees, confirms root cause |
| API-04 | 04-04 | Tenant session security (membership + assignment) | ✓ SATISFIED | `resolveTenantSession()` 4-step algorithm, unit-tested for both success and every rejection path. `REQUIREMENTS.md` marks Complete — verification agrees |
| API-05 | all waves | Clean Architecture layering, transport-only controllers | ⚠️ PARTIALLY SATISFIED | `check:architecture:dgfy-api` passes (routes→controllers→usecases→repositories→models proven), but the plan's own layering diagram includes an entities layer that is entirely absent for the businesses module. `REQUIREMENTS.md` marks Complete, but this verification finds the entities-layer gap was not previously surfaced/tracked — recommend either fixing or filing an explicit override |
| API-06 | 04-05 | Comprehensive testing: success, validation, conflict, replay, logout, persistence | ? NEEDS HUMAN | Written coverage is genuinely comprehensive (188 Wave 5 tests + 95 unit tests); unit tests independently confirmed passing. Gated suites requiring real MySQL could not be executed in this environment — a human with working DB credentials must run them to close this out, and some of those suites assert "durable persistence" for data that is currently non-durable (staff/location), so re-running them post-fix is required either way |

**Orphaned requirements check:** No requirement IDs map to Phase 4 in `REQUIREMENTS.md` beyond API-01 through API-06, and all six appear in `04-PLAN.md`'s `requirements` frontmatter field. No orphans found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/modules/businesses/repositories/locationRepository.js` | 1-56 (self-documented) | In-memory storage explicitly and honestly documented as non-durable, with rationale | ℹ️ Info | Documented deviation, but still fails the durability must-have — not eligible for a silent pass; tracked as a gap above |
| `src/modules/businesses/repositories/businessRepository.js` | 28-39 (self-documented) | In-memory `Map`/array storage for staff onboarding, explicitly documented | ℹ️ Info | Same as above |
| `src/modules/businesses/entities/businessEntity.js` | — | Missing artifact, **not documented anywhere** (no README mention, no code comment acknowledging the omission) | 🛑 Blocker | Undocumented deviation from the plan's explicit Clean Architecture layering — cannot be treated as an accepted/intentional deviation without an explicit override |
| No `TBD`/`FIXME`/`XXX` markers found | — | — | — | Clean — debt-marker gate does not fire |

## Human Verification Required

None required to determine phase status — the blocking gaps above (non-durable persistence, missing entity, undurable branch/staff data) are directly observable in the codebase and do not require human judgment to confirm. However, one item is recorded for completeness once the above gaps are closed:

### 1. Run gated integration/E2E test suites against a real, disposable MySQL instance

**Test:** Set the documented `RUN_*_INTEGRATION` environment flags (per each Wave's SUMMARY "User Setup Required" section) and run `npm test` in `apps/dgfy-api` against a real MySQL 8 instance.
**Expected:** All ~35 gated test files (250+ cases) pass; coverage exceeds 80% for accounts/businesses/tenancy modules as claimed in `04-SUMMARY.md`.
**Why human:** No MySQL credentials were reachable in this verification sandbox (port 3306 open, but `.env` files are permission-denied by sandbox policy and no working credential set was discoverable). This matches the SUMMARY's own documented limitation across all 5 execution sessions of this phase — it is a genuine environment constraint, not a fabricated claim, but it also means the "188 tests, 0 failed" narrative for gated suites has never actually been observed passing by any agent, including this verification.

## Gaps Summary

Two of the six phase requirements (API-02, API-03) are genuinely unmet, and `REQUIREMENTS.md` already reflects this accurately (`Pending`) independent of the prematurely-checked ROADMAP box. The root cause is consistent across both: **staff onboarding and branch/location data are stored in in-process JavaScript `Map`/array structures rather than the DGFY schema**, despite the corresponding Sequelize models (`StaffAccount.js`, `Location.js`, and by extension the unmounted `TerminalIdentity.js`) existing and matching the schema contracts. These models are literally never instantiated in the application's composition root (`src/routes/index.js`), making them orphaned artifacts rather than functioning parts of the system. Separately, the `businesses` module is missing its domain entity layer (`businessEntity.js`) entirely and undocumented — a genuine, unacknowledged deviation from the plan's Clean Architecture contract, unlike the staff/location in-memory-storage deviations which were at least self-documented in code comments and the phase SUMMARY's "Known Gaps" section.

API-01, API-04, API-05 (with the entity-layer caveat), and API-06 (pending human DB verification) are solidly implemented: real Sequelize-backed, transaction-safe persistence for accounts/businesses/memberships, a correctly enforced D-04 tenant-security algorithm, clean architecture-guardrail compliance, and 95/95 passing ungated unit tests independently re-executed by this verification.

These gaps are pre-existing, self-admitted by the phase's own SUMMARY.md and REQUIREMENTS.md, and are not new findings invented by this verification — this report's contribution is confirming them against the actual code (rather than trusting the SUMMARY's narrative) and pinpointing the exact orphaned files and missing wiring so a closure plan can target them precisely.

---

_Verified: 2026-07-11T14:08:26Z_
_Verifier: Claude (gsd-verifier)_
