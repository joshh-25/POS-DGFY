# PayMongo Production Configuration

This document is the Project Manager handoff for activating PayMongo QR Ph,
DGFY revenue recording, and tenant settlement in production.

> Never place live API keys, webhook secrets, encryption keys, or passwords in
> Git, source code, frontend environment files, chat messages, or screenshots.
> Configure secrets only in the production backend environment.

## Sandbox Configuration (Dev And Stage)

Do not copy the production block below to `/opt/dgfy-dev` or
`/opt/dgfy-stage`. Each non-production Compose deployment must use PayMongo
test-mode credentials and a distinct test-mode webhook signing secret:

```dotenv
PAYMONGO_MODE=test
PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1
PAYMONGO_TEST_PUBLIC_KEY=pk_test_REPLACE_ON_SERVER
PAYMONGO_TEST_SECRET_KEY=sk_test_REPLACE_ON_SERVER
PAYMONGO_TEST_WEBHOOK_SECRET=whsk_test_REPLACE_PER_ENVIRONMENT
PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=false
PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300

COMMERCE_PAYMENTS_ENABLED=true
STOREFRONT_DIRECT_GCASH_ENABLED=false
STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=false
COMMERCE_PAYMONGO_SPLIT_ENABLED=false
TENANT_REVENUE_SHARING_ENABLED=true
TENANT_AUTOMATIC_PAYOUT_ENABLED=false
TENANT_EXTERNAL_PAYOUT_APPROVED=false
TENANT_PAYOUT_ENCRYPTION_KEY=REPLACE_WITH_A_UNIQUE_32_BYTE_NON_PRODUCTION_SECRET
```

Set `PAYMONGO_WEBHOOK_ENDPOINT_URL` per deployment:

- Dev: `https://dev.dgfy.ph/api/v1/commerce-payments/paymongo/webhook`
- Stage: `https://stage.dgfy.ph/api/v1/commerce-payments/paymongo/webhook`

Create a separate PayMongo **test-mode** webhook for each URL and enable
`payment.paid`, `payment.failed`, `qrph.expired`, `payment.refund.updated`,
and `payment.refunded`. Set the GitHub environment build variable
`VITE_STOREFRONT_SANDBOX_QRPH_ENABLED=true` only for DEV and STAGING; leave it
unset or `false` for PROD. Sandbox confirmation remains loopback-only even
when the deployed backend runs with `NODE_ENV=production`.

## 1. Production Backend Environment

Add the following values to the production backend environment on Linode:

```dotenv
COMMERCE_PAYMENTS_ENABLED=true

PAYMONGO_MODE=live
PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1
PAYMONGO_LIVE_PUBLIC_KEY=pk_live_REPLACE_ON_SERVER
PAYMONGO_LIVE_SECRET_KEY=sk_live_REPLACE_ON_SERVER
PAYMONGO_LIVE_WEBHOOK_SECRET=whsk_REPLACE_ON_SERVER

PAYMONGO_WEBHOOK_ENDPOINT_URL=https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook
PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=false
PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300

# Explicitly enable the direct browser-to-GCash authorization flow.
# PayMongo must have live GCash activated before enabling this in production.
STOREFRONT_DIRECT_GCASH_ENABLED=true
STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true

COMMERCE_PAYMONGO_SPLIT_ENABLED=false

TENANT_REVENUE_SHARING_ENABLED=true
TENANT_REVENUE_DEFAULT_RATE_BPS=100
TENANT_REVENUE_DEFAULT_SETTLEMENT_CYCLE_DAYS=15

TENANT_AUTOMATIC_PAYOUT_ENABLED=false
TENANT_EXTERNAL_PAYOUT_APPROVED=false

TENANT_PAYOUT_ENCRYPTION_KEY=REPLACE_WITH_A_SECURE_32_BYTE_SECRET

ADMIN_ACCOUNTS_JSON=[{"username":"finance.preparer","password_hash":"BCRYPT_HASH","financial_role":"finance_preparer"},{"username":"finance.approver","password_hash":"BCRYPT_HASH","financial_role":"finance_approver"}]
```

Configuration notes:

- `TENANT_REVENUE_DEFAULT_RATE_BPS=100` means the DGFY fee is 1%.
- Change the rate only after the commercial fee has been formally approved.
- The finance preparer and finance approver must be two distinct identities.
- `password_hash` must contain a bcrypt hash, never a plain-text password.
- Keep automatic payouts disabled until settlement processing has passed
  controlled production verification.
- Do not enable PayMongo split payments. This implementation uses DGFY revenue
  accounting and settlement records instead.
- Direct GCash creates a PayMongo Payment Intent and sends the customer to the
  PayMongo/GCash authorization URL; it does not create a PayMongo Hosted
  Checkout page. Keep Hosted Checkout for other methods.
- Enable the two direct-GCash flags only after live GCash activation is visible
  in PayMongo and the controlled low-value canary is scheduled.

## 2. PayMongo Live Webhook

In the live PayMongo dashboard, create or update this endpoint:

```text
https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook
```

Enable these events:

- `payment.paid`
- `payment.failed`
- `qrph.expired`
- `payment.refund.updated`
- `payment.refunded`

