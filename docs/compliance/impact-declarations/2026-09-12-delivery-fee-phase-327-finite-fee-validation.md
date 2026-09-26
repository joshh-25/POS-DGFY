---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-delivery-fee-phase-327-finite-fee-validation
classification: major
surfaces: pos,terminal,payments,settings
reason_codes_impacted: NONE
policy_version: 2026.09.12
verification_evidence: delivery-fee minimum-boundary and finite-result tests, API/frontend lint, all frontend builds, architecture, documentation, compliance, workspace, and diff checks
rollback_note: Revert the Phase 327 runtime, test, documentation, and declaration changes together. Valid-input fee math and the persisted settings shape remain unchanged; invalid sub-meter configurations fail closed through the existing fixed-fee fallback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.556Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-12-DELIVERY-FEE-PHASE-327-FINITE-FEE-VALIDATION
---

# Delivery-fee minimum increment and finite-result validation

## Compliance Impact Classification

Major by the repository path-based classification floor. Phase 327 hardens the delivery-fee
configuration and pure calculation boundaries so an increment cannot canonicalize to zero meters
and an overflowed calculation cannot return `NaN` or `Infinity`. The existing valid-input formula,
fixed-fee fallback, payment amount semantics, and algorithm version remain unchanged.

## Affected Surfaces

- `pos` — shared POS delivery-pricing settings and validation controls.
- `terminal` — IMS delivery-pricing settings entry point.
- `payments` — calculated delivery-fee policy result validation.
- `settings` — API and administrator-form validation for calculated delivery-fee configuration.

## Compliance Preconditions

- The one-meter floor is defined in the shared constants package and revalidated by the backend;
  frontend controls only provide earlier feedback and cannot bypass API validation.
- Invalid calculated-mode blobs continue to fail toward the existing fixed-fee fallback at the
  use-case layer; no order, receipt, settlement, or payment record is rewritten.
- No database schema, migration, tenant row, permission, or deployment behavior is changed.

## Verification Evidence

- Jest coverage replaces the Phase 326 divide-by-zero witness with rejection below `0.001` km,
  acceptance at the one-meter boundary, and overflow rejection via `NON_FINITE_RESULT`.
- API and shared serializers reject sub-meter increments; POS and IMS controls expose the same
  one-meter minimum through the shared constant contract test.
- API/IMS lint, all three frontend production builds, architecture, docs/ADR, compliance,
  workspace-hygiene, and whitespace checks are run before delivery.

This declaration is for the authorized local implementation only. Request-time compliance preflight
was not executed because Phase 327 makes no PR, push, deployment, production, or data-mutating
operation.
