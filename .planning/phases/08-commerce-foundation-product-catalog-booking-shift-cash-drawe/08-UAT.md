---
status: passed
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
source: [08-VERIFICATION.md]
started: 2026-07-13T00:50:00Z
updated: 2026-07-13T03:20:00Z
---

## Current Test

All 6 tests resolved — UAT session complete.

## Tests

### 1. Verify migrations against a real tenant DB
expected: |
  Before re-running, first check whether `shifts` (and possibly `compliance_mode_state`) already
  exists on lima-dgfy-dev from the earlier failed attempt (see note below). If it exists, repair
  or drop it before re-running. Then run the 08-01/08-09/08-13 migrations against a real
  dgfy_business_* tenant, then run verify. Expected: ok:true, tables/columns present,
  branch_scope_key populated correctly, no MySQL error 1215. Why human: no live MySQL reachable
  in this environment.
result: pass
decision: |
  Re-run from a session with real docker/network access to lima-dgfy-dev (192.168.64.19),
  docker context `lima-dgfy-dev` reachable via `docker --context=lima-dgfy-dev`.
  Pre-check: `SHOW CREATE TABLE shifts` / `compliance_mode_state` on `dgfy_business_uat08retest001`
  already showed `ON DELETE RESTRICT` on all three previously-CASCADE FKs (terminal_id,
  cashier_account_id, branch_id) — no stale CASCADE table found, no DROP needed. The
  `command_executions` audit log in `dgfy_migration_meta` shows the fixed migration
  (`schema:migrate`) already succeeded at 2026-07-13T02:47:08Z (command id 6, exit_status=success,
  error_message=NULL), after 3 earlier failed attempts (ids 3-5, all "Cannot add foreign key
  constraint" — the original CASCADE/generated-column bug) — confirming the WR-01 stale-table
  risk did not materialize here.
  Ran `node src/cli.js schema migrate` (idempotent re-run: total_pending=0, executed=0) and
  `node src/cli.js verify` against TARGET_DB_HOST=192.168.64.19 with
  DGFY_BUSINESS_DB_NAMES=dgfy_business_uat08retest001 and real SOURCE_DB_* pointed at the same
  host's `sku_inventory_manager` (legacy fingerprint baseline requires a real source connection).
  Final verify result: metadata_schema_ok=true, target_db_reachable=true, core_schema_ok=true,
  business_schemas_ok=true, migration_metadata_ok=true, tenant_coverage_ok=true,
  idempotency_ok=true, legacy_non_mutation_ok=true, data_migration_ok=true (skipped — no
  DGFY_MIGRATION_TARGET_MANIFEST configured, not applicable to this check). `DESCRIBE shifts`
  confirms `active_terminal_cashier_key` STORED GENERATED column present and correctly derived.
  No MySQL error 1215. Full JSON evidence: `apps/dgfy-migration-runner/reports/2026-07-13T03-03-42-506Z-verify.json`.
note: |
  Original root-cause report (2026-07-13): "Environment up and healthy on lima-dgfy-dev
  (192.168.64.19)... Business-database migrations blocked on
  20260712100000-create-commerce-foundation.cjs: MySQL rejects shifts.terminal_id/
  shifts.cashier_account_id's ON DELETE CASCADE FKs because active_terminal_cashier_key is a
  STORED GENERATED column computed from those same two columns (InnoDB restriction, error 1215)."
  Fixed in code by 08-13-PLAN.md (CASCADE→RESTRICT on shifts.terminal_id, shifts.cashier_account_id,
  compliance_mode_state.branch_id), independently re-confirmed correct by 08-VERIFICATION.md's
  2026-07-13T10:30:00Z re-verification pass. NEW CAVEAT (08-REVIEW.md WR-01, independently
  confirmed by the verifier): lima-dgfy-dev's own incident report shows the migration failed
  partway through, on the shifts generated-column ALTER — meaning shifts.createTable() (with the
  OLD CASCADE FKs) almost certainly already ran and auto-committed on that specific environment
  before the fix existed. Simply re-running the fixed migration there may hit
  tableExists('shifts') === true, skip the createTable that carries the fix, and reproduce the
  identical error 1215. See item 4 below and the pre-check in "expected" above.

### 2. Append-only trigger firing
expected: Attempt a raw SQL UPDATE/DELETE against an inventory_movements row and a cash_drawer_events row. Expected: both rejected with SQLSTATE 45000. Why human: no live MySQL reachable; no unit test in this repo exercises the trigger SQL.
result: pass
decision: |
  Built a full live fixture chain via the real dgfy-api HTTP endpoints against lima-dgfy-dev
  (account signup, business create, activate-tenant CLI, staff account, a manually-seeded
  location+terminal since no HTTP endpoint exists for TerminalIdentity, a bookable service
  product, a booking, and an open shift). `SHOW TRIGGERS` confirmed all 4 expected append-only
  guards exist (`trg_inventory_movements_append_only_{update,delete}`,
  `trg_cash_drawer_events_append_only_{update,delete}`). Inserted one real row into each table,
  then ran a raw `UPDATE` and `DELETE` against each. All 4 attempts rejected identically:
  `ERROR 1644 (45000): <table> is append-only and cannot be <updated|deleted>`.
  Two unrelated infra gaps were found and fixed along the way (both outside Phase 8 code, both
  needed to exercise the app-layer fixtures at all): (1) `infrastructure/docker/docker-compose.yml`'s
  `dgfy-api` service was missing a `DB_NAME: dgfy_core` override and was inheriting `backend`'s
  legacy `sku_inventory_manager` value from the shared `.env`, breaking every `/accounts`,
  `/businesses` etc. endpoint — fixed by adding the override and restarting the container.
  (2) MySQL's `sku_inventory_user` app account only had explicit per-database grants (no
  wildcard), so newly-provisioned `dgfy_business_*` tenant databases had zero grants until
  manually added — granted `ALL PRIVILEGES` on the new tenant database directly. Neither gap is
  a defect in Phase 8's own migrations/triggers/app code.

