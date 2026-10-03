---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-03
related_issue: https://github.com/Sieitzz/dgfy-platform/issues/2224
related_adr: docs/architecture/adr/0081-per-app-container-semantic-versioning.md
declaration_id: 2026-10-03-frozen-candidate-quality-repair-2224
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.03
verification_evidence: API F&B contract command 5 suites/121 tests,Storefront full suite 228 files/1,254 tests,IMS contract subset 22 tests,git diff --check
rollback_note: Revert the isolated recorder injection, stale contract assertion updates, formatting corrections, candidate note amendment, and this declaration; no persisted POS, payment, fiscal, or tenant data changes are involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-03T02:17:21.378Z
preflight_request_ref: PREFLIGHT-LOCAL-1790993721708-2026-10-03-FROZEN-CANDIDATE-QUALITY-REPAIR-2224
---

# Frozen Candidate Quality Contract Repair (#2224)

This declaration covers test-contract alignment and a test seam in the frozen candidate repair. It does not change POS, terminal, payment, or fiscal runtime behavior.

## Compliance Impact Classification

Major because the repository's mechanical path floor classifies the two changed shared POS contract tests under `packages/web-core/src/features/pos/` as `pos` and `terminal`, and the checkout recorder seam is in the Storefront payments module. The classification reflects those governed paths; the POS edits update stale source assertions only, and the production checkout recorder remains the default.

## Affected Surfaces

- `pos` and `terminal` — two shared contract tests now assert against the current checkout view and source structure.
- `payments` — the Storefront checkout use case accepts an injectable post-commit order activity recorder. Its production default is the existing `recordDgfyOrderActivity`; the test helper supplies a resolved stub so unit tests do not perform real database writes under frozen timers.

## Compliance Preconditions

1. The POS/terminal contract assertions continue to check the existing checkout and employee-credit source contracts; no behavior assertion is removed.
2. Production callers that omit the optional recorder retain the existing customer activity synchronization behavior.
3. No payment amount, authorization, tender, fiscal document, reason-code, API response, schema, migration behavior, or tenant data is changed.
4. The database recorder stub is supplied only by the mocked checkout test helper; it does not alter the runtime wiring in `apps/dgfy-api/src/modules/store/index.js`.

## Verification Evidence

- The exact API F&B CI command passed with open-handle diagnostics: 5 suites, 121 tests; the previously timing-out scheduled-checkout cases passed after the recorder was injected as a test dependency.
- The full Storefront suite passed: 228 files, 1,254 tests.
- Focused IMS/POS contract tests passed: 22 tests.
- `git diff --check` passed, and the required changed-file safety scan found no restricted markers.

## Rollback

Revert the code and contract-test changes, the candidate release-note amendment, and this declaration. No persisted POS, payment, fiscal, or tenant data change needs to be reversed.
