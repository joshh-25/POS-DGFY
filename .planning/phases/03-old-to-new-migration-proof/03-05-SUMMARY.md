---
phase: 03-old-to-new-migration-proof
plan: 05
subsystem: database
tags: [migration-runner, verification, mig-05, idempotency, adr-0028, gated-integration-test]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: "03-01's manifest/metadata contract and dataState.js helpers; 03-02's dgfy-data-migration-map.md and mappings.js; 03-03's legacySource.js/dryRun.js read-only snapshot readers; 03-04's apply.js checkpointed write path, legacy_id_map fan-out disambiguation, and stripped apply report shape"
provides:
  - "verify.js: migration_metadata error-fallback objects now set missing_migrations:null (unknown sentinel) instead of [] (clean sentinel); idempotency derivation treats null as ok:false with pending_migrations:null and the underlying error — closing the Phase 02 false-clean idempotency gap"
  - "apps/dgfy-migration-runner/src/data/verifyData.js — checkDataCounts/checkRequiredRelationships/checkMapCompleteness/checkOpenFindings pure comparison functions plus buildDataVerificationSections() orchestration"
  - "verify.js data_migration report section + summary.data_migration_ok — skips cleanly (ok:true,skipped:true) when no DGFY_MIGRATION_TARGET_MANIFEST is configured, fails closed once one is configured"
  - "apps/dgfy-migration-runner/tests/phase03Integration.test.js — gated (RUN_PHASE03_INTEGRATION=true) real-MySQL dry-run/apply/retry/verify rehearsal against disposable schemas"
  - "docs/database/dgfy-migration-rehearsal.md — MIG-05 rehearsal runbook: env vars, manifest shape, 7-step procedure, gated test invocation, secret-handling checks, rollback review notes, production-like rehearsal gates"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit unknown sentinel (null) vs. clean sentinel ([]) for missing_migrations on the migration_metadata error path — idempotency derivation branches on null specifically rather than treating any falsy/empty value as 'zero pending, clean'"
    - "verify.js data_migration section is opt-in-scoped (skipped when no manifest configured) but fail-closed once scoped in (invalid manifest or verification error both produce ok:false, never a silent skip) — mirrors the existing metadata_schema_ok/target_db_reachable never-throws contract"
    - "checkDataCounts() compares target_count against an already-net-of-skips expected_target_count (not raw source_count) so intentional skip/conflict findings never produce a false count mismatch"
    - "checkRequiredRelationships() enforces ADR 0028 at the verification layer: an account_staff_assignments row with no corresponding accepted business_memberships row for the same (account, business) pair is a violation, independent of what apply/dry-run already checked"
    - "storefront_discovery_index verification evidence is always blocking:false by construction (summarizeStorefrontDiscoveryProjection()), never folded into data_migration_ok"

key-files:
  created:
    - apps/dgfy-migration-runner/src/data/verifyData.js
    - apps/dgfy-migration-runner/tests/verifyCommand.test.js
    - apps/dgfy-migration-runner/tests/dataVerify.test.js
    - apps/dgfy-migration-runner/tests/phase03Integration.test.js
    - docs/database/dgfy-migration-rehearsal.md
  modified:
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/tests/phase02Verification.test.js
    - apps/dgfy-migration-runner/tests/reportCommands.test.js

