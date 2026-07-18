---
phase: 03-old-to-new-migration-proof
plan: 06
subsystem: database
tags: [migration-runner, mysql, verification, legacy-id-map, data-quality-findings]

requires:
  - phase: 03-old-to-new-migration-proof
    provides: "03-05 data verification and gated rehearsal harness"
provides:
  - "Tenant-local map-completeness verification uses manifest legacy_tenant_db_name"
  - "Phase 03 live MySQL rehearsal seeds disposable schemas successfully"
  - "Apply resolves stale dry-run findings when the exact legacy entity is later mapped"
affects: [04-backend-accounts-businesses-tenancy, migration-rehearsal, release-evidence]

tech-stack:
  added: []
  patterns:
    - "Resolve open data-quality findings only after successful exact legacy-key mapping"
    - "Integration fixtures seed only columns created by disposable test tables"

key-files:
  created:
    - .planning/phases/03-old-to-new-migration-proof/03-06-SUMMARY.md
  modified:
    - apps/dgfy-migration-runner/src/data/verifyData.js
    - apps/dgfy-migration-runner/src/data/apply.js
    - apps/dgfy-migration-runner/src/metadata/dataState.js
    - apps/dgfy-migration-runner/tests/dataVerify.test.js
    - apps/dgfy-migration-runner/tests/dataApply.test.js
    - apps/dgfy-migration-runner/tests/dataState.test.js
    - apps/dgfy-migration-runner/tests/phase03Integration.test.js

key-decisions:
  - "Verification tenant-local expected keys now use target.legacy_tenant_db_name, matching apply's legacy_id_map.legacy_source contract."
  - "First-pass dry-run orphan findings are not ignored; apply marks them resolved only after a successful insert/reconcile for the same entity and legacy key."
  - "The live integration test keeps full reusable fixtures intact and narrows only its disposable seed payloads."

patterns-established:
  - "Apply-time finding resolution: open findings remain blocking until a later successful mapped write resolves the same entity/key."
  - "Strict MySQL integration seeds convert fixture ISO date strings to Date objects before bulkInsert."

requirements-completed: [MIG-02, MIG-03, MIG-04, MIG-05]
coverage:
  - id: D1
    description: "MIG-05 map completeness uses manifest tenant DB names for tenant-local users and tenant_locations"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataVerify.test.js#uses the manifest legacy_tenant_db_name for tenant-local map-completeness keys"
        status: pass
      - kind: integration
        ref: "RUN_PHASE03_INTEGRATION=true ... npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js --watchman=false"
        status: pass
    human_judgment: false
  - id: D2
    description: "The gated Phase 03 live MySQL rehearsal runs schema migrate, dry-run, apply, retry, and verify with data_migration_ok=true"
    requirement: MIG-02
    verification:
      - kind: integration
        ref: "apps/dgfy-migration-runner/tests/phase03Integration.test.js#dry-run mutates nothing, apply writes mapped rows, retry creates no duplicates, verify reconciles clean"
        status: pass
    human_judgment: false
  - id: D3
    description: "Apply resolves stale dry-run orphan findings only after the exact mapped row is inserted or reconciled"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataState.test.js#resolveDataQualityFindings resolves only the matching open entity/key findings"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataApply.test.js#resolves matching open dry-run findings after a mapped row is written"
        status: pass
    human_judgment: false

duration: 32min
completed: 2026-07-11
status: complete
---

# Phase 03 Plan 06: Migration Gap Closure Summary

**Tenant-local verification and live MySQL rehearsal now converge on clean Phase 03 migration evidence.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-11T06:53:00Z
- **Completed:** 2026-07-11T07:24:51Z
- **Tasks:** 2 completed
- **Files modified:** 7 code/test files plus GSD metadata

## Accomplishments

- Fixed GAP-03-01 by building tenant-local `legacy_id_map` expected keys from `target.legacy_tenant_db_name`.
- Fixed the live rehearsal seed path by inserting only columns created in the disposable MySQL tables and converting strict DATETIME values.
- Closed the discovered apply/verify convergence gap by resolving stale dry-run orphan findings only after apply maps the same legacy entity.