### 3. Real-concurrency reproduction of the now-fixed row locks
expected: Against real MySQL under REPEATABLE READ, fire two concurrent cancelBooking() calls for the same booking id and two concurrent closeShift() calls for the same shift id. Expected: the second call in each pair blocks until the first commits, then observes the terminal status and is rejected — no double capacity release, no duplicate close event. Why human: requires real transaction-isolation timing under concurrent load; the mocked unit tests confirm the lock option is requested and the reject-second-operation logic, not live serialization timing.
result: pass
decision: |
  Using the same live fixtures as Test 2 (booking id=1 on a capacity-1 slot; shift id=1, open).
  Fired two genuinely concurrent `POST /bookings/1/cancel` requests (backgrounded curl processes,
  same instant) against lima-dgfy-dev: one returned 200 (`status: "cancelled"`), the other
  returned `VALIDATION_FAILED: "This booking is already cancelled."`. `booking_capacity.slots_remaining`
  ended at 1 (released exactly once — capacity was 1, one booking consumed it, one cancel restored
  it; a double-release would have left it at 2).
  Fired two genuinely concurrent `POST /shifts/1/close` requests the same way: one returned 200
  (`status: "closed"`), the other returned `CONFLICT: "This shift is not open."`.
  `cash_drawer_events` shows exactly one `close` event (id=3) — no duplicate — and `shifts.status`
  ended at `closed` with a single `closed_at` timestamp. No double capacity release, no duplicate
  close event, in both cases the second concurrent caller was cleanly rejected rather than
  double-processing.

