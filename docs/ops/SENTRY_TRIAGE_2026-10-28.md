## Sentry Triage — 2026-10-28

Org: ch-temp | Period: 7d | Triggered by: Pat's six Sentry notification emails of 2026-10-28 (focus: those
five issues, not a full sweep) | Release range: `c41201dad`..`ef85ba0f6`

Current PROD release: `ef85ba0f6c78f7c5c8ceade04b7a8ab1f7869efe`, the `main` head: PR #2825 (the #2824
workflow-mode fallback hotfix), merged 2026-10-26 14:22 +08. Current STAGING release: `c41201dad`, PR #2878,
merged 2026-10-28 01:37 +08; it is not on `main`. POS-1P, POS-1Q and POS-1D carry the PROD release, so they are
confirmed against the current build. POS-10's regression is a STAGING event.

Method note: this pass had issue-level reads (`search_issues`) and the notification payloads only. The
triage subagent's toolset had no event-level read (`search_events`, `search_errors`, `get_sentry_resource`),
so any conclusion below that depends on event detail is marked unconfirmed.

| Issue | Env | Count | Bucket | Action |
|---|---|---|---|---|
| DGFY-POS-1Q (`replaceAll` in the maplibre worker) | PROD | 1 (7d), handled:no | genuine defect | filed #2919 |
| DGFY-BACKEND-Y (ConnectionManager closed, `GET /api/v1/pos/catalog`) | PROD | 2 (7d), handled:yes | genuine defect, below the handled:yes floor | filed #2920 (operator-approved exception, see below) |
| DGFY-POS-1D (AxiosError 500, regressed) | PROD | 1 (7d), 2 (90d) | likely the same incident as BACKEND-Y (unconfirmed: no event-level request-id match) | folded into #2920 |
| DGFY-POS-1P (COUNTER-01 in use by another cashier) | PROD | 1 (7d), handled:yes | known, open owners #1073 / #1074 | commented, not filed |
| DGFY-POS-10 (COUNTER-02 in use, regressed) | STAGING | 1 (7d), 4 (90d) | same as POS-1P | commented, not filed |

**Filed this run:** #2919, #2920 (cap: 3; 2 used)
**Resolved in Sentry:** none
**Commented, not filed (existing owners):** #1074, #1073

### DGFY-POS-1Q: worker realm gets no ES-compat shims (#2919)

The failing frame is `/assets/maplibre-gl-worker-B7LXXUkR.js:5:13761`, a Web Worker, on an iMin Chrome 80
WebView (`webview_chrome_major=80`, COUNTER-01, `view=settings_profile`). `packages/web-core/src/compat/chrome80Runtime.js`
(Layer 1) patches the main-thread realm only, and its header already names the service worker as an uncovered
context; module Workers are not mentioned. `packages/web-core/vite/esCompatGuardPlugin.js` (Layer 2) is scoped
by design to methods Layer 1 does *not* shim, so `replaceAll`, `.at`, `Object.hasOwn`, `findLast`,
`structuredClone` and `toSorted` are not on its denylist and a worker chunk using them passes the build. A
second gap is possible but unverified: Layer 2 only inspects `type === 'chunk'` entries, and Vite may emit the
`?worker&url` output as an asset.

`maplibre-gl` is declared `^6.11.2` in IMS, POS and Storefront. This is a latent gap that surfaced when a
map-bearing POS view was opened on the iMin, not a dependency regression. Swapping this one call would not
help: the worker very likely uses other shimmed methods too. The fix must cover the worker's global scope or
gate the map on legacy WebViews, and the issue says to check the maplibre-gl worker API before choosing; it
does not assume `setWorkerUrl`.

Dedupe: #2479 and #2094 are about the worker file failing to *load* (404 / MIME), a different defect. Related,
not duplicates: #1787 (maplibre 6.x migration, open), #666 / #680 (ES-compat guardrail, closed).

### DGFY-BACKEND-Y: idle cleanup can close a re-used tenant handle (#2920)

Hypothesis, **unproven**: two events and no event-level confirmation. Stack: `mapPosUseCaseError` <-
`posUseCases.js:9230` <- `listCatalog` (`posHandlers.js:854`), request
`ab431f1b-d76b-4515-bdae-fe24ef91ed32`, tenant `d9007376…`, 2026-10-28 09:39:24Z.

