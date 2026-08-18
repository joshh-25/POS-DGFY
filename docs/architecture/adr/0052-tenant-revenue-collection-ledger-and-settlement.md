---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-30
last_reviewed: 2026-08-17
review_by: 2027-01-31
applies_to: storefront_commerce_payments_tenant_revenue_settlement
topic: tenant_revenue_collection_ledger_settlement
---

# ADR 0052: DGFY Collection, Tenant Revenue Ledger, and Controlled Settlement

## Status

Accepted (2026-07-30). Supersedes ADR 0027's split-payment and customer-paid
platform-fee decisions.

## Context

PayMongo Linked Accounts and platform split settlement are not available for the
current DGFY account. DGFY also requires tenant-specific platform percentages,
historical fee versions, provider-fee reconciliation, 15/30-day settlement,
refund/chargeback carry-forward, and maker-checker payout evidence. A displayed
percentage or mutable balance cannot provide the required accounting trace.

## Decision

1. Supported Storefront online payments continue to use landlord-owned commerce
   payment sessions and are finalized only after a verified `payment.paid` event.
2. Under `TENANT_REVENUE_SHARING_ENABLED=true`, DGFY collects the full PayMongo
   customer payment. No PayMongo split payload is sent and no DGFY platform fee is
   added to the customer's Storefront total.
3. A versioned tenant policy snapshots the DGFY basis-point rate, 15/30-day cycle,
   provider-fee allocation, payment-method-specific fallback fees, payout
   destination, minimum payout, and effective dates.
4. Every posted financial amount uses integer centavos and an immutable
   double-entry ledger. Corrections use refund, chargeback, adjustment, reversal,
   reconciliation, settlement, or payout entries; posted entries are never edited.
5. Provider fee priority is actual PayMongo financial data, reconciled
   statement/API data, an exact payment-method fallback, then manual review.
   Universal assumed PayMongo rates are prohibited.
6. Only reconciled, eligible transactions may enter a settlement batch.
   Unresolved blocking discrepancies place the transaction or batch on hold.
7. Finance prepares a batch; a different authenticated platform administrator
   approves it. The approving administrator must confirm final payout evidence.
8. Refunds, chargebacks, and approved adjustments recorded after a paid batch are
   allocated once as immutable carry-forward entries in the next positive batch.
9. Tenant users receive only server-scoped, read-only financial statements for
   their authenticated tenant.
10. Payout destinations are encrypted at rest and masked in every API response.
11. Automatic payout execution is disabled unless revenue sharing, the automatic
    payout flag, and explicit external approval are all true. No provider payout
    adapter is installed by this ADR, so automatic payout requests remain
    fail-closed.
12. Production fund holding or tenant payout must not be activated until PayMongo
    account structure, provider settlement capability, accounting and tax
    treatment, contracts, and applicable regulatory obligations are approved.
13. A verified provider payment is posted immediately for audit and reconciliation,
    but its tenant settlement remains `on_hold` until POS records the related order
    as `completed`. Payment confirmation is not fulfillment confirmation.
14. Rejecting or cancelling a paid Storefront order records the terminal fulfillment
    state first, then submits one idempotent full-refund request to PayMongo.
    Successful refund webhooks post immutable refund and proportional DGFY-fee
    reversal entries. A failed refund never reopens settlement eligibility and is
    surfaced for administrator reconciliation.

## Architecture Boundaries

The module follows:

`routes -> controllers -> use cases -> repositories -> landlord models`

Storefront checkout supplies payment-session facts. PayMongo webhooks provide
authenticated provider events. The tenant-revenue module owns fee policy,
transaction snapshots, ledger, reconciliation, batches, and payouts. POS and
tenant databases do not own the platform settlement ledger.

POS owns the terminal fulfillment decision and supplies only the authenticated
company-scoped order status. The commerce-payments application layer correlates
that order to the landlord payment session and orchestrates the refund. This is a
post-commit, cross-database workflow: a provider failure cannot roll back the
tenant order decision, so it is retained as an explicit refund-review condition.

## Rollout

1. Apply the additive landlord migration while both revenue and split modes are off.
2. Configure `TENANT_PAYOUT_ENCRYPTION_KEY` and PayMongo webhook secrets.
3. Create tenant policy versions in `on_hold`; reconcile sandbox payments.
4. Enable `TENANT_REVENUE_SHARING_ENABLED=true` only after confirming
   `COMMERCE_PAYMONGO_SPLIT_ENABLED=false`.
5. Activate individual tenant policies after payout destination and evidence checks.
6. Keep `TENANT_AUTOMATIC_PAYOUT_ENABLED=false` and
   `TENANT_EXTERNAL_PAYOUT_APPROVED=false`.
7. Use manual payout records and confirmed bank/provider proof until a separately
   approved payout adapter ADR exists.
8. Confirm completed orders move from settlement hold to pending, while rejected
   paid orders create one provider refund and remain excluded from settlement.

## Rollback

Disable `TENANT_REVENUE_SHARING_ENABLED` to stop new tenant-revenue postings.
Do not drop or reverse financial tables. Preserve all posted history and reconcile
any paid commerce sessions that occurred during the enabled window before reverting
checkout code.

## Consequences

- DGFY becomes responsible for a traceable tenant payable and controlled payout
  workflow rather than relying on a provider split.
- Customer totals no longer include the former DGFY convenience-fee line in this
  mode.
- Provider, legal, tax, accounting, contract, and regulatory approval remain
  external go-live blockers.
- Existing split code remains a disabled compatibility path and must not be enabled
  together with tenant revenue sharing.

## Amendments

### 2026-08-17: Exact Hosted Checkout routing for active e-wallets

Storefront Hosted Checkout may expose Card, GCash, Maya, GrabPay, ShopeePay, and
QR Ph when the server-resolved PayMongo capability contract marks the method
active. The selected method is persisted in the commerce payment session and is
sent as the single PayMongo `payment_method_types` value; the frontend must not
choose or fall back to a different method after selection. Direct online banking
methods remain deferred because BPI/UBP and Brankas banks require bank-specific
`bank_code` handling that is outside this amendment. Verified provider webhooks,
landlord-owned payment sessions, fee snapshots, settlement hold, and refund
rules remain unchanged.

### 2026-08-18: Explicit direct GCash authorization for production

Storefront GCash may use a direct PayMongo Payment Intent authorization flow
instead of Hosted Checkout only when both `STOREFRONT_DIRECT_GCASH_ENABLED=true`
and, in live mode, `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true` are present.
The backend creates the landlord-owned Payment Intent with `gcash` as the only
allowed method; the browser uses only the PayMongo public key and Payment Intent
client key to create and attach the GCash Payment Method, then follows the
provider authorization URL. The browser return is never a payment confirmation.

All other Storefront payment methods continue using Hosted Checkout, and GCash
falls back to Hosted Checkout when direct mode is disabled. The signed provider
webhook remains authoritative and must match configured livemode, locked
centavo amount, currency, and idempotent session state before finalization.
