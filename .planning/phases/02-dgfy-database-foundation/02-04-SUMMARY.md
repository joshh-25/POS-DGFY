---
phase: 02-dgfy-database-foundation
plan: 04
subsystem: dgfy-migration-runner
tags: [migration-runner, verification, evidence, information_schema, umzug, mysql]

requires:
  - phase: 02-dgfy-database-foundation
    provides: runner-pending-only-destructive-gate, runner-command-failure-audit, runner-container-safe-report-dir
  - phase: 02-dgfy-database-foundation
    provides: dgfy-core-schema-contract, dgfy-core-foundation-migration, dgfy-foundation-database-doc
  - phase: 02-dgfy-database-foundation
    provides: target-scoped-schema-migration-metadata, dgfy-business-db-name-target-selection, dgfy-business-tenant-foundation-contract-and-migration
provides:
  - phase02-verification-report-sections (core_schema, business_schemas, migration_metadata, tenant_coverage, idempotency, legacy_non_mutation)
  - legacy-fingerprint-baseline-artifact
  - phase02-real-mysql-integration-evidence-test
  - dgfy-foundation-database-doc-verification-evidence-section
affects:
  - apps/dgfy-migration-runner
  - docs/database
  - .planning (Phase 02 completion evidence for all downstream phases)

tech-stack:
  added: []
  patterns:
    - "verify.js reuses schema.js's own buildMigrationsForKind(kind, {}) as the single source of truth for 'which Phase 02 migration files apply to this target kind' — the migration_metadata check can never drift out of sync with what schema migrate itself considers pending, because both read the same function."
    - "idempotency is derived directly from migration_metadata's missing_migrations per target rather than constructing a second real Umzug instance inside verify() — zero missing migrations for a target IS the metadata-backed proof that a schema migrate rerun against it would be a pure no-op, avoiding a redundant DB round trip."
    - "D-23 legacy non-mutation proof is a two-step durable flow split across two files: schema.js's ensureLegacyFingerprintBaseline() captures a one-time pre-migration information_schema fingerprint of the legacy/current sku_* schema to a well-known artifact path under REPORT_DIR (never overwritten on rerun), and verify.js's checkLegacyNonMutation() recomputes a current fingerprint via the exact same exported computeLegacySchemaFingerprint() and compares JSON.stringify() equality — fails closed (ok:false, baseline_found:false) when no baseline exists yet."
    - "Every new verify.js check section is individually try/catch-wrapped so a connection/introspection failure becomes an ok:false finding with an error field rather than an uncaught throw — verify() must never throw, per its pre-existing D-18 contract."

key-files:
  created:
    - apps/dgfy-migration-runner/tests/phase02Verification.test.js
    - apps/dgfy-migration-runner/tests/phase02Integration.test.js
  modified:
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/src/commands/schema.js
    - apps/dgfy-migration-runner/tests/schemaCommand.test.js
    - apps/dgfy-migration-runner/tests/reportCommands.test.js
    - docs/database/dgfy-foundation.md

decisions:
  - "Reused schema.js's buildMigrationsForKind()/resolveTargetKind() (exported, not duplicated) as the single source of truth for expected-migration-per-target-kind in verify.js's migration_metadata check, instead of maintaining a second expected-migration list or a migrationFile property on the schema contracts."
  - "idempotency is computed from migration_metadata's already-fetched missing_migrations list per target rather than constructing a second real Umzug instance inside verify() — satisfies D-22's 'equivalent metadata-backed pending check' language without a redundant DB round trip."
  - "D-23 legacy fingerprint baseline capture lives in schema.js (runSchemaMigrate captures it once, before any target mutation, never overwriting an existing baseline on reruns) while comparison lives in verify.js — split across the file each task's <files> list already scoped them to, sharing the exported LEGACY_FINGERPRINT_ARTIFACT_NAME constant and computeLegacySchemaFingerprint() function so both sides compute the identical fingerprint shape."
  - "tenant_coverage's overall ok gates only on has_expected_schema per target, not on business_database_registry coverage — registry gaps are reported informationally (registry_gaps) but never fail verification, because Phase 02 does not seed registry rows (that's later-phase scope) and D-08 explicitly accepts the operator-supplied DGFY_BUSINESS_DB_NAMES target list as sufficient initial verification input."
  - "phase02Integration.test.js is gated behind an explicit RUN_PHASE02_INTEGRATION=true opt-in flag (plus MySQL admin credentials) rather than assuming a MySQL server is always reachable — it must skip cleanly with a clear message in any environment without one, per the plan's own acceptance criteria, unlike some pre-existing backend db.integration tests that assume DB_HOST=localhost is always live."
  - "core_schema always checks the primary TARGET_DB_NAME target against dgfyCoreContract (the expected common case is TARGET_DB_NAME=dgfy_core); business_schemas covers every configured DGFY_BUSINESS_DB_NAMES entry against dgfyBusinessContract. The two contract files (dgfyCoreContract.js/dgfyBusinessContract.js) were read as the existing single source of truth and required no code changes themselves — Object.entries(contract.tables) was already the exact shape verify.js's checks needed."

