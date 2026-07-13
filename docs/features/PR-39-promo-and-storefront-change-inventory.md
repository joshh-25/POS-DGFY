---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-07-13
applies_to: pos_promo_settings, storefront_checkout, pos_incoming_orders
topic: pr_39_promo_and_storefront_change_inventory
---

# PR #39: Promo and Storefront Change Inventory

## Purpose

This document inventories the committed promo-related and Storefront-related changes on the `POS-Development` branch for PR #39, including later checkout and tracking hardening commits. It is a change reference and does not replace the authoritative backend promotion, checkout, payment, or fiscal contracts.

## Promo Schedule Updates

| File | Purpose | Change summary |
| --- | --- | --- |
| `frontend/src/features/pos/utils/storefrontPromoSchedule.js` | Shared POS Settings promo-schedule validation. | Validates `YYYY-MM-DD` dates, 24-hour `HH:mm` times, complete date ranges, complete time ranges, chronological dates, and same-day chronological times. Date and time ranges remain independently optional. |
| `frontend/src/features/pos/utils/storefrontPromoSchedule.test.js` | Promo schedule regression coverage. | Covers valid date-time schedules, date-only schedules, time-only schedules, and incomplete-range errors. |
| `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` | POS Settings save flow. | Replaces duplicated inline validation with `getStorefrontPromoScheduleValidationError`. Invalid schedules display an actionable error and are not saved. |

### Promo Behavior

- A date range requires both **From** and **To** dates.
- A time range requires both start and end times.
- Dates use `YYYY-MM-DD`; times use 24-hour `HH:mm`.
- The From date cannot be after the To date.
- On the same date, the From time must be earlier than the To time.
- Backend commercial-promo eligibility remains the redemption authority.

## Storefront Checkout Updates

| File | Purpose | Change summary |
| --- | --- | --- |
| `frontend/apps/store/src/checkout/buildFnbCheckoutPayload.js` | Builds F&B Storefront checkout data. | Preserves the customer-entered `delivery_address` for pickup orders instead of clearing it. Latitude and longitude stay `null` unless the order is delivery. |
| `frontend/apps/store/src/__tests__/buildFnbCheckoutPayload.test.js` | Storefront checkout payload regression coverage. | Proves pickup orders retain readable address text while omitting map coordinates. |

### Checkout Behavior

- Customer-provided address text is retained for pickup orders.
- Pickup orders do not include delivery latitude or longitude.
- Delivery orders retain their existing coordinate behavior.
- No Storefront API payload shape, payment behavior, or backend checkout rule changed.

## POS Incoming Storefront-Order Updates

| File | Purpose | Change summary |
| --- | --- | --- |
| `frontend/src/features/pos/components/TerminalOperationsPanels.jsx` | POS incoming-order card. | Refreshes the card layout and action presentation. Displays the readable address and keeps map navigation available when a delivery pin exists without presenting raw coordinates as the address. |
| `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` | POS operations workspace. | Integrates the incoming-order presentation changes with the existing terminal workflow. |
| `frontend/src/features/pos/__tests__/terminalLocationScope.integration.test.jsx` | Incoming-order location UI test. | Confirms the card displays the address and map link while coordinate text is hidden. |

## Current Storefront Hardening Additions

| File | Purpose | Change summary |
| --- | --- | --- |
| `frontend/apps/store/src/StorefrontApp.jsx` | Storefront checkout and tracking behavior. | Forces an open F&B drawer to the Cart tab, fixes array-based tracking-card expansion state wiring, hydrates saved guest details once per guest checkout session, limits selectable payment to cash, and adds OTP resend cooldown handling. |
| `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx` | Customer account drawer presentation. | Adds explicit `drawer` and `page` presentation modes. The drawer is fixed, scrollable, and layered above Discovery navigation; the standalone account page retains normal layout. |
| `frontend/apps/store/src/__tests__/fnbStorefront.contract.test.js` | Storefront regression coverage. | Covers tracking drawer prop wiring, cart-tab normalization, one-time guest-detail hydration, and cash-only checkout payment selection. |
| `frontend/apps/store/src/__tests__/DgfyCustomerAccountPage.dashboard.test.jsx` | Customer account presentation test. | Confirms drawer presentation uses fixed positioning and a stacking layer above the Discovery header. |
| `frontend/apps/store/src/__tests__/guestCheckoutOtp.contract.test.js` | Guest OTP UI contract test. | Confirms cooldown state, the 60-second post-send cooldown, and resend countdown copy. |
| `backend/src/middleware/rateLimiter.js` | Guest checkout OTP protection. | Creates separate tenant/IP/email rate-limit buckets for code sends and code verification attempts while preserving server `Retry-After` responses. |
| `backend/src/routes/store.js` | Store checkout OTP transport. | Applies the request limiter only to the send endpoint and the verification limiter only to the verify endpoint. |
| `backend/tests/rateLimiter.behavior.test.js` | Backend OTP limiter test. | Proves a guest code send and a guest code verification use independent limiter buckets. |

### Current Storefront Behavior

- The tracking drawer expands an active order and can open its full tracking details.
- Guest checkout does not overwrite a manually cleared email with saved local details.
- Only cash is customer-selectable until a tenant-ready online payment handoff exists.
- Sending a guest verification code starts a visible resend cooldown; sending and verifying are separately rate-limited.

## Supporting Documentation

| File | Purpose | Change summary |
| --- | --- | --- |
| `docs/compliance/impact-declarations/2026-07-13-pos-storefront-promo-and-order-address-ui.md` | Compliance impact declaration. | Records that the work is frontend-only and does not alter fiscal calculations, payment collection, receipt issuance, API routes, persisted transaction records, or database migrations. |
| `docs/features/DGFY_CUSTOMER_ACCOUNT.md` | Authoritative Storefront customer checkout contract. | Documents guest OTP resend/rate-limit behavior and cash-only Storefront payment availability until online-payment readiness is established. |
| `Implementation.md` | Engineering implementation log. | Records implementation details for the promo and Storefront/POS UI work. |
| `Plan.md` | Engineering planning log. | Records planning context for the related implementation work. |

## Validation Evidence

- Promo schedule unit tests cover accepted and rejected schedule combinations.
- Storefront F&B checkout payload tests cover pickup-address retention.
- POS terminal location integration tests cover address-only card presentation and map linking.
- POS and Storefront builds were run during implementation.
- Architecture guardrails were run for the affected branch work.

## Scope Exclusions

This PR does not change:

- Commercial promo redemption policy or backend promo eligibility.
- Payment collection, fiscal calculations, receipts, API contracts, database schema, or migrations.
- External delivery dispatch, rider assignment, or provider tracking.
- Live online-payment provider readiness, provider handoff, settlement, or refund behavior.
