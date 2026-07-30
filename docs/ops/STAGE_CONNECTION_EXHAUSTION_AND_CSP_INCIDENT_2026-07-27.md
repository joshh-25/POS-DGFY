---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-07-27
applies_to: deploy_operations
topic: stage_connection_exhaustion_and_csp_incident_2026_07_27
---

# Stage Connection Exhaustion & PostHog CSP Incident (2026-07-27)

## Summary

Two unrelated-looking failures were reported against `stage.dgfy.ph` on the same day and turned out to share one investigation, though not one root cause:

1. `GET /api/v1/store/locations` returned a **500 `INTERNAL_ERROR`** for one storefront and a **400 `TENANT_CONTEXT_MISSING`** for another, one second apart.
2. The browser console showed five PostHog scripts blocked by CSP: `web-vitals.js`, `posthog-recorder.js`, `dead-clicks-autocapture.js`, `surveys.js`, and `/array/<key>/config.js`.

Investigated live on `ssh sieitz-dgfy-local`, `/opt/dgfy-stage`. Both are documented here with evidence, root cause, and the fix applied. Both are also **production-readiness risks**, not staging-only quirks — see "Production gates" below.

## Incident 1: MySQL connection exhaustion

### Symptom

```
500 INTERNAL_ERROR "Failed to list storefront locations"   (x-store-slug: syntaxure-labs-e6999f)
400 TENANT_CONTEXT_MISSING "Company token required"         (x-store-slug: skupervisor-7b4cf1)
```

Both requests succeeded with real data when re-run seconds later. Both slugs are, and were, valid visible `dgfy_native` rows in `storefront_discovery_index`.

### Why two different status codes for the same underlying fault

`requireTenantContext` (`backend/src/middleware/requireTenantContext.js`) sits in front of every `/api/v1/store/*` route. It rejects with 400 whenever the resolved tenant context is missing or has degraded to `'default'`. `tenantHandler` (`backend/src/middleware/tenantHandler.js`) degrades to that default context on several distinct internal failures, and — before this incident's fix — reported all of them identically as "Company token required", regardless of whether the caller actually did anything wrong.

- **500** — tenant context bound fine, but the query inside `storeRepository.listActiveLocations` / `getSettingsByKeys` failed to acquire a MySQL connection. `buildListStoreLocationsUseCase` (`backend/src/modules/store/usecases/storeUseCases.js`) caught it and mapped it to `INTERNAL_ERROR` via `mapStoreUseCaseError`.
- **400** — slug→tenant resolution itself failed (see below), `tenantHandler` fell back to `tenantId: 'default'`, and `requireTenantContext` rejected that as `TENANT_CONTEXT_MISSING`.

Both are the same underlying fault landing at different points in the request chain: MySQL had run out of connections.

### Evidence

| Observation | Source |
|---|---|
| `max_connections = 20`; `Max_used_connections = 21`; `Connection_errors_max_connections = 6702`; `Aborted_connects = 2754` | live `SHOW STATUS` on `dgfy-platform-staging-mysql-1` |
| 112 × `SequelizeConnectionError: Too many connections` from `TenantConnector.getConnection` via `tenantHandler.js`, concentrated in a 3-minute window (15:41–15:43 UTC) | `docker compose logs backend` |
| Burst timestamps `15:43:50` / `15:43:51` match the reported responses exactly (`15:43:50.665Z` → 500, `15:43:51.006Z` → 400) | log ↔ reported response bodies |
| Alphabetical sweep in the logs: `Karne De Patatas → Kitkowleen → krusty krab → Pat Solutions → SKUPERVISOR → Space Bar` | `docker compose logs backend` |
| 33 active tenants; 32 `sku_tenant_%` databases | landlord DB |
| Staging MySQL container at 94.7% of its 350 MB memory limit; host had 12.8 GB free | `docker stats`, `free -m` |

### Root cause: an under-provisioned connection budget, amplified by a public fan-out

The connection budget was designed for roughly 170 concurrent MySQL connections:

