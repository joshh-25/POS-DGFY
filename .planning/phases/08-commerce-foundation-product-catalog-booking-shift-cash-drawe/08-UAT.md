---
status: testing
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
source: [08-VERIFICATION.md]
started: 2026-07-13T00:50:00Z
updated: 2026-07-13T10:30:00Z
---

## Current Test

number: 1
name: Verify migrations against a real tenant DB (re-test after 08-13's CASCADE→RESTRICT fix)
expected: |
  Before re-running, first check whether `shifts` (and possibly `compliance_mode_state`) already
  exists on lima-dgfy-dev from the earlier failed attempt — MySQL auto-commits CREATE TABLE
  independently of a later failed ALTER, so the table likely persisted with the OLD CASCADE FKs.
  If it exists: drop it and re-run the full chain fresh, or manually ALTER the FK to RESTRICT
  before re-running. Then run the 08-01/08-09/08-13 migrations, then verify. Expected: ok:true,
  tables/columns present, branch_scope_key/active_terminal_cashier_key populated correctly, no
  MySQL error 1215.
awaiting: user response

## Tests

### 1. Verify migrations against a real tenant DB
expected: |
  Before re-running, first check whether `shifts` (and possibly `compliance_mode_state`) already
  exists on lima-dgfy-dev from the earlier failed attempt (see note below). If it exists, repair
  or drop it before re-running. Then run the 08-01/08-09/08-13 migrations against a real
  dgfy_business_* tenant, then run verify. Expected: ok:true, tables/columns present,
  branch_scope_key populated correctly, no MySQL error 1215. Why human: no live MySQL reachable
  in this environment.
result: pending
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
result: blocked
blocked_by: prior-phase
reason: "Blocked by Test 1: business-database migration 20260712100000-create-commerce-foundation.cjs fails to apply (MySQL error 1215), so inventory_movements/cash_drawer_events tables don't exist to test against."

### 3. Real-concurrency reproduction of the now-fixed row locks
expected: Against real MySQL under REPEATABLE READ, fire two concurrent cancelBooking() calls for the same booking id and two concurrent closeShift() calls for the same shift id. Expected: the second call in each pair blocks until the first commits, then observes the terminal status and is rejected — no double capacity release, no duplicate close event. Why human: requires real transaction-isolation timing under concurrent load; the mocked unit tests confirm the lock option is requested and the reject-second-operation logic, not live serialization timing.
result: blocked
blocked_by: prior-phase
reason: "Blocked by Test 1: business-database migration 20260712100000-create-commerce-foundation.cjs fails to apply (MySQL error 1215), so shifts/bookings tables don't exist to test concurrency against."

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
result: pending

## Summary

total: 6
passed: 2
issues: 0
pending: 2
skipped: 0
blocked: 2

## Gaps

- truth: "Running the 08-01/08-09 migrations against a real dgfy_business_* tenant results in ok:true, tables/columns present, branch_scope_key populated correctly."
  status: fix_applied_pending_live_verification
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
  fix: "08-13-PLAN.md switched shifts.terminal_id, shifts.cashier_account_id, and compliance_mode_state.branch_id (a second, previously-unexercised instance of the same defect) from CASCADE to RESTRICT. Independently re-confirmed correct by 08-VERIFICATION.md's 2026-07-13T10:30:00Z re-verification pass via direct code read and a full green test suite (316/316 migration-runner, 267/267 dgfy-api). Status held at fix_applied_pending_live_verification rather than resolved because: (1) the fix has not yet been exercised against live MySQL, and (2) 08-REVIEW.md's WR-01 finding — independently confirmed by the verifier — means lima-dgfy-dev specifically may have a stale, partially-created shifts table with the OLD CASCADE FK left over from the original failed run, which could reproduce the identical error 1215 on a naive re-run. See UAT Test 1's expanded pre-check and Test 6's decision item."
