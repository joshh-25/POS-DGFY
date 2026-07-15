---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 08
subsystem: api
tags: [express, dependency-injection, composition-root, commerce]

requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-03 through 08-07's 5 self-contained commerce modules (products, inventory, shifts, compliance, booking), each exposing buildXModule({...}) -> {..., useCases} and createXRoutes(useCases, {authenticateAccount}), built in isolation with no edits to routes/index.js"
provides:
  - "The single composition-root wiring point (apps/dgfy-api/src/routes/index.js) that builds and mounts all 5 commerce modules, reusing the businesses module's tenantConnector/businessDatabaseRegistryRepository/businessRepository instances"
  - "Cross-module dependency threading: booking receives productRepository (from products) + inventoryEffectContracts (from inventory, reserved/unwired); shifts receives assertComplianceGate (from compliance, injected but NOT invoked) + an operator-configurable staleThresholdMinutes"
  - "commerceModulesMount.test.js — transport-level proof all 5 route groups are mounted behind authenticateAccount (401-not-404), runnable without a live MySQL instance"
affects: [09]

tech-stack:
  added: []
  patterns:
    - "Composition-root dependency order: products -> inventory -> compliance -> shifts (receives compliance's gate) -> booking (receives products' repository + inventory's effect contracts) — later modules in the chain can depend on earlier modules' returned repositories/ports without any module importing another module directly."
    - "Gate-injected-but-unwired composition: a module's optional gate/port parameter (assertComplianceGate) is threaded through the composition root and accepted by the downstream module's factory, but never called from any usecase this phase — the call site is explicitly deferred to a later phase without needing to touch the factory signature again."

key-files:
  created:
    - apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js
  modified:
    - apps/dgfy-api/src/routes/index.js

key-decisions:
  - "Destructured tenantConnector and businessDatabaseRegistryRepository off buildBusinessesModule()'s return value at the top of routes/index.js (previously only repository/useCases were destructured there) — required so the 5 new buildXModule() calls could reuse the exact same singleton instances rather than each defaulting to constructing its own TenantConnector, honoring the plan's explicit prohibition against a divergent tenantConnector/businessRepository instance (T-08-08-02)."
  - "staleThresholdMinutes is passed straight from process.env.SHIFT_STALE_THRESHOLD_MINUTES (undefined when unset) into buildShiftsModule() — the module's own resolveStaleThresholdMinutes() (08-05) already falls back through override -> env var -> 60min default, so the composition root does not need to duplicate that fallback logic; passing the raw env var here is the correct 'explicit override or omit' contract 08-05's factory documents."
  - "Chose GET /v1/inventory/movements and GET /v1/compliance/state (not GET /v1/inventory or GET /v1/compliance) as the one representative endpoint per module for the mount test, since those are each module's actual top-level GET route (inventory/compliance have no bare GET /) — verified against each module's routes.js before writing the test."

requirements-completed: [PRD-01, PRD-03, BOK-02, SFT-01, FSC-02]

coverage:
  - id: D1
    description: "All 5 commerce modules (products, inventory, booking, shifts, compliance) are built in routes/index.js reusing the SAME tenantConnector/businessRepository/businessDatabaseRegistryRepository instances as the pre-existing businesses module, and mounted under /products, /inventory, /bookings, /shifts, /compliance behind the shared authenticateAccount middleware"
    requirement: "PRD-01"
    verification:
      - kind: other
        ref: "node -e composition-root import smoke check: `import('./src/routes/index.js')` resolves without throwing"
        status: pass
      - kind: other
        ref: "grep verify: all 5 of '/products', '/inventory', '/bookings', '/shifts', '/compliance' present in routes/index.js"
        status: pass
      - kind: integration
        ref: "tests/integration/commerce/commerceModulesMount.test.js — 5 parameterized cases (GET /v1/products, /v1/inventory/movements, /v1/compliance/state, /v1/shifts, /v1/bookings) each assert 401 not 404 when unauthenticated"
        status: pass
    human_judgment: false
  - id: D2
    description: "The booking module receives the products module's productRepository and the inventory module's reserved effectContracts by injection; the shifts module is constructed gate-ready (assertComplianceGate available but NOT invoked this phase)"
    requirement: "SFT-01"
    verification:
      - kind: other
        ref: "manual code inspection of routes/index.js: buildBookingModule({ ..., productRepository, inventoryEffectContracts }) and buildShiftsModule({ ..., assertComplianceGate, staleThresholdMinutes }) call sites, cross-checked against each module's own buildXModule() signature in modules/{booking,shifts}/index.js"
        status: pass
      - kind: unit
        ref: "no new call site added anywhere in shiftUseCases.js/bookingUseCases.js invoking assertComplianceGate or inventoryEffectContracts — full existing unit suites (shiftUseCases.test.js, bookingUseCases.test.js) still pass unchanged, proving no accidental gate/effect wiring was introduced this plan"
        status: pass
    human_judgment: false
  - id: D3
    description: "The dgfy-api app boots with all commerce routes registered and the existing test suite still passes"
    requirement: "BOK-02"
    verification:
      - kind: other
        ref: "npm test — full apps/dgfy-api suite: 19/19 runnable test suites pass (239/239 tests), 17 suites skip cleanly (DB-gated integration tests, unchanged pre-existing convention)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 8: Composition Root — Mount All 5 Commerce Modules Summary

