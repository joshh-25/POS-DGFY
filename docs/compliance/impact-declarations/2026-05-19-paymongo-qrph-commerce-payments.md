---
status: reference
owner: engineering
last_reviewed: 2026-06-26
related_adr: docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md
declaration_id: 2026-05-19-paymongo-qrph-commerce-payments
classification: regulatory
surfaces: payments,storefront_catalog,pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,SERVICE_UNAVAILABLE
policy_version: 2026.05.19
verification_evidence: npm run check:architecture,npm run lint:docs,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:store,git diff --check,node --check changed backend payment files,npm --prefix backend run verify:commerce-payment-migration,npm --prefix backend run verify:paymongo:sandbox,npm --prefix backend run verify:paymongo:webhook,npm --prefix backend test -- --runTestsByPath tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentValidator.test.js tests/commercePaymentSettlement.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/paymongoWebhookSignature.test.js
rollback_note: Set COMMERCE_PAYMENTS_ENABLED=false or COMMERCE_QRPH_ENABLED=false to hide Storefront QR Ph payment sessions while keeping cash/on-delivery Storefront checkout available.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-19T00:00:00+08:00
preflight_request_ref: PAYMONGO-QRPH-COMMERCE-PAYMENTS-2026-05-19
---

# PayMongo QR Ph Commerce Payments

## Compliance Impact Classification

Major.

This declaration covers adding PayMongo QR Ph Storefront commerce payment sessions with platform split settlement for the mandatory ADR 0012 DGFY 1% convenience fee. The change is payment-sensitive because it introduces a new online payment handoff, provider webhook route, landlord payment-session records, and provider references on tenant order records. It does not alter fiscal receipt issuance, tax calculation, compliance activation, or POS terminal certification rules.

## Affected Surfaces

- Public Storefront product/F&B checkout can create a PayMongo QR Ph payment session before order creation.
- PayMongo webhooks finalize Storefront orders only after `payment.paid`.
- The mandatory DGFY 1% convenience fee is snapshotted before provider handoff and sent as a fixed centavo split to the DGFY PayMongo account.
- The DGFY 1% fee is based on item subtotal only and is charged to the customer as an added platform fee.
- PayMongo/provider processing, payout, bank, dispute, and related provider fees are shouldered by the tenant/company and reduce company net settlement unless a separate signed provider contract says otherwise.
- Tenant PayMongo child-merchant readiness is tracked landlord-side in `tenant_payment_accounts`.
- Platform Admin > Payments can create a tenant PayMongo child merchant from an existing tenant record and store the returned child merchant ID as pending readiness.
- Tenant PayMongo wallet status and wallet verification timestamp are tracked landlord-side and are required before split/charge readiness can be enabled.
- `commerce_payment_sessions` stores immutable checkout payloads, provider IDs, QR image URLs, split payloads, and manual-resolution states.
- Tenant `pos_transactions` store payment status/reference/provider/session metadata for online-store order reconciliation.
- Platform Admin > Payments exposes tenant PayMongo readiness setup, payment-session reconciliation, paid-session finalization retry, and PayMongo refund submission for proportional, tenant-shouldered, and DGFY-shouldered split refunds.
- Platform Admin > Payments exposes local settlement reporting, CSV export, and app-verifiable PayMongo sandbox readiness checks.

## Compliance Preconditions

