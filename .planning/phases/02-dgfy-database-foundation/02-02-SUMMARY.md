---
phase: 02-dgfy-database-foundation
plan: 02
subsystem: dgfy-migration-runner
tags: [dgfy-core, landlord-schema, sequelize, umzug, schema-contract]
dependency-graph:
  requires:
    - runner-pending-only-destructive-gate
    - runner-command-failure-audit
    - runner-container-safe-report-dir
  provides:
    - dgfy-core-schema-contract
    - dgfy-core-foundation-migration
    - dgfy-foundation-database-doc
  affects:
    - apps/dgfy-migration-runner
    - docs/database
tech-stack:
  added: []
  patterns:
    - "dgfyCoreContract.js is the single source of truth for the dgfy_core landlord schema — the additive migration implements it and Plan 04's verify command will inspect dgfy_core against this same contract shape, so table/index/foreign-key drift between migration and verification is structurally impossible."
    - "Migration tests require the .cjs migration file directly via createRequire(import.meta.url) from an ESM Jest test, then drive its up()/down() against a hand-built fake QueryInterface — no real DB connection needed to prove exact table/index/foreign-key/idempotency behavior."
key-files:
  created:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js
    - apps/dgfy-migration-runner/tests/dgfyCoreSchema.test.js
    - apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs
    - docs/database/dgfy-foundation.md
  modified:
    - apps/dgfy-migration-runner/tests/schemaCommand.test.js
decisions:
  - "dgfy_core tables use plain names (accounts, businesses, business_memberships, business_database_registry, business_audit_logs, storefront_discovery_index) per D-05, diverging intentionally from legacy dgfy_accounts/dgfy_account_tenant_memberships naming."
  - "No canonical branches/locations table was created in dgfy_core (D-10) — storefront_discovery_index is the only landlord table, explicitly marked projectionOnly: true in the contract, avoiding Pitfall 1 (Branch Table Ambiguity) from 02-RESEARCH.md."
  - "business_database_registry stores only database_name/stable_opaque_suffix/status/verified_at — never credentials — per D-08 and ASVS V6."
  - "business_memberships.role already includes manager/member alongside owner (D-07) so single-owner-now behavior needs no future disruptive schema rewrite when those roles activate."
metrics:
  duration: 25min
  completed: 2026-07-10
status: complete
---

# Phase 2 Plan 2: DGFY core landlord schema foundation Summary

Added the additive `dgfy_core` landlord schema foundation beside legacy databases: a reusable schema contract module, the QueryInterface migration that implements it, and the authoritative database contract doc, covering accounts, businesses, business_memberships, business_database_registry, business_audit_logs, and a projection-only storefront_discovery_index — with product/POS/inventory/fiscal/promo tables and canonical branches/locations explicitly excluded.

## What Was Built

**Task 1 — `dgfyCoreContract.js` schema contract (D-01/D-04 through D-13).** Created `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` as the single source of truth for the `dgfy_core` landlord database: `databaseName: 'dgfy_core'`, six plain-named core tables each with `columns`/`indexes`/`uniqueConstraints`/`foreignKeys`/`projectionOnly`, and an explicit `rejectedTables` list covering product/POS/inventory/fiscal/promo/Storefront-operational table names plus `branches`/`locations`. `dgfyCoreSchema.test.js` asserts the D-01/D-04 through D-13 decisions directly against this contract shape (11 tests).

