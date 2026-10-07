---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-07
declaration_id: 2026-10-07-laundry-customer-ordering
classification: major
surfaces: payments,storefront,commerce
reason_codes_impacted: ALLOWED,AUTHORIZATION_FAILED,SESSION_TERMINAL
policy_version: 2026.10.07
verification_evidence: DGLaundry API use-case and route-contract Jest suites, Storefront rendered component and mode/catalog Vitest suites, Playwright desktop/mobile rendered checks, npm run build:store, npm run check:architecture, npm run lint:docs
rollback_note: Revert the tenant-scoped laundry routes, payment-session ownership and reservation-cancel support, laundry storefront, tests, and contract documentation together; no schema or live tenant data changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-07T15:54:06.386Z
preflight_request_ref: PREFLIGHT-37646533737-2026-10-07-LAUNDRY-CUSTOMER-ORDERING
---

# Laundry customer ordering (#2308)

## Compliance Impact Classification

Major under the payment path classification floor. This change adds Storefront-customer access to
the existing DGLaundry booking-payment session and adds a per-kilo order path. It preserves the
existing PayMongo-verified finalization boundary for fixed-price orders and does not enable the
DGLaundry booking-payment feature flag.

## Affected Surfaces

- `apps/dgfy-api/src/modules/commercePayments/` — trusted Store customer identity snapshot, public
  DGLaundry payment-session reference validation, and reservation release when a pending session
  is cancelled.
- `apps/dgfy-api/src/modules/dgfyLaundryOrders/` and `apps/dgfy-api/src/routes/store.js` —
  tenant-scoped customer catalog, availability, quote, per-kilo order, and guest-capability access.
- `apps/dgfy-storefront/` — laundry-specific catalog and order UI, per-kilo submission, payment
  session access, and the explicit dark-disabled state.
- `docs/api/PARTNER_INTEGRATION_CONTRACT.md` — customer ordering contract, deferred verification,
  and residual guest-capability risk.

## Compliance Preconditions

1. Store customer identity is read only from `req.storeCustomer`; client-supplied account IDs and
   order/tracking references cannot establish ownership. Guest order references are minted by DGFY.
2. Guest contact name, email, and phone are informational and remain unverified. They are not
   authorization or ownership evidence.
3. `/api/v1/store/laundry/orders` accepts only per-kilo orders. Fixed/mixed orders use the existing
   `dglaundry_booking` payment target and emit `dgfy.laundry_order.submitted.v1` only after verified
   payment finalization. `DGLAUNDRY_BOOKING_PAYMENTS_ENABLED` remains off.
4. Customer cancellation of an unpaid DGLaundry payment session attempts provider-reservation
   release. The guest tracking key is reusable, and DGFY currently relies on provider rejection for
   mutations after terminal status while signed status events update the local projection; this
   eventual-state window is a documented follow-up risk.
5. No migration, deployment, live payment, or production data mutation is included.
6. Live request-time compliance preflight was not executed in this implementation session. The
   `NOT-EXECUTED-*` reference is the expected placeholder for a PR targeting `develop`; the regular
   compliance sweep must reconcile it after the declaration lands on `develop`.

## Verification Evidence

The linked PR records focused API tests, Storefront tests, local Playwright rendered evidence at
desktop and mobile sizes, the Storefront production build, architecture checks, documentation
lint, and the unchanged develop-branch app-version check. No live DGLaundry payment gate was
enabled or exercised.
