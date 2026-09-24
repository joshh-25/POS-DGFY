---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-24
related_adr: 0004-architecture-compliance-automation.md
declaration_id: 2026-09-24-pos-lazy-queue-test
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,UI_LAYOUT
policy_version: 2026.09.24
verification_evidence: npm run test:frontend:contracts,git diff --check
rollback_note: Revert the test timeout adjustment and this declaration; production behavior is unchanged.
preflight_result: no_breach
preflight_reason_code: UI_LAYOUT
preflight_run_at: 2026-09-24T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PR-2054-POS-LAZY-TEST-LOCAL-ONLY
---

# POS lazy-loaded queue integration test stabilization

## Compliance Impact Classification

Major by the repository's path-based floor because the changed test resides
under the shared POS terminal feature directory. The change only extends the
existing asynchronous wait for a `React.lazy` panel; it does not modify the
component, its API calls, queue visibility rules, location scope, or
authorization behavior.

## Affected Surfaces

- `pos` and `terminal` — the existing queue location-scope integration contract
  is tested after the lazy-loaded panel resolves.

## Compliance Preconditions

1. The longer timeout applies only to the test query and does not change
   production runtime behavior.
2. Existing terminal shift, queue visibility, and location-scope conditions
   remain covered by the same integration suite.
3. No production deployment or live tenant qualification is claimed by this
   declaration.

## Verification Evidence

- `npm run test:frontend:contracts` — 122 files and 737 tests passed.
- `git diff --check` passed.
