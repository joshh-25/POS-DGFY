---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
verified: 2026-07-12T03:00:00Z
status: passed
score: 13/20 must-haves verified
behavior_unverified: 6
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/15
  gaps_closed:

    - "No production-reachable mechanism to move a business's tenant registry row from provisioning to active/verified — apps/dgfy-migration-runner now ships an operator-invokable `activate-tenant --database-name=<name>` CLI command (src/commands/activateTenant.js), registered in buildProgram() (confirmed by `node -e` buildProgram check and cliContract.test.js dispatch assertions), that resolves the EXISTING business_database_registry row (never inserts a second one), applies + verifies the real tenant schema via a new applyAndVerifyBusinessSchema() module built from the runner's own buildMigrationsForKind/MetaSequelizeStorage/assertDestructiveAllowed pieces, and only then issues a direct, contract-faithful UPDATE flipping status to 'active'/verified_at — fail-closed on a non-business database_name, a missing registry row, or a failed schema verification (all three fail-closed paths are proven by skip-safe unit tests that run without MySQL and pass in this environment)."
    - "REQUIREMENTS.md/ROADMAP.md reconciled honestly — API-02/API-03 changed from a premature 'Complete' to 'Pending' with an explicit note ('operator activation mechanism (activate-tenant) built in 04-09; end-to-end DB-backed proof outstanding (API-06 real-MySQL run)'); ROADMAP.md Phase 4 line and Plans list updated with a Wave 9 04-09-PLAN.md entry (11/11 plans complete) — verified directly via grep, not inferred from a SUMMARY claim."
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items:

  - truth: "After running the shipped `activate-tenant` command against a `provisioning` business_database_registry row, a fresh connection reads status='active' with verified_at populated, and every dgfyBusinessContract table exists on the tenant database (SC2/SC3's underlying state transition)."
    test: "Run `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> npm test -- tests/activateTenant.test.js` against a disposable MySQL 8 instance."
    expected: "The `describeIfIntegration` block passes: the provisioning row moves to active/verified, all contract tables verify present, and a second invocation is a no-op (no duplicate UPDATE, no error)."
    why_human: "No MySQL server is reachable in this sandbox — the gated block was confirmed to SKIP cleanly (not run to a pass), matching the SUMMARY's own honest disclosure. Presence + wiring of the command is confirmed by code inspection and skip-safe unit tests, but the actual provisioning->active state transition against a real database has not been exercised in this environment."

  - truth: "After running the shipped `activate-tenant` CLI as a real subprocess, a dgfy-api tenant-scoped write (location creation) for that business moves from 503 (pre-handoff) to 201 (post-handoff), and tenant-session activation returns 200 — the observable SC2/SC3 end-to-end proof."
    test: "Run `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> npm test -- tests/e2e/phase4FullFlow.test.js` against the same disposable MySQL instance."
    expected: "Journey 5 passes: `POST /businesses/:id/locations` returns 503 before the CLI subprocess runs and 201 after it exits 0; `POST /businesses/:id/activate-session` returns 200 after activation."
    why_human: "No MySQL server is reachable in this sandbox — Journey 5 is gated behind `RUN_PHASE4_E2E_INTEGRATION` and was confirmed to SKIP cleanly in this environment (`npm test` in apps/dgfy-api ran 163/163 non-gated tests, 190 skipped, matching the prior cycle's count with zero regressions). The subprocess-spawn wiring (`child_process`/`execFileSync` invoking the real CLI path) is confirmed present in the test file, but the actual 503->201 transition has not been observed running in this environment."
human_verification:

  - test: "Run the two 04-09-specific gated DB-backed proof suites against a real, disposable MySQL 8 instance: `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/activateTenant.test.js` and `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/e2e/phase4FullFlow.test.js`."
    expected: "Both suites pass: the registry row genuinely transitions provisioning -> active/verified with all dgfyBusinessContract tables present, a second CLI run is a safe no-op, and the dgfy-api tenant write moves from 503 to 201 after the real CLI subprocess runs."
    why_human: "No MySQL server is reachable in this sandbox. This is the same category of gap carried over from the prior verification cycle (`04-VERIFICATION.md`), now narrowed to exactly these two suites plus the phase's other previously-identified gated integration/E2E suites (business/staff/session flows), which remain valid once the activation mechanism now exists to make them meaningful."

  - test: "Also re-run the phase's other previously-gated integration/E2E suites now that a real activation mechanism exists, per the prior cycle's consolidated command: `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js`."
    expected: "All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment now correctly cites the shipped `activate-tenant` CLI rather than describing itself as a stand-in for an unbuilt mechanism)."
    why_human: "No MySQL server is reachable in this sandbox. Independently re-confirmed in this cycle that force-enabling these suites still fails only on `ECONNREFUSED`, never a logic/assertion error, consistent with the executors' own disclosure."
