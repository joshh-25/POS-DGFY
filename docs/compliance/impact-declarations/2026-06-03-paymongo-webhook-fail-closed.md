---
status: reference
owner: engineering
last_reviewed: 2026-06-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-03-paymongo-webhook-fail-closed
classification: regulatory
surfaces: payments,subscriptions,webhooks,production-config
reason_codes_impacted: PAYMONGO_WEBHOOK_SIGNATURE_FAIL_CLOSED,PAYMENT_WEBHOOK_REPLAY_GUARD
policy_version: 2026.06.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/paymongoWebhookSignature.test.js,npm run check:architecture,npm run check:compliance
rollback_note: Revert PayMongo verifier and webhook tests together only if PAYMENTS_ENABLED remains false; do not restore unsigned production webhook acceptance.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-03T00:00:00+08:00
preflight_request_ref: PAYMONGO-WEBHOOK-FAIL-CLOSED-2026-06-03
---

# PayMongo Webhook Fail-Closed Verification

## Compliance Impact Classification

Regulatory.

This declaration covers PayMongo webhook signature hardening for subscription/payment routes. The change is compliance-sensitive because forged provider events could alter payment, subscription, or tenant access state when payment workflows are intentionally enabled.

## Affected Surfaces

- PayMongo webhook verification now rejects missing secrets by default.
- Missing, invalid, stale, or mode-mismatched PayMongo signatures are rejected before payment mutation.
- Unsigned webhook bypass is limited to explicit non-production local use while payments are disabled.
- PayMongo replay handling remains idempotent through the existing webhook log dedupe path.

## Compliance Preconditions

1. Production and payment-enabled environments must configure `PAYMONGO_WEBHOOK_SECRET` or the correct mode-specific webhook secret.
2. PayMongo webhook verification must use the raw request body and the documented timestamped signature format.
3. Invalid PayMongo signatures must return `401` before webhook-log creation or business mutation.
4. Replay handling must not create duplicate payment records or repeat subscription state mutation.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/paymongoWebhookSignature.test.js`
2. `npm --prefix backend test -- --runTestsByPath tests/paymentHandlers.publicRoutes.transport.test.js tests/paymentHandlers.simulateWebhook.test.js tests/paymentsRoutes.disabled.transport.test.js tests/billingFunnelTelemetry.usecases.legacy.test.js tests/paypalWebhookVerification.test.js`
3. `npm run lint:docs`
4. `npm run check:architecture`
5. `npm run check:compliance`

## No Fiscal Document Contract Change

This change does not alter fiscal document classification, receipt numbering, POS ledger persistence, eSales reporting, or BIR accreditation claims. It hardens payment-provider webhook authenticity before payment state can affect tenant access or subscription behavior.
