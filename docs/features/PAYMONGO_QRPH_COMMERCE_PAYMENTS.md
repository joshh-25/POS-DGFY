---
status: authoritative
authority_level: authoritative
owner: product_engineering
last_reviewed: 2026-06-10
applies_to: storefront_commerce_payments
topic: paymongo_qrph_commerce_payments
---

# PayMongo QR Ph Commerce Payments

## Current Implemented Slice

The current implementation adds Storefront product/F&B QR Ph checkout through landlord-owned commerce payment sessions. It snapshots the ADR 0012 mandatory DGFY 1% convenience fee, sends that amount as a fixed PayMongo split to the DGFY merchant account, and creates the tenant order only after PayMongo confirms `payment.paid`.

Authoritative architecture: `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md`.

Confirmed business contract from the June 8, 2026 alignment:
- The DGFY platform fee is 1% of item subtotal only.
- The customer pays the DGFY 1% as an added checkout platform fee.
- DGFY does not collect, hold, or custody seller settlement funds; PayMongo handles payment collection, split routing, wallet movement, and payout rails.
- PayMongo/provider processing, payout, bank, dispute, and related provider fees are shouldered by the registered company and reduce company net settlement unless a separate signed provider contract says otherwise.
- Full refunds must reverse the DGFY 1% and tenant/company share through provider-aware refund/split-refund reconciliation.
- Normal tenant reporting stays focused on gross sales and net sales; provider-fee and payout truth requires PayMongo reporting/payout integration.

The admin operations slice adds:
- Tenant PayMongo child merchant readiness create/update/list APIs and an Admin > Payments test panel.
- Payment-session listing, inspection, and paid-session finalization retry.
- PayMongo refund submission with proportional, tenant-shouldered, and DGFY-shouldered split-refund strategies.
- Refund attempt storage in `commerce_payment_refunds`, PayMongo `payment.refunded` / `payment.refund.updated` webhook status updates, and tenant order `payment_status` reconciliation through `refund_pending`, `partial_refunded`, or `refunded`.
- Admin payment validators reject malformed payment-session IDs, refund payloads, unsafe status filters, and malformed tenant readiness payloads before use-case execution.
- Settlement reporting for QR Ph commerce sessions, including gross amount, fixed DGFY 1% split, estimated tenant gross, succeeded/pending refunds, reconciliation variance, provider IDs, and CSV export from Admin > Payments.
- PayMongo sandbox certification readiness checks for required test keys, webhook signature verification, split payload shape, and explicit child-merchant evidence still required outside the app.
- Audit-log entries for tenant readiness changes, finalization retry, refund submission, and refund webhook reconciliation.
- Tenant payment readiness cannot be enabled without PayMongo evidence metadata (`verification_reference` and `verified_at`) stored with the tenant payment account.
- Split/charge readiness also requires enabled-wallet evidence (`wallet_status=enabled` and `wallet_verified_at`) because PayMongo wallet state affects settlement and broader payment-method eligibility.
- A migration contract verifier checks the commerce payment migration includes landlord tables, tenant order payment statuses, and rollback coverage before real database up/down testing.
- Sandbox API connectivity was verified against PayMongo's unified `https://api.paymongo.com/v1` host with the configured test key; the legacy `api-sandbox.paymongo.com` host failed from the local environment and must not be used unless PayMongo reintroduces it.
- Admin > Payments can initiate PayMongo child merchant creation for a tenant after the tenant exists, then stores the returned child merchant ID as pending readiness. This removes routine manual child-account typing but does not mark QR Ph active until PayMongo activation/readiness evidence is recorded.
- Auto child-account creation after tenant provisioning is gated by `PAYMONGO_AUTO_CREATE_CHILD_ACCOUNTS=true`. Failures are logged and do not roll back tenant creation because PayMongo onboarding is an external provider workflow.
- Admin > Payments can sync child merchant requirements, submit a child merchant for review, and call PayMongo account activation. Activation may set tenant QR Ph readiness, but split/charge readiness and wallet status remain evidence-gated unless PayMongo returns explicit wallet/capability evidence or an operator records verified evidence manually.
- Commerce payment sessions store a `fee_policy` snapshot stating `dgfy_fee_basis=subtotal`, `dgfy_fee_charged_to=customer`, and `provider_fee_shoulder=tenant_company`.

## Production Completion Evaluation Scope

The PayMongo QR Ph commerce-payment program is not complete until the following slices are implemented and validated:

