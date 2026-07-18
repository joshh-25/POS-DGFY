---
phase: 10-storefront-discovery-online-ordering
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 64
files_reviewed_list:
  - apps/dgfy-api/src/app.js
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/config/env.js
  - apps/dgfy-api/src/infra/emailOtp.js
  - apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js
  - apps/dgfy-api/src/models/Landlord/StorefrontGuestIdentity.js
  - apps/dgfy-api/src/models/Landlord/StorefrontOrder.js
  - apps/dgfy-api/src/models/Tenant/Availment.js
  - apps/dgfy-api/src/models/Tenant/InventoryReservation.js
  - apps/dgfy-api/src/models/Tenant/Payment.js
  - apps/dgfy-api/src/modules/availments/index.js
  - apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js
  - apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js
  - apps/dgfy-api/src/modules/commercePayments/controllers/webhookController.js
  - apps/dgfy-api/src/modules/commercePayments/index.js
  - apps/dgfy-api/src/modules/commercePayments/README.md
  - apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js
  - apps/dgfy-api/src/modules/commercePayments/routes.js
  - apps/dgfy-api/src/modules/commercePayments/services/payMongoClient.js
  - apps/dgfy-api/src/modules/commercePayments/usecases/createQrphSessionUseCases.js
  - apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js
  - apps/dgfy-api/src/modules/commercePayments/usecases/handleWebhookUseCases.js
  - apps/dgfy-api/src/modules/commercePayments/usecases/retryFinalizationUseCases.js
  - apps/dgfy-api/src/modules/inventory/index.js
  - apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryReservationUseCases.js
  - apps/dgfy-api/src/modules/storefront/controllers/checkoutController.js
  - apps/dgfy-api/src/modules/storefront/controllers/discoveryController.js
  - apps/dgfy-api/src/modules/storefront/controllers/guestCheckoutController.js
  - apps/dgfy-api/src/modules/storefront/index.js
  - apps/dgfy-api/src/modules/storefront/README.md
  - apps/dgfy-api/src/modules/storefront/repositories/guestIdentityRepository.js
  - apps/dgfy-api/src/modules/storefront/repositories/storefrontDiscoveryRepository.js
  - apps/dgfy-api/src/modules/storefront/repositories/storefrontOrderRepository.js
  - apps/dgfy-api/src/modules/storefront/routes.js
  - apps/dgfy-api/src/modules/storefront/usecases/cartValidation.js
  - apps/dgfy-api/src/modules/storefront/usecases/getOrderStatusUseCases.js
  - apps/dgfy-api/src/modules/storefront/usecases/getStorePageUseCases.js
  - apps/dgfy-api/src/modules/storefront/usecases/guestCheckoutUseCases.js
  - apps/dgfy-api/src/modules/storefront/usecases/placeOrderUseCases.js
  - apps/dgfy-api/src/modules/storefront/usecases/schedulingValidation.js
  - apps/dgfy-api/src/modules/storefront/usecases/searchDiscoveryUseCases.js
  - apps/dgfy-api/src/routes/index.js
  - apps/dgfy-api/tests/availments/storefrontFinalize.test.js
  - apps/dgfy-api/tests/commercePayments/createQrphSession.test.js
  - apps/dgfy-api/tests/commercePayments/payMongoClient.test.js
  - apps/dgfy-api/tests/commercePayments/webhookFinalize.test.js
  - apps/dgfy-api/tests/inventory/inventoryReservation.test.js
  - apps/dgfy-api/tests/storefront/cartValidation.test.js
  - apps/dgfy-api/tests/storefront/discovery.test.js
  - apps/dgfy-api/tests/storefront/guestCheckout.test.js
  - apps/dgfy-api/tests/storefront/placeOrder.test.js
  - apps/dgfy-api/tests/storefront/scheduling.test.js
  - apps/dgfy-api/tests/storefront/storefrontE2E.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260714100000-create-storefront-commerce-landlord.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260714101000-enable-storefront-discovery-geo-search.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260714102000-create-inventory-reservations.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js
  - apps/dgfy-migration-runner/tests/dgfyCoreSchema.test.js
  - apps/dgfy-migration-runner/tests/phase10AvailmentSourceReferenceSchema.test.js
  - apps/dgfy-migration-runner/tests/phase10InventoryReservationSchema.test.js
  - apps/dgfy-migration-runner/tests/phase10StorefrontCommerceSchema.test.js
