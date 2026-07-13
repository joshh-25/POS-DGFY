---
phase: 11-order-fulfillment-delivery-coordination
plan: 03
subsystem: api
tags: [clean-architecture, sequelize, express, port-injection, fulfillment, availments, composition-root]

# Dependency graph
requires:
  - phase: 11-order-fulfillment-delivery-coordination (Plan 01)
    provides: availment_stage_events (append-only ledger) table, AvailmentStageEvent Tenant model, Availment.fulfillment_mode/fulfillment_status/fulfillment_stage denormalized columns
  - phase: 11-order-fulfillment-delivery-coordination (Plan 02)
    provides: "buildFulfillmentModule() DI factory exposing recordStageEvents port bound to stageEventRepository.bulkCreate, plus FUL-01/02/03 usecases/controller/routes"
provides:
  - "finalizePersist() (POS/dine-in) now auto-writes the full 5-row per-mode stage sequence (placed->confirmed->preparing->ready->completed) inside its existing transaction and sets denormalized fulfillment_mode/fulfillment_status='completed'/fulfillment_stage='completed' (D-05)"
  - "finalizeStorefrontOrder() (online) now persists fulfillment_mode (previously dropped, L2) and writes one 'placed' stage event inside its existing transaction, setting fulfillment_status='placed'/fulfillment_stage='placed' (D-06/A2)"
  - "buildAvailmentsModule() accepts an OPTIONAL recordStageEvents port + posFulfillmentModeDefault (A1, default dine_in), threaded into both finalize usecases"
  - "Composition root (routes/index.js) builds buildFulfillmentModule() reusing the shared tenantConnector/businessDatabaseRegistryRepository/businessRepository instances, injects recordStageEvents into buildAvailmentsModule(), and mounts /fulfillment top-level"
