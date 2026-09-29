---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-29
related_adr: docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-09-29-pos-shift-resume-tests
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.29
verification_evidence: focused POS shift-resume contract run (2 files, 8 passed),npm run test:frontend:contracts (768 passed, 1 pre-existing unrelated failure in posSettingsCashier.contract.test.js),npm run build:pos (passed),Playwright spec list-load (2 tests),node scripts/check-app-version-bump.js (no bump required),git diff --check
rollback_note: Revert this declaration together with the paired shift-resume regression tests (terminalPageShiftResumeRace.contract.test.js and dgfy-business-shift-resume.spec.js). No runtime, API, schema, or production shift data change is involved, so no backend or migration rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T16:34:52Z
preflight_request_ref: NOT-EXECUTED-2129-POS-SHIFT-RESUME-TESTS
---

# POS Shift-Resume Regression Tests (#2129)

## Compliance Impact Classification

Major. The classification floor comes from `packages/web-core/src/features/pos/**`
(`pos`, `terminal`, `major`) per `docs/compliance/compliance-classification-matrix.md`, which is
matched by the single compliance-sensitive file this change touches,
`packages/web-core/src/features/pos/__tests__/terminalPageShiftResumeRace.contract.test.js`.
The change is test-only: no runtime component, service, API route, permission check, fiscal
calculation, or persisted state is modified. Shift ownership, opening-cash handling, and the
#2128 resume fix itself are unchanged; these tests only pin their behavior.

No live request-time preflight was executed for this declaration before PR-open. That is the
accepted, expected state at PR-open time per
`docs/compliance/request-time-preflight-protocol.md`: the `NOT-EXECUTED-2129-POS-SHIFT-RESUME-TESTS`
request ref above is a placeholder for the continuous
`compliance-preflight-sweep.yml` trigger to reconcile after this declaration lands on `develop`.
The front-matter `no_breach` result therefore records the test-only, no-behavior-change assessment
stated here, not a live policy-engine evaluation.

## Affected Surfaces

- POS terminal shift-resume regression coverage (new deterministic contract test; no runtime
  surface change).
- POS DGFY Business handoff Playwright spec (extended assertions only; the credential-gated
  flow and its synthetic fixtures are unchanged in shape).

## Compliance Preconditions

1. No runtime behavior changes. `TerminalPage.jsx`, POS services, and every API contract are
   byte-identical to the #2128 fix state; only `__tests__` and `tests/e2e` files change.
2. No shift lifecycle mutation is introduced or simulated against real data. The Playwright
   extension records `POST /api/v1/pos/terminal/shifts/open` and asserts zero such requests; its
   route guard fulfills (never forwards) any unexpected open call, so no real shift can be
   created by the test.
3. All fixtures are synthetic and explicitly non-production (shift 987654321, ₱/PHP 2000 opening
   float on COUNTER-01/location 1). No production tenant data is read, referenced, or mutated.
4. Failed-lookup coverage asserts the retryable resume prompt is retained with no false success
   and no opening-cash form; it does not alter the recovery behavior itself.
5. No database schema, migration, seed, permission, fiscal, payment, or compliance decision rule
   change is included.

## Verification Evidence

- Focused POS shift-resume contract run passed: `terminalPageShiftResumeRace.contract.test.js`
  (6 tests) plus the existing
  `terminalPageOperationalContextSequenceGuard.contract.test.js` (2 tests) — 2 files, 8 passed.
- `npm run test:frontend:contracts` passed 768/769; the single failure is
  `posSettingsCashier.contract.test.js` ("removes redundant Storefront pane headings below the
  nested subtab rail"), which fails identically with this change stashed — pre-existing and
  unrelated to shift resume.
- `npm run build:pos` passed (unaffected runtime, confirmatory).
- Playwright spec list-loads under the real runner: 2 tests in
  `dgfy-business-shift-resume.spec.js`. Full execution requires E2E credentials plus Storefront
  and backend fixtures unavailable in this session; the browser run is recorded as unavailable
  validation in the PR body.
- `node scripts/check-app-version-bump.js` reports no version-bump requirement (no app or
  fan-out package changes).
- `git diff --check` passed.
