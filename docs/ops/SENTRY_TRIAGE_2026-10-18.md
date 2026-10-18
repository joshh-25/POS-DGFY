## Sentry Triage — 2026-10-18

Org: ch-temp | Period: 7d (resolve pass looked back 90d) | Triggered by: Pat's weekly Sentry digest
(Total Errors 752, +667%; 656 of those are `dgfy-mobile-storefront` app-hang events — **out of scope**,
mobile hasn't been deployed). Web-app total in the digest: 96 (POS 60, store 19, backend 14,
skupervisor 3).

Current PROD release: `10c918db4fc06b6b54624c1b94ffe63a18b9b5c7` (backend `app_start_time`
2026-10-16T15:00:20Z). Prior PROD releases still carrying events in the window: `950d961ed…`
(through 10-16), `9020d701…` (through 10-13). PROD backend Sentry reporting is live again (#2502,
host fix 2026-10-15 ~11:04Z; see "Verification" below).

Method note: no per-event release/timestamp slice was available in the first pass, so the second
pass read every PROD `DGFY-POS-C/D/Z`, `-1A/1E/1J/10` and `DGFY-BACKEND-P` event individually
(48 + 23 events). Counts marked `—` were carried from the first pass's issue-level read and not
re-counted.

### Resolved in Sentry (24)

