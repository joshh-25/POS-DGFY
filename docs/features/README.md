# Feature Docs

When to use:
1. Feature-level behavior and constraints
2. Functional expectations for implementation/testing
3. Product behavior references by domain

## Current Feature References

1. `docs/features/IMS_POS_SALES_UX_JOURNEY.md`
- Canonical role-based journey for IMS item setup -> POS checkout -> POS history -> Sales export, including workflow-mode and POS readiness gate behavior.
2. `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`
- Canonical source-separation contract for POS in-store vs storefront online transactions across write paths, POS history, and unified sales read model.
3. `docs/features/INVENTORY_FOLDERS.md`
- Folder behavior and visibility semantics across item browsing surfaces.
4. `docs/features/NESTED_PRODUCTS.md`
- Nested product composition behavior and constraints.
5. `docs/features/TENANT_MANAGEMENT.md`
- Tenant lifecycle and management constraints, including isolation and provisioning rules.
6. `docs/features/multi-location-inventory/OPERATION_CONTRACT_MATRIX.md`
- Operational contract matrix for location-scoped stock, POS read/write safety, and phased rollout controls.
7. `docs/features/DGFY_UNIFIED_ONBOARDING_PLAN.md`
- Current implementation status and operating contract for first-login onboarding that connects DGFY storefront, DGFY POS, and SKUpervisor.
8. `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`
- Current contract for Customer Access Mode, Inventory Display, inventory POS/Storefront catalog setup, shared item-image galleries, onboarding, Settings, discovery/profile/catalog metadata, inventory display serialization, Storefront UI gating, quote/checkout blocking, and public service booking/waitlist enforcement.
9. `docs/features/SERVICES_MODE.md`
- Services Mode item taxonomy, UOM boundary, stock-exempt service rows, stock-bearing physical add-ons/supplies, and legacy-row behavior.
10. `docs/features/FOOD_AND_BEVERAGE_MODE.md`
- Food & Beverage mode restaurant workflow, item taxonomy, restaurant inventory boundary, table/check/kitchen/reservation behavior, and service-charge separation.
11. `docs/features/STOREFRONT_CURRENT_STANDING.md`
- Current storefront implementation standing for shared template registry, mode-specific presentation, exact-coordinate duplicate marker lists, MapLibre/WebGL fallback behavior, and current storefront regression/build evidence.
12. `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- Current DGFY customer account behavior for landlord-scoped customer identity, account activity, tracking/reorder/cancel/review actions, and saved delivery locations with optional exact pin coordinates.
13. `docs/proposals/MASTER_ONBOARDING_QUESTIONNAIRE_ANALYSIS.md`
- Strategic questionnaire analysis reference for advisory onboarding classification and monetization segmentation framing.
14. `docs/features/FUNDING_AND_DISCOUNT_STACKING.md`
- Code-grounded reference for how DGFY earns money per transaction, voucher/promo/affiliate/statutory-discount computation and stacking rules, and the current stacking matrix across storefront and POS.
15. `docs/features/FUNDING_AND_DISCOUNT_STACKING_STAKEHOLDER_BRIEF.md`
- Plain-language, print-ready companion to the doc above for non-engineering stakeholder/CEO/legal review — no issue numbers, ADR names, or file citations.

## Usage Notes

1. Treat this folder as feature behavior reference, not architecture authority.
2. For cross-feature decisions, reconcile with ADRs before implementation:
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
- `docs/architecture/adr/0040-weighted-average-cost-valuation-and-variance-analytics.md`
- `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md`
