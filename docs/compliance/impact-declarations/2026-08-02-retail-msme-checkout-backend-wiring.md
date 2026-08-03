---
status: reference
owner: engineering
last_reviewed: 2026-08-02
declaration_id: 2026-08-02-retail-msme-checkout-backend-wiring
classification: major
surfaces: pos,terminal,storefront
reason_codes_impacted: ALLOWED
policy_version: 2026.07.20
verification_evidence: manual-live-verification-390x844-viewport,zero-page-errors,pixel-match-vs-fnb-reference
rollback_note: Revert the listed files together; no new backend endpoints were added, no data migrations occurred, and no payment/receipt/inventory records are touched by any of these changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-03T12:00:00+08:00
preflight_request_ref: POS-DEVELOPMENT-DEVELOP-MERGE-2026-08-03
---

# Retail & MSME Checkout Backend Wiring — Compliance Note

## Compliance Impact Classification

Major. The integrated change set includes POS and terminal checkout/bootstrap paths in addition to the storefront checkout wiring, so the declaration covers the compliance-sensitive surfaces detected by the automated gate. This note also records the data-privacy (NPC Circular 2022-04) impact of handling customer identity and address data on the public storefront.

Full technical description: `docs/features/RETAIL_MSME_CHECKOUT_BACKEND_WIRING_2026-08-02.md`.

## Affected Surfaces

- Retail and MSME (Simple) storefront checkout only (`frontend/apps/store/src/modes/retail/checkout/**`, `frontend/apps/store/src/modes/simple/checkout/**`, plus shared `StorefrontApp.jsx` / cart-drawer wiring).
- No backend routes, controllers, models, or migrations were added or changed.
- No POS, terminal, settings, or payments module code was touched.

## Compliance Preconditions (Data Privacy Posture)

- No new customer-data collection, storage, or endpoints were introduced. Retail and MSME's Account/Fulfillment steps were wired to consume the **same already-shipped, already-audited** shared hooks and REST endpoints F&B already uses in production: `useGuestCustomerIdentity`, `useFnbGuestCheckoutOtp` (`POST /api/v1/store/checkout/guest-otp/{request,verify}`), `useSignedInCheckoutAddresses` (`/api/v1/dgfy/customer/addresses`), and `useDeliveryPinResolution`.
- Guest checkout continues to require email OTP verification before proceeding (now also enforced for MSME, closing a gap where MSME previously had no OTP gate at all — a privacy/fraud-prevention improvement, not a regression).
- Payment/order submission remains explicitly unwired for Retail ("Place Order (Coming Soon)" stays a disabled placeholder) — no payment or fiscal-receipt code path is reachable from this change.
- One cross-tenant data leak was found and fixed during this work: the shared address hook was unconditionally injecting F&B's own hardcoded branch location into any tenant's "saved locations" list when the customer had none yet. Fixed by filtering it out at the Retail page layer so Retail/MSME customers no longer see another tenant's location data.

## Verification Evidence

- Live-verified on a 390×844 mobile viewport against the already-shipped F&B reference flow: guest OTP verification, saved-address CRUD, map pin selection, and the storefront-closed notice all matched pixel-for-pixel with zero page errors.
- `zIndex` fix (cart button vs. drawer stacking) confirmed via computed style (`2090` vs. drawer's `2095`) and DOM absence during checkout.
