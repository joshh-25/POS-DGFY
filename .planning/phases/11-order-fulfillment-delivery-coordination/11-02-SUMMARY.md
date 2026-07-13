---
phase: 11-order-fulfillment-delivery-coordination
plan: 02
subsystem: api
tags: [clean-architecture, sequelize, express, mock-sequelize-tests, fulfillment, courier, event-sourcing]

# Dependency graph
requires:
  - phase: 11-order-fulfillment-delivery-coordination (Plan 01)
    provides: availment_stage_events (append-only ledger) + courier_assignments (mutable payout) tables, AvailmentStageEvent/CourierAssignment Tenant models registered in tenantConnector.getModels(), Availment.fulfillment_mode/fulfillment_status/fulfillment_stage denormalized columns + hasMany associations
provides:
  - "apps/dgfy-api/src/modules/fulfillment/ Clean-Architecture module: 3 repositories (stageEventRepository append-only, courierAssignmentRepository mutable-payout, availmentReadRepository FUL-01 read path), fulfillmentUseCases.js (STAGE_SEQUENCES + nextLegalStage + 4 usecase builders), transport-only controller, routes.js, index.js DI factory"
  - "buildFulfillmentModule() factory returning { repositories, useCases, createFulfillmentRoutes, recordStageEvents } — recordStageEvents is the injectable port Plan 03's finalize seam consumes"
  - "STAGE_SEQUENCES frozen per-mode map + nextLegalStage() app-logic gate (D-12/D-13/D-14/D-15) enforcing every stage progression"
  - "GET /fulfillment/incoming-orders, POST /fulfillment/stage, POST /fulfillment/courier, POST /fulfillment/payout route contracts (not yet mounted — mounting is Plan 03's composition-root scope)"
