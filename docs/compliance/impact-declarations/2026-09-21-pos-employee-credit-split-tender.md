---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-21
related_adr: 0085-pos-employee-credit-mixed-split-tender.md
declaration_id: 2026-09-21-pos-employee-credit-split-tender
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHORIZATION_FAILED,CONFLICT
policy_version: 2026.09.21
verification_evidence: split-payment use-case contracts; Employee Credit ledger contracts; checkout payment-breakdown contracts; tenant-schema migration contracts; API source lint; POS shared UI contracts; POS production build; documentation and git diff checks
rollback_note: Revert the Employee Credit split-tender UI, allocation/completion handling, additive migration, focused contracts, ADR, and ledger entry together; no historical transaction, ledger, tenant, or production-row rollback is required.
preflight_result: no_breach
preflight_reason_code: EMPLOYEE_CREDIT_SPLIT_TENDER
preflight_run_at: 2026-09-21T20:05:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-445-LOCAL-ONLY
---

# POS Employee Credit mixed split tender

## Compliance Impact Classification

Major because the change extends the existing POS payment and Employee Credit
ledger boundary to support a verified Employee Credit portion inside a split
payment. It does not create a second financial owner: the existing POS checkout
transaction remains the atomic owner of completing the sale, while the existing
Employee Credit ledger remains the owner of the Employee Credit debit.

## Affected Surfaces

- POS split-payment allocation and completion flows.
- Employee Credit account verification, authorization, balance validation, and
  ledger debit for the Employee Credit portion only.
- Tenant-local `pos_payment_allocations` schema and runtime tenant-schema audit.

## Compliance Preconditions

- Employee Credit remains online-only and requires the existing verified,
  eligible account path; account codes are not exposed in public allocation
  responses.
- A split may contain at most one Employee Credit allocation, and its account
  code is required server-side. Provider-owned payment fields are forbidden for
  this internal tender.
- Only the Employee Credit allocation amount is debited from the existing
  Employee Credit ledger. Cash and other supported tenders retain their existing
  settlement behavior.
- Cancelling an Employee Credit allocation before checkout completion does not
  create a ledger debit or refund; the additive schema change is nullable for
  legacy allocation rows.
- Existing tenant, branch, shift, permission, fiscal, payment, and transaction
  controls remain authoritative. No production deployment or data mutation is
  part of this local change.

## Verification Evidence

- Focused API split-payment, schema, checkout payment-breakdown, Employee
  Credit, transport, and runtime-schema contracts passed, including the mixed
  Employee Credit plus cash flow.
- POS shared split-payment UI contracts passed; app-local ESLint passed with
  zero errors; POS production build passed with only existing Vite warnings.
- Migration syntax, tenant-schema synchronization contracts, ADR validation,
  documentation validation, and `git diff --check` passed.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. No production
deployment, production transaction, or ledger data mutation was performed.
