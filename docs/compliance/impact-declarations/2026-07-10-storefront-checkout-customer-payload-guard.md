---
status: reference
owner: engineering
last_reviewed: 2026-07-10
declaration_id: 2026-07-10-storefront-checkout-customer-payload-guard
classification: major
surfaces: storefront,checkout,pos,terminal,pwa
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: storefront payload test,Storefront production build,docs lint
rollback_note: Revert the checkout customer-payload guard; server-side customer identity validation remains authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T21:10:00+08:00
preflight_request_ref: STOREFRONT-CUSTOMER-PAYLOAD-2026-07-10
---

# Storefront Checkout Customer Payload Guard

## Compliance Impact Classification

Major. This makes an existing required checkout identity field explicit at the final frontend submission boundary without changing Storefront route, request, or response contracts.

## Affected Surfaces

- Storefront checkout customer contact payload.
- Storefront checkout and tracking error feedback.

## Compliance Preconditions

- The backend remains authoritative for required customer identity and contact validation.
- The frontend must not submit an empty `customer_name` after the customer step has been completed.
- A failed checkout must not present a stale tracking-pin error as if an order was created.

## Verification Evidence

- `npm --prefix frontend exec vitest run apps/store/src/__tests__/buildFnbCheckoutPayload.test.js`
- `npm --prefix frontend run build:store`
- `npm run lint:docs`
