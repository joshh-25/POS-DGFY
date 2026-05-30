# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-05-21

## Current Release State

1. Technical gates: passing for commit `116247cd75600ca83e13061f8f8123f6e2e03326`
2. Overall readiness: `deployed`
3. Latest no-staging verdict: `pass`; QA deployed-head parity matched the release target SHA before production SSH deploy.
4. Production deploy status: deployed successfully on 2026-05-21 at `116247cd75`.
5. Improvement completed: the deploy wrapper fetches QA summary evidence to an absolute host path, verifies that file exists, validates the release verdict with `--require-pass true`, and blocks production SSH deploy unless the verdict is deployable.
6. Current residual risk: visual browser QA for Storefront map zoom/marker placement still requires an interactive browser pass; production endpoint, asset, reconciliation, and release-gate evidence are green.

Use `docs/testing/pos-readiness-status.md` as canonical source-of-truth for readiness status and blockers.

## Must-Pass Technical Gates

1. `npm run gate:release:local`
2. `npm run gate:release:no-staging:qa-env` or the dot-sourced `.env.qa.local` / `.env.qa.secrets.local` wrapper documented in `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
3. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`
4. `npm run gate:release:prod-contracts:env` or an equivalent exported production contract environment
5. `npm run audit:location-stock-parity`
6. `npm run audit:fifo-drift`
7. `npm run audit:tenant-index-headroom -- --redundant-groups-threshold=0`

## Latest Technical Evidence (2026-05-21)

1. No-staging release preflight -> PASS for `116247cd75600ca83e13061f8f8123f6e2e03326`.
2. `npm run lint:docs` -> PASS during release gate and production deploy.
3. `npm run check:architecture` -> PASS during release gate and production deploy.
4. QA multi-location smoke -> PASS (`12/12` checks).
5. QA rollback drill -> PASS.
6. QA restore drill -> PASS.
7. QA deployed-head parity -> PASS (`deployed_head=116247cd75600ca83e13061f8f8123f6e2e03326`).
8. Production deploy -> PASS at commit `116247cd75`; backend, IMS, POS, Storefront, and Tenant Store health checks passed.
9. Tenant Store asset integrity and frontend asset parity -> PASS for public endpoints.
10. Storefront discovery reconciliation -> PASS with `status=healthy`, `upserted=8`, `removed=2`, `failed=0`.
11. Public smoke -> PASS for `https://dgfy.ph/tenant-store` (`200`) and Storefront discovery search `aircon` (`success=true`, matched `A/C Innovative Solutions`).

## Remaining Non-Technical Blockers (Go/No-Go)

1. Cashier/admin UAT signoff evidence completed and reviewed
2. Source-separation parity proof reviewed
3. Strict location-binding operational acceptance logged
4. Visual browser QA evidence for Storefront marker placement across zoom levels and touch/desktop interactions captured

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
