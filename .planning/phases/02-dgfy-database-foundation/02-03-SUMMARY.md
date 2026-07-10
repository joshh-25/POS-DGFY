---
phase: 02-dgfy-database-foundation
plan: 03
subsystem: database
tags: [dgfy-business, migration-runner, sequelize, umzug, target-scoping, multi-tenant]

requires:
  - phase: 02-dgfy-database-foundation
    provides: runner-pending-only-destructive-gate, runner-command-failure-audit, runner-container-safe-report-dir
  - phase: 02-dgfy-database-foundation
    provides: dgfy-core-schema-contract, dgfy-core-foundation-migration, dgfy-foundation-database-doc
provides:
  - target-scoped-schema-migration-metadata
  - dgfy-business-db-name-target-selection
  - dgfy-business-tenant-foundation-contract-and-migration
  - dgfy-foundation-database-doc-plan-03-section
affects:
  - apps/dgfy-migration-runner
  - docs/database
  - .planning/phases/02-dgfy-database-foundation (Plan 04 verify command)

tech-stack:
  added: []
  patterns:
    - "Schema migration files declare which target kind they apply to via meta.targetKind ('core', the implicit default when a migration omits the field, or 'business'). The schema command filters the migrations list by this field per target before Umzug ever considers a migration pending — this is a structural exclusion, not a naming convention, and lets core and business foundation migrations live in the same src/migrations/schema directory without risk of a business migration ever mutating dgfy_core (or vice versa)."
    - "dgfy_migration_meta.schema_migrations uses a composite (name, target_database) primary key, and MetaSequelizeStorage is constructed once per target with its own targetDatabase — so the same migration filename is tracked completely independently for dgfy_core and every dgfy_business_* database; one target's executed state can never satisfy or hide another's pending state."
    - "Cross-database references (dgfy_account_id, business_id, owner_dgfy_account_id, actor_dgfy_account_id pointing from dgfy_business_* tables back at dgfy_core.accounts/businesses) are always plain opaque UUID columns with no references clause — MySQL cannot enforce a foreign key across two separate databases, so the contract and migration both explicitly omit the FK rather than pretending one exists."

key-files:
  created:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs
    - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
  modified:
    - apps/dgfy-migration-runner/src/metadata/bootstrap.js
    - apps/dgfy-migration-runner/src/metadata/storage.js
    - apps/dgfy-migration-runner/src/config/env.js
    - apps/dgfy-migration-runner/src/config/db.js
    - apps/dgfy-migration-runner/src/commands/schema.js
    - apps/dgfy-migration-runner/tests/metadataBootstrap.test.js
    - apps/dgfy-migration-runner/tests/umzugStorage.test.js
    - apps/dgfy-migration-runner/tests/env.test.js
    - apps/dgfy-migration-runner/tests/dbFactories.test.js
    - apps/dgfy-migration-runner/tests/schemaCommand.test.js
    - docs/database/dgfy-foundation.md

decisions:
  - "dgfy_migration_meta.schema_migrations gained a target_database column joining name in a composite primary key, rather than a separate registry table or an encoded composite string key, so Plan 04 verification can query target-scoped migration evidence directly as real columns."
  - "MetaSequelizeStorage now takes an explicit targetDatabase (default 'default' preserves every pre-existing single-target caller/test unchanged) and scopes logMigration/unlogMigration/executed() by it."
  - "Added DGFY_BUSINESS_DB_NAMES as the explicit runner env var for the initial dgfy_business_* target list, parsed and validated by a pure parseBusinessDbNames() function inside validateEnv() — invalid/legacy/display-derived entries fail validateEnv() as a whole (RUN-03: rejected before any connection), rather than being silently dropped from the list."
  - "Added a 4th DB connection factory, createBusinessTargetConnection(config, databaseName), reusing TARGET_DB_* credentials with a caller-supplied database name, instead of overloading createTargetConnection with an optional name parameter — keeps each factory's signature single-purpose and matches the existing db.js test's literal new-Sequelize(-call-count assertion pattern."
  - "Schema migrations are scoped to a target kind via meta.targetKind ('core' default / 'business') rather than splitting core and business migrations into separate directories — this keeps the plan's specified flat src/migrations/schema/ file layout while still making it structurally impossible for a business migration to run against dgfy_core or vice versa."
  - "The pending-only destructive gate (D-17, Plan 01) now aggregates pending migrations across the primary target AND every configured business target before asserting once, still strictly before any target's umzug.up() call — a single --confirm-destructive flag governs the whole multi-target run."
  - "dgfy_business_* tenant foundation tables never declare cross-database foreign keys (dgfy_account_id, business_id, owner_dgfy_account_id, actor_dgfy_account_id are plain UUID columns) because MySQL cannot enforce a foreign key across two separate databases — this is documented explicitly in the contract, migration, doc, and a dedicated regression test rather than left as an implicit gap."

