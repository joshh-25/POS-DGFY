# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-06-05

## Current Release State

1. Latest production deployment evidence for the tenant session reload and MapLibre picker hardening is code target SHA `4f6eecd1778ae139e634d23821369f40f22dd5d0`, deployed on June 5, 2026 with health checks, frontend asset parity, and tenant-store asset integrity passing. A Storefront discovery pin-placement/cache hardening fix is in progress after that deployment and must not be treated as live until a new deployed SHA and production smoke are recorded.
2. June 2, 2026 audit state: dependency vulnerabilities are resolved and the dependency audit commands below return zero current npm advisories for locked root/backend/frontend trees.
3. The local release gate now includes dependency audits and a focused frontend contract gate before docs, architecture, compliance, backend, frontend, and budget gates.
4. Current open audit package: `System_Audit/README.md`.
5. Current release blockers from the June 2 audit remain open until remediated. Local release gate, frontend contract suite failures, missing current green backend full-test evidence, and frontend budget artifact self-containment are remediated as of June 4, 2026 for target SHA `be59a6b55f4d6367acd124729b43fa4ee579d09b`.
6. Production deployment status must not be advanced from this checklist alone; refresh no-staging parity, local release gate, production contract smoke, and human UAT evidence before the next production promotion.
7. June 5, 2026 tenant browser-session hardening is live at code SHA `4f6eecd1778ae139e634d23821369f40f22dd5d0`: `/api/v1/auth/refresh-token` can recover strict tenant context from the signed HttpOnly refresh cookie's tenant binding when the companion tenant-context cookie/header is missing, and login/refresh responses include `data.company.token` so the frontend can rehydrate both access and tenant context after hard reload.

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

## Latest Technical Evidence (2026-06-05)

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
19. `node --test scripts/check-frontend-budgets.test.js` -> PASS on June 4, 2026 with 4 tests for prebuilt freshness, missing multi-app assets, stale route chunks, and report persistence.
20. `npm run check:frontend-budgets` -> PASS on June 4, 2026 after the gate executed `npm --prefix frontend run build:all`, validated fresh multi-app chunks, and wrote `.tmp/frontend-budgets/frontend_budget_report.json`.
21. `npm run gate:release:local` -> attempted on June 4, 2026 after frontend budget hardening, but the tool run timed out after 20 minutes during `backend.test_matrix`; no current-SHA `local_readiness.json` was produced by that attempt.
22. `npm --prefix backend test -- --runTestsByPath tests/itemHandlers.transport.test.js` -> PASS on June 4, 2026 with 7 tests after updating stale inventory transport mocks for storefront gallery use-case exports.
23. `npm run gate:release:local` -> PASS on June 4, 2026 for target SHA `be59a6b55f4d6367acd124729b43fa4ee579d09b`; artifact `.tmp/release-gates/be59a6b55f4d6367acd124729b43fa4ee579d09b/local_readiness.json` records 15 passing gates and the release-owned budget report path `.tmp/release-gates/be59a6b55f4d6367acd124729b43fa4ee579d09b/frontend-budgets/frontend_budget_report.json`.
24. `npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js tests/dgfyTenantSession.transport.test.js tests/browserSessionCookies.test.js` -> PASS on June 5, 2026 after adding refresh-cookie tenant-context recovery for fresh DGFY-to-SKUpervisor browser sessions.
25. `npm --prefix frontend test -- --run src/services/__tests__/api.interceptor.test.js` -> PASS on June 5, 2026 with 11 tests after protected frontend API calls learned to preflight cookie-backed session refresh when memory has no access token after browser reload.
26. `npm --prefix backend test -- --runTestsByPath tests/auth.test.js` -> PASS on June 5, 2026 with 12 tests after login and refresh responses returned `data.company.token` with the normal tenant access payload.
27. `npm --prefix frontend test -- --run src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx` -> PASS on June 5, 2026 with 4 tests after the shared IMS MapLibre picker moved to the inline raster style contract and preserved coordinate fallback behavior during tile-resource failures.
28. `npm --prefix frontend test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx` -> PASS on June 5, 2026 with 26 tests proving onboarding and Settings still wire the shared MapLibre picker into location forms.
29. Production deployment on June 5, 2026 deployed code target SHA `4f6eecd1778ae139e634d23821369f40f22dd5d0`; production deploy summary reported backend health, IMS, POS, Store, and Tenant Store public endpoints passed, tenant-store asset integrity passed, and frontend asset parity passed.
30. `npm --prefix backend test -- cachePolicy.middleware.test.js cachePolicy.routeContracts.test.js` -> PASS on June 5, 2026 after tenant-scoped Storefront read-cache responses added `Vary: X-Store-Slug` coverage for cached catalog/location/tracking reads.
31. `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryPresentation.test.js apps/store/src/__tests__/discoveryMapDom.test.js` -> PASS on June 5, 2026 with 33 tests after Storefront discovery map pins were hardened to keep indexed discovery coordinates authoritative when `/store/locations` enrichment is stale or cache-reused.
32. `npm --prefix frontend run build:store` -> PASS on June 5, 2026 after Storefront discovery pin-placement hardening.
33. `npm run check:frontend-budgets` -> PASS on June 5, 2026 after the gate rebuilt all frontend apps and preserved the existing lazy MapLibre chunk warning-only posture.

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
