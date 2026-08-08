---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-08
applies_to: deploy_operations
topic: sentry_triage_2026_08_08
---

# Sentry Triage — 2026-08-08

Follow-up pass over Sentry across all four `ch-temp` projects since the
[2026-08-04 triage](./SENTRY_TRIAGE_2026-08-04.md). Confirms which of that
pass's predicted mitigations landed, and investigates two new problems found
on the current prod release.

**Sentry org**: `ch-temp` (region `https://de.sentry.io`). Projects:
`dgfy-backend`, `dgfy-pos`, `dgfy-skupervisor`, `dgfy-store`.

Prod release timeline referenced below: `d1e7697a` (08-04) → `57990f8b`
(08-06) → `cc5e31ca` (08-07, current at triage time).

## What the 2026-08-04 triage predicted, now confirmed

| Issue | Fix | Confirmed |
|---|---|---|
| `DGFY-POS-B` — `String(...).replaceAll is not a function`, crashed the incoming-orders panel on iMin WebView | `29de8a0c` (PR #236) | In prod from `57990f8b`; zero events since 2026-08-05. [GitHub #271](https://github.com/Sieitzz/dgfy-platform/issues/271) closed. |
| `DGFY-POS-2` — device-status 503, loudest issue in the project (22 events) | PR #220 (`7f0f6819`) | In prod from `57990f8b`; zero events on `57990f8b`/`cc5e31ca`. |
| `DGFY-STORE-9`…`K` (11 issues) — one user's `/map-dgfy/account` session | PR #228 (`970fec19`, dashboard-poll fanout-noise fix) | In prod from `57990f8b`; no recurrence. |
| `DGFY-STORE-7` — `removeChild` white-screen | storefront `ErrorBoundary` | No recurrence. |

## New: `GET /api/v1/store/locations` 500ing in production

`DGFY-STORE-X` (PROD `cc5e31ca`) plus a trail of network-level failures on
the same endpoint (`DGFY-STORE-T`, `-S`, `-R`, `-M`, `-3`, `-5`, `-6`, `-8`).

**Root cause**: `useDiscoveryStoreLoader.js` fanned out one
`GET /api/v1/store/locations` request per store in an unbounded
`Promise.all` — up to 100 simultaneous requests per discovery page load,
each resolving a different tenant database against `TenantConnector`'s
fixed-size (default 20) connection cache. This is the same signature as the
[2026-07-27 connection-exhaustion incident](./STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md),
now reproducing on `dgfy.ph`.

**Fix**: [PR #300](https://github.com/Sieitzz/dgfy-platform/pull/300)
(`fix/storefront-locations-fanout`, closes
[#297](https://github.com/Sieitzz/dgfy-platform/issues/297)). The discovery
response already carries every branch for every store via
`active_location_snapshot`; the fan-out is replaced with a synchronous
derivation from the stores already in hand. Up to 100 requests per page
load → 0. Also added a rate limiter to the route (it had none).

## New: backend 500s were invisible in Sentry

The `dgfy-backend` project had 1 issue in 30 days despite the prod 500
above. Two independent defects, both fixed:

1. `sentryErrorHandler`'s `shouldHandleError` fell back to `res.statusCode`,
   but runs *before* `errorHandler` sets it — silently dropping any generic
   500 without an explicit `.statusCode`.
2. `sendUseCaseResult` — the response seam for 265+ `return fail(...)` use
   cases — answers failures directly without ever throwing into Express's
   error pipeline, so neither Sentry handler ever ran for them.

**Fix**: [PR #301](https://github.com/Sieitzz/dgfy-platform/pull/301)
(`fix/backend-sentry-500-visibility`, closes
[#298](https://github.com/Sieitzz/dgfy-platform/issues/298)).

**Not fixed in code** (ops actions, needed on the prod host):
- `SENTRY_ENVIRONMENT` is unset in deploy config — events currently file
  under the literal environment `"unknown"`.
- Confirm `SENTRY_ENABLED=true` and a DSN are actually configured on the
  prod host. `deploy-backend.yml` has no `SENTRY_*` references at all,
  unlike `deploy-frontend.yml` — nothing in CI validates this.

## Hygiene: resolved in this pass

All confirmed-dead noise, deploy-window 502/503s, or single-event
`request_failure_class: transient` connectivity blips with no recurrence:
`DGFY-POS-3`, `-5`, `-6`, `-7`, `-8`, `DGFY-STORE-2`, `-4`, `-M`, `-N`,
`-P`, `-Q`, `-R`, `-S`.

Left open, re-check after the next deploy rather than acting now:
`DGFY-POS-C`/`-D`/`-E` (11 events, `/pos/incoming-orders`, **DEV only**) —
consistent with dev backend restarts, not a distinct root cause.

## Re-verification query

Run after PR #300 and #301 both merge and deploy to prod:

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

Pass conditions:
- Zero new `DGFY-STORE-X` events (500 on `/api/v1/store/locations`) on the
  release containing PR #300.
- `DGFY-STORE-T` and the `Failed to fetch`/`Load failed` family on
  `/api/v1/store/locations` absent or sharply reduced against their rate on
  `cc5e31ca`.
- Any *new* backend fault appears in `dgfy-backend`, not only in
  `dgfy-store` — that is the signal PR #301 worked. Force-test this once
  live: a request that reliably fails server-side (e.g. an invalid
  `x-store-slug`) should now produce a `dgfy-backend` event with a real
  stack, correlatable to its browser-side twin via `failed_request.request_id`.