requirements-completed: [DBF-01, DBF-03, DBF-04]

coverage:
  - id: D1
    description: "Schema migration metadata is target-scoped — the same migration filename can be recorded and tracked independently per dgfy_core and each dgfy_business_* target database"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "tests/metadataBootstrap.test.js#MetaSequelizeStorage — target-scoped metadata (Plan 03 D-21/T-02-03-02)"
        status: pass
      - kind: unit
        ref: "tests/umzugStorage.test.js#MetaSequelizeStorage"
        status: pass
    human_judgment: false
  - id: D2
    description: "Runner accepts an explicit DGFY_BUSINESS_DB_NAMES target list, rejecting empty/legacy/display-derived entries before any connection"
    requirement: "DBF-01"
    verification:
      - kind: unit
        ref: "tests/env.test.js#validateEnv (DGFY_BUSINESS_DB_NAMES cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "schema migrate applies the business foundation migration to every configured dgfy_business_* target, in declared order, using target-scoped storage, and reports each processed business database"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "tests/schemaCommand.test.js#runSchemaMigrate — Plan 03 business database target selection"
        status: pass
    human_judgment: false
  - id: D4
    description: "dgfy_business_* tenant foundation (locations, staff_accounts, account_staff_assignments, roles, role_permissions, terminal_identities, tenant_ownership_metadata, tenant_audit_logs) is additive/idempotent and excludes all product/POS/inventory/fiscal/storefront operational tables"
    requirement: "DBF-03"
    verification:
      - kind: unit
        ref: "tests/dgfyBusinessSchema.test.js#dgfyBusinessContract and migration suite (20 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "docs/database/dgfy-foundation.md documents the per-business naming rule, tenant table contract, target-selection mechanism, and scope exclusions"
    verification:
      - kind: other
        ref: "npm run lint:docs"
        status: pass
    human_judgment: false

metrics:
  duration: 12min
  completed: 2026-07-11
status: complete
---

# Phase 2 Plan 3: DGFY per-business schema foundation and target selection Summary

Made the migration runner's schema metadata and target selection multi-tenant-aware (target-scoped `dgfy_migration_meta`, an explicit `DGFY_BUSINESS_DB_NAMES` target list, and `meta.targetKind`-based migration scoping), then added the additive `dgfy_business_<stable_opaque_suffix>` tenant foundation (locations, staff_accounts, account_staff_assignments, roles, role_permissions, terminal_identities, tenant_ownership_metadata, tenant_audit_logs) — with every cross-database reference back to `dgfy_core` deliberately left as an opaque UUID rather than a foreign key, since MySQL cannot enforce constraints across separate databases.

## Performance

- **Duration:** 12 min
- **Tasks:** 4 completed
- **Files modified:** 11 (3 created, 8 modified) in `apps/dgfy-migration-runner` + 1 doc

## Accomplishments
- `dgfy_migration_meta.schema_migrations` is now target-scoped: a composite `(name, target_database)` key and a `targetDatabase`-aware `MetaSequelizeStorage` mean the same migration filename is tracked completely independently per `dgfy_core` and every `dgfy_business_*` database.
- The runner accepts an explicit, validated `DGFY_BUSINESS_DB_NAMES` env var (comma-separated `dgfy_business_<stable_opaque_suffix>` names); empty entries, legacy names, `dgfy_core`-style names, and display-name-derived entries all fail `validateEnv()` before any connection is opened.
- `schema migrate` now migrates the primary `TARGET_DB_NAME` target plus every configured business database, in declared order, each through its own Umzug instance with target-scoped storage; `meta.targetKind` on each migration file structurally prevents a business migration from ever running against `dgfy_core` (or vice versa) even though both files live in the same `src/migrations/schema` directory.
- Added `dgfyBusinessContract.js` and its additive, idempotent QueryInterface migration implementing the full `dgfy_business_*` tenant foundation, explicitly excluding every product/POS/inventory/fiscal/promo/Storefront-operational table (D-15).
- Documented the per-business naming rule, tenant table contract, target-selection mechanism, and scope exclusions in `docs/database/dgfy-foundation.md`.

