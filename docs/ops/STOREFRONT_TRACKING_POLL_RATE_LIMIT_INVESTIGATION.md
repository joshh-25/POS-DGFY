---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-07-23
applies_to: storefront_frontend, backend_rate_limiting
topic: storefront_tracking_poll_rate_limit_investigation
---

# Storefront Tracking Poll / Rate-Limit Investigation

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

## Leading suspect (not yet confirmed as root cause)

`frontend/apps/store/src/modes/fnb/tracking/hooks/useFnbTrackingRuntime.js`,
lines ~106-107:

```js
const selectedTimer = selectedPin ? window.setInterval(() => void refresh(selectedPin, true), document.hidden ? 8000 : 2000) : null;
const backgroundTimer = backgroundPins.length ? window.setInterval(() => backgroundPins.forEach((pin) => { void refresh(pin, false); }), document.hidden ? 30000 : 12000) : null;
```

While the order-tracking drawer/tab is open (`checkoutTab === 'track' &&
isFnbOrderSubpage`), this polls the selected pin every **2 seconds**
(8s if the tab is backgrounded) and every background-tracked pin every 12s
(30s backgrounded) — indefinitely, with no upper bound on how long a tab can
sit open on this view.

The `refresh()` function's catch block (lines ~100-102) only sets
`trackingError` for the "selected" pin case and otherwise swallows the
error — **there is no backoff, no circuit breaker, and no handling of 429 /
`Retry-After` at all.** Once this poller starts getting rate-limited, it does
not slow down or stop; it keeps firing on the same fixed interval forever.
At a 2s interval, one tab left open for the length of a workday would, on its
own, generate tens of thousands of requests — plausibly explaining the 5,853
cumulative `store_tracking` 429s observed.

This is a plausible root cause, not a confirmed one. It has not been proven
that this specific poller (rather than something else — a stray automated
test loop, a leftover browser tab, a different endpoint miscounted under the
same `store_tracking` scope, etc.) generated the observed volume.

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
3. **Separately**, the `generalLimiter` health-check skip bug
   (`req.path === '/health'` never matching the mount-relative
   `/v1/health`) should be fixed on its own merits — health checks should
   never be subject to the shared IP bucket, regardless of what's causing
   the volume. Not done in this pass since it's a backend source change and
   the immediate ask was to unblock local QA at the env level only.
4. Check whether this pattern (fixed-interval polling with no backoff) exists
   elsewhere in the storefront — `useCustomerDashboardTracking.js` and
   `customer-dashboard/hooks/useCustomerAccountPanel.js` also touch
   `store/track`/`store/orders` per a repo-wide grep and haven't been
   checked yet.
