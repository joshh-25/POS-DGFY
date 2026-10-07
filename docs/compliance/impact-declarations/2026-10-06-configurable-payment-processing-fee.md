---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-06
declaration_id: 2026-10-06-configurable-payment-processing-fee
classification: major
surfaces: pos,terminal,settings,payments,inventory
reason_codes_impacted: FINANCIAL_EVIDENCE,PERMISSION_BOUNDARY,AUTHORIZATION_FAILED,ALLOWED
policy_version: 2026.10.06
verification_evidence: tenant revenue focused Jest suites, Owner policy validator contract, OPIS processing-fee contract suite, OPIS lint and production build, architecture checks, documentation and ADR lint, local compliance check, git diff safety check
rollback_note: Revert the tenant-revenue Owner policy endpoint, item-processing-fee checkout/snapshot fields, OPIS settings and order-detail surface, storefront breakdown, schema capability registration, ADR amendment, tests, and this declaration together. The migration is local-only and must be rolled back before removing the new columns; no live tenant data mutation is part of this local implementation.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-06T00:00:00+08:00
preflight_request_ref: LOCAL-20261006-PAYMENT-FEE
---

# Configurable item-processing fee policy — local implementation

## Compliance Impact Classification

Major because the change exposes a tenant-scoped financial-policy configuration
and adds an optional item-processing charge to Storefront checkout. It preserves the
immutable transaction and settlement model: an Owner can version only the
item-processing fee and payment-method fallback estimates, while platform
settlement fields remain finance-controlled and actual provider or reconciled
statement evidence wins.

## Affected Surfaces

- OPIS Business Admin settings and payment reporting for tenant Owners and
  explicitly authorized fee-policy viewers/editors.
- Tenant Revenue policy, transaction, reconciliation, and audit contracts.
- Storefront quote/checkout/payment-session/order snapshots and item-processing
  fee breakdowns.
- Local landlord migration and tenant-schema capability registration for the
  policy and snapshot columns.
- Permission projection and server-side tenant-context authorization for the
  policy view/write routes.
- Existing POS/shared-terminal files present in the worktree remain unrelated
  user changes and are not part of this feature's implementation scope.
- IMS is explicitly out of scope and was not edited.

## Compliance Preconditions

- Owner writes contain no tenant selector and derive tenant context from the
  authenticated session; strict validation rejects protected platform fields
  and unknown nested fallback fields.
- Policy changes are immutable version inserts with expected-version conflict
  protection and audit evidence. Fallback fees are labeled estimates and create
  a blocking reconciliation/on-hold state until actual evidence reconciles.
- Existing customer totals remain unchanged when the Owner policy is disabled;
  when enabled, the server adds only the configured item-processing fee after item
  discounts and before delivery. It is independent of the payment method and
  provider. POS terminal checkout, legacy DGFY convenience-fee fields, provider
  fallback financials, service fees, and platform settlement fields remain separate.
- The landlord migration and tenant-schema repair were applied and verified in
  the local UpdatePOS databases only. No merge, push, deployment, or live
  tenant data mutation occurred during this local implementation session.

## Verification Evidence

- Focused tenant-revenue, item-processing policy, security, Owner-policy validator,
  and fallback-reconciliation tests pass, including the ₱1,000/3% quote
  contract.
- Storefront checkout/tracking breakdown and server-snapshot tests pass; OPIS
  settings/manifest/processing-fee contract tests pass.
- OPIS settings/manifest/processing-fee contract tests pass: 17 tests across 3
  files; OPIS lint has no errors and the OPIS production build passes.
- API, Storefront, and OPIS changed-surface lint passes with existing repository
  warnings only; Storefront and OPIS production builds pass; `git diff --check`
  passes.
- Local tenant-schema repair and the follow-up report pass for all 15 active
  tenant databases at schema capability `2026-10-06.1`.
- Verification is local-only. The root aggregate test command was not used for
  final evidence because its script automatically enters IMS; no IMS file was
  edited.

**Live request-time compliance preflight was not executed.** This declaration
records local implementation evidence only and must be reconciled by the
governed preflight process before promotion. No production deployment, merge,
push, or production data mutation was performed.
