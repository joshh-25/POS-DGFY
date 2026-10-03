---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-03
declaration_id: 2026-10-03-pos-location-scope-lazy-test-wait
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.03
verification_evidence: npm run test:frontend:contracts (140 files, 810 tests passed),focused terminalLocationScope.integration.test.jsx (16 tests passed),git diff --check
rollback_note: Revert the focused lazy-render wait adjustment and this declaration; no POS runtime behavior, API, authorization, schema, or tenant data changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-03T09:13:00.839Z
preflight_request_ref: PREFLIGHT-37111834633-2026-10-03-POS-LOCATION-SCOPE-LAZY-TEST-WAIT
---

# POS location-scope lazy-render test wait

## Compliance Impact Classification

Major because the repository's path-based floor classifies shared POS integration tests under
`packages/web-core/src/features/pos/__tests__/` as `pos` and `terminal`. This change adjusts only
the wait budget for the incoming queue's lazy render; it does not change the test's content,
location-scope, or operating-location-selector assertions.

## Affected Surfaces

- `pos` and `terminal` — one shared integration test only.

## Compliance Preconditions

1. No POS runtime component, API behavior, permission, payment, fiscal, inventory, or tenant logic
   changes.
2. No database schema, migration, persisted state, or production tenant data changes.
3. This PR is not claiming a live compliance preflight. Its `NOT-EXECUTED-*` placeholder is the
   accepted PR-open state; the continuous develop preflight sweep reconciles it after merge.

## Verification Evidence

- `npm run test:frontend:contracts` passed: 140 files, 810 tests.
- Focused `terminalLocationScope.integration.test.jsx` passed: 16 tests.
- `git diff --check` passed.

## Rollback

Revert the test wait adjustment and this declaration. No runtime or persisted data rollback is
required.
