---
status: testing
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
source: [08-VERIFICATION.md]
started: 2026-07-13T00:50:00Z
updated: 2026-07-13T00:50:00Z
---

## Current Test

number: 1
name: Verify migrations against a real tenant DB
expected: |
  Run the 08-01/08-09 migrations against a real dgfy_business_* tenant, then run verify.
  Expected: ok:true, tables/columns present, branch_scope_key populated correctly.
awaiting: user response

## Tests

### 1. Verify migrations against a real tenant DB
expected: Run the 08-01/08-09 migrations against a real dgfy_business_* tenant, then run verify. Expected: ok:true, tables/columns present, branch_scope_key populated correctly. Why human: no live MySQL reachable in this environment.
result: [pending]

### 2. Append-only trigger firing
expected: Attempt a raw SQL UPDATE/DELETE against an inventory_movements row and a cash_drawer_events row. Expected: both rejected with SQLSTATE 45000. Why human: no live MySQL reachable; no unit test in this repo exercises the trigger SQL.
result: [pending]

### 3. Real-concurrency reproduction of the now-fixed row locks
expected: Against real MySQL under REPEATABLE READ, fire two concurrent cancelBooking() calls for the same booking id and two concurrent closeShift() calls for the same shift id. Expected: the second call in each pair blocks until the first commits, then observes the terminal status and is rejected — no double capacity release, no duplicate close event. Why human: requires real transaction-isolation timing under concurrent load; the mocked unit tests confirm the lock option is requested and the reject-second-operation logic, not live serialization timing.
result: [pending]

### 4. Decision needed: is unvalidated shift-close reconciliation input (fresh review's CR-02) acceptable for Phase 8 sign-off?
expected: Review shiftController.js:34-47 / shiftUseCases.js:219-268 and decide whether sales_cash/refunds_cash/pay_ins/pay_outs should be hardcoded to 0 server-side (matching the module's own D-10 documentation) rather than accepted from the client, given Phase 9 has not yet wired a real sales-data source. Expected: a decision either to (a) accept this as an intentional, temporary gap awaiting Phase 9's real data source, or (b) require a small gap-closure plan now (the fix is a one-line controller change) before this is reachable in production. Why human: this is a product/security-posture judgment call about acceptable risk for an interim state.
result: [pending]

### 5. Decision needed: is the compliance-state non-atomicity (fresh review's CR-03) acceptable for Phase 8 sign-off, or does it need a follow-up gap-closure plan before Phase 9?
expected: Review the verifier's independent judgment in 08-VERIFICATION.md's Anti-Patterns section (real gap, narrow race/crash window, does not falsify FSC-01's must-haves as literally worded, but is the same bypass class one layer down). Expected: a decision either to (a) accept the current two-write sequence as sufficient for Phase 8, or (b) commission a follow-up plan to add a single recordVerificationAndState() transactional repository method before Phase 9 builds on this gate under real concurrent load. Why human: this is a severity/risk-acceptance judgment the verifier made a recommendation on but should not unilaterally decide.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