After creating the webhook:

1. Copy its live signing secret.
2. Store it in `PAYMONGO_LIVE_WEBHOOK_SECRET` on the production backend.
3. Confirm the webhook is enabled.
4. Remove or disable obsolete ngrok and SKUpervisor webhook endpoints.
5. Never reuse a test-mode webhook secret in live mode.

## 3. Deployment Procedure

Follow `docs/ops/RELEASE_CANDIDATE_POLICY.md`. A merge to `main` deploys
production, so the database backup and migration window must be ready before
the release PR is merged.

1. Record the exact release commit and back up the landlord database plus every
   active tenant database.
2. Deploy the approved backend and frontend from the same tested commit.
3. Install the backend dependencies.
4. Run the landlord database migrations.
5. Run the tenant repair dry-run and review every proposed additive change.
6. Apply the additive tenant repairs only after the dry-run is approved.
7. Run the final tenant schema checksum gate. Do not start payment traffic if
   any active tenant fails or reports a different capability checksum.
8. Restart the single backend process and verify its health endpoint.
9. Enable controlled live payment traffic.

Run from the deployed project:

```powershell
cd backend
npm install
npm run migrate
npm run plan:tenant-schema-repair
npm run repair:tenant-schema
npm run check:tenant-schema
```

The required landlord migrations include:

- `20260730000002-create-tenant-revenue-settlement.cjs`
- `20260731000001-gate-tenant-revenue-by-fulfillment.cjs`

Do not manually create, delete, or edit financial rows as a replacement for
running the migrations.

The expected tenant capability report must include the version and checksum
emitted by `sync-tenant-schemas.js`. Store the complete report with the release
evidence. A missing table/column, failed tenant, or checksum mismatch is a hard
deployment stop—not a warning to bypass.

## 4. Controlled Live QR Ph Test

Perform one low-value controlled production transaction:

1. Create a Storefront order using PayMongo QR Ph.
2. Confirm the generated QR represents the exact order total.
3. Pay the QR using a real supported wallet.
4. Confirm PayMongo sends one signed `payment.paid` webhook.
5. Confirm the webhook delivery returns HTTP 2xx.
6. Confirm the Storefront order becomes paid.
7. Confirm the order appears exactly once in POS.
8. Before POS completion, confirm settlement is `on_hold`.
9. Complete the order in POS.
10. Confirm settlement changes from `on_hold` to `pending`.
11. Confirm the gross amount, PayMongo fee, DGFY fee, and tenant payable are
    correct.
12. Confirm a duplicate webhook does not duplicate the payment, order, or
    revenue record.

## 5. Rejection and Refund Test

Perform a second controlled low-value payment:

1. Pay the Storefront order through QR Ph.
2. Reject the order in POS and enter a rejection reason.
3. Confirm only one refund request is recorded.
4. Confirm repeated rejection does not create another refund.
5. Confirm the payment remains excluded from tenant settlement.
6. Confirm the refund webhook updates the refund record.
7. Confirm the DGFY fee reversal is recorded in the immutable financial ledger.

If PayMongo does not allow a refund for the payment source, the transaction must
remain `on_hold` for manual financial review. Do not mark it refunded or payable
manually without provider evidence.

## 6. Status Meanings

- `on_hold`: The payment must not be included in a tenant settlement yet. The
  order may still be awaiting POS completion, rejected, disputed, or under
  financial review.
- `pending`: The order is completed and eligible to enter a future settlement
  batch.
- `reconciled`: The payment details have been matched with the provider record.
  This does not by itself mean the tenant has been paid.
- `settled`: The tenant payable has been included in a completed settlement.

## 7. Production Failure Procedure

If webhook verification, refunds, revenue recording, or reconciliation fails:

1. Set `TENANT_REVENUE_SHARING_ENABLED=false`.
2. Keep `TENANT_AUTOMATIC_PAYOUT_ENABLED=false`.
3. Preserve all payment IDs, webhook events, order references, and financial
   records.
4. Do not delete financial rows or run destructive SQL.
5. Reconcile affected transactions manually against PayMongo.
6. Roll application traffic back only after confirming the migrations are
   backward-compatible.

## 8. Completion Checklist

- [ ] Production database backup completed
- [ ] Approved release deployed
- [ ] Backend and frontend use the same release
- [ ] Landlord migrations completed
- [ ] Tenant repair dry-run reviewed
- [ ] Additive tenant repair completed for every active tenant
- [ ] Tenant schema version/checksum gate passed for every active tenant
- [ ] Live PayMongo keys configured on the backend
- [ ] Live webhook signing secret configured
- [ ] Webhook events enabled
- [ ] Unsigned webhooks disabled
- [ ] DGFY fee rate confirmed
- [ ] Two finance administrators configured
- [ ] Automatic payouts remain disabled
- [ ] Backend restarted
- [ ] Health endpoint passed
- [ ] Controlled QR Ph payment passed
- [ ] POS order creation passed
- [ ] Completed order moved to pending settlement
- [ ] Duplicate webhook protection verified
- [ ] Rejection and refund behavior verified
- [ ] Project Manager recorded production evidence