| Issue | Env | Count | Bucket | Action |
|---|---|---|---|---|
| DGFY-POS-11 | PROD | 8 | already fixed / deploy-window (502, last 10-14 10:05Z restart) | resolved-in-sentry |
| DGFY-POS-1G | PROD | 1 | deploy-window (503, 10-15 11:31Z) | resolved-in-sentry |
| DGFY-BACKEND-N | PROD | 1 | deploy-window (MySQL `ECONNREFUSED`, 10-15 11:31Z) | resolved-in-sentry |
| DGFY-STORE-1J | STAGING | 18 | structural noise (transient 502, last 10-11) | resolved-in-sentry |
| DGFY-POS-Z | PROD | 8 (7d) | deploy-window — every event is 10-14 10:05–10:06Z or 10-15 11:03–11:31Z; 0 on `10c918db4` | resolved-in-sentry |
| DGFY-STORE-1, -1Z, DGFY-POS-1F, DGFY-SKUPERVISOR-3, DGFY-STORE-T | STAGING/PROD | — | stale chunk after the 10-16 STAGING refresh | resolved-in-sentry |
| DGFY-POS-1H, DGFY-POS-10, DGFY-STORE-1Y, DGFY-STORE-Y | PROD | 3 (POS-10) | structural noise (403 guard, terminal-lock guard, old-browser `Object.hasOwn`) | resolved-in-sentry |
| DGFY-POS-1B, -1C, -1D, -19, DGFY-STORE-1W, -1V | PROD | — | aged, ≥9d quiet | resolved-in-sentry |
| DGFY-BACKEND-E, -H, -K | DEV | — | config/environment (tenant-schema drift, DEV accepted risk #982), 0 users | resolved-in-sentry |
| DGFY-BACKEND-M | STAGING | 10 | fixed, unconfirmed — migration `20261008000001` makes `company_registration_uploads.application_id` nullable; on develop/staging/main; one-off burst 10-14, 0 users | resolved-in-sentry |

Each resolve carries a one-line Sentry comment naming this run. Regression detection reopens any
that recur. Correction to the first-pass plan: `DGFY-POS-Z` was initially going to stay open; the
event-level read shows it is entirely restart windows, so it was resolved.

### Left unresolved on purpose (8) — each has a named fix owner

| Issue | Env | Count | Bucket | Action / owner |
|---|---|---|---|---|
| DGFY-BACKEND-P | PROD | 6 | genuine defect (tenant-pool acquire timeout) | **filed #2560** |
| DGFY-POS-1A | PROD | 9 | same request as BACKEND-P (shared trace) | #2560 |
| DGFY-POS-1E | PROD | 4 | stall family (10-08 12:05:35 paired with POS-1A, same tenant, same second) | #2560 |
| DGFY-POS-1J | PROD | 1 | stall family (500 on `/pos/terminal/operator/current`, 10-17 06:11:58) | #2560 |
| DGFY-POS-C | PROD | 86 (lifetime) | three signatures, see below | #2560 (multi-tenant) + #1476 / #1474 (single terminal) + #474 (umbrella) |
| DGFY-POS-D | PROD | 19 (lifetime) | single-terminal 5s timeouts | #1476 / #1474 |
| DGFY-BACKEND-J | DEV | 3 | genuine defect — same `reference_type` truncation as PROD #2335 (create path, pre-hotfix) | #2335 (+#2255) |
| DGFY-BACKEND-6 | cross-env (per #1091) | 15 (last seen 10-07) | genuine defect — PayMongo unknown-session alert fires cross-env, masks the real money-loss guard | #1091 |

**Filed this run:** #2560 (cap: 3; 1 used)
**Resolved in Sentry:** the 24 above
**Commented, not filed (existing owners):** #474, #2502, #1476, #2335

Verification (`is:unresolved`, 90d): dgfy-pos → C, 1A, D, 1J, 1E; dgfy-backend → P, 6, J;
dgfy-store → none; dgfy-skupervisor → none. That is exactly the set above. The #1585 storefront
cluster (`DGFY-STORE-1S/1R/1Q/1P/1N`, 09-08 doc) no longer shows as unresolved and was not
re-verified individually this run.

## Why the 502s/timeouts were not simply resolved — three signatures hiding inside `DGFY-POS-C/D/Z`

Resolving a live signal in Sentry doesn't reduce errors. What does is separating deploy noise from
real defects, then fixing the real ones. 48 PROD events in 7d, read one by one:

1. **Deploy-window bursts — resolvable, resolved.** 10-14 10:05–10:06Z (all four tenants, `DGFY-POS-Z`
   502s and `DGFY-POS-11`) and 10-15 11:03–11:40Z (host-fix restart: 502s, Network Errors, 503, MySQL
   `ECONNREFUSED`). Nothing of this shape on the current release.
2. **Multi-tenant stalls on the current release — a real backend defect, #2560.** 10-17 06:11:33 and
   06:11:34Z: `DGFY-POS-C` 20s timeouts on two tenants within a second of each other, then a 500 at
   06:11:58Z (`DGFY-POS-1J`). 10-17 12:23:37–12:25:25Z: POS-C on three tenants, `DGFY-POS-1A` at
   12:24:07Z, and `DGFY-BACKEND-P` at 12:24:08Z and 12:25:25Z. POS-1A's failed request id
   (`06d31771-107e-46bc-a91b-31343e0fbe0a`) is the same request BACKEND-P logged — the POS 500 *is* the
   backend `SequelizeConnectionAcquireTimeoutError`. Release `10c918db4` already has **5**
   `timeout of 20000ms exceeded` events, above #474's own reopen bar (>2 per release).
3. **One live merchant terminal — client-side.** Tenant `d9007376…`, COUNTER-01, iMin WebView Chrome 80:
   20s/60s/5s timeouts and Network Errors through business hours, 10-12 → 10-17 (the 5s-timeout
   `DGFY-POS-D` pattern is this terminal). Device/link plus the client reporting every transient
   failure. Work is in #1476 / #1474 under #643.

## The defect family, and what is and isn't known

**Known:** the stack is `apps/dgfy-api/src/middleware/auth.js:863` — a per-request
`SystemSetting.findOne` (capability check) on the **tenant** pool — waiting out `acquire: 10000` in a
per-tenant pool of `max: 7` (`TenantConnector.js:46-68`, `config/connectionBudget.js`). The same
check also runs at `auth.js:460`. Every `incoming-orders` poll pays both, uncached. POS polls on a
fixed interval with a 20s timeout (12s per #474's 08-15 diagnosis), so one slow poll lets the next
ones overlap.

**Not known — root cause of the stall.** Candidates, in order: a slow handler query/lock pinning a
tenant's 7 slots; a shared MySQL stall (best fit for multi-tenant clustering, unchecked); a scheduled
job. 03:15Z recurrence (BACKEND-P and POS-1A at 03:15:47–56Z on 10-16 and 10-17) matches
`smsDeliveryRetentionScheduler` (`15 3 * * *`) and a `*/15` boundary, but that job is indexed
(`sent_at`) and batched (1000 × ≤100) and the other ~8 episodes aren't on a cron boundary — a weak
lead, not a finding. Sentry can't separate these: backend events carry no `tenant_id`, and PROD
traces are unsampled (`SENTRY_TRACES_SAMPLE_RATE=0`). #2560 starts with making the next occurrence
diagnosable, then removes the avoidable per-request lookups, then tunes pool sizing only on evidence
(not a blind `TENANT_DB_POOL_MAX` raise: budget today is 20 × 7 + 30 = 170 vs `max_connections` 200).

This closes the open question the 2026-09-08 doc left: three generic POS 500s with axios-only
traces (`POS-13/14/15`) were flagged there as "worth asking whether this is symptomatic of something
shared (e.g. transient backend/DB pressure)". With backend reporting restored, that is now visible
on the backend side.

## Verification — PROD backend reporting is live (#2502)

`DGFY-BACKEND-P` is a PROD `dgfy-backend` event on `10c918db4`, first seen 2026-10-15T11:40:36Z (after
the ~11:04Z host fix), 6 events through 10-17 12:25Z. `DGFY-BACKEND-N` (MySQL `ECONNREFUSED`, 10-15
11:31Z) is also a PROD backend event from the restart window. `.agents/skills/observer/references/
sentry-target.md` updated to match.

## Open, not addressed this run

- **Root cause of the shared stall** — needs operator-authorized, read-only PROD forensics (nginx +
  `dgfy-api` logs, MySQL processlist/slow log) around 10-17 06:11Z, 12:23–12:25Z and 03:15Z. Not done:
  observer has no live-server capability.
- **`SENTRY_TRACES_SAMPLE_RATE` on the PROD host** — still 0; host config, operator action.
- **#528** (GeoCatalogSync ~90k warn logs/day) — a plausible but unproven contributor to stalls; not
  investigated this run.
- **#1585** storefront cluster not re-verified individually (see above).
- Mobile (`dgfy-mobile-storefront`, 656 events, app-hangs) excluded by instruction.

**Re-verification query for next run:** `issue:DGFY-BACKEND-P environment:PROD` and
`issue:DGFY-POS-C environment:PROD "timeout of 20000ms exceeded"` grouped by `release`, plus a check
for multiple tenants failing within a few seconds of each other. Pass condition: zero BACKEND-P and
no same-minute multi-tenant POS-C clusters across several days of business hours after #2560 and
#1476 reach PROD; `timeout of 20000ms exceeded` ≤2 per release (#474's threshold). When #2335 is
verified live, resolve `DGFY-BACKEND-J`.
