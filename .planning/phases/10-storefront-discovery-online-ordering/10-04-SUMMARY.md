---
phase: 10-storefront-discovery-online-ordering
plan: 04
subsystem: api
tags: [express, sequelize, mysql, email-otp, guest-identity, storefront, checkout]

# Dependency graph
requires:
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-01: dgfy_core.storefront_guest_identities table + StorefrontGuestIdentity model (verified_email UNIQUE)"
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-03: apps/dgfy-api/src/modules/storefront module skeleton (index.js/routes.js/controllers/repositories/usecases)"
provides:
  - "requestGuestOtp/verifyGuestOtp — guest email-OTP checkout verification reusing infra/emailOtp.js's new STOREFRONT_GUEST_CHECKOUT purpose"
  - "guestIdentityRepository.upsertByVerifiedEmail() — one persistent landlord guest identity per verified email (D-06), race-safe against the unique index"
  - "resolveCheckoutIdentity({authenticatedAccountId, guestIdentityId}) -> {customer_account_id} | {guest_identity_id} — exported at the top level of buildStorefrontModule() for placeOrder (10-06) to reuse directly"
  - "storefront module mounted under /storefront in apps/dgfy-api/src/routes/index.js (composition root)"
affects: [10-06-order-finalization-payment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "emailOtp.js purpose extension: additive-only enum + label map entry, existing hashing/TTL/attempt-limit/enforcement logic never touched"
    - "Race-safe upsert-by-unique-email: find-then-create, catch SequelizeUniqueConstraintError/ER_DUP_ENTRY on create(), re-select the winner's row (mirrors shiftRepository.js's/complianceModeStateRepository.js's isUniqueConstraintViolation() duplication convention, applied here as catch-and-reselect instead of catch-and-reject)"
    - "Optional-auth middleware wrapper: buildOptionalAuthenticateAccount(authenticateAccount) hands the REQUIRED accountAuthMiddleware a stand-in `res` object so its 401 failure path routes into next() (guest path) instead of terminating the request — success path is untouched (still sets req.account, still calls the real next)"

key-files:
  created:
    - apps/dgfy-api/src/modules/storefront/repositories/guestIdentityRepository.js
    - apps/dgfy-api/src/modules/storefront/usecases/guestCheckoutUseCases.js
    - apps/dgfy-api/src/modules/storefront/controllers/guestCheckoutController.js
    - apps/dgfy-api/tests/storefront/guestCheckout.test.js
  modified:
    - apps/dgfy-api/src/infra/emailOtp.js
    - apps/dgfy-api/src/modules/storefront/index.js
    - apps/dgfy-api/src/modules/storefront/routes.js
    - apps/dgfy-api/src/modules/storefront/README.md
    - apps/dgfy-api/src/routes/index.js
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "resolveCheckoutIdentity is a pure, presence-based function (no DB re-verification of guestIdentityId) — the caller (10-06's placeOrder, or this plan's own POST /storefront/checkout/identity route) is responsible for having already obtained a verified guest_identity_id from verifyGuestOtp; matching the plan's must_haves key_link, resolveCheckoutIdentity's contract is 'account present -> customer_account_id, else guest identity present -> guest_identity_id, else reject' with no additional DB round-trip"
  - "emailOtp errors are returned to the caller UNWRAPPED (ApplicationResult.failure(error) with the raw Error emailOtp.js throws) rather than re-mapped to a DomainError — ApplicationResult already accepts any {code,message,statusCode}-shaped error per its own doc comment, so re-wrapping would only lose the exact EMAIL_OTP_* code/status emailOtp.js already computed"
  - "Added a third route, POST /storefront/checkout/identity, backed by an optional-auth middleware — the plan's Task 2 action text ('Mount the checkout routes so the account path can pass through the existing authenticateAccount middleware optionally') and files_modified list (guestCheckoutController.js) implied a real HTTP surface for the account-optional path, not just an internal export; this gives must_haves truth #3 ('a logged-in DGFY Account can check out... account is optional, never forced') a concrete, testable HTTP route today, while resolveCheckoutIdentity is ALSO exported at the module's top level for 10-06 to call directly without an HTTP round-trip"
  - "Composition-root mounting (apps/dgfy-api/src/routes/index.js's router.use('/storefront', ...)) done in THIS plan, not deferred further — 10-03-SUMMARY.md explicitly left this to 'whichever of 10-04/10-06 first needs the routes live'; 10-04 needs the guest OTP + optional-auth routes live to be testable/usable end-to-end, so it claims that composition step now (Rule 3 deviation, see below)"

requirements-completed: [STF-03]

coverage:
  - id: D1
    description: "A guest can request + verify an email OTP and receive a persistent guest_identity_id, reusing infra/emailOtp.js's existing hashing/TTL/attempt-limit/enforcement (STF-03, D-05)"
    requirement: "STF-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/guestCheckout.test.js#buildGuestCheckoutUseCases > requestGuestOtp"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/guestCheckout.test.js#buildGuestCheckoutUseCases > verifyGuestOtp"
        status: pass
    human_judgment: false
  - id: D2
    description: "A repeat guest with the same verified email maps to ONE persistent landlord guest identity across orders, race-safe against concurrent first-orders (D-06, T-10-04-03)"
    requirement: "STF-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/guestCheckout.test.js#GuestIdentityRepository > upsertByVerifiedEmail"
        status: pass
    human_judgment: false
  - id: D3
    description: "checkout identity resolves to customer_account_id (account) OR guest_identity_id (guest) — an application-level cross-DB reference, never both, never forcing account creation"
    requirement: "STF-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/storefront/guestCheckout.test.js#buildGuestCheckoutUseCases > resolveCheckoutIdentity"
        status: pass
    human_judgment: false
  - id: D4
    description: "The two guest OTP routes and the optional-auth checkout-identity route are live and mounted under /storefront, wired to the exact same productRepository/authenticateAccount instances the rest of the app already shares"
    verification:
      - kind: integration
        ref: "manual smoke: NODE_ENV=test node -e \"import('./src/routes/index.js')...\" confirms router loads and a /storefront/* layer is present (no live MySQL/SMTP required for module composition itself)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 04: Storefront Guest-or-Account Checkout Identity Summary

**Guest email-OTP checkout verification (reusing `infra/emailOtp.js`'s new `STOREFRONT_GUEST_CHECKOUT` purpose), a persistent landlord-side guest identity keyed by verified email (D-06, race-safe against concurrent first-orders), and `resolveCheckoutIdentity` — the account-optional "who is ordering" resolution `placeOrder` (10-06) will consume — now live under `/storefront`.**

## Performance

- **Duration:** 45 min
- **Tasks:** 2 (Task 2 executed as TDD: RED then GREEN)
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- `infra/emailOtp.js`: additive `STOREFRONT_GUEST_CHECKOUT` purpose + label — no change to the existing hashing/TTL/attempt-limit/single-active-OTP/enforcement logic, picked up automatically by `isValidPurpose()`.
- `guestIdentityRepository.upsertByVerifiedEmail()`: finds-or-creates ONE `storefront_guest_identities` row per verified email (D-06), refreshing `phone`/`display_name`/`last_order_at` on every verify. Race-safe against the model's unique index (T-10-04-03) — a concurrent first-order's unique-constraint violation on `create()` is caught and re-resolved by re-selecting the winner's row, so two simultaneous first-time guests with the same email collapse onto one identity instead of erroring.
- `buildGuestCheckoutUseCases`: `requestGuestOtp`/`verifyGuestOtp` delegate to `emailOtp.requestEmailOtp`/`verifyEmailOtp` with the new purpose (email format/purpose validation, 503 `EMAIL_OTP_DELIVERY_UNAVAILABLE` when SMTP is unconfigured, all inherited unchanged); `verifyGuestOtp` only upserts the guest identity AFTER the OTP is actually consumed — a wrong/expired code never creates or touches an identity. `resolveCheckoutIdentity` returns `{customer_account_id}` when an authenticated account is present (always wins, even if a `guestIdentityId` is also supplied — an account is never also forced through the guest path), else `{guest_identity_id}` when present, else 401 `CHECKOUT_IDENTITY_REQUIRED`.
- Routes mounted under `/storefront`: `POST /guest/otp/request`, `POST /guest/otp/verify` (both public, rate-limited via a dedicated `guestOtpLimiter`, T-10-04-01), and `POST /checkout/identity` behind a new `buildOptionalAuthenticateAccount()` wrapper — attaches `req.account` when a valid bearer is present, otherwise silently falls through to the guest path (never blocks a guest-only request with a 401).
- `buildStorefrontModule()` now requires a `storefrontGuestIdentityModel` alongside `productRepository`, wires `guestIdentityRepository` + `emailOtp` into the new use cases, and exposes `resolveCheckoutIdentity` at the top level (alongside `validateCart`) for 10-06 to import directly.
- `apps/dgfy-api/src/routes/index.js` composition root mounts the storefront module under `/storefront` for the first time (Rule 3 — see Deviations), reusing the same `productRepository`/`authenticateAccount` instances every other module already shares, plus a new `StorefrontGuestIdentity` model against this service's own `dgfy_core` connection.
- 19/19 new tests passing (44/44 across the whole `tests/storefront/` suite); 650 total (457 passed, 193 skipped live-DB-gated) with zero regressions across the full `apps/dgfy-api` suite.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add storefront guest-checkout OTP purpose + guest identity repository** - `89e25a4e` (feat)
2. **Task 2: Guest OTP request/verify + checkout identity resolution usecases + routes** (TDD):
   - RED - `97d2aec4` (test) — confirmed failing: `Cannot find module '.../usecases/guestCheckoutUseCases.js'`
   - GREEN - `43bd0c78` (feat) — 19/19 tests passing (44/44 storefront suite)
3. **README doc fix** - `a147952f` (docs) — Rule 1 fix, see Deviations

**Plan metadata:** committed separately (see final commit below).

## Files Created/Modified

- `apps/dgfy-api/src/infra/emailOtp.js` - Additive `STOREFRONT_GUEST_CHECKOUT` purpose + label
- `apps/dgfy-api/src/modules/storefront/repositories/guestIdentityRepository.js` - Race-safe `upsertByVerifiedEmail()` / `findByEmail()` over the landlord `storefront_guest_identities` table
- `apps/dgfy-api/src/modules/storefront/usecases/guestCheckoutUseCases.js` - `requestGuestOtp` / `verifyGuestOtp` / `resolveCheckoutIdentity`
- `apps/dgfy-api/src/modules/storefront/controllers/guestCheckoutController.js` - Transport-only controller for the three new routes
- `apps/dgfy-api/src/modules/storefront/routes.js` - Guest OTP + checkout-identity routes, `guestOtpLimiter`, `buildOptionalAuthenticateAccount()`
- `apps/dgfy-api/src/modules/storefront/index.js` - `buildStorefrontModule()` now wires `guestIdentityRepository` + `emailOtp`, exposes `resolveCheckoutIdentity` at the top level
- `apps/dgfy-api/src/modules/storefront/README.md` - Documents the new endpoints + D-05/D-06 guest identity behavior; corrects the stale "mounting deferred" claim
- `apps/dgfy-api/src/routes/index.js` - Mounts `createStorefrontRoutes()` under `/storefront` (composition root)
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Registers `guestCheckoutController.js` (matches every prior phase's `*Controller.js` precedent)
- `apps/dgfy-api/tests/storefront/guestCheckout.test.js` - `GuestIdentityRepository` + `buildGuestCheckoutUseCases` unit tests (19 tests, mocked Sequelize model + mocked `emailOtp` module shape, no live dgfy_core/SMTP)

## Decisions Made

- `resolveCheckoutIdentity` is a pure, presence-based function — it does not re-verify `guestIdentityId` against the DB. The caller is responsible for having obtained a verified `guest_identity_id` from `verifyGuestOtp` first; this matches the plan's own contract literally ("returns `{guest_identity_id}` when a verified guest identity is present") and keeps the function usable synchronously-fast from both the new HTTP route and 10-06's `placeOrder`.
- `emailOtp`'s thrown errors are passed through to `ApplicationResult.failure()` unwrapped rather than re-mapped to a `DomainError` — `ApplicationResult` already accepts any `{code,message,statusCode}`-shaped error (per its own doc comment), so re-wrapping would only lose the exact `EMAIL_OTP_*` code/status `emailOtp.js` already computed (e.g. `EMAIL_OTP_DELIVERY_UNAVAILABLE` / 503, `EMAIL_OTP_INVALID` / 422).
- Added `POST /storefront/checkout/identity` as a real HTTP route (not just an internal export) — the plan's Task 2 action text explicitly said to "mount the checkout routes so the account path can pass through the existing `authenticateAccount` middleware optionally," and `guestCheckoutController.js` was listed in `files_modified`. This gives must_haves truth #3 a concrete, testable HTTP surface today. `resolveCheckoutIdentity` is ALSO exported at `buildStorefrontModule()`'s top level so 10-06 can call it directly in-process without an HTTP round-trip during order placement.
- `buildOptionalAuthenticateAccount()` intercepts the REQUIRED `authenticateAccount` middleware's failure path by handing it a stand-in `res` object (`{status: () => self, json: () => next()}`) instead of duplicating any JWT-verification logic — the success path is completely untouched (still sets `req.account`, still calls the real `next`), so there is exactly one place `dgfy_account_session` bearer tokens are ever verified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mounted the storefront module in `apps/dgfy-api/src/routes/index.js`'s composition root**
- **Found during:** Task 2 (routes/controller wiring)
- **Issue:** `10-03-SUMMARY.md` explicitly left composition-root mounting ("`router.use('/storefront', createStorefrontRoutes(...))`") to "whichever of 10-04/10-06 first needs the routes live" — but this plan's own `files_modified` list omitted `apps/dgfy-api/src/routes/index.js`, even though the guest OTP + optional-auth routes cannot be exercised end-to-end (or by 10-06 later) without it.
- **Fix:** Added the `StorefrontGuestIdentity` model construction + `buildStorefrontModule()` composition + `router.use('/storefront', ...)` line, reusing the exact same `productRepository`/`authenticateAccount` instances every other module in that file already shares — never a second, divergent set.
- **Files modified:** `apps/dgfy-api/src/routes/index.js`
- **Verification:** `NODE_ENV=test node -e "import('./src/routes/index.js')..."` confirms the router loads without error and a `/storefront/*` layer is present; `check:architecture:dgfy-api` passes (`OK. Checked 11 modules and 105 code files.`)
- **Committed in:** `43bd0c78` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Registered `guestCheckoutController.js` in the controller-naming allowlist**
- **Found during:** Task 2 commit (pre-commit architecture guardrail)
- **Issue:** Same repo-wide guardrail 10-03 hit for `discoveryController.js` — controller files must either be named `*Handlers.js` or be explicitly allowlisted.
- **Fix:** Added `guestCheckoutController.js` to `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST`, matching the precedent set by every prior controller in this service.
- **Files modified:** `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- **Verification:** `check:architecture:dgfy-api` passes.
- **Committed in:** `43bd0c78` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Fixed stale README.md claim about deferred composition-root mounting**
- **Found during:** Post-implementation doc review
- **Issue:** `storefront/README.md` stated "Mounting under `/storefront`... is a later plan's scope (10-04/10-06), not this module's" — no longer true once this plan mounted it, and leaving it would mislead a future reader (e.g. 10-06's own executor) into thinking the module still isn't wired up.
- **Fix:** Updated README.md with the new endpoints list and a "Guest checkout identity (STF-03, D-05, D-06)" section describing the race-safety/optional-account contract.
- **Files modified:** `apps/dgfy-api/src/modules/storefront/README.md`
- **Verification:** N/A (doc-only)
- **Committed in:** `a147952f` (separate docs commit, after the GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 — blocking issues required to land a live, guardrail-compliant module; 1 Rule 1 — stale doc fix). No scope creep; no architectural changes.
**Impact on plan:** All three fixes were necessary either to make the plan's own stated goal (a working, testable guest-or-account checkout identity surface) actually reachable, or to keep documentation truthful after doing so.

## Issues Encountered

- The plan's stated Task 2 `<verify>` command (`cd apps/dgfy-api && npx jest tests/storefront/guestCheckout.test.js`) fails with `SyntaxError: Cannot use import statement outside a module` — this project's `package.json` `test` script requires `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` for ESM support; plain `npx jest` doesn't pick that up. Same friction exists for every other `tests/storefront/*.test.js` file (confirmed against 10-03's `discovery.test.js`/`cartValidation.test.js` too — pre-existing, not introduced here). Verified instead via `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/storefront/guestCheckout.test.js` (19/19 passing) and the full suite (650 total, 457 passed, 193 skipped, 0 failed).

## User Setup Required

None - no external service configuration required. `EMAIL_OTP_SECRET`/`EMAIL_OTP_TTL_MINUTES`/`EMAIL_OTP_MAX_ATTEMPTS`/`EMAIL_OTP_ENFORCEMENT_ENABLED` and SMTP config are all pre-existing `infra/emailOtp.js`/`emailService.js` environment variables, unchanged by this plan.

## Next Phase Readiness

- `resolveCheckoutIdentity` is exported at `buildStorefrontModule()`'s top level (alongside `validateCart`) for 10-06's `placeOrder` use case to import and call directly — no HTTP round-trip required.
- `guestIdentityRepository` is available via `buildStorefrontModule()`'s return value (`.guestIdentityRepository`) if 10-06 needs additional guest-identity lookups (e.g. `findByEmail`) beyond what `resolveCheckoutIdentity` covers.
- The guest OTP + checkout-identity routes are live and reachable under `/storefront` today — 10-06 can add its own checkout/order-placement routes on the SAME router (`createStorefrontRoutes()`) without any further composition-root plumbing.
- No blockers. `commerce_payment_sessions`/`storefront_orders` (10-01) and the discovery/cart-validation surface (10-03) are the remaining pieces 10-06 assembles into a full checkout flow.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*

## Self-Check: PASSED

- All 11 created/modified files confirmed present on disk
- All 5 commits (`89e25a4e`, `97d2aec4`, `43bd0c78`, `a147952f`, `014cbe49`) confirmed in `git log`
- 19/19 new tests pass (44/44 across `tests/storefront/`); full `apps/dgfy-api` suite: 650 total, 457 passed, 193 skipped (live-DB-gated), 0 failed
- `check:architecture:dgfy-api` passes (11 modules, 105 code files checked; 15 controller files, no unauthorized model imports)
- `git diff --stat` against the pre-plan commit confirms zero `backend/` writes
