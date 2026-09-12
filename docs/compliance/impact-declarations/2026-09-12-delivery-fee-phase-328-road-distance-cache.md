---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-delivery-fee-phase-328-road-distance-cache
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.12
verification_evidence: road-distance provider cache identity and finite-result tests, API lint, architecture, documentation, compliance, workspace, and diff checks
rollback_note: Revert the Phase 328 provider, tests, documentation, and declaration together. The change only affects in-process road-distance cache reuse and invalid-result handling; no persisted fee, payment, tenant, or schema data is modified.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-12T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-DELIVERY-FEE-PHASE-328-LOCAL-ONLY
---

# Origin-aware road-distance cache identity and collision policy

## Compliance Impact Classification

Major by the repository path-based classification floor. Phase 328 changes only the in-process
road-distance adapter's cache identity and response validation. It prevents stale routes after an
origin-pin change, avoids sharing a route across nearby destination coordinates, and rejects invalid
successful distance payloads before they can be reused. The delivery-fee formula and persisted
payment amounts remain unchanged.

## Affected Surfaces

- `payments` — road distance is an input to calculated delivery-fee resolution.
- `pos` and `terminal` — checkout and terminal flows consume the provider's fail-open result.

## Compliance Preconditions

- The cache key contains tenant and location identity plus the complete origin/destination
  coordinate tuple; missing identity bypasses caching rather than sharing an ambiguous entry.
- Only finite, non-negative numeric road distances are cached. Invalid success payloads resolve to
  the existing `source: 'unavailable'` fallback and do not block checkout.
- No database schema, migration, tenant row, permission, receipt, settlement, or payment record is
  changed.

## Verification Evidence

- Jest provider coverage verifies exact-route cache reuse, origin changes, nearby destination
  separation, missing-identity bypass, tenant isolation, transient failures, and invalid finite
  result handling.
- API lint, architecture, docs/ADR, compliance, workspace-hygiene, and whitespace checks run before
  delivery.

This declaration is for the authorized local implementation only. Request-time compliance preflight
was not executed because Phase 328 makes no PR, push, deployment, or data-mutating operation.
