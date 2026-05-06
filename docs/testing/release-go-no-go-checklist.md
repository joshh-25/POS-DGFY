# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-05-06

## Current Release State

1. Technical gates: passing
2. Overall readiness: `in_progress` until human/ops signoffs close
3. Local PM2 production preview: healthy on `ecosystem.config.cjs` with backend, IMS, POS, and Storefront processes online
4. Production contract smoke: passing against the configured production target
5. Residual deploy evidence risk: the latest no-staging gate can pass with a non-blocking QA deploy summary SHA mismatch unless strict SHA enforcement is enabled

Use `docs/testing/pos-readiness-status.md` as canonical source-of-truth for readiness status and blockers.

## Must-Pass Technical Gates

1. `npm run gate:release:local`
2. `npm run gate:release:no-staging:qa-env` or the dot-sourced `.env.qa.local` / `.env.qa.secrets.local` wrapper documented in `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
3. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`
4. `npm run gate:release:prod-contracts:env` or an equivalent exported production contract environment
5. `npm run audit:location-stock-parity`
6. `npm run audit:fifo-drift`
7. `npm run audit:tenant-index-headroom -- --redundant-groups-threshold=0`

## Latest Technical Evidence (2026-05-06)

1. `pm2 startOrReload ecosystem.config.cjs --env production --update-env` -> PASS locally after hardened `backend/.env`.
2. `GET http://localhost:5000/health` -> PASS with production, DB connected, Redis connected/required, runtime schema healthy, schema indexes healthy, tenant pool healthy, and fail-closed token blacklist mode.
3. `GET http://localhost:5173`, `:5174`, and `:5175` -> PASS.
4. `npm run gate:release:local` -> PASS.
5. `npm run gate:release:no-staging` with QA env overlay -> PASS; current verdict includes a non-blocking QA deploy-summary SHA mismatch and should not be treated as exact-deploy proof unless strict mode is enabled.
6. `npm run gate:release:prod-contracts` with exported production values -> PASS (`12/12` checks).
7. Targeted FIFO/service/F&B backend tests -> PASS (`27` tests).
8. Targeted FIFO batch viewer frontend tests -> PASS (`6` tests).
9. `npm --prefix frontend run build:all` -> PASS; `npm run check:frontend-budgets` -> PASS with the known large `vendor-map-*` Storefront map chunk warning.

## Remaining Non-Technical Blockers (Go/No-Go)

1. Cashier/admin UAT signoff evidence completed and reviewed
2. Source-separation parity proof reviewed
3. Strict location-binding operational acceptance logged
4. Exact post-deploy summary for the committed target SHA captured after production deploy

## Evidence Artifacts

1. Local readiness artifact:
   - `.tmp/release-gates/<sha>/local_readiness.json`
2. No-staging release verdict:
   - `.tmp/release-gates/<sha>/release_verdict.json`
3. Canonical readiness tracking:
   - `docs/testing/pos-readiness-status.md`

## Historical Snapshots

Date-specific snapshots are archived under:
1. `docs/archive/testing/2026-04/`
