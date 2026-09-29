---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-29
declaration_id: 2026-09-29-pos-shift-resume-race
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: npm run build:pos,npm run build:skupervisor,npx vitest run ../../packages/web-core/src/features/pos/__tests__/terminalPageOperationalContextSequenceGuard.contract.test.js,GITHUB_BASE_REF=main GITHUB_HEAD_REF=hotfix/2128-pos-shift-resume-race npm run check:app-versions,git diff --check
rollback_note: Revert the POS shift-resume sequencing and recovery changes, their contract and E2E coverage, and this declaration together. No API, schema, or production shift data was changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T09:46:21.396Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-09-29-POS-SHIFT-RESUME-RACE
---

# POS Shift Resume Race Recovery

## Compliance Impact Classification

Major. The changed POS terminal frontend paths have a minimum classification of `major` under
`scripts/check-compliance-impact.js`. The change restores the visible state for an already-open
cashier shift after terminal resume; it does not alter financial calculations, authorization rules,
shift ownership, or stored shift history.

## Affected Surfaces

- POS terminal shift resume and unlock recovery flow.
- POS operational-context loading state used by the terminal UI.

## Compliance Preconditions

- A live request-time preflight was executed locally on 2026-09-29 against the isolated fixture
  environment. It returned `no_breach` (`ALLOWED`) and was reconciled as
  `PREFLIGHT-LOCAL-2026-09-29-POS-SHIFT-RESUME-RACE`.
- The resume path continues to use the authenticated tenant, location, terminal, and cashier
  context. It does not create or close shifts, change ownership, replace opening cash, or mutate
  production data.
- If shift confirmation fails, POS leaves the cashier in the retryable resume flow and does not
  direct them to enter a new opening float.
- No API route, database schema, migration, permission, fiscal calculation, payment flow, or
  compliance decision rule changes are included.

## Verification Evidence

- `npm run build:pos` passed.
- Focused contract test passed: `terminalPageOperationalContextSequenceGuard.contract.test.js`
  (2 tests).
- Desktop resume E2E was recognized but skipped because its credential/company prerequisites were
  unavailable. Tablet coverage remains open because the repository has no tablet Playwright
  project.
- `git diff --check` passed.
- Direct-main hotfix version check passed with POS and IMS patch bumps from 1.27.0 to 1.27.1; the
  shared `web-core` change is reachable from both apps.
