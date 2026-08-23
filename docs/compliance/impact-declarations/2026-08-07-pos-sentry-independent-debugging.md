---
status: reference
owner: engineering
last_reviewed: 2026-08-07
declaration_id: 2026-08-07-pos-sentry-independent-debugging
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: posTerminalReadiness usecase tests,api.posDiagnostics unit tests,sentryClient unit tests,frontend production build,POS production build,backend test suite
rollback_note: Revert the posUseCases occupancy log line, the api.js outcome ring buffer and POS request headers, the TerminalPage online-indicator source change, the sentryClient test-hook regating, the tracked dev.dgfy.ph.conf vhost copy, their tests, and this declaration together. No database schema, migration, receipt output, fiscal classification, payment path, or authorization rule is touched. The nginx vhost file is inert in the deploy pipeline and requires no rollback action on any host.
preflight_result: PENDING_PREFLIGHT
preflight_reason_code: PENDING_PREFLIGHT
preflight_run_at: PENDING_PREFLIGHT
preflight_request_ref: PENDING_PREFLIGHT
---

# POS Sentry-Independent Debugging Channels

Covers PR #288 (`fix(pos): root-cause the iMin "unreachable backend" report + add Sentry-independent debugging`), refs #283.

> **This declaration is not yet reconciled.** The four `preflight_*` front-matter
> fields are placeholders and will fail `npm run check:compliance` by design, so
> nothing carrying this file can merge until a real
> `POST /api/v1/compliance/preflight` has been run and its response recorded. See
> **Preflight Reconciliation** below for the exact request.

## Compliance Impact Classification

