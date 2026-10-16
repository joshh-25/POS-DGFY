---
status: reference
owner: engineering
last_reviewed: 2026-10-10
declaration_id: 2026-04-24-storefront-branding-assets-settings-discovery
classification: regulatory
surfaces: settings,store,compliance,payments,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run check:architecture,npm --prefix backend test -- backend/tests/imageUploadValidation.util.test.js backend/tests/settingsStorefrontAsset.usecase.test.js backend/tests/settingsHandlers.transport.test.js backend/tests/storefrontDiscoveryRepository.test.js,npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx
rollback_note: Revert settings storefront-asset endpoints, discovery-index branding columns, and storefront UI rendering together to keep public payload/UI contract consistent.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-24T11:15:00+08:00
preflight_request_ref: STOREFRONT-BRANDING-ASSETS-2026-04-24
---

# 2026-04-24 Storefront Branding Assets (Settings + Discovery)

## Compliance Impact Classification
Regulatory

Computed classification rationale:
1. Change touches `settings` write paths and public storefront display/read payloads.
2. No compliance lifecycle mode transitions or fiscal receipt/tax contract changes are introduced.

## Affected Surfaces
- IMS Settings: storefront cover/profile media upload/remove controls.
- Public Storefront: discovery rows, tenant storefront header/media rendering.

## Compliance Preconditions
1. Existing compliance preflight and policy enforcement flows remain unchanged.
2. New media endpoints enforce storefront-branding specific mutation policy: `master admin`, `admin` role, or explicit `settings:storefront_branding_edit` micropermission.
3. No compliance or fiscal issuer metadata is altered by media updates.

## Verification Evidence
1. `npm run check:architecture`
2. `npm --prefix backend test -- backend/tests/settingsStorefrontAsset.usecase.test.js backend/tests/settingsHandlers.transport.test.js`
3. `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx`

## Amendment — 2026-10-10 — Public asset availability filtering

- Change: Storefront catalog and discovery responses now omit internal image URLs, variants, and
  gallery entries whose backing upload is no longer available. Existing external URLs remain
  unchanged, and no asset files are deleted by this read-time filter.
- Security boundary: Public payloads no longer advertise stale internal upload paths; tenant and
  authorization scope remain unchanged.
- Validation: Store repository, storefront discovery catalog-visibility, and primary-location
  integration tests cover unavailable assets and the null/empty response contract.
