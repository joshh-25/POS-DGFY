---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 09
subsystem: api
tags: [migration-runner, umzug, sequelize, commander, cli, tenancy, multi-tenant]

requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: business_database_registry (dgfy_core), findOrCreateForBusiness()/updateStatus() (04-06), tenantSessionUseCases active/verified gate (04-07/04-08)
provides:
  - "activate-tenant CLI subcommand (apps/dgfy-migration-runner) — an operator-invokable production mechanism to move a business's tenant registry row from provisioning to active/verified"
  - "applyAndVerifyBusinessSchema() production module reused by the new command, built from the runner's own buildMigrationsForKind/MetaSequelizeStorage/assertDestructiveAllowed pieces"
  - "gated DB-backed proof suites (activateTenant.test.js, phase4FullFlow.test.js Journey 5) proving the provisioning->active/verified transition and a real dgfy-api write succeeding after the shipped CLI runs"
affects: [phase-05-compatibility-and-cutover, phase-06-release-evidence]

tech-stack:
  added: []
  patterns:
    - "Command handlers keep the validate -> guard -> connect -> record -> report shape (mirrors runSchemaMigrate/runStatus)"
    - "Registry-row activation is a direct, contract-faithful UPDATE keyed on the unique database_name from the runner's own connection, never a cross-package call into dgfy-api's updateStatus()"

key-files:
  created:
    - apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js
    - apps/dgfy-migration-runner/src/commands/activateTenant.js
    - apps/dgfy-migration-runner/tests/activateTenant.test.js
  modified:
    - apps/dgfy-migration-runner/src/cli.js
    - apps/dgfy-migration-runner/tests/cliContract.test.js
    - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js
    - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Chosen mechanism: a direct, contract-faithful UPDATE against dgfy_core.business_database_registry from the runner's own TARGET_DB connection (never importing dgfy-api's updateStatus()), keyed on the unique database_name rather than business_id — locked in the plan's Rationale section"
  - "Idempotency: re-running activate-tenant against an already active/verified row re-verifies the schema and reports already_active:true instead of issuing a second UPDATE or erroring"
  - "No MySQL instance was reachable in this executor environment (ECONNREFUSED on 127.0.0.1:3306) — REQUIREMENTS.md API-02/API-03 were reconciled to Pending (not Complete) rather than claiming an unearned DB-backed pass"

requirements-completed: []

coverage:
  - id: D1
    description: "activate-tenant CLI command registered in buildProgram() and reachable via `dgfy-migration-runner activate-tenant --database-name=<name>`"
    requirement: "API-05"
    verification:
      - kind: unit
        ref: "tests/cliContract.test.js#argv ['activate-tenant','--database-name','dgfy_business_test'] calls runActivateTenant with { databaseName: 'dgfy_business_test', confirmDestructive: false }"
        status: pass
      - kind: other
        ref: "node -e buildProgram() registration check (prints 'activate-tenant registered')"
        status: pass
    human_judgment: false
  - id: D2
    description: "runActivateTenant fails closed on a non-business database_name, a missing registry row, and a failed schema verification, without ever opening an unintended connection or writing the registry"
    requirement: "API-02"
    verification:
      - kind: unit
        ref: "tests/activateTenant.test.js#rejects a non-business database_name (dgfy_core) with a TargetGuardError and never opens a connection or writes the registry"
        status: pass
      - kind: unit
        ref: "tests/activateTenant.test.js#fails closed with no matching business_database_registry row and never attempts a schema apply"
        status: pass
      - kind: unit
        ref: "tests/activateTenant.test.js#throws listing missing tables when the tenant connection is missing a dgfyBusinessContract table"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real MySQL DB-backed proof: activate-tenant moves a provisioning business_database_registry row to active/verified, applies every dgfyBusinessContract table, and is idempotent on re-run"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "tests/activateTenant.test.js#activates the provisioning row to active/verified and applies every dgfyBusinessContract table (gated on RUN_ACTIVATE_TENANT_INTEGRATION)"
        status: unknown
      - kind: integration
        ref: "tests/activateTenant.test.js#the exact gate precondition dgfy-api enforces is satisfiable and a second run is an idempotent no-op (gated on RUN_ACTIVATE_TENANT_INTEGRATION)"
        status: unknown
    human_judgment: true
    rationale: "No MySQL instance was reachable in this sandboxed executor environment (ECONNREFUSED on 127.0.0.1:3306). Both gated tests were verified to SKIP cleanly, not run to a passing result — a human with real MySQL access must run RUN_ACTIVATE_TENANT_INTEGRATION=true npm test -- tests/activateTenant.test.js to confirm this deliverable."
  - id: D4
    description: "Real dgfy-api E2E proof: a tenant write for a business goes from 503 (pre-handoff) to 201 (post-handoff) after the shipped activate-tenant CLI runs as a real subprocess"
    requirement: "API-03"
    verification:
      - kind: e2e
        ref: "apps/dgfy-api/tests/e2e/phase4FullFlow.test.js#Journey 5: spawns the real activate-tenant CLI and turns a pre-handoff 503 tenant write into a post-handoff 201 (gated on RUN_PHASE4_E2E_INTEGRATION)"
        status: unknown
    human_judgment: true
    rationale: "No MySQL instance was reachable in this sandboxed executor environment. The gated E2E suite was verified to SKIP cleanly, not run to a passing result — a human with real MySQL access must run RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/e2e/phase4FullFlow.test.js to confirm this deliverable."
  - id: D5
    description: "REQUIREMENTS.md/ROADMAP.md reconciled honestly: API-02/API-03 set to Pending (not Complete) with a note that the activation mechanism now exists and only the real-MySQL run is outstanding; ROADMAP Wave 9 added"
    requirement: "API-02"
    verification:
      - kind: other
        ref: "rg -n 'activate-tenant|04-09' .planning/REQUIREMENTS.md .planning/ROADMAP.md"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-12
