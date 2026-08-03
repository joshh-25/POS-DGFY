# Sentry Setup

Sentry is optional and disabled by default. Missing DSNs never block startup or builds.

## Projects

Create one Sentry project per deployed surface:

- `backend`
- `skupervisor`
- `pos`
- `store`

## Server Runtime Env

Set these in the server Docker `.env`, or in `infrastructure/docker/local-test/.env.compose` for local-test:

```dotenv
SENTRY_ENABLED=false
SENTRY_BACKEND_DSN=
SENTRY_ENVIRONMENT=beta
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_SEND_DEFAULT_PII=false
SENTRY_DEBUG=false
```

Behavior:

- `SENTRY_ENABLED=false` hard-disables backend Sentry, even if a DSN is present.
- `SENTRY_ENABLED=true` plus a DSN enables server-side error capture.
- If `SENTRY_ENABLED=true` but the DSN is missing, the service logs a warning and continues without Sentry.

**`SENTRY_ENVIRONMENT` fallback — set it explicitly, do not rely on the default.** The
backend Docker image hard-sets `NODE_ENV=production` on every environment (dev,
staging, beta and prod alike — see `infrastructure/docker/dgfy-api/Dockerfile`), so an
unset `SENTRY_ENVIRONMENT` does **not** fall back to a meaningful per-box value. The
resolver (`resolveSentryEnvironment` in `apps/dgfy-api/src/config/sentry.js`) is:

1. `SENTRY_ENVIRONMENT` if set.
2. Otherwise `NODE_ENV`, but only when it is not `"production"`.
3. Otherwise `"unknown"` — deliberately not `"production"`, so a server that forgot to
   set this variable reports somewhere obviously wrong in the Sentry UI instead of
   silently polluting the real `PROD` environment's data.

### Why the backend loads Sentry via `--import`, not a plain import

The backend is ESM (`"type": "module"` in `apps/dgfy-api/package.json`, Node 22).
`src/config/sentry.js`'s `initSentry()` registers `expressIntegration()` and
`mysql2Integration()`, which patch those two packages' exports at *import
time* to add spans for routes/queries. If `express`/`mysql2` are imported
anywhere in the process before `Sentry.init()` runs, that patch is too late
-- the modules' exports are already bound into every file that imported
them, and Sentry's instrumentation cannot retroactively attach.

`server.js` imports ~65 application modules (including routes that
transitively import express and mysql2) before it used to call
`initSentry()`. To guarantee ordering, Sentry now loads from a dedicated
`apps/dgfy-api/src/instrument.js`, run via Node's `--import` flag *before*
`server.js`'s own imports start evaluating:

```bash
node --import ./src/instrument.js src/server.js
```

This is wired into `npm start`, `npm run dev` (via `nodemon --exec`), and
`infrastructure/docker/dgfy-api/Dockerfile`'s `CMD`. Requires Node >=18.19
for ESM `--import` support (the image is `node:22-alpine`, so this is
satisfied). Do not move this to a `NODE_OPTIONS` env var --
`infrastructure/docker/entrypoint.sh` runs a schema-sync script before
`exec "$@"` and shouldn't boot Sentry for that.

Separately: request-level scope isolation (so concurrent requests' tags
don't leak into each other's error reports) is automatic on Node >=22.12
as long as `Sentry.init()` runs before `app.listen()` -- true here regardless
of the `--import` change. `sentryRequestContext` in `src/config/sentry.js`
still wraps its tag-setting in `Sentry.withIsolationScope()` explicitly, as
Sentry's own documented Express pattern and so this doesn't silently regress
if that Node-version assumption ever stops holding.

## Frontend Build Env

Set these as GitHub Environment vars for image builds, or in `local-test/.env.compose` before rebuilding local-test:

