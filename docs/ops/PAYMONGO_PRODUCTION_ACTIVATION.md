---
status: authoritative
owner: payments_operations
last_reviewed: 2026-07-31
applies_to: paymongo_qrph_tenant_revenue_production
---

# PayMongo QR Ph Production Activation

This runbook is for the project manager or infrastructure operator with access to
the production Linode environment and the live PayMongo dashboard. Never paste
live keys into source control, chat, screenshots, or frontend environment files.

## 1. Deploy order

1. Back up the landlord database.
2. Deploy the approved release candidate to staging.
3. Run the landlord migrations, including:
   - `20260730000002-create-tenant-revenue-settlement.cjs`
   - `20260731000001-gate-tenant-revenue-by-fulfillment.cjs`
4. Deploy the backend and frontend from the same tested commit.
5. Verify `/health` before enabling live payment traffic.

## 2. Production backend environment

Set these values in the backend process environment:

```dotenv
PAYMONGO_MODE=live
PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1
PAYMONGO_LIVE_PUBLIC_KEY=pk_live_REPLACE_IN_SERVER
PAYMONGO_LIVE_SECRET_KEY=sk_live_REPLACE_IN_SERVER
PAYMONGO_LIVE_WEBHOOK_SECRET=whsk_REPLACE_IN_SERVER
PAYMONGO_WEBHOOK_ENDPOINT_URL=https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook
PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=false
PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300

COMMERCE_PAYMONGO_SPLIT_ENABLED=false
TENANT_REVENUE_SHARING_ENABLED=true
TENANT_REVENUE_DEFAULT_RATE_BPS=100
TENANT_REVENUE_DEFAULT_SETTLEMENT_CYCLE_DAYS=15
TENANT_AUTOMATIC_PAYOUT_ENABLED=false
TENANT_EXTERNAL_PAYOUT_APPROVED=false

TENANT_PAYOUT_ENCRYPTION_KEY=REPLACE_WITH_A_32_BYTE_PRODUCTION_SECRET
```

Also configure at least two distinct finance administrator identities in
`ADMIN_ACCOUNTS_JSON` for maker-checker settlement controls.

Restart the backend after updating the environment. Run the repository production
environment validation before serving traffic.

## 3. PayMongo webhook

Create or update the live webhook:

`https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook`

Enable:

- `payment.paid`
- `payment.failed`
- `qrph.expired`
- `payment.refund.updated`
- `payment.refunded`

Copy that webhook's live signing secret into
`PAYMONGO_LIVE_WEBHOOK_SECRET`. A test-mode secret or an old ngrok/SKUpervisor
endpoint is not valid for production.

## 4. Activation proof

Perform one low-value controlled live QR Ph order:

1. Confirm the QR contains the exact order total.
2. Pay it and verify one signed webhook delivery returns HTTP 2xx.
3. Confirm the Storefront order is paid and appears once in POS.
4. Confirm tenant revenue exists but settlement is `on_hold`.
5. Complete the order in POS and confirm settlement becomes pending/eligible
   according to its configured cycle.
6. Run a second controlled payment, reject it in POS with a reason, and confirm:
   - one full refund is submitted;
   - duplicate rejection does not create a second refund;
   - the refund webhook marks it refunded;
   - tenant settlement remains excluded;
   - the DGFY platform fee reversal appears in the immutable ledger.

## 5. Fail-safe and rollback

If webhook verification, refund processing, or reconciliation fails:

1. Set `TENANT_REVENUE_SHARING_ENABLED=false` to stop new revenue postings.
2. Keep `TENANT_AUTOMATIC_PAYOUT_ENABLED=false`.
3. Do not delete financial rows or rerun destructive SQL.
4. Preserve provider references and reconcile affected payments manually.
5. Roll application traffic back to the previous tested release only after
   migrations are confirmed backward-compatible.