status: complete
---

# Phase 04 Plan 09: Operator Tenant-Activation CLI Summary

**Shipped `activate-tenant` CLI subcommand in apps/dgfy-migration-runner that applies + verifies a provisioned dgfy_business_* tenant schema and flips its business_database_registry row from provisioning to active/verified, closing Phase 04's last structural gap.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- Production `activate-tenant --database-name=<name>` CLI command that reproduces, in shipped code, the exact provisioning->active/verified handoff the test-only helper previously proved in isolation
- `applyAndVerifyBusinessSchema()` module built from the runner's own reusable pieces (`buildMigrationsForKind`, `MetaSequelizeStorage`, `assertDestructiveAllowed`) so future business-kind migrations are picked up automatically, with no hardcoded migration filenames
- Fail-closed guards: rejects non-`dgfy_business_*` database names before any connection opens, fails closed on a missing registry row, and never flips the registry unless every `dgfyBusinessContract` table verifies present
- Idempotent re-run: activating an already active/verified business re-confirms the schema and reports a safe no-op instead of a duplicate mutation or error
- Skip-safe unit test coverage (guard rejection, missing-row fail-closed, missing-table verification error) plus gated DB-backed suites (transition proof, idempotency proof, and a real dgfy-api E2E case that spawns the shipped CLI via `child_process` and proves a tenant write moves from 503 to 201)
- REQUIREMENTS.md/ROADMAP.md honestly reconciled: API-02/API-03 set to Pending (mechanism now exists; end-to-end DB-backed proof still outstanding) rather than left at an unearned "Complete"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the activate-tenant apply-and-verify module, command handler, and CLI registration** - `5a07536c` (feat)
2. **Task 2: Prove the provisioning->active/verified transition and real dgfy-api reachability** - `6bcbe07b` (test)
3. **Task 3: Reconcile REQUIREMENTS.md and ROADMAP.md honestly** - `0f31a1a9` (docs)

