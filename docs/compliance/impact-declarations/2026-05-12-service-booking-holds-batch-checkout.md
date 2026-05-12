---
status: reference
owner: engineering
last_reviewed: 2026-05-12
related_adr: 0016-services-mode-independent-booking-and-ticketing.md,0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-12-service-booking-holds-batch-checkout
classification: major
surfaces: storefront,services_api,pos_stock
reason_codes_impacted: ALLOWED,TRANSACTION_MODE,SERVICE_BOOKING
policy_version: 2026.05.12
verification_evidence: npm --prefix backend run check:architecture-guardrails,npm --prefix backend run check:controller-boundaries,npm --prefix backend test -- --runInBand tests/servicesMode.usecases.test.js,npm --prefix frontend run build,npm run check:compliance,npm run check:compliance-api-contracts
rollback_note: Revert service booking, holds, batch, and availability commits; then verify existing single-booking POS/Storefront checkout still operates independently without holds or batch structures.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-12T00:00:00+08:00
preflight_request_ref: SERVICE-BOOKING-HOLDS-2026-05-12
---

# Service Booking Holds And Batch Checkout Hardening

## Compliance Impact Classification

Major.

This declaration covers service booking hold creation, replacement, expiration, capacity reservation, and batch all-or-nothing checkout implementation. It adds new public storefront endpoints for availability reads and hold creation, extends existing service booking endpoints with quantity support, and implements batch checkout. It does not alter fiscal receipt issuance, tax calculation, payment authorization, or POS stock deduction for non-service items.

## Affected Surfaces

- Storefront public service availability endpoint (read-only, no-store, no customer data exposure).
- Storefront public service booking holds endpoint (idempotent, short-lived, capacity-reserved).
- Storefront public service batch booking endpoint (all-or-nothing, per-booking payment).
- POS stock bypass enforcement: service items (category=service) do not trigger FIFO/location stock deduction.
- Customer Access Mode enforcement: only transaction-mode tenants may use booking holds and batch checkout.

## Compliance Preconditions

1. Service bookings are separate from stock-bearing POS sales. Stock is never deducted for service-only rows (category=service) regardless of POS or Storefront visibility.
2. Physical products, add-ons, supplies, and stock-bearing items sold through Storefront must continue to respect location stock and FIFO contracts even when sold as part of a Services Mode tenant multi-item cart.
3. Public availability reads must not expose booking customer contact data, prior booking details, or private resource assignment metadata.
4. Booking holds are short-lived (auto-expire) and must not block legitimate customer retries when drafts are edited.
5. Batch bookings are atomic: if any draft fails validation, no booking is created and the error includes the failing draft index.
6. Batch booking payment responses must include per-booking payment URLs. Frontends must render every payment URL, not only a summary.
7. Idempotency is enforced: matching idempotency_key replays the existing response; different request payloads with the same key return conflict.
8. Quantity support multiplies capacity checks: quantity > 1 requires an active assigned resource with sufficient capacity; provider-only and location-only bookings remain effective capacity 1.
9. Hold-to-booking flow: holds may reserve capacity briefly, may be replaced by edited drafts, and must be consumed by final booking mutation through hold_token.

## Verification Evidence

- `npm --prefix backend run check:architecture-guardrails`
- `npm --prefix backend run check:controller-boundaries`
- `npm --prefix backend test -- --runInBand tests/servicesMode.usecases.test.js`
- `npm --prefix frontend run build`
- `npm run check:compliance`
- `npm run check:compliance-api-contracts`

## Services Mode Contract Enforcement

- POS catalog reads exclude service items when POS service visibility is not yet enabled.
- Storefront availability reads accept service_item_id, date, quantity, and optional location/resource/provider scope.
- Storefront hold creation accepts idempotency_key and optional replace_hold_token for draft editing without self-blocking.
- Storefront batch booking accepts multiple drafts with shared customer fields and per-draft service/quantity/schedule/payment data.
- Customer Access Mode effective_mode must be `transaction` to permit hold and batch booking mutations.
- Intake form required fields block booking until completed.
- Resource assignment and capacity validation is transactional: booking mutations revalidate under lock regardless of prior availability response.

## No Architecture Exception Required

This change is within the established Services Mode boundary (ADR 0016). No controller allowlist or architecture allowlist entry is needed.