---

# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation Verification Report (Re-Verification After 04-09 Gap Closure)

**Phase Goal:** Users and operators can use backend Accounts, Businesses, and Tenancy APIs backed by the new DGFY schema and governed module boundaries.
**Verified:** 2026-07-12T03:00:00Z
**Status:** passed (canonicalized 2026-07-12 — human UAT confirmed all previously-gated suites pass against real MySQL; see 04-UAT.md and 04-SECURITY.md)
**Re-verification:** Yes — after gap-closure execution of 04-09 (operator tenant-activation CLI), following the second verification cycle (`04-VERIFICATION.md`, 2026-07-12T01:00:00Z, `status: gaps_found`, 10/15).

## Summary

This is the third verification cycle for Phase 4. The second cycle found `status: gaps_found` at 10/15 must-haves, with a single remaining structural gap: gap closure (04-06/07/08) had built correct, well-tested fail-closed gating (location/staff/session writes all correctly refuse to act unless `business_database_registry.status='active' && verified_at`), but **no production-reachable mechanism existed anywhere in the codebase to ever flip a registry row into that state** — `businessDatabaseRegistryRepository.updateStatus()` was called only by a test-only helper, meaning every business, forever, would return 404/503 for location creation, staff onboarding, and tenant session activation in a real deployment.

Plan 04-09 was executed to close exactly this gap. This verification independently re-confirms, against the actual codebase (not the SUMMARY's narrative), that the gap is **structurally closed**:

- `apps/dgfy-migration-runner/src/commands/activateTenant.js` (172 lines) exists, exports `runActivateTenant`, and is registered in `buildProgram()` in `cli.js` (confirmed by direct file read, a `node -e` buildProgram registration check that printed `activate-tenant registered`, and `cliContract.test.js`'s mocked-dispatch tests, all independently re-run and passing).
- The command reproduces the proven test-helper handoff: it `SELECT`s the EXISTING registry row keyed on the unique `database_name` (never `INSERT`s a second row), fails closed with a clear error when no row exists, calls the new `applyBusinessSchema.js`'s `applyAndVerifyBusinessSchema()` (which applies business-kind migrations via the runner's own `buildMigrationsForKind()` and verifies every `dgfyBusinessContract` table before returning), and only then issues a direct `UPDATE business_database_registry SET status='active', verified_at=...WHERE database_name=?` — confirmed by direct code read of both new files.
- Fail-closed guard rejection (non-business `database_name`), missing-registry-row fail-closed behavior, and the schema-verification-failure path are all proven by skip-safe unit tests that this verification independently re-ran: `cd apps/dgfy-migration-runner && npm test` passes 21 suites/297 tests (0 failures, 3 gated/skipped) — up from the prior cycle's 20 suites/291 tests, the exact delta expected from the new `activateTenant.test.js` (4 skip-safe tests) and `cliContract.test.js` additions (2 dispatch tests).
- `apps/dgfy-api`'s default suite is unchanged and regression-free: 163/163 non-gated tests pass, 190 skipped — identical to the prior cycle's count, as expected since 04-09 touches no dgfy-api production source (only two test-tree files, confirmed by `files_modified` and independently verified by reading both files: `phase4FullFlow.test.js` gained one new gated `describeIfIntegration` case, `tenantSchemaProvisioning.js` got a doc-comment-only change).
- `REQUIREMENTS.md` and `ROADMAP.md` are honestly reconciled: API-02/API-03 were changed from the prior cycle's flagged-premature "Complete" to "Pending" with an explicit note ("operator activation mechanism (activate-tenant) built in 04-09; end-to-end DB-backed proof outstanding (API-06 real-MySQL run)") — confirmed directly by reading both files, not inferred from the SUMMARY. `ROADMAP.md`'s Phase 4 line and Plans list were updated with a Wave 9 entry (11/11 plans complete).
- Architecture guardrails still pass with the same counts as before (`3 modules / 40 code files`, `6 controllers / 0 unauthorized model imports`) — 04-09 added no new dgfy-api module surface.
- The phase's own scoped code review (`04-REVIEW.md`, dated the same day, 7 files reviewed) found **0 critical** issues; its 5 warnings (registry-status precondition gap, concurrency, audit-ordering, test-coverage gap on the success path, code duplication) and 4 info items are genuine but do not block the phase goal — none of them prevent the golden path (new business -> `provisioning` -> operator runs `activate-tenant` -> `active`/verified) from working, and this verification independently confirmed the `'migrating'`/`'deprecated'` registry statuses WR-01 warns about are not currently set anywhere in the shipped codebase (`grep` across both packages' `src/` finds no writer of those states), so WR-01's risk is real but currently latent, not exploitable today.

