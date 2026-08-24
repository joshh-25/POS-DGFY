---
status: authoritative
authority_level: authoritative
owner: payments
last_reviewed: 2026-08-19
applies_to: storefront_direct_paymongo_gcash_maya_card
topic: direct_paymongo_payment_verification
---

# Direct PayMongo Payment Verification Process

This runbook verifies the Storefront direct authorization flows for GCash, Maya,
and credit card. It is the release process for the direct Payment Intent path;
it is not a Hosted Checkout verification.

## 1. Payment contract

For each direct method, the flow is:

1. Storefront asks DGFY to create a landlord-owned PayMongo Payment Intent.
2. DGFY locks the amount, currency, tenant, selected method, return URL, and
   payment session.
3. The browser creates the provider Payment Method using only the PayMongo
   public key and attaches it with the short-lived Payment Intent `client_key`.
4. GCash and Maya redirect the customer to wallet authorization. Card either
   completes the Payment Intent or redirects to PayMongo 3-D Secure.
5. The browser return is only a recovery/status signal. It never marks an order
   paid.
6. A verified signed `payment.paid` webhook is the only payment confirmation.
7. DGFY finalizes one Storefront/POS order and records the immutable revenue
   evidence. POS fulfillment and tenant settlement remain separate gates.

Direct GCash, Maya, and card must not create a PayMongo Hosted Checkout session.
The direct session response must have `payment_flow` set to the selected direct
flow and `checkout_url` empty/null.

## 2. Method and environment matrix

| Method | Payment Intent type | Test flag | Live confirmation flag | Customer authorization |
| --- | --- | --- | --- | --- |
| GCash | `gcash` | `STOREFRONT_DIRECT_GCASH_ENABLED` | `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED` | GCash authorization screen/app |
| Maya | `paymaya` | `STOREFRONT_DIRECT_MAYA_ENABLED` | `STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED` | Maya authorization screen/app |
| Credit card | `card` | `STOREFRONT_DIRECT_CARD_ENABLED` | `STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED` | Card authorization or PayMongo 3-D Secure |

Non-production direct testing uses:

```dotenv
PAYMONGO_MODE=test
COMMERCE_PAYMENTS_ENABLED=true
COMMERCE_PAYMONGO_SPLIT_ENABLED=false
TENANT_REVENUE_SHARING_ENABLED=true

STOREFRONT_DIRECT_GCASH_ENABLED=true
STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=false
STOREFRONT_DIRECT_MAYA_ENABLED=true
STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=false
STOREFRONT_DIRECT_CARD_ENABLED=true
STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED=false

PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=false
PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300
STOREFRONT_PAYMENT_RETURN_URL=<local-or-public-storefront-return-origin>
```

Use test-mode keys and a test-mode webhook secret. Never place real keys,
webhook secrets, card numbers, CVCs, or full provider payloads in source control,
screenshots, or logs.

## 3. Local preflight

Run these checks from the repository root before opening the Storefront:

```powershell
npm run check:production-env
npm run check:architecture
npm run check:compliance
npm run check:compat-seams
npm run audit:dependencies:prod
npm --prefix apps/dgfy-storefront run build
```

Confirm the local services respond:

| Surface | Expected URL |
| --- | --- |
| SKUpervisor | `http://127.0.0.1:5173` |
| POS | `http://127.0.0.1:5174` |
| Storefront | `http://127.0.0.1:5175` |
| API health | `http://127.0.0.1:5000/api/v1/health` |
| Device bridge health | `http://127.0.0.1:5101/health` |

The API health response must report a connected database, healthy runtime
schema, zero missing migrations, and zero missing required columns. Redis may be
disconnected only when the selected local hosting profile marks it optional.

Use a transaction-enabled local storefront with an in-stock item. Do not use a
catalog-only storefront: it will correctly hide checkout and payment controls.

## 4. Automated contract gates

Run the backend payment and security suites:

```powershell
npm --prefix apps/dgfy-api test -- --runInBand tests/paymongoDirectGcash.test.js tests/storeDirectGcash.usecase.test.js tests/paymongoHostedCheckout.test.js tests/productionEnvValidation.test.js tests/paymongoWebhookSignature.test.js tests/paymentHandlers.simulateWebhook.test.js tests/finalizePaidCommerceSession.usecase.test.js tests/storePaymentTruth.unit.test.js
```

Run the Storefront payment contracts:

```powershell
npm --prefix apps/dgfy-storefront test -- src/__tests__/simpleCheckoutOnlinePayments.contract.test.js src/__tests__/fnbStorefront.contract.test.js
```

