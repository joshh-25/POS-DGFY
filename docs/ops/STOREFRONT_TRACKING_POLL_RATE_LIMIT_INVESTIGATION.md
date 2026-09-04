---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-15
applies_to: storefront_frontend, backend_rate_limiting
topic: storefront_tracking_poll_rate_limit_investigation
---

# Storefront Tracking Poll / Rate-Limit Investigation

> **2026-08-15 update (Observer triage, `docs/ops/SENTRY_TRIAGE_2026-08-15.md`):** the leading
> suspect below (`useFnbTrackingRuntime.js`) is confirmed fixed — see "Leading suspect" section.
> Open question #3 (the `generalLimiter` health-check skip) is confirmed a non-issue in the current
> tree — see "Open questions" item 3. A stronger live suspect for the same request pattern,
> `useCustomerDashboardLiveSync.js`, has been identified and filed as
> [#509](https://github.com/Sieitzz/dgfy-platform/issues/509) — see item 4 below, now resolved
> into a filed issue rather than an open question.

## Ticket
1. Ticket ID: `OPS-RATELIMIT-001`
2. Title: Find and fix the source of runaway request volume hitting `store_tracking`, causing shared-IP rate-limit exhaustion.
3. Owner: Engineering (storefront frontend)
4. Priority: P2-techdebt (workaround in place; root cause unconfirmed)
5. Status: Open — investigation started, not resolved

## Symptom

While QA-testing the storefront on the `do-not-commit/local-test` Docker stack
(2026-07-23), the API started returning `429 Too Many Requests` on essentially
every route, including `/api/v1/health` itself.

## What was confirmed

1. `backend/src/middleware/rateLimiter.js`'s `generalLimiter` is mounted at
   `app.use('/api', generalLimiter)` and buckets requests by IP (see its
   `keyGenerator`). In the local-test stack, all browser traffic passes
   through the bundled nginx and arrives at the backend as a single
   docker-bridge IP — so every tab/session on that machine shares one bucket
   with production-sized limits.
2. The structured log (`do-not-commit/local-test/data/backend/logs/combined*.log`)
   showed the `general` bucket exhausted (`current: ~1290`, `limit: 1200`)
   and, more importantly, a **`store_tracking` scope 429 counter at 5,853**
   cumulative rejections — far beyond anything a manual click-through could
   generate. This is the actual smoking gun: something was calling a
   tracking-related endpoint repeatedly, continuously, long enough to rack up
   that count.
3. `req.path` inside `generalLimiter`'s `skip` callback is mount-relative
   (e.g. `/v1/health`, not `/api/v1/health`), so its existing
   `if (req.path === '/health') return true;` check never actually skips the
   health endpoint. This is a latent bug independent of the traffic-volume
   question — health checks can get caught in the same bucket as everything
   else once it's exhausted. **Not fixed yet** (see Open Questions).

## Leading suspect — confirmed fixed (2026-08-15)

`apps/dgfy-web/apps/store/src/modes/fnb/tracking/hooks/useFnbTrackingRuntime.js`
(path corrected from the `frontend/apps/store/...` reference below, which
predates the `apps/dgfy-web` monorepo restructure) no longer runs the
2s/8s/12s/30s interval pattern this section originally flagged. The file now
defines a single `BACKGROUND_PIN_POLL_MS = { visible: 60000, hidden: 120000 }`
— a 60s/120s cadence, not the 2s/12s one below. Whatever fixed it landed
outside this investigation's own workaround (which only touched local-test
rate-limit env vars); no corresponding commit/PR reference was recovered
during the 2026-08-15 Observer pass, so treat "when/why" as unresolved even
though "is it fixed" is confirmed by reading the current source.

The original finding is kept below for historical record — it no longer
reflects the current file.

<details>
<summary>Original 2026-07-23 finding (superseded)</summary>

`frontend/apps/store/src/modes/fnb/tracking/hooks/useFnbTrackingRuntime.js`,
lines ~106-107:

```js
const selectedTimer = selectedPin ? window.setInterval(() => void refresh(selectedPin, true), document.hidden ? 8000 : 2000) : null;
const backgroundTimer = backgroundPins.length ? window.setInterval(() => backgroundPins.forEach((pin) => { void refresh(pin, false); }), document.hidden ? 30000 : 12000) : null;
```

While the order-tracking drawer/tab is open (`checkoutTab === 'track' &&
isFnbOrderSubpage`), this polled the selected pin every **2 seconds**
(8s if the tab is backgrounded) and every background-tracked pin every 12s
(30s backgrounded) — indefinitely, with no upper bound on how long a tab can
sit open on this view.

The `refresh()` function's catch block (lines ~100-102) only set
`trackingError` for the "selected" pin case and otherwise swallowed the
error — no backoff, no circuit breaker, no handling of 429 /
`Retry-After` at all. This was a plausible root cause, not a confirmed one —
it was never proven that this specific poller (rather than something else)
generated the observed volume.

</details>

## Workaround shipped (2026-07-23)

`do-not-commit/local-test/docker-compose.yml` — raised
`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_STORE_TRACKING_MAX_REQUESTS`,
`RATE_LIMIT_STORE_TRACKING_READ_MAX_REQUESTS`, and
`RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS` via environment overrides,
local-test only. **This does not fix anything** — it just gives the local
dev stack enough headroom that the underlying issue (if it recurs) takes
much longer to exhaust the bucket. No backend source or production
configuration was changed.

## Open questions / next steps

1. **Confirm the actual source.** Reproduce deliberately: open the F&B order
   tracking drawer, leave the tab open and foregrounded for several minutes,
   and watch `docker compose logs backend | grep store_tracking` (or the
   structured `combined*.log`) to see whether the 2s poll interval alone
   accounts for the volume, independent of any other traffic.
2. **If confirmed**, `useFnbTrackingRuntime.js`'s polling loop needs actual
   backoff: at minimum, stop/slow polling after a 429 (respect
   `Retry-After` from the response body — `rateLimiter.js` already returns
   `retryAfterSeconds` and sets the `Retry-After` header), and consider
   whether a 2-second interval is necessary at all for order tracking versus
   something like 10-15s.
3. ~~**Separately**, the `generalLimiter` health-check skip bug...~~ **Confirmed a non-issue,
   2026-08-15.** In the current tree, `generalLimiter` mounts at `app.use('/api', generalLimiter)`
   (`apps/dgfy-api/src/server.js:424`) while the health route is `app.get('/health', ...)`
   (`server.js:700`) — mounted outside `/api` entirely, so it never reaches the limiter regardless
   of the dead `req.path === '/health'` check. There is no `/api/v1/health` route in the current
   API surface for that check to have mattered against. No fix needed.
4. **Checked, 2026-08-15 (Observer triage).** `customer-dashboard/hooks/useCustomerAccountPanel.js`
   does touch this surface indirectly, via its own live-sync hook —
   `useCustomerDashboardLiveSync.js` polls `loadDgfyPanel`'s 11-request fan-out every **3 seconds**
   while a customer has an active order, despite the same hook already holding a live `EventSource`
   channel for the same updates. This is a stronger, currently-live candidate for exactly this
   pattern (fixed-interval polling, no backoff) than the original `useFnbTrackingRuntime.js`
   suspect, which is now fixed (see above). Filed as
   [#509](https://github.com/Sieitzz/dgfy-platform/issues/509) rather than left as an open
   question — see `docs/ops/SENTRY_TRIAGE_2026-08-15.md`'s second pass for the full root-cause
   writeup. `useCustomerDashboardTracking.js` was not found under that name in the current tree;
   likely a stale reference from before a rename/consolidation, not re-investigated separately.
