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
  - "Proven, DB-verified evidence: migration 20260716100000 applied to real dgfy_business_r0001/r0002/r0003 tenant DBs on the EC2 rehearsal host, business_schemas_ok=true with all new shapes confirmed, and a clean idempotent no-op re-run"
affects: [12-scope-unblock-schema-extension, 13-product-inventory-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.summary.txt
    - apps/dgfy-migration-runner/reports/2026-07-14T10-47-10-108Z-schema-migrate.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-47-10-108Z-schema-migrate.summary.txt
    - apps/dgfy-migration-runner/reports/2026-07-14T10-47-56-096Z-verify.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-47-56-096Z-verify.summary.txt
    - apps/dgfy-migration-runner/reports/2026-07-14T10-49-03-413Z-schema-migrate.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-49-03-413Z-schema-migrate.summary.txt
    - apps/dgfy-migration-runner/reports/2026-07-14T10-49-30-980Z-verify.json
    - apps/dgfy-migration-runner/reports/2026-07-14T10-49-30-980Z-verify.summary.txt
  modified: []

key-decisions:
  - "Local lima-dgfy-dev credential mismatch (sieitzsqladmin vs sku_inventory_user) was a dead end — the operator's actual intent was to verify against the EC2 rehearsal host (dgfy-temp), which already has a prepared docker-compose.migration.yml harness with real dgfy_business_r0001..r0026 tenant DBs"
  - "Synced apps/dgfy-migration-runner/src + package.json to the EC2 host (it was a stale pre-Wave-1 snapshot with no .git) before building the migration-runner image, so the image actually contained migration 20260716100000"
  - "Temporarily set DGFY_BUSINESS_DB_NAMES to 3 real tenant DBs in the EC2 compose override (was empty, which is the documented vacuous-pass trap) to run a non-vacuous verify, then reverted the override back to its original empty state afterward"
  - "Did not self-approve the blocking human-verify checkpoint — orchestrator gathered and presented the evidence; the operator typed 'approved' after reviewing it"

patterns-established: []

requirements-completed: [LDM-02, LDM-03, LDM-04]

coverage:
  - id: D1
    description: "Apply migration 20260716100000 to a tenant DB via `schema migrate`, confirm via `verify` (business_schemas_ok true with real shapes), and prove idempotency on re-run"
    requirement: "LDM-02"
    verification:
      - "apps/dgfy-migration-runner/reports/2026-07-14T10-47-10-108Z-schema-migrate.json — 20260716100000 executed against dgfy_business_r0001/r0002/r0003"
      - "apps/dgfy-migration-runner/reports/2026-07-14T10-47-56-096Z-verify.json — business_schemas_ok=true, products/product_embeddings/inventory_movements all confirmed, zero missing_*"
      - "apps/dgfy-migration-runner/reports/2026-07-14T10-49-03-413Z-schema-migrate.json — second run: total_pending=0, executed=0 (clean no-op)"
      - "apps/dgfy-migration-runner/reports/2026-07-14T10-49-30-980Z-verify.json — idempotency_ok=true (pending_migrations=[] on all 4 targets), legacy_non_mutation.unchanged=true"
    human_judgment: false
    rationale: "Full command sequence run against real tenant DBs on the EC2 rehearsal host, operator reviewed the evidence and approved the checkpoint"

# Metrics
duration: 12min (initial blocked attempt) + orchestrator-led EC2 verification + operator approval
completed: 2026-07-14
status: complete
---

# Phase 12 Plan 04: Apply + Verify Additive Schema Against Tenant DB Summary

**Schema proven against real tenant DBs on the EC2 rehearsal host (`dgfy-temp`): migration applied cleanly to `dgfy_business_r0001/r0002/r0003`, `verify` confirms all new shapes with `business_schemas_ok=true`, and a second `schema migrate` + `verify` proves a clean idempotent no-op. Operator approved the checkpoint.**

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

## Checkpoint Resolution (post-block)

The local `lima-dgfy-dev` credential mismatch was never fixed directly — the operator clarified the intent was to test against the EC2 rehearsal host (`dgfy-temp`, `54.169.107.105`) instead, which already had a prepared `docker-compose.migration.yml` harness in `~/dgfy-rehearsal-template` wiring a one-shot `migration-runner` container onto the same Docker network as the real `dgfy_business_r0001..r0026` tenant DBs.

Two gaps closed to use it:
1. `~/dgfy-platform` on EC2 was a stale deployed snapshot (no `.git`, predates Wave 1) — `rsync`'d current `apps/dgfy-migration-runner/src` + `package.json`/`package-lock.json` over before rebuilding the image.
2. `DGFY_BUSINESS_DB_NAMES` in the compose override was empty (the documented vacuous-pass trap) — temporarily set to 3 real tenant DBs for the run, then reverted to empty afterward so the shared rehearsal template returns to its prior state.

Full sequence run via `docker compose -f docker-compose.yml -f docker-compose.migration.yml run --rm migration-runner node src/cli.js <cmd>`:

1. `schema migrate` → `20260716100000-extend-schema-for-legacy-migration.cjs` executed against `dgfy_business_r0001/r0002/r0003` (business targets, not core), no errors.
2. `verify` → `business_schemas_ok: true`; `products` (7 new columns incl. `attributes`), `product_embeddings` (+ `unique_product_embeddings_product`), `inventory_movements` (+ `unique_inventory_movements_natural_key`) all confirmed with zero `missing_*` across all 3 tenants.
3. `schema migrate` (2nd run) → `total_pending=0, executed=0` — clean no-op, no duplicate-index/column error.
4. `verify` (2nd run) → `idempotency_ok: true` (`pending_migrations: []` on `dgfy_core` + all 3 business targets), `legacy_non_mutation.unchanged: true`.

One unrelated flag noted: `data_migration_ok: false` in both verify reports — pre-existing legacy data-migration count-mismatch noise in the shared rehearsal DB from earlier phase work, out of scope for this plan's acceptance criteria (schema shapes + idempotency only).

Operator reviewed this evidence and typed **"approved"**.

## User Setup Required

None further — checkpoint approved. (Original local `.env`/`lima-dgfy-dev` credential mismatch remains unresolved but is now understood to be a dead end for this verification path, not a blocker for Phase 12.)

## Next Phase Readiness

Complete. Success criteria #2-#4 (schema applied + verified + proven idempotent against a real tenant DB) are proven. Phase 13's mapper work can proceed on the assumption that the Plan 02 schema is confirmed present in a real tenant DB.

---
*Phase: 12-scope-unblock-schema-extension*
*Completed: 2026-07-14*

## Self-Check: PASSED
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-08-06-983Z-verify.json
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-47-10-108Z-schema-migrate.json
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-47-56-096Z-verify.json
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-49-03-413Z-schema-migrate.json
- FOUND: apps/dgfy-migration-runner/reports/2026-07-14T10-49-30-980Z-verify.json
- FOUND: 30b195ec (chore commit, initial blocked evidence)
- CONFIRMED: operator approval received for the blocking human-verify checkpoint
