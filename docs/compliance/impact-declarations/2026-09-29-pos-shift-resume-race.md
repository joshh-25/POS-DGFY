---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-29
declaration_id: 2026-09-29-pos-shift-resume-race
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: npm run build:pos,npx vitest run ../../packages/web-core/src/features/pos/__tests__/terminalPageOperationalContextSequenceGuard.contract.test.js,git diff --check
rollback_note: Revert the POS shift-resume sequencing and recovery changes, their contract and E2E coverage, and this declaration together. No API, schema, or production shift data was changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T09:01:49Z
preflight_request_ref: NOT-EXECUTED-2026-09-29-POS-SHIFT-RESUME-RACE
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

- Live request-time preflight was not executed for this local PR. The `NOT-EXECUTED-*` reference is
  discoverable by the continuous preflight sweep, which must reconcile it before promotion. The
  front-matter result and reason code are placeholders required by the declaration format; they do
  not claim a completed live evaluation.
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
- App version check passed in `develop` PR context; no app version bump applies to this shared
  frontend package change.