Major. The floor is set by two independent rules in
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`:
`backend/src/modules/pos/**` and `frontend/src/features/pos/**`, both (`pos`, `terminal`, `major`).
Matched by `backend/src/modules/pos/usecases/posUseCases.js` and
`frontend/src/features/pos/pages/TerminalPage.jsx`.

The change adds observability channels that do not depend on Sentry, plus the root-cause finding
that motivated them. It reads and reports state; it does not alter any decision. No shift, terminal,
payment, or document outcome changes as a result of this diff.

Note for the record: PR #288's commit message describes the declaration as covering
`frontend/src/services/api.js` as well. That path is **not** compliance-sensitive under the current
rule set — only `paymentService.js`, `complianceService.js`, and `adminService.js` are listed under
`frontend/src/services/`. It is described below anyway because it carries the new request headers,
but it does not contribute to the classification floor.

## Affected Surfaces

1. **`pos`, `terminal` — backend occupancy visibility.**
   `buildGetCurrentTerminalShiftUseCase` now emits one `[POS][TerminalOccupancy]` log line whenever
   it returns `occupied_by_other`, carrying terminal, location, requesting user, occupying shift id
   and user, and how long the occupying shift has been open. This is a log statement on an existing
   return path; the returned value and the caller's behavior are unchanged. A blocked Open Shift —
   and a stale month-old shift specifically — becomes visible in `docker compose logs backend` with
   zero client instrumentation.
2. **`pos`, `terminal` — online indicator source.** The Online/Offline indicator now factors in the
   last real API outcome from the ring buffer below, rather than `navigator.onLine` alone.
   `navigator.onLine` is true on Android whenever any network interface exists, even one that cannot
   reach the POS host, which is exactly how the indicator stayed green throughout the #283 incident
   while nothing worked. **Only the display prop passed to `TerminalPageLayout` changed** — every
   existing internal `if (!isOnline)` behavioral gate elsewhere in the file is deliberately
   untouched, so no operation becomes newly permitted or newly blocked.
3. **Non-sensitive — API outcome ring buffer.** `frontend/src/services/api.js` keeps an in-memory
   buffer of roughly the last ten API outcomes, successes and failures alike, filled from axios's
   own request/response lifecycle. It is POS-surface only, never persisted, and lost on reload.
   `onApiOutcome()` lets a component subscribe. Because it sits on the axios lifecycle rather than
   on Sentry, it survives the three cases Sentry cannot see: an offline device, a local throw
   upstream of axios, and a WebView where Sentry's transport is blocked.
4. **Non-sensitive — POS request headers.** `X-POS-Terminal-Id` is attached on POS-surface requests,
   and `X-POS-Error-Ref` while a `reportTerminalFailure` ref is active, so an operator can read a
   reference code off the terminal and the request can be located in the access log by that code.
5. **Non-sensitive — Sentry test hook regating.** `window.__sentryTestError()` was gated on
   `import.meta.env.DEV`, a Vite build-mode flag that is false for every `vite build` — including
   the DEV, STAGING and BETA deploys — so the helper never existed anywhere except a local dev
   server. It is now gated on the resolved Sentry *environment* and blocked only for PROD, so
   delivery can be proven from a real deployed device over `chrome://inspect`. See
   **Compliance Preconditions** item 5 for the exposure this creates.
6. **Non-sensitive — tracked dev vhost.** `infrastructure/nginx-host/dev.dgfy.ph.conf` adds a
   tracked copy of dev.dgfy.ph's host nginx vhost, which previously existed only on the host (the
   same configuration drift flagged for `stage.dgfy.ph.conf` on 2026-07-28). It adds a log format
   carrying the two headers above. **It is not applied to any host and nothing in the deploy
   pipeline reads it.**

## Compliance Preconditions

1. No authorization, shift, terminal, payment, or document-classification decision changes. Every
   change is a read, a log, a header, or a display value.
2. The occupancy log line must not emit payment data, credentials, or tokens. It carries terminal
   and shift identifiers, user identifiers, and a duration.
3. The ring buffer is in-memory and POS-surface only. It must not be persisted, transmitted to a
   third party, or survive a page reload, and it must not capture request or response bodies.
4. `X-POS-Terminal-Id` and `X-POS-Error-Ref` are correlation tokens only, carrying no tenant,
   payment, or personally identifying data.
5. `window.__sentryTestError()` becomes reachable on every non-PROD deployed environment, which
   now includes STAGING and BETA where it previously was not. It only triggers a synthetic Sentry
   event and touches no tenant data, but **`build-main.yml` deploys both `beta.dgfy.ph` and
   `dgfy.ph` from `main`** — so the resolved Sentry environment for beta must be confirmed not to
   be PROD-equivalent, and the exposure accepted, before this promotes to production.
6. The tracked nginx vhost must not be treated as applied configuration. Until it is copied to the
   host and nginx reloaded, the header-based log correlation it enables does not work; there is no
   tracked stage or production equivalent at all.
7. No new backend API shape, database field, migration, reason code, or architecture exception is
   introduced.

## Verification Evidence

Required validation:

1. `npm --prefix backend test -- posTerminalReadiness.usecase.test.js`
2. `npm --prefix frontend test -- --run src/services/__tests__/api.posDiagnostics.test.js src/observability/__tests__/sentryClient.test.js`
3. `npm --prefix frontend run build`
4. `npm --prefix frontend run build:pos`
5. `npm run check:compliance`
6. `npm run lint:docs`

Recorded on PR #288 and its CI run:

- `backend-build-check` and `frontend-build-check` both passed on PR #289 (the promotion carrying
  this change), runs under GitHub Actions 31160666850.
- `Build Images (develop)` run 31159366803 succeeded for `12b6713f`.
- `Build Images (staging)` run 31160892553 succeeded for `ed8bff8e`.

Root-cause evidence, captured live on the dev host and written up in
`docs/ops/POS_SENTRY_INDEPENDENT_DEBUG_RUNBOOK.md`:

- All four dev services reported healthy; TLS and nginx routing correct.
- The iMin's Open Shift request sequence in the nginx access log terminates at the
  terminal-occupancy check with **every request returning 200** — `shifts/open` never appears.
- COUNTER-01's shift 1 has been open since 2026-07-07, so the occupancy probe correctly returned
  `occupied_by_other`. Nothing was unreachable.

## Preflight Reconciliation

Not yet run, same blocker as `2026-08-07-pos-terminal-failure-diagnostics`:
`POST /api/v1/compliance/preflight` requires an authenticated session with `SYSTEM.EDIT_SETTINGS`
(`backend/src/routes/compliance.js:57`).

Run against the dev tenant and record `result`, `reason_code`, the run timestamp, and
`policy_version` from the response into the front matter above, replacing every `PENDING_PREFLIGHT`
placeholder. Expected outcome is `no_breach` / `ALLOWED`.

```bash
curl -sS -X POST https://<dev-host>/api/v1/compliance/preflight \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${DGFY_DEV_TOKEN}" \
  -d '{
    "request_name": "PR #288 POS Sentry-independent debugging channels",
    "surfaces": ["pos", "terminal"],
    "impact_declaration": {
      "declaration_id": "2026-08-07-pos-sentry-independent-debugging",
      "classification": "major",
      "summary": "Add observability channels independent of Sentry for the POS terminal surface: a backend occupancy log line on the existing occupied_by_other return path, an in-memory API outcome ring buffer, POS correlation request headers, an online indicator sourced from real API outcomes, and a tracked dev nginx vhost. Read/log/display only; no decision path changes.",
      "affected_surfaces": ["pos", "terminal"],
      "reason_codes_impacted": ["ALLOWED"],
      "policy_version": "2026.08.07",
      "verification_evidence": [
        "posTerminalReadiness usecase tests",
        "api.posDiagnostics unit tests",
        "sentryClient unit tests",
        "frontend production build",
        "POS production build",
        "backend test suite"
      ],
      "rollback_note": "Revert the occupancy log line, the api.js ring buffer and POS headers, the online-indicator source change, the sentryClient test-hook regating, the tracked dev vhost, their tests, and this declaration together. No schema, migration, or host action required."
    }
  }'
```

If the response is `breach` or `review_required`, do **not** fill in `no_breach` — record the actual
result and reason code and treat the change as blocked pending review, per
`docs/compliance/request-time-preflight-protocol.md`.

## Deployment And Rollback

Deploy the occupancy log line, the ring buffer and headers, the online-indicator source change, the
Sentry test-hook regating, the tracked vhost, their tests, and this declaration together. Roll the
same set back together. No database migration, backend data cleanup, or host action is required for
either direction — the nginx vhost is an inert tracked file until someone applies it deliberately.

Two follow-ups this declaration does not resolve, both recorded so they are not lost:

1. ~~The `__sentryTestError` exposure on `beta.dgfy.ph` (precondition 5) needs an explicit accept
   before the `staging -> main` promotion merges.~~ **Resolved 2026-08-23 (#329/#894/#896/#895):**
   `beta.dgfy.ph` was retired — nginx now redirects every `*.beta.dgfy.ph` request straight to its
   `*.dgfy.ph` equivalent, and `deploy-main.yml` no longer builds or deploys a `frontend-beta`
   image at all. There is no longer a `beta.dgfy.ph`-served surface for `window.__sentryTestError()`
   to be reachable on, so the exposure this precondition warned about no longer exists — not
   because the accept was ever explicitly given, but because the surface it applied to is gone.
2. Stage and production nginx vhosts still have no tracked copy, so the header-correlation workflow
   in the runbook is dev-only in practice.