| Slice | Required Outcome | Completion Evidence |
|---|---|---|
| Refunds and reversals | Operators can process full/partial refunds safely, including PayMongo refund status, split reversal handling, DGFY fee policy, tenant order status, and audit logs. | Backend refund contract tests, PayMongo sandbox refund evidence, reconciliation export sample. |
| Tenant PayMongo onboarding | Platform or tenant admins can create, sync, review, enable, and disable PayMongo child merchant readiness without manual database edits. | Child merchant sync logs, readiness-state transition tests, rollback steps. |
| Services/reservation QR Ph | Services bookings, F&B reservations, and Hospitality reservations can use QR Ph only when payment sessions are bound to active holds/reservation locks. | Hold-bound payment tests, expired-hold payment rejection tests, duplicate-booking prevention tests. |
| Payment reconciliation dashboard | Operators can inspect and resolve pending, paid, finalized, failed, expired, and manual-resolution payment sessions. | Role/permission checks, export sample, manual-resolution runbook. |
| Webhook replay/finalization retry | Authorized operators can retry local finalization for paid sessions without duplicate orders. | Audit-log evidence, duplicate-order prevention tests. |
| Settlement and fee reporting | DGFY and tenant settlement reporting shows gross, fixed 1% split, estimated tenant gross, refund exposure, provider IDs, and variance. | Report/export tests and CSV export from Admin > Payments. Provider fee and payout status still require PayMongo reporting/payout data. |
| PayMongo sandbox certification | The app exposes credential/config/signature/split-shape checks and lists required external sandbox evidence. | Timestamped sandbox evidence, webhook payload samples, split/refund verification notes. Full certification still requires real PayMongo sandbox credentials and child merchants. |

## Credential Verification

- `PAYMONGO_MODE=test` uses the configured test keys and `PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1`.
- `npm --prefix backend run verify:paymongo:sandbox` creates a test Payment Intent, QR Ph Payment Method, and attached QR Ph next action without printing secrets.
- Live connectivity probes are blocked by default; `node backend/scripts/verify-paymongo-connectivity.js --live` requires `PAYMONGO_ALLOW_LIVE_CONNECTIVITY_PROBE=true` and must only be used for a controlled live canary.
- Full split certification still requires `PAYMONGO_DGFY_MERCHANT_ID` and a verified tenant child merchant ID.
- Webhook secrets are mode-specific when available: `PAYMONGO_TEST_WEBHOOK_SECRET` is used in test mode and `PAYMONGO_LIVE_WEBHOOK_SECRET` is used in live mode. `PAYMONGO_WEBHOOK_SECRET` remains a fallback for older environments.
- Webhook signature verification is enforced by default. Unsigned webhook bypass is only allowed when `PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=true` in a non-production, non-live environment.
- Webhook signatures reject stale timestamps outside `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` seconds; default tolerance is `300`.

## Sandbox Webhook Setup Runbook

Use this when creating the PayMongo test-mode webhook for local sandbox verification.

1. Confirm the local backend is running on port `5000` with `GET http://127.0.0.1:5000/health`.
2. Start ngrok against the backend: `ngrok http 5000`.
3. Copy the HTTPS forwarding origin that ngrok prints. Example format: `https://example.ngrok-free.dev`.
4. In PayMongo Dashboard, create a test webhook with endpoint URL:
   - `https://example.ngrok-free.dev/api/v1/commerce-payments/paymongo/webhook`
5. Select only the events used by this implementation:
   - `payment.paid`
   - `payment.failed`
   - `payment.refund.updated`
   - `payment.refunded`
   - `qrph.expired`
   - `account.activated`
   - `account.declined`
   - If the dashboard exposes them instead of account events: `merchant.activated` and `merchant.declined`
6. Copy the webhook signing secret from PayMongo and set it as `PAYMONGO_TEST_WEBHOOK_SECRET` in `backend/.env`; restart the backend after changing it.
7. Probe the public route with an unsigned request only to confirm reachability: `npm --prefix backend run verify:paymongo:webhook -- https://example.ngrok-free.dev/api/v1/commerce-payments/paymongo/webhook`. Expected result is `401 Invalid PayMongo webhook signature`; a `404` means the backend is stale or the route is not mounted, and a `502` means ngrok cannot reach local port `5000`.
8. Probe the public route with a locally signed test payload after setting `PAYMONGO_WEBHOOK_SECRET`. Expected result for a fake session reference is `200` with `handled=false` and `reason=session_not_found`; this proves the signature secret is correct without creating an order.

Current local sandbox status:
- No durable ngrok URL is part of the repository contract. Re-check `http://127.0.0.1:4040/api/tunnels` before each sandbox session and update the PayMongo webhook if ngrok issues a different forwarding URL.
- The sandbox webhook signing secret must be configured locally in `backend/.env` as `PAYMONGO_TEST_WEBHOOK_SECRET` before signed webhook probes can pass. Do not record the secret value in documentation; rotate it from PayMongo Dashboard if it is exposed.

## Production Webhook Setup Runbook

Use this when creating the PayMongo live-mode webhook.

1. Confirm the production backend has the commerce payment routes deployed. An unsigned probe to the live endpoint must return `401 Invalid PayMongo webhook signature`; `404 Route /api/v1/commerce-payments/paymongo/webhook not found` means production is not yet updated.
2. Create the live webhook endpoint in PayMongo Dashboard:
   - `https://skupervisor.surebizcorp.com/api/v1/commerce-payments/paymongo/webhook`