**Plan metadata:** (this commit, following SUMMARY.md creation)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js` - Production analog of the test helper's applyAndVerifyBusinessSchema; applies business-kind migrations and verifies dgfyBusinessContract tables
- `apps/dgfy-migration-runner/src/commands/activateTenant.js` - `runActivateTenant()`: resolve existing registry row -> apply+verify tenant schema -> UPDATE registry to active/verified, fail-closed throughout
- `apps/dgfy-migration-runner/src/cli.js` - Registers the new `activate-tenant` subcommand in `buildProgram()`
- `apps/dgfy-migration-runner/tests/activateTenant.test.js` - Skip-safe unit tests + gated DB-backed transition/idempotency proof
- `apps/dgfy-migration-runner/tests/cliContract.test.js` - `activate-tenant` added to `--help` list and mocked-dispatch assertions
- `apps/dgfy-api/tests/e2e/phase4FullFlow.test.js` - New gated Journey 5 spawning the shipped CLI via `child_process`, proving 503->201
- `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js` - Doc comment now references the shipped `activate-tenant` command (behavior unchanged)
- `.planning/REQUIREMENTS.md` - API-02/API-03 set to Pending with an honest note
- `.planning/ROADMAP.md` - Phase 4 line and Plans list reference the 04-09 activation handoff; Wave 9 marked complete

## Decisions Made

- Registry activation is a direct, contract-faithful `UPDATE business_database_registry SET status=?, verified_at=?, updated_at=? WHERE database_name=?` issued from the runner's own `dgfy_core` connection — never a cross-package call into dgfy-api's `updateStatus()` — per the plan's locked Rationale section (respects the runner<->dgfy-api package boundary; keys on the unique `database_name` rather than the non-unique `business_id`)
- Idempotency handling: an already active/verified row is re-verified (schema still satisfies the contract) and reported as `already_active: true` rather than re-issuing the UPDATE or throwing
- Given no reachable MySQL in this executor environment, REQUIREMENTS.md API-02/API-03 were set to Pending (not Complete) — following this phase's own honesty precedent (commit 7c838534) rather than claiming an unearned DB-backed pass

## Deviations from Plan

None - plan executed exactly as written. The plan itself explicitly anticipated the "no MySQL reachable" scenario and directed exactly the Pending reconciliation performed in Task 3.

## Issues Encountered

- `tests/cliContract.test.js`'s existing mocked-dispatch `describe` block only mocks `../src/commands/schema.js` with a `runSchemaMigrate` export; once `cli.js` started importing the new `activateTenant.js` (which transitively imports `buildMigrationsForKind` from `schema.js`), that block's real import chain broke with `SyntaxError: does not provide an export named 'buildMigrationsForKind'`. This was an expected transient state between Task 1 (implementation) and Task 2 (test mocking) — resolved by Task 2 adding a `jest.unstable_mockModule('../src/commands/activateTenant.js', ...)` mock alongside the existing ones, which intercepts the import chain before it reaches the real `schema.js`. Confirmed fixed: full `apps/dgfy-migration-runner` suite passes (21 suites, 297 tests, 3 gated/skipped) after Task 2's commit.
- Jest ESM module-mock leakage: `jest.unstable_mockModule()` registrations for a given specifier persist across `jest.resetModules()` within the same test file (a caution already documented in `schemaCommand.test.js`). The "missing-table verification error" unit test needed the REAL `applyBusinessSchema.js`, but two earlier describe blocks in the same file mock that exact specifier — resolved by declaring the real-module test's `describe` block FIRST in the file, before any mock for that specifier is ever registered.

## User Setup Required

None - no external service configuration required. Running the gated DB-backed proof suites requires a disposable MySQL 8 instance and the `RUN_ACTIVATE_TENANT_INTEGRATION=true` / `RUN_PHASE4_E2E_INTEGRATION=true` env flags plus `BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD` (or `DB_HOST/PORT/USER/PASSWORD`) credentials — see the plan's `user_setup` frontmatter. Exact commands for a human to run:

```bash
cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true \
  BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> \
  npm test -- tests/activateTenant.test.js

cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true \
  BUSINESS_IT_DB_HOST=<host> BUSINESS_IT_DB_USER=<user> BUSINESS_IT_DB_PASSWORD=<password> \
  npm test -- tests/e2e/phase4FullFlow.test.js
```

When these pass against real MySQL, update REQUIREMENTS.md API-02/API-03 from Pending to Complete (remove the parenthetical note).

## Next Phase Readiness

- Phase 04's single remaining structural gap (04-VERIFICATION.md) is closed: a production-reachable mechanism now exists to move a business's tenant registry row from `provisioning` to `active`/`verified`, making SC2/SC3 reachable in a real deployment.
- Blocker for full API-02/API-03 completion: a human must run the two gated DB-backed suites above against a real MySQL instance and flip REQUIREMENTS.md to Complete once green.
- No new architectural surface was introduced; Phase 5 (Compatibility and Backend-First Cutover Seam) can proceed independently of this outstanding human-verification item.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js
- FOUND: apps/dgfy-migration-runner/src/commands/activateTenant.js
- FOUND: apps/dgfy-migration-runner/tests/activateTenant.test.js
- FOUND: .planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-09-SUMMARY.md
- FOUND commit: 5a07536c (feat: activate-tenant CLI command and schema-apply module)
- FOUND commit: 6bcbe07b (test: activate-tenant transition, CLI dispatch, dgfy-api reachability)
- FOUND commit: 0f31a1a9 (docs: reconcile API-02/API-03 to Pending)