**Task 2 — Additive foundation migration (DBF-01/DBF-02/DBF-04).** Created `20260710020000-create-dgfy-core-foundation.cjs`, a QueryInterface migration implementing every table in the contract with existence guards (`showAllTables`/`showIndex` checks before every `createTable`/`addIndex`, mirroring the codebase's existing idempotent-migration pattern from `backend/migrations/20260330000003-create-tenant-locations.cjs` and `20260603000002-create-dgfy-account-admin-audit-logs.cjs`). No `sequelize.sync` is used anywhere. Extended `dgfyCoreSchema.test.js` with 8 more tests that `require()` the migration directly (via `createRequire` from the ESM test file) and drive it against a fake `QueryInterface`, proving: exact contract table set with zero out-of-scope tables created, no canonical `branches`/`locations` table, every contract index requested with the correct unique flag, every contract foreign key wired to the correct `references.model`/`references.key`, full idempotent no-op on a second run, and complete rollback in `down()`.

**Task 3 — `docs/database/dgfy-foundation.md` (documentation).** Created the authoritative Phase 02 database contract doc with governed front matter (`status`/`authority_level`/`owner`/`last_reviewed`/`applies_to`/`topic`, matching `docs/START_HERE.md`'s format), citing all authoritative docs/ADRs from the plan. It documents database naming (D-01/D-04/D-05), core table responsibilities (D-06 through D-09), the branches/locations/discovery projection boundary (D-10 through D-13), the explicit out-of-scope domain list (D-15, ADR 0029), the migration/verification contract (DBF-04, D-21 through D-24), and a threat model summary. States explicitly that no new ADR is required — this implements already-accepted Phase 02 decisions and ADR boundaries. The doc is not yet registered in `docs/_meta/document-registry.json`'s `governed_docs` list (out of this plan's scope; `npm run lint:docs` only validates registered docs, and this file was not asked to be added to that registry).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `schemaCommand.test.js`'s fake QueryInterface lacked `addIndex`/`showIndex`, breaking once the new migration joined the real migration glob**
- **Found during:** Task 2, running the full `npm --prefix apps/dgfy-migration-runner test` verification command after the new migration file existed.
- **Issue:** `schemaCommand.test.js` drives Umzug against the *real* `src/migrations/schema/*.cjs` glob (not a stub list), using a hand-built fake `QueryInterface` that previously stubbed only `showAllTables`/`createTable` — sufficient for the Phase 1 placeholder migration, which never calls `addIndex`. Once `20260710020000-create-dgfy-core-foundation.cjs` was added to that same glob, its `addIndex` calls hit `queryInterface.addIndex is not a function` inside the real `umzug.up()` call, failing 2 previously-passing tests.
- **Fix:** Extended the fixture in `schemaCommand.test.js`'s `beforeEach` with `showIndex: jest.fn().mockResolvedValue([])` and `addIndex: jest.fn().mockResolvedValue(undefined)`, matching the shape already used in `dgfyCoreSchema.test.js`'s own fake QueryInterface.
- **Files modified:** `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- **Commit:** `5a1cba25`

## TDD Gate Compliance

Each task followed RED → GREEN:
- Task 1: `test(02-02)` @ `7f094565` (RED — module-not-found failure, 0 tests ran) → `feat(02-02)` @ `8c1b060d` (GREEN — 11/11 passing).
- Task 2: `test(02-02)` @ `7a715913` (RED — 8 new tests fail on missing migration file, 11 prior tests still pass) → `feat(02-02)` @ `5a1cba25` (GREEN — 19/19 passing, plus the Rule 3 fixture fix folded into the same commit since it was required for the full suite to pass).

No refactor commits were needed.

## Verification

All plan verification commands pass:
```
npm --prefix apps/dgfy-migration-runner test -- dgfyCoreSchema.test.js   # 19/19
npm --prefix apps/dgfy-migration-runner test                            # 75/75
npm run lint:docs                                                       # OK, 21 governed docs validated
```

`node --check` passed on the new migration file.

## Known Stubs

None. The migration, contract, and doc are fully wired; no placeholder data paths or empty-render stubs were introduced. `business_database_registry` rows and actual `dgfy_business_*` databases are intentionally not created by this plan (that is Plan 03's scope per D-02/D-08) — this is a documented phase boundary, not a stub.

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`
- FOUND: `apps/dgfy-migration-runner/tests/dgfyCoreSchema.test.js`
- FOUND: `apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs`
- FOUND: `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- FOUND: `docs/database/dgfy-foundation.md`
- FOUND commit `7f094565`, `8c1b060d`, `7a715913`, `5a1cba25`, `2cb84e04` in `git log --oneline --all`