3. Select only the live events used by this implementation:
   - `payment.paid`
   - `payment.failed`
   - `payment.refund.updated`
   - `payment.refunded`
   - `qrph.expired`
   - `account.activated`
   - `account.declined`
   - If the dashboard exposes them instead of account events: `merchant.activated` and `merchant.declined`
4. Copy the live webhook signing secret from PayMongo and set it as `PAYMONGO_LIVE_WEBHOOK_SECRET` on the production server. Do not reuse the sandbox secret.
5. Set production `PAYMONGO_MODE=live`, live API keys, `PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1`, `PAYMONGO_DGFY_MERCHANT_ID`, and commerce feature flags.
6. Restart the production backend and re-probe the endpoint before running any live canary payment.
7. Use `PAYMONGO_WEBHOOK_ENDPOINT_URL=https://skupervisor.surebizcorp.com/api/v1/commerce-payments/paymongo/webhook npm --prefix backend run verify:paymongo:webhook` from a shell that supports inline env, or pass the URL as the script argument from PowerShell.

Current production setup status:
- This implementation pass does not include fresh production endpoint or PayMongo dashboard evidence.
- `https://skupervisor.surebizcorp.com/api/v1/commerce-payments/paymongo/webhook` must return `401 Invalid PayMongo webhook signature` for unsigned probes after deployment and before any live canary payment is attempted.

## Non-Negotiable Guardrails

1. Direct `/store/checkout` must not self-finalize `payment_type=qrph`.
2. Paid QR Ph sessions must be idempotent and must not create duplicate tenant orders.
3. Failed, expired, or unsigned webhook events must not create orders.
4. Refund automation must not ship until split reversal behavior and DGFY fee treatment are explicitly tested.
5. Reservation-like payments must not ship without hold-token or equivalent lock binding.
6. Tenant QR Ph must not be shown to customers unless PayMongo readiness is active for charges, QR Ph, and split settlement.
7. Tenant split/charge readiness must not be enabled unless PayMongo wallet evidence confirms an enabled wallet and stores the verification timestamp.
8. Company registration and marketplace terms must disclose that PayMongo/provider fees are shouldered by the registered company.
9. Child-account creation may be automated, but child-account activation and wallet readiness must remain evidence-gated.

## Hardening Notes Added After Critical Evaluation

- Refund submission no longer marks the Storefront order as `partial_refunded` or `refunded` while PayMongo reports the refund as pending. Pending provider refunds reserve refundable balance and move the payment session to `refund_pending`; only terminal successful refund reconciliation can mark the order partially or fully refunded.
- Refund webhooks are resolved by PayMongo `provider_refund_id` before session metadata is required, because PayMongo refund event payloads may not carry the original commerce payment-session metadata.
- Admin > Payments is now the operator surface for PayMongo child-merchant onboarding actions: create child account, sync requirements, submit review, and request activation. Active QR Ph readiness can be set only from PayMongo activation evidence, and split/charge readiness still requires explicit wallet/capability evidence from PayMongo or manually recorded operator evidence.
- Services/reservation QR Ph remains intentionally gated off. The service booking UI labels its payment area as a manual preview until a hold-bound commerce payment session prevents expired-hold payment, duplicate booking, and orphan settlement risks.
- Admin > Payments now includes settlement summary cards, certification check visibility, expandable provider/refund evidence, and CSV export for reconciliation review.
- The current settlement report estimates tenant gross from stored total minus the fixed DGFY split. It does not claim provider-fee or payout truth until PayMongo payout/reporting data is integrated.
- Tenant readiness setup now requires a PayMongo verification reference and verification date before active/charge/split/QR Ph flags can be enabled.
- Tenant readiness setup now stores wallet status and wallet verification date; split/charge readiness is blocked unless the wallet is `enabled`.
- PayMongo activation webhooks are intentionally conservative: `account.activated` or `merchant.activated` can mark onboarding active and QR Ph ready, but split/charge/wallet readiness remains false unless the provider payload or operator evidence explicitly proves those capabilities.
- Custom split-refund payloads are rejected unless the `refund_sources` values exactly equal the requested refund amount, preventing accidental underfunded or overfunded split reversal requests.
- PayMongo webhook verification now rejects missing signatures by default and rejects stale timestamps to reduce replay risk.
- The sandbox certification panel includes a warning for PayMongo child-account webhook registration because parent-account requests acting as a child account may send webhooks to the child account endpoint.
- Landlord commerce payment tables store `tenant_id` as UUID to match the authoritative `tenants.id` schema; integer tenant IDs are not valid for PayMongo readiness or settlement filters.
- Fresh backend restarts must expose `storeController.createCheckoutPaymentSession` and `storeController.getCheckoutPaymentSession`; if `/store/checkout/payment-sessions` route registration fails, PayMongo webhook testing also fails because the backend never starts.
- `db.TenantPaymentAccount`, `db.CommercePaymentSession`, and `db.CommercePaymentRefund` must be present on the default model registry; otherwise signed webhook handling can pass authentication but fail during session/refund lookup.
