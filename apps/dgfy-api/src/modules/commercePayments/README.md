# commercePayments module

Scaffolded in Phase 10 Plan 05 (`.planning/phases/10-storefront-discovery-online-ordering/10-05-PLAN.md`, D-01, STF-04): the landlord-owned PayMongo QR Ph payment-**session** layer. A native-`fetch` PayMongo client (Payment Intent 3-call dance + raw-body signature verification), a landlord repository over `commerce_payment_sessions` (10-01), and the `createQrphSession` use case.

## Scope of this plan (10-05)

- `services/payMongoClient.js` — the PayMongo HTTP surface: `createQrphPaymentIntent` (createPaymentIntent -> createPaymentMethod -> attachPaymentIntent) and `verifyWebhookSignature` (HMAC-SHA256 over the raw body, timing-safe, timestamp-tolerance replay guard).
- `repositories/commercePaymentRepository.js` — landlord (`dgfy_core`) persistence: `createSession`, and session resolution by public reference / provider payment-intent id / provider payment id.
- `usecases/createQrphSessionUseCases.js` — `createQrphSession`, wired via `index.js`'s `buildCommercePaymentsModule()`.

**Deliberately NOT built here:** webhook route/controller wiring, event parsing, or tenant-Availment finalization. 10-08 owns that layer and reuses this module's `verifyWebhookSignature` + session-resolution helpers (exposed at the top level of `buildCommercePaymentsModule()`'s return value) rather than constructing a second client/repository pair.

## D-02: split is excised, not schema-baked

A single DGFY-controlled PayMongo account collects the full order amount this milestone — no 1% platform-fee split, no per-tenant child-merchant onboarding. The excision is literally: `createPaymentIntent`'s attributes never include a `split_payment` key. Because split is a provider-side argument at intent-creation time (not a schema concern), a future phase can re-add it without any migration — `commerce_payment_sessions.split_payload`/`platform_fee_centavos` (10-01) already exist as nullable, unpopulated columns for exactly this purpose.

## Config gate (503, not a broken session)

`config/env.js`'s `requireCommerceQrphConfig()` reports `{ configured, missing }` from `COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`, and `PAYMONGO_SECRET_KEY`. `createQrphSession` checks this BEFORE calling PayMongo or writing a session row — if anything is missing, it fails closed with a 503 `SERVICE_UNAVAILABLE` `DomainError`, never a partial/broken session. `payMongoClient.createQrphPaymentIntent` independently re-checks the secret key too (defense in depth — see `PayMongoServiceUnavailableError`), so the client is also safe to call directly without going through the usecase gate.

## tenant_id is never integer-coerced (Pitfall 7)

`commerce_payment_sessions.tenant_id` is a UUID string (`business_database_registry.business_id`, ADR 0027 #17). Every method on `commercePaymentRepository.js` and every metadata field on the PayMongo payment intent passes `tenant_id` through verbatim — no `Number()`/`parseInt()` ever touches it.

## Session resolution order (for 10-08's webhook)

`findSessionByPublicReference` -> `findSessionByProviderPaymentIntent` -> `findSessionByProviderPayment`, matching PayMongo's own event metadata availability (metadata is always present on session creation; provider ids are only known after the fact). 10-08's webhook handler should try these in this order and stop at the first hit.

## Prohibitions honored

- No `backend/` writes — `paymongoService.js` and ADR 0027 are read-only references only; every line here is new code.
- Zero new packages — native `fetch` + Node `crypto` only (apps/dgfy-api has no axios).
- No webhook route/controller mounted from this module (10-08's scope).
- No `split_payment` argument ever sent to PayMongo, no `split_payload`/`platform_fee_centavos` ever written (D-02).