These tests prove branch routing, payload contracts, card retry behavior,
return-state recovery, signature rejection, idempotent finalization, and
production-flag fail-closed behavior. They do not prove PayMongo dashboard
activation or real provider authorization.

## 5. UI verification for each method

Repeat the following sequence once for GCash, once for Maya, and once for card.
Use a fresh cart and a unique test reference for each attempt.

1. Open the transaction-enabled Storefront on desktop and mobile.
2. Add one available item and open checkout.
3. Complete customer details and fulfillment, then open **Review & Payment**.
4. Select exactly one method from the payment selector.
5. Confirm the method-specific UI appears:
   - GCash: wallet authorization instructions/action.
   - Maya: Maya authorization instructions/action.
   - Card: cardholder, card number, expiry, and CVC fields plus the 3-D Secure
     notice.
6. Submit once and verify the submit control is disabled while the request is
   pending. Do not click again while the status says payment is processing.
7. Confirm the browser never navigates to a URL whose host is
   `checkout.paymongo.com` for these direct methods.
8. Complete the provider authorization. For card, complete the 3-D Secure page
   when PayMongo returns one, then allow the browser to return to the payment
   session URL.
9. Refresh the return page. The UI must poll the authoritative payment-session
   API and show the current state without resubmitting the payment method.
10. Wait for the signed `payment.paid` webhook before treating the order as
    paid. A browser return alone is not a success proof.

For card test mode, use only PayMongo-approved test card values. The repository
contract uses `4343434343434345` for a successful card path and
`4120000000000007` for a 3-D Secure path; use a future expiry and the documented
test CVC. Never use a real card.

Expected UI states:

| State | Expected behavior |
| --- | --- |
| `awaiting_payment` | Authorization instructions remain visible; no order is marked paid. |
| `payment processing` | Duplicate submit is blocked; customer is told not to pay again. |
| `awaiting_payment_method` | Card form returns with a retryable provider error; no payment is falsely marked paid. |
| 3-D Secure return | Card form stays hidden; status polling resumes. |
| `paid`/`finalized` | Tracking/order confirmation appears only after webhook-backed finalization. |
| `failed`/`expired` | Clear failure state; no paid order or settlement entry is created. |

## 6. API and webhook verification

Capture only redacted evidence. Keep IDs, statuses, timestamps, and HTTP codes;
redact keys, secrets, card data, CVCs, authorization URLs, and personal data.

For each method, verify the following sequence:

1. `POST /api/v1/store/checkout/payment-sessions` returns `201`.
2. The response contains the selected direct `payment_flow`, a provider Payment
   Intent ID, a public key/client key, and the server-generated return URL.
3. The direct session does not contain a Hosted Checkout URL.
4. The Payment Intent remains unfinalized until PayMongo sends `payment.paid`.
5. A signed webhook reaches
   `/api/v1/commerce-payments/paymongo/webhook` and returns a successful
   handling response.
6. `GET /api/v1/store/checkout/payment-sessions/:payment_session_id` eventually
   reports the finalized state and order/tracking linkage.
7. The linked order has the selected payment method, PayMongo provider, paid
   status, payment-session reference, and exactly one POS transaction.
8. Replaying the same webhook does not create another order, ledger entry, or
   tracking PIN.

Do not use `POST .../confirm-test` as proof for direct GCash, Maya, or card. That
endpoint is the explicit local/test confirmation path for the supported test
payment flow; direct methods must be proven through provider authorization and a
verified webhook.

For a public webhook endpoint, first verify reachability with an unsigned probe.
The expected result is `401 Invalid PayMongo webhook signature`. A `404` means
the route is not deployed; a `5xx` means the backend or proxy is unhealthy.
Then run one real sandbox authorization and verify the signed event, rather than
using a fabricated paid event as the final payment proof.

## 7. Negative and safety checks

The release candidate fails this process if any of these occur:

- direct GCash, Maya, or card opens Hosted Checkout;
- a browser return marks a session or order paid without `payment.paid`;
- card number or CVC is sent to a DGFY backend route or stored in DGFY logs;
- an unsigned, invalid, stale, or livemode-mismatched webhook mutates payment
  state;
- a duplicate webhook creates a second order or revenue posting;
- amount, currency, tenant, or payment-method mismatch is accepted;
- a missing live-confirmation flag enables a direct method in live mode;
- a failed or expired payment creates an order or settlement entry;
- a payment is treated as tenant-settleable before POS fulfillment completes;
- a missing webhook leaves the UI claiming a confirmed payment.

## 8. Sandbox-to-production promotion process

### Sandbox gate

