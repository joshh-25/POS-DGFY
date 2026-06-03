# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-06-02

## Current Release State

1. Last deployed release evidence remains the May 2026 production release tracked in `docs/testing/pos-readiness-status.md`.
2. June 2, 2026 audit state: dependency vulnerabilities are resolved and the dependency audit commands below return zero current npm advisories for locked root/backend/frontend trees.
3. The local release gate now includes dependency audits before docs, architecture, compliance, backend, frontend, and budget gates.
4. Current open audit package: `System_Audit/README.md`.
5. Current release blockers from the June 2 audit remain open until remediated: local release gate failures, frontend contract suite failures, missing current green backend full-test evidence, and frontend budget artifact self-containment.
6. Production deployment status must not be advanced from this checklist alone; refresh no-staging parity, local release gate, production contract smoke, and human UAT evidence before the next production promotion.

Use `docs/testing/pos-readiness-status.md` as canonical source-of-truth for readiness status and blockers.

## Must-Pass Technical Gates

1. `npm run audit:dependencies:prod`
2. `npm run audit:dependencies`
3. `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
4. `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
5. `npm run gate:release:local`
6. `npm run gate:release:no-staging:qa-env` or the dot-sourced `.env.qa.local` / `.env.qa.secrets.local` wrapper documented in `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
7. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`
8. `npm run gate:release:prod-contracts:env` or an equivalent exported production contract environment
9. `npm run audit:location-stock-parity`
10. `npm run audit:fifo-drift`
11. `npm run audit:tenant-index-headroom -- --redundant-groups-threshold=0`

## Latest Technical Evidence (2026-06-03)

1. `npm run audit:dependencies:prod` -> PASS with zero current npm advisories.
2. `npm run audit:dependencies` -> PASS with zero current npm advisories.
3. `npm run lint:docs` -> PASS during the June docs/audit refresh.
4. `npm run check:architecture` -> PASS during the June docs/audit refresh.
5. `npm run check:compliance` -> PASS during the June docs/audit refresh.
6. `System_Audit/README.md` records the remaining open audit findings and remediation order.
7. `npm --prefix backend test -- --runTestsByPath tests/rtr_verification.test.js` -> PASS for cookie-only refresh authority, CSRF enforcement, cookie rotation, and replay rejection.
8. `npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/token_refresh_race.test.js` -> PASS for adjacent auth refresh contracts.
9. `npm --prefix frontend run lint` -> PASS with zero warnings after storefront cleanup.
10. `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx` -> PASS.
11. `npm --prefix frontend run build:store` -> PASS.
12. Previous production deploy, no-staging parity, and public smoke evidence remain historical May release evidence; refresh them before claiming a new deployable release target.

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
