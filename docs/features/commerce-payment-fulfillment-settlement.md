---
status: authoritative
owner: payments
last_reviewed: 2026-08-08
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

## Paid-session finalization recovery

- A verified `payment.paid` event records the payment before Storefront order
  creation is attempted.
- If order creation fails after payment confirmation, the session is retained as
  `paid_manual_resolution_required` with `ORDER_FINALIZATION_FAILED`; it must
  never be downgraded to a failed payment or silently discarded.
- Administrator retry-finalization is idempotent and may reuse the signed guest
  checkout proof after its short presentation expiry because the PayMongo payment
  session already bound the proof to the tenant, email, and checkout key.
- Admin > Payments provides a provider reconciliation action for sessions still
  waiting on a webhook. It retrieves the Payment Intent server-side and only
  enters the shared paid/finalization path when PayMongo returns a paid payment
  record whose amount and currency match the locked session total.
- Provider reconciliation is an audited recovery path, not a replacement for the
  signed `payment.paid` webhook and never trusts browser payment confirmation.
- A retry must either create/link the POS transaction and tracking PIN or leave
  the session in the recoverable manual-resolution state with the latest failure.

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
- For direct GCash, configure the live PayMongo public key as well as the
  explicit `STOREFRONT_DIRECT_GCASH_ENABLED=true` and
  `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true` flags only after PayMongo has
  activated GCash for the account.
- Register the public HTTPS webhook endpoint:
  `/api/v1/commerce-payments/paymongo/webhook`.
- Enable `payment.paid`, `payment.failed`, `qrph.expired`,
  `payment.refund.updated`, and `payment.refunded`.
- Keep automatic payouts disabled until separately approved.
- Direct GCash skips the PayMongo Hosted Checkout page but still redirects the
  customer to PayMongo/GCash authorization. The signed `payment.paid` webhook,
  provider livemode, amount, and currency remain authoritative; a browser
  return never finalizes an order.
