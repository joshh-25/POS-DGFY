---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-30
last_reviewed: 2026-08-22
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

### 2026-08-18: Explicit direct Maya authorization for local and production opt-in

Storefront Maya may use the same direct PayMongo Payment Intent authorization
pattern under the independently controlled `STOREFRONT_DIRECT_MAYA_ENABLED`
flag. The backend creates the landlord-owned Payment Intent with `paymaya` as
the only allowed method; the browser uses only the PayMongo public key and
Payment Intent client key to create and attach the Maya Payment Method, then
follows the provider authorization URL. In live mode,
`STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=true` is additionally required. The
browser return is never a payment confirmation.

Cards and all other Storefront methods continue using Hosted Checkout. Maya
falls back to Hosted Checkout when direct mode is disabled. The signed provider
webhook remains authoritative and the existing amount, currency, livemode,
idempotency, settlement, and refund rules are unchanged.

### 2026-08-21: Commerce webhook event-level idempotency hardening (#476)

The "idempotent session state before finalization" invariant this ADR already
states (2026-08-18 amendments, above) was enforced only by a read-then-act
session-status check with no database lock -- two concurrent or retried
`payment.paid` deliveries for the same session could both pass the check before
either write committed. This is a hardening fix closing that gap, not a change
to the invariant itself:

1. `processVerifiedPaidCommerceSession` now re-reads the session with
   `SELECT ... FOR UPDATE` inside a transaction and performs the state check and
   the `status: 'paid'` claim write there, so a second concurrent delivery
   blocked on the row lock sees a consistent, committed state once it unblocks
   instead of racing the same read-then-write. A session already `finalized` or
   `paid_manual_resolution_required` (or carrying a `pos_transaction_id`/
   `tracking_pin`) short-circuits as an idempotent replay; a session merely
   `paid` does not -- that status is reachable both mid-flight and after a
   crashed/failed prior attempt, and treating it as terminal would silently
   swallow a legitimate retry before revenue posting or finalization ever ran.
   `postPaidTenantRevenueTransactionUseCase` and `finalizePaidCommerceSession`
   remain outside that transaction, unchanged -- this ADR's "post-commit,
   cross-database workflow" boundary (Architecture Boundaries, above) is not
   altered; the claim transaction only spans the landlord-side status write.
   Both downstream calls already carry their own idempotency (a locked
   `findRevenueTransactionBySession` check before insert, and finalization's
   existing `pos_transaction_id`/`tracking_pin`/`finalized` short-circuit plus
   `storeCheckoutUseCase`'s `idempotency_key` dedup), so re-entering a merely-
   `paid` session on retry is safe rather than risky.
2. `commerce_payment_sessions.provider_event_id` gained a unique index
   (`uq_commerce_payment_sessions_provider_event`), and a locked
   `findSessionByProviderEventId` pre-check rejects a provider event already
   recorded against a *different* session (`PAYMENT_PROVIDER_EVENT_REPLAY`,
   HTTP 409) -- the same pattern POS split payments already uses
   (`pos_payment_allocations.provider_event_id`).
3. An unknown-session `payment.paid`/`checkout_session.payment.paid` (money
   collected with no local session to attach it to) now raises an operational
   alert in addition to the existing warning log. The `200
   {handled:false, reason:'session_not_found'}` response contract is unchanged.

No fee policy, settlement, or payment-acceptance decision changes. Full context:
issue #476, `docs/compliance/impact-declarations/2026-08-21-paymongo-commerce-webhook-idempotency.md`.

### 2026-08-22: Downpayment forfeiture is a terminal outcome with no provider refund (#824)

Clause 14 states that rejecting or cancelling a paid Storefront order "submits
one idempotent full-refund request to PayMongo." That is unconditional, and for
a partially-captured (downpayment) order it is now too narrow: ADR 0069 clause 8
`[default]`, carried forward by ADR 0070, makes refund-vs-forfeiture a per-store
toggle, and a forfeiture makes **no provider call at all**. Clause 14 is untagged
(plain numbered list), so per ADR 0039 this is a dated amendment, not a
supersession.

Clause 14 is amended to read: rejecting or cancelling a paid Storefront order
records the terminal fulfillment state first, then resolves one of two outcomes.

1. **Refund** — the default, and the only outcome for a fully-captured order.
   Unchanged from clause 14 as written: one idempotent refund request to
   PayMongo, successful refund webhooks post immutable refund and proportional
   DGFY-fee reversal entries, a failed refund never reopens settlement
   eligibility and is surfaced for administrator reconciliation. For a
   downpayment order the "full" refund is the full *captured* amount, which ADR
   0069 clause 1b `[binding]` already fixes at the downpayment, never the order
   total.
2. **Forfeiture** — only when a **customer** self-service cancellation meets a
   session whose `downpayment_refundable` snapshot is explicitly `false` (see
   ADR 0070's companion amendment of the same date for the actor scoping). No
   PayMongo call is made, no `commerce_payment_refunds` row is created, and the
   session's own status is unchanged: the money was neither reversed nor put in
   flight. The order's `payment_status`, `amount_paid`, and `balance_due` are
   likewise left untouched, because nothing was reversed — this ADR's clause 4
   requires corrections to be expressed as ledger entries, never as edits to the
   original figures.

Both outcomes now write a tenant-side `pos_order_payments` row (`kind` `'refund'`
or `'forfeiture'`, linked to the original `'downpayment'` row via
`related_pos_order_payment_id`), satisfying ADR 0069 clause 8's requirement that
"the schema from clause 4 must represent a forfeited-vs-applied distinction on
the ledger regardless of the toggle's setting." Refund rows carry the provider's
own lifecycle in their `status` column (`pending` on submission, promoted to
`successful`/`failed` when the refund webhook confirms), so a refund in flight is
visible tenant-side rather than appearing only once terminal. That write is
best-effort and never fails the money operation or the webhook acknowledgement,
consistent with this ADR's Architecture Boundaries rule that a cross-database
failure cannot roll back a decision already committed.

No fee policy, settlement-hold, or payment-acceptance decision changes. Full
context: issue #824,
`docs/compliance/impact-declarations/2026-08-22-downpayment-refund-and-forfeiture.md`.