```dotenv
VITE_SENTRY_ENABLED=false
VITE_SENTRY_DSN_SKUPERVISOR=
VITE_SENTRY_DSN_POS=
VITE_SENTRY_DSN_STORE=
VITE_SENTRY_ENVIRONMENT=beta
VITE_SENTRY_RELEASE=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0
VITE_SENTRY_TRACE_PROPAGATION_TARGETS=
VITE_SENTRY_TRACE_PROPAGATION_ENABLED=
VITE_SENTRY_DEBUG=false
```

Behavior:

- `VITE_SENTRY_ENABLED=false` hard-disables browser Sentry.
- `VITE_SENTRY_ENABLED=true` plus each app DSN enables browser error capture for that built app.
- Frontend values are build-time values because the app is served as static nginx assets. Changing frontend Sentry values requires rebuilding the frontend image.
- `VITE_SENTRY_REPLAYS_*_SAMPLE_RATE` being `>0` is what registers `replayIntegration()` in `src/observability/sentryClient.js` -- a `0` rate means that integration isn't added at all, not just sampled out.
- `VITE_SENTRY_TRACE_PROPAGATION_TARGETS` is a comma-separated list of origins/URL patterns that get `sentry-trace`/`baggage` headers attached to outgoing requests, joining a frontend error to the backend trace that caused it. Leave unset to fall back to same-origin + `VITE_API_URL` (see `resolveTracePropagationTargets()`). The POS Electron shell's `backendOrigin` is resolved at runtime and passed to `initBrowserSentry({extraTracePropagationTargets})` from `src/main.jsx`, so it no longer needs this set explicitly -- set it anyway for any surface that doesn't read `runtimeConfig`.

### Distributed tracing: three modes, and the `0` trap

Tracing is **tri-state**, not a boolean. `resolveTracingMode()` picks the mode:

| Mode | When | `browserTracingIntegration` | Transactions billed |
|---|---|---|---|
| `off` | `VITE_SENTRY_TRACE_PROPAGATION_ENABLED` explicitly falsy | not registered | 0 |
| `propagate` | default (rate unset or `0`) | registered, PerformanceObservers disabled | **0** |
| `spans` | `VITE_SENTRY_TRACES_SAMPLE_RATE > 0` | registered with full options | sampled |

Two non-obvious facts drive this design, both verified against the installed SDK:

1. **`tracesSampleRate: 0` is not "tracing off".** Sentry's `hasSpansEnabled()` is `tracesSampleRate != null || !!tracesSampler`, so a literal `0` *enables* span support and then forces a negative sampling decision -- which the browser propagates outward as `sentry-trace: <id>-<id>-0`. Any backend that inherits that decision can then never sample, silently. So `sentryClient.js` **omits the key entirely** unless the mode is `spans`. `apps/dgfy-api/src/config/sentry.js` does the same with `SENTRY_TRACES_SAMPLE_RATE`. Never "just set it to 0" in either place.
2. **Header propagation does not need sampling.** `instrumentOutgoingRequests()` is called unconditionally inside `browserTracingIntegration`'s `afterAllSetup()`, outside any `hasSpansEnabled()` guard. Registering the integration is what attaches `sentry-trace`/`baggage`; sampling only decides whether *transactions* are also sent. This is why `propagate` mode delivers full frontend-to-backend error correlation at zero quota cost -- errors are never sampled out, only spans are.

`instrumentPageLoad` / `instrumentNavigation` stay enabled in `propagate` mode on purpose: they are what rotate the trace id per navigation. Disabling them would pin a single trace id to an entire tab lifetime, so a POS terminal open for a 10-hour shift would hang thousands of requests off one unusable trace.

**Backend sampling.** When `SENTRY_TRACES_SAMPLE_RATE` is set `>0`, `makeTracesSampler()` applies per-route overrides rather than a flat rate:

| Route | Rate | Why |
|---|---|---|
| `/health`, `/healthz`, `/ready`, `/metrics` | `0` | container healthcheck + Prometheus scrape; constant rate, no diagnostic value |
| `GET /api/v1/pos/incoming-orders` | `0.01` | polled every 12s per open terminal (~72k req/day across 20 terminals) |
| `OPTIONS` preflights | `0` | no diagnostic value |
| everything else | `inheritOrSampleWith(base)` | honours the browser's decision when it made one |

