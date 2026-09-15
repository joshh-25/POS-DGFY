---
status: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-pos-delivery-contact-guest-checkout
classification: major
surfaces: pos,terminal,storefront
reason_codes_impacted: ALLOWED
policy_version: 2026.09.12
verification_evidence: npx vitest run (Storefront OTP/contract/UI suites),npx vitest run (shared POS queue/formatting/location suites),npm test (Storefront),npm test (POS),npm run lint (Storefront),npm run lint (POS),npm run build (Storefront),npm run build (POS),npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the Storefront OTP reset/request sequencing changes and the shared POS delivery contact/coordinate presentation changes together. No database migration or persisted schema change is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-12T20:00:00+08:00
preflight_request_ref: PREFLIGHT-20260912-POS-DELIVERY-CONTACT-GUEST-CHECKOUT
---

# POS Delivery Contact And Repeat Guest Checkout

## Compliance Impact Classification

Major, because the POS queue displays existing customer phone and precise delivery coordinates
from the immutable order snapshot. The Storefront change fixes OTP sequencing and rotates an
existing guest proof/idempotency pair; it does not collect or persist new customer data.

## Affected Surfaces

- POS Active Queue card, table, and terminal sidebar views show the order-time customer phone and
  exact saved pin coordinates for delivery orders. Coordinates are formatted to eight decimal
  places, matching the existing transaction precision, and show `Not provided` when an order has
  no complete pin. The existing map link remains available only for complete finite coordinates.
- Storefront guest checkout passes the effective remembered email explicitly when applying saved
  details, preventing a request from reading a stale blank React state value.
- Storefront guest checkout clears the proof, code, cooldown, and rotates the idempotency intent
  after successful product/service orders and finalized online payments, so a later order cannot
  reuse the prior order's proof or idempotency key.

## Compliance Preconditions

1. `customer_phone`, `delivery_latitude`, and `delivery_longitude` are existing order-time
   snapshots already returned by the authorized POS incoming-order read path; this change adds no
   API endpoint, database column, migration, or new collection/storage behavior.
2. Phone and precise pin coordinates are rendered only in the existing POS delivery queue context,
   behind the same POS permissions and tenant/location scope as the queue. Pickup orders do not
   receive the delivery contact/coordinate fields.
3. Missing or malformed coordinates remain link-free and are labeled `Not provided`; map links are
   never built from invalid values. The display formatter does not alter the server's fee or
   distance calculation.
4. Guest proof validation remains server-authoritative. Rotating the client intent after a
   successful order preserves the existing proof/email/idempotency binding and forces a fresh OTP
   request for the next order.

## Verification Evidence

1. Storefront OTP hook, contract, and UI regression tests cover explicit remembered-email request
   sequencing and proof/idempotency rotation.
2. Shared POS queue tests cover card/table/sidebar rendering, exact coordinate precision, phone
   fallback, invalid-pin link suppression, and pickup isolation.
3. Storefront and POS lint/build checks plus repository docs, architecture, compliance, and
   whitespace checks must pass before release.

## Deployment Note

The change is presentation/state-only over existing contracts. A rollback is a code revert; no
database cleanup is required.
