---
phase: 11-order-fulfillment-delivery-coordination
plan: 01
subsystem: database
tags: [sequelize, mysql, migration-runner, tenant-model, event-sourcing, append-only]

# Dependency graph
requires:
  - phase: 09-pos-checkout-payment
    provides: availments table + Availment Tenant model (draft/finalized/voided checkout lifecycle)
  - phase: 10-storefront-discovery-online-ordering
    provides: finalizeStorefrontOrder() cross-DB finalize seam this phase's future plans hook into
provides:
  - Additive fulfillment_mode/fulfillment_status/fulfillment_stage read-cache columns on availments
  - Append-only availment_stage_events event ledger (DB-level SIGNAL 45000 triggers + model throwing hooks)
  - Mutable-payout courier_assignments table (payout_status owed/paid, paid_at, updated_at)
  - AvailmentStageEvent and CourierAssignment Tenant models registered in tenantConnector.getModels()
  - Availment.hasMany stageEvents / courierAssignments associations
  - dgfyBusinessContract.js coverage for both new tables + 3 new availments columns
affects: [11-02-fulfillment-module, 11-03-finalize-seam, 11-04-live-apply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-field event-sourced fulfillment status: append-only availment_stage_events ledger is source of truth, availments.fulfillment_* columns are a denormalized read cache of the LATEST event"
    - "Deliberate append-only/mutable divergence within one migration file: availment_stage_events gets SIGNAL 45000 triggers, courier_assignments (payout sub-lifecycle) does not"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs
    - apps/dgfy-api/src/models/Tenant/AvailmentStageEvent.js
    - apps/dgfy-api/src/models/Tenant/CourierAssignment.js
  modified:
    - apps/dgfy-api/src/models/Tenant/Availment.js
    - apps/dgfy-api/src/infra/tenantConnector.js
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js

key-decisions:
  - "D-01/D-02/D-03/D-04/D-10/D-15 all implemented exactly as locked in the plan objective — no re-litigation of resolved research forks (A4 no backfill, A5 courier payout mutable, Open Q2 distinct is_forced column, Open Q3 single-table payout)"
  - "fulfillment_status is a strictly distinct column name from the existing availments.status ENUM (Landmine 1) — never touched or reused"
  - "courier_assignments deliberately excluded from the migration's appendOnlyTables trigger array and the CourierAssignment model's updatedAt/hook configuration, stated explicitly in both files' header comments (Landmine 3/A5)"

requirements-completed: [FUL-01, FUL-02, FUL-03]

coverage:
  - id: D1
    description: "Additive migration adds fulfillment_mode/fulfillment_status/fulfillment_stage to availments without touching the existing status ENUM"
    requirement: "FUL-01"
    verification:
      - kind: unit
        ref: "node --check + grep verification: targetKind 'business', fulfillment_status present, courier_assignments present, no 'status' column reference in migration file"
        status: pass
    human_judgment: false
  - id: D2
    description: "availment_stage_events created as a strictly append-only table (created_at only, BEFORE UPDATE/DELETE SIGNAL 45000 triggers), courier_assignments created as a MUTABLE payout table with no append-only trigger"
    requirement: "FUL-02"
    verification:
      - kind: unit
        ref: "node --check apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs; appendOnlyTables array grep-confirmed to contain only availment_stage_events"
        status: pass
    human_judgment: true
    rationale: "DB-level trigger behavior (SIGNAL 45000 firing on UPDATE/DELETE) requires a live MySQL connection to exercise; this plan validates syntax/shape only, not live DDL execution — deferred to Plan 04 (live apply)."
  - id: D3
    description: "AvailmentStageEvent and CourierAssignment models registered in tenantConnector.getModels() and resolve correctly (not undefined) — the exact Phase 9 Pitfall 1 bug is not repeated"
    requirement: "FUL-03"
    verification:
      - kind: unit
        ref: "node --check on both model files; grep confirms 'AvailmentStageEvent: defineAvailmentStageEventModel' and 'CourierAssignment: defineCourierAssignmentModel' present in tenantConnector.js modelDefiners map"
        status: pass
    human_judgment: false
  - id: D4
    description: "Availment hasMany AvailmentStageEvent and hasMany CourierAssignment associations wired"
    requirement: "FUL-03"
    verification:
      - kind: unit
        ref: "grep confirms \"as: 'stageEvents'\" and \"as: 'courierAssignments'\" present in Availment.js associate()"
        status: pass
    human_judgment: false
  - id: D5
    description: "Migration-runner verification contract extended to cover both new tables and the 3 new availments columns"
    verification:
      - kind: unit
        ref: "node --check + dynamic import of dgfyBusinessContract.js confirms tables.availment_stage_events, tables.courier_assignments exist and tables.availments.columns includes fulfillment_status"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 01: Fulfillment Schema Foundation Summary

**Additive Sequelize migration + two registered Tenant models implementing the two-field event-sourced fulfillment-status shape (append-only availment_stage_events ledger, mutable-payout courier_assignments, denormalized availments read-cache columns) — the schema foundation every downstream Phase 11 plan depends on.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-13T15:50:00Z
- **Completed:** 2026-07-13T16:02:32Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- One additive `targetKind: 'business'` migration (`20260715120000-create-availment-fulfillment.cjs`) adds three nullable read-cache columns to `availments`, creates the strictly append-only `availment_stage_events` ledger with DB-level `SIGNAL SQLSTATE '45000'` triggers, and creates the deliberately mutable `courier_assignments` payout table — with the append-only trigger loop explicitly scoped to exclude `courier_assignments`.
- Two new Tenant models (`AvailmentStageEvent.js`, `CourierAssignment.js`) mirror `InventoryMovement.js`'s factory-function shape, with `CourierAssignment` deliberately diverging (mutable `updatedAt: 'updated_at'`, no throwing update hooks) and stating that divergence explicitly in its header comment.
- Both models registered in `tenantConnector.getModels()`'s `modelDefiners` map — closing the exact class of bug Phase 9 shipped (Pitfall 1: models existing but never registered, resolving `undefined` at runtime).
- `Availment.js` gains the three denormalized read-cache columns plus `hasMany` associations to both new models.
- `dgfyBusinessContract.js` gains full column/index/foreignKey entries for both new tables and the three new `availments` columns, without expanding scope to the four pre-existing missing Phase 9 contract entries (Landmine 5, correctly left out of scope).

## Task Commits

Each task was committed atomically:

1. **Task 1: Additive fulfillment migration (columns + two tables + append-only triggers on stage events only)** - `401563b3` (feat)
2. **Task 2: Two Tenant models + Availment associations + tenantConnector registration** - `a7a649a4` (feat)
3. **Task 3: Extend migration-runner verification contract** - `478a3204` (docs)

_Note: no TDD tasks in this plan — schema/model scaffolding only._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs` - Additive migration: 3 availments columns, availment_stage_events (append-only), courier_assignments (mutable payout)
- `apps/dgfy-api/src/models/Tenant/AvailmentStageEvent.js` - Append-only Tenant model, mirrors InventoryMovement.js factory shape
- `apps/dgfy-api/src/models/Tenant/CourierAssignment.js` - Mutable-payout Tenant model, deliberate divergence documented in header
- `apps/dgfy-api/src/models/Tenant/Availment.js` - Added fulfillment_mode/fulfillment_status/fulfillment_stage columns + stageEvents/courierAssignments hasMany associations
- `apps/dgfy-api/src/infra/tenantConnector.js` - Registered both new models in getModels() modelDefiners map
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - Added availment_stage_events + courier_assignments table entries, extended availments column list

## Decisions Made
- Implemented every locked decision from the plan objective (D-01, D-02, D-03, D-04, D-10, D-15) exactly as specified — no deviation from the plan's pre-resolved research forks (A4 no backfill, A5 courier payout mutable, Open Q2 distinct `is_forced` column, Open Q3 single-table payout).
- Kept `fulfillment_status` strictly distinct from the existing `availments.status` ENUM (Landmine 1) throughout the migration, both models, and the contract — verified via grep that the migration file never references the `status` column.
- Documented the `courier_assignments` append-only exclusion in three places (migration header comment, migration's `appendOnlyTables` array comment, and `CourierAssignment.js`'s header comment) so the deliberate divergence (Landmine 3/A5) is unambiguous to future readers.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` specs, `<verify>` automated checks, and `<acceptance_criteria>` without requiring any Rule 1-4 auto-fixes.

## Issues Encountered

None. The `node --check` verification pass on `dgfyBusinessContract.js` is CJS-syntax-only (the file is an ESM module per `apps/dgfy-migration-runner/package.json`'s `"type": "module"`), so a follow-up `import()` smoke test was run to confirm the contract object itself loads and exposes both new table keys with correct column lists — this additional check was not in the plan's `<verify>` block but strengthens confidence beyond syntax-checking alone.

## User Setup Required

None - no external service configuration required. This plan is pure schema/model scaffolding; no live MySQL apply was performed (deferred to Plan 04, live apply).

## Next Phase Readiness

- The schema foundation (migration, both models, contract coverage) is complete and ready for Plan 02 (fulfillment module usecases/repositories/controllers) to build against.
- Plan 03 (finalize-seam auto-write) can now inject `recordStageEvents` writes into `availmentRepository.js`'s two `finalizePersist`/`finalizeStorefrontOrder` transactions using the now-registered `AvailmentStageEvent` model.
- Plan 04 (live apply) can run `schema migrate` against a real tenant database to exercise the DB-level `SIGNAL '45000'` triggers and confirm `courier_assignments.payout_status` is genuinely updatable — that live verification is explicitly deferred from this plan (see D2's `human_judgment: true` rationale above).
- No blockers identified.

---
*Phase: 11-order-fulfillment-delivery-coordination*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 4 commits (`401563b3`, `a7a649a4`, `478a3204`, `5cb96162`) confirmed present in git log.