affects: [11-03-finalize-seam, 11-04-live-apply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-mode app-logic stage sequence validation (STAGE_SEQUENCES + nextLegalStage) — never a DB constraint (Pitfall 3, D-15)"
    - "recordStageEvents port-injection at the composition root — mirrors modules/inventory's recordSaleEffect/commitReservation precedent, keeps modules/availments from importing modules/fulfillment directly"
    - "AvailmentReadRepository dual role: FUL-01 list read (findIncomingAvailments, D-08-scoped) AND FUL-02 single-record load/denormalized-cache sync (findById/updateFulfillmentState) — both built from the same { tenantConnector, businessDatabaseRegistryRepository }, reused as two different injected dependency names in buildFulfillmentModule()"

key-files:
  created:
    - apps/dgfy-api/src/modules/fulfillment/repositories/stageEventRepository.js
    - apps/dgfy-api/src/modules/fulfillment/repositories/courierAssignmentRepository.js
    - apps/dgfy-api/src/modules/fulfillment/repositories/availmentReadRepository.js
    - apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js
    - apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js
    - apps/dgfy-api/src/modules/fulfillment/routes.js
    - apps/dgfy-api/src/modules/fulfillment/index.js
    - apps/dgfy-api/src/modules/fulfillment/README.md
    - apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentRepositories.test.js
    - apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "Added a minimal module-root index.js/README.md in Task 1's commit (before the full DI factory existed) because apps/dgfy-api's pre-commit architecture guardrail requires every src/modules/* directory to have both files present at commit time — extended to the full buildFulfillmentModule() factory in Task 2's commit"
  - "Extended availmentReadRepository.js with findById + updateFulfillmentState (narrow, two-column-only UPDATE) beyond the plan's literal 'exposes ONLY findIncomingAvailments' framing, because findIncomingAvailments' D-08 in-progress scope structurally excludes ready/out_for_delivery/completed rows and therefore cannot serve buildProgressStageUseCase's 'load the availment' step for a transition moving into or out of those statuses; kept modules/availments/repositories/availmentRepository.js completely untouched, preserving that file for Plan 03's finalize-seam scope"
  - "Added apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js to architectureGuardrailsAllowlist.js's ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST — every existing apps/dgfy-api module controller (inventory, shifts, booking, availments, storefront, commercePayments, etc.) is allowlisted against the backend/ *Handlers.js naming convention; this plan's controller follows the same established *Controller.js precedent"
  - "buildProgressStageUseCase's actorStaffAccountId/assignedByStaffAccountId are client-supplied (req.body), matching the existing inventory/shifts controller convention — not server-resolved from account membership"

requirements-completed: [FUL-01, FUL-02, FUL-03]

coverage:
  - id: D1
    description: "stageEventRepository (append-only create/bulkCreate/findAll/findOne, no update/delete) and courierAssignmentRepository (create/updatePayout real-UPDATE/markSuperseded/findAll/findActiveForAvailment) built, reusing the TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold from inventoryMovementRepository.js"
    requirement: "FUL-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentRepositories.test.js — StageEventRepository/CourierAssignmentRepository describe blocks (11 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "availmentReadRepository.findIncomingAvailments (D-08): online-only (pickup/delivery) + in-progress (placed/confirmed/preparing), with optional branch_id/fulfillment_mode narrowing — the concrete FUL-01 read path injected into buildListIncomingOrdersUseCase"
    requirement: "FUL-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentRepositories.test.js — AvailmentReadRepository describe block (where-clause construction + narrowing, 5 tests) and fulfillmentUseCases.test.js — buildListIncomingOrdersUseCase delegation test"
        status: pass
    human_judgment: false
  - id: D3
    description: "STAGE_SEQUENCES frozen per-mode map + nextLegalStage() app-logic gate (D-12/D-13/D-14/D-15); buildProgressStageUseCase rejects illegal/skipped/already-completed transitions with a 409 conflict and accepts only the legal successor per mode"
    requirement: "FUL-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js — STAGE_SEQUENCES + buildProgressStageUseCase describe blocks (12 tests covering pickup/dine_in/delivery legal transitions, illegal/terminal rejection, D-07 already-completed rejection)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-10 force-complete: a delivery order in out_for_delivery force-completes with is_forced=true + reason; non-delivery or wrong-stage force is rejected with a 409 conflict; reason is required when force=true"
    requirement: "FUL-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js — 'force-completes...', 'rejects a force-complete for a non-delivery mode', 'rejects a force-complete for a delivery order not currently out_for_delivery', 'requires a reason when force=true'"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildAssignCourierUseCase supersedes the prior active assignment (is_active=false + superseded_at) then inserts a new active row (D-01/D-04); rejects negative/non-numeric payout_amount and empty courier_name; buildMarkPayoutUseCase flips payout_status owed->paid with paid_at (D-02)"
    requirement: "FUL-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js — buildAssignCourierUseCase/buildMarkPayoutUseCase describe blocks (9 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every fulfillment usecase gates on any-active business membership (requireMembership/guardBusinessAccess, A3) before reading/writing tenant data — non-active-member requester returns 403 for listIncomingOrders/progressStage/assignCourier/markPayout"
    requirement: "FUL-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js — 'returns forbidden (403) for a non-active-member requester' assertions across all 4 usecase describe blocks"
        status: pass
    human_judgment: false
  - id: D7
    description: "Controller is transport-only (no model/repository imports); routes mount incoming-orders/stage/courier/payout behind authenticateAccount; buildFulfillmentModule() returns a recordStageEvents port bound to stageEventRepository.bulkCreate with transaction pass-through"
    verification:
      - kind: unit
        ref: "backend/scripts/check-controller-boundaries.js (18 controller files, 0 unauthorized model imports) + backend/scripts/check-architecture-guardrails.js (12 modules, 122 files, 0 violations) run at each task commit"
        status: pass
    human_judgment: false
  - id: D8
    description: "No file under backend/ created or modified by this plan"
    verification:
      - kind: other
        ref: "git diff 6aceba46 HEAD --stat -- backend/ returns empty across all 3 task commits"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 02: Fulfillment Module (Repositories, Usecases, Controller, Routes) Summary

**New `apps/dgfy-api/src/modules/fulfillment` Clean-Architecture module — three tenant-scoped repositories (append-only stage events, mutable-payout courier assignments, read/single-load availment reader), STAGE_SEQUENCES app-logic per-mode transition gate, four FUL-01/02/03 usecases, transport-only controller/routes, and a `buildFulfillmentModule()` DI factory exposing the `recordStageEvents` port for Plan 03's finalize seam — proven by 47 passing mock-Sequelize unit tests.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-14T00:01:00+08:00 (approx.)
- **Completed:** 2026-07-14T00:23:45+08:00
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments
- `stageEventRepository.js`: append-only `create`/`bulkCreate`/`findAll`/`findOne` against `AvailmentStageEvent`, transaction-aware (an injected `{ transaction }` passes straight through to `Model.create`/`bulkCreate` for the future finalize-seam write), no `update`/`delete` surface (D-07).
- `courierAssignmentRepository.js`: `create`/`updatePayout` (a real `Model.update`, D-02)/`markSuperseded` (D-04 reassignment history)/`findAll`/`findActiveForAvailment` against `CourierAssignment` — deliberately mutable for its payout sub-lifecycle while assignment identity stays insert-new/mark-prior-inactive.
- `availmentReadRepository.js`: the concrete FUL-01 read path — `findIncomingAvailments(businessId, { branchId, fulfillmentMode })` returns only `fulfillment_mode IN (pickup,delivery)` AND `fulfillment_status IN (placed,confirmed,preparing)` rows (D-08), narrowed by optional branch/mode filters. Also carries `findById`/`updateFulfillmentState` (documented Rule 2 addition — see Deviations) for FUL-02's single-availment load + denormalized-cache sync.
- `fulfillmentUseCases.js`: `STAGE_SEQUENCES` frozen map (`pickup`/`dine_in`: placed→confirmed→preparing→ready→completed; `delivery`: placed→confirmed→preparing→out_for_delivery→completed) + `nextLegalStage()`; `buildListIncomingOrdersUseCase` (FUL-01), `buildProgressStageUseCase` (FUL-02, rejects illegal/skipped/already-completed transitions with 409, D-10 force-complete branch), `buildAssignCourierUseCase` (FUL-03, supersede+insert, payout validation), `buildMarkPayoutUseCase` (FUL-03, owed→paid). Every usecase gates on `requireMembership` (A3, any-active-member).
- `fulfillmentController.js` / `routes.js`: transport-only controller (no model/repository imports, confirmed by the controller-boundary guardrail), `GET /incoming-orders`, `POST /stage|courier|payout`, all behind `authenticateAccount`.
- `index.js`: `buildFulfillmentModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })` wires all three repositories + every usecase and returns `{ repositories, useCases, createFulfillmentRoutes, recordStageEvents }` — `recordStageEvents` is the injectable port bound to `stageEventRepository.bulkCreate` that Plan 03's availments finalize seam will call directly.
- 47 mock-Sequelize unit tests across two files (`fulfillmentRepositories.test.js`, `fulfillmentUseCases.test.js`) covering every `<behavior>` clause from the plan: append-only surfaces, transaction pass-through, per-mode legal/illegal transitions, D-10 force-complete rules, FUL-01 delegation and where-clause construction, courier supersede+insert, payout owed→paid, membership-forbidden paths (403), negative/non-numeric payout rejection, and tenant-DB-unavailable error mapping.

## Task Commits

Each task was committed atomically:

1. **Task 1: stageEventRepository + courierAssignmentRepository** - `7837d51e` (feat)
2. **Task 2: availmentReadRepository + fulfillmentUseCases + controller/routes/index** - `2d8c0819` (feat)
3. **Task 3: Mock-Sequelize unit tests for the module (AvailmentReadRepository coverage)** - `d4116e0f` (test)

_Note: tasks 1 and 2 were `tdd="true"`; their repository/usecase test coverage was written and verified GREEN as part of each task's own commit rather than as separate RED→GREEN commit pairs, since the plan's own Task 3 explicitly owns creating/finalizing both shared test files ("the latter is the target of Task 1's verify") — Task 3's commit extends the Task-1-created `fulfillmentRepositories.test.js` with the `AvailmentReadRepository` coverage that only became possible once Task 2's repository existed._

## Files Created/Modified
- `apps/dgfy-api/src/modules/fulfillment/repositories/stageEventRepository.js` - Append-only AvailmentStageEvent writer
- `apps/dgfy-api/src/modules/fulfillment/repositories/courierAssignmentRepository.js` - Mutable-payout CourierAssignment writer
- `apps/dgfy-api/src/modules/fulfillment/repositories/availmentReadRepository.js` - FUL-01 read path + FUL-02 single-availment load/sync
- `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js` - STAGE_SEQUENCES + 4 usecase builders
- `apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js` - Transport-only controller
- `apps/dgfy-api/src/modules/fulfillment/routes.js` - Express route wiring
- `apps/dgfy-api/src/modules/fulfillment/index.js` - buildFulfillmentModule() DI factory
- `apps/dgfy-api/src/modules/fulfillment/README.md` - Module documentation (Rule 3 auto-add, guardrail requirement)
- `apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentRepositories.test.js` - 20 repository-level tests
- `apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js` - 27 usecase-level tests
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Added fulfillmentController.js to the controller-naming allowlist

## Decisions Made
- Added a minimal module-root `index.js`/`README.md` in Task 1's commit before the full DI factory existed, because the pre-commit architecture guardrail requires every `src/modules/*` directory to have both files present at commit time; extended `index.js` to the full `buildFulfillmentModule()` factory in Task 2.
- Extended `availmentReadRepository.js` with `findById`/`updateFulfillmentState` (narrow, two-column UPDATE only — never `availments.status` or any other field) rather than modifying `modules/availments/repositories/availmentRepository.js`, since `findIncomingAvailments`' D-08 scope structurally excludes `ready`/`out_for_delivery`/`completed` rows and cannot serve `buildProgressStageUseCase`'s "load the availment" step, and modifying the availments module's own repository is reserved for Plan 03's finalize-seam scope (not this plan's `files_modified`).
- Allowlisted `fulfillmentController.js` in `architectureGuardrailsAllowlist.js` following the exact precedent every other `apps/dgfy-api` module controller already uses (inventory, shifts, booking, compliance, availments, storefront, commercePayments) — this repo's naming convention is `*Controller.js`, not legacy `backend/`'s `*Handlers.js`.
- `actorStaffAccountId`/`assignedByStaffAccountId` are read from `req.body` (client-supplied), matching the existing `inventory`/`shifts` controller convention rather than server-resolving a staff account from the requester's account id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added module-root index.js/README.md before the full DI factory existed**
- **Found during:** Task 1 (repository files only)
- **Issue:** apps/dgfy-api's pre-commit hook runs `check-architecture-guardrails.js`, which requires every `src/modules/*` directory to have both `index.js` and `README.md` present at commit time. Task 1's commit (repositories only) failed this check since neither file existed yet.
- **Fix:** Created a minimal placeholder `index.js` (re-exporting the two Task 1 repositories) and a full `README.md` in Task 1's commit; extended `index.js` to the complete `buildFulfillmentModule()` factory in Task 2's commit.
- **Files modified:** `apps/dgfy-api/src/modules/fulfillment/index.js`, `apps/dgfy-api/src/modules/fulfillment/README.md`
- **Verification:** `check-architecture-guardrails.js` passes at every subsequent commit.
- **Committed in:** `7837d51e` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Extended availmentReadRepository with findById/updateFulfillmentState**
- **Found during:** Task 2 (fulfillmentUseCases.js)
- **Issue:** The plan's Task 2 action text requires `buildProgressStageUseCase` to "load the availment" and "update the availment's denormalized fulfillment_status/fulfillment_stage" but names its data-access dependency ambiguously (`availmentRepository | repository`) and lists no such method on `availmentReadRepository` (whose acceptance criteria say it exposes "ONLY findIncomingAvailments"). `findIncomingAvailments` structurally cannot serve this need — it deliberately excludes `ready`/`out_for_delivery`/`completed` rows (D-08), so a transition into or out of those statuses would never resolve.
- **Fix:** Added `findById(businessId, availmentId)` (unfiltered single-record read) and `updateFulfillmentState(businessId, availmentId, { fulfillmentStatus, fulfillmentStage }, options)` (a narrow two-column `Model.update`, with transaction pass-through) to `availmentReadRepository.js`. Both are documented in the file's header comment as a deliberate, narrowly-scoped Rule 2 addition — not a general Availment CRUD surface, and `modules/availments/repositories/availmentRepository.js` was left completely untouched (reserved for Plan 03).
- **Files modified:** `apps/dgfy-api/src/modules/fulfillment/repositories/availmentReadRepository.js`
- **Verification:** 9 new repository-level tests (Task 3's commit) plus 12 usecase-level `buildProgressStageUseCase` tests all pass.
- **Committed in:** `2d8c0819` (Task 2 commit; test coverage extended in `d4116e0f`)

**3. [Rule 3 - Blocking] Allowlisted fulfillmentController.js's naming**
- **Found during:** Task 2 (controller/routes/index)
- **Issue:** The pre-commit architecture guardrail's `controllerNaming` check requires every controller file to end in `Handlers.js` unless explicitly allowlisted; `fulfillmentController.js` (matching every other `apps/dgfy-api` module's `*Controller.js` convention) failed this check.
- **Fix:** Added `../apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js` to `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST` in `architectureGuardrailsAllowlist.js`, following the identical pattern already used for `inventoryMovementController.js`, `shiftController.js`, `bookingController.js`, `availmentController.js`, and 8 other existing entries.
- **Files modified:** `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- **Verification:** `check-architecture-guardrails.js` passes (12 modules, 122 files, 0 violations).
- **Committed in:** `2d8c0819` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking/guardrail-scaffold, 1 missing-critical-functionality, 1 blocking/guardrail-allowlist)
**Impact on plan:** All three were necessary to make the plan's own stated acceptance criteria achievable within this repo's pre-commit guardrails; none expand scope beyond FUL-01/02/03 and none touch `modules/availments` or `backend/`.

## Issues Encountered
- The worktree had no `node_modules` installed for `apps/dgfy-api` (git worktrees don't carry `node_modules`, which is gitignored). Symlinked `apps/dgfy-api/node_modules` from the main checkout to run tests/eslint/guardrail scripts locally, then removed the symlink before finishing — it was never staged or committed (confirmed via `git status --short` showing it as untracked, separate from the explicitly-`git add`ed task files at every commit).

## User Setup Required

None - no external service configuration required. This plan is pure module scaffolding (repositories/usecases/controller/routes/DI factory) with mock-Sequelize unit tests; no live MySQL apply or route mounting was performed (mounting `/fulfillment` and wiring `recordStageEvents` into the availments module is Plan 03's scope).

## Next Phase Readiness

- The fulfillment module is complete and unit-tested, ready for Plan 03 ("finalize seam") to: (a) inject `fulfillmentModule.recordStageEvents` into `buildAvailmentsModule()`'s `finalizePersist`/`finalizeStorefrontOrder` transactions per `11-PATTERNS.md`'s Shared Pattern section, and (b) mount `createFulfillmentRoutes()` under `/fulfillment` in `apps/dgfy-api/src/routes/index.js`.
- `buildProgressStageUseCase` is ready to receive the SAME `availmentReadRepository` instance as both its `availmentReadRepository` (FUL-01 listing) and `availmentRepository` (FUL-02 load/sync) dependency — `buildFulfillmentModule()` already wires this internally; no further composition-root change is needed for this specific wiring.
- No blockers identified. `modules/availments/repositories/availmentRepository.js` remains completely untouched by this plan, exactly as scoped.

---
*Phase: 11-order-fulfillment-delivery-coordination*
*Completed: 2026-07-14*