- Only `closeConnection` in `apps/dgfy-api/src/utils/TenantConnector.js` closes cached tenant handles. LRU
  eviction is implausible with this few tenants. Shutdown drains in-flight requests first (`server.close`,
  then `closeAll`, with a 10s watchdog).
- No `Build & Deploy Platform` run between 06:33Z and 09:39:24Z on 2026-10-28; the only one nearby (09:49:50Z,
  `epic/2634-delivery-workflow`) started 10 minutes after the event, so a deploy restart does not explain it.
- **Lead 1:** `cleanupIdleConnections` (lines 327-347) snapshots every tenant idle for over 10 minutes, then
  awaits `closeConnection` one at a time without re-checking `lastUsed` or `isBusy`. `closeConnection` waits
  out a handle that is busy at that instant, so the exposure is a tenant whose device woke after the snapshot,
  or one that is idle between two queries of the same request. It needs at least two idle tenants in the same
  60s tick, or a slow earlier close.
- **Lead 2:** the gap the code documents as the #526 residual (lines 251-262). #526 is `CLOSED / COMPLETED`;
  the "decision not to do it yet" wording lives in the code comment, so the gap has no open owner. This is a
  different failure from #2560's acquire timeout. #2623 is already live, so this is not an #2560 trigger and
  does not change that issue's verification-only posture.
- **Operator check (not done):** read-only PROD logs for `Periodic cleanup: closing N idle connections` near
  09:39Z would confirm or kill Lead 1 quickly. It is the first acceptance criterion of #2920. Observer did not
  touch PROD.

**Noise-policy note.** 2 events is under the `handled:yes` floor (3 per 7d), but this is a user-visible 500 on
a live merchant and Pat's standing preference is not to park live errors. Pat approved filing it as a one-off
exception on 2026-10-28. The floor itself is unchanged; this is not a threshold edit.

### DGFY-POS-1P and DGFY-POS-10: terminal lock (#1073 / #1074)

The message is a deliberate client-side guard: `handleOpenShift` throws it when
`terminalOccupancy.status === 'occupied_by_other'` (`terminalShiftEntryDecision.js:24`), and
`reportTerminalFailure` captures it at error level on purpose. #1073 (12-hour reclaim gap) and #1074 (no UI
recovery) are open, assigned, and still in Backlog.

`3c9dc3bba` (`fix(pos): guide duplicate shift recovery`, 2026-10-15, in PROD) covers the
`POS_OPERATOR_ACTIVE_ELSEWHERE` 409, where the *same* cashier has an open shift elsewhere and now gets a
"Resume Existing Shift" button. The "occupied by another cashier" branch is untouched and still a dead end,
which is exactly this message. The 2026-08-27 pass wrote on #1074 that this should fold into its scope if it
recurred; it has. POS-10's 2026-10-18 resolve did not hold, so POS-10 and POS-1P are left **unresolved**, with
#1074 as the named owner. Whether to downgrade the expected `blocked` capture from error level was raised on
#1074 as a question, not decided here.

## Outside the focus, not triaged

Issue-level status only; none of this was event-verified.

- **Regressions:** several issues resolved on 2026-10-18 are unresolved again: DGFY-POS-Z, DGFY-POS-11,
  DGFY-STORE-T, DGFY-BACKEND-N and DGFY-BACKEND-M. BACKEND-M was marked "fixed, unconfirmed" in the 10-18 pass
  and has recurred.
- **New unresolved issues since 10-18:** DGFY-BACKEND-X (32 events, highest count seen, environment
  unchecked), DGFY-BACKEND-W (environment unchecked), DGFY-BACKEND-C (neither PROD nor STAGING by
  elimination, probably DEV), DGFY-STORE-20, -21, -22, and others.
- **Next step:** a standard-scope sweep, starting with BACKEND-X and BACKEND-W to establish their
  environments.

## Open, not addressed this run

- Lead 1 for #2920 is unconfirmed until someone reads the PROD container logs around 2026-10-28T09:39Z.
- No Sentry issue was resolved, and no noise-policy threshold was changed.

**Re-verification query for next run:** `issue:DGFY-BACKEND-Y environment:PROD` and
`issue:DGFY-POS-1Q environment:PROD`, grouped by `release`. Pass condition: zero events on releases that
include the #2919 and #2920 fixes. For the terminal lock: `issue:DGFY-POS-1P environment:PROD` and
`issue:DGFY-POS-10`, expected to persist until #1074 ships.