**Wired products, inventory, compliance, shifts, and booking modules into `apps/dgfy-api/src/routes/index.js`, reusing the businesses module's existing tenantConnector/businessRepository singletons, threading booking's productRepository + inventory-effect-contracts injection and shifts' unwired compliance-gate injection, and proving all 5 route groups mount behind `authenticateAccount` with a new transport-level smoke test.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Modified `routes/index.js` to destructure `tenantConnector` and `businessDatabaseRegistryRepository` off `buildBusinessesModule()`'s return value (previously only `repository`/`useCases` were pulled out), so every new commerce module reuses the exact same singleton instances rather than each module's `buildXModule()` defaulting to constructing its own `TenantConnector` — honoring the plan's explicit prohibition against a second/divergent instance (T-08-08-02).
- Built all 5 commerce modules in dependency order — `buildProductsModule` → `buildInventoryModule` → `buildComplianceModule` → `buildShiftsModule` (receiving compliance's `assertComplianceGate`, injected but never invoked this phase, plus `staleThresholdMinutes` from `SHIFT_STALE_THRESHOLD_MINUTES`) → `buildBookingModule` (receiving products' `productRepository` and inventory's reserved `effectContracts`) — and mounted each module's routes top-level behind the shared `authenticateAccount` middleware: `/products`, `/inventory`, `/compliance`, `/shifts`, `/bookings`.
- Added a code comment at the shifts wiring call site explicitly noting the compliance gate is injected for forward-compatibility only and that Phase 9 owns wiring the real shift-open call site — matching the plan's prohibition against wiring any gate call site this phase.
- Wrote `commerceModulesMount.test.js`, a transport-level integration test (mirrors `health.transport.test.js`'s convention of importing the real `app` and using supertest, no live MySQL required) proving each of the 5 mounted route groups returns 401 (auth required) rather than 404 (route missing) for an unauthenticated request — the deterministic proof that routing, not just module construction, is correctly wired.
- Confirmed the full `apps/dgfy-api` test suite is green: 19/19 runnable suites pass (239/239 tests), 17 DB-gated integration suites skip cleanly per their existing convention (no regressions introduced by this plan's composition-root change).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build and mount the 5 commerce modules in the composition root** - `ada7aac9` (feat)
2. **Task 2: Commerce mount smoke/integration test + full-suite green** - `6b048fe9` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/dgfy-api/src/routes/index.js` - Composition root: builds + mounts products/inventory/compliance/shifts/booking modules, reusing the businesses module's `tenantConnector`/`businessDatabaseRegistryRepository`/`businessRepository`; threads `productRepository` + `inventoryEffectContracts` into booking and `assertComplianceGate` + `staleThresholdMinutes` into shifts
- `apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js` - Transport-level smoke test: 5 parameterized 401-not-404 mount assertions + one genuinely-unmounted-path 404 control case

## Decisions Made

- **Destructured `tenantConnector`/`businessDatabaseRegistryRepository` off the existing `buildBusinessesModule()` call** rather than constructing a second set for the commerce modules — this is the only change needed to satisfy the "reuse the same instances" prohibition, since `buildBusinessesModule()` already returned both values (08-04-08-07's summaries all documented this expectation) but `routes/index.js` had never pulled them out before this plan.
- **`staleThresholdMinutes` passed as the raw `process.env.SHIFT_STALE_THRESHOLD_MINUTES` value (possibly `undefined`)** — `buildShiftsModule()`'s own `resolveStaleThresholdMinutes()` (built in 08-05) already implements the override → env-var → 60-min-default fallback chain, so the composition root intentionally does not re-implement that logic; it defers entirely to the module's own resolution per its documented contract.
- **Mount test picks each module's actual top-level GET route** (`/v1/inventory/movements`, `/v1/compliance/state`, not bare `/v1/inventory` or `/v1/compliance`) — verified against each module's `routes.js` before writing the test, since inventory and compliance don't expose a bare `GET /`.

## Deviations from Plan

None - plan executed exactly as written. No pre-commit architecture-guardrail issues were hit (this plan only modifies `routes/index.js` and adds a test file, neither of which triggers the `modules/*` directory-structure or controller-naming guardrails that every prior Phase 8 module plan hit).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `SHIFT_STALE_THRESHOLD_MINUTES` remains an optional operator-set env var (08-05); its absence does not block this plan.

## Next Phase Readiness

**Final mounted endpoint map for the whole phase** (all under `/v1`, all behind `authenticateAccount`):

| Module | Mount | Endpoints |
|--------|-------|-----------|
| products | `/products` | `POST /`, `GET /`, `PATCH /:id`, `PATCH /:id/bookable`, `POST /folders`, `GET /folders` |
| inventory | `/inventory` | `POST /restock`, `POST /loss`, `POST /adjustment`, `GET /movements` |
| compliance | `/compliance` | `GET /state`, `POST /evidence`, `POST /review` |
| shifts | `/shifts` | `POST /`, `POST /:id/close`, `POST /:id/no-sale-pop`, `GET /` |
| bookings | `/bookings` | `POST /`, `POST /:id/cancel`, `GET /` |

- Phase 8 (commerce-foundation-product-catalog-booking-shift-cash-drawe) is now fully composed and mounted end-to-end: all 5 modules are reachable through the real `app.js` -> `routes/index.js` composition root, sharing one `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository` set.
- `assertComplianceGate` is threaded into `buildShiftsModule()` but not called from any usecase — Phase 9 is expected to wire the real shift-open (and other POS-operation) call sites into this already-injected gate without any further composition-root restructuring.
- `inventoryEffectContracts.recordBookingEffect`/`recordSaleEffect` remain reserved and unwired — Phase 9's `modules/availment` (or a later gap-closure) owns wiring real stock effects on checkout/booking fulfillment.
- No blockers. Phase 8 is complete; ready to hand off to Phase 9 planning.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-api/src/routes/index.js`
- FOUND: `apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js`
- FOUND: `.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-08-SUMMARY.md`
- FOUND commit: `ada7aac9` (Task 1)
- FOUND commit: `6b048fe9` (Task 2)
- FOUND commit: `07e66cb0` (SUMMARY.md)