1. Storefront QR Ph must remain feature-gated by `COMMERCE_PAYMENTS_ENABLED` and `COMMERCE_QRPH_ENABLED`.
2. Split settlement must require a configured DGFY PayMongo merchant ID and active tenant PayMongo child merchant readiness.
3. Orders must not be created from QR Ph sessions until PayMongo confirms `payment.paid`.
4. Failed or expired QR Ph sessions must not silently create sales records.
5. Paid sessions that fail order finalization must enter manual resolution for reconciliation instead of being marked successful.
6. Provider webhook signature verification must be enabled before production traffic.
7. Refunds and reversals require provider-aware reconciliation before automated refund behavior is exposed.
8. Refund actions must remain admin-authenticated, validator-checked, and must not exceed the recorded refundable balance.
9. Finalization retry must remain idempotent and must not duplicate tenant orders.
10. Pending PayMongo refunds must not be reported as completed tenant refunds until PayMongo reports terminal success.
11. Settlement reporting must distinguish local gross/split/refund evidence from PayMongo provider-fee and payout truth.
12. Live enablement remains blocked until PayMongo sandbox evidence confirms QR payment, split acceptance, webhook signature, and refund behavior with real sandbox credentials and child merchants.
13. Tenant payment readiness must include PayMongo verification evidence before QR Ph/split/charge flags can be enabled.
14. Commerce payment migration changes must pass the static migration contract verifier before any production migration run, then still require a disposable MySQL up/down test.
15. PayMongo API connectivity must use the configured unified API base URL and be rechecked with `npm --prefix backend run verify:paymongo:sandbox` after credential rotation.
16. Landlord commerce payment records must store tenant IDs as UUIDs to match `tenants.id`; integer tenant coercion is invalid.
17. Sandbox webhooks must use a public HTTPS endpoint such as ngrok and must reject unsigned probes with `401`; `404` or ngrok `502` are setup failures, not successful webhook readiness.
18. Webhook signing secrets must be stored only in environment configuration. Documentation may record that the secret was configured and verified, but must not record the secret value.
19. Live webhooks must use `PAYMONGO_LIVE_WEBHOOK_SECRET` with `PAYMONGO_MODE=live`; production traffic must not reuse sandbox webhook secrets.
20. The live PayMongo webhook must not be considered ready until an unsigned probe to `https://skupervisor.surebizcorp.com/api/v1/commerce-payments/paymongo/webhook` returns `401 Invalid PayMongo webhook signature` after deployment.
21. Webhook signature verification must reject missing signatures by default and reject stale timestamps outside the configured tolerance.
22. Non-proportional PayMongo split-refund source values must equal the requested refund amount before the app calls the provider API.
23. Company and marketplace terms must disclose DGFY's platform role, the customer-paid 1% platform fee, DGFY's no-custody boundary, and tenant/company responsibility for PayMongo/provider fees.
24. Automated child-account creation must not enable QR Ph/split/charge readiness without PayMongo activation and wallet evidence.
25. API-generated tenant child merchant IDs must not be treated as the DGFY parent/platform merchant ID.
26. Live customer QR Ph split checkout must remain blocked until PayMongo confirms the parent merchant ID and live `split_payment.transfer_to` plus fixed `split_payment.recipients[].merchant_id` capability; this confirmation is represented by `PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED=true` or `PAYMONGO_PLATFORM_SPLIT_CONFIRMED=true`.
27. PayMongo support confirmed on June 25, 2026 that Linked Accounts is not configured for the account and self-service onboarding is still under development. Production customer checkout must continue to fail closed for PayMongo split settlement, and operators must not set the platform-split confirmation env flag until PayMongo explicitly enables the account.
28. DGFY must not replace unavailable PayMongo split settlement by collecting seller funds into a DGFY-controlled account and redistributing them manually unless a separate legal/compliance-approved custody and settlement model is adopted.

## Verification Evidence

- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix frontend run build:skupervisor`
- `npm --prefix frontend run build:store`
- `git diff --check`
- `node --check` on changed backend payment/session files
- backend tenant onboarding tests for optional PayMongo child-account creation
- `npm --prefix backend run verify:commerce-payment-migration`
- `npm --prefix backend run verify:paymongo:sandbox`
- `npm --prefix backend run verify:paymongo:webhook -- <https-webhook-url>` for sandbox or production endpoint reachability/signature-enforcement checks.
- Public ngrok webhook route probe returns `401 Invalid PayMongo webhook signature` for unsigned payloads, proving reachability without accepting forged events.
- Signed fake-session webhook probe returns `200` with `handled=false` and `reason=session_not_found`, proving the configured sandbox webhook secret is accepted without creating orders.
- This implementation pass does not include fresh production endpoint or PayMongo dashboard proof; production deployment and signed/unsigned live webhook probes are still required before live canary testing.
- PayMongo support confirmed on June 25, 2026 that Linked Accounts is not configured for the account and self-service onboarding is still under development; production customer use remains externally blocked until PayMongo explicitly enables the account and confirms the parent merchant ID plus live marketplace split-payment capability.
- `npm --prefix backend test -- --runTestsByPath tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentValidator.test.js tests/commercePaymentSettlement.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/paymongoWebhookSignature.test.js`

## No Architecture Exception Required

The change adds a governed Storefront commerce-payment boundary under ADR 0027 and keeps subscription billing, POS fiscal compliance, tenant isolation, and public Storefront checkout contracts in their existing module boundaries. No architecture allowlist entry is introduced.