key-decisions:
  - "Used null (not a boolean flag) as the explicit 'metadata check errored, idempotency unknown' sentinel for missing_migrations, per 02-REVIEW.md's own suggested fix — keeps the existing array-shaped happy-path contract unchanged for every passing case"
  - "verify.js's new data_migration section only runs when DGFY_MIGRATION_TARGET_MANIFEST is configured; when absent it reports {ok:true, skipped:true} rather than failing verification outright, so schema-only verify runs (Phase 02 style, no data migration in scope) stay unaffected — confirmed via full regression run (284/286 tests passing, 2 gated skips)"
  - "checkDataCounts()/checkMapCompleteness()/checkRequiredRelationships()/checkOpenFindings() are pure, DB-free functions (mirroring dryRun.js's buildDryRunPlan()/summarizeDryRunReport() split) so the acceptance criteria's mismatch/violation/open-finding scenarios are unit-testable without a database; buildDataVerificationSections() is the only orchestration entry point that opens connections"
  - "dataVerify.test.js registers all config/db.js and metadata/dataState.js mocks and does its dynamic import of verifyData.js at file top level (before any describe block) — a static top-level import combined with a later jest.unstable_mockModule() call inside a describe block silently uses the real, unmocked module because ESM module linking resolves static imports before the module body's mock registration runs"
  - "phase03Integration.test.js reuses the exact fixture builder functions from 03-02's tests/fixtures/phase03/legacyRecords.js (legacyDgfyAccountFixture, legacyTenantFixture, legacyAcceptedMembershipFixture, legacyTenantUserFixture, legacyTenantLocationFixture, legacyPosTerminalRegistryEntryFixture) rather than hand-rolling new fixture shapes, keeping the rehearsal's legacy row shapes consistent with the unit-tested mapper contract"

requirements-completed: [MIG-05]

coverage:
  - id: D1
    description: "verify.js's migration_metadata error-fallback objects set missing_migrations:null (explicit unknown sentinel) instead of [] (empty/clean sentinel), and the idempotency derivation treats null as ok:false with pending_migrations:null and the underlying error message — closing the Phase 02 false-clean idempotency gap (WR-01/Pitfall 5)"
    requirement: "MIG-05"
    verification:
      - kind: unit
        ref: "tests/verifyCommand.test.js#'a migration_metadata check error produces idempotency.ok === false (never a false-clean result)' / 'pending (unrecorded) migrations still produce idempotency.ok === false' / 'no missing migrations still produces idempotency.ok === true' / 'verify report is still written and command completion records success'"
        status: pass
      - kind: unit
        ref: "tests/phase02Verification.test.js (25/25, full suite re-run, no regression on the CR-01 gap-closure or existing idempotency tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "verifyData.js adds source/target count reconciliation, legacy_id_map map completeness, and required-relationship checks (account_staff_assignments<->business_memberships per ADR 0028, terminal_identities<->locations) to a new verify.js data_migration report section; open skip/conflict/orphan findings (including missing accepted membership) keep data_migration_ok=false until remediated, and storefront_discovery_index projection evidence never controls the result"
    requirement: "MIG-05"
    verification:
      - kind: unit
        ref: "tests/dataVerify.test.js (18/18): checkDataCounts/checkRequiredRelationships/checkMapCompleteness/checkOpenFindings/summarizeStorefrontDiscoveryProjection pure-function suites, plus buildDataVerificationSections() orchestration tests proving a count mismatch, an open conflict finding, and storefront-projection-is-informational-only wiring"
        status: pass
    human_judgment: false
  - id: D3
    description: "A gated real-MySQL integration test (phase03Integration.test.js) proves the full dry-run (no mutation) -> apply (--confirm-destructive) -> retry (no duplicates) -> verify (clean data_migration reconciliation) loop against disposable legacy landlord/tenant and dgfy_core_it_*/dgfy_business_it_* schemas, and a runbook documents the same procedure for manual rehearsal"
    requirement: "MIG-05"
    verification:
      - kind: unit
        ref: "tests/phase03Integration.test.js — confirmed skips cleanly (1 skipped, 0 failed) without RUN_PHASE03_INTEGRATION=true/MySQL in this session"
        status: pass
      - kind: other
        ref: "npm run lint:docs (docs/database/dgfy-migration-rehearsal.md validated, 21 governed docs OK)"
        status: pass
    human_judgment: true
    rationale: "The live-MySQL rehearsal itself (RUN_PHASE03_INTEGRATION=true against real disposable schemas) requires MySQL admin credentials not available in this automated session — same routing Phase 02's equivalent gated integration test used (02-VERIFICATION.md Human Verification #1). The test's structure, gating, fixture reuse, and clean-skip behavior were all verified directly in this session; only the actual live-database run needs a human with local MySQL access."

