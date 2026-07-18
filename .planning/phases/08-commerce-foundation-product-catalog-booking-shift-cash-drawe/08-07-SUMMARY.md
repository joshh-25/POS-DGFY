---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 07
subsystem: api
tags: [sequelize, mysql, tenant-connector, clean-architecture, atomic-guard, concurrency, booking]

requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-03's productRepository.findById() (is_bookable/slot_duration_minutes/concurrent_capacity read API) and 08-04's inventoryEffectContracts (reserved, unwired recordBookingEffect stub, D-06)"
provides:
  - "modules/booking: buildBookingModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository, productRepository, inventoryEffectContracts }) -> { repository, useCases }"
  - "bookingRepository.createBooking(): atomic guarded UPDATE (slots_remaining >= 1) decrements branch-level capacity inside the same transaction as the booking insert (BOK-02, no oversell under concurrency); lazy booking_capacity provisioning via findOrCreate on the (product_id, branch_id, slot_start) unique index"
  - "bookingRepository.cancelBooking(): releases the slot with the mirror +1 in the same transaction as the status write (D-08)"
  - "bookingUseCases: createBooking (validates is_bookable via injected productRepository; non-staff callers book only for themselves), cancelBooking (dual-auth D-09: staff/owner OR the booking's own consumer account), listBookings"
  - "createBookingRoutes(useCases, { authenticateAccount }): POST /bookings, POST /bookings/:id/cancel, GET /bookings"
  - "bookingCapacity.test.js: real-MySQL-gated concurrency integration test proving no oversell at a capacity-1 slot"
affects: [08-08]

tech-stack:
  added: []
  patterns:
    - "Atomic guarded UPDATE for a counter table (research Pattern D): BookingCapacity.update({slots_remaining: sequelize.literal('slots_remaining - 1')}, {where: {..., slots_remaining: {[Op.gte]: 1}}, transaction}) — a single guarded UPDATE statement, never a findOne-then-update round trip; affectedRows !== 1 means capacity is full and the transaction rolls back before any booking row is written."
    - "Lazy counter provisioning via findOrCreate protected by a unique index: BookingCapacity.findOrCreate() on (product_id, branch_id, slot_start) safely handles concurrent first-use races because Sequelize retries as a find when it hits the unique-constraint violation, rather than throwing — no separate locking needed."
    - "Dual-authorization cancel (D-09): staff/owner (any active membership, no role restriction) OR the resource's own consumer account (customer_account_id === requestingAccountId) — a pattern any future consumer-owned resource in this codebase can copy."

key-files:
  created:
    - apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js
    - apps/dgfy-api/src/modules/booking/entities/bookingEntity.js
    - apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js
    - apps/dgfy-api/src/modules/booking/controllers/bookingController.js
    - apps/dgfy-api/src/modules/booking/routes.js
    - apps/dgfy-api/src/modules/booking/index.js
    - apps/dgfy-api/src/modules/booking/README.md
    - apps/dgfy-api/tests/unit/modules/booking/bookingUseCases.test.js
    - apps/dgfy-api/tests/integration/booking/bookingCapacity.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "createBooking's authorization: a non-staff (non-member) requestingAccountId is treated as a consumer booking for themselves — their own authenticated account id becomes the booking's customer_account_id, and any client-supplied customer_account_id is ignored for that caller (never trusted to name someone else). Staff/owner may pass an explicit customer_account_id (booking on behalf of a walk-in or known consumer) or omit it. This satisfies the plan's 'requireMembership staff/owner OR accepts a consumer customer_account_id' wording while never trusting a client-supplied identity override (CLAUDE.md: never trust client-supplied flags)."
  - "cancelBooking rejects an already-cancelled booking with a 400 validation error rather than silently no-op'ing — prevents a double-release of the branch-capacity slot and gives the caller an explicit signal, matching bookingRepository.cancelBooking()'s own BookingAlreadyCancelledError guard."
  - "Task 1's minimal index.js (repository/entity/usecases re-exports only, no buildBookingModule yet) was committed first, then Task 2 extended it in place with buildBookingModule()/controller/routes exports — mirrors 08-03/08-04/08-05's identical precedent for the same pre-commit module-structure guardrail."
  - "The capacity guard uses Sequelize's Model.update() with a sequelize.literal() computed column plus a WHERE slots_remaining >= 1 guard (not a raw SQL query) — one atomic UPDATE statement, consistent with 08-04's inventoryMovementRepository.js precedent of using Model.update() (not raw SQL) for its own guarded counter mutation."