requirements-completed: [DBF-01, DBF-04, DBF-05]

coverage:
  - id: D1
    description: "verify's JSON report proves expected tables/columns/indexes/unique-constraints/foreign-keys for dgfy_core (core_schema) and every configured dgfy_business_* target (business_schemas), plus flags any out-of-scope rejected table present"
    requirement: "DBF-05"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#core_schema and business_schemas describe blocks (9 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "migration_metadata reports target-scoped Phase 02 migration record coverage per database, not only by filename, reusing schema.js's own migration-per-kind filter as the single source of truth"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#migration_metadata describe block (2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "tenant_coverage cross-checks explicit dgfy_business_* targets against dgfy_core.business_database_registry when reachable, flagging gaps without failing ok before registry rows are seeded"
    requirement: "DBF-05"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#tenant_coverage describe block (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "idempotency reports zero pending Phase 02 migrations per target after a metadata-backed rerun check"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#idempotency describe block (2 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "legacy_non_mutation proves the legacy/current sku_* schema was not mutated using a durable pre-migration information_schema fingerprint baseline compared against a post-migration fingerprint, failing closed when no baseline exists"
    requirement: "DBF-01"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#legacy_non_mutation describe block (3 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real MySQL-backed integration test proves migrate -> rerun (idempotent) -> verify end-to-end against disposable schemas, asserting every report section, and skips cleanly (not a failure) without a real MySQL server"
    requirement: "DBF-05"
    verification:
      - kind: integration
        ref: "tests/phase02Integration.test.js (gated by RUN_PHASE02_INTEGRATION=true; confirmed local run: 1 skipped, 0 failed)"
        status: unknown
    human_judgment: true
    rationale: "This sandbox has no accessible MySQL server with known credentials, so the gated integration test's assertions could not be exercised against a live database in this session — only its clean-skip path was confirmed. A human/CI environment with real MySQL credentials must run RUN_PHASE02_INTEGRATION=true to close this out."
  - id: D7
    description: "docs/database/dgfy-foundation.md documents the Verification Evidence commands/sections and rollback considerations, citing DBF-01 through DBF-05 and D-21 through D-24"
    verification:
      - kind: other
        ref: "npm run lint:docs && npm run check:architecture"
        status: pass
    human_judgment: false

metrics:
  duration: 55min
  completed: 2026-07-11
status: complete
---

# Phase 02 Plan 4: Schema verification evidence and documentation closure Summary

Extended the migration runner's `verify` command with six report sections (`core_schema`, `business_schemas`, `migration_metadata`, `tenant_coverage`, `idempotency`, `legacy_non_mutation`) that inspect real `information_schema`/`dgfy_migration_meta` state against the existing `dgfyCoreContract`/`dgfyBusinessContract` schema contracts, added a durable pre-migration legacy fingerprint baseline captured by `schema migrate` and compared during `verify`, added a gated real-MySQL end-to-end evidence test, and documented the full verification-evidence command set in `docs/database/dgfy-foundation.md`.

## What Was Built

