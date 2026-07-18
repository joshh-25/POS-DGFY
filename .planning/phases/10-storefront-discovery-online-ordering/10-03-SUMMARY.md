---
phase: 10-storefront-discovery-online-ordering
plan: 03
subsystem: api
tags: [express, sequelize, mysql, redis, geo-search, fulltext-search, storefront, cart-validation]

# Dependency graph
requires:
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-01: dgfy_core.storefront_discovery_index with GENERATED latitude/longitude/search_text columns + BTREE/FULLTEXT indexes"
provides:
  - "apps/dgfy-api/src/modules/storefront module skeleton (index.js/routes.js/controllers/repositories/usecases) for 10-04 and 10-06 to extend"
  - "Public discovery search (STF-01) and store-page + product-listing read (STF-02) use cases"
  - "validateCart — the single server-side cart re-pricer reused by every checkout path (cash and PayMongo, 10-06)"
affects: [10-04-storefront-guest-account-checkout, 10-06-order-finalization-payment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Landlord-direct raw-SQL repository (StorefrontDiscoveryRepository) with constructor-injected sequelize/getRedisClient for testability, distinct from tenant-scoped repositories that resolve via TenantConnector"
    - "Redis cache wrap-around pattern: read/write never throw, cache miss or any Redis error transparently falls back to the direct DB query"

key-files:
  created:
    - apps/dgfy-api/src/modules/storefront/index.js
    - apps/dgfy-api/src/modules/storefront/routes.js
    - apps/dgfy-api/src/modules/storefront/README.md
    - apps/dgfy-api/src/modules/storefront/controllers/discoveryController.js
    - apps/dgfy-api/src/modules/storefront/repositories/storefrontDiscoveryRepository.js
    - apps/dgfy-api/src/modules/storefront/usecases/searchDiscoveryUseCases.js
    - apps/dgfy-api/src/modules/storefront/usecases/getStorePageUseCases.js
    - apps/dgfy-api/src/modules/storefront/usecases/cartValidation.js
    - apps/dgfy-api/tests/storefront/discovery.test.js
    - apps/dgfy-api/tests/storefront/cartValidation.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "storefrontDiscoveryRepository uses constructor-injected sequelize/getRedisClient (not module-level imports) so unit tests can exercise query-building and cache fallback without a live MySQL/Redis connection"
  - "cartValidation's businessId parameter is the landlord business UUID (matching productRepository.findById(businessId, id)'s existing signature), not a literal 'tenantId' string as the plan's prose used loosely — the codebase's established tenant-resolution key is business_id"
  - "category/openNow discovery filters read JSON_EXTRACT paths on search_snapshot/location_snapshot that the projection syncer (a later plan) has not populated yet — the query logic is correct and wired today, it will start returning filtered matches once that syncer lands"

requirements-completed: [STF-01, STF-02]

coverage:
  - id: D1
    description: "Consumer can search nearby stores by location + text and get distance-ranked, visibility-filtered results (STF-01)"
    requirement: "STF-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/discovery.test.js#StorefrontDiscoveryRepository > searchNearby"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/discovery.test.js#buildSearchDiscoveryUseCase"
        status: pass
    human_judgment: false
  - id: D2
    description: "Consumer can retrieve a specific store's page with its active product listing, or a 404 for an unknown/invisible handle (STF-02)"
    requirement: "STF-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/discovery.test.js#buildGetStorePageUseCase"
        status: pass
    human_judgment: false
  - id: D3
    description: "Server-side cart validator recomputes every amount in centavos from the live catalog and never trusts a client-supplied price/total"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/cartValidation.test.js#buildValidateCartUseCase"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 03: Storefront Discovery, Store Page + Cart Validation Summary

**Public discovery search (ST_Distance_Sphere + FULLTEXT BOOLEAN MODE, Redis-cached with DB fallback), a store-page + active product listing read, and a single reusable server-side cart validator that recomputes every amount in integer centavos from the tenant catalog — the `apps/dgfy-api/src/modules/storefront` module skeleton 10-04/10-06 extend.**

## Performance

- **Duration:** 55 min
- **Tasks:** 2 (Task 2 executed as TDD: RED then GREEN)
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments

- `StorefrontDiscoveryRepository`: parameterized `ST_Distance_Sphere` geo search + FULLTEXT `MATCH()...AGAINST(BOOLEAN MODE)` over `storefront_discovery_index`'s generated `latitude`/`longitude`/`search_text` columns (10-01), with a Redis cache wrap that reads/writes never throw — any cache miss or Redis error transparently falls back to the direct DB query.
- `searchDiscovery` use case: validates lat/lng/radius/limit/offset, delegates to the repository, and returns **only opaque store references** (`handle`/`display_name`/`distance_km`) — never a raw sequential `storefront_discovery_index.id` or `business_id` (T-10-03-02, IDOR guard).
- `getStorePage` use case: resolves a store by handle (404 for unknown/invisible), then reads its **active-only** product listing from the tenant catalog via the injected `productRepository`, keyed by the discovery row's `business_id`.
- `validateCart` use case: the single server-side cart re-pricer both cash and PayMongo checkout paths (10-06) will reuse. Resolves each line from the tenant catalog, rejects unknown (404) / inactive (409) products and non-positive quantities / empty carts (400), snapshots name + unit price from the catalog, and recomputes every amount in integer centavos via `availments/usecases/money.js`'s `roundHalfUp`. No code path ever reads a client-supplied price or total (T-10-03-01).
- Public, unauthenticated, rate-limited routes: `GET /storefront/discovery/search` and `GET /storefront/stores/:handle` (module scaffolding only — mounting into `apps/dgfy-api/src/routes/index.js` is 10-04/10-06's scope).
- 25/25 tests passing (11 repository-level + 6 discovery-usecase + 8 cartValidation).

## Task Commits

Each task was committed atomically:

1. **Task 1: Storefront module skeleton + discovery repository (geo/text search + Redis cache)** - `f8232787` (feat)
2. **Task 2: Store page + product listing usecase, and server-side cart validator** (TDD):
   - RED - `1ad6cd8c` (test) — confirmed failing: `Cannot find module` for all three not-yet-created usecase files
   - GREEN - `66f6e8df` (feat) — 25/25 tests passing

**Plan metadata:** committed separately (see final commit below).

## Files Created/Modified

- `apps/dgfy-api/src/modules/storefront/repositories/storefrontDiscoveryRepository.js` - Raw-SQL geo/FULLTEXT search + Redis cache over the landlord `storefront_discovery_index`
- `apps/dgfy-api/src/modules/storefront/usecases/searchDiscoveryUseCases.js` - Input validation + opaque store-reference mapping
- `apps/dgfy-api/src/modules/storefront/usecases/getStorePageUseCases.js` - Handle resolution + active product listing
- `apps/dgfy-api/src/modules/storefront/usecases/cartValidation.js` - Catalog-snapshotted, centavo-precise cart re-pricer
- `apps/dgfy-api/src/modules/storefront/controllers/discoveryController.js` - Transport-only controller for the two public routes
- `apps/dgfy-api/src/modules/storefront/routes.js` - `/discovery/search` and `/stores/:handle`, rate-limited via `express-rate-limit`
- `apps/dgfy-api/src/modules/storefront/index.js` - `buildStorefrontModule()` composition root; exposes `validateCart` at the top level for 10-06 reuse
- `apps/dgfy-api/src/modules/storefront/README.md` - Module documentation (routes -> controllers -> usecases -> repositories -> models layering, prohibitions honored)
- `apps/dgfy-api/tests/storefront/discovery.test.js` - Repository + searchDiscovery/getStorePage usecase tests
- `apps/dgfy-api/tests/storefront/cartValidation.test.js` - cartValidation usecase tests
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Registered `discoveryController.js` in the controller-naming allowlist (matches every prior phase's `*Controller.js` precedent)

## Decisions Made

- `storefrontDiscoveryRepository` accepts `sequelize`/`getRedisClient` via constructor injection rather than importing `config/db.js`/`config/redis.js` at module scope directly, so its query-building and cache-fallback logic can be unit-tested against mocks without a live MySQL/Redis connection — this mirrors the DI convention already used by `tenantConnector`-based repositories elsewhere in the codebase, applied to the landlord-direct case.
- `cartValidation`'s scoping parameter is named `businessId` (not `tenantId`, which the plan's prose used loosely) to match `productRepository.findById(businessId, id)`'s existing, already-established signature — introducing a second name for the same concept would have been pure indirection.
- Discovery's `category`/`openNow` filters generate correct, parameterized `JSON_EXTRACT` clauses against `search_snapshot`/`location_snapshot` today, even though no projection syncer populates those JSON keys yet (that syncer is out of this plan's scope). This does not block STF-01's core truth (distance + text search), which depends only on the generated `latitude`/`longitude`/`search_text` columns already populated by 10-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added storefront module README.md and controller-naming allowlist entry**
- **Found during:** Task 1 commit
- **Issue:** The `apps/dgfy-api` architecture-guardrail pre-commit hook (repo-wide, not scoped to this plan) requires every module to have a `README.md`/`index.js`, and requires controller files to either be named `*Handlers.js` or be explicitly allowlisted. `discoveryController.js` (matching every prior phase's `*Controller.js` convention) tripped the naming check, and the new `storefront` module had no `README.md` yet.
- **Fix:** Added `apps/dgfy-api/src/modules/storefront/README.md` (documenting the module's layering and prohibitions, mirroring `../products/README.md`) and registered `discoveryController.js` in `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST`, exactly matching the precedent set by every prior phase's controller (accounts, businesses, products, inventory, shifts, compliance, booking, availments).
- **Files modified:** `apps/dgfy-api/src/modules/storefront/README.md` (new), `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- **Verification:** `check:architecture:dgfy-api` passes (`OK. Checked 11 modules and 102 code files.`)
- **Committed in:** `f8232787` (Task 1 commit)

**2. [Rule 3 - Blocking] Wired the three Task 2 use cases into `index.js` even though it was not listed in Task 2's `files_modified`**
- **Found during:** Task 2 GREEN implementation
- **Issue:** Task 2's action text explicitly says "Wire all three into `buildStorefrontModule`. Expose `validateCart` from the module...", but the plan's `<files>` list for Task 2 omitted `index.js` (only listing the three new usecase files + the two test files).
- **Fix:** Edited `index.js` to import and wire `searchDiscovery`/`getStorePage`/`validateCart` into `buildStorefrontModule()`'s returned `useCases`, and exposed `validateCart` at the top level of the return value as the plan's action text requires.
- **Files modified:** `apps/dgfy-api/src/modules/storefront/index.js`
- **Verification:** 25/25 tests pass; `buildStorefrontModule` now throws a clear error if `productRepository` is omitted (fail-closed, matching the module's other required-dependency conventions).
- **Committed in:** `66f6e8df` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues required to complete the plan's own stated goal). No scope creep; no architectural changes.
**Impact on plan:** Both fixes were necessary to land a working, guardrail-compliant module exactly matching the plan's own explicit instructions.

## Issues Encountered

- **Shared, non-isolated git working directory:** this plan executed directly against the main `feat/DGFY-108-refactor` checkout (not an isolated git worktree, despite the dispatch prompt's `<parallel_execution>` framing), concurrently with at least two other wave-2 agents (10-05 PayMongo landlord payment layer, 10-07 Availment `source_reference`) actively staging/committing their own files in the same index. Handled by staging and committing ONLY this plan's own files via pathspec-scoped `git commit -- <files>` (never a blanket `git commit`/`git add -A`), confirmed after each commit via `git status --short` that no other agent's staged/untracked files were touched. The full-repo architecture-guardrail pre-commit hook transiently failed once because a concurrent agent's `commercePayments` module was mid-build (missing `index.js`/`README.md`); resolved by a short bounded poll (no files of mine changed) until that agent's own commit completed the module, then retrying.

## Next Phase Readiness

- `apps/dgfy-api/src/modules/storefront` module skeleton (routes/controllers/usecases/repository) is ready for 10-04 (guest/account checkout, stock reservation) to extend with authenticated/write routes on the same router, and for 10-06 (order finalization + payment) to import `validateCart` directly.
- Composition-root mounting (`apps/dgfy-api/src/routes/index.js`'s `router.use('/storefront', createStorefrontRoutes(...))`) is intentionally NOT done in this plan — deferred to whichever of 10-04/10-06 first needs the routes live, per the plan's own staged-composition-split precedent (mirrors 08-03 building modules in isolation before 08-08's composition wave).
- No blockers. Discovery's `category`/`openNow` filters will start returning filtered results automatically once a later plan's projection syncer populates `search_snapshot.category`/`location_snapshot.open_now` — no code change needed on this plan's side when that lands.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*