## Task Commits

1. **Task 1 and Task 2: Gap closure implementation** - `fb077dca` (fix)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/data/verifyData.js` - Uses manifest tenant DB name for tenant-local map-completeness keys.
- `apps/dgfy-migration-runner/src/metadata/dataState.js` - Adds exact-key data-quality finding resolution.
- `apps/dgfy-migration-runner/src/data/apply.js` - Resolves matching open findings after successful mapped writes.
- `apps/dgfy-migration-runner/tests/dataVerify.test.js` - Adds manifest tenant DB regression coverage.
- `apps/dgfy-migration-runner/tests/dataState.test.js` - Covers exact-key finding resolution.
- `apps/dgfy-migration-runner/tests/dataApply.test.js` - Covers apply-time resolution and preserves checkpoint retry guarantees.
- `apps/dgfy-migration-runner/tests/phase03Integration.test.js` - Seeds disposable MySQL tables with explicit reduced payloads.

## Decisions Made

- First-pass dry-run findings remain durable evidence, but apply can resolve findings for the exact legacy entity once the dependency-ordered write succeeds. This preserves the "open findings fail verification" rule without leaving stale dry-run orphans after a successful apply.
- The integration test should not broaden disposable schemas just to fit full legacy fixtures. It now derives local seed objects matching the reduced tables, while the full fixtures remain available for mapper coverage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale dry-run orphan findings blocked clean verification**
- **Found during:** Task 2 live MySQL rehearsal
- **Issue:** Dry-run correctly persisted orphan findings before apply had dependency IDs, but apply had no way to resolve those findings after writing the dependent rows.
- **Fix:** Added `resolveDataQualityFindings()` and call it after successful exact-key mapped writes.
- **Files modified:** `apps/dgfy-migration-runner/src/metadata/dataState.js`, `apps/dgfy-migration-runner/src/data/apply.js`, `apps/dgfy-migration-runner/tests/dataState.test.js`, `apps/dgfy-migration-runner/tests/dataApply.test.js`
- **Verification:** Focused suite, full runner suite, and live MySQL rehearsal pass.
- **Committed in:** `fb077dca`

---

**Total deviations:** 1 auto-fixed bug. **Impact:** Required for the planned live rehearsal to truthfully reach `data_migration_ok=true`; no backend/API scope or domain scope was added.

## Issues Encountered

- The live rehearsal first exposed strict MySQL DATETIME parsing for ISO strings in disposable seeds. The test now converts date fields to `Date` objects.
- The live rehearsal also exposed stale dry-run findings. Those are now resolved only after apply proves the corresponding mapped row exists.
- The live rehearsal exits successfully but Jest prints its existing open-handle warning after completion; this did not affect exit status.

## User Setup Required

None beyond the existing local MySQL/Docker setup for the gated integration command.

## Verification

- `npm --prefix apps/dgfy-migration-runner test -- dataVerify.test.js phase03Integration.test.js --watchman=false` - pass
- `npm --prefix apps/dgfy-migration-runner test -- dataMappings.test.js dataDryRun.test.js dataApply.test.js dataVerify.test.js dataState.test.js dataCommand.test.js verifyCommand.test.js phase03Integration.test.js --watchman=false` - pass
- `RUN_PHASE03_INTEGRATION=true PHASE03_IT_DB_HOST=127.0.0.1 PHASE03_IT_DB_PORT=3306 PHASE03_IT_DB_USER=root PHASE03_IT_DB_PASSWORD=localtest_root_pw npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js --watchman=false` - pass, `data_migration_ok=true`
- `npm --prefix apps/dgfy-migration-runner test -- --watchman=false` - pass, 287 passed and 2 gated skips
- `npm run lint:docs` - pass

## Next Phase Readiness

Phase 03 is ready to advance. Phase 04 can assume `dgfy_core`/`dgfy_business_*` schemas exist and that Phase 03 can migrate/reconcile account, business, membership, staff, location, and terminal identity foundation data with retry and verification evidence.

---
*Phase: 03-old-to-new-migration-proof*
*Completed: 2026-07-11*
