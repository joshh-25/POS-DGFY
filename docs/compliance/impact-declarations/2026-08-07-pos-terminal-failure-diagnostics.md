---
status: reference
owner: engineering
last_reviewed: 2026-08-07
declaration_id: 2026-08-07-pos-terminal-failure-diagnostics
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: terminalUnlockDiagnostics unit tests (14 passed),sentryClient unit tests (60 passed including 5 new),frontend production build,POS production build,frontend lint (0 errors)
rollback_note: Revert the terminalUnlockDiagnostics classifier change, the TerminalPage inline failure panel and its five catch-block call sites, the sentryClient captureTerminalFlowFailure addition, the ObservabilityIdentitySync user_id fix in both main.jsx copies, and this declaration together. No backend contract, database schema, receipt output, fiscal classification, payment path, or authorization rule is touched, so rollback is a pure frontend revert with no data or migration step.
preflight_result: PENDING_PREFLIGHT
preflight_reason_code: PENDING_PREFLIGHT
preflight_run_at: PENDING_PREFLIGHT
preflight_request_ref: PENDING_PREFLIGHT
---

# POS Terminal Unlock/Shift-Open Failure Diagnostics

Covers PR #284 (`fix(pos): stop mislabeling local unlock/shift failures as network outages`), closing #283.

> **This declaration is not yet reconciled.** The four `preflight_*` front-matter
> fields are placeholders and will fail `npm run check:compliance` by design, so
> nothing carrying this file can merge until a real
> `POST /api/v1/compliance/preflight` has been run and its response recorded. See
> **Preflight Reconciliation** below for the exact request.

## Compliance Impact Classification

Major. The floor is set by `frontend/src/features/pos/**` (`pos`, `terminal`, `major`) per
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`, matched by two files in this
change: `frontend/src/features/pos/pages/TerminalPage.jsx` and
`frontend/src/features/pos/utils/terminalUnlockDiagnostics.js`.

The change is diagnostic and presentational only. It alters which *message* a failed terminal
unlock or shift-open surfaces to the operator, and adds error reporting for failures that were
previously reported nowhere. It does not change whether an unlock or shift-open succeeds, who is
authorized to perform one, or any value that reaches a receipt, a transaction, or the fiscal
record.

The remaining changed files — `frontend/src/observability/sentryClient.js`, `frontend/src/main.jsx`
and `frontend/apps/pos/src/main.jsx` — are not compliance-sensitive paths under the rule set, and
are declared here for completeness rather than because they set the floor.

## Affected Surfaces

1. **`pos`, `terminal` — failure message resolution.** `resolveTerminalLoginErrorMessage` previously
   treated any error without an HTTP status as a network outage. Several locally-thrown errors in
   the unlock/shift-open handlers (terminal-already-in-use, `activateDgfyTenantSession`'s
   malformed-session check) also have no `.response`, so their real message was discarded and
   replaced with a generic "unable to reach the POS backend" string. Classification is now gated on
   the error actually looking like an axios transport failure (`ERR_NETWORK`, `ECONNABORTED`,
   `ETIMEDOUT`, or `.request` present without `.response`); everything else surfaces its own
   message. `classifyTerminalLoginFailure()` is the single shared classifier.
2. **`pos`, `terminal` — failure presentation.** Both Open Shift dialogs gain a persistent inline
   panel showing the message, the method/path/status, and a short reference code, wired into the
   five unlock/shift-open catch blocks via `reportTerminalFailure()`. This supplements rather than
   replaces the existing toast, which auto-dismisses faster than an iMin WebView can be read.
3. **Non-sensitive — error reporting.** `captureTerminalFlowFailure()` reports these local throws to
   Sentry tagged `pos_flow`/`pos_error_ref`/`pos_failure_kind`, sharing `captureRequestFailure`'s
   existing cooldown and per-session cap, and skipping a duplicate event when the axios interceptor
   already reported the same error. `setSentryContext`/`resetSentryIdentity` gain a `terminalId` →
   `pos_terminal_id` tag.
4. **Non-sensitive — observability identity.** `ObservabilityIdentitySync` checked `user?.id`, but
   `GET /users/me` returns `user_id` (`backend/src/services/userService.js`'s attribute list never
   selects `id`). That check was always false, so every Sentry and PostHog event from this surface
   reported zero identified users regardless of who was signed in. Corrected to
   `user?.user_id || user?.id` in both `main.jsx` copies. This is independent of the terminal-unlock
   flow and affects observability attribution across the whole surface.

## Compliance Preconditions

1. Terminal unlock and shift-open **authorization outcomes are unchanged**. No branch that decides
   whether a shift may open is modified — only the message emitted on the failing path.
2. No fiscal or transactional value is touched. Receipt content, totals, tax, document-type
   classification (`fiscal_invoice` / `non_fiscal_slip`), transaction persistence, and payment
   handling are all outside this diff.
3. The reference code shown to the operator is a correlation token only. It carries no tenant,
   user, payment, or personally identifying data, and is not persisted server-side by this change.
4. Surfacing a previously-suppressed error message must not leak backend internals beyond what the
   thrown `Error.message` already contained — the change forwards existing messages, it does not
   add new detail to them.
5. Sentry reporting stays within the existing cooldown and per-session event cap, so a terminal
   stuck in a failure loop cannot generate unbounded events.
6. No new backend API shape, database field, migration, reason code, or architecture exception is
   introduced.

## Verification Evidence

Required validation:

1. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js src/observability/__tests__/sentryClient.test.js`
2. `npm --prefix frontend run build`
3. `npm --prefix frontend run build:pos`
4. `npm --prefix frontend run lint`
5. `npm run check:compliance`
6. `npm run lint:docs`

