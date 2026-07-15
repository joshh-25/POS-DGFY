---
phase: 10-storefront-discovery-online-ordering
fixed_at: 2026-07-13T14:14:51Z
review_path: .planning/phases/10-storefront-discovery-online-ordering/10-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-07-13T14:14:51Z
**Source review:** .planning/phases/10-storefront-discovery-online-ordering/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (4 Critical, 5 Warning)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: `reserveStock` composition-root wiring mismatch — stock reservation silently no-ops on every real checkout

**Files modified:** `apps/dgfy-api/src/routes/index.js`, `apps/dgfy-api/tests/integration/storefront/placeOrderReservationWiring.test.js`
**Commit:** `50cd7867`
**Applied fix:** Wired `buildStorefrontModule`'s `reserveStock`/`releaseReservation`/`setReservationExpiry` to the raw `InventoryReservationRepository` methods (exposed via `buildInventoryModule()`'s `reservationRepository` return value, already present) instead of `inventoryReservationPorts.*` (the staff-membership-gated `buildReserveStockUseCase` usecase wrappers). `reserveStock` required a thin positional-args adapter since the repository method takes `(businessId, lines, referenceId, expiresAt)` positionally while `placeOrderUseCases.js` calls it with a single options object — a mismatch the review's own doc-comment citation implied was already resolved but wasn't. Added a new integration test (`placeOrderReservationWiring.test.js`) that composes the REAL module graph — `buildInventoryModule()` -> `buildStorefrontModule()` using the exact same wiring `routes/index.js` now uses — and asserts `InventoryReservation.create()` is actually invoked with the correct row, rather than injecting hand-rolled fakes like the existing `placeOrder.test.js`/`storefrontE2E.test.js` suites do. Verified this new test fails (with a TypeError surfaced by the still-broken `buildReserveStockUseCase`, see WR-01 below) when the wiring is reverted to the buggy `inventoryReservationPorts.reserveStock`, then restored and confirmed green.

### CR-02: `InventoryReservationRepository` held-stock queries omit `product_id`, corrupting availability across every product in a tenant