- All automated contract gates pass.
- Each of the three methods completes one provider-backed sandbox attempt.
- Card success and 3-D Secure paths are both exercised.
- Signed webhook delivery and duplicate replay are evidenced.
- One finalized order per test attempt is confirmed; no duplicates exist.
- The local E2E storefront fixture and URL configuration are valid.

### Production configuration gate

Configure the following only in the production backend environment, never in
Git or the frontend environment:

```dotenv
PAYMONGO_MODE=live
PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1
PAYMONGO_LIVE_PUBLIC_KEY=<live-public-key>
PAYMONGO_LIVE_SECRET_KEY=<live-secret-key>
PAYMONGO_LIVE_WEBHOOK_SECRET=<live-webhook-secret>
PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=false
PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300
PAYMONGO_WEBHOOK_ENDPOINT_URL=https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook

COMMERCE_PAYMENTS_ENABLED=true
COMMERCE_PAYMONGO_SPLIT_ENABLED=false
TENANT_REVENUE_SHARING_ENABLED=true

STOREFRONT_DIRECT_GCASH_ENABLED=true
STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true
STOREFRONT_DIRECT_MAYA_ENABLED=true
STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=true
STOREFRONT_DIRECT_CARD_ENABLED=true
STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED=true

TENANT_AUTOMATIC_PAYOUT_ENABLED=false
TENANT_EXTERNAL_PAYOUT_APPROVED=false
```

Before enabling any live flag, PayMongo must confirm that the DGFY account is
activated for that specific method. The production public HTTPS webhook must
pass the unsigned `401` probe before any canary.

### Controlled live canary gate

Run one low-value canary per method, one at a time, with an operator watching:

1. Storefront payment-session creation and selected method.
2. No Hosted Checkout navigation.
3. PayMongo authorization/3-D Secure completion.
4. Signed webhook arrival and signature/livemode validation.
5. Finalized order, tracking PIN, provider ID, and one POS transaction.
6. Ledger/reconciliation record and settlement hold until fulfillment.
7. Refund/reversal handling if the canary is cancelled or rejected.

Stop immediately if the webhook is missing, the amount/currency differs, the
wrong method is selected, or order finalization is duplicated. Disable only the
affected direct-method flag while preserving payment records for reconciliation;
never delete paid sessions or ledger history.

## 9. Evidence record

Record one row per method:

| Field | GCash | Maya | Card |
| --- | --- | --- | --- |
| Environment/mode |  |  |  |
| Storefront slug |  |  |  |
| Payment session ID |  |  |  |
| Provider Payment Intent ID |  |  |  |
| Payment flow | `direct_gcash` | `direct_maya` | `direct_card` |
| 3-D Secure used | N/A | N/A |  |
| Provider event ID |  |  |  |
| Webhook received at |  |  |  |
| Final session status |  |  |  |
| POS transaction/tracking PIN |  |  |  |
| Duplicate/replay check |  |  |  |
| Ledger/reconciliation check |  |  |  |
| Screenshot/log evidence path |  |  |  |

The process is complete only when all three rows are filled with provider-backed
evidence and the release gate has no unresolved failure.

### Phase 5 documentation-alignment record (2026-08-19)

The following local evidence is recorded without storing secrets, card data,
CVCs, authorization URLs, or personal data:

| Evidence | Result |
| --- | --- |
| Direct card local canary | PayMongo test Payment Intent authorization completed without Hosted Checkout; signed webhook handling returned HTTP 200 and the session reached `finalized`. Session reference: `CPS-VFDYFEC2C3`. |
| Card tracking result | One tracking PIN was created: `SK-7MF6DF`. No duplicate order was created during the retry run. |
| Local artifact | `apps/dgfy-storefront/.tmp/card-flow-diagnostic/card-flow-retry-final.png` and the matching local Playwright trace archive. These artifacts are local-only and must not be treated as production evidence. |
| GCash and Maya | Direct method contract tests and local UI routing are present. Durable provider-backed evidence rows remain open until a redacted sandbox event record is captured for each method. |
| Card 3-D Secure | The frontend/API contract and automatic redirect branch are tested. A real PayMongo sandbox 3-D Secure authorization remains open. |
| Signed webhook and replay safety | Focused backend tests pass for signature rejection, stale timestamps, amount/currency/livemode mismatch holds, and finalized-session replay idempotency. |

This record is the Phase 5 documentation evidence update. It does not close the
sandbox gate, approve live credentials, or replace the Phase 6 final UI/API and
release audit.

### Phase 110 provider-backed wallet sandbox evidence (2026-08-19)

