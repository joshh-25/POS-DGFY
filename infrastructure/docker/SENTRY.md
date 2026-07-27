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
```

Behavior:

- `SENTRY_ENABLED=false` hard-disables backend Sentry, even if a DSN is present.
- `SENTRY_ENABLED=true` plus a DSN enables server-side error capture.
- If `SENTRY_ENABLED=true` but the DSN is missing, the service logs a warning and continues without Sentry.

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
```

Behavior:

- `VITE_SENTRY_ENABLED=false` hard-disables browser Sentry.
- `VITE_SENTRY_ENABLED=true` plus each app DSN enables browser error capture for that built app.
- Frontend values are build-time values because the app is served as static nginx assets. Changing frontend Sentry values requires rebuilding the frontend image.

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
- `SENTRY_UPLOAD_SOURCEMAPS`
- `SENTRY_ORG`
- `SENTRY_PROJECT_SKUPERVISOR`
- `SENTRY_PROJECT_POS`
- `SENTRY_PROJECT_STORE`
- `SENTRY_URL` only for self-hosted Sentry

Set this GitHub secret only if uploading source maps:

- `SENTRY_AUTH_TOKEN`

For server runtime, update the target server Docker `.env` with `SENTRY_ENABLED`, the backend DSN, `SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE`, then restart the stack.
