---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 04
subsystem: api
tags: [inventory, append-only-ledger, sequelize, transaction, adr-0029, sole-writer]

requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-02's InventoryMovement/Product Tenant model factories (insert-only enforcement, TenantConnector.getModels() registry) this plan's repository resolves models through"
provides:
  - "modules/inventory — the sole writer of the append-only inventory_movements ledger (ADR 0029): InventoryMovementRepository (create/bulkCreate/findAll/findOne only, no update/delete), recordMovementWithStockSync() transactional stock sync, InventoryMovementEntity, manual restock/loss/adjustment usecases + controller + routes, buildInventoryModule() DI factory"
  - "inventoryEffectContracts.js — reserved (unwired) recordSaleEffect/recordBookingEffect input-shape contracts (D-06) for Phase 9 (modules/availment) and this phase's modules/booking to plug into later"
affects: [08-05, 08-06, 08-07, 08-08, 09]

tech-stack:
  added: []
  patterns:
    - "Append-only repository surface: expose ONLY create/bulkCreate/findAll/findOne on a ledger's repository class — never update/delete/destroy — as the application-layer half of ADR 0029's single-writer contract (DB triggers from 08-01 are the hard backstop)."
    - "Transactional cross-table stock sync: recordMovementWithStockSync() inserts the movement row AND applies a guarded stock_count delta on products inside one sequelize.transaction(), with a JS-level negative-stock precheck plus an optimistic-concurrency WHERE clause (stock_count must still match the value just read) — surfaces as InsufficientStockError on either failure mode."
    - "Reserved (unwired) effect-contract stub: validate the agreed input shape first, then throw a 501 RESERVED_EFFECT_NOT_IMPLEMENTED DomainError — lets a future caller integrate against a stable contract during its own planning before the contract is ever wired."

key-files:
  created:
    - apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js
    - apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js
    - apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js
    - apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js
    - apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js
    - apps/dgfy-api/src/modules/inventory/routes.js
    - apps/dgfy-api/src/modules/inventory/index.js
    - apps/dgfy-api/src/modules/inventory/README.md
    - apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "Task 1's TDD test file (named inventoryMovementUseCases.test.js per the plan's file list) tests InventoryMovementRepository directly, not the usecases module — Task 1's own <behavior> block describes repository-level behavior (recordMovement create path, transactional stock sync sign handling, append-only surface), and Task 2 (not Task 1) is the task that builds usecases/inventoryMovementUseCases.js. Testing the not-yet-built usecases module in Task 1 would have made Task 1's own <verify> step permanently fail, so the test targets the repository the task actually builds. Genuine RED confirmed (Cannot find module) before the repository existed, then GREEN (13/13) once it did."
  - "'Staff-or-owner' access control (D-06/must_haves) is enforced as 'any active business membership' rather than a role-specific check — the landlord business_memberships table only has 'owner'/'member' role values (no distinct 'staff' role), so manual movement recording (a day-to-day operational action) is gated on active membership only, unlike owner-only actions (product/folder creation) in modules/products."
  - "'Adjustment' quantity is applied as a signed, non-zero delta as-is (either direction), while restock/loss require a positive magnitude that the repository signs (+N / -N) — reflects that an adjustment is a manual correction that can legitimately go either way, whereas restock/loss have an inherent direction."
  - "The negative-stock guard applies uniformly to ALL basic_inventory movement types (including adjustment), not just loss — letting stock_count go negative doesn't correspond to any real inventory state regardless of which movement type caused it."

patterns-established:
  - "recordMovementWithStockSync(businessId, {...}) — the transactional cross-table (ledger insert + guarded counter update) write pattern any future append-only-ledger-plus-counter-sync module in this codebase can copy."

requirements-completed: [PRD-04]

