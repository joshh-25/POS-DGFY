---
phase: 10-storefront-discovery-online-ordering
plan: 08
subsystem: payments
tags: [paymongo, webhook, hmac, idempotency, express, sequelize, dgfy_core, composition-root]

# Dependency graph
requires:
  - phase: 10-05
    provides: "buildPayMongoClient() (verifyWebhookSignature) + CommercePaymentRepository session resolution helpers"
  - phase: 10-06
    provides: "placeOrder orchestration + StorefrontOrderRepository (storefront_orders, D-04 idempotency)"
  - phase: 10-07
    provides: "finalizeStorefrontOrder — idempotent, atomic tenant Availment finalize seam"
provides:
  - "handleWebhook: signature-verified (HMAC over raw body, BEFORE any DB work) PayMongo event router — payment.paid/payment.failed/qrph.expired routed, account.*/refund.* acknowledged and ignored"
  - "finalizePaidOrder: the async webhook-driven cross-DB finalize orchestration — natural idempotency guard, landlord-durable-first, writes availment_id back to BOTH order and session, never-silent finalize_failed_manual_resolution_required on failure"
  - "retryFinalization: operator-invokable re-run of finalizePaidOrder, staff-or-owner membership gated"
  - "expireDueSessions: the D-09 auto-release sweep, independent of the qrph.expired webhook — wired to a recurring interval AND an opportunistic on-read hook"
  - "Full composition wiring in routes/index.js: commercePayments + storefront modules mounted with a raw-body webhook route, reusing every shared instance (tenantConnector, businessRepository, productRepository, inventory reservationPorts, availments.finalizeStorefrontOrder)"
affects: [11-order-fulfillment-and-delivery-coordination]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "express.json({verify}) stashes req.rawBody as a Buffer alongside the normal parsed req.body — zero new middleware, no other route's behavior changes"
    - "finalizePaidOrder is the SINGLE finalize implementation both the webhook path and the operator retry endpoint call — retry is never a divergent recovery code path"
    - "D-09 belt-and-suspenders: a recurring in-process setInterval sweep (STOREFRONT_EXPIRY_SWEEP_INTERVAL_SECONDS, default 300, unref'd so it never blocks process exit) PLUS a fire-and-forget opportunistic on-read hook from getOrderStatus — two independent mechanisms neither of which depends on PayMongo ever delivering qrph.expired"

key-files:
  created:
    - apps/dgfy-api/src/modules/commercePayments/controllers/webhookController.js
    - apps/dgfy-api/src/modules/commercePayments/routes.js
    - apps/dgfy-api/src/modules/commercePayments/usecases/handleWebhookUseCases.js
    - apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js
    - apps/dgfy-api/src/modules/commercePayments/usecases/retryFinalizationUseCases.js
    - apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js
    - apps/dgfy-api/tests/storefront/storefrontE2E.test.js
  modified:
    - apps/dgfy-api/src/app.js
    - apps/dgfy-api/src/config/env.js
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
    - apps/dgfy-api/src/modules/commercePayments/index.js
    - apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js
    - apps/dgfy-api/src/modules/storefront/index.js
    - apps/dgfy-api/src/modules/storefront/repositories/storefrontOrderRepository.js
    - apps/dgfy-api/src/modules/storefront/usecases/getOrderStatusUseCases.js
    - apps/dgfy-api/src/routes/index.js

