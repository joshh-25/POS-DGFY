---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-20
related_adr: docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-10-20-admin-commerce-refund-retry
classification: regulatory
surfaces: payments,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.10.16
verification_evidence: focused commerce refund retry/list Jest suites,Platform Admin refund retry Vitest suite,node --check on changed API and migration files,disposable MySQL 8 migration up/down round trip,npm run build:admin,npm run check:compliance,npm run check:architecture,npm run lint:docs,GITHUB_BASE_REF=develop GITHUB_HEAD_REF=fix/2549-admin-refund-retry node scripts/check-app-version-bump.js --staged
rollback_note: Revert the Admin retry/list routes, append-only retry link, UI, related tests and docs together. Apply the migration down only after rolling back the API code; it removes the retry link, FK, and index but preserves refund rows. Do not delete or rewrite refund/audit history.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-20T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-20-ADMIN-COMMERCE-REFUND-RETRY
---

# Platform Admin commerce refund retry (#2549)

## Compliance Impact Classification

Regulatory. The commerce payment API and routes have a `major` payments floor. The
Platform Admin service path has a `regulatory` settings/compliance floor, which sets the
classification for this change. The workflow creates append-only refund attempts and audit
evidence; it does not change payment capture, tenant settlement policy, tax treatment, or
provider credentials.

## Affected Surfaces

- `payments` — authenticated cross-session refund listing, retry validation, fresh PayMongo
  reads, retry-chain persistence, and success/blocked audit events.
- `settings`, `compliance` — Platform Admin Payment Operations service and UI surface.
- Landlord `commerce_payment_refunds` — nullable self-reference for retry lineage. This is
  not a tenant-schema change.

## Compliance Preconditions

- The retry route remains behind `authenticateAdmin` and the existing `admin.payments`
  permission. The UUID actor comes from the authenticated request; client actor fields are
  rejected.
- Retry reasons are trimmed, length-bounded, stored in `audit_logs.reason` and
  `changes.retry_reason`, and are never sent to PayMongo.
- A retry is submitted only after eligibility, chain-head, active-refund, and fresh-provider
  checks. Provider read failures and ambiguous matching refunds fail closed and are audited.
- Each new attempt points to its original through `retry_of_refund_id`; original refund
  records are never updated or deleted. The foreign key uses `ON DELETE RESTRICT`.
- Retry and blocked events use the original integer refund ID for `audit_logs.entity_id` and
  preserve public references, authenticated actor, request ID when available, reason, and
  outcome/block code in the audit record.
- Migration `20261020000002` changes the landlord schema only. The down migration removes
  the retry link schema after code rollback and does not remove refund or audit rows.
- This declaration uses the accepted `NOT-EXECUTED-*` request-time preflight state for a
  `develop` PR. A live preflight was not executed in this workspace; the continuous
  compliance-preflight sweep reconciles the reference after the declaration reaches
  `develop`.

## Verification Evidence

Validation passed: focused API Jest suites (4 suites, 46 tests), Platform Admin Vitest suites
(2 files, 54 tests), JavaScript syntax checks, Admin production build, compliance and
architecture guardrails, docs lint, the `develop` app-version floor check, and a disposable
MySQL 8 migration up/up/down/down round trip. The migration check verified the self-reference
foreign key, index, column cleanup, and preservation of an existing refund row. The suites cover
retry reasons and actor identity, integer audit IDs, outcome status, chain-head enforcement,
blocked provider reads, session/refund scoping, list eligibility, and the Admin confirmation
flow. No live PayMongo refund or production environment was mutated during implementation.
