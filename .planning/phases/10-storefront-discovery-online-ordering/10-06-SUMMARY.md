---
phase: 10-storefront-discovery-online-ordering
plan: 06
subsystem: api
tags: [express, sequelize, mysql, storefront, checkout, order-placement, idempotency, stock-reservation, paymongo]

# Dependency graph
requires:
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-02: InventoryReservationRepository (reserveStock/releaseReservation/setReservationExpiry/commitReservation) over tenant inventory_reservations"
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-03: apps/dgfy-api/src/modules/storefront module skeleton + validateCart (server-side cart re-pricer)"
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-04: resolveCheckoutIdentity (account-optional guest/account identity resolution)"
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-05: createQrphSession (landlord PayMongo QR Ph payment-session usecase)"
provides:
  - "placeOrder: the order-placement orchestration seam (durable landlord order -> reserveStock (fail-fast) -> createQrphSession/cash-finalize), enforcing D-10's strict ordering and D-08's shared clock"
  - "schedulingValidation.validateFulfillment: mode/timing + business-hours/lead-time/advance-window validation (D-11..D-13), env-configurable via STOREFRONT_MIN_LEAD_MINUTES/STOREFRONT_MAX_ADVANCE_DAYS"
  - "StorefrontOrderRepository: landlord storefront_orders persistence with idempotent lookup (safe replay / 409-on-mismatch, D-04)"
  - "getOrderStatus: IDOR-safe consumer order-status read by opaque public_reference"
  - "POST /storefront/checkout and GET /storefront/orders/:reference routes"
affects: [10-08-storefront-webhook-finalize]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-module capability PORTS injected as plain functions (reserveStock/releaseReservation/setReservationExpiry/createQrphSession/finalizeCashOrder) rather than pre-built repository/module instances — mirrors 10-07's commitReservation optionality convention exactly"
    - "buildStorefrontModule's new deps (storefrontOrderModel + the 4 reservation/payment ports) are ALL optional at construction time — omitting any of them simply omits useCases.placeOrder/getOrderStatus rather than throwing, so the existing (not-yet-updated) composition root keeps working unmodified"
    - "Self-contained weekly business-hours checker (timezone + per-weekday intervals) reimplemented fresh in schedulingValidation.js, not ported from backend/ (zero-touch constraint) — same shape as the legacy storefrontBusinessHours.js reference, independently written"

key-files:
  created:
    - apps/dgfy-api/src/modules/storefront/usecases/schedulingValidation.js
    - apps/dgfy-api/src/modules/storefront/repositories/storefrontOrderRepository.js
    - apps/dgfy-api/src/modules/storefront/usecases/placeOrderUseCases.js
    - apps/dgfy-api/src/modules/storefront/usecases/getOrderStatusUseCases.js
    - apps/dgfy-api/src/modules/storefront/controllers/checkoutController.js
    - apps/dgfy-api/tests/storefront/scheduling.test.js
    - apps/dgfy-api/tests/storefront/placeOrder.test.js
  modified:
    - apps/dgfy-api/src/config/env.js
    - apps/dgfy-api/src/modules/storefront/index.js
    - apps/dgfy-api/src/modules/storefront/routes.js
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "placeOrder calls 10-02's InventoryReservationRepository methods (reserveStock/releaseReservation/setReservationExpiry) DIRECTLY, bypassing 10-02's buildReserveStockUseCase/buildReleaseReservationUseCase/buildSetReservationExpiryUseCase usecase wrappers entirely — those wrappers gate on a staff-or-owner businessRepository.getMembership(accountId, businessId) check that has no meaning for a consumer storefront order (there is no staff accountId; a guest or logged-in DGFY Account ordering FROM a business is never a STAFF MEMBER of it). This also sidesteps a confirmed pre-existing bug in inventoryReservationUseCases.js (10-07-SUMMARY.md's Issues Encountered #1: every failure branch calls the non-existent ApplicationResult.error() instead of .failure()) since the repository methods this file calls throw real typed errors (TenantDatabaseUnavailableError/InsufficientStockError), never touching that buggy usecase layer."
  - "buildStorefrontModule's five new dependencies (storefrontOrderModel, reserveStock, releaseReservation, setReservationExpiry, createQrphSession, finalizeCashOrder) are ALL optional at construction time, mirroring 10-07's buildAvailmentsModule({commitReservation}) optionality pattern exactly. The existing composition root (apps/dgfy-api/src/routes/index.js) does not supply any of them yet and was NOT modified by this plan — confirmed non-breaking by re-loading it after every change (`node -e \"import('./src/routes/index.js')\"` succeeds). Full production wiring (constructing InventoryReservationRepository, buildCommercePaymentsModule, and buildAvailmentsModule with commitReservation, then passing their capabilities in) is deferred to 10-08's composition-root scope, per this plan's own action text (\"this plan depends on 10-07 being available at composition time in 10-08\")."
  - "finalizeCashOrder's injected shape matches 10-07's ALREADY-BUILT buildFinalizeStorefrontOrderUseCase exactly (businessId, sourceReference, customerAccountId, lines[{productId,quantity,unitPrice}], totalCentavos, paymentMethod, fulfillmentMode, requestedFor) -> ApplicationResult{availment,payment,idempotent}, since 10-07 landed concurrently and its usecase is real (not a stub) — this plan wires the exact contract 10-08 will inject the real function into, rather than inventing an interim shape that would need to change later. unitPrice is converted from cartValidation's centavos back to a decimal string via money.js's formatCentavos (the exact inverse of parseAmountToCentavos, avoiding float drift)."
  - "getOrderStatus's IDOR guard is scoped exactly to the plan's given {reference, requesterEmail?} interface: account-linked orders (customer_account_id set) are reachable by the opaque public_reference alone (no authenticatedAccountId parameter is part of this plan's contract); guest-linked orders additionally require requesterEmail to resolve (via guestIdentityRepository.findByEmail) to the SAME guest_identity_id already on the order."
  - "validateFulfillment throws a typed DomainError (details.reason_code names which bound failed) rather than returning a result tuple, mirroring the legacy validateScheduledFor/assertCheckoutTimeWithinStorefrontHours throw-based convention (backend/src/modules/store/usecases/storeUseCases.js:556-585, read-only reference) rather than inventing a new contract shape."