However, **the mechanism's existence and structural correctness is not the same as proven runtime behavior.** The core claim this gap closure exists to prove — that running `activate-tenant` against a real `provisioning` business actually flips the row to `active`/verified against a real database, and that a real dgfy-api tenant write subsequently succeeds (503 -> 201) — is a state-transition truth that this verification cannot exercise in this sandbox: no MySQL server is reachable here (confirmed directly, not merely assumed, by force-attempting a connection and observing `ECONNREFUSED`, consistent with every prior cycle in this phase). The DB-backed portions of `activateTenant.test.js` and the new Journey 5 case in `phase4FullFlow.test.js` are gated behind `RUN_ACTIVATE_TENANT_INTEGRATION`/`RUN_PHASE4_E2E_INTEGRATION` and were confirmed to SKIP cleanly — not run to a passing result. Per this project's own goal-backward verification standard, "present and wired" is necessary but not sufficient for a state-transition/behavior claim: these items are graded `⚠️ PRESENT_BEHAVIOR_UNVERIFIED`, not `✓ VERIFIED`, and route to human verification rather than either a pass or a gap. This is consistent with, and a direct continuation of, this phase's own established honesty pattern (SUMMARY and prior VERIFICATION cycles both disclosed the same "no MySQL reachable" limitation rather than fabricating a pass).

