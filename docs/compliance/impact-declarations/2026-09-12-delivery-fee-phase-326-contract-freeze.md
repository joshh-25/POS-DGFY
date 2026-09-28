---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-delivery-fee-phase-326-contract-freeze
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: NONE
policy_version: 2026.09.12
verification_evidence: delivery-fee and road-distance regression witnesses,MapPinPicker radius contract tests,read-only local settings inventory,API/frontend lint,architecture,documentation,compliance,workspace,and diff checks
rollback_note: Revert the Phase 326 test, documentation, and declaration changes together. This phase adds contract witnesses and records a read-only inventory; it does not change runtime behavior, tenant data, payment amounts, or database schema.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.554Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-12-DELIVERY-FEE-PHASE-326-CONTRACT-FREEZE
---

# Delivery-fee, radius, and distance-cache contract freeze

## Compliance Impact Classification

Major by the repository path-based classification floor. Phase 326 adds API
and shared POS contract tests for delivery-fee math, location-radius
persistence, map coverage rendering, and road-distance cache identity. The
implementation deliberately remains diagnostic: known gaps are reproduced and
documented for Phases 327-329, with no production code, payment calculation,
tenant row, migration, or deployment changed.

## Affected Surfaces

- `pos` — location-radius form and MapPinPicker contract coverage.
- `terminal` — shared map and delivery-settings surfaces exercised by POS.
- `payments` — delivery-fee policy and road-distance resolution contracts.

## Compliance Preconditions

- The read-only inventory used the local development MariaDB connection only;
  no write-capable operation was issued and no production host was contacted.
- The API's fixed/calculated/free mode and fixed-fee fallback contracts remain
  unchanged.
- The regression witnesses intentionally assert the current defects and are
  expected to be replaced by corrected expectations in Phases 327-329.
- No database schema, migration, payment amount, receipt, settlement, or
  permission behavior is changed.

## Verification Evidence

- Jest witnesses cover the sub-meter increment divide-by-zero result, stale
  origin cache reuse, and three-decimal destination-cell reuse.
- Vitest witnesses cover the POS/onboarding `0 -> 5 km` save fallbacks and
  MapPinPicker's straight-line five-kilometer and zero-radius behavior.
- API/frontend lint, architecture, docs, compliance, workspace-hygiene, and
  whitespace checks are run before delivery.

This declaration is for the authorized local implementation only. Request-time
compliance preflight was not executed because Phase 326 makes no PR, push,
deployment, production, or data-mutating operation.
