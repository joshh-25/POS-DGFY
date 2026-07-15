---
phase: 02-dgfy-database-foundation
plan: 05
subsystem: dgfy-migration-runner
tags: [migration-runner, verification, gap-closure, cr-01, evidence-integrity]

requires:
  - phase: 02-dgfy-database-foundation
    provides: phase02-verification-report-sections (core_schema, business_schemas, migration_metadata, tenant_coverage, idempotency, legacy_non_mutation)
provides:
  - migration-metadata-per-target-fault-isolation
affects:
  - apps/dgfy-migration-runner

tech-stack:
  added: []
  patterns:
    - "verify.js's migration_metadata block now mirrors business_schemas's already-correct pattern: the primary target's checkMigrationMetadata call and each business target's call are each wrapped in their own independent try/catch, so one target's thrown error can never drop an earlier target's already-collected finding, mislabel the failure under the wrong target_database, or abort the loop before later targets are checked."

key-files:
  created: []
  modified:
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/tests/phase02Verification.test.js

decisions:
  - "Fix scoped strictly to try/catch boundaries around checkMigrationMetadata calls in migration_metadata — idempotency's derivation (migrationMetadata.map(...)) was deliberately left untouched, since it already derives correctly once migration_metadata's entries are trustworthy per target."
  - "Regression test uses mockImplementationOnce chaining (not a persistent mockImplementation override) on the module-scope MockMetaSequelizeStorage mock, so the beta-target throw is fully consumed within the test and cannot leak into later tests in the same file."

requirements-completed: [DBF-04, DBF-05]

coverage:
  - id: D1
    description: "migration_metadata's try/catch is scoped per target (primary target and each business target independently), matching business_schemas's existing pattern"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#migration_metadata describe block, CR-01 regression test"
        status: pass
    human_judgment: false
  - id: D2
    description: "A mid-loop business-target failure (dgfy_business_beta's MetaSequelizeStorage.executed() throws) cannot drop dgfy_business_alpha's already-collected finding, mislabel the failure under dgfy_core, or prevent dgfy_business_gamma from being checked"
    requirement: "DBF-05"
    verification:
      - kind: unit
        ref: "tests/phase02Verification.test.js#migration_metadata describe block, CR-01 regression test (confirmed RED against pre-fix verify.js: 3 entries instead of 4, gamma never checked, failure mislabeled target_database:'dgfy_core'; confirmed GREEN against fixed verify.js: all 4 entries correct)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full apps/dgfy-migration-runner test suite passes with no regressions after the fix"
    requirement: "DBF-04"
    verification:
      - kind: unit
        ref: "npm --prefix apps/dgfy-migration-runner test -- --watchman=false (132 passed, 1 skipped — the pre-existing gated live-MySQL integration test, unchanged)"
        status: pass
    human_judgment: false

metrics:
  duration: 15min
  completed: 2026-07-11
status: complete
---

# Phase 2 Plan 5: Close CR-01 gap — scope migration_metadata try/catch per target Summary

Fixed code review finding CR-01 (`02-REVIEW.md`) and closed the single unresolved gap from `02-VERIFICATION.md`: `verify.js`'s `migration_metadata` section now scopes its try/catch per target (primary target and each business target independently), mirroring the already-correct `business_schemas` pattern, so a mid-loop failure on any business target can no longer drop earlier targets' findings, mislabel the failure under the wrong database name, or abort the loop before later targets are checked.

## What Was Built