## Task Commits

Each task followed RED → GREEN (TDD):

1. **Task 1: Make schema migration metadata target-scoped**
   - `test(02-03)` @ `2340e49a` (RED — 3 failing target-scoping tests)
   - `feat(02-03)` @ `5d230706` (GREEN — composite key + targetDatabase-scoped `MetaSequelizeStorage`, plus a required `umzugStorage.test.js` fix for the new `where` clause shape)
2. **Task 2: Add business database target selection to runner config**
   - `test(02-03)` @ `87bcb0f9` (RED — `DGFY_BUSINESS_DB_NAMES` parsing tests) → `feat(02-03)` @ `22998510` (GREEN)
   - `test(02-03)` @ `8a31caa0` (RED — `createBusinessTargetConnection` factory tests) → `feat(02-03)` @ `f96198a9` (GREEN)
   - `test(02-03)` @ `a04158e3` (RED — multi-business-target `schema.js` tests) → `feat(02-03)` @ `4179a510` (GREEN)
3. **Task 3: Add per-business schema contract and migration**
   - `test(02-03)` @ `aee4018b` (RED — module-not-found, 0 tests ran) → `feat(02-03)` @ `e51405cd` (GREEN — 20/20 passing)
4. **Task 4: Document per-business schema contract**
   - `docs(02-03)` @ `2d938986` (non-TDD documentation task)

**Plan metadata:** pending final `docs(02-03)` commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates)

## Files Created/Modified
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - single source of truth for the `dgfy_business_*` tenant foundation table/column/index/FK contract
- `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` - additive, idempotent migration implementing the contract; `meta.targetKind: 'business'`
- `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js` - 20 tests covering the contract shape and migration behavior (tables, indexes, FKs, cross-db UUID columns, idempotency, rollback)
- `apps/dgfy-migration-runner/src/metadata/bootstrap.js` - added `target_database` to the `schema_migrations` composite key
- `apps/dgfy-migration-runner/src/metadata/storage.js` - `MetaSequelizeStorage` now scopes every read/write by `targetDatabase`
- `apps/dgfy-migration-runner/src/config/env.js` - `BUSINESS_DB_NAME_PATTERN`, `parseBusinessDbNames()`, `config.businessDbNames`
- `apps/dgfy-migration-runner/src/config/db.js` - `createBusinessTargetConnection(config, databaseName)` factory
- `apps/dgfy-migration-runner/src/commands/schema.js` - multi-target migration loop, `meta.targetKind` filtering, aggregated destructive gate, `report.business_targets`
- `apps/dgfy-migration-runner/tests/metadataBootstrap.test.js` - target-scoped `MetaSequelizeStorage` regression tests; `target_database` added to expected columns
- `apps/dgfy-migration-runner/tests/umzugStorage.test.js` - updated `unlogMigration` assertion for the new `where` clause; added explicit-`targetDatabase` regression test
- `apps/dgfy-migration-runner/tests/env.test.js` - `DGFY_BUSINESS_DB_NAMES` parsing/validation tests; updated full-config-equality test
- `apps/dgfy-migration-runner/tests/dbFactories.test.js` - `createBusinessTargetConnection` factory tests; updated `new Sequelize(` count assertion (3 → 4)
- `apps/dgfy-migration-runner/tests/schemaCommand.test.js` - multi-business-target migration tests; `createBusinessTargetConnection` added to all `config/db.js` mock fixtures
- `docs/database/dgfy-foundation.md` - Plan 03 per-business tenant foundation section, runner target-selection section, updated out-of-scope/threat-model sections

## Decisions Made
- Target-scoping via a real `target_database` column (composite key) rather than an encoded composite string key, so Plan 04 verification can query it directly.
- `DGFY_BUSINESS_DB_NAMES` validation failures fail `validateEnv()` as a whole (not silently dropped per-entry) — matches RUN-03's "reject before connecting" contract.
- Migration target-kind scoping via `meta.targetKind` (declarative field) rather than separate directories per kind, keeping the plan's specified flat file layout while still making cross-kind execution structurally impossible.
- Cross-database references from `dgfy_business_*` back to `dgfy_core` are always plain opaque UUID columns, never foreign keys — documented explicitly in contract, migration, doc, and a dedicated regression test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `umzugStorage.test.js`'s pre-existing `unlogMigration` assertion needed updating for the new target-scoped `where` clause**
- **Found during:** Task 1, after adding `target_database` to `MetaSequelizeStorage.unlogMigration()`'s `bulkDelete` where clause.
- **Issue:** The existing test asserted `bulkDelete` was called with `{ name }` only; with target-scoping now always present (defaulting to `'default'`), the real call includes `target_database` too, so the pre-existing assertion would fail.
- **Fix:** Updated the assertion to `{ name, target_database: 'default' }` and added a new regression test proving `logMigration`/`unlogMigration`/`executed()` are all scoped by an explicit `targetDatabase`.
- **Files modified:** `apps/dgfy-migration-runner/tests/umzugStorage.test.js`
- **Commit:** `5d230706`

