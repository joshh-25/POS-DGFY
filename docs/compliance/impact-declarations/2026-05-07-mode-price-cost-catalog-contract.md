---
status: reference
owner: engineering
last_reviewed: 2026-05-07
related_adr: 0010-weighted-average-cost-valuation-and-variance-analytics.md,0016-services-mode-independent-booking-and-ticketing.md,0017-customer-access-modes-and-inventory-display.md,0019-food-and-beverage-mode-full-service-restaurant.md
declaration_id: 2026-05-07-mode-price-cost-catalog-contract
classification: major
surfaces: pos,terminal,storefront,inventory,reports,compliance
reason_codes_impacted: MISSING_PRICE,SALE_PRICE_MISSING,STOCK_EXEMPT_SERVICE,STORE_CATALOG_PRICE_REQUIRED
policy_version: 2026.05.07
verification_evidence: npm_run_lint_docs,npm_run_check_architecture,targeted_backend_frontend_tests,git_diff_check
rollback_note: Revert the mode price/cost contract commits; POS, Storefront, and Dispatch Order sale paths must still fail closed or be feature-gated before any rollback can reintroduce cost fallback.
preflight_result: no_breach
preflight_reason_code: EXPLICIT_SALE_PRICE_REQUIRED
preflight_run_at: 2026-05-07T15:49:00+08:00
preflight_request_ref: MODE-PRICE-COST-CONTRACT-2026-05-07
---

# Mode Price And Cost Catalog Contract Compliance Impact

## Compliance Impact Classification

Major.

This declaration covers the corrected-mode price/cost contract across IMS, POS, Storefront, Dispatch Orders, and inventory tracking. The change removes customer-price fallback to internal cost, blocks public Storefront visibility when a sellable row has no positive sale price, and keeps pure service rows stock-exempt in inventory tracking.

## Affected Surfaces

- IMS item create, edit, detail, card, wizard summary, POS readiness, and Storefront readiness surfaces.
- POS catalog/cart entry and barcode cart handoff.
- Storefront catalog visibility, quote, checkout, and QR-safe item payloads.
- Dispatch Order revenue line pricing.
- Dashboard, reports, valuation, stock movement, and FIFO tracking for stock-exempt service rows.

## Compliance Preconditions

1. `default_sale_price` is the only customer sale price for POS, Storefront, and Dispatch Orders.
2. `cost_per_unit`, FIFO cost, weighted-average cost, and inventory value remain internal valuation/COGS data.
3. POS and Storefront sale paths must reject missing or zero sale price instead of selling at cost.
4. Public Storefront payloads must not expose `cost_per_unit`, FIFO cost, weighted cost, raw stock, or inventory value.
5. Pure service rows identified by `category=service` or `mode_item_preset=service` must not create manual stock movements, FIFO deductions, inventory valuation, low-stock, surplus/shortage, or stock-aging entries.
6. Physical service add-ons/products, F&B ingredients, F&B packaged goods, food-manufacturing materials/products, and MSME inventory rows remain stock-bearing.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `git diff --check`
- `npm --prefix backend test -- --runTestsByPath tests/modeItemTaxonomy.contract.test.js tests/itemFinancialPolicy.test.js tests/storefrontCatalogUseCases.test.js tests/stockBearingPolicy.test.js tests/costValuationService.test.js tests/stockMovementService.serviceMode.test.js tests/modeFinancialTracking.contract.test.js tests/storeUsecases.applicationResult.test.js tests/posUsecases.applicationResult.test.js tests/dispatchOrderUsecases.applicationResult.test.js`
- `npm --prefix frontend test -- src/features/inventory/__tests__/itemFinancialPolicy.test.js src/features/inventory/__tests__/itemProductWizard.contract.test.js Components/items/__tests__/ItemCard.catalogToggles.test.jsx Components/items/__tests__/CostFinancialSection.behavior.test.jsx`
