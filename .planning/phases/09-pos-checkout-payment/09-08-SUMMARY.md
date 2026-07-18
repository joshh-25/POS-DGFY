---
phase: 09-pos-checkout-payment
plan: 08
subsystem: api
tags: [migration-runner, live-mysql, availments, schema-apply, integration-test]

requires:
  - phase: 09-pos-checkout-payment (plan 01)
    provides: 20260713120000-create-availment-checkout.cjs migration (availments, availment_items, availment_discounts, payments, receipts, compliance_evidence)
  - phase: 09-pos-checkout-payment (plan 07)
    provides: /v1/availments/* mounted and reachable through the real composition root
provides:
  - "Live schema-apply evidence: the Phase 9 migration applied and verified against a real dgfy_business_* tenant (dgfy_business_aa1fb840807e198b6448) on lima-dgfy-dev"
  - "Live end-to-end finalize proof: real create -> addLine -> finalize against real MySQL, with append-only-trigger and no-open-shift assertions passing"
  - "tests/helpers/tenantSchemaProvisioning.js now applies ALL business-target migrations dynamically (was hardcoded to 2 stale migration files), fixing a latent dgfyBusinessContract verification gap affecting every live-gated consumer"
affects: [09-pos-checkout-payment, uat, live-mysql-e2e, phase-04-live-tests, phase-08-live-tests]

tech-stack:
  added: []
  patterns:
    - "Live infra reachable via `docker --context=lima-dgfy-dev`; MySQL additionally port-forwards to 127.0.0.1:3306 / lima-dgfy-dev.local:3306 / 192.168.64.19:3306 directly from the host, so migration-runner and jest can connect without a docker exec wrapper."
    - "tenantSchemaProvisioning.js's applyAndVerifyBusinessSchema now dynamically loads every schema migration file under apps/dgfy-migration-runner/src/migrations/schema, filters to meta.targetKind === 'business', sorts by filename (timestamp-prefixed), and applies in order — mirroring the production migration-runner's buildMigrationsForKind() instead of a hand-maintained file list."

key-files:
  created:
    - apps/dgfy-api/tests/integration/availments/finalizeLive.test.js
  modified:
    - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js

key-decisions:
  - "Root-caused and fixed a latent bug in the shared tenantSchemaProvisioning helper rather than working around it: applyAndVerifyBusinessSchema hardcoded exactly 2 migration files (Phase 4's create-dgfy-business-foundation + add-dgfy-business-staff-invitations) and never grew to include Phase 8's create-commerce-foundation / harden-compliance-mode-state-uniqueness or Phase 9's create-availment-checkout, so its own dgfyBusinessContract full-table-list verification was failing for every consumer the moment Phase 8 landed new contract tables — it simply had never been exercised end-to-end since. Fixed to load migrations dynamically by targetKind so it can't go stale again. Re-verified businessFlows.test.js (12/12) and finalizeLive.test.js (2/2) both pass against real MySQL after the fix, with no regression."
  - "Target tenant for the live apply: dgfy_business_aa1fb840807e198b6448, the only business_database_registry row with status='active' AND verified_at set at the time of this run (the other existing tenant DB, dgfy_business_uat08retest001, was not registered/active and was left untouched)."

requirements-completed: [CHK-01, CHK-05, CHK-06]

coverage:
  - id: D1
    description: "The 09-01 availment-checkout migration applied to a real dgfy_business_* tenant database via the migration-runner (umzug), migration-runner reports total_pending=1 / executed=1, and all six tables plus append-only triggers plus the compliance_evidence generated column/unique index are confirmed present via direct SQL inspection."
    requirement: CHK-01
    verification:
      - kind: other
        ref: "node apps/dgfy-migration-runner/src/cli.js schema migrate (TARGET_DB_NAME=dgfy_business_aa1fb840807e198b6448) -> status=success total_pending=1 executed=1"
        status: pass
      - kind: other
        ref: "SHOW TABLES LIKE 'availment%'/'payments'/'receipts'/'compliance_evidence' -> all 6 present; SHOW TRIGGERS -> trg_{payments,receipts}_append_only_{update,delete} present; SHOW COLUMNS compliance_evidence LIKE 'branch_scope_key' -> STORED GENERATED; unique_compliance_evidence_business_branch_scope index present"
        status: pass
    human_judgment: false
  - id: D2
    description: "A live end-to-end finalize against the tenant DB records an availment + payment + immutable receipt, decrements stock for an inventory_issue line, and rejects a finalize with no open shift (CHK-06)."
    requirement: CHK-05
    verification:
      - kind: test
        ref: "LIVE_TENANT_DB=true BUSINESS_IT_DB_HOST=127.0.0.1 BUSINESS_IT_DB_PORT=3306 BUSINESS_IT_DB_USER=root BUSINESS_IT_DB_PASSWORD=*** npm test -- tests/integration/availments/finalizeLive.test.js -> 2/2 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Finalize with no open shift for the (cashier, terminal) pair is rejected as a conflict and persists nothing (CHK-06), proven against real MySQL, not mocked ports."
    requirement: CHK-06
    verification:
      - kind: test
        ref: "finalizeLive.test.js 'CHK-06: rejects finalize with a conflict when no open shift exists for the cashier/terminal, and persists nothing' -> pass"
        status: pass
    human_judgment: false

deviations:
  - "Task 2's original checkpoint framing assumed a human operator would run the apply/verify commands manually and paste evidence back. Instead, the operator (user) confirmed docker --context=lima-dgfy-dev was reachable and asked for the live apply + tests to be run directly from this session — which was done, with results captured here as the evidence artifact this checkpoint calls for."
  - "Discovered and fixed a real bug in tests/helpers/tenantSchemaProvisioning.js (see key-decisions) that was blocking the live-gated test from ever passing, and that also affected businessFlows.test.js / tenantSessionFlows.test.js / tenantSessionValidation.test.js / locationRoutes.test.js / phase4FullFlow.test.js's underlying schema verification the moment any of those live-gated suites were actually run post-Phase-8. Fix is additive (loads more migrations, never fewer) and was smoke-tested against businessFlows.test.js (12/12 pass) to confirm no regression."

open-questions: []
---

# 09-08: Live Migration Apply + End-to-End Finalize Proof

## What this plan closes

Phase 9's code (schema, models, money engine, repository, usecases, finalize orchestration,
composition-root wiring) was complete and unit/integration-tested with mocked ports as of
plan 09-07. This plan closes the one remaining gap flagged by the plan itself: proving the
schema actually applies to a real MySQL tenant and that a full checkout works end-to-end
against it — not just against mocks.

## Live environment

- Docker context: `lima-dgfy-dev` (also reachable at `lima-dgfy-dev.local:3306` /
  `192.168.64.19:3306` directly from the host — no `docker exec` wrapper needed for MySQL
  client connections).
- MySQL container: `dgfy-platform-mysql-1`, port `3306`, `root` user reachable from any host
  (`root@%`).
- Target tenant: `dgfy_business_aa1fb840807e198b6448` — the only `business_database_registry`
  row with `status='active' AND verified_at` set.

## Task 1: finalizeLive.test.js

Already authored in a prior session turn (see file for full content). Self-contained:
provisions its own throwaway landlord+tenant DB pair via `provisionAndActivateTenantDatabase`,
applies the Phase 9 migration directly on top, composes the real module wiring (no mocked
ports), seeds a product/shift/terminal/staff, and drives a real `createAvailment -> addLine ->
finalizeAvailment`.

**Bug found and fixed while proving this out:** `tests/helpers/tenantSchemaProvisioning.js`'s
`applyAndVerifyBusinessSchema` hardcoded exactly two migration files (Phase 4's
`create-dgfy-business-foundation` + `add-dgfy-business-staff-invitations`). It never grew to
include Phase 8's `create-commerce-foundation` / `harden-compliance-mode-state-uniqueness` or
this phase's `create-availment-checkout`, so its own full-`dgfyBusinessContract` verification
step failed the instant it checked for Phase 8+ tables (`products`, `shifts`,
`inventory_movements`, etc.) that this helper never applied. This is a latent bug that predates
Phase 9 and affects every consumer of this shared helper the moment they're actually run live
(they're all gated behind opt-in env vars, so it was never exercised post-Phase-8 until now).

Fixed by making `applyAndVerifyBusinessSchema` dynamically load every migration file under
`apps/dgfy-migration-runner/src/migrations/schema`, filter to `meta.targetKind === 'business'`,
sort by filename, and apply in order — mirroring the production migration-runner's own
`buildMigrationsForKind()` instead of a hand-maintained list that goes stale every phase.

Re-verified after the fix:
- `finalizeLive.test.js`: 2/2 pass (was 0/2, both failing on missing-tables before the fix).
- `businessFlows.test.js` (unrelated live-gated consumer of the same helper): 12/12 pass, no
  regression.
- Full `apps/dgfy-api` suite without live env vars: 360 passed, 193 skipped, 0 failed — the
  fix does not affect default (non-live) CI behavior.

## Task 2: Live schema apply + verify evidence

Ran directly against `lima-dgfy-dev`'s MySQL (per operator confirmation the docker context was
reachable) rather than via a manual operator handoff:

```
$ node apps/dgfy-migration-runner/src/cli.js verify
[verify] status=success target_db_reachable=true target_db_name=dgfy_business_aa1fb840807e198b6448 ...

$ node apps/dgfy-migration-runner/src/cli.js schema migrate
[schema:migrate] status=success generated_at=2026-07-13T08:19:57.755Z total_pending=1 executed=1
```

Post-apply verification via direct SQL against `dgfy_business_aa1fb840807e198b6448`:

- `SHOW TABLES LIKE 'availment%'` → `availment_discounts`, `availment_items`, `availments`
- `SHOW TABLES LIKE 'payments'` → `payments`
- `SHOW TABLES LIKE 'receipts'` → `receipts`
- `SHOW TABLES LIKE 'compliance_evidence'` → `compliance_evidence`
- `SHOW TRIGGERS` on `payments`/`receipts` → `trg_payments_append_only_update`,
  `trg_payments_append_only_delete`, `trg_receipts_append_only_update`,
  `trg_receipts_append_only_delete` all present (SIGNAL 45000 body confirmed).
- `SHOW COLUMNS FROM compliance_evidence LIKE 'branch_scope_key'` → `varchar(150)` `STORED
  GENERATED`.
- `SHOW INDEX FROM compliance_evidence` → `unique_compliance_evidence_business_branch_scope`
  unique index on `(business_id, branch_scope_key)` present.

All six tables + triggers + generated column/index match the migration's spec exactly.

Live end-to-end finalize proof:

```
$ LIVE_TENANT_DB=true BUSINESS_IT_DB_HOST=127.0.0.1 BUSINESS_IT_DB_PORT=3306 \
  BUSINESS_IT_DB_USER=root BUSINESS_IT_DB_PASSWORD=*** \
  npm test -- tests/integration/availments/finalizeLive.test.js

PASS tests/integration/availments/finalizeLive.test.js
  Availment finalize (real MySQL): CHK-01/02/04/05/06 end-to-end checkout
    ✓ finalizes a real availment end-to-end: availment finalized, payment written, receipt
      persisted and append-only-immutable, stock decremented (CHK-01/02/04/05)
    ✓ CHK-06: rejects finalize with a conflict when no open shift exists for the
      cashier/terminal, and persists nothing

Test Suites: 1 passed, 1 total
Tests: 2 passed, 2 total
```

The test's own throwaway landlord+tenant DB pair (separate from
`dgfy_business_aa1fb840807e198b6448`) is created and dropped within the test run; no leftover
databases remain (`SHOW DATABASES` post-run confirmed only the pre-existing 9 databases).

## Acceptance criteria — verified

- [x] Without a live tenant DB env, the test suite runs and `finalizeLive.test.js` is skipped
      with no failure (confirmed as part of the full 360-passed/193-skipped run).
- [x] With a live tenant DB env, the end-to-end finalize + append-only-immutability +
      no-open-shift assertions pass (2/2, shown above).
- [x] Migration-runner `schema migrate` reports `total_pending=1 executed=1` against
      `dgfy_business_aa1fb840807e198b6448`, and all six new tables + triggers + generated
      column/index are present per direct SQL inspection.

## Not committed

`apps/dgfy-api/tests/integration/availments/finalizeLive.test.js` (new) and
`apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js` (modified) remain in the working
tree, along with the other phase-09 SUMMARY.md files, for the user to review and commit.
