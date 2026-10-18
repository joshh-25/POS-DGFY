---
status: authoritative
authority_level: authoritative
owner: product_engineering
last_reviewed: 2026-10-18
applies_to: storefront_commerce_payments_tenant_revenue_settlement
topic: tenant_revenue_settlement
---

# Tenant Revenue, Reconciliation, Settlement, and Payout

## Business Contract

DGFY collects supported online tenant payments through PayMongo, records actual or
reconciled provider fees, deducts the tenant's configured DGFY platform fee, and
records the remaining tenant payable. Tenant funds are released through controlled
15-day or 30-day settlement batches. PayMongo split payments are not used.

Automatic payouts are not production-ready. Manual payout evidence is the only
supported release mechanism until provider, legal, accounting, tax, contract, and
regulatory requirements are approved.

### Payment Channel Boundary

- Storefront Card, GCash, Maya, GrabPay, ShopeePay, and QR Ph are online payments. Every enabled
  method must create a landlord-owned PayMongo commerce payment session and may
  finalize an order only after verified provider confirmation.
- Walk-in POS GCash uses the merchant's physical QR and is recorded manually as
  a POS tender. It must not create a PayMongo commerce payment session.
- Cash remains a direct payment method and must not be submitted through the
  PayMongo online-payment session endpoint.
- Production Storefront payment choices are fail-closed: the UI shows an online
  method only when the catalog's server-resolved `payment_capabilities` marks it
  enabled. The explicit local QR Ph sandbox override remains a non-production
  developer aid.
- Direct online banking remains outside the current Storefront Hosted Checkout
  contract because BPI/UBP and Brankas banks require bank-specific `bank_code`
  handling rather than the exact method routing used by this flow.

## Amount Contract

All persisted money is integer centavos.

`DGFY fee = round(gross centavos × DGFY basis points / 10,000)`

`Tenant payable = gross - tenant provider-fee share - DGFY fee - refunds -
chargebacks + approved adjustments`

The provider fee priority is:

1. actual PayMongo transaction/balance/webhook financial data;
2. reconciled PayMongo API or statement data;
3. the configured fallback for the exact payment-method category;
4. manual review.

Example using the approved non-split model:

- Gross sale: PHP 300.00 (`30000` centavos)
- DGFY rate: 2% (`200` basis points)
- Actual PayMongo fee: PHP 8.00 (`800` centavos)
- DGFY fee: PHP 6.00 (`600` centavos)
- Tenant payable: PHP 286.00 (`28600` centavos)

Changing the policy to 3% creates a new effective version. New eligible payments
use a PHP 9.00 DGFY fee and PHP 283.00 tenant payable; historical 2% transactions
remain unchanged.

## Refunds and the provider fee

This section records public PayMongo guidance and DGFY's current ledger behavior. Public guidance
is not confirmation of the terms or rates in DGFY's merchant account. Pat's PayMongo support reply
and any account-specific agreement remain follow-up evidence for #2550.

### Public-source evidence

`Verified` below means the linked public source explicitly states the quoted fact. It does not make
the statement account-specific. `Unverified` means the current DGFY account treatment, or the
source's unstated qualification, still needs confirmation.