requirements-completed: [BOK-02, BOK-03]

coverage:
  - id: D1
    description: "createBooking against a bookable service Product with slots available inserts a booking (status booked) and decrements booking_capacity.slots_remaining by 1 via a single atomic guarded UPDATE inside one transaction"
    requirement: "BOK-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/booking/bookingUseCases.test.js#buildCreateBookingUseCase > creates a booking against a bookable product with slots available"
        status: pass
      - kind: integration
        ref: "tests/integration/booking/bookingCapacity.test.js#BookingRepository.createBooking concurrency (real MySQL, BOK-02 no-oversell) — gated on RUN_BOOKING_CAPACITY_INTEGRATION=true, skips cleanly without a real MySQL instance (no DB available in this environment)"
        status: unknown
    human_judgment: true
    rationale: "The concurrency integration test is the one deliverable this plan cannot auto-verify in this environment — it is gated behind RUN_BOOKING_CAPACITY_INTEGRATION=true (mirrors locationRepository.test.js's convention) and skipped cleanly here because no real MySQL instance is reachable in this sandbox. A human with real MySQL access must run it (or the equivalent human-UAT step other Phase 8 plans used) to close the loop on the true concurrency proof; the mocked-repository unit test (D1's unit ref, and a dedicated N-simultaneous-calls unit test) proves the usecase's success/conflict mapping is correct but cannot prove true DB-level atomicity."
  - id: D2
    description: "When slots_remaining is 0 for a (product, branch, slot), the guarded UPDATE affects 0 rows and createBooking returns a 409 conflict with NO booking row written"
    requirement: "BOK-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/booking/bookingUseCases.test.js#buildCreateBookingUseCase > returns a 409 conflict with no booking row written when branch capacity is full"
        status: pass
    human_judgment: false
  - id: D3
    description: "createBooking against a non-bookable product returns a 400 validation error; N simultaneous createBooking calls against a capacity-1 slot yield exactly 1 success and N-1 conflictError"
    requirement: "BOK-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/booking/bookingUseCases.test.js#buildCreateBookingUseCase > rejects booking against a non-bookable product"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/booking/bookingUseCases.test.js#buildCreateBookingUseCase > N simultaneous createBooking calls against a capacity-1 slot yield exactly 1 success and N-1 conflictError (no oversell)"
        status: pass
    human_judgment: false
  - id: D4
    description: "cancelBooking by staff/owner OR by the booking's own consumer account sets status cancelled and releases the slot (+1) in one transaction; cancel by an unrelated account returns 403 forbidden; an already-cancelled booking cannot be double-released"
    requirement: "BOK-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/booking/bookingUseCases.test.js#buildCancelBookingUseCase — 5 tests: staff/owner cancel + slot release, consumer-owns cancel, stranger forbidden (403), not-found (404), already-cancelled guard"
        status: pass
    human_judgment: false
  - id: D5
    description: "Booking carries a reserved nullable availment_id (BOK-03); no reschedule action exists (D-08); booking never writes inventory_movements directly; buildBookingModule/createBookingRoutes are self-contained and gate-ready"
    requirement: "BOK-03"
    verification:
      - kind: other
        ref: "grep verify: no read-then-write capacity path (findOne-then-update pattern) in bookingRepository.js; no 'reschedule' text anywhere in bookingUseCases.js"
        status: pass
      - kind: other
        ref: "node -e smoke check: buildBookingModule({...}) returns {useCases,...} and createBookingRoutes is a function; createBookingRoutes({}, {}) throws referencing 'authenticateAccount' when omitted"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 7: Booking Module Summary

