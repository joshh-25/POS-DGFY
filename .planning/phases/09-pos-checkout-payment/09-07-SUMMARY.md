---
phase: 09-pos-checkout-payment
plan: 07
subsystem: api
tags: [express, composition-root, availments, dependency-injection]

requires:
  - phase: 09-pos-checkout-payment (plan 06)
    provides: buildAvailmentsModule with finalizeAvailment/attestComplianceEvidence fully wired at the module level, awaiting HTTP mounting
provides:
  - "/v1/availments/* reachable over HTTP, behind authenticateAccount, composed from the single composition-root instance set"
affects: [09-pos-checkout-payment, uat, live-mysql-e2e]

tech-stack:
  added: []
  patterns:
    - "Composition root reuse: availments module built from the SAME tenantConnector/businessDatabaseRegistryRepository/businessRepository/productRepository/assertComplianceGate instances already constructed for products/inventory/compliance/shifts/booking, plus inventoryUseCases.recordSale and shiftsModule's repository — never a second divergent instance."

key-files:
  created: []
  modified:
    - apps/dgfy-api/src/routes/index.js
    - apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js

key-decisions:
  - "deviceBridgeClient is constructed once at the composition root via buildDeviceBridgeClient() (env-configured), mirroring how tenantConnector/other singletons are built once and injected."

requirements-completed: [CHK-04, CHK-05]

coverage:
  - id: D1
    description: "buildAvailmentsModule composed once in routes/index.js reusing the shared tenantConnector/businessDatabaseRegistryRepository/businessRepository/productRepository/assertComplianceGate instances, plus inventoryUseCases.recordSale, shiftRepository, and a constructed deviceBridgeClient."
    requirement: CHK-04
    verification:
      - kind: other
        ref: "node --experimental-vm-modules --check src/routes/index.js && grep -c \"buildAvailmentsModule|'/availments'|deviceBridgeClient|recordSale|shiftRepository\" src/routes/index.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "/v1/availments/* mounted behind authenticateAccount; unauthenticated requests return 401, not 404."
    requirement: CHK-05
    verification:
      - kind: integration
        ref: "tests/integration/commerce/commerceModulesMount.test.js#GET /v1/availments/1 (availments) returns 401 (auth required), not 404 (route missing), when unauthenticated"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-13
status: complete
---

# Phase 09 Plan 07: Wire Availments Module into Composition Root Summary

**Mounted `/v1/availments` in the real Express composition root (routes/index.js), reusing every existing shared instance — no second tenantConnector/repository set — closing the last gap flagged by 09-06 between "module fully wired at the DI level" and "reachable over HTTP."**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-13
- **Completed:** 2026-07-13
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `routes/index.js` now imports `buildAvailmentsModule`/`createAvailmentRoutes` and `buildDeviceBridgeClient`, destructures `repository: shiftRepository` from `buildShiftsModule`'s return, and builds the availments module with `recordSaleEffect: inventoryUseCases.recordSale`, `shiftRepository`, and one env-configured `deviceBridgeClient` — reusing the same `tenantConnector`/`businessDatabaseRegistryRepository`/`businessRepository`/`productRepository`/`assertComplianceGate` instances built earlier in the file.
- `router.use('/availments', createAvailmentRoutes(availmentUseCases, { authenticateAccount }))` mounted after the bookings mount, exposing `POST /v1/availments`, `GET /v1/availments/:id`, `POST /v1/availments/:id/lines`, `POST /v1/availments/:id/discounts`, `POST /v1/availments/:id/finalize`, and `POST /v1/availments/compliance-evidence` — all behind `authenticateAccount`.
- `commerceModulesMount.test.js` extended with a `{ module: 'availments', method: 'get', path: '/v1/availments/1' }` entry, proving the mount returns 401 (not 404) with no live MySQL dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compose and mount the availments module** - `c8cc8af3` (feat)
2. **Task 2: Extend the commerce mount test for availments** - `2a8a5c50` (test)

## Files Created/Modified
- `apps/dgfy-api/src/routes/index.js` - imports + composes `buildAvailmentsModule`/`buildDeviceBridgeClient`, destructures `shiftRepository`/`recordSale`, mounts `/availments`
- `apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js` - adds the availments 401-not-404 mount assertion

## Decisions Made
- Followed 09-PATTERNS.md's "Composition Root Wiring" section verbatim (exact injection shape already specified there from 09-06's research).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `deviceBridgeClient` gracefully no-ops (`device_bridge_unconfigured` warning, never a throw) when `DEVICE_BRIDGE_URL` is unset, so no env var is required for this plan's own tests to pass; a real printer integration is a deployment-time concern documented in `deviceBridgeClient.js`.

## Next Phase Readiness

- `/v1/availments/*` is now reachable end-to-end through the real app (`app.js` -> `routes/index.js`), closing the gap 09-06 flagged. Full Phase 9 POS checkout surface (create/line-edit/discount/finalize/compliance-evidence) is mountable and auth-gated.
- Verified no regressions: `npm test` (apps/dgfy-api) — 360 passed, 191 skipped (pre-existing live-MySQL-gated suites, unaffected); `npm run check:compat-boundary` — OK (9 modules, 26 files); `npm run check:architecture:dgfy-api` — OK (9 modules, 88 files; controller-boundary OK, 13 controllers).
- Remaining known follow-up (not this plan's scope): a live-MySQL end-to-end UAT pass through the real tenant DB (repository.finalizePersist's actual transaction/rollback behavior) is still untested beyond mocked-port integration tests — appropriate for a later UAT/verification pass per Phase 8's precedent.

---
*Phase: 09-pos-checkout-payment*
*Completed: 2026-07-13*