**Correlating a support ticket to a trace.** `requestContext` adopts an inbound `sentry-trace` id as `req.traceId`, so the `x-trace-id` response header (already CORS-exposed) equals the Sentry trace id and can be pasted straight into Sentry as `trace:<id>`. Requests with no `sentry-trace` header (cron, internal callers, curl) keep a generated UUID, so the format is deliberately mixed -- do not assume UUID shape when parsing it.

Note there is **no `trace_id` tag** on backend events. Sentry already carries the real trace id at `contexts.trace.trace_id` and indexes it as the `trace:` search; a same-named custom tag previously shadowed it in the UI with an unrelated per-request UUID. Use the `request_id` tag or `trace:<id>` search instead.

### Secret scrubbing in error text

`sanitizeSentryEvent`'s existing `redactSensitiveData` is **key-name based** -- it can only redact a secret sitting under a recognisable key. A secret pasted *inside* a message string is invisible to it, which is how an OpenAI API key once reached Sentry as an issue *title* (the `openai` SDK embeds the key it tried to use in its own 401 error text).

`redactSecretsInText` (duplicated in `apps/dgfy-api/src/config/sentry.js` and `frontend/src/observability/sentryClient.js`) now scrubs `exception.values[].value`, `message`, `logentry`, and `breadcrumbs[].message` for OpenAI keys, JWTs, bearer tokens, AWS/GitHub tokens, credentialed connection-string URLs, Sentry DSNs, and explicit `api_key=`/`secret:` assignments. `exception.type`, `.stacktrace`, `.mechanism` and `event.fingerprint` are never touched, so grouping is unaffected.

This is a backstop, not a fix: a `[redacted:*]` placeholder appearing in Sentry means a secret is reaching an error path and should be rotated. It also only prevents *future* leaks -- already-stored events must be deleted in Sentry, and an Advanced Data Scrubbing rule on `$exception.value` is worth adding server-side to catch other SDKs.

### User, tenant, and route context

Every surface now attaches, on top of the base error capture:

- **User identity** -- `identifySentryUser({id, role})` in `src/observability/sentryClient.js` sets `Sentry.setUser({id})` plus a `user_role` tag on sign-in, called from the same identity-sync flow that already feeds PostHog (`ObservabilityIdentitySync` in each app's `main.jsx`; `useStorefrontSession.js` for the storefront's customer accounts). `resetSentryIdentity()` clears it on sign-out. `sanitizeSentryEvent`'s `beforeSend` still strips `email`/`username`/`ip_address` from the `user` object -- only the opaque `id` and tags ever leave the browser.
- **Tenant/store context** -- `setSentryContext({tenantId, storeSlug, businessMode, locationId})` registers those as tags on every subsequent event, mirroring `setAnalyticsContext`'s PostHog super properties.
- **Route context** -- `setSentryRoute(pathname)` tags the current `route` and adds a navigation breadcrumb on every route change, called from the same pathname effect that already calls `capturePageview()`. This does **not** require `VITE_SENTRY_TRACES_SAMPLE_RATE > 0`.
- **Trace context** -- in `propagate` mode (the default) every event also carries `contexts.trace.trace_id`, shared with the backend event for the same request. See the distributed-tracing section above.
- **Deliberately not implemented:** route-pattern-named transactions (`Sentry.reactRouterBrowserTracingIntegration`). That integration only produces navigation spans when `<Routes>` is also wrapped with `Sentry.wrapReactRouterRouting()`, which needs the lazily-imported SDK synchronously at render time -- conflicting with this module's zero-cost-when-disabled lazy-import design. Registering the integration without the wrapper silently drops all navigation transactions, which is worse than the current plain `browserTracingIntegration()`. Revisit if/when a surface turns tracing on for real and route-pattern transaction names become worth the added mount-time complexity.

### Failed API requests as Sentry events