coverage:
  - id: D1
    description: "InventoryMovementRepository exposes ONLY create/bulkCreate/findAll/findOne for inventory_movements — no update/destroy method exists on the class"
    requirement: "PRD-04"
    verification:
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository — append-only surface > exposes only create/bulkCreate/findAll/findOne for movements (no update/delete/destroy)"
        status: pass
    human_judgment: false
  - id: D2
    description: "recordMovementWithStockSync() inserts the movement row and applies a guarded +N/-N stock_count delta on a basic_inventory product inside one sequelize.transaction(); non_stock products are left untouched"
    requirement: "PRD-04"
    verification:
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository.recordMovementWithStockSync > increases stock_count by +N for a restock"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository.recordMovementWithStockSync > decreases stock_count by N for a loss"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository.recordMovementWithStockSync > does not touch stock_count for a non_stock product"
        status: pass
    human_judgment: false
  - id: D3
    description: "A movement that would drive stock_count negative (or races against a concurrent modification) is rejected with InsufficientStockError, and no movement row is written for the rejected attempt"
    requirement: "PRD-04"
    verification:
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository.recordMovementWithStockSync > rejects a loss that would drive stock_count negative"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#InventoryMovementRepository.recordMovementWithStockSync > surfaces a concurrent-modification race (affectedRows !== 1) as InsufficientStockError"
        status: pass
    human_judgment: false
  - id: D4
    description: "inventoryEffectContracts.js defines recordSaleEffect/recordBookingEffect with the D-06 agreed input shape, validating first and then throwing a reserved (501) DomainError since nothing calls them this phase"
    requirement: "PRD-04"
    verification:
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#inventoryEffectContracts (reserved, unwired — D-06) > recordSaleEffect validates its input shape, then throws a reserved (501) DomainError"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/inventory/inventoryMovementUseCases.test.js#inventoryEffectContracts (reserved, unwired — D-06) > recordBookingEffect validates its input shape, then throws a reserved (501) DomainError"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual restock/loss/adjustment usecases + transport-only controller + createInventoryRoutes(useCases, {authenticateAccount}) + buildInventoryModule() DI factory exist, staff-or-owner gated, returning {repository, useCases, effectContracts}"
    requirement: "PRD-04"
    verification:
      - kind: other
        ref: "node -e smoke check: buildInventoryModule({...}) returns useCases + effectContracts, m.createInventoryRoutes is a function — see Task 2 commit e9657a5a"
        status: pass
      - kind: other
        ref: "node -e smoke check: createInventoryRoutes({}, {}) throws 'requires an authenticateAccount middleware' when authenticateAccount is omitted"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 4: Inventory Module — Append-Only Ledger + Reserved Effect Contracts Summary

**modules/inventory as the sole writer of the append-only inventory_movements ledger (ADR 0029) — transactional restock/loss/adjustment endpoints with guarded stock_count sync, plus reserved (unwired) recordSaleEffect/recordBookingEffect contracts for Phase 9 and modules/booking.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 10 (9 created, 1 modified)

## Accomplishments

- Built `InventoryMovementRepository` as the single-writer append-only data-access adapter for `inventory_movements`: it exposes ONLY `create`/`bulkCreate`/`findAll`/`findOne` — there is no `update`/`destroy`/`delete` method anywhere on the class, the application-layer half of ADR 0029's single-writer contract (the 08-01 migration's `BEFORE UPDATE`/`BEFORE DELETE` triggers are the hard backstop, and 08-02's `InventoryMovement` model already throws on `beforeUpdate`/`beforeBulkUpdate`).
- `recordMovementWithStockSync(businessId, {...})` is the one write path that touches both tables it owns: it inserts the movement row AND, for a `basic_inventory` product, applies a guarded `stock_count` delta on `products` inside one `sequelize.transaction()` — a JS-level negative-stock precheck plus an optimistic-concurrency `WHERE stock_count = <value just read>` guard, both mapping to `InsufficientStockError` (409) on failure. `non_stock` products are left untouched but still get their movement row recorded.
- `inventoryEffectContracts.js` defines the reserved, unwired `recordSaleEffect`/`recordBookingEffect` input-shape contracts (D-06): each validates its `{ businessId, productId, quantity, referenceType, referenceId, actorAccountId? }` shape first, then throws a `501 RESERVED_EFFECT_NOT_IMPLEMENTED` `DomainError` — nothing calls them this phase, but Phase 9's `modules/availment` (checkout completion) and this phase's own `modules/booking` (fulfillment) now have a stable contract to build against.
- Manual movement usecases (`recordRestock`/`recordLoss`/`recordAdjustment`/`listMovements`) are staff-or-owner gated (any active business membership, not owner-only), transport-only controller, `createInventoryRoutes(useCases, { authenticateAccount })` with `POST /restock|/loss|/adjustment` and `GET /movements`, and `buildInventoryModule({...})` returning `{ repository, useCases, effectContracts }` for 08-08's composition root.
- Full apps/dgfy-api test suite (196/196), architecture guardrails, controller-boundary check, and ESLint all clean after both tasks.

