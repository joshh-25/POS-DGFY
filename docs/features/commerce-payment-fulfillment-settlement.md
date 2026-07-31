---
status: authoritative
owner: payments
last_reviewed: 2026-07-31
applies_to: storefront_paymongo_pos_fulfillment_tenant_settlement
---

# Commerce Payment, Fulfillment, Refund, and Settlement Flow

## Required state flow

1. PayMongo verifies payment.
2. DGFY records the paid payment and immutable fee ledger immediately.
3. Tenant settlement remains `on_hold` while POS fulfillment is pending.
4. POS completion changes fulfillment to `completed` and releases a reconciled
   transaction to the normal settlement cycle.
5. POS rejection requires a reason and changes fulfillment to `rejected`.
6. For a paid PayMongo session, DGFY submits one full refund request.
7. The signed PayMongo refund webhook is authoritative for `refunded` status.
8. The refund ledger reverses tenant payable and the proportional DGFY platform
   fee. Provider-fee treatment remains a reconciliation item until PayMongo
   confirms whether that fee was returned.

## Failure behavior

- Duplicate rejection calls reuse an existing succeeded or pending refund.
- A refund API failure does not undo the POS rejection.
- Failed refunds stay excluded from settlement and require administrator review.
- Already scheduled or paid settlements are held or corrected through immutable
  carry-forward entries; posted financial records are never deleted.

## Production requirements

- Run landlord migrations before application deployment.
- Keep sandbox confirmation disabled in production.
- Configure live PayMongo secret and webhook secret outside source control.
- Register the public HTTPS webhook endpoint:
  `/api/v1/commerce-payments/paymongo/webhook`.
- Enable `payment.paid`, `payment.failed`, `qrph.expired`,
  `payment.refund.updated`, and `payment.refunded`.
- Keep automatic payouts disabled until separately approved.