`captureRequestFailure` in `src/observability/sentryClient.js` promotes a request failure to a Sentry *event* (not just the breadcrumb `tagRequestFailureContext` already added), called from the trailing axios interceptor in `src/services/api.js` and from the storefront's `apps/store/src/services/requestJson.js`:

- Captures **5xx responses and network/no-response failures only**. 4xx is never captured -- those are expected validation/permission/auth outcomes (401 has its own refresh-and-retry path upstream, 422 is validation), not bugs.
- URLs are normalized before fingerprinting (`normalizeRequestUrl`) so `/api/v1/items/123` and `/api/v1/items/456` group into one issue instead of one per row.
- Throttled to 1 event per endpoint-group per 60 seconds, capped at 20 events per tab session, so a backend outage produces one grouped issue instead of burning the project's event quota.

### Verifying a DSN end to end

In a dev build (`import.meta.env.DEV`), `initBrowserSentry` registers `window.__sentryTestError()` on the page. Run it from the browser console after setting a real DSN to confirm the DSN is valid without shipping a trigger to production:

```js
window.__sentryTestError()
```

If Sentry isn't active (disabled or no DSN), it logs a warning explaining why instead of silently no-oping.

## PostHog

PostHog is also optional and disabled by default, sharing the same
"missing config never blocks startup/builds" posture as Sentry above. One
shared PostHog project across all 3 surfaces (store/pos/skupervisor),
distinguished by the `surface` event property -- unlike Sentry's
per-surface DSNs, there's no per-project quota reason to split.

```dotenv
VITE_POSTHOG_ENABLED=false
VITE_POSTHOG_HOST=
VITE_POSTHOG_KEY=
VITE_POSTHOG_ENVIRONMENT=beta
VITE_POSTHOG_SESSION_REPLAY_STORE=false
VITE_POSTHOG_SESSION_REPLAY_POS=false
```

Behavior:

- `VITE_POSTHOG_ENABLED=false` hard-disables PostHog for every surface, even if a key is present.
- Session replay defaults to **off** on every surface and is gated independently per surface -- POS is a single terminal running all day in front of customers and displaying their name/address/phone, so it needs a separate on/off switch (and stricter default masking) from the storefront's anonymous-visitor replay. See `resolveSessionReplayFlag()` in `src/observability/analyticsClient.js`.
- `VITE_POSTHOG_ENVIRONMENT` was previously missing from the CI build args, so events were tagged with Vite's `MODE` instead of the actual deploy environment -- now passed through explicitly.

## Source Maps

Source-map upload is also optional and off by default.

GitHub Environment vars:

```dotenv
SENTRY_UPLOAD_SOURCEMAPS=false
SENTRY_ORG=
SENTRY_PROJECT_SKUPERVISOR=
SENTRY_PROJECT_POS=
SENTRY_PROJECT_STORE=
SENTRY_URL=
```

GitHub Environment secret:

```dotenv
SENTRY_AUTH_TOKEN=
```

Only set `SENTRY_UPLOAD_SOURCEMAPS=true` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and all relevant `SENTRY_PROJECT_*` values are configured. The Docker build receives `SENTRY_AUTH_TOKEN` as a BuildKit secret, not as a persisted image environment variable.

## Local-Test

Run local-test from `infrastructure/docker/local-test` with the `dgfy` Docker context:

```bash
cd infrastructure/docker/local-test
docker --context dgfy compose --env-file .env.compose up -d --build
```

To test Sentry locally, add the Sentry values to `.env.compose`, then rebuild:

```dotenv
SENTRY_ENABLED=true
SENTRY_BACKEND_DSN=<backend dsn>
SENTRY_ENVIRONMENT=local-test
SENTRY_RELEASE=local-test

VITE_SENTRY_ENABLED=true
VITE_SENTRY_DSN_SKUPERVISOR=<skupervisor dsn>
VITE_SENTRY_DSN_POS=<pos dsn>
VITE_SENTRY_DSN_STORE=<store dsn>
VITE_SENTRY_ENVIRONMENT=local-test
VITE_SENTRY_RELEASE=local-test
```