Results recorded on PR #284:

- `terminalUnlockDiagnostics.test.js` — 14/14 passed (new file).
- `sentryClient.test.js` — 60/60 passed, including 5 new cases.
- Full frontend suite 1353/1413; the 60 failures were confirmed pre-existing on unmodified
  `develop` via `git stash` (adminService / TenantManager / storefront, unrelated config issue).
- `npm run build:pos` and root `npm run build` both succeeded.
- `npm run lint` — 0 errors, 6 pre-existing warnings unchanged.

Expected behavior:

- A locally-thrown unlock/shift-open error displays its own message, not the network string.
- A genuine transport failure still displays the network string.
- Both Open Shift dialogs show a persistent panel carrying a reference code.
- Sentry events from this surface report a non-zero identified user.

## Preflight Reconciliation

Not yet run. `POST /api/v1/compliance/preflight` requires an authenticated session with
`SYSTEM.EDIT_SETTINGS` (`backend/src/routes/compliance.js:57`), which was unavailable in the
environment where PR #284 was authored, and again when this declaration was written.

Run against the dev tenant and record `result`, `reason_code`, the run timestamp, and
`policy_version` from the response into the front matter above, replacing every `PENDING_PREFLIGHT`
placeholder. Expected outcome is `no_breach` / `ALLOWED`: the `pos`/`terminal` surfaces are touched
only in their diagnostic presentation, and no compliance-controlled operation is invoked.

```bash
curl -sS -X POST https://<dev-host>/api/v1/compliance/preflight \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${DGFY_DEV_TOKEN}" \
  -d '{
    "request_name": "PR #284 POS terminal unlock/shift-open failure diagnostics",
    "surfaces": ["pos", "terminal"],
    "impact_declaration": {
      "declaration_id": "2026-08-07-pos-terminal-failure-diagnostics",
      "classification": "major",
      "summary": "Stop classifying status-less local throws in the POS terminal unlock/shift-open handlers as network outages; surface their real message in a persistent inline panel and report them to Sentry. Diagnostic and presentational only.",
      "affected_surfaces": ["pos", "terminal"],
      "reason_codes_impacted": ["ALLOWED"],
      "policy_version": "2026.08.07",
      "verification_evidence": [
        "terminalUnlockDiagnostics unit tests (14 passed)",
        "sentryClient unit tests (60 passed including 5 new)",
        "frontend production build",
        "POS production build",
        "frontend lint (0 errors)"
      ],
      "rollback_note": "Revert the classifier change, the TerminalPage inline failure panel and its five catch-block call sites, the sentryClient captureTerminalFlowFailure addition, the ObservabilityIdentitySync user_id fix in both main.jsx copies, and this declaration together. Pure frontend revert, no data or migration step."
    }
  }'
```

If the response is `breach` or `review_required`, do **not** fill in `no_breach` — record the actual
result and reason code and treat the change as blocked pending review, per
`docs/compliance/request-time-preflight-protocol.md`.

## Deployment And Rollback

Deploy the classifier change, the inline failure panel, the Sentry reporting addition, the
observability identity fix, their tests, and this declaration together. Roll the same set back
together if terminal failure messaging regresses. No database migration, backend rollback, or
data cleanup is required. No APK rebuild is required — the iMin wrapper loads the web bundle
remotely (`WebPosActivity.kt`) rather than bundling it, so this ships via the normal frontend
deploy.