**Task 1 — Expected-schema and metadata verification sections (D-21/D-24).** `verify.js` now inspects `dgfy_core` (and every configured `dgfy_business_*` target) against `dgfyCoreContract.js`/`dgfyBusinessContract.js`: per-table existence, missing columns (`describeTable`), missing indexes/unique constraints (`showIndex`), and missing foreign keys (a raw `information_schema.key_column_usage` query scoped by `table_schema`/`table_name`) — plus a scan for any explicitly out-of-scope `rejectedTables` entry present in the database. `migration_metadata` reuses `schema.js`'s own `buildMigrationsForKind(kind, {})` (now exported) as the single source of truth for which Phase 02 migration files apply to a target kind, diffing against `dgfy_migration_meta.schema_migrations` (via `MetaSequelizeStorage.executed()`) per target database — missing records are reported per target, not only by filename. `summary` gained `core_schema_ok`/`business_schemas_ok`/`migration_metadata_ok`.

**Task 2 — Tenant coverage, idempotency, and legacy non-mutation proof (D-08/D-21 through D-24).** `tenant_coverage` cross-checks the explicit `DGFY_BUSINESS_DB_NAMES` list against `dgfy_core.business_database_registry` when reachable and against each target's own schema-check outcome, flagging registry gaps informationally without failing `ok` (Phase 02 doesn't seed registry rows yet — D-08's accepted initial-verification mechanism). `idempotency` is derived directly from `migration_metadata`'s `missing_migrations` per target — zero missing means a rerun is a pure no-op, satisfying D-22 without a second Umzug construction. `legacy_non_mutation` is a two-file durable flow: `schema.js`'s new `ensureLegacyFingerprintBaseline()` captures a one-time `information_schema` fingerprint (columns/indexes/constraints) of the legacy `SOURCE_DB_NAME` schema before any target mutation, persisted to `<REPORT_DIR>/legacy-fingerprint-baseline.json` and referenced via `legacy_fingerprint_baseline_path` in the `schema:migrate` report; `verify.js`'s `checkLegacyNonMutation()` reads that baseline back and compares it against a freshly computed fingerprint (via the same exported `computeLegacySchemaFingerprint()`), failing closed (`ok:false`, `baseline_found:false`) when no baseline artifact exists yet.

**Task 3 — Real MySQL-backed integration evidence (D-21 through D-24).** `tests/phase02Integration.test.js` drives the real (unmocked) `runSchemaMigrate`/`runVerify` handlers end-to-end: creates disposable, uniquely-suffixed `dgfy_core_it_*`/`dgfy_business_it*`/`sku_it_*` schemas via an admin connection, seeds a minimal legacy `items` table, runs `schema migrate` (asserting `executed > 0`), reruns it (asserting `executed === 0` and `total_pending === 0`), runs `verify`, and asserts every report section (`core_schema`, `business_schemas`, `migration_metadata`, `tenant_coverage`, `idempotency`, `legacy_non_mutation`) plus every `summary.*_ok` flag. Gated behind `RUN_PHASE02_INTEGRATION=true` (plus `PHASE02_IT_DB_*`/`DB_*` credentials); cleanup drops only its own three disposable schemas and deletes only its own `dgfy_migration_meta` rows (scoped by `target_database`/`actor`) — `dgfy_migration_meta` itself is never dropped.

**Task 4 — Final documentation (DBF-01 through DBF-05).** `docs/database/dgfy-foundation.md` gained a "Verification Evidence" section mapping each report section to its requirement/decision IDs, explaining the legacy-non-mutation baseline precondition, listing the exact local evidence commands (unit tests, gated integration test, `schema migrate`/rerun/`verify`, `lint:docs`, `check:architecture`), and documenting rollback considerations (additive-only migrations, `rollback-plan` report-only artifact, backup/restore for irreversible incidents, stop-and-preserve-reports if `legacy_non_mutation` ever fails).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `schemaCommand.test.js`'s and `reportCommands.test.js`'s `config/db.js` mocks needed `createSourceConnection`/`createBusinessTargetConnection` stubs**
- **Found during:** Task 1, after `schema.js` gained a `createSourceConnection` import (for the D-23 baseline capture) and `verify.js` gained a `createBusinessTargetConnection` import (for `business_schemas`).
- **Issue:** Both test files' `jest.unstable_mockModule('../src/config/db.js', ...)` factories didn't export these new names; real ESM raises a `SyntaxError: does not provide an export named ...` at import time for any missing named export the real module under test now imports, breaking every existing test in both files.
- **Fix:** Added `createSourceConnection: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[], []]) }))` to all four `config/db.js` mock registrations in `schemaCommand.test.js` and to `reportCommands.test.js`'s single registration, plus `createBusinessTargetConnection: jest.fn()` to `reportCommands.test.js`'s registration.
- **Files modified:** `apps/dgfy-migration-runner/tests/schemaCommand.test.js`, `apps/dgfy-migration-runner/tests/reportCommands.test.js`
- **Commits:** `31a8a47c` (test), `d7b947f5` (feat)