**Files modified:** `apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js`
**Commit:** `5a7ae51c`
**Applied fix:** Added `product_id: Number(productId)` (or `Number(line.productId)`) to both held-sum `where` clauses (`availableToSell()` and `reserveStock()`'s per-line oversell guard), replacing the raw `sequelize.literal(...)`/`sequelize.where(..., Op.gt, 0)` boolean-as-integer idiom with a plain Sequelize `where` object using `Op.or`/`Op.gt` (this same change also resolves WR-03 below — both findings pointed at the identical two code blocks). Verified via the rewritten `tests/inventory/inventoryReservation.test.js` (WR-01) which asserts the held-sum query is called with `product_id` in its `where` clause.

### CR-03: Guest checkout accepts a client-supplied `guestIdentityId` without verifying it belongs to an OTP-verified session

**Files modified:** `apps/dgfy-api/src/modules/storefront/repositories/guestIdentityRepository.js`, `apps/dgfy-api/src/modules/storefront/usecases/guestCheckoutUseCases.js`, `apps/dgfy-api/tests/storefront/guestCheckout.test.js`, `apps/dgfy-api/tests/storefront/storefrontE2E.test.js`
**Commit:** `a9823cee`
**Applied fix:** Added `GuestIdentityRepository.findById(id)`. `resolveCheckoutIdentity` now looks up a supplied `guestIdentityId` via this method and returns a 401 `GUEST_IDENTITY_NOT_VERIFIED` `ApplicationResult.failure` when it does not resolve to a real row, instead of trusting the bare client-supplied id. Updated existing test fixtures (`makeGuestIdentityRepository` in both `guestCheckout.test.js` and `storefrontE2E.test.js`) to provide a `findById` mock matching their fixture guest ids, and added dedicated unit tests for both the repository method and the new rejection path (including a regression test proving a leaked/guessed id is now rejected).

### CR-04: Webhook finalize/failure paths write to `commerce_payment_sessions` columns that don't exist — audit data silently dropped

**Files modified:** `apps/dgfy-migration-runner/src/migrations/schema/20260714104000-add-commerce-payment-session-audit-fields.cjs` (new), `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`, `apps/dgfy-migration-runner/tests/phase10StorefrontCommerceSchema.test.js`, `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js`
**Commit:** `411484d0`
**Applied fix:** Added a new additive migration creating nullable `provider_event_id VARCHAR(191)` and `failure_reason TEXT` columns on `commerce_payment_sessions` (landlord `dgfy_core`, `targetKind: 'core'`, guarded with `describeTable()` checks). Updated the `CommercePaymentSession` Sequelize model and `dgfyCoreContract.js`'s column list to match, so `finalizePaidOrderUseCases.js`'s and `handleWebhookUseCases.js`'s existing `updateSessionStatus(...)` calls (unchanged — they already attempted to write these fields) now actually persist instead of being silently dropped by Sequelize. Added a no-DB structural contract test asserting both columns are documented; the file's existing live-MySQL-gated integration test picks up the new migration automatically since it runs the full migration set.

## Fixed Issues (Warnings)

### WR-01: `tests/inventory/inventoryReservation.test.js` contains no real assertions — every test is a placeholder

**Files modified:** `apps/dgfy-api/tests/inventory/inventoryReservation.test.js`, `apps/dgfy-api/src/modules/inventory/usecases/inventoryReservationUseCases.js`
**Commit:** `47eee7dc`
**Applied fix:** Rewrote the entire suite to construct a real `InventoryReservationRepository` against a mocked `TenantConnector`/`BusinessDatabaseRegistryRepository` (no live MySQL) and build the real `inventoryReservationUseCases.js` builders closed over it, asserting real outcomes (computed `availableToSell` values, exact rows passed to `InventoryReservation.create()`/`update()`, thrown/returned `ApplicationResult` errors and status codes, `businessRepository.getMembership` access-control gating, and the `product_id`-scoped `where` clause from CR-02). While writing real assertions for the "Error handling" branches, discovered and fixed a previously-undetected production bug: every error branch in `inventoryReservationUseCases.js` called the non-existent `ApplicationResult.error(...)` (the class only exposes `.success()`/`.failure()`), which threw a raw `TypeError` instead of returning a graceful failure result — 21 call sites across all 6 usecase builders. Fixed by replacing every `ApplicationResult.error(` with `ApplicationResult.failure(`. Verified the new tests fail (11 of 24) when this bug is reintroduced, and that the CR-01 regression test surfaces the exact same `TypeError` when the composition root is reverted to wire `inventoryReservationPorts.reserveStock` — direct evidence this was the class of bug WR-01's own fix intent (real test coverage) was meant to catch.

### WR-02: Hardcoded fallback secret for OTP code hashing

**Files modified:** `apps/dgfy-api/src/infra/emailOtp.js`, `apps/dgfy-api/tests/unit/infra/emailOtp.test.js` (new)
**Commit:** `c8c1d824`
**Applied fix:** `getHashSecret()` now fails closed: outside `development`/`test` `NODE_ENV`, if none of `EMAIL_OTP_SECRET`/`JWT_SECRET`/`REFRESH_TOKEN_SECRET` are configured it throws a `500 EMAIL_OTP_SECRET_NOT_CONFIGURED` error rather than silently falling back to the static `'email_otp_local_fallback_change_me'` string. The static fallback is still used in `development`/`test` for local-dev convenience. Exported `getHashSecret` for direct unit testing; added 6 tests covering the precedence order, the preserved dev/test fallback, and the new fail-closed behavior in `production`/`staging`.

### WR-03: Fragile boolean-literal-as-integer-comparison SQL pattern for reservation availability

**Files modified:** `apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js`
**Commit:** `5a7ae51c` (same commit as CR-02 — both findings pointed at the identical two code blocks; fixing CR-02's missing `product_id` filter and WR-03's fragile literal/`Op.gt`-as-boolean idiom required touching the exact same lines simultaneously, so they were fixed and committed together)
**Applied fix:** See CR-02 above — the raw `sequelize.literal(...)`/`sequelize.where(..., sequelize.Op.gt, 0)` construction was replaced with a plain Sequelize `where` object in both held-sum queries.

### WR-04: Inconsistent indentation and out-of-order step comments in `finalizeStorefrontOrder`

**Files modified:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`
**Commit:** `fa9de503`
**Applied fix:** Reformatted the `try { return await sequelize.transaction(...) } catch (error) { ... }` block to the file's existing 4-space indentation convention (it was previously indented one level too deep, with the transaction executor's closing `});` and the `catch` misaligned relative to their openers). Relabeled the inline step comments in actual execution order: (a) idempotent lookup, (b) create Availment, (c) AvailmentItem lines (previously unlabeled), (d) reservation -> sale commit, (e) Payment row (previously labeled `(c)` and positioned before `(d)` in the comments despite executing after it). Pure formatting/comment change — no logic touched; confirmed via `tests/availments/storefrontFinalize.test.js` (all 15 tests unchanged and passing) and `node -c` syntax check.

### WR-05: `buildOptionalAuthenticateAccount` can potentially invoke `next()` twice

**Files modified:** `apps/dgfy-api/src/modules/storefront/routes.js`, `apps/dgfy-api/tests/storefront/optionalAuthenticateAccount.test.js` (new)
**Commit:** `daadcd6b`
**Applied fix:** Added a `nextCalled` boolean flag and a `guardedNext()` wrapper that every code path (the success path passed into `authenticateAccount`, the `passthroughRes.json()` failure interception, and the `.catch()` handler) now routes through exclusively, so `next()` can fire at most once per request even if `authenticateAccount`'s success path calls `next()` synchronously and its returned promise later rejects for an unrelated reason. Exported `buildOptionalAuthenticateAccount` for direct unit testing (previously untested). Added 5 tests, including a regression test that reproduces the exact double-`next()` scenario the finding described; confirmed this test fails (2 calls instead of 1) against the pre-fix implementation and passes after the fix.

## Skipped Issues

None — all 9 in-scope findings were fixed.

## Notes for the developer

- **`ApplicationResult.error` bug (discovered during WR-01):** every failure branch of the 6 usecase builders in `apps/dgfy-api/src/modules/inventory/usecases/inventoryReservationUseCases.js` was calling a non-existent static method (`ApplicationResult.error` — only `.success()`/`.failure()` exist), causing a raw `TypeError` on any error path instead of a graceful `ApplicationResult.failure()`. This was fixed as part of WR-01 (it directly blocked writing meaningful real-assertion tests for those error branches) rather than filed as a separate finding, since it wasn't in REVIEW.md's scope but was directly uncovered while executing WR-01's own fix intent. It is documented here for visibility since it's a genuine correctness fix beyond REVIEW.md's original 9 findings.
- **`buildExpireDueReservationsUseCase`'s unusual double-async-wrapper shape** (returns an async function that resolves to ANOTHER async function taking `businessId`) was left as-is — it is not currently wired to any route in `routes/index.js`'s composition root (`reservationPorts.expireDueReservations` is built but never consumed), was not flagged by any REVIEW.md finding, and reshaping it was out of scope for this fix pass. Real tests were still written against its current (unusual) shape as part of WR-01.
- All fixes were verified against the full `apps/dgfy-api` Jest suite (561 tests passed, 193 skipped — the skipped suites are gated behind `LIVE_TENANT_DB`/similar env flags requiring a real MySQL instance, unrelated to this session) plus the `apps/dgfy-migration-runner` schema-contract suite.
- During verification, an environment-specific false-positive was hit and worked around (not a code issue): macOS resolves `/tmp` through a `/private/tmp` symlink, and the `apps/dgfy-api` architecture-guardrail pre-commit hook's Node ESM `import.meta.url`-based path resolution silently disagreed with the shell's `$PWD`-based path resolution when operating from a `/tmp`-rooted git worktree, producing spurious "controller naming" violations for files that are actually allowlisted. Running from the resolved `/private/tmp/...` path avoided the mismatch; no source files were changed for this.

---

_Fixed: 2026-07-13T14:14:51Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
