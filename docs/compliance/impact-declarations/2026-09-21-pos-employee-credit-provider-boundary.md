---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-21
related_adr: 0085-pos-employee-credit-mixed-split-tender.md
declaration_id: 2026-09-21-pos-employee-credit-provider-boundary
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: VALIDATION_FAILED,CONFLICT
policy_version: 2026.09.21
verification_evidence: split-payment validator and use-case contracts; API source syntax and lint; documentation validation; git diff check
rollback_note: Revert the Employee Credit provider-field validation and provider-operation guards, focused regression contracts, contract wording, and this declaration; no transaction, ledger, tenant, or production-row rollback is required.
preflight_result: no_breach
preflight_reason_code: EMPLOYEE_CREDIT_PROVIDER_BOUNDARY
preflight_run_at: 2026-09-21T20:55:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-448-LOCAL-ONLY
---

# POS Employee Credit provider boundary hardening

## Compliance Impact Classification

Major because the change hardens the POS payment boundary for an existing
Employee Credit tender. It closes an API/use-case path that could accept
provider-owned or manual-payment metadata for an internal tender and prevents
Employee Credit allocations from reaching provider confirmation or
reconciliation. No new financial owner or provider integration is introduced.

## Affected Surfaces

- POS split-payment allocation validation and persistence.
- POS provider-confirmation and PayMongo reconciliation guards.
- Employee Credit internal tender and final checkout completion boundary.

## Compliance Preconditions

- Employee Credit allocations remain internal and successful only; handoff,
  manual-receipt, provider/reference, failure, and non-success outcome fields
  are rejected at transport and use-case boundaries.
- Employee Credit cannot invoke provider confirmation or reconciliation, and
  the provider adapter is not called for that tender.
- Existing account verification, tenant/location/terminal/shift scope,
  idempotency, completion, reversal, and ledger ownership remain unchanged.
- No production deployment, transaction, ledger row, tenant business row, or
  provider call is part of this local change.

## Verification Evidence

- Focused split-payment route, use-case, and schema contracts passed (47
  tests), including malicious provider-field input and provider-operation
  rejection tests.
- API source syntax checks passed; the scoped implementation follows the
  existing POS error and transport contracts.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. No production
deployment, transaction, ledger data mutation, or external provider call was
performed.