Leave `SENTRY_UPLOAD_SOURCEMAPS=false` for ordinary local-test runs.

## GitHub Environment Checklist

Four GitHub Environments exist and build/deploy on every push to their branch:
`DEV` (`develop` → `dev.dgfy.ph`), `STAGING` (`staging` → `stage.dgfy.ph`), `BETA`
(`main` → `beta.dgfy.ph`), `PROD` (`main` → `dgfy.ph`). The `VITE_SENTRY_ENVIRONMENT`
value each one actually uses is the environment name itself, uppercase — `DEV`,
`STAGING`, `BETA`, `PROD` — matching what STAGING and PROD already have configured
live. (Earlier revisions of this doc suggested lowercase names like `beta` or
`local-test` for GitHub Environment builds; those don't match what's actually set.
`local-test` is still correct for the local-test compose file below, which is a
separate, unrelated environment name.)

As of 2026-08-03, **DEV**, **STAGING** and **PROD** all have `VITE_SENTRY_*`/`SENTRY_*`
vars configured and are reporting. **`dgfy-skupervisor` is wired on all three** —
`VITE_SENTRY_DSN_SKUPERVISOR`/`SENTRY_PROJECT_SKUPERVISOR` were previously unset
everywhere (#168); the SPA now uploads sourcemaps and reports on every environment
that builds. **BETA has none set** — it still reports nothing from any surface.

Before DEV was turned on, each project's default "high priority issues" alert rule
(Settings → Alerts) was scoped from `environment: null` (fires on every environment)
to `environment: PROD` — otherwise every DEV error would notify the same as a PROD
one. Do this **before** enabling Sentry on any new non-PROD environment:

| Project | Rule |
|---|---|
| `dgfy-backend` | https://ch-temp.sentry.io/monitors/alerts/679720/ |
| `dgfy-pos` | https://ch-temp.sentry.io/monitors/alerts/722360/ |
| `dgfy-store` | https://ch-temp.sentry.io/monitors/alerts/722361/ |
| `dgfy-skupervisor` | https://ch-temp.sentry.io/monitors/alerts/736596/ |

The dev box's own `.env` also has `SENTRY_ENVIRONMENT=DEV` set explicitly. Note this
is no longer strictly required to avoid PROD pollution — after the
`resolveSentryEnvironment` fix above, an omitted value resolves to `"unknown"`, not
`"production"` — but an explicit value is still correct so DEV events are actually
filterable as DEV rather than landing under a visibly-wrong placeholder.

For any environment's frontend image build (DEV/STAGING/BETA/PROD share the same
`deploy-frontend.yml` build-args block — see workflow source, not per-environment
duplication), set:

- `VITE_SENTRY_ENABLED`
- `VITE_SENTRY_DSN_SKUPERVISOR`
- `VITE_SENTRY_DSN_POS`
- `VITE_SENTRY_DSN_STORE`
- `VITE_SENTRY_ENVIRONMENT`
- `VITE_SENTRY_TRACES_SAMPLE_RATE`
- `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- `VITE_SENTRY_TRACE_PROPAGATION_TARGETS`
- `VITE_POSTHOG_ENABLED`
- `VITE_POSTHOG_HOST`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_ENVIRONMENT`
- `VITE_POSTHOG_SESSION_REPLAY_STORE`
- `VITE_POSTHOG_SESSION_REPLAY_POS`
- `SENTRY_UPLOAD_SOURCEMAPS`
- `SENTRY_ORG`
- `SENTRY_PROJECT_SKUPERVISOR`
- `SENTRY_PROJECT_POS`
- `SENTRY_PROJECT_STORE`
- `SENTRY_URL` only for self-hosted Sentry

Set this GitHub secret only if uploading source maps:

- `SENTRY_AUTH_TOKEN`

For server runtime, update the target server Docker `.env` with `SENTRY_ENABLED`, the backend DSN, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and `SENTRY_DEBUG`, then restart the stack.