The local sandbox probe completed one direct authorization for each wallet. The
test page was the PayMongo wallet test authorization page on the loopback test
redirect, not `checkout.paymongo.com` Hosted Checkout. The provider authorization
was accepted before the storefront session was considered finalized.

| Field | GCash | Maya |
| --- | --- | --- |
| Environment/mode | `test` | `test` |
| Storefront slug | `masu-cafe-ed841f` | `masu-cafe-ed841f` |
| Payment session ID | `CPS-RKUMAN6FL4` | `CPS-3QKOLT85PN` |
| Provider Payment Intent ID | Returned and attached; value omitted from source evidence | Returned and attached; value omitted from source evidence |
| Payment flow | `direct_gcash` | `direct_maya` |
| 3-D Secure used | N/A | N/A |
| Provider event ID | Redacted; signed webhook handling trace `ae3a9554-56e6-44a5-99fa-77f8f1b26511` | Redacted; signed webhook handling trace `06a758a8-ee74-4fcb-ad95-ff7cbcd42aa5` |
| Webhook received at | 2026-08-19 06:48:46 (+08:00), HTTP 200 | 2026-08-19 06:47:38 (+08:00), HTTP 200 |
| Final session status | `finalized` | `finalized` |
| POS transaction/tracking PIN | One POS transaction; `SK-A2JSNQ` | One POS transaction; `SK-FL5X6W` |
| Duplicate/replay check | Focused webhook replay tests passed; no duplicate from this attempt | Focused webhook replay tests passed; no duplicate from this attempt |
| Ledger/reconciliation check | Finalization returned one POS transaction; live settlement was not exercised in sandbox | Finalization returned one POS transaction; live settlement was not exercised in sandbox |
| Evidence | `paymongo-direct-wallet-sandbox.spec.js`; request-outcomes log | `paymongo-direct-wallet-sandbox.spec.js`; request-outcomes log |

The direct-wallet Playwright probe is gated by `E2E_DIRECT_PAYMENT_FLOW_ENABLED`
and selects `E2E_DIRECT_PAYMENT_TYPE=gcash|maya`; it is not enabled by default.
The card authorization and real 3-D Secure evidence are recorded under Phase 112
because Phase 111 is reserved for the independent native APK compatibility work.

### Phase 112 direct card provider-backed sandbox evidence (2026-08-19)

Both approved direct-card sandbox paths completed from the local Storefront. The
successful card path stayed on the local Storefront, while the 3-D Secure path
used PayMongo's provider authentication page and returned to the local tracking
route. Neither path opened `checkout.paymongo.com` Hosted Checkout.

| Field | Successful card | 3-D Secure card |
| --- | --- | --- |
| Environment/mode | `test` | `test` |
| Storefront slug | `masu-cafe-ed841f` | `masu-cafe-ed841f` |
| Payment session ID | `CPS-2UOVX67ZGX` | `CPS-XBCM12KG6P` |
| Payment flow | `direct_card` | `direct_card` |
| Provider authorization | Direct card authorization; no Hosted Checkout | PayMongo 3-D Secure authorization; provider host recorded without the full URL |
| Webhook result | Signed webhook-backed `finalized` | Signed webhook-backed `finalized` |
| POS transaction/tracking PIN | One POS transaction; `SK-S7UDR1` | One POS transaction; `SK-6BWZ17` |
| Card data sent to DGFY backend | No | No |
| Duplicate/replay check | Focused replay tests passed; one finalized order linkage | Focused replay tests passed; one finalized order linkage |
| Evidence | `paymongo-direct-card-sandbox.spec.js`; Playwright evidence attachment | `paymongo-direct-card-sandbox.spec.js`; Playwright evidence attachment |

The local request-outcomes log recorded HTTP 200 handling for the signed
`POST /api/v1/commerce-payments/paymongo/webhook` during the card runs. The
browser probe also verified the direct session response had `payment_flow`
`direct_card`, a provider Payment Intent/client key, and no Hosted Checkout URL.
The backend focused payment/security set passed 5 suites / 35 tests; the
Storefront card UI, validation, and direct-payment contract set passed 3 files /
25 tests; and the new E2E source passed ESLint.

This closes the provider-backed card sandbox gate only. Live credentials, live
method confirmation flags, production canaries, and independent dashboard
replay/refund evidence remain open.

## 10. Rollback

To stop new direct authorizations, set the affected direct enabled flag to
`false` and restart the backend. Keep webhook verification enabled and preserve
all existing payment sessions, orders, provider IDs, and ledger entries for
reconciliation. Do not delete or reset payment data as a rollback method.