affects: [11-04-live-apply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-event auto-write duplicated locally in availmentRepository.js (FINALIZE_STAGE_SEQUENCES) rather than imported from modules/fulfillment/usecases/fulfillmentUseCases.js's STAGE_SEQUENCES — the availments repository must never import the fulfillment module directly (Pitfall 4); kept in lockstep by convention/tests"
    - "recordStageEvents port injected at the composition root exactly like recordSaleEffect/commitReservation — OPTIONAL on both buildAvailmentsModule() and the repository methods so existing test composition (finalizeLive.test.js, unit tests) keeps building without a breaking constructor change"
    - "recordStageEvents (bound to stageEventRepository.bulkCreate) naturally throws/rejects on failure rather than returning an ApplicationResult — no explicit isSuccess check needed (unlike recordSaleEffect/commitReservation); the await inside sequelize.transaction() already rolls back on rejection"

key-files:
  created: []
  modified:
    - apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js
    - apps/dgfy-api/src/modules/availments/index.js
    - apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js
    - apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js
    - apps/dgfy-api/src/routes/index.js

key-decisions:
  - "Added actorStaffAccountId/actorAccountId as new optional finalizePersist parameters (attributed onto every written stage-event row) resolved in availmentUseCases.js from the existing cashierAccountId/requestingAccountId inputs — the plan's Task 1 action text required 'actor_staff_account_id/actor_account_id from the header/caller' but neither field existed on the header object already threaded to finalizePersist, so this is the narrowest addition that satisfies the stated requirement without touching the header object's existing contract"
  - "buildFinalizeAvailmentUseCase accepts an optional controller-supplied fulfillmentMode override (input.fulfillmentMode) falling back to posFulfillmentModeDefault ('dine_in', A1) — matches the plan's 'accept an optional controller-supplied override' framing for A1"

requirements-completed: [FUL-01, FUL-02]

coverage:
  - id: D1
    description: "finalizePersist() (POS/dine-in) sets denormalized fulfillment_mode/fulfillment_status='completed'/fulfillment_stage='completed' and, via the optional recordStageEvents port, writes the full 5-row per-mode sequence inside the existing transaction, throwing on port failure to roll back the whole finalize"
    requirement: "FUL-02"
    verification:
      - kind: integration
        ref: "apps/dgfy-api/tests/integration/availments/finalize.test.js — buildFinalizeAvailmentUseCase describe block (7 tests, repository.finalizePersist mocked at the boundary; happy path + WARNING-1 rollback-on-failure precedent still pass with the new optional params)"
        status: pass
    human_judgment: false
  - id: D2
    description: "finalizeStorefrontOrder() (online) persists fulfillment_mode (previously dropped) and writes one 'placed' stage event inside the existing transaction when recordStageEvents is supplied, throwing on port failure; not reached on the idempotent-hit early return"
    requirement: "FUL-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js — AvailmentRepository.finalizeStorefrontOrder describe block (5 tests: fresh call, idempotent no-op, lost-guard race, reservation-failure rollback, thrown-error rollback) + buildFinalizeStorefrontOrderUseCase describe block (9 tests, expect.objectContaining assertions tolerate the new fulfillmentMode/recordStageEvents fields)"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildAvailmentsModule() accepts and threads an OPTIONAL recordStageEvents port + posFulfillmentModeDefault ('dine_in', A1) into both buildFinalizeAvailmentUseCase and buildFinalizeStorefrontOrderUseCase, without breaking existing composition that omits it"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/availments/availmentUseCases.test.js (24 tests, all pass with no recordStageEvents wired) + apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js (full app boot via src/app.js -> routes/index.js -> buildAvailmentsModule, 7 tests pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The availments repository never imports the fulfillment module — routes/index.js builds buildFulfillmentModule(...) reusing the SAME shared tenantConnector/businessDatabaseRegistryRepository/businessRepository instances and injects recordStageEvents: fulfillmentModule.recordStageEvents into buildAvailmentsModule(), and mounts router.use('/fulfillment', createFulfillmentRoutes(...))"
    requirement: "FUL-01"
    verification:
      - kind: other
        ref: "grep -q 'modules/fulfillment' apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js returns no match (never imported); node --check src/routes/index.js passes; grep confirms buildFulfillmentModule/recordStageEvents: fulfillmentModule.recordStageEvents/'/fulfillment' all present"
        status: pass
      - kind: integration
        ref: "ad-hoc smoke test (removed after verification): GET /v1/fulfillment/incoming-orders against the full booted app returns 401 (mounted, auth-gated) not 404 (unmounted)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 03: Finalize Seam + Composition Root Wiring Summary

**Both Availment finalize transactions (POS/dine-in `finalizePersist` and online `finalizeStorefrontOrder`) now auto-write stage events atomically via an injected `recordStageEvents` port, the previously-dropped online `fulfillmentMode` is persisted, and `/fulfillment` is mounted at the composition root reusing the shared tenant instances — closing the phase's finalize-seam linchpin (D-05/D-06/L2) without the availments repository ever importing the fulfillment module.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-14T00:27:04+08:00 (wave start)
- **Completed:** 2026-07-14T00:38:11+08:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `availmentRepository.js`: `finalizePersist()` now sets denormalized `fulfillment_mode`/`fulfillment_status='completed'`/`fulfillment_stage='completed'` on the same `availment.update({ status: 'finalized', ... })` call, and — when the optional `recordStageEvents` port is supplied — builds and writes the FULL 5-row per-mode stage sequence (`placed`→`confirmed`→`preparing`→`ready`→`completed` for pickup/dine_in) inside the SAME `sequelize.transaction()`, attributing `actorStaffAccountId`/`actorAccountId` on every row. A local `FINALIZE_STAGE_SEQUENCES` map (duplicated, not imported from `modules/fulfillment`) supplies the per-mode stage lists per Pitfall 4.
- `availmentRepository.js`: `finalizeStorefrontOrder()` now persists `fulfillment_mode` on the `AvailmentModel.create(...)` payload (closing Landmine 2 — previously silently dropped) plus `fulfillment_status='placed'`/`fulfillment_stage='placed'`, and — when `recordStageEvents` is supplied — writes ONE `placed` stage event inside the same transaction, immediately after the `AvailmentItem` lines and before the reservation→sale commit. No auto-advance to `confirmed` (A2). The write is skipped entirely on the idempotent-hit early return (no duplicate stage event on a repeat call for the same `source_reference`).
- `availments/index.js`: `buildAvailmentsModule()` accepts an OPTIONAL `recordStageEvents` port and a `posFulfillmentModeDefault` (default `'dine_in'`, A1), threaded into both `buildFinalizeAvailmentUseCase` and (when `commitReservation` is present) `buildFinalizeStorefrontOrderUseCase`.
- `availmentUseCases.js`: `buildFinalizeAvailmentUseCase` resolves `fulfillmentMode` from an optional controller-supplied `input.fulfillmentMode` override, falling back to `posFulfillmentModeDefault`, and passes it — plus `recordStageEvents`, `actorStaffAccountId: cashierAccountId`, `actorAccountId: requestingAccountId` — into `repository.finalizePersist(...)`.
- `storefrontFinalizeUseCases.js`: `buildFinalizeStorefrontOrderUseCase` now threads the already-received `fulfillmentMode` and the injected `recordStageEvents` straight into `repository.finalizeStorefrontOrder(...)` (previously `fulfillmentMode` was destructured but never forwarded to the repository).
- `routes/index.js`: builds `buildFulfillmentModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })` BEFORE `buildAvailmentsModule(...)`, reusing the exact shared instances constructed earlier in the file (never a second, divergent set — Pitfall 4); injects `recordStageEvents: fulfillmentModule.recordStageEvents` into `buildAvailmentsModule(...)`; mounts `router.use('/fulfillment', createFulfillmentRoutes(fulfillmentModule.useCases, { authenticateAccount }))` top-level (not nested under `/businesses/:businessId`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Inject stage-event auto-write into both finalize transactions + thread fulfillmentMode** - `7b9adcda` (feat)
2. **Task 2: Composition-root wiring + mount /fulfillment** - `01da91eb` (feat)

## Files Created/Modified
- `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` - Both finalize transactions auto-write stage events + denormalized columns
- `apps/dgfy-api/src/modules/availments/index.js` - Threads recordStageEvents + posFulfillmentModeDefault (both optional)
- `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` - Resolves fulfillmentMode/actor fields into finalizePersist
- `apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js` - Forwards fulfillmentMode + recordStageEvents into finalizeStorefrontOrder
- `apps/dgfy-api/src/routes/index.js` - Composes buildFulfillmentModule(), injects recordStageEvents, mounts /fulfillment

## Decisions Made
- Added `actorStaffAccountId`/`actorAccountId` as new optional `finalizePersist` parameters, resolved in `availmentUseCases.js` from the existing `cashierAccountId`/`requestingAccountId` inputs — the plan's Task 1 action text requires stage-event rows to carry an actor "from the header/caller," but neither field already existed on the `header` object threaded to `finalizePersist`; this is the narrowest addition satisfying that requirement without changing `header`'s existing contract or any caller's other call sites.
- `buildFinalizeAvailmentUseCase` accepts an optional controller-supplied `fulfillmentMode` override (`input.fulfillmentMode`), falling back to `posFulfillmentModeDefault` (`'dine_in'`) — matches A1's "default dine_in, with an optional controller-supplied override" resolution exactly.
- Kept `FINALIZE_STAGE_SEQUENCES` as a locally-duplicated frozen map inside `availmentRepository.js` (not imported from `modules/fulfillment/usecases/fulfillmentUseCases.js`'s `STAGE_SEQUENCES`) — required by the plan's own explicit Pitfall-4 constraint ("the availments repository never imports the fulfillment module directly"); the two maps are documented as kept-in-lockstep by convention, covered independently by each module's own test suite (`fulfillmentUseCases.test.js`'s `STAGE_SEQUENCES` tests vs. this plan's `finalizePersist` behavior tests).

## Deviations from Plan

None - plan executed exactly as written. The `actorStaffAccountId`/`actorAccountId` addition and the `fulfillmentMode` override resolution are direct, literal implementations of the plan's own Task 1 action text ("actor_staff_account_id/actor_account_id from the header/caller", "default dine_in, accept optional controller override") rather than deviations — no new files, no scope expansion, no `backend/` touches.

## Issues Encountered
None. All pre-existing tests (`tests/availments/storefrontFinalize.test.js`, `tests/integration/availments/finalize.test.js`, `tests/unit/modules/availments/availmentUseCases.test.js`, `tests/unit/modules/fulfillment/*`, `tests/integration/commerce/commerceModulesMount.test.js`, `tests/commercePayments/webhookFinalize.test.js` — 179 tests across 8 suites) pass unmodified; every new field is additive and optional, so no existing call site or mock needed updating. The worktree had no `node_modules` installed for `apps/dgfy-api` (git worktrees don't carry `node_modules`, gitignored); symlinked `apps/dgfy-api/node_modules` and root `node_modules` from the main checkout to run tests locally, then removed both symlinks before finishing (confirmed via `git status --short` showing a clean tree before each commit — the symlinks were never staged or committed, mirroring 11-02's same documented workaround).

## User Setup Required

None - no external service configuration required. This plan wires existing modules together and does not touch migrations, environment variables, or third-party services.

## Next Phase Readiness

- Both finalize seams are wired and atomic; `/fulfillment` is reachable (verified via a live 401-not-404 smoke check against the fully booted app). Live-MySQL end-to-end proof (actually applying the migration + writing real stage-event rows through both finalize paths against a live tenant database) is Plan 04's explicit scope, not this plan's.
- `modules/fulfillment` remains completely untouched by this plan (as scoped) — only its exported `buildFulfillmentModule`/`createFulfillmentRoutes` are consumed.
- No blockers identified.

---
*Phase: 11-order-fulfillment-delivery-coordination*
*Completed: 2026-07-14*
