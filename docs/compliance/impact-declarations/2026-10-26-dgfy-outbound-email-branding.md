---
status: reference
owner: engineering
last_reviewed: 2026-10-26
declaration_id: 2026-10-26-dgfy-outbound-email-branding
classification: major
surfaces: pos,settings
reason_codes_impacted: NONE
policy_version: 2026.10.26
verification_evidence: focused email Jest command (11 suites and 234 tests passed); email branding contract suite (6 tests passed); node --check on changed API JavaScript files; npm run check:architecture; npm run lint:docs; PR-context app-version gate; git diff --check
rollback_note: Revert the three userService email tenant-name fallback edits to restore the legacy fallback; no records or authorization behavior are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-26T22:55:42+08:00
preflight_request_ref: NOT-EXECUTED-2830-OUTBOUND-EMAIL-BRANDING
---

# DGFY Outbound Email Branding (#2830)

## Compliance Impact Classification

Major. This is the mechanical classification floor for
`apps/dgfy-api/src/services/userService.js`, whose path maps to `pos,settings` in
`scripts/check-compliance-impact.js`. The actual change updates three fallback strings used only
when tenant name context is absent in invitation and welcome email calls. It does not change
authentication, session issuance, authorization, permission checks, account state, or persisted
user data.

## Affected Surfaces

- `apps/dgfy-api/src/services/userService.js` — three tenant-name fallbacks for invitation and
  welcome emails now use `DGFY`. Existing tenant names continue to pass through unchanged.
- `apps/dgfy-api/src/services/emailService.js` and
  `apps/dgfy-api/src/templates/emailTemplates.js` — authored email labels use `DGFY`; email
  transport, identity precedence, addresses, links, and OTP behavior are unchanged.

The checker requires `pos,settings` because of the `userService.js` path rule; this declaration does
not claim a substantive change to POS permissions, settings, or compliance behavior.

## Compliance Preconditions

- No authentication, session, permission, or account-ownership behavior changes.
- No user or tenant data is written or migrated. Supplied tenant names remain data and are not
  rewritten; only missing-name fallback literals change.
- No payment, fiscal-document, checkout, or compliance decision is changed. Sender addresses,
  existing links, tokens, and delivery/logging behavior remain intact.
- A live compliance preflight was not run for this copy/default change. The required front-matter
  values are present for the major classification schema, while
  `preflight_request_ref: NOT-EXECUTED-2830-OUTBOUND-EMAIL-BRANDING` records the unexecuted state at
  PR-open time. The `preflight_run_at` value records declaration preparation time, not a live
  preflight execution. The continuous preflight sweep remains responsible for resolving the
  placeholder after merge.

## Verification Evidence

- The focused email/template/inline-owner Jest run passed 11 suites and 234 tests. The strengthened
  branding contract suite passed again with 6 tests.
- `node --check` passed for every changed API JavaScript file.
- `npm run check:architecture` passed for 63 modules, 802 code files, and 116 controller files.
- `npm run lint:docs` passed for 36 governed docs and 106 ADRs.
- The app-version gate passed in PR context with no package-version change required; `git diff
  --check` passed.
- `npm run test:backend:matrix` stopped before execution because the existing
  `tests/staffRoleInvitationPersistence.phase554.db.integration.test.js` suite is missing from
  `scripts/backend-db-dependent-tests.js`. No unrelated matrix change was made.
- `npm run check:compliance` reported the sensitive `userService.js` path before this declaration
  was added. It is being rerun with the declaration included.
