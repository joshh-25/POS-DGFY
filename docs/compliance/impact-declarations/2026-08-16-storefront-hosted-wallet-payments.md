---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-16-storefront-hosted-wallet-payments
classification: major
surfaces: payments,storefront,checkout,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.16
verification_evidence: hosted payment capability contracts,storefront checkout tests,PayMongo connectivity validation,frontend production build,architecture guardrails,compliance API contracts
rollback_note: Revert the hosted checkout capability mapping, payment-session creation and webhook verification, shared storefront payment panel, tests, documentation, and this declaration together; existing QR Ph and cash checkout records remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-16T17:30:00+08:00
preflight_request_ref: PHASE-95
---

# Storefront Hosted Wallet Payments

## Compliance Impact Classification

Major because the change expands the governed storefront payment surface from
QR Ph to provider-hosted card, GCash, and Maya sessions. Payment success is
still accepted only from the verified PayMongo webhook; browser return values
never mark an order paid. The implementation also contains explicitly opt-in
direct GCash, Maya, and card Payment Intent paths. Card details are tokenized
client-side through PayMongo and are not sent to DGFY; this declaration does
not authorize production activation.

## Affected Surfaces

1. Storefront payment-method availability and selection.
2. PayMongo hosted checkout session creation and callback URLs.
3. Commerce payment webhook reconciliation and order finalization.
4. Shared POS/terminal reconciliation contracts consumed by payment reporting.

## Compliance Preconditions

1. Hosted methods are displayed only when the server feature flag, provider
   configuration, tenant settlement policy, and PayMongo capability probe all
   report the method as available.
2. The browser creates a pending payment session and follows the provider URL;
   for direct GCash, Maya, and card variants, it creates and attaches the
   Payment Method with the public key and short-lived Payment Intent `client_key`;
   card details go directly to PayMongo, and the browser cannot submit a
   successful payment result directly.
3. Only a verified provider webhook may finalize a hosted payment and mark its
   associated order paid.
4. Cash checkout and the existing QR Ph policy remain available under their
   current authorization and settlement rules.
5. This declaration covers implementation and validation only; it does not
   authorize production credentials, deployment, or promotion to `main`.
6. Direct GCash, Maya, and card live confirmation flags are required whenever
   their corresponding direct path is enabled in `PAYMONGO_MODE=live`.

## Verification Evidence

1. Full storefront/frontend suite passed as part of the 332-file, 1,863-test
   frontend audit.
2. Backend commerce/payment contract groups passed in the 518-test backend
   matrix.
3. Production web builds, frontend bundle budgets, architecture guardrails,
   controller boundaries, compliance checks, and dependency audit passed.
4. PayMongo capability failures remain fail-closed and return explicit reason
   codes instead of exposing unsupported wallet choices.