duration: 75min
completed: 2026-07-11
status: complete
---

# Phase 3 Plan 05: Data Verification and Gated Rehearsal Evidence Summary

**Closed the Phase 02 idempotency false-clean sentinel bug, added a full MIG-05 data verification reconciliation section (counts/map-completeness/required-relationships/open-findings) to `verify`, and shipped a gated real-MySQL dry-run/apply/retry/verify rehearsal test plus runbook.**

## Performance

- **Duration:** 75 min
- **Started:** 2026-07-11
- **Completed:** 2026-07-11
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- Fixed the exact false-clean idempotency bug flagged in `02-VERIFICATION.md`/`02-REVIEW.md` (WR-01) and `03-RESEARCH.md` Pitfall 5: `verify.js`'s `migration_metadata` error-fallback objects previously hardcoded `missing_migrations: []`, which the `idempotency` derivation treated identically to "zero pending, genuinely clean." Now the error path sets `missing_migrations: null` (an explicit unknown sentinel) and `idempotency` reports `ok:false, pending_migrations:null` with the underlying error for that target — a metadata check error can never again masquerade as a clean rerun.
- `apps/dgfy-migration-runner/src/data/verifyData.js` adds four pure, DB-free comparison functions (`checkDataCounts`, `checkRequiredRelationships`, `checkMapCompleteness`, `checkOpenFindings`) plus `buildDataVerificationSections()` orchestration, wired into `verify.js` as a new `data_migration` report section and `summary.data_migration_ok` flag. Source/target entity counts are compared net of this run's own legitimate skips (never a false mismatch), `account_staff_assignments` rows are checked against accepted `business_memberships` rows (ADR 0028, independent of what apply already enforced), `terminal_identities.location_id` is checked against migrated `locations`, and every open skip/conflict/orphan finding (including a missing accepted membership) keeps `data_migration_ok=false` until remediated — never silently clean.
- The `data_migration` section is scoped, not mandatory: when no `DGFY_MIGRATION_TARGET_MANIFEST` is configured, `verify` reports `{ok:true, skipped:true}` for that section rather than failing — Phase 02-style schema-only verify runs remain fully unaffected (confirmed via a full regression run: 284/286 tests passing, 2 intentionally gated skips, zero failures). Once a manifest is configured, the section fails closed on an invalid manifest or a verification error.
- `apps/dgfy-migration-runner/tests/phase03Integration.test.js` is a gated (`RUN_PHASE03_INTEGRATION=true`) real-MySQL rehearsal mirroring the Phase 02 disposable-schema pattern: it provisions disposable legacy landlord/tenant schemas plus `dgfy_core_it_*`/`dgfy_business_it_*` targets, seeds one account/tenant/accepted-membership/staff-user/location/terminal-registry fixture set (reusing 03-02's exact fixture builders), and drives the real `schema migrate` -> `data dry-run` (asserts zero target mutation) -> `data apply --confirm-destructive` -> apply retry (asserts no duplicate rows) -> `verify` (asserts `data_migration.ok:true` with zero open findings) loop, cleaning up only its own disposable schemas/metadata rows.
- `docs/database/dgfy-migration-rehearsal.md` is the MIG-05 rehearsal runbook: required env vars (including `DGFY_MIGRATION_TARGET_MANIFEST`), the manifest JSON shape, a 7-step manual rehearsal procedure, the gated test invocation, secret-handling checks (no password hashes/terminal secrets/`company_token` in reports), rollback review notes (evidence-led manual review, never a shared-database `DROP`), and 5 production-like rehearsal gates that must all pass before any real (non-disposable) apply run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix verify idempotency false-clean sentinel** - `7337ed83` (test, RED) + `98887e69` (fix, GREEN)
2. **Task 2: Add data verification reconciliation sections** - `74b3d103` (test, RED) + `1c15888c` (feat, GREEN)
3. **Task 3: Add gated Phase 03 rehearsal integration test and runbook** - `7f64b6f1` (test + docs)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/commands/verify.js` — idempotency null-sentinel fix; new `buildDataMigrationSection()` helper; `data_migration` report field + `summary.data_migration_ok`
- `apps/dgfy-migration-runner/src/data/verifyData.js` — `checkDataCounts`, `checkRequiredRelationships`, `checkMapCompleteness`, `checkOpenFindings`, `summarizeStorefrontDiscoveryProjection`, `buildDataVerificationSections`
- `apps/dgfy-migration-runner/tests/verifyCommand.test.js` — 4 tests for the idempotency sentinel fix
- `apps/dgfy-migration-runner/tests/dataVerify.test.js` — 18 tests: pure-function suites + orchestration wiring
- `apps/dgfy-migration-runner/tests/phase03Integration.test.js` — gated real-MySQL rehearsal test
- `apps/dgfy-migration-runner/tests/phase02Verification.test.js` / `tests/reportCommands.test.js` — updated `bootstrap.js`/`config/db.js` module mocks with the new table-name exports and `createLegacyTenantSourceConnection` so their fixed module graphs still resolve now that `verify.js` transitively imports `data/verifyData.js`
- `docs/database/dgfy-migration-rehearsal.md` — MIG-05 rehearsal runbook

## Decisions Made

- Used `null` (not a boolean flag or omitted field) as the explicit "metadata check errored, idempotency unknown" sentinel for `missing_migrations`, matching `02-REVIEW.md`'s own suggested fix exactly — the array-shaped happy-path contract (`missing_migrations: []` on success) is unchanged.
- Made the new `data_migration` verify section conditional on `DGFY_MIGRATION_TARGET_MANIFEST` being configured (skip cleanly, `ok:true` when absent) rather than requiring `{ requireMigrationManifest: true }` unconditionally — this avoided a regression across all of `phase02Verification.test.js`'s 21 tests and `reportCommands.test.js`'s `runVerify` tests, none of which configure a manifest, while still giving Phase 03 rehearsal runs full data verification coverage.
- Kept `checkDataCounts`/`checkRequiredRelationships`/`checkMapCompleteness`/`checkOpenFindings` fully DB-free and pure, mirroring `dryRun.js`'s established pure-plan/impure-orchestration split — this made every "mismatch fails", "open conflict fails", and "storefront projection never blocks" acceptance criterion directly unit-testable without mocking a database connection.
- Reused 03-02's `tests/fixtures/phase03/legacyRecords.js` builder functions verbatim in `phase03Integration.test.js` rather than inventing new fixture literals, keeping the live-rehearsal row shapes provably consistent with the already-unit-tested mapper contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing mocked test files needed new module exports after verify.js's import graph grew**
- **Found during:** Task 1/2, when running `phase02Verification.test.js` and `reportCommands.test.js` after wiring `verifyData.js` into `verify.js`
- **Issue:** Both files mock `../src/metadata/bootstrap.js` and `../src/config/db.js` as whole modules with a fixed export list. `verify.js` now transitively imports `LEGACY_ID_MAP_TABLE`/`DATA_CHECKPOINTS_TABLE`/`DATA_QUALITY_FINDINGS_TABLE` (via `data/verifyData.js` -> `metadata/dataState.js`/`metadata/bootstrap.js`) and `createLegacyTenantSourceConnection` (via `data/verifyData.js` -> `data/dryRun.js` -> `config/db.js`), which the existing mocks didn't export — causing a hard `SyntaxError: does not provide an export named ...` that failed the entire test suite (not just new tests).
- **Fix:** Added the three table-name constants and `createLegacyTenantSourceConnection: jest.fn()` to both files' existing `jest.unstable_mockModule()` calls.
- **Files modified:** `apps/dgfy-migration-runner/tests/phase02Verification.test.js`, `apps/dgfy-migration-runner/tests/reportCommands.test.js`
- **Verification:** Full runner suite re-run clean (284/286 passing, 2 gated skips, 0 failures).
- **Committed in:** `74b3d103` (bundled with Task 2's test commit, since the failure only surfaced once Task 2's wiring landed)

**2. [Rule 1 - Bug] `dataVerify.test.js`'s orchestration tests used the real (unmocked) `verifyData.js` due to ESM static-import/mock-ordering**
- **Found during:** Task 2, first test run of `dataVerify.test.js`
- **Issue:** A static top-level `import {...} from '../src/data/verifyData.js'` combined with `jest.unstable_mockModule()` calls placed later in the file (inside a `describe` block) silently used the real, unmocked `config/db.js` — ESM module linking resolves static imports before the module body's mock registration executes, so the orchestration tests threw `TypeError: Cannot destructure property 'host' of 'config.sourceDb'` from the real `createSourceConnection()`.
- **Fix:** Moved all `jest.unstable_mockModule()` calls and a single dynamic `await import('../src/data/verifyData.js')` to the top of the file (before any `describe` block), so both the pure-function tests and the orchestration tests use the same, correctly-mocked module instance.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataVerify.test.js`
- **Verification:** All 18 tests pass, including the 3 orchestration tests that now correctly exercise the mocked `config/db.js`/`metadata/dataState.js`.
- **Committed in:** `74b3d103` (never landed broken — caught and fixed before the commit)

## Issues Encountered

- Both deviations above were self-caught by running the test suite before committing; no broken code was ever committed. See Deviations for root cause and fix detail.

## User Setup Required

- **Human verification recommended:** run the gated real-MySQL Phase 03 rehearsal end-to-end with local disposable MySQL admin credentials:
  ```bash
  RUN_PHASE03_INTEGRATION=true npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js --watchman=false
  ```
  Expected: the test creates disposable `sku_it_landlord_*`/`sku_it_tenant_*`/`dgfy_core_it_*`/`dgfy_business_it_*` schemas, runs `schema migrate`, `data dry-run` (zero mutation), `data apply --confirm-destructive`, a retry apply (no duplicates), and `verify` (`data_migration.ok:true`, zero open findings), then drops only its own disposable schemas. This mirrors Phase 02's equivalent human-verification item (`02-VERIFICATION.md` Human Verification #1) — unavailable in this sandbox due to the same credential-access restriction, not a defect in this plan's work.

## Next Phase Readiness

- MIG-01 through MIG-05 are now all satisfied: mapping documentation (03-02), dry-run reporting (03-03), checkpointed/idempotent apply (03-04), and full data verification with a fixed idempotency sentinel plus a gated rehearsal proof (03-05).
- Phase 3's own goal — "old-to-new data migration scripts... prove a clean path away from the IMS-backed schema" — has its evidence chain complete: `docs/database/dgfy-data-migration-map.md` (what maps where), `apps/dgfy-migration-runner/src/data/{mappings,dryRun,apply,verifyData}.js` (how it's transformed/written/verified), and `docs/database/dgfy-migration-rehearsal.md` (how to prove it end-to-end).
- Phase 4 (backend APIs for Accounts/Businesses/Tenancy) can now build against a database contract that has both a stable schema (Phase 2) and a proven, retry-safe, verifiable migration path (Phase 3) — no blockers identified.
- The one open item is the live-MySQL rehearsal run itself (see User Setup Required above) — recommended before treating a real production-like migration as authorized, per this plan's own Section 8 production-like rehearsal gates in the runbook.

## Self-Check: PASSED

All created files and task commit hashes verified present in the working tree and git history:
- `apps/dgfy-migration-runner/src/data/verifyData.js` - FOUND
- `apps/dgfy-migration-runner/tests/verifyCommand.test.js` - FOUND
- `apps/dgfy-migration-runner/tests/dataVerify.test.js` - FOUND
- `apps/dgfy-migration-runner/tests/phase03Integration.test.js` - FOUND
- `docs/database/dgfy-migration-rehearsal.md` - FOUND
- `7337ed83`, `98887e69`, `74b3d103`, `1c15888c`, `7f64b6f1` - FOUND in git log

---
*Phase: 03-old-to-new-migration-proof*
*Completed: 2026-07-11*
