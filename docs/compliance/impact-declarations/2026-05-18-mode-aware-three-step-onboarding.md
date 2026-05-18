---
status: reference
owner: engineering
last_reviewed: 2026-05-18
related_adr: docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md
declaration_id: 2026-05-18-mode-aware-three-step-onboarding
classification: regulatory
surfaces: onboarding,inventory,tenant_locations,storefront_catalog,storefront_discovery,settings,compliance,pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT
policy_version: 2026.05.18
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/onboardingValidator.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingHandlers.transport.test.js tests/onboardingRoutes.contract.test.js tests/onboardingRepository.schemaCompatibility.test.js,npm --prefix frontend test -- src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx,npm run check:architecture,npm run check:compliance,npm run lint:docs,git diff --check
rollback_note: Hide the onboarding modal/banner and stop calling /api/v1/onboarding/items/bulk. Existing tenant operations continue because onboarding remains a soft reminder and created items/locations are normal tenant records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-18T00:00:00+08:00
preflight_request_ref: MODE-AWARE-THREE-STEP-ONBOARDING-2026-05-18
---

# Mode-Aware Three-Step Onboarding

## Compliance Impact Classification

Regulatory.

This declaration covers replacing the previous first-login onboarding wizard with a three-step flow that can write storefront-adjacent location data and inventory/catalog starter items. The change is compliance-sensitive because it creates customer-facing setup data, but it does not change POS receipt issuance, tax calculation, payment authorization, company registration identity checks, or compliance activation gates.

## Affected Surfaces

- Tenant master-admin onboarding now uses `brand_assets`, `primary_location`, and `bulk_items`.
- The primary location step creates or updates the active primary storefront location pin through the shared IMS MapLibre picker.
- The bulk item step creates normal tenant item records from the active workflow mode's onboarding presets.
- Starter item rows carry the saved primary `location_id` when available so optional initial stock is recorded through existing location-scoped stock movement rules.
- Optional storefront item images are uploaded separately after successful item creation.
- Completion readiness now requires store name, primary storefront location, and one active positively priced starter item. Zero stock and item image upload do not block completion.
- For corrected modes, only customer-facing onboarding presets count toward completion readiness.

## Compliance Preconditions

1. Onboarding routes remain tenant master-admin only.
2. Bulk starter item creation validates row presets against corrected workflow modes before item creation.
3. Customer-facing sale amount must come from `default_sale_price`; cost remains internal accounting data.
4. Storefront item image upload remains optional and uses the existing catalog image validation path.
5. Partial bulk save must return row-level failures so invalid rows are visible without rolling back successful rows.
6. Previously created starter rows must not be resubmitted by the onboarding UI, and duplicate row keys or generated SKU conflicts must fail as row-level errors instead of creating duplicate inventory records.
7. MapLibre pin selection must update the same latitude/longitude fields sent to the tenant-location API; the map must not introduce a separate unsaved coordinate source.
8. Storefront discovery refresh must run after location or starter item setup so public storefront state does not drift.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/onboardingValidator.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingHandlers.transport.test.js tests/onboardingRoutes.contract.test.js tests/onboardingRepository.schemaCompatibility.test.js`
- `npm --prefix frontend test -- src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`
- `git diff --check`

## No Architecture Exception Required

The change stays within the existing onboarding, inventory, tenant-location, storefront catalog, and storefront discovery boundaries. ADR 0013 and ADR 0014 are updated because the change crosses onboarding, inventory, and mode-taxonomy contracts.