### 4. Decision needed: is unvalidated shift-close reconciliation input (fresh review's CR-02) acceptable for Phase 8 sign-off?
expected: Review shiftController.js:34-47 / shiftUseCases.js:219-268 and decide whether sales_cash/refunds_cash/pay_ins/pay_outs should be hardcoded to 0 server-side (matching the module's own D-10 documentation) rather than accepted from the client, given Phase 9 has not yet wired a real sales-data source. Expected: a decision either to (a) accept this as an intentional, temporary gap awaiting Phase 9's real data source, or (b) require a small gap-closure plan now (the fix is a one-line controller change) before this is reachable in production. Why human: this is a product/security-posture judgment call about acceptable risk for an interim state.
result: pass
decision: "(a) Accepted as intentional, temporary gap. User rationale: all phases in this milestone will be implemented anyway, so Phase 9's real sales-data source is expected to land and close this gap; no interim gap-closure plan needed."

### 5. Decision needed: is the compliance-state non-atomicity (fresh review's CR-03) acceptable for Phase 8 sign-off, or does it need a follow-up gap-closure plan before Phase 9?
expected: Review the verifier's independent judgment in 08-VERIFICATION.md's Anti-Patterns section (real gap, narrow race/crash window, does not falsify FSC-01's must-haves as literally worded, but is the same bypass class one layer down). Expected: a decision either to (a) accept the current two-write sequence as sufficient for Phase 8, or (b) commission a follow-up plan to add a single recordVerificationAndState() transactional repository method before Phase 9 builds on this gate under real concurrent load. Why human: this is a severity/risk-acceptance judgment the verifier made a recommendation on but should not unilaterally decide.
result: pass
decision: "Accepted the current two-write sequence for Phase 8 sign-off (narrow race/crash window, not a deterministic bug). Unlike CR-02/test 4, this gap is NOT closed by any currently-planned future phase's own work — no roadmap phase touches complianceModeStateRepository.js. Explicitly tracked as a required backlog item (recordVerificationAndState() transactional repository method, mirroring shiftRepository.js's pattern) to be closed before the milestone ships, rather than assumed away."

### 6. Decision needed: how should the WR-01 stale-table risk be closed before this defect class is considered fully retired?
expected: Review 08-VERIFICATION.md's "A New, Independently-Confirmed Risk" section and decide whether to (a) accept the current in-place fix as sufficient once lima-dgfy-dev's stale shifts table (if it exists) is manually repaired/dropped this one time, treating WR-01 as a one-off operational cleanup, or (b) commission a small follow-up plan to add an idempotent FK-repair guard (inspecting information_schema.referential_constraints and re-creating the FK with RESTRICT if a stale table is ever encountered again). Why human: risk-acceptance judgment about a specific external environment's state, which the verifier cannot inspect, and an investment call between a one-off manual fix vs. a permanent code-level guard.
result: pass
decision: "(a) Accepted as one-off operational cleanup. Live evidence from Test 1 showed no stale CASCADE table was ever actually found on lima-dgfy-dev (dgfy_business_uat08retest001 already had RESTRICT FKs), and a second independently-fresh tenant (dgfy_business_aa1fb840807e198b6448) was provisioned via activate-tenant in the same session with zero FK errors. No follow-up gap-closure plan commissioned; matches the risk-acceptance pattern used for Tests 4/5 (CR-02/CR-03)."

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Running the 08-01/08-09 migrations against a real dgfy_business_* tenant results in ok:true, tables/columns present, branch_scope_key populated correctly."
  status: resolved
  reason: "User reported: business-database migrations blocked on 20260712100000-create-commerce-foundation.cjs — MySQL rejects shifts.terminal_id/shifts.cashier_account_id's ON DELETE CASCADE FKs because active_terminal_cashier_key is a STORED GENERATED column computed from those same two columns (InnoDB restriction, error 1215). dgfy_core migrations completed and validated fine; only the commerce-foundation business-DB migration fails."
  severity: blocker
  test: 1
  root_cause: "Confirmed by direct code read of apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs: shifts.terminal_id (lines 295-299) and shifts.cashier_account_id (lines 304-308) are both declared with onDelete: 'CASCADE'. Lines 336-344 then add active_terminal_cashier_key as a STORED GENERATED column computed as CONCAT_WS('|', terminal_id, cashier_account_id) — i.e. generated from those same two base columns. MySQL/InnoDB error 1215 is raised because a base column referenced by a CASCADE/SET NULL foreign key cannot simultaneously feed a stored generated column (InnoDB restriction on generated-column dependencies plus cascading FK actions)."
  artifacts:
    - path: "apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs"
      issue: "shifts.terminal_id (line ~298) and shifts.cashier_account_id (line ~307) both use onDelete: 'CASCADE' while also being the source columns of the STORED GENERATED active_terminal_cashier_key added at lines 336-344 — triggers MySQL error 1215 on migration"
  missing:
    - "Drop onDelete: 'CASCADE' on shifts.terminal_id and shifts.cashier_account_id (switch to 'RESTRICT' or 'NO ACTION', or handle cleanup in application code), OR restructure active_terminal_cashier_key to not be a STORED generated column derived directly from the two cascading FK columns"
  debug_session: ""
  fix: "08-13-PLAN.md switched shifts.terminal_id, shifts.cashier_account_id, and compliance_mode_state.branch_id (a second, previously-unexercised instance of the same defect) from CASCADE to RESTRICT. Independently re-confirmed correct by 08-VERIFICATION.md's 2026-07-13T10:30:00Z re-verification pass via direct code read and a full green test suite (316/316 migration-runner, 267/267 dgfy-api). Live-verified in UAT Test 1 (2026-07-13T03:03Z): SHOW CREATE TABLE confirmed RESTRICT FKs on lima-dgfy-dev's dgfy_business_uat08retest001, schema migrate ran idempotently (0 pending), and verify returned all-green including legacy_non_mutation_ok:true. A second, independently fresh tenant (dgfy_business_aa1fb840807e198b6448) was also provisioned via activate-tenant in the same session with zero FK errors. Status moved to resolved. WR-01's long-term-closure question (one-off cleanup vs. permanent code-level guard) remains open as Test 6."