key-decisions:
  - "finalizePaidOrder's manual-resolution write NEVER silently swallows a finalize failure: a thrown error OR an ApplicationResult failure from finalizeStorefrontOrder AFTER payment is confirmed paid moves BOTH the landlord order and session to finalize_failed_manual_resolution_required. The webhook layer itself still acks 200 for the manual-resolution outcome (ApplicationResult.success wrapping the terminal state) since a PayMongo redelivery cannot fix a genuine tenant-side finalize failure — only the operator retry endpoint can."
  - "commercePayments/index.js builds its OWN StorefrontOrderRepository instance around the SAME injected storefrontOrderModel Sequelize model 10-06's storefront module also wraps — a second, stateless wrapper class around one shared table/model is safe (no cache/connection-pool state to diverge), and avoids a circular build-order dependency between the two modules (commercePayments needs createQrphSession built before storefront's placeOrder; storefront's own orderRepository can't exist yet at that point)."
  - "retryFinalization's authorization check is staff-or-owner membership (businessRepository.getMembership, any active member), not owner-only — mirrors Phase 8's established 'operator' precedent (inventory manual movements gate on any active membership, not owner-only) rather than re-deriving a narrower rule."
  - "The retry-finalization route (POST /commerce-payments/sessions/:reference/retry-finalization) resolves the session FIRST inside the usecase (not via a :businessId route param) since the fixed URL shape the plan specifies has no businessId segment — ownership is checked against session.tenant_id once resolved, mirroring businesses' guardBusinessAccess-inside-usecase convention rather than a route-level gate."
  - "D-09's on-read opportunistic mechanism is wired as a fire-and-forget hook (never awaited, never affects the read's own response) so a consumer polling GET /storefront/orders/:reference never pays sweep latency on their own request — the recurring interval sweep is the primary, always-running mechanism; the on-read hook is defense-in-depth for the gap between sweep intervals."

patterns-established:
  - "A finalize seam invoked from two entry points (webhook + operator retry) shares ONE usecase function — never a parallel 'recovery' implementation that could drift from the primary path's idempotency/error-handling guarantees."

requirements-completed: [STF-05]

coverage:
  - id: D1
    description: "A verified payment.paid webhook (HMAC over the raw body, verified BEFORE any DB work) resolves the landlord session/tenant and finalizes the order into the correct tenant Availment idempotently"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildHandleWebhookUseCase > routes payment.paid to finalizePaidOrder and returns its status"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildFinalizePaidOrderUseCase > finalizes a paid order: marks session paid, calls finalizeStorefrontOrder with server-side lines, writes availment_id back to BOTH order and session"
        status: pass
      - kind: e2e
        ref: "apps/dgfy-api/tests/storefront/storefrontE2E.test.js#drives browse -> checkout -> webhook-finalize and proves single-Availment idempotency"
        status: pass
    human_judgment: false
  - id: D2
    description: "A duplicate or replayed webhook never produces a second Availment or a second stock deduction"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildFinalizePaidOrderUseCase > is idempotent: a session already finalized short-circuits without calling finalizeStorefrontOrder again (no second Availment)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildFinalizePaidOrderUseCase > is idempotent when the ORDER (not the session) already shows finalized+availment_id — a duplicate webhook delivery never creates a second Availment"
        status: pass
      - kind: e2e
        ref: "apps/dgfy-api/tests/storefront/storefrontE2E.test.js#drives browse -> checkout -> webhook-finalize and proves single-Availment idempotency (duplicate delivery assertion)"
        status: pass
    human_judgment: false
  - id: D3
    description: "payment.failed / qrph.expired releases the reservation and moves the order to expired/failed; account.* and refund.* are ignored"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildHandleWebhookUseCase > qrph.expired releases the reservation and moves BOTH order and session to expired (D-09)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildHandleWebhookUseCase > payment.failed releases the reservation and moves BOTH order and session to failed"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildHandleWebhookUseCase > ignores account.*/refund.* events with a 200 handled:false — never acted upon (D-02/D-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Auto-release does not depend on the qrph.expired webhook: a wired sweep (recurring interval + on-read) reclaims expired holds even if the webhook is never delivered"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildExpireDueSessionsUseCase > MISSED-WEBHOOK PATH: an expired session that never received a qrph.expired webhook is still reclaimed by the sweep alone"
        status: pass
      - kind: e2e
        ref: "apps/dgfy-api/tests/storefront/storefrontE2E.test.js#missed-webhook path: expireDueSessions reclaims a NEVER-paid order that PayMongo never sent qrph.expired for (D-09)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A paid-but-unfinalizable order lands in finalize_failed_manual_resolution_required and is retryable via an operator endpoint — never a silent failure"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildFinalizePaidOrderUseCase > a finalizeStorefrontOrder FAILURE result lands the order+session in finalize_failed_manual_resolution_required — never silent"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildFinalizePaidOrderUseCase > a finalizeStorefrontOrder THROW also lands the order+session in finalize_failed_manual_resolution_required, then re-throws (never silent)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js#buildRetryFinalizationUseCase > re-runs finalizePaidOrder for a finalize_failed_manual_resolution_required session (the operator recovery path)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The storefront and commercePayments modules are mounted and wired into the running app with the raw-body webhook route, reusing shared composition-root instances"
    requirement: "STF-05"
    verification:
      - kind: integration
        ref: "node --experimental-vm-modules -e \"import('./src/routes/index.js')\" (composition loads with zero errors)"
        status: pass
      - kind: other
        ref: "npm run check:architecture:dgfy-api (11 modules, 115 code files, 17 controllers, zero unauthorized model imports)"
        status: pass
    human_judgment: false
  - id: D7
    description: "[ASSUMED A6] PayMongo event names/payload shape are read from legacy code, not re-verified against live PayMongo — sandbox-validate before go-live"
    verification: []
    human_judgment: true
    rationale: "This is an explicit product/ops sign-off item the plan itself flags — no automated test can prove PayMongo's real production event shape matches the legacy-derived assumptions; requires a live PAYMONGO_SECRET_KEY/PAYMONGO_WEBHOOK_SECRET sandbox test before go-live."