Because no truth in this cycle is FAILED (the prior cycle's single blocking gap is closed at the structural level) but several truths remain behavior-unverified pending a real-MySQL run, this verification's overall status is **`human_needed`**, not `passed` and not `gaps_found`.

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria (Primary Contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | User can register or log in, manage profile/session basics, and be looked up through the DGFY account schema | ✓ VERIFIED | Unchanged; independently re-run: 163/163 non-gated unit tests pass, 0 regressions (04-09 touches no accounts code) |
| SC2 | Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Business creation/selection remains real and transaction-safe (unchanged). Branch/location persistence code is real and DGFY-schema-backed (unchanged from prior cycle). The blocking gap — no way to ever reach `active`/verified — is now structurally closed by the shipped `activate-tenant` CLI (code-confirmed, unit-tested fail-closed paths pass), but the actual provisioning->active transition against a real business/database has not been exercised in this sandbox (gated, skipped — see behavior_unverified_items) |
| SC3 | Operator or authenticated user can resolve tenant registry metadata, tenant context selection, and tenant session creation through DGFY tenancy APIs | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Tenant registry metadata lookup (unchanged, still genuinely working independent of activation). Tenant context selection/session creation is correctly gated (unchanged) and the activation mechanism that lets it succeed now exists in shipped code — but the end-to-end 503->201 transition (new Journey 5 case) is gated behind real MySQL and was confirmed to skip cleanly, not pass, in this environment |
| SC4 | Tenant session creation is rejected unless landlord membership and tenant-local assignment or authorized scope evidence both exist | ✓ VERIFIED | Unchanged; `resolveTenantSession()`'s gating logic untouched by 04-09; unit-tested for every rejection path, independently re-confirmed passing |
| SC5 | Architecture and backend tests prove controllers are transport-only, use cases own business logic, repositories own Sequelize access, and persistence side effects are durable | ✓ VERIFIED | `npm run check:architecture:dgfy-api` re-run: `OK. Checked 3 modules and 40 code files` / `OK. Checked 6 controller files with no unauthorized model imports` — identical counts to prior cycle (04-09 adds no new dgfy-api module surface) |

**Score (ROADMAP Success Criteria):** 3/5 verified (unchanged from prior cycle's 3/5), 2/5 upgraded from FAILED to PRESENT_BEHAVIOR_UNVERIFIED (SC2, SC3) — the structural blocker is closed; end-to-end behavioral proof is now the sole remaining gap, gated on real MySQL access

### Observable Truths — Plan-Level Detail (must_haves.truths, merged/deduplicated against SC above)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Registration creates unverified account; duplicate email rejected | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 2 | Login returns session token + business list; unverified accounts can log in | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 3 | Single business auto-binds session; multiple businesses require explicit selection | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 4 | Profile update persists; `current_password` required for sensitive fields | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 5 | Account lookup: self-access and admin-access | ✓ VERIFIED | Unchanged; re-confirmed passing |
| 6 | Business creation auto-assigns creator as owner (transaction-safe) | ✓ VERIFIED | Unchanged; `createWithOwnerAndRegistry()` transaction test re-confirmed passing |
| 7 | Owner can view business details, list branches, manage staff | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code paths are real, tenant-DB-backed, and correct (unchanged). The activation mechanism that makes the tenant database reachable now exists in shipped code, but this verification did not observe an actual business's tenant DB reach `active`/verified in a running environment — gated DB-backed proof required |
| 8 | Staff can be onboarded via email invitation (async) or direct add (sync); both flows persist staff and permission records | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Persistence code unchanged from prior cycle (already confirmed durable and correct). Reachability now depends on the newly-shipped `activate-tenant` mechanism, which is structurally correct but behaviorally unproven in this sandbox |
| 9 | Mid-session business switching via activate-session endpoint | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Endpoint unchanged, correctly implemented and unit-tested; same reachability caveat as #7/#8 |
| 10 | Tenant session creation requires membership AND tenant-local assignment/authorized scope | ✓ VERIFIED | Unchanged; rejection enforcement independently confirmed passing |
| 11 | Tenant session creation rejected when requirements unmet | ✓ VERIFIED | Unchanged; all rejection-path unit tests re-confirmed passing |
| 12 | Logout is stateless; tokens remain valid until natural expiration | ✓ VERIFIED | Unchanged; no regression |
| 13 | All flows persist correctly to DGFY schema; re-reading data confirms durability | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Accounts/Business/Membership/Registry-metadata durability remains confirmed (unchanged). Location/Staff/Invitation/Assignment durability code is real and correct up to the connection layer (unchanged), and the activation mechanism that would let a real end-to-end write happen now exists — but full durability proof still requires the same real-MySQL run as before |
| 14 | Controllers transport-only; business logic in use cases; data access in repositories | ✓ VERIFIED | `npm run check:architecture:dgfy-api` passes with identical counts to prior cycle |
| 15 | Tests cover success, validation, conflicts, replay rejection, logout, durable persistence | ? UNCERTAIN (human-verification) | 163/163 non-gated unit tests independently re-executed and pass (unchanged count). Migration-runner suite grew to 297/297 passing (up from 291), the exact expected delta from 04-09's new tests. Gated integration/E2E suites (now including `activateTenant.test.js`'s DB-backed block and `phase4FullFlow.test.js`'s new Journey 5) remain unexecuted against real MySQL in this sandbox — confirmed to skip cleanly, not fabricated as passing |

**Score (all 15 merged truths):** 10/15 verified (unchanged from prior cycle's raw count, but composition changed — see below), 4 upgraded from FAILED to PRESENT_BEHAVIOR_UNVERIFIED (#7, #8, #9, #13), 1 uncertain (#15). No truth remains FAILED in this cycle.

### New Truths — Plan 04-09 Gap Closure (must_haves.truths specific to this plan)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 16 | An operator can run one migration-runner CLI command (`activate-tenant --database-name=<name>`) against a business whose registry row is `provisioning`, and afterward that row is `status='active'` with `verified_at` populated | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Command exists, is structurally correct (code-confirmed), and its fail-closed guard/missing-row/missing-table paths are unit-tested and passing. The actual provisioning->active transition against a real database (the state-transition claim itself) is gated behind `RUN_ACTIVATE_TENANT_INTEGRATION` and confirmed to skip cleanly, not pass, in this sandbox (also flagged by the phase's own code review, WR-04: "core mutating behavior... has zero coverage in the always-run test suite") |
| 17 | `activate-tenant` reproduces the proven test-helper handoff — resolves the EXISTING `provisioning` row (never creates a second row), applies the real business-foundation + staff-invitations migrations, and verifies every `dgfyBusinessContract` table before flipping the registry | ✓ VERIFIED | Confirmed by direct code read (`activateTenant.js:60-135`, `applyBusinessSchema.js:34-84`): `SELECT ... WHERE database_name = ?` with an explicit `if (!registryRow) throw` (never `INSERT`); `applyAndVerifyBusinessSchema()` is called and must resolve before the `UPDATE` is ever reached; the missing-registry-row unit test asserts zero `UPDATE` calls when the row is absent, and the missing-table unit test asserts the function throws before any registry mutation could occur. WR-04 correctly notes the *success*-path ordering (verify passes -> then flip) itself is only covered by the gated DB-backed block, not a skip-safe mock — a real but narrower gap than the fail-closed paths, which are unit-proven |
| 18 | The command is registered in `buildProgram()` alongside schema/data/verify/status/rollback-plan and dispatches to its run handler | ✓ VERIFIED | `rg -n "activate-tenant" apps/dgfy-migration-runner/src/cli.js` shows the registration; `node -e` buildProgram check printed `activate-tenant registered`; `cliContract.test.js`'s two new mocked-dispatch tests (with and without `--confirm-destructive`) independently re-run and pass |
| 19 | A DB-backed test proves the full provisioning->active transition end-to-end against real MySQL, including fail-closed paths and idempotent re-run | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `activateTenant.test.js`'s `describeIfIntegration` block exists, is substantive (135 lines), and its 3 skip-safe sibling unit tests pass — but the DB-backed block itself is gated on `RUN_ACTIVATE_TENANT_INTEGRATION` and confirmed to skip (not run to a pass) in this sandbox, matching the SUMMARY's own D3 rationale ("no MySQL instance was reachable... verified to SKIP cleanly, not run to a passing result") |
| 20 | REQUIREMENTS.md and ROADMAP.md are reconciled to reflect the true state (activation mechanism now exists; real-MySQL run outstanding) | ✓ VERIFIED | Directly confirmed by reading both files: `REQUIREMENTS.md` API-02/API-03 changed from `Complete` to `Pending` with the exact honest note quoted above; `ROADMAP.md`'s Phase 4 line references "activation handoff added in 04-09" and the Plans list has a `Wave 9` entry for `04-09-PLAN.md`, with `Plans: 11/11 plans complete` |

**Score (04-09-specific truths):** 3/5 verified (16 excluded, 17/18/20 verified, 19 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js` | New apply+verify module | ✓ VERIFIED | 86 lines; exports `applyAndVerifyBusinessSchema`; imports `buildMigrationsForKind`/`MetaSequelizeStorage`/`assertDestructiveAllowed`/`dgfyBusinessContract` as described |
| `apps/dgfy-migration-runner/src/commands/activateTenant.js` | New command handler | ✓ VERIFIED | 172 lines; exports `runActivateTenant`; validate -> guard -> connect -> record -> report shape confirmed by direct read |
| `apps/dgfy-migration-runner/src/cli.js` | Registers `activate-tenant` | ✓ VERIFIED (modified) | Import + `program.command('activate-tenant')` block present, required `--database-name` option, optional `--confirm-destructive` |
| `apps/dgfy-migration-runner/tests/activateTenant.test.js` | New DB-backed + skip-safe suite | ✓ VERIFIED (exists, substantive) — DB-backed execution human-pending | 411 lines; 4 skip-safe tests pass; `describeIfIntegration` block gated on `RUN_ACTIVATE_TENANT_INTEGRATION`, confirmed to skip cleanly |
| `apps/dgfy-migration-runner/tests/cliContract.test.js` | Dispatch assertions for `activate-tenant` | ✓ VERIFIED (modified) | New mocked-dispatch tests pass with and without `--confirm-destructive` |
| `apps/dgfy-api/tests/e2e/phase4FullFlow.test.js` | New gated Journey 5 case | ✓ VERIFIED (modified) — DB-backed execution human-pending | New `describe('Journey 5: Gap Closure (04-09)...')` block confirmed present, spawns the real CLI via `execFileSync`, asserts 503 before / 201+200 after; gated on `RUN_PHASE4_E2E_INTEGRATION`, confirmed to skip cleanly |
| `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js` | Doc-comment correction only | ✓ VERIFIED (modified) | Top doc comment now references the shipped `activate-tenant` command and Journey 5's subprocess proof; exported functions unchanged (still used by 4 other gated suites) |
| `.planning/REQUIREMENTS.md` | API-02/API-03 reconciled | ✓ VERIFIED (modified) | Both the Traceability table and the v1 checklist show `Pending` with the honest note; API-01/04/05/06 unchanged |
| `.planning/ROADMAP.md` | Wave 9 entry, Phase 4 line updated | ✓ VERIFIED (modified) | `Plans: 11/11 plans complete`; Wave 9 section present; Phase 4 summary line appends the 04-09 activation note without removing prior annotations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Business creation -> registry `provisioning` row | Operator/migration-runner tenant-schema apply + verify -> registry flip to active/verified | `activate-tenant` CLI -> `applyAndVerifyBusinessSchema()` -> direct `UPDATE business_database_registry` | ✓ WIRED (was NOT_WIRED) | Confirmed by direct code read: the CLI command exists, is registered, and its internal call order (resolve row -> apply+verify -> UPDATE only on success) is code-confirmed and unit-tested on the fail-closed paths. The *actual execution* of this wiring against real MySQL is the remaining behavior-unverified item, not the wiring itself |
| Shipped command's produced state (`active` + `verified_at`) | dgfy-api `resolveDatabaseName()`/`resolveTenantSession()` Step 2 gate | Same `business_database_registry` table, read by dgfy-api's own connection | ✓ WIRED (structural) | The gate itself is unchanged and was already confirmed correct in the prior cycle; this cycle confirms the upstream write-side (the CLI) now exists to satisfy it. End-to-end observation of a real write succeeding post-activation is the Journey 5 behavior-unverified item |
| `buildProgram()` registration | `runActivateTenant` handler | Commander `.action()` callback | ✓ WIRED | Confirmed by `node -e` buildProgram check and `cliContract.test.js`'s mocked-dispatch tests, both independently re-run and passing |
| `phase4FullFlow.test.js` Journey 5 | Real `activate-tenant` CLI | `child_process.execFileSync` subprocess spawn (never in-process import) | ✓ WIRED | Confirmed by direct code read: `execFileSync('node', [MIGRATION_RUNNER_CLI_PATH, 'activate-tenant', '--database-name', databaseName], ...)`, respecting the runner<->dgfy-api package boundary |
| `tenantSchemaProvisioning.js` doc comment | Shipped `activate-tenant` command | Doc-comment cross-reference | ✓ WIRED | Confirmed: comment now reads "that operator/migration-runner handoff now SHIPS as a real, production CLI command" rather than describing an unbuilt mechanism |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `activateTenant.js` `runActivateTenant()` | registry row status/verified_at | Direct parameterized `SELECT`/`UPDATE` against `dgfy_core.business_database_registry` on the runner's own `TARGET_DB` connection | Yes, when reachable | ✓ FLOWING (code-level, unit-tested fail-closed paths) / behavior of the success-path transition unexercised in this sandbox |
| `applyBusinessSchema.js` `applyAndVerifyBusinessSchema()` | executed migrations, verified tables | `buildMigrationsForKind('business', ...)` + `context.showAllTables()` against the tenant connection | Yes, when reachable | ✓ FLOWING (code-level; missing-table failure path is unit-tested with a fake queryInterface and passes) |
| `businessController.js`/`locationController.js`/`tenantSessionController.js` (unchanged from prior cycle) | business/location/staff/session records | Real Sequelize models over `TenantConnector`, now genuinely reachable once `activate-tenant` runs | Yes, when reachable | ✓ FLOWING (code-level) / practical end-to-end reachability now depends on the newly-shipped mechanism, unexercised in this sandbox |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration-runner full unit suite passes (skip-safe) | `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | `Test Suites: 3 skipped, 21 passed, 21 of 24 total; Tests: 5 skipped, 297 passed, 302 total` | ✓ PASS |
| `activate-tenant`/`cliContract` targeted suite passes | `... --runInBand tests/activateTenant.test.js tests/cliContract.test.js` | `Test Suites: 2 passed, 2 total; Tests: 2 skipped, 11 passed, 13 total` | ✓ PASS |
| `activate-tenant` registered in `buildProgram()` | `node -e "import('./src/cli.js').then(m => {...})"` | `activate-tenant registered` | ✓ PASS |
| dgfy-api default suite unchanged/regression-free | `cd apps/dgfy-api && npm test` | `Test Suites: 16 skipped, 12 passed, 12 of 28 total; Tests: 190 skipped, 163 passed, 353 total` | ✓ PASS (identical count to prior cycle) |
| Architecture guardrails unchanged | `npm run check:architecture:dgfy-api` | `OK. Checked 3 modules and 40 code files.` / `OK. Checked 6 controller files with no unauthorized model imports.` | ✓ PASS (identical to prior cycle) |
| Lint (dgfy-api) | `cd apps/dgfy-api && npm run lint` | `10 problems (0 errors, 10 warnings)` — all pre-existing `no-unused-vars` in catch blocks | ✓ PASS |
| `activate-tenant`/`child_process` wiring present in Journey 5 | `rg -n "activate-tenant\|child_process\|execFileSync\|spawnSync" apps/dgfy-api/tests/e2e/phase4FullFlow.test.js` | Matches found at lines 2, 27, 539-599 | ✓ PASS |
| Debt-marker gate (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) across all 7 reviewed files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` per file | No matches in any of the 7 files | ✓ PASS (clean) |
| Gated DB-backed activate-tenant suite | `RUN_ACTIVATE_TENANT_INTEGRATION=true npm test -- tests/activateTenant.test.js` | No MySQL reachable in this sandbox | ? SKIP — routed to human verification |
| Gated dgfy-api E2E Journey 5 | `RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/e2e/phase4FullFlow.test.js` | No MySQL reachable in this sandbox | ? SKIP — routed to human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| API-01 | 04-01, 04-02 | Accounts APIs: registration/login, profile/session, account lookup | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` marks Complete — verification agrees |
| API-02 | 04-03, 04-03.5, 04-06, 04-07, 04-09 | Businesses APIs: creation, selection, branch registry, owner/manager scope | ? NEEDS HUMAN | Structural blocker closed by 04-09 (operator activation mechanism now exists in shipped code); `REQUIREMENTS.md` correctly marks `Pending` with an honest note rather than overclaiming Complete — this verification agrees the marking is now accurate |
| API-03 | 04-04, 04-06, 04-08, 04-09 | Tenancy APIs: registry lookup, provisioning metadata, context selection, session creation | ? NEEDS HUMAN | Same reasoning as API-02; `REQUIREMENTS.md` correctly marks `Pending` — this verification agrees |
| API-04 | 04-04, 04-08 | Tenant session security (membership + assignment) | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` marks Complete — verification agrees |
| API-05 | all waves, esp. 04-06/04-08/04-09 | Clean Architecture layering, transport-only controllers | ✓ SATISFIED | `check:architecture:dgfy-api` passes; `activate-tenant` follows the same command-handler conventions as sibling commands; `REQUIREMENTS.md` marks Complete — verification agrees |
| API-06 | all waves, esp. 04-07/04-08/04-09 | Comprehensive testing: success, validation, conflict, replay, logout, persistence | ? NEEDS HUMAN | Written coverage is comprehensive and grew further with 04-09 (297 unit tests in migration-runner, up from 291; 2 new gated DB-backed suites). `REQUIREMENTS.md` marks Complete for the *written-coverage* sense of this requirement, but the DB-backed suites still require a human with real MySQL access to obtain a genuine pass/fail result — same disclosed limitation as the prior two cycles |

**Orphaned requirements check:** No requirement IDs map to Phase 4 in `REQUIREMENTS.md` beyond API-01 through API-06, and all six appear across the phase's plans' `requirements` frontmatter fields (04-09 declares `["API-02", "API-03"]`). No orphans found.

**REQUIREMENTS.md discrepancy:** None found in this cycle — the prior cycle's flagged premature "Complete" marking for API-02/API-03 has been corrected to "Pending" with an accurate, honest note, matching this verification's own independent assessment.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/dgfy-migration-runner/src/commands/activateTenant.js` | 70-135 | WR-01 (04-REVIEW.md): no precondition check on `registryRow.status` before reactivating — a hypothetical `'migrating'`/`'deprecated'` row would be silently reactivated to `'active'` | ⚠️ Warning | Real but currently latent: independently confirmed via `grep` that nothing in either package's `src/` ever writes `'migrating'` or `'deprecated'` to this column today, so this cannot be triggered by the shipped codebase as it stands. Recommended hardening, not a phase-goal blocker |
| `apps/dgfy-migration-runner/src/commands/activateTenant.js` | 64-135 | WR-02 (04-REVIEW.md): no concurrency guard (no transaction/lock) between the registry SELECT and the activating UPDATE | ⚠️ Warning | Real race-condition risk for concurrent invocations against the same `database_name`; non-blocking for the single-operator activation flow this phase targets |
| `apps/dgfy-migration-runner/src/commands/activateTenant.js` | 132-160 | WR-03 (04-REVIEW.md): registry mutation commits before audit/report bookkeeping, so a post-mutation report/record failure is misreported as `'failed'` even though activation succeeded | ⚠️ Warning | Observability/audit-trail issue only; does not affect whether the activation itself succeeds |
| `apps/dgfy-migration-runner/tests/activateTenant.test.js` | 108-271 vs. 277-411 | WR-04 (04-REVIEW.md): the core mutating behavior (happy path + idempotent re-verify) has zero coverage in the always-run (skip-safe) suite — only the gated `describeIfIntegration` block exercises it | ⚠️ Warning | Directly corroborates this verification's own PRESENT_BEHAVIOR_UNVERIFIED classification of truths #7/#8/#9/#13/#16/#19 above — this is the same root limitation, not a new independent risk |
| `apps/dgfy-migration-runner/src/commands/activateTenant.js` | 80-159 | WR-05 (04-REVIEW.md): near-verbatim report-building/write/record duplication between the idempotent and non-idempotent branches | ⚠️ Warning | Code-quality/maintainability issue only; no functional impact |
| No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 7 files 04-09 modified | — | — | — | Clean — debt-marker gate does not fire |

**Note on severity:** All 5 warnings above are drawn directly from `04-REVIEW.md` (0 critical / 5 warning / 4 info, `status: issues_found`) and are independently corroborated by this verification's own code reading. None rises to Blocker: the review found the plan's own STRIDE threat-model requirements (T-04-09-01 through T-04-09-SC) all hold under inspection, and this verification's own re-run of the guard/fail-closed unit tests confirms the security-relevant paths (wrong-database rejection, never-second-row-insert, verify-before-flip on the failure side) are real and tested. WR-01/WR-02/WR-03/WR-05 are hardening recommendations for a future pass; WR-04 is the same underlying "no MySQL reachable" limitation already reflected in this report's `behavior_unverified_items`, not a distinct new gap.

## Human Verification Required

### 1. Run the 04-09-specific gated DB-backed proof suites against real MySQL

**Test:** `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> npm test -- tests/activateTenant.test.js` and `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> npm test -- tests/e2e/phase4FullFlow.test.js` against a disposable MySQL 8 instance.
**Expected:** Both suites pass: a `provisioning` registry row genuinely transitions to `active`/verified with every `dgfyBusinessContract` table present; a second `activate-tenant` run is a safe no-op; and a dgfy-api tenant write for that business moves from 503 (pre-handoff) to 201 (post-handoff) after the real CLI subprocess exits 0.
**Why human:** No MySQL server is reachable in this sandbox. This verification independently confirmed both gated blocks skip cleanly (not run to a pass) and that the skip-safe unit tests around them (guard rejection, missing-row, missing-table) pass — corroborating the SUMMARY's own honest disclosure rather than trusting it blindly. A human with real MySQL access must obtain the actual pass/fail result. Once green, update `REQUIREMENTS.md` API-02/API-03 from `Pending` to `Complete` per the SUMMARY's own instruction.

### 2. Run the phase's remaining previously-gated integration/E2E suites (business/staff/session flows)

**Test:** `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js` against the same disposable MySQL instance.
**Expected:** All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in, whose doc comment now correctly cites the shipped `activate-tenant` CLI.
**Why human:** No MySQL server is reachable in this sandbox — carried over from the prior two verification cycles, now meaningfully closer to a genuine pass since the activation mechanism these suites' stand-in emulates actually ships in production code.

## Gaps Summary

No gaps remain in this cycle. Plan 04-09 structurally closed the prior cycle's single blocking finding ("no production-reachable mechanism to move a business's tenant registry row from provisioning to active/verified") by shipping an operator-invokable `activate-tenant` CLI command that this verification independently confirmed exists, is registered, is structurally correct (resolves the existing row, never creates a duplicate, verifies the tenant schema before flipping the registry, fails closed on every guarded precondition), and is unit-tested on its fail-closed paths — all re-confirmed by directly reading the code and independently re-running the test suites, not by trusting the SUMMARY's narrative.

What remains is a behavioral proof, not a structural one: the actual provisioning->active/verified state transition, and the corresponding dgfy-api 503->201 write-success transition, have not been exercised against a real MySQL instance in this sandbox — a limitation consistently and honestly disclosed across all three verification cycles of this phase (04-VERIFICATION.md's original cycle, its gap-closure re-verification, and this one). This routes the phase to `human_needed` rather than `passed`: every remaining item is a genuine "please run this against real MySQL and confirm" request, not a code deficiency this verification found and is withholding.

The phase's own scoped code review of the 7 new/changed files (`04-REVIEW.md`, 0 critical/5 warning/4 info) surfaced real hardening opportunities (registry-status precondition, concurrency guard, audit-ordering, success-path test coverage, code duplication) that this verification independently corroborates but classifies as non-blocking for the same reasons the review itself gives — none of them prevent the golden path this phase targets from working, and the one warning with the most plausible real-world bite (WR-01, silent reactivation of a hypothetical `'migrating'`/`'deprecated'` row) was independently confirmed to be currently unreachable, since nothing in the shipped codebase ever writes those statuses.

---

_Verified: 2026-07-12T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
