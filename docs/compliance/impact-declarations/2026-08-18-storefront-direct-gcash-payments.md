---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-storefront-direct-gcash-payments
classification: major
surfaces: payments,storefront,checkout,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.18
verification_evidence: direct GCash and Maya contract tests,signed webhook validation,livemode amount currency and idempotency checks,Storefront production build
rollback_note: Set STOREFRONT_DIRECT_GCASH_ENABLED=false and/or STOREFRONT_DIRECT_MAYA_ENABLED=false to restore Hosted Checkout for the corresponding wallet, or revert the direct Payment Intent backend/frontend changes and this declaration together; existing payment sessions remain governed by their stored provider state.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: ISSUE-679-DIRECT-GCASH-MAYA
---

# Storefront Direct GCash and Maya Payments

## Compliance Impact Classification

Major because the Storefront payment surface adds browser-side PayMongo Payment
Method and Payment Intent attachment flows for GCash and Maya. The browser can
only use a PayMongo public key and client key; payment success remains accepted
only from a verified provider webhook.

## Affected Surfaces

1. Storefront GCash and Maya checkout and provider authorization redirects.
2. PayMongo Payment Intents and Payment Method attachments.
3. Commerce payment webhook reconciliation and order finalization.
4. POS/terminal payment reporting and tenant settlement contracts.

## Compliance Preconditions

1. Live direct GCash and Maya are independently disabled unless each wallet's
   explicit environment flag pair is set.
2. PayMongo live GCash/Maya activation, live keys, and the signed HTTPS webhook
   are configured outside source control.
3. The provider webhook must match configured livemode, session amount, and
   currency before the shared finalization path can run.
4. Browser return URLs never mark a session paid and cannot create an order.
5. PayMongo split payments and automatic payouts remain disabled under the
   landlord-owned collection and internal tenant settlement model.
6. This declaration covers implementation and validation only; it does not
   authorize production credentials, deployment, or promotion to main.

## Verification Evidence

1. Backend direct-GCash/direct-Maya and production-environment contract tests
   pass.
2. Signed webhook tests cover livemode mismatch, amount/currency mismatch, and
   duplicate finalization handling.
3. Storefront contract tests cover public-key GCash/Maya Payment Method
   creation and client-key Payment Intent attachment without a Hosted Checkout
   URL.
4. Backend syntax, Storefront production build, architecture, and compliance
   checks pass.
