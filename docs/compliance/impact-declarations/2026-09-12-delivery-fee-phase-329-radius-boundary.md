---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-delivery-fee-phase-329-radius-boundary
classification: major
surfaces: pos,terminal,payments,settings
reason_codes_impacted: NONE
policy_version: 2026.09.12
verification_evidence: zero-radius persistence, map overlay, road-distance boundary, API/frontend lint, architecture, documentation, compliance, workspace, and diff checks
rollback_note: Revert the Phase 329 radius helper, location-save wiring, tests, documentation, and declaration together. The change preserves existing tenant-location fields and checkout fee semantics; no persisted tenant, payment, or schema data is modified.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.556Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-12-DELIVERY-FEE-PHASE-329-RADIUS-BOUNDARY
---

# Zero-radius persistence and map/checkout boundary

## Compliance Impact Classification

Major by the repository path-based classification floor. Phase 329 corrects radius normalization at
the location-settings boundaries so an explicit `0` km value is retained instead of being replaced
by the five-kilometer default. It also makes the POS coverage copy reflect that value while keeping
the map preview and checkout distance contracts separate.

## Affected Surfaces

- `pos` and `settings` — POS setup, POS settings, onboarding, and IMS location forms persist the
  same zero-radius value through the existing tenant-location API.
- `terminal` — the POS coverage preview no longer displays a false five-kilometer radius for zero.
- `payments` — checkout continues to price against road distance and `max_distance_km`; the map
  radius is not used as a straight-line checkout gate.

## Compliance Preconditions

- Missing, blank, or unusable radius input defaults to `5` km; numeric `0` remains valid and is
  accepted by the existing API validator and database column.
- `MapPinPicker` renders no coverage polygon for a zero or non-positive radius.
- Exact `max_distance_km` remains in range, a known road distance beyond it remains a checkout hard
  block, and unavailable road distance retains the fixed-fee fallback.
- No database schema, migration, tenant row, permission, receipt, settlement, or payment record is
  changed.

## Verification Evidence

- Jest coverage verifies API request/use-case create and update persistence for explicit zero and
  the five-kilometer default when omitted.
- Shared frontend coverage verifies the normalization contract, POS/onboarding wiring, zero-radius
  map overlay removal, and checkout's road-distance boundary with a zero location radius.
- API/IMS lint, frontend tests, architecture, docs/ADR, compliance, workspace-hygiene, and
  whitespace checks are run before delivery.

This declaration is for the authorized local implementation only. Request-time compliance preflight
was not executed because Phase 329 makes no PR, push, deployment, production, or data-mutating
operation.
