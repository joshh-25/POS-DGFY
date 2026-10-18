---
status: authoritative
owner: payments
last_reviewed: 2026-10-18
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
7. A signed PayMongo refund webhook is the primary status signal. The scheduled
   reconciler also reads refund resources through authenticated PayMongo API calls
   and uses the same idempotent status applier when a webhook is delayed or missing.
8. A definite provider rejection raises an operator alert and can be retried only
   through the explicit admin retry action; it is never automatically resubmitted.
9. The refund ledger reverses tenant payable and the proportional DGFY platform
   fee. Provider-fee treatment remains a reconciliation item until PayMongo
   confirms whether that fee was returned. See [Refunds and the provider fee](TENANT_REVENUE_SETTLEMENT.md#refunds-and-the-provider-fee)
   for dated source evidence, the worked ledger example, and the open decision.

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
- In local PayMongo test mode only, a loopback-gated Storefront reconciliation action may
  retrieve a direct GCash, Maya, or card Payment Intent after the provider authorization return.
  It reuses the same server-side amount, currency, livemode, payment-record, tenant-scope, and
  idempotent finalization checks; it is unavailable outside test mode and does not change the
  production rule that the signed `payment.paid` webhook is authoritative.
- A retry must either create/link the POS transaction and tracking PIN or leave
  the session in the recoverable manual-resolution state with the latest failure.

## Failure behavior

- Duplicate rejection calls reuse an existing succeeded or pending refund.
- A refund API failure does not undo the POS rejection.
- Definite refund failures stay excluded from settlement, raise an immediate
  operator alert, and remain unchanged until an administrator explicitly retries
  or resolves them.
- Ambiguous submissions and orphaned pre-provider refund rows are reconciled from
  authenticated PayMongo reads. A unique matching provider refund is linked and
  applied through the same idempotent path as a webhook; zero or multiple matches
  require administrator review.
- Public tracking exposes only the latest refund's customer-safe status, reference,
  amount, and update time. Provider IDs, failure details, and provider payloads
  remain private.
- Already scheduled or paid settlements are held or corrected through immutable
  carry-forward entries; posted financial records are never deleted.

## Production requirements

- Run landlord migrations before application deployment.
- Keep sandbox confirmation disabled in production.
- Configure live PayMongo secret and webhook secret outside source control.
- For direct GCash or Maya, configure the live PayMongo public key as well as
  the corresponding explicit `STOREFRONT_DIRECT_<WALLET>_ENABLED=true` and
  `STOREFRONT_DIRECT_<WALLET>_LIVE_CONFIRMED=true` flags only after PayMongo
  has activated that wallet for the account.
- Register the public HTTPS webhook endpoint:
  `/api/v1/commerce-payments/paymongo/webhook`.
- Enable `payment.paid`, `payment.failed`, `qrph.expired`,
  `payment.refund.updated`, and `payment.refunded`.
- Keep automatic payouts disabled until separately approved.
- Direct GCash and Maya skip the PayMongo Hosted Checkout page but still
  redirect the customer to provider authorization. The signed `payment.paid`
  webhook, provider livemode, amount, and currency remain authoritative; a
  browser return never finalizes an order. Cards remain on Hosted Checkout.
