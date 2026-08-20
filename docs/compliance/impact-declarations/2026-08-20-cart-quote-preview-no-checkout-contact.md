---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-cart-quote-preview-no-checkout-contact
classification: major
surfaces: payments,storefront,checkout
reason_codes_impacted: ALLOWED
policy_version: 2026.08.20
verification_evidence: storeCartQuotePreviewNoContactRequired.unit.test.js,storeCheckoutVoucherPromoStacking.unit.test.js,storeCheckoutAffiliatePricing.unit.test.js,finalizePaidCommerceSession.usecase.test.js,Storefront production build
rollback_note: Revert this commit to restore the unconditional customer_name/phone-or-email/delivery_address requirement on the cart-quote preview endpoint. No data migration involved -- resolveCheckoutContext's requireCheckoutContact option and buildStoreCartQuoteUseCase's use of it are the entire change.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: ISSUE-746-CART-QUOTE-PREVIEW-CONTACT
---

# Cart-Quote Preview No Longer Requires Checkout Contact Info

## Compliance Impact Classification

Major because this changes a validation gate on `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`'s
shared checkout-context resolver, the same module every storefront payment and order-placement path
runs through (`surfaces: payments,storefront,checkout`, `minimumClassification: major` per
`scripts/check-compliance-impact.js`'s own pattern for `apps/dgfy-api/src/modules/store/`).

## Affected Surfaces

1. `POST /api/v1/store/cart/quote` -- the only caller this change actually touches. Previously
   required `customer_name`, then `customer_phone` or `customer_email`, then (for a delivery order)
   `delivery_address` before computing any total, including a voucher/promo discount preview. Now
   computes a full preview -- subtotal, service fee, delivery fee, voucher/promo discount, VAT
   breakdown -- with none of those fields present.
2. Real order placement (`buildStoreCheckoutUseCase`, the money-writing path) and the QRPh
   payment-session creation path (`buildStoreCreateCommercePaymentSessionUseCase`) are **unchanged**
   -- both still call `resolveCheckoutContext` with `requireCheckoutContact` at its default `true`,
   so a real order still requires the same customer identity and delivery address it always has.

## Compliance Preconditions

1. `resolveCheckoutContext` gains a `requireCheckoutContact` option, default `true` -- the safe
   default is preserved everywhere the option isn't explicitly passed.
2. `buildStoreCartQuoteUseCase` is the **only** caller that passes `false`. Verified via `grep` that
   the other two `resolveCheckoutContext` call sites (checkout finalization, QRPh session creation)
   do not pass the option and therefore keep the strict default.
3. Verified neither the voucher/promo discount computation nor `deliveryFee` reads any of the
   gated fields: `resolveStorefrontPromoApplication`/`previewVoucherEligibilityUseCase` operate on
   cart lines only, and `deliveryFee = resolveStoreDeliveryFee(settings, orderMethod)` is a flat,
   settings-keyed lookup that never reads the delivery-address string. The gate was validating that
   a *real order* is placeable, not protecting the computation itself -- relaxing it for a preview
   changes no pricing outcome.
4. No new PII is collected, stored, or transmitted by this change -- if anything, less identity
   data is required to see a price preview than before.

## Verification Evidence

1. `apps/dgfy-api/tests/storeCartQuotePreviewNoContactRequired.unit.test.js` (new) -- a quote with
   no customer_name/phone/email/delivery_address succeeds, including for a `delivery` order method;
   the computed subtotal matches the real pricing path (not a silent default); a customer_name
   supplied anyway (e.g. from a signed-in account) still works.
2. `apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js`,
   `storeCheckoutAffiliatePricing.unit.test.js` -- existing `buildStoreCartQuoteUseCase`/
   `resolveCheckoutContext` coverage, unaffected by the new default-true option.
3. `apps/dgfy-api/tests/finalizePaidCommerceSession.usecase.test.js` -- the real order-finalization
   path, confirming its own `resolveCheckoutContext` call is unaffected.
4. Storefront production build (`npm run build:store`) and the full storefront test suite pass.