requirements-completed: [STF-04, STF-05]

coverage:
  - id: D1
    description: "A consumer can choose pickup/delivery and immediate/scheduled, and a scheduled time is validated against business hours + min lead time (STOREFRONT_MIN_LEAD_MINUTES, default 30) + max advance window (STOREFRONT_MAX_ADVANCE_DAYS, default 14), with no capacity check (D-11..D-13)"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/scheduling.test.js#validateFulfillment (STF-04, D-11..D-13)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/scheduling.test.js#isWithinBusinessHours"
        status: pass
    human_judgment: false
  - id: D2
    description: "Placement records a durable landlord order FIRST, then reserves stock (tenant write, fail-fast to 503 if unreachable), THEN creates the PayMongo session — never a payment session for stock that could not be reserved (D-10)"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — happy PayMongo (gcash) path (D-08, D-10, STF-05)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — reserve fail-fast (D-10)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reservation and session share ONE expires_at (D-08); a reservation is never left open-ended (fallback hold-TTL), and a PayMongo session-creation failure/throw releases the hold rather than orphaning stock (D-09)"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — happy PayMongo (gcash) path (D-08, D-10, STF-05)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — session-failure path (D-09 no orphaned hold)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A duplicate placement with the same idempotency_key + identical payload safely replays; a reused key with a different payload is a 409 conflict, including a lost-guard concurrent-race re-resolution (STF-05, D-04)"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — idempotent replay (D-04)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/scheduling.test.js#computeRequestHash (D-04)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A cash order takes the no-session branch (immediate finalize via the injected 10-07 finalizeCashOrder, [ASSUMED A3]); a GCash/Card order returns a QR + order reference"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#placeOrder — cash immediate-finalize path ([ASSUMED A3])"
        status: pass
    human_judgment: false
  - id: D6
    description: "getOrderStatus is IDOR-safe: lookup is always by opaque public_reference; a guest-linked order additionally requires a matching requesterEmail binding"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/placeOrder.test.js#getOrderStatus (T-10-06-05 IDOR guard)"
        status: pass
    human_judgment: false
  - id: D7
    description: "[ASSUMED A1/A2/A3] surfaced for product confirmation: 30-min min lead time, 14-day max advance window, cash orders finalize immediately at placement"
    verification: []
    human_judgment: true
    rationale: "These are explicit product-facing assumptions the plan itself flags for confirmation (no legacy precedent for A1/A2; A3 resolves an Open Question) — not something a test can prove is the RIGHT business value, only that the code correctly implements whatever value is configured."

duration: 55min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 06: Order Placement (Fulfillment/Scheduling/Payment + Landlord-First Durable Record) Summary

**`placeOrder`: the order-placement orchestration seam composing validated cart (10-03), resolved identity (10-04), scheduling validation, atomic stock reservation (10-02, called directly — not through its staff-gated usecase wrappers), and the landlord PayMongo QR Ph session (10-05) in the exact durable-order-first -> reserve -> session order D-10 requires, stamping the single shared expires_at clock D-08 requires.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2 (both executed as TDD: RED-equivalent tests written and run before each implementation was finalized)
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments

