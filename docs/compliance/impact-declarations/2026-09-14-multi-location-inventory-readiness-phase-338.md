---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-multi-location-inventory-readiness-phase-338
classification: major
surfaces: inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.14
verification_evidence: multi-location readiness unit tests, read-only tenant audit, backend lint, architecture checks, API contract checks, git diff check
rollback_note: Revert the Phase 338 readiness matrix, evaluator, audit command, package scripts, focused test, and ledger entry together; no inventory setting, stock balance, movement, or historical record is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T00:00:00+08:00
preflight_request_ref: PHASE-338-LOCAL-READINESS-AUDIT
---

# Multi-location inventory readiness audit

## Compliance Impact Classification

Major because the change audits inventory and branch-scope contracts that govern stock reads,
reservations, movements, transfers, fulfillment, and compatibility aggregates. It adds no write
path, does not enable the rollout flag, and does not alter stock or historical records.

## Affected Surfaces

- Read-only inventory readiness evaluation and tenant evidence reporting.
- Branch-scoped inventory operation matrix documentation for POS, Storefront, receiving,
  transfers, dispatch, production, reservations, and reversals.
- Developer-facing package commands and focused regression coverage.

## Compliance Preconditions

- The audit connects only to configured tenant databases and issues read-only queries.
- Missing schema, unscoped movement records, aggregate drift, missing active locations, and a
  conflicting no-location setting are reported as stable blockers; no automatic repair or flag
  change is attempted.
- Existing compatibility aggregate values remain unchanged, and no opening balance is copied
  between branches.
- Authorization, location grants, selected operating location, and original-location reversal
  requirements remain the server-enforced contracts described by ADR 0009 and ADR 0031.

## Verification Evidence

- `multiLocationInventoryReadiness.test.js` covers matrix completeness, blocking findings,
  aggregate drift, input immutability, and a healthy readiness result.
- The live audit runs across active tenants, prints stable reason codes, and exits non-zero when
  any tenant is blocked.
- Backend lint, architecture guardrails, API contract checks, and whitespace validation pass for
  the Phase 338 change set.

This declaration covers the authorized local Phase 338 implementation. No deployment, production
data mutation, rollout-flag change, or branch-balance migration was performed.
