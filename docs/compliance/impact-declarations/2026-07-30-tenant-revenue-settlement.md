---
status: reference
owner: engineering
last_reviewed: 2026-07-30
related_adr: docs/architecture/adr/0040-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-07-30-tenant-revenue-settlement
classification: regulatory
surfaces: payments,storefront_catalog,admin,reports,tenant_financials,pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHORIZATION_FAILED,CONFLICT,SERVICE_UNAVAILABLE
policy_version: 2026.07.30
verification_evidence: tenant revenue financial tests,tenant revenue security contract tests,frontend tenant revenue contract tests,npm run check:architecture,npm run lint:docs,frontend builds
rollback_note: Set TENANT_REVENUE_SHARING_ENABLED=false, stop new settlement preparation, preserve every financial table, and reconcile payments posted during the enabled window before application rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-30T20:45:00+08:00
preflight_request_ref: TENANT-REVENUE-SETTLEMENT-20260730
snapshot_commit: pending-local
---

# Tenant Revenue, Reconciliation, Settlement, and Payout

## Compliance Impact Classification

Regulatory. DGFY collection of the full customer payment followed by later tenant
settlement may create custody, safeguarding, payments regulation, accounting, tax,
contract, and operational obligations outside the software controls.

## Affected Surfaces

- Storefront PayMongo checkout and verified payment, refund, and dispute webhooks.
- Platform-admin tenant revenue configuration, reconciliation, settlement, and payout evidence.
- Tenant-scoped financial reports and settlement statements.
- Shared POS, terminal, and settings contracts touched by the current local release inventory.
- Compliance governance, production environment validation, and rollout documentation.

## Compliance Preconditions

1. The feature remains disabled by default.
2. Split mode and collect-and-settle mode cannot both be enabled.
3. Automatic payouts remain independently disabled and have no installed provider
   adapter.
4. Tenant policy starts on hold and requires an encrypted payout destination.
5. Only verified PayMongo webhooks may post successful payment, refund, or dispute
   events.
6. Provider financial discrepancies block settlement.
7. Finance preparation and administrator approval use distinct authenticated actor
   identities. Production config uses separate `ADMIN_ACCOUNTS_JSON`
   `finance_preparer` and `finance_approver` accounts.
8. Paid status requires the approving administrator, a transfer reference, and
   retained proof.
9. Financial data is append-only in integer centavos; corrections are linked ledger
   or carry-forward entries.
10. Tenant reports are server-scoped and read-only.

## External Production Blockers

- PayMongo confirms the supported collection, balance, settlement, payout, refund,
  fee, and dispute model for DGFY.
- Accounting and tax advisers approve the chart of accounts, tenant payable,
  platform fee, provider-fee VAT, withholding, invoice, and refund treatment.
- Legal approves customer and tenant contracts, settlement timing, holds,
  chargebacks, failure handling, and data retention.
- Regulatory counsel confirms licensing, safeguarding, reporting, and operational
  requirements.
- Operations approves maker-checker identities, payout evidence storage,
  reconciliation ownership, incident response, and disaster recovery.

Production fund holding and tenant payouts are not authorized by this code change
alone.

## Verification Evidence

- Tenant revenue backend financial, migration, security, role, and production-env tests.
- Admin and tenant financial UI contract tests.
- Targeted backend and frontend ESLint.
- Architecture guardrails and controller-boundary checks.
- Compliance contract checks and governed-document lint.
- SKUpervisor, POS, and Storefront production builds.