**2. [Rule 1 - Bug] `dbFactories.test.js`'s literal `new Sequelize(` occurrence-count assertion needed updating for the 4th factory**
- **Found during:** Task 2, after adding `createBusinessTargetConnection` to `db.js`.
- **Issue:** The existing test asserted exactly 3 top-level-free `new Sequelize(` calls in `db.js`'s source; adding a 4th factory function would otherwise fail this literal count.
- **Fix:** Updated the expected count to 4 and added explicit factory-existence/credential-reuse tests for `createBusinessTargetConnection`.
- **Files modified:** `apps/dgfy-migration-runner/tests/dbFactories.test.js`
- **Commit:** `8a31caa0` (test) / `f96198a9` (feat)

**3. [Rule 1/3 - Bug/Blocking] `schemaCommand.test.js`'s three `config/db.js` mock fixtures needed `createBusinessTargetConnection` added**
- **Found during:** Task 2, once `schema.js` began importing `createBusinessTargetConnection` from `config/db.js`.
- **Issue:** The file's three separate `jest.unstable_mockModule('../src/config/db.js', ...)` mock factories only exported `createSourceConnection`/`createTargetConnection`/`createMetaConnection`; importing the real `schema.js` against these mocks would resolve `createBusinessTargetConnection` as `undefined` (harmless when unused, but blocking for the new multi-target tests that need to observe its call order/arguments).
- **Fix:** Added `createBusinessTargetConnection` (real or call-order-tracking mock, matching each block's existing style) to all three mock factories.
- **Files modified:** `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- **Commit:** `a04158e3` (test) / `4179a510` (feat)

---

**Total deviations:** 3 auto-fixed (all Rule 1/3 — required test-fixture updates directly caused by this plan's own source changes, no scope creep).
**Impact on plan:** None of these were optional; each is a mechanical consequence of extending an existing module's shape (new column, new factory, new import) that pre-existing tests asserted on literally.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None — no external service configuration required. `DGFY_BUSINESS_DB_NAMES` is an optional operator-supplied env var for real deployments; no code change requires it to be set.

## Next Phase Readiness
- `dgfyBusinessContract.js` and the target-scoped migration metadata are ready for Plan 04's `verify` command to inspect per-target schema/metadata evidence.
- The runner can now safely target one or more `dgfy_business_*` databases end-to-end (env validation → connection → target-scoped migration → target-scoped metadata → report), satisfying this plan's `<success_criteria>`.
- Plan 04 still needs to add: legacy `sku_*` non-mutation fingerprint proof, `business_database_registry` tenant-coverage verification, and idempotency/re-run evidence across all targeted databases (D-21 through D-24) — none of this plan's tests exercise a real MySQL connection, by design (unit-level QueryInterface fakes only).

---
*Phase: 02-dgfy-database-foundation*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
- FOUND: `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs`
- FOUND: `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js`
- FOUND: `apps/dgfy-migration-runner/src/metadata/bootstrap.js`
- FOUND: `apps/dgfy-migration-runner/src/metadata/storage.js`
- FOUND: `apps/dgfy-migration-runner/src/config/env.js`
- FOUND: `apps/dgfy-migration-runner/src/config/db.js`
- FOUND: `apps/dgfy-migration-runner/src/commands/schema.js`
- FOUND: `docs/database/dgfy-foundation.md`
- FOUND: `.planning/phases/02-dgfy-database-foundation/02-03-SUMMARY.md`
- FOUND commit `2340e49a`, `5d230706`, `87bcb0f9`, `22998510`, `8a31caa0`, `f96198a9`, `a04158e3`, `4179a510`, `aee4018b`, `e51405cd`, `2d938986` in `git log --oneline --all`
