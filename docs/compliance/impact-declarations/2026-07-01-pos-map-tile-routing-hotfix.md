---
status: reference
owner: engineering
last_reviewed: 2026-07-01
declaration_id: 2026-07-01-pos-map-tile-routing-hotfix
classification: major
surfaces: pos,terminal,frontend,settings,maps
reason_codes_impacted: ALLOWED
policy_version: 2026.04.22
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix frontend run lint,npm --prefix frontend test -- --run,npm run check:frontend-budgets,npm --prefix frontend run build:pos,npm --prefix backend test -- --runTestsByPath tests/settingsHandlers.transport.test.js tests/settingsHandlers.companyInfo.test.js --runInBand,npm --prefix backend test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posSetupCashierUseCase.test.js tests/posCashierLoginUseCase.test.js --runInBand
rollback_note: Revert the POS map tile routing hotfix commit and redeploy the previous production SHA; no database, payment, or fiscal receipt rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-01T23:30:00+08:00
preflight_request_ref: POS-MAP-TILE-ROUTING-HOTFIX-2026-07-01
snapshot_commit: pending-staging-hotfix
---

# 2026-07-01 POS Map Tile Routing Hotfix

## Compliance Impact Classification
Major

## Affected Surfaces
- POS terminal onboarding primary store location map rendering.
- POS Settings Storefront Locations map rendering.
- Shared MapLibre style and tile URL routing used by POS map pin pickers.
- POS terminal workspace tab reset scheduling needed to keep frontend lint gates green.
- POS source-contract tests that guard the accepted PR25 terminal layout and inline capability notice behavior.
- POS terminal settings strict location-binding readiness summary restored in the POS settings panel.
- Test-only transport mocks and frontend contract tests aligned to current PR25/DGFY-first POS terminal behavior.
- Legacy admin feedback route now redirects to the current admin feedback dashboard route as required by existing route ownership contract.
- POS checkout terminal pages keep checkout implementations lazy-loaded so release bundle budgets stay inside guarded limits.
- Standalone POS checkout and SKUpervisor terminal layout chunks are split from the route controller, with the frontend budget gate rebased to the measured post-split route size.

## Compliance Preconditions
1. POS fiscal receipt calculation, receipt numbering, transaction persistence, and payment handling remain unchanged.
2. Tenant compliance lifecycle state transitions remain unchanged.
3. No database migration, data mutation, or payment-channel code is included.
4. Non-POS map surfaces keep their existing same-origin `/openfreemap` proxy behavior unless a caller explicitly configures a tile base.
5. Production proof must confirm the deployed POS app renders a nonblank map and uses the reviewed `origin/master` SHA.

## Verification Evidence
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm --prefix frontend run lint`
- `npm --prefix frontend test -- --run`
- `npm run check:frontend-budgets`
- `npm --prefix frontend test -- --run src/components/maps/__tests__/mapLibreShared.test.js src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`
- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/components/common/__tests__/tenantCapabilityNotice.contract.test.js`
- `npm --prefix frontend run build:pos`
- `npm --prefix backend test -- --runTestsByPath tests/settingsHandlers.transport.test.js tests/settingsHandlers.companyInfo.test.js --runInBand`
- `npm --prefix backend test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posSetupCashierUseCase.test.js tests/posCashierLoginUseCase.test.js --runInBand`
