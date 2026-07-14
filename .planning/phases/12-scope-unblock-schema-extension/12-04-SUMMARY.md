---
phase: 12-scope-unblock-schema-extension
plan: 04
subsystem: database
tags: [mysql, migration-runner, umzug, schema-verification]

# Dependency graph
requires:
  - phase: 12-scope-unblock-schema-extension (12-02)
    provides: additive migration 20260716100000-extend-schema-for-legacy-migration.cjs and updated dgfyBusinessContract.js
provides:
  - Diagnostic evidence that the configured tenant DB target cannot currently be reached with the migration-runner's configured credentials — blocking proof of success criteria #2-#4
affects: [12-scope-unblock-schema-extension, 13-product-inventory-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.summary.txt
  modified: []

key-decisions:
  - "Did not fabricate success — routed to the human-verify checkpoint with exact command output per the plan's explicit instruction, rather than guessing/rotating DB credentials"
  - "ROADMAP/requirements NOT marked complete; this plan remains open pending operator resolution of the tenant DB credential/config blocker"

patterns-established: []

requirements-completed: []  # NOT completed — plan is blocked, see below. LDM-02/03/04 remain open pending re-run.

coverage:
  - id: D1
    description: "Apply migration 20260716100000 to a tenant DB via `schema migrate`, confirm via `verify` (business_schemas_ok true with real shapes), and prove idempotency on re-run"
    requirement: "LDM-02"
    verification: []
    human_judgment: true
    rationale: "Blocked before any migration could be applied — `schema migrate` and `verify` both fail with a MySQL access-denied error against the currently running lima-dgfy-dev tenant DB, and no DGFY_BUSINESS_DB_NAMES tenant target is configured, so even a successful connection would only prove the vacuous zero-tenant case. Requires operator to fix migration-runner DB credentials/target config, not something safely auto-fixable."

# Metrics
duration: 12min
completed: 2026-07-14
status: blocked
---

# Phase 12 Plan 04: Apply + Verify Additive Schema Against Tenant DB Summary

**Blocked before migration apply: migration-runner's configured DB user (`sieitzsqladmin`) is rejected by the currently running lima-dgfy-dev MySQL container, and no tenant DB target (`DGFY_BUSINESS_DB_NAMES`) is configured, so `schema migrate`/`verify` cannot prove success criteria #2-#4.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-14T09:57:00Z
- **Completed:** 2026-07-14T10:09:14Z
- **Tasks:** 1 of 2 attempted (Task 1 blocked; Task 2 checkpoint reached but cannot be operator-confirmed as passing)
- **Files modified:** 0 (2 diagnostic report files created, captured as evidence)

## Accomplishments
- Ran the exact Task 1 command sequence (`node src/cli.js status`, `node src/cli.js schema migrate`, `node src/cli.js verify`) from `apps/dgfy-migration-runner` against the currently configured environment.
- Confirmed the migration `20260716100000-extend-schema-for-legacy-migration.cjs` exists at `apps/dgfy-migration-runner/src/migrations/schema/` and is ready to apply once the DB is reachable.
- Captured a `verify` JSON + summary report as evidence of the exact failure mode, rather than fabricating a passing result.
- Diagnosed the root cause precisely (see Issues Encountered) by cross-checking the running `lima-dgfy-dev` MySQL container's actual configured user against the migration-runner's expected user, without reading or exposing the `.env` file's contents.

## Task Commits

Task 1 could not complete (blocked) — no code/schema change to commit. The two diagnostic `verify` report files were committed as evidence:

1. **Task 1 (blocked): capture verify diagnostic evidence** - `30b195ec` (chore)

**Plan metadata:** (this SUMMARY.md + STATE.md blocker note, committed separately)

_Note: This plan does not have a "plan complete" metadata commit — the plan remains open pending operator action. STATE.md is updated with the blocker but ROADMAP.md/REQUIREMENTS.md are intentionally left untouched, per this plan's explicit instruction not to mark completion until the checkpoint is actually approved._

## Files Created/Modified
- `apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.json` - Diagnostic verify report showing `core_schema.error`/`migration_metadata[].error`/`idempotency[].error`/`legacy_non_mutation.error` all `"Access denied for user 'sieitzsqladmin'@'172.18.0.1' (using password: YES)"`, and `business_schemas: []` (no tenant target configured)
- `apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.summary.txt` - One-line human-readable summary of the same run

## Decisions Made
- Did not attempt to guess or rotate DB credentials, nor create a `sieitzsqladmin` MySQL user myself — the `.env` file's contents are outside my read permissions in this environment, and fabricating/self-issuing tenant DB credentials would be an inappropriate auto-fix for a plan whose explicit purpose is to *prove* the schema against a real, correctly-configured tenant DB.
- Stopped at the Task 2 checkpoint with the exact diagnostic output, per the plan's Task 1 action text: "If the tenant DB / env cannot be reached in this environment, do NOT fabricate success — stop and route to the human checkpoint below with the exact command output."

## Deviations from Plan

None — plan executed exactly as written up to the point of the documented blocker; the blocker-routing behavior itself is what the plan's Task 1 action explicitly specifies.

## Issues Encountered

**Root cause identified (not fixed — requires operator action):**

1. Ran `node src/cli.js status` from `apps/dgfy-migration-runner`:
   ```
   [dgfy-migration-runner] fatal: Access denied for user 'sieitzsqladmin'@'172.18.0.1' (using password: YES)
   ```
2. Ran `node src/cli.js schema migrate` — same error, no migration applied, no report written (the CLI fails before reaching the report-writing step):
   ```
   [dgfy-migration-runner] fatal: Access denied for user 'sieitzsqladmin'@'172.18.0.1' (using password: YES)
   ```
3. Ran `node src/cli.js verify` — this command tolerates per-check connection failures and produces a report:
   ```
   [verify] status=success generated_at=2026-07-14T10:08:06.983Z metadata_schema_ok=false
   target_db_reachable=false target_db_name=dgfy_landlord core_schema_ok=false
   business_schemas_ok=true migration_metadata_ok=false tenant_coverage_ok=true
   idempotency_ok=false legacy_non_mutation_ok=false data_migration_ok=true
   ```
   The full JSON report shows every DB-touching check (`core_schema`, `migration_metadata`, `idempotency`, `legacy_non_mutation`) failing with the identical `Access denied for user 'sieitzsqladmin'@'172.18.0.1' (using password: YES)` error, and `business_schemas: []` — **`business_schemas_ok: true` here is the documented vacuous-pass case from `12-RESEARCH.md`'s Environment Availability caveat** ("If no tenant DB configured, `verify` reports `business_schemas: []`"), not a real pass. `data_migration_ok: true` is also vacuous (`DGFY_MIGRATION_TARGET_MANIFEST not configured — data migration verification skipped for this run`).

4. Cross-checked against the live infrastructure to isolate whether this is network unreachability (the `lima-dgfy-dev` arm64/amd64 image-architecture caveat noted in project memory) or a credentials/config mismatch:
   - `limactl list` shows the `dgfy-dev` Lima VM is `Running`.
   - `limactl shell dgfy-dev -- docker ps` shows `dgfy-platform-mysql-1` (`mysql:8.0`) is `Up ... (healthy)` on port 3306, along with backend/dgfy-api/frontend/nginx/redis, all healthy — this is a genuine MySQL server responding, not a network timeout.
   - The "Access denied ... (using password: YES)" error confirms the TCP connection succeeded and MySQL is actively rejecting the credential — this is **not** the amd64/arm64 GHCR-image reachability issue flagged in project memory (that issue affects `:develop` API container images, not this node-run CLI connecting directly to MySQL; `12-RESEARCH.md`'s own Environment Availability section already scoped that caveat out of Phase 12).
   - `limactl shell dgfy-dev -- docker exec dgfy-platform-backend-1 sh -c 'echo DB_USER=$DB_USER'` shows the app backend container is configured with `DB_USER=sku_inventory_user`, not `sieitzsqladmin`.
   - `limactl shell dgfy-dev -- docker exec dgfy-platform-mysql-1 sh -c 'echo MYSQL_USER=$MYSQL_USER'` shows the MySQL container itself was only bootstrapped with `MYSQL_USER=sku_inventory_user` (MySQL's official image only auto-creates the single user named in `MYSQL_USER`) — so a `sieitzsqladmin` user was never created in this instance of the tenant DB.

   **Conclusion:** the migration-runner's `.env` currently points at a DB user (`sieitzsqladmin`) that does not exist in the currently running `lima-dgfy-dev` MySQL container. This is either (a) a stale/rotated credential in `apps/dgfy-migration-runner/.env`, or (b) an expectation that a separate elevated admin user should have been provisioned in this tenant MySQL instance and wasn't. Resolving this requires operator action — either updating `apps/dgfy-migration-runner/.env` to use working credentials (e.g., the `sku_inventory_user`/root credentials the app containers use, if that account has sufficient DDL privileges) or creating the expected `sieitzsqladmin` user in the tenant MySQL instance — plus setting `DGFY_BUSINESS_DB_NAMES` to a real tenant database name so `verify`'s `business_schemas_ok` check is non-vacuous.

## User Setup Required

**Operator action required before this plan's checkpoint can be approved:**
1. Fix `apps/dgfy-migration-runner/.env` DB credentials so `node src/cli.js status` (or `schema migrate`) succeeds against the intended tenant DB (currently `lima-dgfy-dev`'s `dgfy-platform-mysql-1` container, or a different configured target).
2. Confirm `DGFY_BUSINESS_DB_NAMES` is set to at least one real `dgfy_business_*` tenant database name so `verify`'s `business_schemas_ok` reflects a genuine check, not the vacuous zero-tenant pass.
3. Re-run the Task 1 sequence (`schema migrate` → `verify` → `schema migrate` again → `verify`) and report the result to resume this plan.

## Next Phase Readiness

Blocked. Success criteria #2-#4 (schema applied + verified + proven idempotent against a real tenant DB) are NOT yet proven. This plan (12-04) must be resumed and its checkpoint approved before Phase 12 can be considered complete, since Phase 13's mapper work assumes the Plan 02 schema is confirmed present in a real tenant DB.

---
*Phase: 12-scope-unblock-schema-extension*
*Completed: BLOCKED — not completed, pending operator DB credential/config fix*

## Self-Check: PASSED
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.json
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.summary.txt
- FOUND: 30b195ec (chore commit)