- `backend/src/utils/TenantConnector.js` — up to 20 cached tenant connections, each with `pool.max = 7` → **140**
- `backend/src/config/database.js` — landlord pool `pool.max = 30` → **30**

Two things made this land as an outage rather than a slow degradation:

1. **Staging's `max_connections=20`** was server-local drift in `/opt/dgfy-stage/docker-compose.yml` — the repo's `infrastructure/docker/docker-compose.yml` passed no `--max_connections` at all, so production was silently inheriting MySQL 8's default of **151**. 170 > 151, so production was *also* under-provisioned, just less acutely than staging's explicit 20.
2. **A single unauthenticated request can fan out across every active tenant DB.** `reconcileStorefrontDiscoveryIndex` (`backend/src/services/storefrontDiscoveryIndexService.js`) opens a connection to *every* active tenant. It's reachable from public storefront traffic via `backend/src/services/storefrontTenantResolver.js`: an empty discovery index triggers a full reconcile, and — this was the sharper edge — **any single slug miss** also triggered one, awaited inline on the request path, with only a *per-slug* cooldown. A burst of distinct unknown slugs meant a burst of full 33-tenant sweeps, each opening connections faster than the pool could give them back. The alphabetical tenant sequence in the log evidence above is exactly one such sweep.

### Fix applied

