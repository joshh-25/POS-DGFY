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

### Why the backend loads Sentry via `--import`, not a plain import

The backend is ESM (`"type": "module"` in `backend/package.json`, Node 22).
`src/config/sentry.js`'s `initSentry()` registers `expressIntegration()` and
`mysql2Integration()`, which patch those two packages' exports at *import
time* to add spans for routes/queries. If `express`/`mysql2` are imported
anywhere in the process before `Sentry.init()` runs, that patch is too late
-- the modules' exports are already bound into every file that imported
them, and Sentry's instrumentation cannot retroactively attach.

`server.js` imports ~65 application modules (including routes that
transitively import express and mysql2) before it used to call
`initSentry()`. To guarantee ordering, Sentry now loads from a dedicated
`backend/src/instrument.js`, run via Node's `--import` flag *before*
`server.js`'s own imports start evaluating:

```bash
node --import ./src/instrument.js src/server.js
```

This is wired into `npm start`, `npm run dev` (via `nodemon --exec`), and
`infrastructure/docker/backend/Dockerfile`'s `CMD`. Requires Node >=18.19
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
```

Behavior:

- `VITE_SENTRY_ENABLED=false` hard-disables browser Sentry.
- `VITE_SENTRY_ENABLED=true` plus each app DSN enables browser error capture for that built app.
- Frontend values are build-time values because the app is served as static nginx assets. Changing frontend Sentry values requires rebuilding the frontend image.
- `VITE_SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_REPLAYS_*_SAMPLE_RATE` being `>0` is what actually registers `browserTracingIntegration()` / `replayIntegration()` in `src/observability/sentryClient.js` -- a `0` rate means the integration isn't added at all, not just sampled out.
- `VITE_SENTRY_TRACE_PROPAGATION_TARGETS` is a comma-separated list of origins/URL patterns that get `sentry-trace`/`baggage` headers attached to outgoing requests, joining a frontend error to the backend trace that caused it. Leave unset to fall back to same-origin + `VITE_API_URL` (see `resolveTracePropagationTargets()`); set explicitly for the POS Electron shell, whose `backendOrigin` isn't `window.location.origin`.

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

For beta/prod image builds, set:

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
