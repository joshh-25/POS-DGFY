---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-business-admin-operational-expense-ledger
classification: regulatory
surfaces: pos,business_admin,financial_evidence,tenant_schema,terminal,settings,compliance
reason_codes_impacted: BUSINESS_ADMIN_FINANCIAL_EVIDENCE,FINANCIAL_MUTATION,ALLOWED
policy_version: 2026.09.17
verification_evidence: Business Admin expense use-case contracts; POS expense workspace contract; tenant schema registry and additive migration checks; API/POS syntax and production build; architecture, documentation, compliance, and git diff checks
rollback_note: Revert the expense route/use-case/repository/model, POS workspace, permissions, additive migration, schema registry entry, tests, documentation, and declaration together; do not drop tenant expense evidence after records are created without a governed data-retention decision.
preflight_result: no_breach
preflight_reason_code: BUSINESS_ADMIN_FINANCIAL_EVIDENCE
preflight_run_at: 2026-09-17T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-388-LOCAL-ONLY
---

# POS Business Admin operational expense ledger

## Compliance Impact Classification

Major because the change adds a new tenant-local financial-evidence record and
mutation path. The contract is deliberately limited to operational expense
capture, branch scoping, audit-backed void, and PHP totals; it does not create a
statutory ledger, tax calculation, profit-after-expenses calculation, payout
settlement, or POS drawer event.

## Affected Surfaces

- POS Business Admin Expenses workspace, filters, create form, and void dialog.
- Tenant-local `business_admin_expenses` storage, additive migration, and schema
  repair registry.
- Business Admin permissions, API routes, use cases, repository reads/writes,
  and audit evidence.

## Compliance Preconditions

- Tenant and assigned-branch authorization is evaluated server-side for every
  list, create, and void operation; the client cannot widen location scope.
- Cash added/cash-out and shift variance remain owned by POS Shifts & cash;
  expense creation never mutates drawer totals.
- Posted records are not edited or hard-deleted. Voids require a reason and
  append audit evidence; creates use a unique idempotency key.
- Tax treatment, profit-after-expenses, account mapping, accruals, payout
  reconciliation, and statutory filing remain deferred until an accounting
  owner approves a follow-up contract.
- No production deployment, merge, push, or live tenant data mutation was
  performed by this local implementation session.

## Verification Evidence

- Focused API use-case contracts cover branch scope, validation, idempotent
  create, audit calls, reasoned void, and cashier denial.
- POS contract tests cover the expense API wiring, create/void controls, cash
  boundary, and responsive desktop/mobile presentation; the POS production
  build passes.
- The additive migration and tenant-schema registry define the same table and
  indexes for landlord/active tenant fan-out and repair coverage.

**Live request-time compliance preflight was not executed.** This declaration
uses the documented `NOT-EXECUTED-*` placeholder for local work; it must be
reconciled by the governed preflight process before promotion. No production
deployment, merge, push, or production data mutation was performed.