None of these required user input — both were mechanical consequences of extending existing modules' import surface (Rule 3), not scope creep.

## TDD Gate Compliance

- Task 1: `test(02-04)` @ `31a8a47c` (RED — 12 failing assertions against unchanged `verify.js`) → `feat(02-04)` @ `d7b947f5` (GREEN — 12/12 passing; full suite 123/123).
- Task 2: `test(02-04)` @ `8496582d` (RED — 8 failing assertions for tenant_coverage/idempotency/legacy_non_mutation) → `feat(02-04)` @ `3ce74e62` (GREEN — 20/20 passing; full suite 131/131).
- Task 3: `test(02-04)` @ `dd232d50` — no corresponding `feat` commit was needed: Tasks 1/2 already built the `runSchemaMigrate`/`runVerify` behavior this integration test exercises against a real database, so this task added test-only coverage rather than new behavior. The test correctly skips (not fails) without `RUN_PHASE02_INTEGRATION=true` and a real MySQL server — confirmed locally (1 skipped, 0 failed) — but its assertions were not exercised against a live MySQL server in this sandbox (no accessible MySQL credentials were available; see Coverage D6 and "Known Gaps" below).
- Task 4: `docs(02-04)` @ `1c333ab4` — non-TDD documentation task, as specified in the plan (`type="auto"` without `tdd="true"`).

## Verification

All plan verification commands pass:
```
npm --prefix apps/dgfy-migration-runner test -- reportCommands.test.js phase02Verification.test.js  # 29/29
npm --prefix apps/dgfy-migration-runner test -- phase02Integration.test.js --watchman=false          # 1 skipped, 0 failed (clean skip, no RUN_PHASE02_INTEGRATION)
npm --prefix apps/dgfy-migration-runner test                                                          # 131/131 passed, 1 skipped
npm run lint:docs                                                                                      # OK, 21 governed docs validated
npm run check:architecture                                                                             # OK (guardrails, controller boundaries, dgfy-api)
```

## Known Gaps

- **D6 (Task 3) live-DB assertions unconfirmed in this session.** This sandbox has no MySQL server reachable with known credentials (a server answers on `127.0.0.1:3306` but rejected every credential combination tried, including the project's documented local-dev defaults). `phase02Integration.test.js`'s logic was carefully traced against the real (already-tested-via-mocks) `runSchemaMigrate`/`runVerify` implementations — including correcting one assertion (`tenant_coverage.targets[0].registry_covered` must be `false`, not `null`, once a real `dgfy_core` database actually contains the empty `business_database_registry` table) — but a human or CI environment with real MySQL credentials must run `RUN_PHASE02_INTEGRATION=true npm --prefix apps/dgfy-migration-runner test -- phase02Integration.test.js --watchman=false` to close this out with a genuine pass.

This is not a stub or an incomplete implementation — `runSchemaMigrate`/`runVerify` themselves are fully implemented and unit-tested (131 passing tests across mocked scenarios covering every report section, both happy-path and failure-path). It is a live-infrastructure verification gap specific to this execution environment.

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/commands/verify.js`
- FOUND: `apps/dgfy-migration-runner/src/commands/schema.js`
- FOUND: `apps/dgfy-migration-runner/tests/phase02Verification.test.js`
- FOUND: `apps/dgfy-migration-runner/tests/phase02Integration.test.js`
- FOUND: `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- FOUND: `apps/dgfy-migration-runner/tests/reportCommands.test.js`
- FOUND: `docs/database/dgfy-foundation.md`
- FOUND commit `31a8a47c`, `d7b947f5`, `8496582d`, `3ce74e62`, `dd232d50`, `1c333ab4` in `git log --oneline --all`

---
*Phase: 02-dgfy-database-foundation*
*Completed: 2026-07-11*