**Task 1 — Scoped `migration_metadata` try/catch per target (CR-01) + regression test.** In `apps/dgfy-migration-runner/src/commands/verify.js`, the single try/catch that previously spanned both the primary target's `checkMigrationMetadata` call and the entire `for (const name of businessDbNames)` loop was split into two independently-scoped blocks: one try/catch around the primary target's check (catch pushes an entry labeled with `config.targetDb.name` and its resolved `kind`), and a second try/catch *inside* the business-target loop, scoped to each iteration individually (catch pushes an entry labeled with the actual failing target's `name` and `kind: 'business'`), matching `business_schemas`'s existing per-target pattern exactly. `idempotency`'s derivation (`migrationMetadata.map(...)`) was left untouched — it already derives correctly from whatever entries survive.

Added a regression test (`CR-01 regression: a mid-loop business-target failure cannot drop or mislabel other targets' findings`) inside the existing `describe('migration_metadata', ...)` block: a 3-business-target run (`dgfy_business_alpha`, `dgfy_business_beta`, `dgfy_business_gamma`) where `dgfy_core`, `alpha`, and `gamma` fully satisfy their expected migrations but `beta`'s `MetaSequelizeStorage.executed()` call throws mid-loop. The test asserts `report.migration_metadata` contains exactly 4 entries, `alpha` and `gamma` both survive with `ok:true` (proving the earlier successful target isn't dropped and the loop continues past the failure), `beta`'s entry is correctly labeled `target_database: 'dgfy_business_beta'` with `ok:false` and an `error` field containing the thrown message (proving correct attribution, never the primary target's name), and `report.summary.migration_metadata_ok` is `false`.

Followed the TDD gate strictly: the new test was first run against the unfixed `verify.js` and confirmed RED (produced only 3 entries; `gamma` was never checked because the loop aborted; the failure was mislabeled `target_database: 'dgfy_core'` instead of `'dgfy_business_beta'` — exactly the corruption CR-01 described). The fix was then applied and the same test confirmed GREEN, with the full 132-test runner suite passing with no regressions (1 pre-existing skip, the gated live-MySQL integration test, unaffected).

## Deviations from Plan

None — plan executed exactly as written. The action section's exact code shape (per-target try/catch, `kind` field included in catch-path entries, `mockImplementationOnce` chaining in the test) was followed precisely.

## Verification

All plan verification commands pass:
```
npm --prefix apps/dgfy-migration-runner test -- phase02Verification.test.js --watchman=false  # 21/21 passed
npm --prefix apps/dgfy-migration-runner test -- --watchman=false                              # 132 passed, 1 skipped (gated integration test, unchanged)
npm run lint:docs                                                                              # OK, 21 governed docs validated
npm run check:architecture                                                                     # OK (guardrails, controller boundaries, dgfy-api)
```

Re-read of `verify.js`'s `migration_metadata` block (lines 337-369) confirms no shared try/catch remains across the primary target and the business-target loop — each target (primary and every business target) is now independently wrapped.

## TDD Gate Compliance

- Task 1: `test(02-05)` @ `cdb591b4` (RED — confirmed 1 failing assertion: 3 entries instead of 4, `gamma` never checked, failure mislabeled `target_database: 'dgfy_core'`) → `fix(02-05)` @ `c158f28f` (GREEN — 21/21 passing in `phase02Verification.test.js`; full suite 132/132 passed, 1 skipped).

## Requirements Coverage

- **DBF-04** (Migrations additive/repeatable/tracked by metadata) — now fully satisfied with respect to this defect: `migration_metadata`'s per-target tracking is fault-isolated, so multi-target failure evidence can be trusted.
- **DBF-05** (Verification proves tables/columns/indexes/constraints/migration records/tenant coverage) — now fully satisfied with respect to this defect: the `migration_metadata`/`idempotency` report sections cannot silently lose, duplicate, or mislabel per-target evidence under partial failure.

Both requirements move from "partially satisfied" (per `02-VERIFICATION.md`) to fully satisfied with respect to CR-01. The remaining Phase 02 human-verification item (live-MySQL integration test, D6 in `02-04-SUMMARY.md`) is unrelated to this gap and unaffected by this plan.

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/commands/verify.js`
- FOUND: `apps/dgfy-migration-runner/tests/phase02Verification.test.js`
- FOUND commit `cdb591b4`, `c158f28f` in `git log --oneline --all`

---
*Phase: 02-dgfy-database-foundation*
*Completed: 2026-07-11*