duration: 30min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 08: Async Webhook-Driven Cross-Database Finalization Summary

**A verified PayMongo `payment.paid` webhook (HMAC over the raw body, checked BEFORE any DB work) resolves the landlord session/order and idempotently finalizes it into the correct tenant Availment via 10-07's finalize seam, writing `availment_id` back to both the durable landlord order and session; a paid-but-unfinalizable order lands in an explicit `finalize_failed_manual_resolution_required` state with a staff-or-owner-gated retry endpoint, and stock auto-releases via a D-09 sweep that never depends on PayMongo actually delivering `qrph.expired`. The full storefront + commercePayments module composition (including the raw-body route) is now live in `routes/index.js` — this closes STF-05 and completes Phase 10.**

## Performance

- **Duration:** ~30 min (this session's Task 3 composition-wiring + E2E test work; Tasks 1-2's webhook/finalize/retry/sweep implementation and unit tests were already committed by a prior interrupted execution session — see Issues Encountered)
- **Completed:** 2026-07-13T13:11:00Z
- **Tasks:** 3
- **Files modified:** 16 (7 created, 9 modified) across all three tasks

## Accomplishments

- `app.js`'s `express.json({verify})` stashes the raw request body onto `req.rawBody` for every route (zero behavior change to any other route's parsed `req.body`), giving the webhook controller the EXACT bytes PayMongo signed.
- `handleWebhookUseCases.js`: the signature-verified event router — `verifyWebhookSignature` runs FIRST, before any DB read (Pitfall 1); `payment.paid` routes to `finalizePaidOrder`; `payment.failed`/`qrph.expired` release the tenant reservation and move BOTH the landlord order and session to the terminal status; `account.*`/`payment.refunded`/`payment.refund.updated` are acknowledged (200) and ignored (D-02/D-03, no split/refund surface exists this phase).
- `finalizePaidOrderUseCases.js`: `buildFinalizePaidOrderUseCase` — the natural idempotency guard (session already `finalized` OR order already carries `availment_id`+`finalized` short-circuits with no re-finalize), landlord-durable-first (`session`/`order` marked `paid` before the tenant write), reconstructs the line snapshot from the order's durable `checkout_payload`, calls 10-07's `finalizeStorefrontOrder`, and writes `availment_id`/`finalized`/`finalized_at` back to BOTH the order and session on success. On a failure OR a thrown error AFTER payment is confirmed, BOTH land in `finalize_failed_manual_resolution_required` — never silently dropped (ADR 0027 #8).
- `finalizePaidOrderUseCases.js` also exports `buildExpireDueSessionsUseCase` — the D-09 auto-release sweep: queries `storefront_orders` for `awaiting_payment` rows past their shared `expires_at`, releases the tenant reservation, and moves BOTH the order and its paired session to `expired`. Proven independent of the `qrph.expired` webhook by a dedicated missed-webhook test.
- `retryFinalizationUseCases.js`: `buildRetryFinalizationUseCase` re-runs the SAME `finalizePaidOrder` function for a session stuck `paid` or `finalize_failed_manual_resolution_required`, gated behind an active staff-or-owner business membership check.
- `commercePayments/index.js` wires all four new use cases together, plus a `setInterval` sweep (`STOREFRONT_EXPIRY_SWEEP_INTERVAL_SECONDS`, default 300s, `unref()`'d, gated on `COMMERCE_PAYMENTS_ENABLED`) — documented as swappable for a real scheduler/cron later without any usecase-layer change.
- **This session's work (Task 3):** `routes/index.js` now builds `commercePayments` BEFORE `storefront` (its `createQrphSession` is a `placeOrder` port), reusing the SAME `tenantConnector`/`businessRepository`/`productRepository`/`inventory.reservationPorts`/`availmentUseCases.finalizeStorefrontOrder` instances every other module already shares — never a second, divergent set. `storefront/index.js` gained an optional `onReadExpiryCheck` port, wired to `commercePaymentsModule.expireDueSessions`, forwarded into `getOrderStatus` as D-09's second (fire-and-forget, on-read) missed-webhook mechanism. `POST /v1/commerce-payments/paymongo/webhook` and `POST /v1/commerce-payments/sessions/:reference/retry-finalization` are now live routes.
- `storefrontE2E.test.js` (this session): drives the full flow — discovery search → store page → validate cart → guest OTP verify → `placeOrder` (QR/gcash path, real PayMongo-client-shaped fake) → a verified `payment.paid` webhook → asserts exactly one tenant Availment finalized, `availment_id` written back to both order and session, the reservation transitioned to `committed`, and that a duplicate webhook delivery produces NO second Availment and no second `commitReservation` call. Two additional tests cover the missed-webhook sweep path and the cash immediate-finalize path.
- Full `apps/dgfy-api` suite: 539 passed, 193 skipped (live-DB-gated), 0 failed, 40/58 suites run. `check:architecture:dgfy-api`: 11 modules, 115 code files, 17 controllers, zero unauthorized model imports.

## Task Commits

Each task was committed atomically:

1. **Task 1: Raw-body webhook route + signature-verified event router** + **Task 2: finalizePaidOrder orchestration + manual-resolution state + operator retry + expiry release** (TDD, RED then GREEN) — `e43fce64` (test: add failing test for webhook finalize + retry + expiry sweep), `12217dfe` (feat: webhook finalize (payment.paid/failed/qrph.expired) + retry + D-09 sweep). Both tasks landed together — see Deviations for why.
3. **Task 3: Composition wiring (mount storefront + commercePayments) + end-to-end test** — `0e16ef81` (feat: compose storefront + commercePayments modules, mount raw-body webhook route)

_Sequential single-plan wave execution on the main working tree — no separate plan-metadata commit beyond this SUMMARY's own final commit._

## Files Created/Modified

- `apps/dgfy-api/src/app.js` - `express.json({verify})` stashes `req.rawBody` for the webhook's HMAC check
- `apps/dgfy-api/src/modules/commercePayments/controllers/webhookController.js` - transport-only `handleWebhook`/`retryFinalization` controller
- `apps/dgfy-api/src/modules/commercePayments/routes.js` - `POST /paymongo/webhook` (unauthenticated, signature IS the auth) + `POST /sessions/:reference/retry-finalization` (authenticated)
- `apps/dgfy-api/src/modules/commercePayments/usecases/handleWebhookUseCases.js` - signature-verified event router
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js` - `buildFinalizePaidOrderUseCase` + `buildExpireDueSessionsUseCase`
- `apps/dgfy-api/src/modules/commercePayments/usecases/retryFinalizationUseCases.js` - `buildRetryFinalizationUseCase`
- `apps/dgfy-api/src/modules/commercePayments/index.js` - wires webhook/finalize/retry/sweep use cases + the recurring interval timer; `orderRepository`/`finalizeStorefrontOrder`/`releaseReservation`/`businessRepository` all OPTIONAL at construction (mirrors 10-06/10-07's optionality convention)
- `apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js` - adds `findSessionByStorefrontOrderId` (reverse FK lookup the sweep needs)
- `apps/dgfy-api/src/config/env.js` - adds `STOREFRONT_EXPIRY_SWEEP_INTERVAL_SECONDS` (default 300)
- `apps/dgfy-api/src/modules/storefront/repositories/storefrontOrderRepository.js` - adds `findById` (internal-id lookup, webhook-only) + `findDueAwaitingPayment` (cross-tenant sweep query)
- `apps/dgfy-api/src/modules/storefront/usecases/getOrderStatusUseCases.js` - adds optional `onReadExpiryCheck` fire-and-forget hook (D-09 mechanism 2/2)
- `apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js` - 26 tests: webhook signature/routing, finalize/idempotency/manual-resolution, sweep (incl. missed-webhook path), retry (incl. 403/404/409)
- `apps/dgfy-api/src/modules/storefront/index.js` **(this session)** - accepts/forwards optional `onReadExpiryCheck`
- `apps/dgfy-api/src/routes/index.js` **(this session)** - full composition: inventory `reservationPorts` captured, `availments` wired with `commitReservation`, `commercePaymentsModule` built before `storefrontModule`, both mounted (`/storefront`, `/commerce-payments`)
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` **(this session)** - registers `webhookController.js`'s `*Controller.js` naming
- `apps/dgfy-api/tests/storefront/storefrontE2E.test.js` **(this session)** - 3 tests: full browse→checkout→webhook-finalize flow with single-Availment idempotency proof, missed-webhook sweep path, cash immediate-finalize path

## Decisions Made

See `key-decisions` in frontmatter for full rationale. Summary:

- Manual-resolution transitions are never silent — a finalize failure or throw after payment confirmation always lands both order and session in `finalize_failed_manual_resolution_required`, and the webhook layer still acks 200 (redelivery cannot fix a tenant-side failure; only the retry endpoint can).
- `commercePayments/index.js` builds its own `StorefrontOrderRepository` around the same injected `storefrontOrderModel` storefront's module also wraps — a second stateless wrapper, not a divergent instance, chosen to avoid a circular build-order dependency (commercePayments must exist before storefront's `placeOrder` can receive `createQrphSession`).
- `retryFinalization`'s access gate is staff-or-owner (any active membership), matching Phase 8's established "operator" precedent rather than owner-only.
- D-09's on-read mechanism is fire-and-forget so a consumer's own status poll never pays sweep latency; the recurring interval sweep is the primary, always-on mechanism.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tasks 1 and 2 committed together instead of two atomic per-task commits**
- **Found during:** Resuming this plan's execution (Task 1's and Task 2's code, tests, and both git commits — `e43fce64`/`12217dfe` — were already present from a prior interrupted execution session before this session began; see Issues Encountered)
- **Issue:** The prior session's TDD RED/GREEN commit pair (`test(10-08)` then `feat(10-08)`) spans both Task 1 (webhook route/controller/router) and Task 2 (finalize/retry/sweep) file sets, since the two tasks' code is functionally interdependent (the webhook router requires `finalizePaidOrder` to exist to be constructible at all) and the plan's own test file (`webhookFinalize.test.js`) is shared across both tasks.
- **Fix:** Verified both tasks' code and all 26 unit tests independently (re-ran the full suite, confirmed `check:architecture:dgfy-api` passes) rather than attempting to retroactively split an already-committed, already-clean commit pair. No functional gap — every Task 1 and Task 2 `<done>` criterion is independently verified passing.
- **Files modified:** N/A (verification only — no new commit needed for this deviation).
- **Verification:** `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/commercePayments/webhookFinalize.test.js` — 26/26 passing (8/26 match `-t "signature|ignore|expired"`, the remainder match `-t "finalize|manual|retry|expire"`, confirming both tasks' `<verify>` commands independently pass against the shared test file).
- **Committed in:** `e43fce64`, `12217dfe` (pre-existing, confirmed not re-committed)

---

**Total deviations:** 1 (a commit-structure observation, not a code change) — no functional deviation from the plan's `<behavior>`/`<action>` specs across any of the three tasks.
**Impact on plan:** None on delivered functionality. All must-haves, threat mitigations, and `<done>` criteria for all three tasks are met and independently verified in this session.

## Issues Encountered

- **This plan's execution spanned two sessions.** On starting, `git status`/`git log` revealed Tasks 1 and 2 (webhook route, signature verification, `finalizePaidOrder`, `retryFinalization`, `expireDueSessions`, the recurring sweep timer, and their full `webhookFinalize.test.js` suite — 26 tests) were ALREADY implemented and committed (`e43fce64`, `12217dfe`) by a prior execution of this same plan that was apparently interrupted before reaching Task 3 (STATE.md still showed "Phase 10 execution started", "Plan 1 of 8", and no `10-08-SUMMARY.md` existed). This session independently re-verified all of that prior work (re-ran the full test suite, re-read every file, confirmed the architecture guardrail and composition-root load cleanly) before treating it as ground truth, rather than blindly trusting it — no bugs were found in the prior session's implementation. This session then completed Task 3 (composition wiring in `routes/index.js`, the `onReadExpiryCheck` port threading, the architecture-guardrail allowlist entry, and `storefrontE2E.test.js`) and committed it as `0e16ef81`.
- No other issues. All three tasks' `<verify>` commands pass; the full `apps/dgfy-api` suite (539 passed, 0 failed) and `check:architecture:dgfy-api` both pass cleanly after Task 3's changes.

## User Setup Required

None for this plan — no external service configuration is exercised (all PayMongo HTTP and webhook signature verification is mocked/faked in tests; no real PayMongo API calls are made). **[ASSUMED A6, carried forward from 10-05/10-06/10-07]:** PayMongo event names (`payment.paid`/`payment.failed`/`qrph.expired`) and payload shape are read from legacy code, not re-verified against live PayMongo — sandbox validation with real `PAYMONGO_SECRET_KEY`/`PAYMONGO_WEBHOOK_SECRET` credentials against PayMongo's actual test-mode webhook delivery is required before go-live.

## Next Phase Readiness

- **Phase 10 (storefront-discovery-online-ordering) is complete.** All four phase success criteria are covered end-to-end: discovery/search (10-03), guest-or-account checkout with pickup/delivery scheduling (10-04/10-06), PayMongo QR Ph payment (10-05/10-06), and the async webhook-driven cross-database finalization this plan closes (STF-05).
- **Phase 11 (Order Fulfillment & Delivery Coordination)** can now build on a fully-wired, fully-tested storefront ordering flow: `storefront_orders`/`commerce_payment_sessions` reach a terminal `finalized` state with a real tenant `availment_id` cross-reference, ready for a fulfillment-status layer to build on top of.
- **Before production go-live:** A4 (QR Ph → `gcash` payment-method ENUM mapping, 10-07), A5 (storefront checkout does not go through the `pos.checkout` compliance gate, 10-07), and A6 (PayMongo event shape sandbox validation, this plan) all need product/compliance-owner sign-off — none are code blockers, all are explicit, surfaced assumptions carried through the phase's SUMMARYs.
- No blockers. Zero `backend/` writes across the whole phase; zero new npm dependencies in this plan.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*

## Self-Check: PASSED

- All 17 claimed created/modified files verified present on disk.
- All 3 commits (`e43fce64`, `12217dfe`, `0e16ef81`) verified present in `git log --oneline --all`.
- Full `apps/dgfy-api` suite re-run clean: 40/58 suites run (18 skipped, live-DB-gated), 539 passed, 193 skipped, 0 failed.
- `npm run check:architecture:dgfy-api`: 11 modules, 115 code files, 17 controller files, zero unauthorized model imports — passing.
- `node --experimental-vm-modules -e "import('./src/routes/index.js')"` — composition root loads with zero errors.
- No `backend/` writes; no new npm dependency.