- **`backend/src/config/connectionBudget.js`** (new) — centralizes the arithmetic (`TENANT_MAX_CACHED_CONNECTIONS × TENANT_DB_POOL_MAX + LANDLORD_DB_POOL_MAX` vs. `DB_MAX_CONNECTIONS`), all four now env-tunable with the historical values as defaults. `assertConnectionBudget()` logs the comparison at boot — a `[ConnectionBudget] OVER BUDGET` warning turns a silent, minutes-long outage into a line in the startup log, checked at deploy time (see "Production gates" below).
- **`backend/src/utils/TenantConnector.js`, `backend/src/config/database.js`, `backend/src/server.js`** — wired to the new module; comments corrected to describe the real constants (the old comment reasoned from "10 tenants × 7 = 70" while the actual constant was 20).
- **`infrastructure/docker/docker-compose.yml`** — `mysql` now pins `--max_connections=200` explicitly (with a comment tying it to the app's budget) instead of relying on MySQL's implicit 151; `backend`'s `DB_MAX_CONNECTIONS` env defaults to match.
- **`backend/src/services/storefrontTenantResolver.js`** — the empty-index and slug-miss repair paths now hold their **in-flight promise** (not a boolean), so concurrent callers await and observe the *same* reconcile instead of stampeding. The slug-miss path additionally gained a **process-wide** cooldown on top of the existing per-slug one, so N distinct unknown slugs in a burst now produce **at most one** reconcile, not N. Covered by a new test, `runs at most one reconcile for a burst of distinct unknown slugs`.
- **`backend/src/middleware/tenantHandler.js`** — on storefront routes (`/api/v1/store/*`), a lookup error, slug-resolution error, or unreachable tenant DB now returns **503** (`STOREFRONT_LOOKUP_UNAVAILABLE` / `TENANT_LOOKUP_UNAVAILABLE` / `TENANT_DB_UNAVAILABLE`) instead of degrading to the default context that `requireTenantContext` was always going to reject anyway. Every route under `/api/v1/store` sits behind `requireTenantContext`, so that fallback could never produce a working response — it only relabeled an infrastructure fault as the caller's mistake. A genuinely unknown slug is unaffected: it still resolves to `null` and follows the existing (unchanged) default-context path, since that's a caller-side condition, not an outage.
- **`backend/src/services/storefrontDiscoveryIndexService.js`** — the per-tenant index rewrite (`destroy()` then `create()`) now runs inside a landlord-DB transaction via `replaceDiscoveryIndexRow()`. This closes a latent, previously undiscussed integrity gap: a failure between the destroy and the create — exactly the condition connection exhaustion produces — used to drop a live store from the discovery index with nothing to put it back until the next reconcile happened to succeed clean. 8 active tenants currently have no index row; this is plausibly legitimate (unconfigured storefronts) and is **not** claimed as proven data loss from this incident — flagged here as something to spot-check, not a confirmed casualty.

All new/updated tests pass: `storefrontTenantResolver.test.js` (4/4, including the new burst test), `storefrontDiscoveryIndexService.catalogVisibility.test.js` (4/4) + `storefrontDiscoveryRepository.test.js` (24/24) after re-linking the `@sieitzz/shared-constants` workspace package locally, and `tenantHandler.storefrontDomain.test.js` (7/7, including four new 503 cases) + `requireTenantContext.middleware.test.js` (4/4).

## Incident 2: PostHog extensions blocked by the storefront's baked-in CSP

### Symptom

```
Loading the script 'https://eu-assets.i.posthog.com/static/web-vitals.js?v=1.407.2' violates the following
Content Security Policy directive: "script-src 'self' blob:" ...
```
Repeated for `posthog-recorder.js`, `dead-clicks-autocapture.js`, `/array/<key>/config.js`, and `surveys.js`.

### Source of the policy

`frontend/apps/store/index.html` bakes a `<meta http-equiv="Content-Security-Policy">` tag directly into the build artifact, with `script-src 'self' blob:`. Confirmed byte-identical in the deployed container (`/usr/share/nginx/html/store/index.html`). No CSP **response header** exists anywhere in the chain — not the host nginx vhost, not the frontend container's nginx — so this meta tag is the only policy in force, and it ships in every environment identically.

### Why only some PostHog features broke

`posthog-js` is npm-bundled into the app, so its core chunk is same-origin and `init()` ran fine; `connect-src 'self' https: http:` also permitted event ingest. But `posthog-js` lazily fetches its optional extensions from `eu-assets.i.posthog.com` **at runtime** — session replay, surveys, web vitals, dead-click autocapture, and the `/array/` remote-config endpoint. `script-src 'self' blob:` allows no external script host, so all five were silently blocked.

**Practical impact while broken:** pageviews and custom events kept working — the dashboard looked healthy. Session replay, surveys, web vitals, and dead-click autocapture were dead, and nothing surfaced that except the browser console, which is why it went unnoticed until now.

Init site: `frontend/src/observability/analyticsClient.js`, which previously set only `api_host` — no `ui_host`, no proxy.

### Fix applied: same-origin reverse proxy

Chosen over CSP-loosening or feature-disabling because it needs **zero CSP changes** (assets become `'self'`) and survives ad-blockers, which a direct `eu-assets.i.posthog.com` reference does not. Shape verified against PostHog's current documented nginx proxy recipe (three location blocks: `/static/` and `/array/` to the `*-assets` host, catch-all to the regional API host).

- **`infrastructure/docker/nginx/nginx.conf.template`** — added `/ingest/static/`, `/ingest/array/`, and `/ingest/` location blocks to all three HTTPS server blocks (skupervisor, POS, storefront), modelled on the file's existing `/openfreemap/` proxy (same shape: external upstream via `set $var`, `proxy_ssl_server_name on`, explicit `Host`). Validated by rendering the template with `envsubst` inside `nginx:1.27-alpine` and running `nginx -t` against it with a real (self-signed, local-only) cert — syntax passes.
- **`frontend/src/observability/analyticsClient.js`** — `api_host` now defaults to the same-origin `/ingest` path when `VITE_POSTHOG_HOST` is unset (previously an unset host meant `missing_config` and analytics silently no-op'd — see the Dockerfile's empty default). `VITE_POSTHOG_HOST` still overrides it, for local dev pointing straight at PostHog with no proxy in front. Added `ui_host: 'https://eu.posthog.com'` so in-app PostHog links resolve correctly. Covered by two new tests in `analyticsClient.test.js`; one pre-existing test whose premise ("no host ⇒ inactive") was the exact bug this fixes was updated to assert the new default-to-proxy behavior instead.
- **`frontend/apps/store/vite.config.js`, `apps/pos/vite.config.js`, `apps/skupervisor/vite.config.js`** — matching `/ingest/*` dev-server proxy entries (ordered before the bare `/ingest` prefix, since Vite matches proxy keys in insertion order), so local dev exercises the same path production will.
- **`frontend/apps/store/index.html`** — **no change.** Verified explicitly: the storefront's CSP still contains no external script host; the proxy is what makes `'self'` sufficient.

### Separate gap noted, not fixed here

The skupervisor surface never calls `initBrowserAnalytics` at all — `frontend/apps/skupervisor/src/main.jsx` re-exports `frontend/src/main.jsx`, which only initializes Sentry — despite a Dockerfile comment claiming all three surfaces are covered. Out of scope for these two incidents; flagged as a follow-up.

## Follow-up (2026-07-28): the first `/ingest` rollout silently no-op'd on stage

The fix above shipped and deployed cleanly (PR #116 → `develop`, PR #117 → `staging`), but the CSP console errors on `stage.dgfy.ph` were **unchanged** afterward. The code was correct and confirmed present in the deployed bundle; two *deployment-config* gaps — both outside the code — prevented it from taking effect:

1. **A CI variable overrode the `/ingest` default.** `analyticsClient.js` resolves `apiHost` as `VITE_POSTHOG_HOST || '/ingest'`. The GitHub **STAGING** environment variable `VITE_POSTHOG_HOST` was already set to `https://eu.i.posthog.com` (predating this fix), so the explicit value always won and `/ingest` was never used.
2. **The proxy was added to the wrong nginx.** The `/ingest` blocks went into `infrastructure/docker/nginx/nginx.conf.template`, which configures the *containerized* `nginx` service in the repo's compose file. But `/opt/dgfy-stage/docker-compose.yml` — the actual deployment for `stage.dgfy.ph` — is a hand-diverged copy with **no nginx service at all**; it exposes backend/frontend directly on loopback ports, and `stage.dgfy.ph` is fronted by a **host** nginx at `/etc/nginx/sites-available/dgfy-staging` that had **no tracked source anywhere in this repo** until this follow-up. This is exactly the caveat the original writeup flagged and left open (see the "Durable in repo vs. live-only on the server" table above) — it turned out to be the actual blocker.

**Order mattered:** nginx had to be fixed before the variable was flipped — flipping the variable first would have pointed `api_host` at `/ingest` while it still 404/fell-through to the SPA, breaking event ingest too (which was working throughout).

**Fixed:**
- `infrastructure/nginx-host/stage.dgfy.ph.conf` (new) — a tracked copy of the live host nginx vhost, with `/ingest/static/`, `/ingest/array/`, and `/ingest/` added to the three frontend server blocks (`stage.dgfy.ph`, `pos.stage.dgfy.ph`, `skupervisor.stage.dgfy.ph`; `api.stage.dgfy.ph` is backend-only and untouched). Applied to the live server, verified via `nginx -t` before and after, and confirmed live: `/ingest/static/surveys.js` returns `Content-Type: application/javascript` (previously the SPA's `index.html`), with no regression on `/api`, `/uploads`, `/openfreemap/`, or the SPA root.
- GitHub **STAGING** environment variable `VITE_POSTHOG_HOST` set explicitly to `/ingest` (rather than deleted, so the value stays visible to anyone reading the environment config), and the staging build rerun to bake it into a fresh image.
- Confirmed end-to-end: the new deployed bundle contains `VITE_POSTHOG_HOST:"/ingest"`, and `/ingest/static/surveys.js` / `/ingest/array/<key>/config.js` both return real PostHog JS content in production traffic.

**Broader implication, not yet fixed:** production and beta share one host (`dgfy-gha`) and one containerized nginx, so in principle they don't have stage's "wrong nginx" problem — `infrastructure/docker/nginx/nginx.conf.template` **is** what fronts them. But investigating that host surfaced a *third*, more serious gap: its deployed `nginx.conf.template` has drifted substantially from the repo's tracked version (production-specific dual-domain server blocks were added directly on the server and never merged back), such that naively copying the repo template over would break production routing. See `docs/ops/PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md` for the full findings and required steps before this proxy — or any other nginx template change — can safely reach production.

## Connection-budget reference

The relationship any future capacity change must preserve, now computed at boot by `backend/src/config/connectionBudget.js` rather than living only in comments:

```
TENANT_MAX_CACHED_CONNECTIONS × TENANT_DB_POOL_MAX + LANDLORD_DB_POOL_MAX  ≤  DB_MAX_CONNECTIONS (server's max_connections)
                20            ×          7          +          30          =  170   (defaults, unchanged by this incident)
```

| Environment | `max_connections` (server) | App budget (defaults) | Fits? |
|---|---|---|---|
| staging (`/opt/dgfy-stage`), as found 2026-07-27 | 20 (explicit, server-local) | 170 | **No** — this incident |
| production, before this fix | 151 (MySQL default, implicit) | 170 | **No** — undiscovered until now |
| repo compose, after this fix | 200 (explicit, `infrastructure/docker/docker-compose.yml`) | 170 | Yes |

## Durable in repo vs. live-only on the server

| Item | Durable? | Notes |
|---|---|---|
| Connection-budget arithmetic + boot-time warning | Yes | `backend/src/config/connectionBudget.js`, wired into `server.js` |
| `max_connections` pinned to 200 in compose | Yes, for anything deployed from `infrastructure/docker/docker-compose.yml` | Staging's live compose is a separately-maintained copy — see next row |
| Staging's live `--max_connections=20` and 350 MB MySQL memory limit | **No** | `/opt/dgfy-stage/docker-compose.yml` was **not** live-patched as part of this incident (explicit scope decision). Still needs `--max_connections` raised and the memory limit lifted above 350 MB (already at 94.7%; host has 12.8 GB free), then `docker compose up -d mysql`. |
| Global reconcile cooldown / transactional index rewrite / 503-not-400 | Yes | All in `backend/src/services/` and `backend/src/middleware/`, ship with the next backend deploy |
| PostHog `/ingest` nginx proxy on `stage.dgfy.ph` | **Yes, now** | Resolved in the 2026-07-28 follow-up above. `stage.dgfy.ph` is fronted by a host nginx, not the containerized one — now tracked at `infrastructure/nginx-host/stage.dgfy.ph.conf` and applied live. |
| PostHog `/ingest` nginx proxy on production/beta | **Yes, as of 2026-07-28** | Was still drifted when PROD's `VITE_POSTHOG_*` variables were enabled, causing Sentry issue `DGFY-STORE-1` on `dgfy.ph`. Reconciled and deployed same day — see the update at the top of `docs/ops/PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md`. |
| `analyticsClient.js` default-to-proxy `api_host` | Yes | Ships with the next frontend build |

## Production gates

Both incidents surfaced a gap that would have shipped to production undetected. Before any future production cutover:

- [ ] Confirm `max_connections` on the production MySQL instance ≥ the computed app budget (boot log `[ConnectionBudget]`, not `OVER BUDGET`).
- [ ] Confirm the `/ingest/` proxy is present in whatever nginx config actually fronts the production domain (`nginx.conf.template` for the Docker topology; check the equivalent for any non-Docker surface).
- [ ] Load a production storefront page and confirm zero CSP violations, with PostHog's replay/surveys/web-vitals/dead-clicks scripts loading from `/ingest/...`.
- [ ] These two checks were also added to `docs/ops/PRODUCTION_CHECKLIST.md`'s "Post-Deploy Proof" section.

## Related

- `docs/ops/BETA_TENANT_PROVISIONING_INCIDENT_2026-07-04.md` — a prior incident on `beta.dgfy.ph`, different root causes (tenant-schema drift, a missing DB grant), same general shape: a live-server config gap not durably closed at the source until investigated.
- `docs/ops/PRODUCTION_CHECKLIST.md`
- `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
