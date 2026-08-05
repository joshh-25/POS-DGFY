# Sentry Triage — 2026-08-04

First full pass over Sentry across all four DGFY projects since instrumentation landed. Records
what each open issue actually is, whether it's already fixed and deployed, and the query to
re-run after the next production deploy to check whether it recurred.

**Sentry org**: `ch-temp` (region `https://de.sentry.io`). Projects: `dgfy-backend`, `dgfy-pos`,
`dgfy-skupervisor`, `dgfy-store`. A second, unrelated org (`patterueldev`) exists with legacy
`backend-jvm`/`ios-swift` projects — not in scope here.

## Release timeline (Sentry `release` tag → git)

Every event carries a `release` tag that is a real commit SHA, so releases can be mapped to git
history directly rather than inferred.

| Release SHA | Env | Committed | What |
|---|---|---|---|
| `0c9352c5` | STAGING | 2026-08-02 14:25 +08 | PR #157 |
| `8ff02e9d` | PROD | 2026-08-03 01:42 +08 | release/2026-08-03 (#172) |
| `c9e5b218` | STAGING | 2026-08-03 19:42 +08 | PR #208 |
| `7c1d5daf` | PROD | 2026-08-03 | release/2026-08-03 (#210) |
| `87e5ad80` / `3e65a5f9` / `f9992c93` | DEV | 2026-08-03 | develop builds |
| `01d751fb` | STAGING | 2026-08-04 19:12 +08 | PR #216 |
| `d1e7697a` | PROD | 2026-08-04 21:31 +08 | release/2026-08-04 (#219) |

As of this triage, **no Sentry event carries `d1e7697a`** — the newest event anywhere predates
that deploy by roughly two hours. Everything below is evidence from prior releases plus git
ancestry, not yet confirmed against the current prod build.

## Per-issue verdict

| Issue | What it is | Verdict |
|---|---|---|
| `DGFY-POS-2` | `AxiosError 503` on `GET /pos/device/status` — 14 events, loudest issue in the project, fires in PROD + STAGING + DEV | **Structural noise, fix pending merge of PR #220.** See "POS device-status noise" below. |
| `DGFY-POS-4`/`5`/`6`/`7`/`9`/`A` | `AxiosError: Network Error` on `/pos/incoming-orders`, `/pos/catalog`, `/items/folders` | Connectivity blips, not iMin-related. `POS-9` and `POS-A` share one `trace_id` (`b7e62284f77340a9ad37d7cc848b253e`) — one network blip produced two issues. No action. |
| `DGFY-POS-3`, `DGFY-POS-8` | `AxiosError 502/503`, PROD on `8ff02e9d` / `7c1d5daf` | Deploy-window gateway restarts. Expected, no action. |
| `DGFY-POS-1` | `TypeError: Importing a module script failed` — stale-tab chunk load after a deploy, STAGING on `0c9352c5` | **Fixed and deployed.** `116935a4` (`feat(pos): recover from chunk-load failures after a deploy`) postdates `0c9352c5` and is an ancestor of `d1e7697a`. Not recurred since 2026-08-02. Safe to resolve in Sentry. |
| `DGFY-STORE-3`/`5`/`6` | `TypeError: Failed to fetch` on `/api/v1/storefront/discovery` and other `requestJson` calls | Retry work (`a394591d`, `feat(storefront): retry transient discovery loads...`) is absent from `8ff02e9d` but present from `7c1d5daf` onward. Every PROD event is on `8ff02e9d`. Likely already mitigated — **re-verify against `d1e7697a`** using the query below. |
| `DGFY-STORE-2`, `DGFY-STORE-4` | `AxiosError 502/503`, PROD | Deploy-window. Expected, no action. |
| `DGFY-STORE-7` | `NotFoundError: Failed to execute 'removeChild' on 'Node'` — PROD, `handled: no`, `mechanism: auto.browser.global_handlers.onerror`, route `/tenant-store/casa-amara-af718a`, `business_mode: fnb`, `trace_id: dcb12d80d3fa4337b5eea9879c7fc887` | **The only genuine unhandled defect found in this pass.** Single event, fully minified `react-dom` commit-phase stack, no first-party frame. Storefront app root (`frontend/apps/store/src/main.jsx`) had no `ErrorBoundary` anywhere, which is why it reached Sentry via the global `onerror` handler instead of a component boundary — fixed alongside this triage (see below). Root cause not yet established; likely a third-party DOM mutation (e.g. browser translation extension) racing a React commit, the classic source of this exact error on a public customer-facing page. |
| `DGFY-BACKEND-1` | OpenAI `401 Incorrect API key` on `POST /api/v1/onboarding/items/bulk`, STAGING, 2026-07-29–30 | Already resolved in Sentry. Environment/key configuration, not application code. No action. |

## POS device-status noise (the "constant axios reports")

The suspicion that the noisy `AxiosError` reports trace back to an unreachable iMin device is
correct for the single loudest issue, `DGFY-POS-2`.

`backend/src/services/posDeviceBridgeService.js` (`mapBridgeFailure`) maps "local device bridge
at `http://127.0.0.1:5101` unreachable" to `DomainErrorCode.SERVICE_UNAVAILABLE` / HTTP 503. A
cloud-hosted backend has no bridge on loopback, so `GET /pos/device/status` **always** 503s there
— in PROD, STAGING, and DEV alike, regardless of whether an iMin terminal is even in play. The
product already treats this as an expected, benign state (`skipGlobalErrorToast: true` on the
call, and `terminalUnlockDiagnostics.js` explicitly classifies this 503 as a hardware-bridge
availability signal, not an auth failure) — but two things defeated that intent:

1. `frontend/src/services/api.js`'s transient-retry interceptor retried 502/503/504 twice before
   giving up, so every probe cost three doomed requests against an endpoint that can never
   succeed.
2. `captureRequestFailure` only filtered out `<500` responses, so the 503 — downgraded to
   `level: 'warning'` but still an event — reached Sentry every time.

**Initial fix attempt (2026-08-04, reverted the same day):** added a per-request
`skipRequestFailureCapture` opt-out at the axios interceptor seam (`frontend/src/services/api.js`,
also mirrored into the storefront's `requestJson.js`) and set it, along with the existing
`skipTransientRetry`, on `fetchPosDeviceStatus`. This was a frontend-only symptom suppression —
correct at the time, but superseded before it shipped once PR #220
(`claude/optional-imin-reliance-pos-bpofpq`) was found to fix the actual root cause instead (see
below), so the flags on `fetchPosDeviceStatus` were reverted. **The generic
`skipRequestFailureCapture` mechanism in `api.js`/`requestJson.js` was kept** — it's a reusable,
zero-cost per-request escape hatch for a genuinely-always-optional probe, this call site just
turns out not to need it once #220 ships.

**The actual fix is PR #220.** It replaces the single hardcoded LAN-bridge dependency with a
`posDeviceDriver` contract (`backend/src/modules/pos/integrations/`) resolved per deployment. The
default driver when no LAN bridge is configured (`clientManagedDeviceDriver`, and likewise
`disabledDeviceDriver` for `POS_DEVICE_DRIVER=none`) implements `getStatus()` to always return
`{ ok: true, ... }` — it never throws, so `GET /pos/device/status` stops 503ing for the normal
"no printer attached" case entirely. A 503 becomes possible **only** when
`DEVICE_BRIDGE_ENABLED=true` / `POS_DEVICE_DRIVER=lan_escpos_bridge` and that LAN bridge is
genuinely unreachable — at which point it's a rare, real, actionable hardware fault that a
terminal operator should see, not noise. That's exactly why the frontend-side suppression was
reverted rather than layered on top: post-#220, silently eating retry+report on this endpoint
would hide the one case that's still worth surfacing. See the PR-220 acknowledgment comment for
the full reasoning.

Independent of this: `origin/claude/optional-imin-reliance-pos-bpofpq` (PR #220) also reduces *how
often* the probe fires at all, by resolving a driver once per tab (`usePosHardware()`) instead of
polling on every mount/print/drawer action.

## Storefront ErrorBoundary gap

`frontend/apps/store/src/main.jsx` mounted the storefront tree with no `ErrorBoundary` anywhere,
despite `frontend/src/components/common/ErrorBoundary.jsx` already existing and being used
elsewhere (e.g. the POS app). Any render-phase throw on the storefront — such as `DGFY-STORE-7`
— white-screened a customer with no recovery and only reached Sentry via the global `onerror`
handler, with no component stack to help diagnose it. Fixed alongside this triage by wrapping the
storefront root in the existing `ErrorBoundary`.

## Re-verification query

Run after every deploy to check whether any of the above recurred on the new release:

```
mcp__claude_ai_Sentry__search_events(
  organizationSlug: "ch-temp",
  regionUrl: "https://de.sentry.io",
  dataset: "errors",
  query: "event.type:error",
  fields: ["issue", "environment", "release", "error.handled", "count()"],
  sort: "-count()",
  period: "7d",
  limit: 60
)
```

Pass conditions once a release contains the 2026-08-04 fixes (ErrorBoundary) and, separately,
once PR #220 merges:
- Zero new `DGFY-POS-2` events on the release containing PR #220 or later, under default
  (`DEVICE_BRIDGE_ENABLED` unset) config. A recurrence post-#220 is a genuine LAN-bridge outage on
  a terminal with hardware configured, not noise — investigate rather than suppress it.
- `DGFY-POS-1` remains absent.
- `DGFY-STORE-3`/`5`/`6` absent or sharply reduced relative to `8ff02e9d`.
- Any new `DGFY-STORE-7`-shaped event arrives `handled: yes` with a `react.componentStack`
  context (confirms the ErrorBoundary is catching it) rather than `handled: no`.

## Open follow-up

Root cause for `DGFY-STORE-7` was not established from the single available event. Do not ship a
speculative fix — the ErrorBoundary now in place will capture a component stack the next time it
recurs, which is the fastest path to an actual diagnosis.