- `schedulingValidation.validateFulfillment`: mode (`pickup`/`delivery`) + timing (`immediate`/`scheduled`) validation; for scheduled orders, a strictly-future `requested_for` at least `STOREFRONT_MIN_LEAD_MINUTES` (default 30, `[ASSUMED A1]`) ahead, at most `STOREFRONT_MAX_ADVANCE_DAYS` (default 14, `[ASSUMED A2]`) ahead, and within a self-contained weekly business-hours schedule (timezone-aware, overnight-interval-aware) — no capacity check anywhere (D-11).
- `StorefrontOrderRepository`: landlord `storefront_orders` persistence (`createOrder`/`findByIdempotency`/`updateOrder`/`findByPublicReference`) plus `computeRequestHash` (stable-key-order SHA-256), `generateOrderPublicReference` (opaque `SFO-` reference), and `isUniqueConstraintViolation` for D-04 idempotency (safe replay on matching payload, 409 on mismatch, lost-guard race re-resolution on a unique-constraint violation).
- `placeOrder`: composes `validateCart` (10-03) -> `resolveCheckoutIdentity` (10-04) -> `validateFulfillment` (this plan) -> **durable landlord order insert FIRST** -> `reserveStock` (10-02's repository, called directly, fallback hold-TTL always stamped so a reservation is never open-ended) -> branches on `payment_method`:
  - `gcash`/`credit_card`: `createQrphSession` (10-05) inside implicit try/catch; on success, re-stamps the session's shared `expires_at` (D-08) onto BOTH the reservation (`setReservationExpiry`) and the order; on ANY failure or thrown error, releases the reservation and marks the order `failed` — no order is ever left holding stock without a live session (D-09).
  - `cash`: `[ASSUMED A3]` finalizes immediately via the injected `finalizeCashOrder` (10-07's already-built `finalizeStorefrontOrder`, wired to the exact contract it exposes); fails closed 503 (not a crash) when the port isn't injected yet.
- `getOrderStatus`: IDOR-safe consumer read by opaque `public_reference` only; a guest-linked order additionally requires a matching `requesterEmail` (resolved via `guestIdentityRepository.findByEmail`, compared against `order.guest_identity_id`).
- `POST /storefront/checkout` (rate-limited, optional account auth — same `optionalAuthenticateAccount` contract as `/checkout/identity`) and `GET /storefront/orders/:reference` (public) routes, mounted on the existing storefront router.
- `buildStorefrontModule`'s five new dependencies are all OPTIONAL — the existing (unmodified) composition root keeps working exactly as before; full cross-module wiring is 10-08's scope.
- 53/53 new tests passing (29 scheduling/repository + 24 placeOrder/getOrderStatus); 150/150 across `tests/storefront`+`tests/commercePayments`+`tests/inventory`+`tests/availments` with zero regressions; full `apps/dgfy-api` suite: 510 passed, 193 skipped (live-DB-gated), 0 failed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scheduling/fulfillment validator + storefront order repository (idempotency)** (TDD) - `b1464aca` (feat)
2. **Task 2: placeOrder orchestration (durable-first -> reserve -> session) + getOrderStatus + routes** (TDD) - `21a70854` (feat)

_Sequential single-plan wave execution on the main working tree — no plan-metadata commit separation needed beyond this SUMMARY's own final commit._

## Files Created/Modified

- `apps/dgfy-api/src/modules/storefront/usecases/schedulingValidation.js` - `validateFulfillment` + `isWithinBusinessHours` (self-contained weekly-schedule checker)
- `apps/dgfy-api/src/modules/storefront/repositories/storefrontOrderRepository.js` - Landlord `storefront_orders` persistence + idempotency-hash/reference helpers
- `apps/dgfy-api/src/modules/storefront/usecases/placeOrderUseCases.js` - `buildPlaceOrderUseCase` — the D-10 orchestration seam
- `apps/dgfy-api/src/modules/storefront/usecases/getOrderStatusUseCases.js` - `buildGetOrderStatusUseCase` — IDOR-safe status read
- `apps/dgfy-api/src/modules/storefront/controllers/checkoutController.js` - Transport-only controller for `placeOrder`/`getOrderStatus`
- `apps/dgfy-api/tests/storefront/scheduling.test.js` - 29 tests: `validateFulfillment`/`isWithinBusinessHours`/`StorefrontOrderRepository`/`computeRequestHash`/`isUniqueConstraintViolation`
- `apps/dgfy-api/tests/storefront/placeOrder.test.js` - 24 tests: `placeOrder` (happy/fail-fast/session-failure/idempotency/cash) + `getOrderStatus`
- `apps/dgfy-api/src/config/env.js` - Added `STOREFRONT_MIN_LEAD_MINUTES`, `STOREFRONT_MAX_ADVANCE_DAYS`, `STOREFRONT_HOLD_FALLBACK_MINUTES`
- `apps/dgfy-api/src/modules/storefront/index.js` - `buildStorefrontModule` wires `placeOrder`/`getOrderStatus` behind optional new deps
- `apps/dgfy-api/src/modules/storefront/routes.js` - `POST /checkout` + `GET /orders/:reference`, `checkoutLimiter`
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Registers `checkoutController.js` (matches every prior controller's precedent)

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on each. Summary:

- `placeOrder` bypasses 10-02's staff-membership-gated reservation usecases and talks to `InventoryReservationRepository` directly — the membership check doesn't apply to a consumer order, and this also sidesteps a known pre-existing bug in that usecase layer (10-07-SUMMARY.md's Issues Encountered #1) without needing to fix it here (out of this plan's file scope).
- `buildStorefrontModule`'s five new dependencies are all optional at construction time (mirrors 10-07's `commitReservation` optionality) so the existing composition root needs zero changes and keeps working — confirmed by reloading `routes/index.js` after every change.
- `finalizeCashOrder`'s injected shape matches 10-07's real, already-built `finalizeStorefrontOrder` usecase exactly, since 10-07 landed concurrently with a working implementation — no interim/throwaway contract was invented.
- `getOrderStatus`'s IDOR guard is scoped exactly to the plan's given `{reference, requesterEmail?}` interface (no `authenticatedAccountId` parameter).
- `validateFulfillment` throws a typed `DomainError` (mirrors the legacy read-only reference's throw-based convention) rather than a result tuple.

## Deviations from Plan

None — plan executed exactly as written across both tasks. The three `[ASSUMED]` values (A1: 30-min lead, A2: 14-day advance, A3: cash finalizes immediately) were pre-flagged by the plan itself as product-confirmable, not discovered mid-execution; they are implemented as env-configurable defaults (`STOREFRONT_MIN_LEAD_MINUTES`/`STOREFRONT_MAX_ADVANCE_DAYS`) or an explicit code path (A3), not hardcoded, so product confirmation later requires no code change — only an env var or a design decision on the cash branch.

## Issues Encountered

None. Both tasks' automated `<verify>` commands (via the project's real test command, `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand`, since plain `npx jest` fails on this ESM project — same pre-existing friction 10-04-SUMMARY.md already documented) passed cleanly on first implementation. The composition root (`apps/dgfy-api/src/routes/index.js`) was reloaded after each change to confirm non-breaking behavior; it succeeded both times.

## User Setup Required

None - no external service configuration required. `STOREFRONT_MIN_LEAD_MINUTES`/`STOREFRONT_MAX_ADVANCE_DAYS`/`STOREFRONT_HOLD_FALLBACK_MINUTES` all have sensible defaults (30, 14, 30) and require no `.env` changes to function; product may later override them via env vars once A1/A2 are confirmed.

## Next Phase Readiness

- `placeOrder`/`getOrderStatus` are fully implemented, tested, and exposed from `buildStorefrontModule()` — 10-08 (webhook + full composition) needs to:
  1. Construct `InventoryReservationRepository` (10-02) and pass its `reserveStock`/`releaseReservation`/`setReservationExpiry` methods directly (NOT the staff-gated usecase wrappers) into `buildStorefrontModule`.
  2. Construct `buildCommercePaymentsModule()` (10-05) and pass its `useCases.createQrphSession` in.
  3. Construct `buildAvailmentsModule({..., commitReservation})` (10-07) and pass its `useCases.finalizeStorefrontOrder` in as `finalizeCashOrder`.
  4. Add the `StorefrontOrder` model construction (mirrors `StorefrontGuestIdentityModel` in `routes/index.js`) and pass it as `storefrontOrderModel`.
  5. Build the `payment.paid`/`payment.failed`/`qrph.expired` webhook handler that resolves the session (10-05's `verifyWebhookSignature` + resolution helpers) and calls the SAME `finalizeStorefrontOrder` usecase this plan's cash branch already calls, for the async gcash/credit_card confirmation path.
- No blockers. Zero `backend/` writes, zero new dependencies, composition root confirmed non-breaking.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*

## Self-Check: PASSED

- All 7 created files confirmed present on disk (`schedulingValidation.js`, `storefrontOrderRepository.js`, `placeOrderUseCases.js`, `getOrderStatusUseCases.js`, `checkoutController.js`, `scheduling.test.js`, `placeOrder.test.js`)
- Both commits (`b1464aca`, `21a70854`) confirmed present in `git log --oneline`
- 53/53 new tests pass; 150/150 across `tests/storefront`+`tests/commercePayments`+`tests/inventory`+`tests/availments`; full `apps/dgfy-api` suite: 510 passed, 193 skipped (live-DB-gated), 0 failed
- `check:architecture:dgfy-api` passes (11 modules, 110 code files; 16 controller files, no unauthorized model imports)
- Composition root (`apps/dgfy-api/src/routes/index.js`) reloads cleanly after all changes
- No `backend/` writes; no new dependency
