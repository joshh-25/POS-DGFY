---
status: draft_pr
owner: DGFY payments/integration
last_reviewed: 2026-09-02
related_adr: docs/architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-09-02-dglaundry-booking-payments
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,SERVICE_UNAVAILABLE,PAYMENT_WEBHOOK_REPLAY_GUARD
policy_version: 2026.09.02
verification_evidence: npm run check:compliance,npm run check:architecture,node --check changed payment files,node --test targeted payment tests,git diff --check
rollback_note: Keep DGLAUNDRY_BOOKING_PAYMENTS_ENABLED=false and retain the global or per-branch kill switch; revert the PR only with the migration rollback plan.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T21:42:22+08:00
preflight_request_ref: PR-1316
---

# DGLaundry booking payments impact declaration

## Compliance Impact Classification

Major.

This declaration covers the additive `dglaundry_booking` payment target, fixed
child QR Ph charge flow, payment-confirmed provider submission, cancellation
and refund event forwarding, and the associated PayMongo webhook surfaces. It
does not change DGFY's existing tenant payment authority or fiscal/POS receipt
rules.

## Affected Surfaces

- Storefront booking payment-session creation and immutable payment snapshots.
- PayMongo payment-paid, expiry, cancellation, refund, and reconciliation paths.
- Provider-facing signed order/payment-status events and idempotent replay handling.
- Mixed bookings charge only the fixed child online; the per-kilo child remains
  a DGLaundry-owned reservation for counter measurement and conversion.

## Compliance Preconditions

1. `DGLAUNDRY_BOOKING_PAYMENTS_ENABLED` remains dark until provider, PayMongo,
   hosted callback, refund/receipt, and approved-branch evidence is complete.
2. Production webhook verification uses the configured PayMongo secret and raw
   request body; unsigned or replayed events must not mutate payment state.
3. DGLaundry partner events use the asymmetric HTTP Message Signature profile
   with a configured public key and idempotent event identifiers.
4. Paid-session failures remain recoverable manual-resolution states and must
   not be reported as fulfilled orders automatically.
5. Refund and cancellation forwarding remains auditable and retry-safe; counter
   tenders stay DGLaundry-owned.

## Verification Evidence

- `npm run check:compliance`
- `npm run check:architecture`
- `node --check` for changed payment, finalization, and migration files.
- Targeted booking-payment and finalization tests covering fixed, per-kilo,
  mixed, expiry/cancellation, refund, and idempotent paths.
- `git diff --check`.

Hosted PayMongo, TLS/SAN, cross-repository, MySQL/Redis, approved-branch, and
production payment evidence remain deployment gates and are not claimed by this
declaration.
