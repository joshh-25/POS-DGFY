---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
verified: 2026-07-12T01:00:00Z
status: gaps_found
score: 10/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 12/15
  gaps_closed:
    - "Staff can be onboarded via email invitation (async) or direct add (sync); both flows persist staff and permission records — StaffOnboardingRepository now persists StaffAccount/StaffInvitation/AccountStaffAssignment through TenantConnector; BusinessRepository's in-memory invitationStore/staffAccountStore/assignmentStore are removed entirely (grep confirms zero references)."
    - "Sequelize models -> Domain entities translation for the businesses module (Key Link 1 / entities layer) — apps/dgfy-api/src/modules/businesses/entities/businessEntity.js now exists (117 lines, BusinessEntity/BusinessMembershipEntity), imported and used by businessRepository.js's toPlainBusiness()/toPlainMembership()."
    - "Operator or authenticated user can resolve tenant registry metadata ... through DGFY tenancy APIs (ROADMAP SC3, tenant-registry-lookup half) — GET /businesses/:id/tenant-registry now exists, membership-gated, returns only safe fields (business_id/database_name/stable_opaque_suffix/status/verified_at/timestamps — no host/user/password/DSN), independent of session activation."
    - "TerminalIdentity.js orphan finding — TenantConnector.getModels(databaseName) now defines TerminalIdentity idempotently alongside Location/StaffAccount/StaffInvitation/AccountStaffAssignment, reachable from buildBusinessesModule(); confirmed by tests/unit/infra/tenantConnector.test.js and a route-file grep showing no new public terminal endpoint was added."
    - "Location/branch records in an in-memory Map — locationRepository.js is fully rewritten onto TenantConnector + BusinessDatabaseRegistryRepository; Location.js is now imported/queried at runtime (no longer orphaned)."
  gaps_remaining:
    - "No production-reachable mechanism to move a business's tenant registry from provisioning to active/verified (see new gap below) — a deeper form of the original 'no tenant-database provisioning flow exists' finding that gap closure narrowed but did not close."
  regressions: []