## Task Commits

1. **Task 1: Append-only movement repository + entity + effect contracts** (TDD) - `a4e40c4d` (test, RED) → `75f3c9c5` (feat, GREEN)
2. **Task 2: Manual-movement usecases, controller, routes, DI factory** - `e9657a5a` (feat)

**Plan metadata:** (this commit)

_Note: Task 1 is TDD — RED (`a4e40c4d`, confirmed failing via "Cannot find module" before the repository/effectContracts existed) then GREEN (`75f3c9c5`, 13/13 passing)._

## Files Created/Modified

- `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js` - Sole-writer append-only repository; `recordMovementWithStockSync()` transactional stock sync; `InsufficientStockError`/`InventoryProductNotFoundError`
- `apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js` - Domain entity with `isRestock()`/`isLoss()`/`isAdjustment()`/`isReservedEffect()` helpers
- `apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js` - Reserved (unwired) `recordSaleEffect`/`recordBookingEffect` (D-06)
- `apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js` - `buildRecordRestockUseCase`/`buildRecordLossUseCase`/`buildRecordAdjustmentUseCase`/`buildListMovementsUseCase`
- `apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js` - Transport-only controller (businessId from req.body/req.query)
- `apps/dgfy-api/src/modules/inventory/routes.js` - `createInventoryRoutes(useCases, { authenticateAccount })`
- `apps/dgfy-api/src/modules/inventory/index.js` - `buildInventoryModule({...}) → { repository, useCases, effectContracts }`
- `apps/dgfy-api/src/modules/inventory/README.md` - Module scope, single-writer contract, endpoints, reserved effect contracts, prohibitions
- `apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js` - 13 tests covering append-only surface, stock sync sign handling, guards, and reserved effect contracts
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Added `inventoryMovementController.js` to the `controllerNaming` allowlist (locked apps/dgfy-api `*Controller.js` convention, same as every prior module's controllers)

## Decisions Made

- Task 1's test file tests the repository directly (not the not-yet-built usecases module) — see key-decisions in frontmatter for full rationale; genuine RED→GREEN was confirmed by physically moving the implementation files aside, running the suite (failed with "Cannot find module"), then restoring them (13/13 passed).
- "Staff-or-owner" access control is "any active business membership" — the landlord `business_memberships` table has no distinct `'staff'` role value (only `'owner'`/`'member'`), so manual movement recording is membership-gated, not owner-gated like product/folder creation.
- Adjustment quantity is a signed, non-zero delta applied as-is; restock/loss require a positive magnitude that the repository signs. The negative-stock guard applies to all three movement types uniformly for `basic_inventory` products.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a minimal `index.js` + `README.md` to Task 1's commit**
- **Found during:** Task 1 (first attempt to commit the repository/entity/effectContracts)
- **Issue:** apps/dgfy-api's pre-commit architecture guardrail (`check:architecture:dgfy-api`) requires every module directory under `src/modules/` to contain both an `index.js` and a `README.md` from its very first commit. Task 1's file list (per 08-04-PLAN.md) only specified the repository/entity/effectContracts/test files — `index.js` and `README.md` are Task 2's/no task's explicit scope — so the first commit attempt failed the guardrail (`missing required file index.js`, `missing required file README.md`).
- **Fix:** Added a minimal `index.js` (re-exporting only Task 1's pieces: `InventoryMovementRepository`, `InventoryMovementEntity`, `recordSaleEffect`/`recordBookingEffect`) and a `README.md` documenting the module's scope/single-writer contract, committed as part of Task 1's GREEN commit. Task 2 then extended `index.js` in place to add `buildInventoryModule()` and the usecases/controller/routes re-exports.
- **Files modified:** `apps/dgfy-api/src/modules/inventory/index.js`, `apps/dgfy-api/src/modules/inventory/README.md`
- **Verification:** `check:architecture:dgfy-api` passes; both files committed in `75f3c9c5`.
- **Committed in:** `75f3c9c5` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Allowlisted `inventoryMovementController.js`'s naming in `architectureGuardrailsAllowlist.js`**
- **Found during:** Task 2 (controller/routes/DI-factory commit)
- **Issue:** The shared `backend/scripts/check-architecture-guardrails.js` guardrail defaults to requiring controller files to end in `Handlers.js` (the `backend/` legacy convention). apps/dgfy-api's own locked Clean-Architecture convention is `*Controller.js` (already the pattern for every prior module — `accountController.js`, `locationController.js`, `productController.js`, etc.), each explicitly allowlisted in `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`. `inventoryMovementController.js` was missing from that allowlist, so the commit's pre-commit hook failed with `should end with Handlers.js`.
- **Fix:** Added `'../apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js'` to `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST`, following the exact pattern of the `products` module's two prior entries. This file lives entirely under `apps/dgfy-api/` — no `backend/` file was touched, honoring the phase's zero-`backend/`-writes constraint.
- **Files modified:** `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- **Verification:** `check:architecture:dgfy-api` and `check:controller-boundaries` both pass; full apps/dgfy-api test suite (196/196) unaffected.
- **Committed in:** `e9657a5a` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking pre-commit architecture-guardrail issues)
**Impact on plan:** Both fixes were required to land any commit in this module at all (the guardrails are enforced on every commit touching `apps/dgfy-api`, not opt-in). No scope creep — no behavior, route, or table shape changed; only the two convention-required scaffolding/config additions.

## Issues Encountered

- The plan's `<verify>` command for Task 1's append-only-surface check (`grep -Eq "update|destroy|delete" .../inventoryMovementRepository.js`) prints `REVIEW: repo mentions update/delete — ensure not exposed on movements` rather than `no update/delete surface OK`, because `recordMovementWithStockSync()` legitimately calls `Product.update(...)` to sync `stock_count` on a *different* table (`products`, not `inventory_movements`). Confirmed via targeted `grep -n` that the only "update" occurrences in the file are the `Product.update()` call and doc-comment prose — no `update`/`destroy` method exists on the movement (`InventoryMovement`) surface itself. This is the expected, correct outcome of the plan's own informational (non-blocking) check, not a violation of the append-only contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `modules/inventory` is live and reachable via `buildInventoryModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })`, returning `{ repository, useCases, effectContracts }` — 08-08's composition root can mount `createInventoryRoutes(useCases, { authenticateAccount })` under `/inventory` with no further module-layer work.
- The reserved `recordSaleEffect`/`recordBookingEffect` contracts (D-06) give Phase 9 (`modules/availment`) and this phase's `modules/booking` (08-07, not yet built) a stable, documented input shape (`{ businessId, productId, quantity, referenceType: 'availment' | 'booking', referenceId, actorAccountId? }`) to build against without any redesign of the ledger's write surface — wiring them is expected to be a thin wrapper around `recordMovementWithStockSync()` with `movement_type: 'sale' | 'booking'`.
- No blockers for 08-05, 08-06, 08-07, or 08-08.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/routes.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/index.js`
- FOUND: `apps/dgfy-api/src/modules/inventory/README.md`
- FOUND: `apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js`
- FOUND: `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- FOUND commit: `a4e40c4d` (Task 1, RED)
- FOUND commit: `75f3c9c5` (Task 1, GREEN)
- FOUND commit: `e9657a5a` (Task 2)