findings:
  critical: 4
  warning: 5
  info: 0
  total: 9
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 64
**Status:** issues_found

## Summary

Phase 10 (storefront discovery + online ordering) is a large, carefully-documented body of work with strong discipline around Clean Architecture layering, idempotency, and defensive error handling in the code that was actually exercised by its own unit tests. However, tracing the **composition root** (`apps/dgfy-api/src/routes/index.js`) against what `placeOrderUseCases.js` actually expects reveals that the single most important guarantee of this phase — that a storefront order actually reserves stock (D-07/D-09) before payment — is broken in production wiring: the injected `reserveStock` port is the wrong layer (a staff-membership-gated use case instead of the raw repository port `placeOrderUseCases.js`'s own doc comments say it requires), so every real checkout silently skips stock reservation. This is compounded by a second, independent bug in the reservation repository itself (a missing `product_id` filter that would have corrupted availability computation even if the wiring were correct), and neither is caught by tests because `tests/inventory/inventoryReservation.test.js` contains only placeholder `toBeDefined()` assertions that never invoke the real code, and `tests/storefront/placeOrder.test.js`/`storefrontE2E.test.js` inject their own hand-written fakes that match the (correct) repository shape rather than the (actually-wired) use-case shape.

A separate, independent issue was found in the guest-checkout identity flow: `resolveCheckoutIdentity` accepts a client-supplied `guestIdentityId` and treats it as authoritative without ever verifying that identity belongs to the current OTP-verified session, undermining the D-05/D-06 "guest is email-OTP verified" guarantee that the rest of the phase's documentation repeatedly claims is enforced.

A fourth finding: the webhook finalize path writes `provider_event_id`/`failure_reason` fields onto `commerce_payment_sessions` rows that do not exist on the model or the migration/schema contract — Sequelize silently drops these writes, so audit/dedup data operators would rely on during an incident is never actually persisted.

## Critical Issues

### CR-01: `reserveStock` composition-root wiring mismatch — stock reservation silently no-ops on every real checkout

**File:** `apps/dgfy-api/src/routes/index.js:181-191` (wiring), `apps/dgfy-api/src/modules/inventory/index.js:107-114` (the wrong layer is exposed), `apps/dgfy-api/src/modules/inventory/usecases/inventoryReservationUseCases.js:112-163` (`buildReserveStockUseCase`), `apps/dgfy-api/src/modules/storefront/usecases/placeOrderUseCases.js:118-137, 337-356` (the call site + its own doc comment describing the *intended* contract)

**Issue:**
`placeOrderUseCases.js`'s own doc comment (lines 118-137) states explicitly that `reserveStock`/`releaseReservation`/`setReservationExpiry` are "thin PORT functions matching `InventoryReservationRepository`'s own method signatures directly" and deliberately bypass `10-02`'s `buildReserveStockUseCase` wrapper because that wrapper gates on a staff-or-owner `businessRepository.getMembership(accountId, businessId)` check that "has no meaning for a consumer storefront order."

But the actual composition root wires the opposite of what's documented:

```js
// apps/dgfy-api/src/modules/inventory/index.js
reservationPorts: {
    reserveStock: buildReserveStockUseCase({ repository: reservationRepository, businessRepository }),
    ...
}

// apps/dgfy-api/src/routes/index.js
const { useCases: storefrontUseCases } = buildStorefrontModule({
    ...
    reserveStock: inventoryReservationPorts.reserveStock,   // <-- the USE CASE wrapper, not the repository
    ...
});
```

`buildReserveStockUseCase` (`inventoryReservationUseCases.js:112-163`) requires `businessId` **and** `accountId`, and when either is missing it *returns* `ApplicationResult.error(...)` — it never throws:

```js
const { businessId, accountId, lines = [], referenceId, expiresAt } = input;
if (!businessId || !accountId) {
    return ApplicationResult.error(validationError('businessId and accountId are required.'));
}
```

`placeOrderUseCases.js` calls it without an `accountId` at all (there is no staff/account actor in a consumer checkout) and never inspects the resolved value:

```js
try {
    await reserveStock({
        businessId,
        lines: normalizedLines.map((line) => ({ productId: line.product_id, quantity: line.quantity })),
        referenceId: publicReference,
        expiresAt: fallbackExpiresAt
    });
} catch (reserveError) { ... }
```

Because `buildReserveStockUseCase` never throws — by design it always resolves to an `ApplicationResult` (success or failure) — the `try/catch` here can never fire for a reservation failure of *any* kind, including a genuine oversell. Every real order placement:
1. Silently receives an `ApplicationResult.error` (missing `accountId`) back from `reserveStock`, which is thrown away.
2. Proceeds exactly as if the reservation succeeded — no row is ever inserted into `inventory_reservations`, no stock availability check ever runs.
3. Continues straight to QR Ph session creation / cash finalize, i.e. checkout "succeeds" with zero stock guarantee.

This defeats the entire point of Phase 10's D-07 (temporary holds) and D-09 (expiry-based reclaim) invariants: overselling is possible for every storefront order in the real deployment, and `InsufficientStockError`/`TenantDatabaseUnavailableError` (D-10 fail-fast) can never surface to a customer because the code path that would produce them is never reached with the values it needs.

**Why tests didn't catch it:** `tests/storefront/placeOrder.test.js` and `tests/storefront/storefrontE2E.test.js` both inject hand-written fakes for `reserveStock` shaped like the *documented* (repository) contract — `jest.fn().mockResolvedValue({ reservations: [...] })` — never the actual `buildReserveStockUseCase` wrapper `routes/index.js` wires in production. `tests/inventory/inventoryReservation.test.js` (the only suite that touches the reservation usecases/repository directly) is entirely placeholder assertions (see WR-01) and never exercises `buildReserveStockUseCase` either. No test in this phase exercises the real composition root end-to-end.

**Fix:** Wire `placeOrderUseCases.js`'s `reserveStock`/`releaseReservation`/`setReservationExpiry` to the raw `InventoryReservationRepository` methods (as the doc comment says), not to `inventoryReservationPorts.reserveStock`/etc. from `buildInventoryModule()`. E.g. expose the repository instance itself (or thin repository-shaped adapters) from `buildInventoryModule()`'s return value for `routes/index.js` to pass into `buildStorefrontModule({ reserveStock: reservationRepository.reserveStock.bind(reservationRepository), ... })`, and add an integration-level test that builds the module graph the same way `routes/index.js` does (not hand-rolled fakes) so a port-shape mismatch like this fails loudly.

---

### CR-02: `InventoryReservationRepository` held-stock queries omit `product_id`, corrupting availability across every product in a tenant

**File:** `apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js:131-143` (`availableToSell`), `:202-215` (`reserveStock`'s per-line check)

**Issue:** Both the `availableToSell()` method and the per-line stock check inside `reserveStock()` compute a "held" sum via:

```js
const heldResult = await InventoryReservation.findAll({
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'heldSum']],
    where: sequelize.where(
        sequelize.literal(`(status = 'active' AND (expires_at IS NULL OR expires_at > '${timestamp.toISOString()}'))`),
        sequelize.Op.gt,
        0
    ),
    raw: true
});
```

Neither query filters on `product_id` (the parameter the caller passed in) — the `WHERE` clause only constrains `status`/`expires_at`. This sums **every active, non-expired reservation for every product in the tenant database**, not just the product being checked. `availableToSell(businessId, productId)` then computes `Math.max(0, onHand - heldAmount)` using that cross-product sum against a single product's `stock_count`, so:

- A store with multiple products that each have any active reservation will see wildly incorrect (usually far too low, sometimes zero) availability for products that have no reservations of their own at all.
- `reserveStock()`'s own oversell guard (`requestedQty > availableToSell`) uses the same broken query, so it can reject valid orders as `InsufficientStockError` based on unrelated products' holds, or (depending on data shape) fail to reject an actually-oversold line.

This is a correctness bug in the core D-07/D-09 stock-reservation ledger, not an edge case — it triggers as soon as more than one product exists with any active reservation in the same tenant database (the normal case for any real store).

**Fix:** Add `product_id: productId` (and, if reservations are ever shared across businesses in one physical table — they are not here since each tenant has its own DB, so this is optional but still good practice) to both `where` clauses, e.g.:

```js
where: {
    product_id: Number(line.productId),
    status: 'active',
    [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }]
}
```
(dropping the raw `sequelize.literal`/`sequelize.where(..., Op.gt, 0)` construction entirely in favor of a normal Sequelize `where` object also removes the fragile boolean-as-integer comparison noted in WR-03.)

---

### CR-03: Guest checkout accepts a client-supplied `guestIdentityId` without verifying it belongs to an OTP-verified session

**File:** `apps/dgfy-api/src/modules/storefront/usecases/guestCheckoutUseCases.js:82-99` (`resolveCheckoutIdentity`), consumed unchecked at `apps/dgfy-api/src/modules/storefront/usecases/placeOrderUseCases.js:249-252, 294`

**Issue:** `resolveCheckoutIdentity({ authenticatedAccountId, guestIdentityId })` is documented (and README-advertised, `apps/dgfy-api/src/modules/storefront/README.md:25`) as resolving "who is checking out," implying the guest branch only succeeds for a genuinely verified guest. In practice it does nothing but check truthiness:

```js
const resolveCheckoutIdentity = async ({ authenticatedAccountId, guestIdentityId }) => {
    if (authenticatedAccountId) return ApplicationResult.success({ customer_account_id: authenticatedAccountId });
    if (guestIdentityId) return ApplicationResult.success({ guest_identity_id: guestIdentityId });
    return ApplicationResult.failure(checkoutIdentityRequiredError());
};
```

There is no call to `guestIdentityRepository.findById`/`findByEmail` here to confirm: (a) the supplied `guestIdentityId` actually exists, or (b) it was produced by *this caller's own* `verifyGuestOtp` call (i.e., that the caller actually proved control of that email via OTP). `placeOrderUseCases.js` then writes this unchecked value straight into `storefront_orders.guest_identity_id` (`checkoutController.js` forwards `body.guestIdentityId` verbatim from the request body — see `apps/dgfy-api/src/modules/storefront/controllers/checkoutController.js:33`).

Because `storefront_guest_identities.id` is an opaque UUID (hard to guess), the practical exploitability is limited to scenarios where an attacker has learned or leaked another guest's `guest_identity_id` (e.g., via a previous `verifyGuestOtp` response they intercepted, a referral link, log exposure, etc.) — but the security *control* itself (never accept an identity claim without checking it) is absent, which is exactly the kind of authorization gap this phase's own STF-03/D-05/D-06 documentation claims is closed ("a guest is never forced to log in" implicitly assumes the guest path is itself verified). The blast radius: an attacker can attribute fraudulent orders to another guest's persistent identity (poisoning `last_order_at`, and, depending on downstream consumers of `guest_identity_id`, potentially surfacing order history/contact linkage to the wrong identity).

**Fix:** In `resolveCheckoutIdentity`, when `guestIdentityId` is supplied, look it up via `guestIdentityRepository.findById(guestIdentityId)` (add this method if it doesn't exist — `findByEmail` already exists) and fail with 401/403 if it doesn't resolve to a real row. Stronger: don't accept a bare `guestIdentityId` from the client at all — have `verifyGuestOtp` return a short-lived signed token binding the OTP verification to the identity, and require that token (not the raw id) at checkout, so possession of the id alone is never sufficient.

---

### CR-04: Webhook finalize/failure paths write to `commerce_payment_sessions` columns that don't exist — audit data silently dropped

**File:** `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js:117-122`, `apps/dgfy-api/src/modules/commercePayments/usecases/handleWebhookUseCases.js:139`, cross-referenced against `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js:61-166` and `apps/dgfy-migration-runner/src/migrations/schema/20260714100000-create-storefront-commerce-landlord.cjs:284-386`

**Issue:** `buildFinalizePaidOrderUseCase` marks a session `paid` via:

```js
await updateSessionStatus(session.id, {
    status: 'paid',
    paid_at: session.paid_at || new Date(),
    provider_event_id: providerEventId || session.provider_event_id,
    provider_payment_id: providerPaymentId
});
```

and `handleWebhookUseCases.js`'s `releaseAndMark` (used for `payment.failed`/`qrph.expired`) does:

```js
await updateSessionStatus(session.id, { status, manual_resolution_reason: null, failure_reason: reason });
```

Neither `provider_event_id` nor `failure_reason` is a column on the `CommercePaymentSession` Sequelize model (`models/Landlord/CommercePaymentSession.js`'s `init()` block lists `id, public_reference, storefront_order_id, tenant_id, status, provider, provider_payment_intent_id, provider_payment_id, qr_code_image_url, amount_centavos, expires_at, paid_at, finalized_at, manual_resolution_reason, split_payload, platform_fee_centavos` — no `provider_event_id`/`failure_reason`), nor on the `commerce_payment_sessions` migration, nor on `dgfyCoreContract.js`'s schema contract for that table. `CommercePaymentRepository.updateSessionStatus` (`commercePaymentRepository.js:130-135`) does `row.update(patch)` directly — Sequelize silently ignores keys in `patch` that aren't declared model attributes; no error is thrown, and nothing is persisted for those two fields.

Impact: the PayMongo event id intended for replay/audit tracking is computed on every `payment.paid` webhook and then silently discarded (never actually written), and the human-readable failure reason for a `payment.failed`/`qrph.expired` session is likewise discarded. This doesn't break the core finalize/idempotency logic (which correctly relies on `status`/`availment_id`, not `provider_event_id`), but it does mean operators investigating a stuck/failed payment via the DB will find `provider_event_id`/`failure_reason` always empty, despite the code appearing to record them — a misleading gap during incident response.

**Fix:** Either add `provider_event_id VARCHAR` and `failure_reason TEXT` columns to `commerce_payment_sessions` via a new additive migration (updating the model + `dgfyCoreContract.js` to match), or stop passing fields that were never meant to be persisted. Given the code's own comments describe these as intentional audit fields, the former is almost certainly the correct fix.

## Warnings

### WR-01: `tests/inventory/inventoryReservation.test.js` contains no real assertions — every test is a placeholder

**File:** `apps/dgfy-api/tests/inventory/inventoryReservation.test.js` (entire file)

**Issue:** Every `it(...)` block in this file sets up mocks and then asserts only `expect(someMock).toBeDefined()` or `expect(someMock).toBeDefined()` on a `jest.fn()` reference — which is always true regardless of what the production code under test actually does. None of these tests import or call `buildReserveStockUseCase`, `buildAvailableToSellUseCase`, `buildCommitReservationUseCase`, `InventoryReservationRepository`, or any other real implementation. Comments throughout ("Placeholder: actual implementation tested in GREEN phase", "verified after GREEN phase") indicate this was left in a TDD RED-phase scaffold state and never completed. This is the test file that should have caught both CR-01 and CR-02 above (it directly documents the exact scenarios — "should exclude expired-active reservations from held sum", "should reject with InsufficientStockError when quantity > availableToSell" — that are broken in production) but structurally cannot, because it never invokes the code it claims to cover.

**Fix:** Rewrite this suite to actually construct `InventoryReservationRepository`/the `inventoryReservationUseCases.js` builders against the mocked models and assert real outcomes (row lookups, computed `availableToSell` values, thrown/returned errors), mirroring the real-assertion style already used in `tests/storefront/placeOrder.test.js` and `tests/commercePayments/webhookFinalize.test.js`.

### WR-02: Hardcoded fallback secret for OTP code hashing

**File:** `apps/dgfy-api/src/infra/emailOtp.js:54-59`

**Issue:**
```js
const getHashSecret = () => (
    process.env.EMAIL_OTP_SECRET
    || process.env.JWT_SECRET
    || process.env.REFRESH_TOKEN_SECRET
    || 'email_otp_local_fallback_change_me'
);
```
If `EMAIL_OTP_SECRET`, `JWT_SECRET`, and `REFRESH_TOKEN_SECRET` are all unset in a given environment, OTP codes (used for both DGFY account verification/reset and the new `STOREFRONT_GUEST_CHECKOUT` purpose that gates real money-moving checkout) are hashed with a static, source-visible string. This is a defense-in-depth gap: `code_hash` values are otherwise SHA-256 of `purpose:tenant:email:code:secret`, so a leaked `code_hash` value combined with knowledge of this fallback constant would materially reduce the brute-force search space for the 6-digit code (though the 5-attempt lockout still applies). This is pre-existing behavior mirrored from `backend/src/services/emailOtpService.js` per the file's own header comment, but it is now also gating the new storefront checkout purpose introduced in this phase, raising its stakes.

**Fix:** Fail closed (throw at startup, or reject OTP issuance with a 500) when no real secret is configured in non-development environments, rather than silently falling back to a well-known string.

### WR-03: Fragile boolean-literal-as-integer-comparison SQL pattern for reservation availability

**File:** `apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js:135-141, 206-212`

**Issue:** Both held-sum queries build their `where` clause as:
```js
where: sequelize.where(
    sequelize.literal(`(status = 'active' AND (expires_at IS NULL OR expires_at > '${timestamp.toISOString()}'))`),
    sequelize.Op.gt,
    0
)
```
This relies on MySQL implicitly coercing the boolean expression to `1`/`0` and then comparing `> 0` — a non-obvious, MySQL-specific idiom that a plain `where: { status: 'active', [Op.or]: [...] }` object would express more clearly and portably, while also making it far more likely the missing `product_id` filter (CR-02) would have been noticed at review/write time. Not itself incorrect (MySQL does support this), but it is unnecessarily indirect and obscures the real bug in CR-02.

**Fix:** Replace with a standard Sequelize `where` object (see CR-02's suggested fix), dropping the raw-literal/boolean-comparison construction.

### WR-04: Inconsistent indentation and out-of-order step comments in `finalizeStorefrontOrder`

**File:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js:572-690`

**Issue:** The `try { return await sequelize.transaction(async (transaction) => { ... }); } catch (error) { ... }` block (lines 595-690) is indented one level deeper than the surrounding method body and its closing braces are misaligned relative to their openers, making the control flow harder to scan than the rest of the file (which is otherwise consistently formatted). Separately, the inline step comments label the code `(a)` idempotent lookup, `(b)` create Availment, an unlabeled AvailmentItem loop, `(d)` reservation→sale, `(c)` Payment row — but `(c)` (Payment) actually executes *after* `(d)` (commitReservation) in the real code, not before it as the lettering implies. Neither issue changes runtime behavior, but both reduce readability of a method whose atomicity/ordering guarantees are exactly what a future maintainer needs to reason about correctly.

**Fix:** Reformat the try/catch block to match the file's existing 4-space indentation convention, and relabel the step comments in actual execution order (a, b, c=reservation, d=payment, or similar).

### WR-05: `buildOptionalAuthenticateAccount` can potentially invoke `next()` twice

**File:** `apps/dgfy-api/src/modules/storefront/routes.js:71-86`

**Issue:**
```js
const buildOptionalAuthenticateAccount = (authenticateAccount) => (req, res, next) => {
    if (!req.headers.authorization) return next();
    const passthroughRes = { status: () => passthroughRes, json: () => next() };
    Promise.resolve(authenticateAccount(req, passthroughRes, next))
        .catch(() => next());
};
```
If `authenticateAccount`'s success path calls the real `next` (the third argument) synchronously and then the returned promise later rejects for an unrelated reason (e.g., a downstream `.then()` inside `authenticateAccount` throws after already calling `next()`), the `.catch(() => next())` here would invoke `next()` a second time for the same request — a classic double-`next()` Express bug that can produce confusing double-handling. This is a narrow edge case (requires `authenticateAccount` to both call `next()` and later reject its own promise), but worth guarding against given this wrapper is reused for every optionally-authenticated storefront route (`/checkout/identity`, `/checkout`).

**Fix:** Track whether `next()` has already been called (a simple boolean flag) and no-op the `.catch()` handler if so.

---

_Reviewed: 2026-07-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