| Fact | Status | Source, retrieval date, and exact wording |
|---|---|---|
| PayMongo's published refund guide says the transaction fee remains charged on a refunded transaction. | Verified as a public statement; current DGFY account application is unverified. | [PayMongo Academy: Refunding payments](https://www.paymongo.com/academy/refunding-payments), retrieved 2026-10-18. The page footer says ©2024 and gives no update date. Exact wording: “you will still be charged the transaction fee for refunded transactions.” |
| The current general refund guide describes refunds and payout deductions, but does not state whether the original processing fee is returned. | Verified. | [PayMongo Refunds docs](https://docs.paymongo.com/docs/payment-acceptance-refunds), retrieved 2026-10-18. Exact wording: “Refunds return funds to a customer for a completed payment.” and “Refunds for already-paid-out transactions are deducted from your next payout.” |
| Whether the current DGFY merchant agreement follows that public guidance, and whether a separate refund fee or waiver applies. | Unverified. | The [PayMongo Terms of Use page](https://www.paymongo.com/terms), retrieved 2026-10-18, identifies the current version as “PayMongo Terms of Use (May 15, 2026)” but the refund-fee clause was not available in the page content reviewed. PayMongo's [account troubleshooting guide](https://docs.paymongo.com/docs/account-settings-troubleshooting), retrieved 2026-10-18, lists “Chargeback or refund fees” without defining when an ordinary payment refund incurs a separate fee, its amount, or any waiver. The reported policy-page deferral to the Terms of Use was not independently confirmed. |
| Standard public payment rates and their VAT basis. | Verified as public rates; DGFY's account-specific rate is unverified. | [PayMongo Pricing](https://www.paymongo.com/en/pricing), retrieved 2026-10-18, says “All prices are exclusive of VAT” and lists GCash at 2.23%, QR Ph at 1.34%, domestic Visa/Mastercard at 3.125% + ₱13.39, and international Visa/Mastercard at 4.02% + ₱13.39. |
| How PayMongo's broad 2.5% e-wallet figure relates to the detailed rate sheet. | The published figures are verified; their reconciliation is an inference. | The [Accept Payments page](https://www.paymongo.com/products/accept-payments), retrieved 2026-10-18, says “2.5% for e-wallets and online banking” and “3% + ₱15 for cards.” The detailed rate page labels its amounts VAT-exclusive, but the FAQ does not state its VAT basis or explain why the card rates differ. Applying the illustrative 12% VAT assumption to GCash gives 2.23% × 1.12 = 2.4976%, approximately 2.5%; this is a plausible explanation for the e-wallet figures, not a confirmed PayMongo rule. |

The separate [PayMongo split-payment refund guide](https://developers.paymongo.com/docs/seeds-refunding-a-split-payment), retrieved 2026-10-18, says “fees will still apply during the refund process, and they will be split proportionally among the recipients.” It describes split payments; DGFY's current contract does not send a PayMongo split payload, so this does not establish the fee treatment for DGFY's non-split flow.

The public sources therefore support this narrow statement: PayMongo's Academy guide says the transaction fee remains charged after a refund. The newer general Refunds docs are silent on that fee. The merchant-specific agreement, whether a separate refund fee applies, and the rates actually billed to DGFY still need confirmation. Do not infer a fee return or a refund-fee waiver from the silence.

### Current DGFY ledger behavior

At capture, the ledger records the provider-fee share selected by the transaction's captured
`provider_fee_payer` policy. The tenant share debits `tenant_payable` and credits
`paymongo_fee_clearing`; the DGFY share debits `paymongo_fee_expense` and credits
`paymongo_fee_clearing`. The refund path posts a `refund` entry for the customer refund and a
proportional DGFY-fee `reversal`. It does not post a provider-fee return entry. See
`apps/dgfy-api/src/modules/tenantRevenue/usecases/tenantRevenueUseCases.js` and ADR 0052, Decision
3 and clause 14.

The example below uses a ₱100.00 GCash payment, a 2% DGFY fee, and
`provider_fee_payer: tenant`, matching the example snapshot in #2550. The ₱2.50 provider fee is
illustrative, not a confirmed DGFY rate: it uses the public 2.23% VAT-exclusive price plus the
example's assumed 12% VAT. Use the actual PayMongo transaction or balance-transaction fee when
available.

| Step | Ledger entries (centavos) | Tenant payable |
|---|---|---:|
| Capture | Gross 10,000; tenant provider-fee share 250; DGFY platform fee 200 | 9,550 |
| Full refund | `refund` −10,000; DGFY-fee `reversal` +200 | **−250** |

If PayMongo retains the fee, its balance receives 10,000 centavos, deducts the 250-centavo fee,
then funds a 10,000-centavo refund: net −250 centavos. Under the tenant-payer snapshot, that same
₱2.50 remains as negative tenant payable and carries to a later positive batch under ADR 0052,
clause 8. If PayMongo returns the fee, the provider-side net is zero, but DGFY's ledger still shows
−250 centavos because it has no provider-fee return entry. That would be a ledger discrepancy to
correct through a later code change. A DGFY-payer snapshot instead leaves the captured DGFY share
in `paymongo_fee_expense`; a shared snapshot allocates it using `shared_fee_tenant_bps`.

The warning `refund_provider_fee_treatment_unconfirmed` is currently severity `warning`, not
`blocking`. It does not itself hold settlement: reconciliation releases a transaction based on
remaining blocking exceptions. The warning is still useful as a signal that the fee outcome has not
been confirmed.

### Open decision — not yet decided

Pat decides who bears any provider fee that PayMongo does not return. These options do not change
the customer's refund behavior in this PR:

| Option | Mechanism | Consequence |
|---|---|---|
| A. Store/tenant absorbs | Preserve the capture-time tenant share. With `provider_fee_payer: tenant`, the tenant payable carries the −₱2.50 shown above. | DGFY loses nothing on the fee itself. A store whose order rejection caused the refund pays ₱2.50 per example refund; a tenant with no later positive batch may leave a negative balance unrecovered. |
| B. DGFY absorbs | Set the capture-time policy to `provider_fee_payer: dgfy`. The provider fee remains DGFY's `paymongo_fee_expense`; a shared policy assigns only its DGFY share to DGFY. | On a fully refunded ₱100 GCash order, DGFY loses ₱2.50 of provider fee after reversing its ₱2.00 platform fee. Stores avoid the provider-fee deduction. |
| C. Customer absorbs | Refund ₱97.50 of the ₱100.00 payment when the provider retains a ₱2.50 fee. | Conflicts with ADR 0052 clause 14's full-refund request and changes the customer-facing promise. It is unsuitable for store-caused rejections; it could be considered only for a customer-initiated cancellation after legal review and clear checkout/Terms disclosure (see #280 under #964). |

Planner recommendation, not a decision: use the capture-time `provider_fee_payer` snapshot to
allocate the provider-fee cost (`tenant` → A, `dgfy` → B, and `shared` → each party's snapshotted
share). The capture path already records those allocations, so a retained fee does not need a
duplicate refund-time charge. If PayMongo returns any portion of the fee, a later implementation
needs an immutable fee-return entry allocated back to the parties that bore it at capture. Pat has
not selected this recommendation or an option.

### Proposed ADR 0052 amendment — future work only

Do not apply an ADR edit in this PR. After Pat decides, a later Worker PR should append a dated
`## Amendments` block to ADR 0052 and refresh its `last_reviewed`. Clause 14 is untagged and
therefore `default` under ADR 0039; no new ADR is required. The amendment should cross-reference
#964, which owns the refundable-DGFY-fee versus provider-cost rule, and #2532, which prepares the
ledger snapshot. Preserve clause 4's immutability rule, leave any `[binding]` clause unchanged, and
check the resulting ADR with `npm run check:adr`. The wording below is draft text, not an adopted
rule:

- **If A is chosen:** “On a successful refund, post the full customer refund and proportional
  DGFY-fee reversal. Any provider fee not returned remains allocated according to the capture-time
  provider-fee snapshot; a tenant-assigned share remains in tenant payable and is carried under
  clause 8.”
- **If B is chosen:** “On a successful refund, post the full customer refund and proportional
  DGFY-fee reversal. Any provider fee not returned remains allocated according to the capture-time
  provider-fee snapshot; a DGFY-assigned share remains a DGFY provider-fee expense and is not
  charged to tenant payable.” The existing capture entry uses `paymongo_fee_expense`; a refund-time
  entry is required only if a later decision reallocates a tenant-assigned share after capture.
- **If C is chosen:** “For an eligible customer-initiated cancellation only, and after the amount
  and fee treatment have been disclosed and approved for checkout and Terms, the refund amount may
  exclude a provider fee that PayMongo does not return.” This would also amend clause 14's
  full-refund requirement and requires separate legal/product approval and implementation scope.

If PayMongo confirms that it returns a provider fee, the later implementation should instead add an
immutable fee-return entry allocated by the capture snapshot; the current −₱2.50 example would then
be an accounting discrepancy until that entry is posted.

### Warning treatment — recommendation, not implementation

- The generic warning is non-blocking and does not place settlement on hold by itself.
- Once the applicable provider rule is confirmed and implemented, stop emitting the generic
  unknown-treatment warning. Record any required fee-return or absorption entry under the chosen
  rule; do not emit a duplicate warning when the provider data matches that rule.
- If PayMongo cannot confirm fee treatment per refund, keep a narrower exception only when
  transaction or balance data contradicts the documented rule; otherwise auto-resolve with a
  reason citing the confirmed source.
- Clearing the four existing production warnings is an operational action owned by #2537. This PR
  does not resolve them. Any code change to warning emission or resolution is a follow-up through
  `pm`, not part of this documentation change.

## Data Ownership

Landlord tables:

- `tenant_revenue_fee_policies`
- `tenant_revenue_transactions`
- `tenant_revenue_ledger_entries`
- `tenant_settlement_batches`
- `tenant_settlement_batch_items`
- `tenant_settlement_batch_ledger_items`
- `tenant_payouts`
- `tenant_revenue_adjustments`
- `tenant_revenue_reconciliation_records`

Financial migrations are additive and intentionally do not delete posted history.

## Workflow

1. A verified successful PayMongo payment creates one transaction snapshot and
   idempotent ledger entries. Enforced at the commerce webhook layer since #476
   (2026-08-21) by a row-locked session claim plus a unique index and locked
   lookup on `provider_event_id`, not state checks alone — see ADR 0052's
   2026-08-21 amendment for the mechanism.
2. Missing or inconsistent provider financial data creates a blocking
   reconciliation exception.
3. Reconciled transactions become eligible after the policy's 15/30-day cycle.
4. Finance prepares a tenant-period batch.
5. A different platform administrator approves the batch and reason.
6. The approved transfer is recorded manually.
7. The batch approver confirms the provider/bank reference and proof.
8. Only then does the ledger record payout and mark included transactions settled.
9. Later refunds, chargebacks, or approved adjustments are allocated once to the
   next positive batch.

## API Surfaces

Platform Admin:

- `GET /api/v1/tenant-revenue/admin/dashboard`
- `GET /api/v1/tenant-revenue/admin/transactions`
- `GET /api/v1/tenant-revenue/admin/transactions.csv`
- `GET|POST /api/v1/tenant-revenue/admin/tenants/:tenant_id/fee-policies`
- `GET|POST /api/v1/tenant-revenue/admin/settlement-batches`
- batch approve, cancel, schedule, and payout subroutes
- payout confirm, fail, and retry subroutes
- reconciliation list, internal audit, provider statement import, and resolution
- adjustment request and independent approval

Authenticated tenant:

- `GET /api/v1/tenant-revenue/tenant/summary`
- `GET /api/v1/tenant-revenue/tenant/transactions`
- `GET /api/v1/tenant-revenue/tenant/settlements`
- `GET /api/v1/tenant-revenue/tenant/fee-history`

Tenant IDs on tenant routes are always derived on the server from the authenticated
tenant context; query-supplied tenant IDs are overwritten.

Public Storefront checkout:

- `POST /api/v1/store/checkout/payment-sessions/:payment_session_id/cancel` cancels an
  unpaid session using its stored PayMongo Payment Intent or Hosted Checkout session ID.
  The server accepts only `created` and `awaiting_payment` sessions; paid/order-finalized
  sessions are returned unchanged and never trigger a refund from this endpoint.
- The response keeps the existing `payment_session` serialization and adds
  `cancellation.outcome`: `cancelled` only after provider confirmation (or for a `created`
  session with no provider object), `not_cancellable` for a terminal session, and `unresolved`
  when provider state cannot be confirmed. An unresolved session remains non-terminal and
  carries its failure code/reason for later reconciliation.
- The provider request runs outside the database transaction. A locked re-read before writing
  preserves a concurrent paid state; cancellation never creates an order or captured charge.

## Environment

Required before enabling:

- `TENANT_REVENUE_SHARING_ENABLED=false`
- `TENANT_PAYOUT_ENCRYPTION_KEY=<minimum 32-byte secret>`
- `COMMERCE_PAYMONGO_SPLIT_ENABLED=false`
- configured mode-specific PayMongo secret and webhook secret

Keep disabled:

- `TENANT_AUTOMATIC_PAYOUT_ENABLED=false`
- `TENANT_EXTERNAL_PAYOUT_APPROVED=false`

Production finance access should use `ADMIN_ACCOUNTS_JSON` with separate
`finance_preparer` and `finance_approver` identities. The legacy
`ADMIN_USERNAME` account remains compatible and receives the
`platform_admin` financial role by default, but one identity cannot satisfy
the maker-checker rule for its own settlement batch or adjustment.

Optional safe defaults:

- `TENANT_REVENUE_DEFAULT_RATE_BPS=100`
- `TENANT_REVENUE_DEFAULT_SETTLEMENT_CYCLE_DAYS=15`

Provider fallback rates belong in versioned tenant policy JSON by payment method,
not a universal environment rate.

## Deployment

1. Back up the landlord database.
2. Deploy code with revenue sharing disabled.
3. Apply `20260730000002-create-tenant-revenue-settlement.cjs`.
4. Run architecture, lint, targeted financial tests, frontend tests, and all
   affected production builds.
5. Create on-hold test policies and encrypted payout destinations.
6. Reconcile real PayMongo sandbox evidence.
7. Enable revenue sharing only after split mode is confirmed off.
8. Canary one tenant, review exceptions and ledger totals, then expand.

## Rollback

1. Set `TENANT_REVENUE_SHARING_ENABLED=false`.
2. Leave the migration and financial rows intact.
3. Stop new payout preparation.
4. Reconcile any successful payments posted during the enabled period.
5. Roll back application code only after the reconciliation inventory is signed off.

## External Go-Live Requirements

- PayMongo confirms the correct platform collection and settlement account structure.
- Accounting approves tenant payable, provider-fee, DGFY revenue, refund, and tax treatment.
- Legal approves tenant/customer contracts and settlement terms.
- Regulatory counsel confirms whether DGFY's collection and release flow requires
  additional licensing, safeguarding, trust, reporting, or operational controls.
- Operations defines payout proof retention, failed-transfer escalation, and
  reconciliation ownership.
- A separate ADR and adapter review is required before any automatic payout.

## Local Implementation Status — 2026-07-31

Phases 1–18 are implemented and locally validated:

- 51 focused backend tests passed across financial calculations, fee modes,
  settlement cycles, historical policies, refunds, chargebacks, idempotency,
  settlement uniqueness, maker-checker roles, tenant isolation, encryption, and
  production environment validation.
- 7 admin and tenant financial UI contract tests passed.
- Targeted backend and frontend ESLint passed without errors.
- Architecture guardrails and controller-boundary checks passed.
- Compliance impact and API-contract checks passed.
- Governed documentation lint and production environment fixtures passed.
- SKUpervisor, POS, and Storefront production builds passed.

This status means the software implementation is complete locally. It does not
authorize production fund custody or tenant payouts. Revenue sharing remains off
until every external go-live requirement above is signed off and the production
migration/canary procedure is separately approved.
