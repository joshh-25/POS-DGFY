---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-15
applies_to: deploy_operations
topic: sentry_triage_2026_08_15
---

# Sentry Triage — 2026-08-15

**First live run of the Observer role (#368/#442).** Report-only per this role's own calibration
policy — every finding below is proposed, not filed. No `gh issue create` calls were made producing
this pass; it exists to validate the noise policy against real data before Observer is trusted to
file autonomously.

Follow-up pass over Sentry org `ch-temp`, all four projects, since the
[2026-08-08 triage](./SENTRY_TRIAGE_2026-08-08.md).

## Query

```
mcp__claude_ai_Sentry__search_events(
  organizationSlug: "ch-temp", regionUrl: "https://de.sentry.io",
  dataset: "errors", query: "event.type:error",
  fields: ["issue","environment","release","error.handled","count()"],
  sort: "-count()", period: "7d", limit: 60
)
```

Org: `ch-temp` | Period: 7d | Newest release seen: PROD `cd036315` (2026-08-14, PR #426 merge),
DEV `37929929` (2026-08-14, PR #421). 36 aggregate rows returned, spanning 21 distinct issues.

## Per-issue verdict

| Issue | Env | Events (7d) | `handled` | Bucket | Action |
|---|---|---|---|---|---|
| `DGFY-POS-C` — `AxiosError: timeout of 20000ms exceeded` | DEV+PROD | 22 | yes | dedupe candidate | **already tracked — #474** |
| `DGFY-POS-D` — `AxiosError: Network Error` | DEV | 5 | yes | dedupe candidate | **already tracked — #474** |
| `DGFY-POS-3` — `AxiosError: 502` | DEV | 4 | yes | dedupe candidate | **already tracked — #474** |
| `DGFY-POS-R` — `AxiosError: 503` | DEV | 2 | yes | dedupe candidate | **already tracked — #474** |
| `DGFY-BACKEND-4` — `ConnectionManager.getConnection called after close` | PROD | 1 | yes | dedupe candidate, below floor either way | **already tracked — #474** |
| `DGFY-STORE-T` — `TypeError: Failed to fetch (dgfy.ph)` on `/tenant-store/.../track` | DEV+PROD | 12 | yes | genuine defect, floor clears | **flagged, would file (not filed — report-only)** |
| `DGFY-STORE-Y` — `TypeError: Failed to fetch (dev.dgfy.ph)` on `/tenant-store/.../order` | DEV | 2 | yes | same root cause as `DGFY-STORE-T` (same culprit shape) | **grouped into the `DGFY-STORE-T` candidate, not a second finding** |
| `DGFY-BACKEND-3` — `DomainError: No cash drawer is configured for this terminal` | DEV | 3 | yes | floor clears, but plausibly correct validation behavior, not a defect | **flagged, would file — lower confidence, needs a human call on intent vs. bug** |
| `DGFY-BACKEND-2` — `Error: Service unavailable` (Redis unavailable → auth fail-closed) | DEV | 3 | **no** | already resolved in Sentry, single burst 2026-08-10, no recurrence in 5 days | none — already closed |
| `DGFY-POS-K/N/Q/G/F/J/H/M/P` (9 issues, 1–2 events each) | DEV | ≤2 each | yes | below floor; all from release `598c8952` (2026-08-10), none recurring in the newest DEV release (`37929929`, 2026-08-14) | none this run — candidates for direct Sentry resolve next pass if still quiet |

**Filed this run:** none (report-only first run, per Observer's calibration policy)
**Would file if not report-only (cap: 3):** `DGFY-STORE-T`+`DGFY-STORE-Y` (one issue, grouped), `DGFY-BACKEND-3` (lower confidence) — 2 of 3 available slots, cap not reached
**Resolved in Sentry this run:** none (report-only — `DGFY-BACKEND-2` was already resolved by a prior action, not by this run)

## Notable finding: dedupe against the backlog worked

Five of six high-count issues (`DGFY-POS-C/D/3/R`, `DGFY-BACKEND-4`) are **already filed** as #474
("POS production timeouts against the backend"), evidently from a very similar prior sweep — same
issue IDs, same event counts within a small margin. Without the backlog-dedupe step, this run would
have proposed five duplicates of an issue that already exists. This is the exact scenario the noise
policy's dedupe rule was written to prevent.

## Re-verification query for next run

Same query as above, `period: "7d"`, run again after `DGFY-STORE-T`/`DGFY-STORE-Y` is either filed or
explicitly deferred. **Pass condition:** `DGFY-BACKEND-2` still shows 0 new events (confirms the
Redis fail-closed path hasn't recurred); the 9 low-volume DEV `POS-*` issues from release `598c8952`
show no new events on any release newer than `37929929` (confirms they're stale, safe to resolve
directly in Sentry on the next pass).

---

## Second pass — 2026-08-15 (evening)

**Filing is now live.** Pat reviewed the first pass above and approved auto-filing; the two
candidates below were filed via `gh issue create`, per the noise policy's cap of 3/run.

Same query shape, org `ch-temp`, all four projects, `period: 7d`. Result: **8 unresolved issues,
40 resolved.**

### Correction to the first pass

The morning run's verdict on `DGFY-STORE-T`/`-Y` (line 43-44 above, "genuine defect, floor
clears") does not hold up against the actual event detail. Pulling the full event
(`get_sentry_resource`) shows: `handled: yes`, `level: warning`, `request_failure_class:
transient`, 2 real PH mobile users, stack trace terminating in
`useCustomerDashboardLiveSync.js:25` → `requestJson.js:151` (`fetch` itself throwing, i.e. a
network-layer failure, not an application bug). The event volume (21 over 9 days, 2 users) is
exactly what `captureRequestFailure`'s network-fingerprint collapse + 60s cooldown + 20-event
session cap (`sentryClient.js:559-619`, added by PR #228) is designed to let through — this is the
noise filter working, not a leak. **Reclassified: structural noise, not a defect.** The underlying
poll cadence generating the requests is still worth fixing (filed as #509 below), but as a
should-fix on load/battery grounds, not as an error-count defect.

### Confirmed resolved / addressed, no action

| Issue | Fix | Status |
|---|---|---|
| `DGFY-STORE-X` (500 on `/api/v1/store/locations`) | PR #300 | Resolved, silent 6d |
| `DGFY-STORE-9`…`K` (11 issues, `/map-dgfy/account` fan-out) | PR #228 | All resolved, no recurrence |
| `DGFY-POS-2`, `-4`, `-B`, `-A`, `-9`, `-E` | PRs #220/#236 | Resolved, quiet 9-10d |
| `DGFY-POS-F/G/H/J/K/M/N/P/Q` (9 issues, release `598c8952`) | — | Resolved in Sentry since the morning pass; re-verification condition held (zero events on any release newer than `37929929`) |
| `DGFY-BACKEND-2` (Redis fail-closed) | — | Resolved, single 2026-08-10 burst, no recurrence in 5 days |

`dgfy-backend`'s visibility fix (PR #301) is confirmed working end-to-end: the project now
surfaces real Node stack traces with `request_id` correlation (`DGFY-BACKEND-3`, `-4`) where before
it had one issue in 30 days.

### Merged to `develop`, not yet in production

`origin/develop` is 19 commits ahead of `origin/main`; prod is still on `cd036315` (2026-08-14, PR
#426). **Correction to an earlier draft of this section:** PR #444 / `084358fb` (nginx IPv6
resolver fix, #472/#431) is confirmed **not** an ancestor of `cd036315` — but it is **not** scoped
to `/openfreemap`/`/ingest` only. `git show 084358fb` edits the single top-level `resolver
127.0.0.11 valid=10s ipv6=off;` directive in `infrastructure/docker/nginx/nginx.conf.template`,
which is shared by every `location /api` block — including the internal `dgfy-api`/frontend
upstreams, per the commit's own message. #474 (below) already names PR #444 as one of exactly two
nginx-adjacent candidates for the POS 502/503s. **PR #444 is an unconfirmed candidate fix for #474,
not ruled out** — promoting `develop` may help; this has not yet been tested against the live
incident.

### Still open

| Issue | Detail | Verdict |
|---|---|---|
| `DGFY-POS-C` (30 ev/2 users), `-D` (7), `-3` (6), `-R` (2), `DGFY-BACKEND-4` (1) | 20s timeouts, network errors, 502/503 | Already tracked — **#474**, open, no *confirmed* fix merged against it — but PR #444 (on `develop`, not yet promoted) is an unconfirmed candidate, see above. `DGFY-POS-C` last fired 9h ago and now also appears on the *current* prod release `cd036315` — live, not historical. Space Bar go-live is 2026-08-17; flagging as unaddressed with the deadline approaching, and promoting `develop` as a possible mitigation worth testing. |
| `DGFY-BACKEND-3` (3 ev, DEV) | `DomainError: No cash drawer is configured for this terminal`, `POST /api/v1/pos/device/open-drawer` | Genuine instrumentation defect. **Filed — [#508](https://github.com/Sieitzz/dgfy-platform/issues/508).** `clientManagedDeviceDriver.js:53` throws a 503 for a config-state condition; `shouldReportErrorToSentry` (`sentry.js:335-336`) captures any `statusCode >= 500`, so an expected precondition failure floods the error channel PR #301 just made work. |
| `DGFY-STORE-T` (21 ev/2 users), `-Y` (2) | `Failed to fetch` on `/api/v1/dgfy/customer/addresses` | Structural noise, not a defect (see correction above). Underlying 3s poll cadence should-fix. **Filed — [#509](https://github.com/Sieitzz/dgfy-platform/issues/509).** `useCustomerDashboardLiveSync.js:21` polls an 11-request fan-out every 3s during an active order despite the same hook already holding a live SSE channel (`EventSource` on `/api/v1/dgfy/customer/events`). |

**Filed this run:** #508 (priority: High), #509 (priority: Medium) — 2 of 3 available slots, cap
not reached.
**Resolved in Sentry this run:** none — everything resolvable was already resolved between the
morning and evening passes; no new direct-resolve actions taken.

### Doc hygiene

`docs/ops/STOREFRONT_TRACKING_POLL_RATE_LIMIT_INVESTIGATION.md` named
`useFnbTrackingRuntime.js`'s 2s/12s poll as its leading suspect for a 2026-07-23 rate-limit
incident. That poll is confirmed fixed (now 60s/120s), and the doc's open question #3
(`generalLimiter`'s health-check skip bug) is confirmed a non-issue in the current tree —
`/health` is mounted outside `generalLimiter` entirely, so the dead path check never mattered.
Refreshed separately to point at `useCustomerDashboardLiveSync.js` (#509 above) as the live
suspect.

### Flagged, not fixed this run (outside Observer's scope)

- **#474 is live and unaddressed with Space Bar on Aug 17.** No open PRs, nothing merged touching
  it. A scheduling call for a human, not something this triage resolves — but it should not be a
  surprise on Aug 16.
- **Release stamping looks unreliable.** DEV events in the 7d window carry release SHAs from
  five different days (Aug 5/10/11/12/13) while DEV head is `37929929` (Aug 14).
  `VITE_SENTRY_RELEASE` is set only in `deploy-frontend.yml`; the CI consolidation (#421/#424/#430)
  moved deploys to `deploy.yml`, which sets neither `VITE_SENTRY_RELEASE` nor `VITE_BUILD_STAMP`.
  Whether this means stale cached bundles on POS devices, or newer deploys stamping a stale
  release, is unconfirmed either way — and it directly affects whether "does the fix predate this
  release" (Observer's own step 1) can be answered reliably. Worth a short dedicated check before
  the next pass.

### Re-verification query for the next pass

Same `search_events` shape as above, `period: "7d"`. **Pass conditions:** (a) `DGFY-BACKEND-3`
shows zero new events on any release containing #508's fix; (b) `DGFY-STORE-T`'s event rate drops
materially once #509 lands, without the `network` fingerprint re-splitting into per-endpoint
issues; (c) if #474 is still open, `DGFY-POS-C` should still be the loudest issue in the org — note
that plainly rather than re-triaging it from scratch.
