---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-24
applies_to: dgfy_api, storefront_frontend, pos_frontend
topic: rate_limiting
---

# Rate Limiting

Every rate limiter defined in `apps/dgfy-api/src/middleware/rateLimiter.js`, what it protects,
what identity it keys on, and why. Written 2026-08-24 after
[#958](https://github.com/Sieitzz/dgfy-platform/issues/958) — a production outage that took
investigation to diagnose specifically because none of this was written down anywhere. If you're
debugging an unexpected 429, start here before reading source.

## Why rate limiting exists here

Originated from an internal security audit
(`docs/archive/system-audit-2026-03/9.1-Auth_rate_limiting_disabled.md`): brute-force protection
on login, enumeration resistance on lookup/OTP endpoints, and abuse/cost control on public tenant
registration and email sends.

**No ADR, PCI, DPA, or penetration-test requirement pins any specific threshold** — ADR 0060
classifies rate limits as ordinary non-secret env config. Only two governed floors exist, both
about public tenant registration, neither about ordinary customer or POS traffic:

- `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5` / window `3600000`, "or stricter"
  (`docs/ops/HOSTING_PROFILES.md`, authoritative).
- `/auth/lookup` must remain rate-limited in production
  (`docs/compliance/impact-declarations/2026-06-15-pos-terminal-lookup-rate-limit-adjustment.md`,
  classification `regulatory`).

Everywhere else, the *identity a limiter keys on* matters far more than the number — a correctly
scoped limit stops an attacker without ever touching a legitimate user; an incorrectly scoped one
(shared IP, shared NAT) does the opposite. #958 was a keying bug, not a threshold that was too
low.

## How to read the table

- **Budget** is the production default (`isDevelopment ? dev : prod` in source); every one is
  overridable via its own `RATE_LIMIT_*_WINDOW_MS` / `RATE_LIMIT_*_MAX_REQUESTS` env pair, but
  **most have no entry in any `.env.example`** — the env var exists and works, it's just
  undocumented outside this file and the source.
- **Key** is what one budget is shared across. This is the column that actually determines
  whether a shared network, a shared account, or a shared store collides into one bucket.
- **Mount** is where in the route tree the limiter applies.

## generalLimiter — the default, applies to everything under `/api`

Mounted at `app.use('/api', generalLimiter)` (`server.js`), **before authentication runs**.
Budget: 300–1200/15min depending on `RATE_LIMIT_MIN_PROD_REQUESTS`/`RATE_LIMIT_MAX_REQUESTS`
(prod floor is `max(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_MIN_PROD_REQUESTS ?? 300)`).

Key: `general:<host>:<company-token|"default">:<user-identity|"anonymous">:<ip>`. As of the
#958 fix, user identity resolves from either an `Authorization: Bearer` header or the DGFY
session cookie (`sku_dgfy_session`) — **before that fix, cookie-only requests always keyed as
`anonymous`, collapsing every signed-in customer on one network into a single bucket.** This is
exactly what happened on 2026-08-24: one phone's runaway poll (#509) exhausted the shared bucket
in ~5.5 minutes and locked out everyone else on the same WiFi for 4.5–8.5 minutes.

Skipped entirely for: `/health`, `/pos` and `/mobile-pos` paths (they have `posLimiter` instead),
authenticated POS bootstrap reads, and authenticated `/items` operations — see
`rateLimiterExemptionCoverage.contract.test.js` for the enforced, exact list.

**Known remaining gap:** the storefront session cookie (`sku_store_session`, tenant-scoped
customer accounts, distinct from the DGFY cross-tenant account) is not yet resolved into this
key — see [#972](https://github.com/Sieitzz/dgfy-platform/issues/972).

## Auth / identity limiters

| Limiter | Budget (prod) | Window | Key | Mount |
|---|---|---|---|---|
| `authLimiter` | 5 | 5 min | `auth:<login\|register>:<ip>:<email>` | `/auth/{login,register}`, DGFY auth routes |
| `emailOtpLimiter` | 3 | 10 min | `email_otp:<purpose>:<tenant>:<ip>:<email\|invite-token>` | `/auth/email-otp/request`, `/users/me/email-otp/request` |
| `adminAuthLimiter` | 5 | 15 min | `admin_auth:<ip>:<username>` | `/admin/login` |
| `storeAuthLimiter` | 10 | 15 min | `store_auth:<login\|register>:<ip>:<email>` | `/store/auth/{login,register}` |
| `lookupLimiter` | 5 | 5 min | `lookup:<ip>:<email>` | `/auth/lookup` |
| `dgfyTenantSessionLimiter` | 10 | 15 min | `dgfy_tenant_session:<ip>:<account>:<tenant>` | `/dgfy/auth/tenant-session` (post-auth) |
| `dgfyAccountSearchLimiter` | 30 | 1 min | `dgfy_account_search:<tenant>:<user>:<ip>:<query>` | `/dgfy/accounts/search` |

**`authLimiter` only counts failed attempts as of the #958 fix**
(`skipSuccessfulRequests: true`) — previously, 5 *successful* logins in the window locked out
everyone else sharing the same `ip+email` bucket (a shared cashier/office account on one network).
Brute force is about failures; a successful login should never consume the same budget as one.

## Storefront / customer-facing browse limiters

| Limiter | Budget (prod) | Window | Key | Mount |
|---|---|---|---|---|
| `storeTrackingLimiter` | 30 | 15 min | `<ip>:<tracking_pin>` | booking refs, order claim/cancel |
| `storeTrackingReadLimiter` | 300 | 15 min | `<ip>:<store_slug>:<tracking_pin>` | `GET /store/track/:pin` |
| `storeLocationsLimiter` | 90 | 1 min | `<ip>:<store_slug>` | `GET /store/locations` |
| `storeVoucherLookupLimiter` | 20 | 1 min | `<ip>:<store_slug>` | catalog/QR resolve, only when `voucher_code` is present |
| `storefrontDiscoveryLimiter` | 90 | 1 min | `<ip>:slug\|search\|browse` | `/storefront/discovery*` |
| `storefrontFollowLimiter` | 30 | 1 min | `<tenant>:<slug>:<customer\|guest visitor_id>:<ip>` | `/store/follow*` |
| `geoSearchLimiter` | 60 | 1 min | `<ip>:query\|browse` | `/geo/*`, `/storefront/*` geo search |
| `routeCalculatorLimiter` | 60 | 1 min | `<ip>` — pure IP | `/geo`, `/storefront` route calculator |
| `inventoryPushLimiter` | 20 | 1 min | `<tenant>:<ip>` | `/store/inventory/push` |
| `onboardingEventsLimiter` | 60 | 5 min | `<tenant>:<user>:<event_key>:<ip>` | `/onboarding/events` |

**Known gap:** `routeCalculatorLimiter`, `storefrontDiscoveryLimiter`, `storeLocationsLimiter`,
and `storeVoucherLookupLimiter` key wholly or mostly on IP — everyone browsing the **same store**
from the **same network** collides into one bucket. `storefront_discovery` was the second-largest
rejected scope in the 2026-08-24 incident (25 of 148 rejections). Tracked in
[#972](https://github.com/Sieitzz/dgfy-platform/issues/972).

## POS limiters

| Limiter | Budget (prod) | Window | Key | Mount |
|---|---|---|---|---|
| `posLimiter` | 1500 | 15 min | `pos:<tenant>:<user>:<terminal>` | all `/pos`, `/mobile-pos` |
| `posDrawerAuthorizationLimiter` | 5 | 10 min | `pos:<tenant>:<user>:<shift>:<terminal>:<ip>` | drawer authorization |
| `mobilePosFreeSyncLimiter` | `MOBILE_SYNC_LIMIT_PER_DAY` (currently 2) | 24 hr | `<tenant>` | mobile sync endpoints, free-tier tenants only |
| `itemOperationsLimiter` | 1500 | 15 min | `item_operations:<tenant>:<user>` | all `/items` |
| `tenantFinancialLimiter` | 240 | 15 min | `<tenant>:<admin>` | `/tenant-revenue/*` |

**Known gap:** `posLimiter`'s `terminal` component falls back to the client's NAT-forwarded IP
when neither an `x-pos-terminal-id` header nor `body.terminal_id` is present — and **no
production POS client currently sends either**, only test fixtures do. Every terminal in a store
therefore shares one bucket, and at cashier login specifically (`posLimiter` runs pre-auth) the
key collapses further to `pos:<company-token>:anonymous:<NAT-IP>` — every terminal, every cashier,
one bucket for the whole store. Not yet observed causing a real incident, but the exposure is
real. Tracked in [#971](https://github.com/Sieitzz/dgfy-platform/issues/971) — fixing it needs a
compliance impact declaration, since it touches `routes/pos.js`.

## `tenantRegistrationLimiter`

5/hour, pure IP. **This one is a governed floor, not a tuning knob** — see
`docs/ops/HOSTING_PROFILES.md`. Public tenant registration writes landlord review state and
queues provisioning; do not loosen this without reading that doc first.

## `DynamicStore` — how the Redis/memory split actually behaves

Every limiter above uses its own `DynamicStore` instance (`rateLimiter.js`), which prefers Redis
when connected and falls back to an in-process `MemoryStore` otherwise.

- **Memory and Redis counts never merge.** A Redis connection flap flips a limiter to memory
  mid-window; recovering flips it back. Whichever store is live at request time is authoritative
  for that request alone.
- Redis's own reconnect strategy (`config/redis.js`) gives up permanently after 10 failed
  attempts — there is no later automatic recovery short of a process restart.
- Under multi-process/multi-container deployment, each replica's `MemoryStore` is independent —
  effective limits multiply by replica count while on the fallback.
- `increment()`, `decrement()`, and `resetKey()` all fall back to memory on a Redis error (as of
  the #958 fix — `decrement`/`resetKey` were previously unguarded and would have thrown an
  unhandled rejection the first time `skipSuccessfulRequests` needed them).

**This was #958's original leading suspect and was confirmed *not* responsible** for the
2026-08-24 incident — production logs showed one coherent, monotonically increasing counter, the
opposite of what a Redis/memory divergence would produce. The divergence itself is real and
tracked separately: [#974](https://github.com/Sieitzz/dgfy-platform/issues/974).

Current store mode is exposed at `getRateLimiterStoreMode()`, surfaced via `/health` and
`/api/v1/health` as `capabilities.rateLimitStore.mode`.

## Known gaps not yet fixed

- **IP resolution is spoofable.** Every IP-keyed limiter reads the leftmost entry of
  `X-Forwarded-For` (`firstForwardedIp`), which is client-supplied — nginx *appends* to it, never
  replaces it. A real attacker can get a fresh bucket per request; honest users behind one NAT
  cannot escape sharing one. Tracked in
  [#973](https://github.com/Sieitzz/dgfy-platform/issues/973), parented under the security epic
  (#252).
- **No counter/observability surface.** `rateLimitCounters` exists in-process but is exposed
  nowhere — no admin view, no `/metrics` series. Diagnosing #958 required an SSH session and log
  grepping. The spike alert (`RATE_LIMIT_ALERT_THRESHOLD`, default 50) fires every Nth 429 *for
  the process lifetime*, since the counter never resets — past the first alert it stops
  correlating with the current window. Tracked in
  [#975](https://github.com/Sieitzz/dgfy-platform/issues/975).
- **No working non-prod bypass.** `DISABLE_RATE_LIMIT` is gated on `NODE_ENV === 'development'`,
  which every environment's Dockerfile hardcodes to `production`
  (`infrastructure/docker/dgfy-api/Dockerfile:27`) — it is dead code in every real environment.
  Tracked in #975; a rotatable secret-header bypass is the leading candidate, since testing
  sometimes happens directly against production.
- **429 reason is invisible to users.** The response body already carries `limitScope`,
  `limitKeyType`, and `retryAfterSeconds` (`buildRateLimitResponse`), but no client surfaces any
  of it. Tracked in #975.

## If you're debugging a 429 right now

1. Read the `logger.warn('Rate limit exceeded', ...)` line — it carries `scope`, `keyType`, `ip`,
   `forwardedIp`, `tenantId`, `userId`, and the exact `rateLimitState` (`limit`/`current`).
2. Match `scope` to the table above to find the limiter and its key shape.
3. If the same key is being hit by more than one real user/device, that's a keying bug like
   #958 — file it the same way, don't just raise the threshold.
