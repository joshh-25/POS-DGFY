# fulfillment module

Scaffolded in Phase 11 (`.planning/phases/11-order-fulfillment-delivery-coordination/11-02-PLAN.md`): the staff-facing surface for FUL-01 (list/process incoming online orders), FUL-02 (progress the shared per-mode fulfillment pipeline), and FUL-03 (assign a free-text courier + track payout).

## Relationship to `availments` and `inventory`

Follows the same Clean Architecture layering as `../inventory/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildFulfillmentModule()`. Every usecase gates on any-active business membership (`requireMembership`) against the `businesses` module's `BusinessRepository` (membership lives in the landlord `dgfy_core` database); fulfillment data itself lives in the tenant `dgfy_business_*` database, resolved via the injected `TenantConnector`.

## Two-field event-sourced fulfillment status (11-01)

The append-only `availment_stage_events` ledger (written via `stageEventRepository`) is the source of truth for an availment's fulfillment progress; `Availment.fulfillment_mode`/`fulfillment_status`/`fulfillment_stage` are a denormalized read cache of the LATEST event, updated alongside each stage-event write. `courier_assignments` (written via `courierAssignmentRepository`) is deliberately mutable for its payout sub-lifecycle (`payout_status` owed->paid) while assignment IDENTITY stays append-only (reassignment inserts a new row and marks the prior attempt superseded, D-04).

## Per-mode stage sequence (D-12/D-13/D-14/D-15)

`STAGE_SEQUENCES` (exported from `usecases/fulfillmentUseCases.js`) is a frozen, app-logic-only map — never a DB constraint (Pitfall 3):

- `pickup` / `dine_in`: `placed -> confirmed -> preparing -> ready -> completed`
- `delivery`: `placed -> confirmed -> preparing -> out_for_delivery -> completed`

An illegal/skipped transition is rejected with a 409-class conflict. A delivery order in `out_for_delivery` may be force-completed (`is_forced: true` + `reason`, D-10).

## Endpoints

- `GET /fulfillment/incoming-orders` — list in-progress ONLINE orders (`fulfillment_mode` pickup/delivery, `fulfillment_status` placed/confirmed/preparing), optionally filtered by `branch_id`/`fulfillment_mode` (FUL-01, D-08)
- `POST /fulfillment/stage` — progress an availment to its next legal stage, or force-complete a delivery order out of `out_for_delivery` (FUL-02, D-10)
- `POST /fulfillment/courier` — assign a free-text courier (name/contact), superseding any prior active assignment (FUL-03, D-01/D-04)
- `POST /fulfillment/payout` — mark a courier assignment's payout owed->paid (FUL-03, D-02)

## `recordStageEvents` port

`buildFulfillmentModule()` exposes `recordStageEvents(businessId, events, { transaction })`, bound to `stageEventRepository.bulkCreate`. This is the injectable port the availments module's finalize seam (Plan 03) calls to auto-write the fulfillment stage-event sequence inside its own transaction — mirrors `modules/inventory`'s `recordSaleEffect`/`commitReservation` port-injection precedent.

## Prohibitions honored

- `stageEventRepository` exposes ONLY `create`/`bulkCreate`/`findAll`/`findOne` — never `update`/`destroy` (append-only, D-07).
- `availmentReadRepository` exposes ONLY `findIncomingAvailments` — read-only, no write surface.
- No file under `backend/` is created or modified by this module.
