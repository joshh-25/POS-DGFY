---
status: authoritative
authority_level: authoritative
owner: product_engineering
last_reviewed: 2026-08-21
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
