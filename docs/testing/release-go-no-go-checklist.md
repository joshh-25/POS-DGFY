# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-06-03

## Current Release State

1. Last deployed release evidence remains the May 2026 production release tracked in `docs/testing/pos-readiness-status.md`.
2. June 2, 2026 audit state: dependency vulnerabilities are resolved and the dependency audit commands below return zero current npm advisories for locked root/backend/frontend trees.
3. The local release gate now includes dependency audits and a focused frontend contract gate before docs, architecture, compliance, backend, frontend, and budget gates.
4. Current open audit package: `System_Audit/README.md`.
5. Current release blockers from the June 2 audit remain open until remediated: frontend budget artifact self-containment and the other open findings listed in `System_Audit/README.md`. Local release gate, frontend contract suite failures, and missing current green backend full-test evidence are remediated as of June 3, 2026.
6. Production deployment status must not be advanced from this checklist alone; refresh no-staging parity, local release gate, production contract smoke, and human UAT evidence before the next production promotion.

Use `docs/testing/pos-readiness-status.md` as canonical source-of-truth for readiness status and blockers.

## Must-Pass Technical Gates

1. `npm run audit:dependencies:prod`
2. `npm run audit:dependencies`
3. `npm run check:production-env`
4. `npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js`
5. `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
6. `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
7. `npm run test:frontend:contracts`
8. `npm run test:frontend`
9. `npm run test:backend:matrix`
10. `npm run gate:release:local`
11. `npm run gate:release:no-staging:qa-env` or the dot-sourced `.env.qa.local` / `.env.qa.secrets.local` wrapper documented in `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
12. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`
13. `npm run gate:release:prod-contracts:env` or an equivalent exported production contract environment
14. `npm run audit:location-stock-parity`
15. `npm run audit:fifo-drift`
16. `npm run audit:tenant-index-headroom -- --redundant-groups-threshold=0`

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
12. `npm run check:production-env` -> PASS on June 3, 2026 with shared, VPS, and payment-enabled PayMongo fixture coverage.
13. `npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js` -> PASS on June 3, 2026.
14. `npm run test:frontend:contracts` -> PASS on June 3, 2026 with 10 files / 33 tests after frontend contract remediation.
15. `npm run test:frontend` -> PASS on June 3, 2026 with 92 files / 412 tests after frontend contract remediation and deterministic one-worker runner configuration.
16. `npm --prefix frontend run build:all` -> PASS on June 3, 2026 after frontend contract remediation.
17. `npm run test:backend:matrix` -> PASS on June 4, 2026 Asia/Manila for target SHA `3ee0890f8a765a552546f9977c6197a2db9e5980`; artifact `.tmp/release-gates/3ee0890f8a765a552546f9977c6197a2db9e5980/backend-test-matrix/backend_test_matrix.json` records 274 active backend test files, 9 groups, and schema preflight pass.
18. `npm run gate:release:local` -> PASS on June 4, 2026 Asia/Manila for target SHA `3ee0890f8a765a552546f9977c6197a2db9e5980`; artifact `.tmp/release-gates/3ee0890f8a765a552546f9977c6197a2db9e5980/local_readiness.json` records 15 gates passing, including `backend.test_matrix`, frontend contracts, and frontend budgets.
19. Previous production deploy, no-staging parity, and public smoke evidence remain historical May release evidence; refresh them before claiming a new deployable release target.

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
