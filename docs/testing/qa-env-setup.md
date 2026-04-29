# QA Environment Setup (Local Secret Storage)

Status: reference
Last updated: 2026-04-30

## Where Secrets Are Stored

1. Base file: `.env.qa.local` at repo root (non-secret defaults).
2. Secret overlay: `.env.qa.secrets.local` at repo root (sensitive values).
3. Both files are git-ignored.
4. Templates:
   - `.env.qa.local.example`
   - `.env.qa.secrets.local.example`

## Required Secrets/Inputs

1. `QA_BASE_URL`
2. `QA_COMPANY_TOKEN` (active tenant token; do not use stale legacy fallback values)
3. `QA_EMAIL` and `QA_PASSWORD` (or `QA_AUTH_JWT`)
4. `QA_SSH_HOST`

Recommended:
1. `QA_SSH_PORT`
2. `QA_SSH_USER`
3. `QA_APP_DIR`

## One-Time Setup

1. Copy the template:
   - `Copy-Item .env.qa.local.example .env.qa.local`
2. Copy secrets template:
   - `Copy-Item .env.qa.secrets.local.example .env.qa.secrets.local`
3. Put `QA_COMPANY_TOKEN` and optional `QA_AUTH_JWT` in `.env.qa.secrets.local`.

## Run Release Gate With Local Secrets

1. `npm run gate:release:no-staging:qa-env`

This command:
1. Loads `.env.qa.local` into process env.
2. Loads `.env.qa.secrets.local` into process env (if present).
3. Executes `npm run gate:release:no-staging`.

## Verify Verdict Artifact

1. `node scripts/verify-release-verdict.js --file .tmp/release-gates/<your_sha>/release_verdict.json --sha <your_sha>`

Get current SHA:
1. `git rev-parse HEAD`

## Notes

1. No production code or prod environment changes are required for this setup.
2. Remote QA checks still require reachable QA infrastructure and valid credentials.
3. You can run a local-only readiness gate (without QA SSH/API dependencies) via:
   - `npm run gate:release:local`