**Booking module: branch-level capacity race-safe via a single atomic guarded UPDATE (never findOne-then-update), dual-authorized cancel (staff/owner OR the booking's own consumer account), and a reserved availment_id fulfillment link for Phase 9.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 10 (9 created, 1 modified)

## Accomplishments

- Built `BookingRepository` on the copied `TenantDatabaseUnavailableError`/`resolveDatabaseName`/`withModels` scaffold, resolving `Booking`/`BookingCapacity` via `tenantConnector.getModels()` (08-02's registered Tenant models). `createBooking()` lazily provisions a `booking_capacity` counter row (seeded to the Product's `concurrent_capacity`) via `findOrCreate` on the `(product_id, branch_id, slot_start)` unique index, then decrements it with a single guarded `UPDATE ... SET slots_remaining = slots_remaining - 1 WHERE ... AND slots_remaining >= 1`, asserting `affectedRows === 1` — and only then inserts the booking row — all inside one `sequelize.transaction()` (research Pattern D, BOK-02). If the guard affects 0 rows, `BookingCapacityFullError` is thrown and the transaction rolls back before any booking row is written.
- `cancelBooking()` releases the slot with the mirror `slots_remaining + 1` inside the SAME transaction as the booking's `status: 'cancelled'` write (D-08), throwing `BookingAlreadyCancelledError` if the booking is already cancelled (never double-releases a slot).
- Built `BookingEntity` (`isCancellable()`, `ownedBy(accountId)`, `toPlain()`) mirroring `businessEntity.js`, available standalone per this codebase's existing entity convention (not directly imported by the usecases layer, same as `productEntity.js`).
- Built `bookingUseCases.js`: `createBooking` validates the target Product's `is_bookable` via the injected `productRepository`, computes `slot_end` from `slot_duration_minutes` when present, and resolves the booking's `customer_account_id` (staff/owner may specify one or leave it null for a walk-in; a non-staff caller always books for themselves, ignoring any client-supplied override); `cancelBooking` enforces D-09's dual authorization (staff/owner OR the booking's own consumer account) and maps repository errors to clean `DomainError`s (409 capacity-full, 403 forbidden, 404 not-found, 400 already-cancelled); `listBookings` requires an active membership.
- Built transport-only `bookingController.js` and `routes.js` (`createBookingRoutes(useCases, { authenticateAccount })` — `POST /bookings`, `POST /bookings/:id/cancel`, `GET /bookings`), mounted top-level per `08-PATTERNS.md` (`businessId` from `req.body`/`req.query`, never `req.params`).
- Built `buildBookingModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository, productRepository, inventoryEffectContracts })` DI factory returning `{ repository, useCases }` — `inventoryEffectContracts` (08-04's reserved, unwired `recordBookingEffect` stub, D-06) is accepted but never invoked this phase, so a later phase can wire real fulfillment without restructuring this factory.
- 13-test `bookingUseCases.test.js` covers: create success, capacity-full 409 (no booking row), non-bookable validation, missing-slotStart validation, non-staff-consumer identity enforcement, an N-simultaneous-calls mapping proof (5 concurrent calls against a mocked shared counter — exactly 1 success, 4 conflicts), and 5 cancel-authorization/lifecycle cases (staff/owner, consumer-owns, stranger-forbidden, not-found, already-cancelled).
- `bookingCapacity.test.js` is a real-MySQL-gated integration test (mirrors `locationRepository.test.js`'s `RUN_*_INTEGRATION=true` convention exactly) that provisions a disposable tenant schema via the REAL migration-runner migrations (business foundation + Phase 8 commerce foundation), seeds one bookable service Product with `concurrent_capacity: 1`, fires 8 concurrent `createBooking` calls, and asserts exactly 1 success / 7 `BookingCapacityFullError` conflicts / `slots_remaining === 0` / exactly 1 booking row persisted.
- Confirmed both prohibitions hold via the plan's own grep checks: no `findOne`-then-`update` read-then-write pattern anywhere in `bookingRepository.js`, and no `reschedule` text anywhere in `bookingUseCases.js` (D-08 — cancel + create-new only).

## Task Commits

Each task was committed atomically:

1. **Task 1: Booking repository with atomic capacity guard + entity + usecases** - `a5787c2b` (feat)
2. **Task 2: Controller, routes, DI factory + capacity concurrency integration test** - `966c433b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js` - Atomic guarded-UPDATE capacity decrement/release; `BookingCapacityFullError`/`BookingAlreadyCancelledError`
- `apps/dgfy-api/src/modules/booking/entities/bookingEntity.js` - `BookingEntity`/`createBookingEntity`; `isCancellable()`/`ownedBy(accountId)` domain helpers
- `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js` - `buildCreateBookingUseCase`/`buildCancelBookingUseCase`/`buildListBookingsUseCase`, dual-auth cancel (D-09)
- `apps/dgfy-api/src/modules/booking/controllers/bookingController.js` - Transport-only; businessId from body/query (top-level mount)
- `apps/dgfy-api/src/modules/booking/routes.js` - `createBookingRoutes(useCases, { authenticateAccount })`
- `apps/dgfy-api/src/modules/booking/index.js` - `buildBookingModule(...)` DI factory + barrel re-exports
- `apps/dgfy-api/src/modules/booking/README.md` - Module documentation (atomic guard, cancel authorization, endpoints, prohibitions honored)
- `apps/dgfy-api/tests/unit/modules/booking/bookingUseCases.test.js` - 13 tests covering create/capacity-full/non-bookable/concurrency-mapping/cancel-authorization/list-membership behaviors
- `apps/dgfy-api/tests/integration/booking/bookingCapacity.test.js` - Real-MySQL-gated concurrency integration test (skips cleanly without a real DB)
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Added `bookingController.js` to `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST` (matches product/inventory/shift/compliance controllers)

## Decisions Made

- **Non-staff callers always book for themselves** — `createBooking`'s authorization treats any requester without an active business membership as a consumer; their own authenticated `requestingAccountId` becomes the booking's `customer_account_id` regardless of any client-supplied `customer_account_id`, while staff/owner may pass one explicitly (booking on behalf of a walk-in) or omit it. See frontmatter key-decisions for full rationale.
- **Already-cancelled bookings reject cancel with 400, not a silent no-op** — prevents a double-release of the branch-capacity slot and gives the caller an explicit signal.
- **Task 1's index.js was minimal (no `buildBookingModule` yet)** — Task 2 extended it in place, mirroring 08-03/08-04/08-05's identical precedent for the pre-commit module-structure guardrail (every `modules/*` directory needs `index.js` + `README.md` from its first commit).
- **`Model.update()` with `sequelize.literal()` for the atomic guard, not raw SQL** — consistent with 08-04's `inventoryMovementRepository.js` precedent; one guarded UPDATE statement either way, but stays within the codebase's existing Sequelize-Model-API convention rather than introducing a new raw-query idiom.

## Deviations from Plan

None — plan executed as written. No pre-commit architecture-guardrail deviations were needed this time (Task 1's minimal `index.js`/`README.md` were built from the start per the established 08-03/08-04/08-05 precedent cited in this plan's own prompt, so no first-attempt commit failure occurred).

## Issues Encountered

- **The concurrency integration test (`bookingCapacity.test.js`) could not be run to completion in this environment** — no MySQL instance is reachable (confirmed via a direct TCP probe before writing the test), so the suite skips cleanly (`RUN_BOOKING_CAPACITY_INTEGRATION` unset), matching `locationRepository.test.js`'s established convention exactly rather than failing or being silently omitted. This is flagged as `human_judgment: true` in the coverage block (D1) — a human with real MySQL access should run this suite (`RUN_BOOKING_CAPACITY_INTEGRATION=true`) before this capability is fully trusted in production, mirroring how prior phases' real-MySQL suites were confirmed via human UAT.

## User Setup Required

None - no external service configuration required. Running the real-MySQL concurrency integration test locally requires `RUN_BOOKING_CAPACITY_INTEGRATION=true` plus `BUSINESS_IT_DB_HOST`/`PORT`/`USER`/`PASSWORD` (or the existing `DB_HOST`/`PORT`/`USER`/`PASSWORD` convention) — this is optional, gated, human-run verification, not a blocking requirement for this plan's completion.

## Next Phase Readiness

- `modules/booking/` is complete and self-contained: `buildBookingModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository, productRepository, inventoryEffectContracts })` returns `{ repository, useCases }`, and `createBookingRoutes(useCases, { authenticateAccount })` is ready to mount at `/bookings` — both left for 08-08's composition-root wiring, per this plan's explicit scope boundary ("Do NOT edit routes/index.js here").
- The reserved `availment_id` (nullable, no FK) on `bookings` is ready for Phase 9's `modules/availment` to populate once that table exists, closing BOK-03's fulfillment link.
- `inventoryEffectContracts.recordBookingEffect` (08-04, D-06) is injected into `buildBookingModule()` but not called — a future phase can wire real stock-effect-on-fulfillment without restructuring this module.
- No blockers for 08-08. The one open item is the human-run real-MySQL concurrency verification noted above (non-blocking; the mocked-repository unit tests already prove the usecase's capacity-full/success mapping is correct).

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js`
- FOUND: `apps/dgfy-api/src/modules/booking/entities/bookingEntity.js`
- FOUND: `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js`
- FOUND: `apps/dgfy-api/src/modules/booking/controllers/bookingController.js`
- FOUND: `apps/dgfy-api/src/modules/booking/routes.js`
- FOUND: `apps/dgfy-api/src/modules/booking/index.js`
- FOUND: `apps/dgfy-api/src/modules/booking/README.md`
- FOUND: `apps/dgfy-api/tests/unit/modules/booking/bookingUseCases.test.js`
- FOUND: `apps/dgfy-api/tests/integration/booking/bookingCapacity.test.js`
- FOUND: `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- FOUND commit: `a5787c2b` (Task 1)
- FOUND commit: `966c433b` (Task 2)