gaps:
  - truth: "Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema (ROADMAP SC2/API-02); Operator or authenticated user can resolve tenant context selection and tenant session creation through DGFY tenancy APIs (ROADMAP SC3/API-03)"
    status: failed
    reason: >
      Gap closure (04-06/04-07/04-08) correctly replaced in-memory storage with real TenantConnector-backed
      persistence for locations, staff accounts, invitations, and assignments, AND correctly added a fail-closed
      gate requiring business_database_registry.status='active' AND verified_at populated before any tenant
      write or tenant session activation is attempted (a real, well-tested improvement — see
      locationRepository.js, staffOnboardingRepository.js, tenantSessionUseCases.js). However, the mechanism on
      the other side of that gate — the "operator/migration-runner handoff" that is supposed to apply the
      tenant schema and then call businessDatabaseRegistryRepository.updateStatus() to flip a registry row to
      active/verified — does not exist anywhere in the shipped, production-reachable codebase.
      businessDatabaseRegistryRepository.updateStatus() is defined but is never called by any route, controller,
      use case, CLI command (apps/dgfy-migration-runner/src/commands/*.js), or script — it is called ONLY by
      apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js, a test-only stand-in whose own doc comment says it
      exists because "every DB-backed gated suite in this phase needs a test-setup stand-in for that human/CI-
      operator handoff." The Sequelize model itself defaults status to 'provisioning' with no auto-transition.
      Net effect: as shipped, NO business — new or old — can ever reach a state where location creation, staff
      onboarding, or tenant session creation/activation succeeds in a real deployment; every one of those
      requests will always return 404/503 (NO_TENANT_DATABASE / TENANT_DATABASE_UNAVAILABLE / "Tenant database
      is not active/verified yet.") because nothing in the codebase can ever set the registry to active/verified
      outside of a test process. This is the same root cause the original 04-VERIFICATION.md flagged ("no
      tenant-database provisioning flow exists anywhere in the codebase... a newly created business has no
      tenant database at all") — gap closure fixed the persistence-durability half of that finding but left the
      activation/handoff half unbuilt, while all three gap-closure SUMMARYs mark API-02/API-03 as
      "requirements-completed."
    artifacts:
      - path: "apps/dgfy-api/src/modules/businesses/repositories/businessDatabaseRegistryRepository.js"
        issue: "updateStatus() (lines 120-138) is fully implemented and correct, but its own doc comment states 'Never called from the business-creation request path' — and indeed nothing else in src/ calls it."
      - path: "apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js"
        issue: "The only caller of updateStatus() in the entire repository; explicitly documented as a test-only stand-in for an operator handoff that isn't built."
      - path: "apps/dgfy-migration-runner/src/commands/schema.js, verify.js, status.js, rollbackPlan.js, data.js"
        issue: "None of the migration-runner's shipped CLI commands call updateStatus() or otherwise mark a business_database_registry row active/verified after applying a business schema."
    missing:
      - "An operator-invokable command (either a new apps/dgfy-migration-runner CLI command, e.g. 'activate-tenant --database-name=...', or a documented manual runbook step with an accompanying script) that applies + verifies the tenant schema for a database_name and then calls businessDatabaseRegistryRepository.updateStatus() to mark it active/verified"
      - "Or, if this handoff is intentionally deferred to a later phase, an explicit ROADMAP/REQUIREMENTS update plus a VERIFICATION.md override recording that decision — none exists today"
deferred: []
---

# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation Verification Report (Re-Verification After Gap Closure)

**Phase Goal:** Users and operators can use backend Accounts, Businesses, and Tenancy APIs backed by the new DGFY schema and governed module boundaries.
**Verified:** 2026-07-12T01:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure execution of 04-06 (business entity + tenant registry lookup), 04-07 (durable location/staff persistence), and 04-08 (TerminalIdentity wiring + DB-backed verification refresh)

## Summary

This is the second verification cycle for Phase 4. The prior cycle (`04-VERIFICATION.md`, 2026-07-11T14:08:26Z) found `status: gaps_found` at 12/15 must-haves, with 5 specific gaps: (1) staff onboarding stored in an in-memory `Map`, (2) location/branch data stored in an in-memory `Map`, (3) SC2 branch registration not DGFY-schema-backed as a result, (4) SC3 missing a standalone tenant registry lookup endpoint plus no tenant-database provisioning flow, (5) missing `businesses/entities/businessEntity.js`.

Three gap-closure plans (04-06, 04-07, 04-08) executed and, on independent re-verification against the actual codebase (not their SUMMARY narratives), **genuinely closed four of these five findings**: the entity layer exists and is wired, the in-memory location/staff/invitation stores are gone and replaced with real per-tenant Sequelize persistence via `TenantConnector`, `TerminalIdentity.js` is no longer orphaned, and a safe, membership-gated tenant registry lookup endpoint (`GET /businesses/:id/tenant-registry`) now exists independent of session activation.

However, this re-verification found that the fifth finding — "no tenant-database provisioning flow exists" — was **narrowed, not closed**. Gap closure added correct, well-tested registry bookkeeping (a `provisioning` row is created transactionally with every new business) and a correct fail-closed gate (location/staff/session code all now correctly refuse to act unless the registry is `active` + `verified_at`). But the actual handoff that is supposed to flip that switch — applying the tenant schema and calling `updateStatus()` — is not wired to anything an operator, script, or API endpoint can invoke in this shipped codebase; it is called only by a test-only helper. This is confirmed directly in code (not inferred from a SUMMARY claim): `grep -rn "updateStatus" apps/dgfy-api/src apps/dgfy-migration-runner/src` shows the method definition and its own doc comments admitting it is "never called from the business-creation request path," with zero call sites in any route, controller, use case, or CLI command. As a direct, material consequence, **no business can ever have a working location, staff record, or activated tenant session in a real deployment of this system as it stands today** — every such request will always fail closed, because nothing ships that can ever satisfy the gate.

This is graded as a genuine phase-blocking gap (not a documentation nitpick) because ROADMAP Success Criteria 2 and 3 both require that the described capability actually be usable ("Business owner ... can ... register branch basics"; "Operator or authenticated user can resolve ... tenant context selection, and tenant session creation") — not merely that correctly-gated code exists for a state that can never be reached. All three gap-closure SUMMARYs list `requirements-completed: [..., "API-02", "API-03", ...]`, and `REQUIREMENTS.md`'s Traceability table now marks API-02/API-03 "Complete" — this verification finds that marking premature for the reason above, consistent with this project's own prior precedent of correcting premature completion markings (see commit `7c838534`, "correct API-05 to Pending — verification found businessEntity.js missing").

Everything else — accounts (API-01), tenant session security/rejection enforcement (API-04, now stricter than before), Clean Architecture layering (API-05), and the honestly-disclosed real-MySQL test evidence gap (API-06) — is solid and independently re-confirmed below.

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria (Primary Contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | User can register or log in, manage profile/session basics, and be looked up through the DGFY account schema | ✓ VERIFIED | Unchanged from prior cycle; independently re-run: 163/163 non-gated unit tests pass, 0 regressions from gap closure (`accountUseCases.js`, `Account.js` untouched by 04-06/07/08) |
| SC2 | Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema | ✗ FAILED | Business creation/selection real and transaction-safe (now also atomically creates `provisioning` tenant registry metadata). Branch/location persistence is now genuinely DGFY-schema-backed (`locationRepository.js` rewritten onto `TenantConnector`) — the prior gap is closed at the code level. But location creation requires an `active`/`verified` registry row, and **no code path in this repository can ever produce one** (see gap above) — so branch registration is unreachable in a real deployment despite the durable code existing |
| SC3 | Operator or authenticated user can resolve tenant registry metadata, tenant context selection, and tenant session creation through DGFY tenancy APIs | ✗ FAILED | Tenant registry metadata lookup (`GET /businesses/:id/tenant-registry`) is new, real, safe, and independently verified working (membership-gated, no activation side effect, no credential leakage). Tenant context selection/session creation (`POST /businesses/:id/activate-session`, `POST /businesses/:id/tenant-session`) is correctly, more strictly gated than before (closes an owner-bypass bug found in 04-08) — but for the same reason as SC2, it can never succeed for any business, since the registry never reaches active/verified in a real deployment |
| SC4 | Tenant session creation is rejected unless landlord membership and tenant-local assignment or authorized scope evidence both exist | ✓ VERIFIED | `resolveTenantSession()`'s 4-step algorithm unchanged in intent, now hardened: Step 2 additionally requires `status==='active' && verified_at` (04-08 fix for a real owner-bypass gap where an owner could previously activate a session against a still-provisioning tenant DB and get HTTP 200). Unit-tested for every rejection path, including the 2 new provisioning/unverified cases |
| SC5 | Architecture and backend tests prove controllers are transport-only, use cases own business logic, repositories own Sequelize access, and persistence side effects are durable | ✓ VERIFIED | `npm run check:architecture:dgfy-api` passes (0 violations, 3 modules/40 files, 6 controllers/0 unauthorized model imports — up from 36 files/5 controllers pre-gap-closure). The businesses module now has a real entities layer (`businessEntity.js`). Persistence code itself (Location/StaffAccount/StaffInvitation/AccountStaffAssignment/BusinessDatabaseRegistry) is genuinely durable Sequelize/MySQL, not in-memory — the SC5 property is about code correctness, which is met; SC5 does not itself assert end-to-end operability (that's SC2/SC3's concern, tracked as a gap above) |

**Score (ROADMAP Success Criteria):** 3/5 verified (up from 2/5 in the prior cycle) — SC1, SC4, SC5 verified; SC2, SC3 still failed for a different, narrower reason than before

### Observable Truths — Plan-Level Detail (must_haves.truths, merged/deduplicated against SC above)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Registration creates unverified account; duplicate email rejected | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 2 | Login returns session token + business list; unverified accounts can log in | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 3 | Single business auto-binds session; multiple businesses require explicit selection | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 4 | Profile update persists; `current_password` required for sensitive fields | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 5 | Account lookup: self-access and admin-access | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 6 | Business creation auto-assigns creator as owner (transaction-safe) | ✓ VERIFIED | `createWithOwnerAndRegistry()` wraps Business + owner BusinessMembership + tenant registry insert in one transaction; injected registry-failure rollback test passes (`businessEntity.test.js`) |
| 7 | Owner can view business details, list branches, manage staff | ✗ FAILED | Viewing business details works. Listing/creating branches and managing staff are wired to real, correct, tenant-DB-backed code — but per the gap above, no business's tenant database ever becomes reachable in a real deployment, so these operations cannot actually succeed outside of test fixtures that manually fake the operator handoff |
| 8 | Staff can be onboarded via email invitation (async) or direct add (sync); both flows persist staff and permission records | ✗ FAILED | **Gap closed at the persistence-durability level** (was the top original finding): `StaffOnboardingRepository` now genuinely persists `StaffAccount`/`StaffInvitation`/`AccountStaffAssignment` rows through `TenantConnector`, and `BusinessRepository`'s old in-memory stores are entirely removed (`grep` confirms zero references). Still marked FAILED here because, per the same root gap, this code path can never actually run in a real deployment (fails closed with `TENANT_DATABASE_UNAVAILABLE` forever) |
| 9 | Mid-session business switching via activate-session endpoint | ✗ FAILED | Endpoint exists, shares `resolveTenantSession()`, correctly implemented and unit-tested — but unreachable for the same reason as #7/#8 (switching to any business's tenant context requires the same active/verified gate) |
| 10 | Tenant session creation requires membership AND tenant-local assignment/authorized scope | ✓ VERIFIED | The *rejection* enforcement itself works correctly and is independently confirmed by unit tests (including the new stricter provisioning/unverified checks) — this truth is about correct gating, which is genuinely proven, independent of whether the success path is currently reachable |
| 11 | Tenant session creation rejected when requirements unmet | ✓ VERIFIED | Same reasoning as #10 — `noMembershipError`/`noTenantAssignmentError`/`noTenantDatabaseError`/`serviceUnavailableError` (503 for provisioning/unverified) all correctly return per state, unit-tested |
| 12 | Logout is stateless; tokens remain valid until natural expiration | ✓ VERIFIED | Unchanged (D-08); no backend logout route exists by design, confirmed no regression from gap closure |
| 13 | All flows persist correctly to DGFY schema; re-reading data confirms durability | ✗ FAILED | Accounts/Business/Membership/Registry-metadata durability confirmed. Location/Staff/Invitation/Assignment durability code is real and correct (proven reachable-and-correct-up-to-the-connection-layer by force-enabling gated suites locally: every one fails ONLY on `ECONNREFUSED 127.0.0.1:3306`, never a logic/assertion error) but cannot be confirmed end-to-end without real MySQL (human-verification item, see below) AND is unreachable in a real deployment per the gap above |
| 14 | Controllers transport-only; business logic in use cases; data access in repositories | ✓ VERIFIED | `npm run check:architecture:dgfy-api` passes with 0 violations across 40 files/6 controllers |
| 15 | Tests cover success, validation, conflicts, replay rejection, logout, durable persistence | ? UNCERTAIN (human-verification) | 163/163 non-gated unit tests independently re-executed and pass (up from 95/95 — new tests from 04-06/07/08 included). ~50+ gated integration/E2E test files exist, are substantive, and were independently confirmed by this verification to fail ONLY on `ECONNREFUSED` when force-enabled locally (no MySQL reachable in this sandbox) — matching the executors' own honest disclosure rather than a fabricated pass claim. A human with real MySQL access must run them once to obtain a real pass/fail result |

**Score (all merged truths):** 10/15 verified, 4 failed, 1 uncertain (down from 12/15 verified in the prior cycle — the drop reflects this verification finding that the original "no tenant-database provisioning flow" gap was narrowed, not closed, which now more clearly fails truths #7/#9 that the prior cycle had marked "VERIFIED (functional)" with only a durability caveat)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/models/Landlord/Account.js` | DgfyAccount model | ✓ VERIFIED | Unchanged, real, wired |
| `src/models/Landlord/Business.js` | DgfyBusiness model | ✓ VERIFIED | Unchanged, real, wired |
| `src/models/Landlord/BusinessMembership.js` | Membership model | ✓ VERIFIED | Unchanged, real, wired |
| `src/models/Landlord/BusinessDatabaseRegistry.js` | Registry model | ✓ VERIFIED | Real; `status` defaults to `'provisioning'` with no auto-transition; `verified_at` nullable with no default — confirms no implicit activation mechanism exists |
| `src/models/Tenant/Location.js` | Location model | ✓ VERIFIED (was ORPHANED) | Now imported and queried at runtime by `locationRepository.js` via `TenantConnector` |
| `src/models/Tenant/StaffAccount.js` | StaffAccount model | ✓ VERIFIED (was ORPHANED) | Now imported and queried at runtime by `staffOnboardingRepository.js` |
| `src/models/Tenant/StaffInvitation.js` | Invitation model (new) | ✓ VERIFIED | 86 lines; new tenant table+model, token-hash-only persistence confirmed |
| `src/models/Tenant/AccountStaffAssignment.js` | Assignment model | ✓ VERIFIED | Unchanged, real, extended with `findByDgfyAccountId()`/`createOrActivate()` |
| `src/models/Tenant/TerminalIdentity.js` | Terminal model | ✓ VERIFIED (was ORPHANED) | Now reachable via `TenantConnector.getModels()`, confirmed by `tests/unit/infra/tenantConnector.test.js`; no new public route added (`rg` confirms) |
| `src/modules/businesses/entities/businessEntity.js` | Business domain entity | ✓ VERIFIED (was MISSING) | 117 lines; `BusinessEntity`/`BusinessMembershipEntity`, imported and used by `businessRepository.js` |
| `src/modules/businesses/usecases/tenantRegistryUseCases.js` | Registry lookup use case (new) | ✓ VERIFIED | 91 lines; read-only, membership-gated, no session-activation calls |
| `src/modules/businesses/controllers/tenantRegistryController.js` | Registry lookup controller (new) | ✓ VERIFIED | 26 lines; transport-only, no model imports |
| `src/modules/businesses/repositories/locationRepository.js` | Location repository | ✓ VERIFIED (rewritten) | 266 lines; real `TenantConnector`-backed persistence, fail-closed for every non-active/verified state |
| `src/modules/businesses/repositories/staffOnboardingRepository.js` | Staff onboarding repository (new) | ✓ VERIFIED | 266 lines; real `TenantConnector`-backed persistence for `StaffAccount`/`StaffInvitation`, delegates assignment writes |
| `src/modules/businesses/repositories/businessRepository.js` | Business repository | ✓ VERIFIED | In-memory `invitationStore`/`staffAccountStore`/`assignmentStore` and their methods confirmed removed (`grep` returns zero matches) |
| `src/infra/tenantConnector.js` | Tenant connection + model registry | ✓ VERIFIED | 179 lines; new `getModels(databaseName)` idempotent registry defining Location/StaffAccount/StaffInvitation/AccountStaffAssignment/TerminalIdentity |
| `apps/dgfy-migration-runner/.../20260711143000-add-dgfy-business-staff-invitations.cjs` | Additive migration (new) | ✓ VERIFIED | Additive, guarded, `meta.targetKind='business'`; `down()` has a dead/harmless `DROP TYPE` MySQL-incompatible no-op (WR-03, non-blocking) |
| `tests/integration/businesses/locationRepository.test.js`, `staffOnboardingRepository.test.js`, `tenantRegistryRoutes.test.js` | New DB-backed suites | ✓ VERIFIED (exists, substantive) — execution human-pending | Gated on `RUN_*_INTEGRATION`; force-enabled locally by this verification, confirmed fails only on `ECONNREFUSED` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Sequelize models | Domain entities (businesses) | `businessRepository.js` translation | ✓ WIRED (was NOT_WIRED) | `businessEntity.js` exists and is imported/used |
| `dgfyBusinessContract.js` (tenant tables) | Sequelize models (Location/StaffAccount/StaffInvitation/AccountStaffAssignment/TerminalIdentity) | `TenantConnector.getModels()` + individual repository `resolveModel()`s | ✓ WIRED (was PARTIAL) | All 5 tenant models now imported and queried by runtime repositories; `TerminalIdentity` reachable via the new registry |
| `04-VERIFICATION` missing registry lookup endpoint | `GET /businesses/:id/tenant-registry` | route → controller → use case → repository | ✓ WIRED | Confirmed: membership-gated, no session-activation side effect, safe fields only |
| **Business creation → registry `provisioning` row** | **Operator/migration-runner tenant-schema apply + verify → `businessDatabaseRegistryRepository.updateStatus()`** | **A CLI command, script, or API endpoint an operator can invoke** | **✗ NOT_WIRED (new finding)** | `updateStatus()` exists and is correct but has zero production call sites; only `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js` calls it, and that helper's own doc comment describes itself as a "test-setup stand-in" for a handoff that was never built |
| Registry `active`/`verified` gate | Location/staff/tenant-session writes | `resolveDatabaseName()` / `resolveTenantSession()` Step 2 | ✓ WIRED (correctness confirmed) | The gate itself is real and correctly enforced — it is the upstream link feeding it (above) that is missing |
| `TenantConnector.getModels()`'s idempotent-registry guarantee | Sibling repositories' own `resolveModel()`s (Location/AccountStaffAssignment/StaffOnboarding) | Shared tenant connection | ⚠️ PARTIAL (WR-02, non-blocking today) | Per 04-REVIEW.md: sibling repositories independently redefine the same tenant models rather than consulting `getModels()`'s cache, risking model/association drift under certain call orders. Currently latent (no eager-load/association-dependent production code path exists yet) — a real finding, but not a phase-blocking one per this review's own severity classification |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `businessController.js` staff endpoints | staff/invitation/assignment record | `staffOnboardingRepository` via real `StaffAccount`/`StaffInvitation` models + delegated `AccountStaffAssignmentRepository`, over `TenantConnector` | Yes, when reachable | ✓ FLOWING (code-level) / ✗ practically unreachable (registry never active/verified in production — see gap) |
| `locationController.js` location endpoints | location record | `locationRepository` via real `Location` model over `TenantConnector` | Yes, when reachable | ✓ FLOWING (code-level) / ✗ practically unreachable (same reason) |
| `tenantRegistryController.js` `getTenantRegistry` | safe registry metadata | `businessDatabaseRegistryRepository.findByBusinessId()` + `toSafeMetadata()` | Yes | ✓ FLOWING — genuinely reachable and useful even while status stays `provisioning` (this endpoint has no active/verified gate, by design) |
| `tenantSessionController.js` `activateSession` | tenant session context | `accountStaffAssignmentRepository` via real `TenantConnector` query, gated on registry active/verified | Yes, when reachable | ✓ FLOWING (code-level) / ✗ practically unreachable (same reason) |
| `businessController.js` `createBusiness`/`getBusiness` | business + registry record | `businessRepository.createWithOwnerAndRegistry()`, real Sequelize, transaction-wrapped | Yes | ✓ FLOWING — this is genuinely usable today; every business gets a real, durable `provisioning` registry row |
| `accountController.js` `getMe`/`getAccount` | account record | `accountRepository` via real Sequelize `Account` model | Yes | ✓ FLOWING (unchanged) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Ungated unit test suite passes (accounts + businesses + tenancy + migration-runner) | `cd apps/dgfy-api && npm test` | `Test Suites: 16 skipped, 12 passed; Tests: 189 skipped, 163 passed, 0 failed` | ✓ PASS |
| Migration-runner unit suite passes | `cd apps/dgfy-migration-runner && npm test` | `Test Suites: 3 skipped, 20 passed; Tests: 3 skipped, 291 passed, 0 failed` | ✓ PASS |
| Architecture guardrails + controller-boundary checks | `npm run check:architecture:dgfy-api` | `[ArchitectureGuardrails] OK. Checked 3 modules and 40 code files.` / `[ControllerBoundary] OK. Checked 6 controller files with no unauthorized model imports.` | ✓ PASS |
| Lint | `cd apps/dgfy-api && npm run lint` | `10 problems (0 errors, 10 warnings)` — all pre-existing `no-unused-vars` in catch blocks | ✓ PASS |
| `businessEntity.js` presence | `find src -iname "*businessEntity*"` | `src/modules/businesses/entities/businessEntity.js` found | ✓ PASS (confirms prior MISSING artifact closed) |
| `updateStatus()` call sites | `grep -rn "updateStatus" apps/dgfy-api/src apps/dgfy-migration-runner/src` | Only the method's own definition/doc comments; zero callers in `src/` | ✗ FAIL (confirms new gap — no production activation path exists) |
| Forced gated schema-integration test to confirm failure mode | `RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION=true DGFY_BUSINESS_DB_NAMES=dgfy_business_phase04_staff_it npm test -- tests/phase04StaffInvitationsSchema.test.js` (migration-runner) | `SequelizeConnectionRefusedError: connect ECONNREFUSED 127.0.0.1:3306` — no syntax/logic/assertion error | ✓ CONFIRMS executors' honest disclosure (not a fabricated pass) |
| Gated integration/E2E suites (real MySQL) | `RUN_*_INTEGRATION=true npm test -- ...` (apps/dgfy-api) | No MySQL reachable in this sandbox | ? SKIP — cannot execute; matches SUMMARY's own documented limitation, routed to human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| API-01 | 04-01, 04-02 | Accounts APIs: registration/login, profile/session, account lookup | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` marks Complete — verification agrees |
| API-02 | 04-03, 04-03.5, 04-06, 04-07 | Businesses APIs: creation, selection, branch registry, owner/manager scope | ✗ BLOCKED | Business creation/selection real; branch registry code is now durable and correct BUT unreachable in a real deployment (no operator activation path — see gap). `REQUIREMENTS.md` marks this Complete; **this verification finds that premature** |
| API-03 | 04-04, 04-06, 04-08 | Tenancy APIs: registry lookup, provisioning metadata, context selection, session creation | ✗ BLOCKED | Registry lookup endpoint is genuinely complete and usable. Provisioning metadata (the `provisioning` row itself) is genuinely usable. Context selection/session creation is correctly implemented but unreachable for the same reason as API-02. `REQUIREMENTS.md` marks this Complete; **this verification finds that premature** |
| API-04 | 04-04, 04-08 | Tenant session security (membership + assignment) | ✓ SATISFIED | `resolveTenantSession()` 4-step algorithm, now with a fixed owner-bypass gap (04-08); unit-tested for every rejection/gating path. `REQUIREMENTS.md` marks Complete — verification agrees |
| API-05 | all waves, esp. 04-06/04-08 | Clean Architecture layering, transport-only controllers | ✓ SATISFIED | `check:architecture:dgfy-api` passes; businesses module now has a real entities layer; `TerminalIdentity` no longer an unexplained orphan. `REQUIREMENTS.md` marks Complete — verification agrees, this gap is genuinely closed |
| API-06 | all waves, esp. 04-07/04-08 | Comprehensive testing: success, validation, conflict, replay, logout, persistence | ? NEEDS HUMAN | Written coverage is comprehensive and grew substantially (163 unit tests + 50+ gated integration/E2E files). This verification independently force-ran a gated suite and confirmed the only failure mode is `ECONNREFUSED` (no MySQL reachable), matching the executors' own honest disclosure. A human with real MySQL access must run the suites to obtain a genuine pass/fail result — this is a legitimate, disclosed environment limitation, not a fabricated claim |

**Orphaned requirements check:** No requirement IDs map to Phase 4 in `REQUIREMENTS.md` beyond API-01 through API-06, and all six appear across the phase's plans' `requirements` frontmatter fields. No orphans found.

**REQUIREMENTS.md discrepancy:** `REQUIREMENTS.md`'s Traceability table (and its v1 Requirements checklist) currently marks API-02 and API-03 as `Complete`. This verification finds both should remain **Pending** until either (a) an operator-invokable tenant-database activation mechanism is built and proven, or (b) the project explicitly accepts the current state via a recorded override, consistent with this phase's own prior precedent of correcting premature completion markings.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/dgfy-api/src/modules/businesses/repositories/businessDatabaseRegistryRepository.js` | 92-95, 120-124 | Self-documented: "Never called from the business-creation request path" / "A separate operator/migration-runner handoff" | 🛑 Blocker | Honestly disclosed in code comments and all three gap-closure SUMMARYs, but the described handoff was never built — see gap above |
| `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:362-370` | — | Invitations never transition out of `status:'pending'` on expiry (WR-01, from 04-REVIEW.md) | ⚠️ Warning | Permanently blocks re-inviting the same email after the 7-day expiry window; non-blocking for phase-goal achievement, should be fixed in a future pass |
| `apps/dgfy-api/src/infra/tenantConnector.js` + 3 sibling repositories | — | `getModels()`'s idempotent-registry guarantee not honored by sibling repositories (WR-02) | ⚠️ Warning | Latent model-redefinition/association-drift risk; no production code path currently surfaces it |
| `apps/dgfy-migration-runner/.../20260711143000-....cjs:107-113` | — | Dead, MySQL-incompatible `DROP TYPE` statement in `down()`, silently swallowed (WR-03) | ⚠️ Warning | No functional impact (dropTable already cleans up the ENUM), just misleading dead code |
| `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js:362-370` | — | No DB-level uniqueness guard against concurrent duplicate pending invitations (WR-04) | ⚠️ Warning | Low-severity race, non-blocking |
| `apps/dgfy-api/src/routes/index.js` | ~27-29 | Stale doc comment: "locationModel, which stays unwired pending a real tenant-database provisioning flow — see 04-03.5-SUMMARY.md's Known Stub" | ℹ️ Info | Comment predates 04-07's real rewiring of `locationRepository.js`; harmless but should be updated for accuracy |
| No `TBD`/`FIXME`/`XXX` markers found in phase-modified files | — | — | — | Clean — debt-marker gate does not fire |

## Human Verification Required

### 1. Run gated integration/E2E test suites against a real, disposable MySQL instance

**Test:** Set the documented `RUN_*_INTEGRATION` environment flags (per each wave's SUMMARY "User Setup Required" section) and run the exact commands listed in `04-06-SUMMARY.md`/`04-07-SUMMARY.md`/`04-08-SUMMARY.md` against a real MySQL 8 instance, including the combined command: `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js`.
**Expected:** All gated suites pass using the shared `tests/helpers/tenantSchemaProvisioning.js` stand-in for the operator handoff.
**Why human:** No MySQL server is reachable in this sandbox. This verification independently force-enabled several of these suites and confirmed every failure is `SequelizeConnectionRefusedError: ECONNREFUSED 127.0.0.1:3306` — never a logic/assertion error — corroborating the executors' own honest disclosure rather than trusting it blindly. A human with real MySQL access must obtain the actual pass/fail result.

## Gaps Summary

Gap closure (plans 04-06/04-07/04-08) did substantial, genuine, well-tested work and closed 4 of the 5 specific findings from the prior verification cycle: the missing `businessEntity.js`, the in-memory staff/invitation/assignment stores, the in-memory location store, and the missing standalone tenant registry lookup endpoint are all now real, durable, TenantConnector-backed, and independently confirmed against the actual codebase (not just the SUMMARYs' claims) in this cycle.

The fifth finding — "no tenant-database provisioning flow exists" — was **narrowed but not closed**. Gap closure correctly added registry-metadata bookkeeping and a correct, well-tested fail-closed gate requiring `status='active' && verified_at` before any tenant write or session activation. But the actual mechanism that is supposed to set that state — an operator or migration-runner action calling `businessDatabaseRegistryRepository.updateStatus()` — exists only inside a test helper (`tests/helpers/tenantSchemaProvisioning.js`), never in any route, controller, use case, or CLI command shipped with either `apps/dgfy-api` or `apps/dgfy-migration-runner`. This was independently confirmed by this verification via direct `grep` across both packages' `src/` trees, not inferred from a SUMMARY claim.

The practical consequence is significant: as this codebase stands today, no business — new or existing — can ever have a working location, a working staff onboarding record, or an activated tenant session in a real deployment, because nothing can ever move a registry row out of its default `provisioning` state. This directly blocks ROADMAP Success Criteria 2 and 3, and this verification finds `REQUIREMENTS.md`'s current "Complete" marking for API-02 and API-03 premature, consistent with this exact phase's own established precedent (see commit `7c838534`) of correcting such markings when verification finds them unearned.

The recommended closure path is narrow and well-scoped: add one operator-invokable command (a new `apps/dgfy-migration-runner` CLI subcommand, or a documented+scripted manual step) that applies and verifies the tenant schema for a `database_name` and then calls `updateStatus()` — mirroring exactly what `tests/helpers/tenantSchemaProvisioning.js` already proves works. This is a small, concrete, testable addition, not a redesign.

Four secondary code-review findings (WR-01 through WR-04, invitation-expiry/model-idempotency/dead-migration-code/invitation-race) are real but non-blocking per the phase's own code review (`04-REVIEW.md`, 0 critical/4 warning/1 info) and do not affect this verification's status determination.

---

_Verified: 2026-07-12T01:00:00Z_
_Verifier: Claude (gsd-verifier)_
