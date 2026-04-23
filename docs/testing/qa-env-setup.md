# QA Environment Setup (Local Secret Storage)

Status: reference
Last updated: 2026-04-21

## Where Secrets Are Stored

1. Local file: `.env.qa.local` at repo root.
2. This file is git-ignored (`.gitignore` includes `.env.qa.local`).
3. Template source: `.env.qa.local.example`.

## Required Secrets/Inputs

1. `QA_BASE_URL`
2. `QA_COMPANY_TOKEN`
3. `QA_EMAIL` and `QA_PASSWORD` (or `QA_AUTH_JWT`)
4. `QA_SSH_HOST`

Recommended:
1. `QA_SSH_PORT`
2. `QA_SSH_USER`
3. `QA_APP_DIR`

## One-Time Setup

1. Copy the template:
   - `Copy-Item .env.qa.local.example .env.qa.local`
2. Edit `.env.qa.local` and replace all `replace_me` values.

## Run Release Gate With Local Secrets

1. `npm run gate:release:no-staging:qa-env`

This command:
1. Loads `.env.qa.local` into process env.
2. Executes `npm run gate:release:no-staging`.

## Verify Verdict Artifact

1. `node scripts/verify-release-verdict.js --file .tmp/release-gates/release_verdict.json --sha <your_sha>`

Get current SHA:
1. `git rev-parse HEAD`

## Notes

1. No production code or prod environment changes are required for this setup.
2. Remote QA checks still require reachable QA infrastructure and valid credentials.
3. You can run a local-only readiness gate (without QA SSH/API dependencies) via:
   - `npm run gate:release:local`
