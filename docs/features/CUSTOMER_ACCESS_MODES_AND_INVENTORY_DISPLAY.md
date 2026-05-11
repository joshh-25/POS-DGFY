---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-05-08
applies_to: customer_access_modes_and_storefront_inventory_display
topic: customer_access_modes_inventory_display
---

# Customer Access Modes And Inventory Display

## Summary
Customer Access Mode replaces the old merchant-facing "Visibility Mode" wording with a capability contract: what customers can see and do after finding a business. Inventory Display is a separate Storefront control for how much stock information customers can see. Item-level `Show in Storefront` is a third control: it determines whether an individual item is included in the customer-facing catalog when the tenant's effective Customer Access Mode allows catalog browsing.

This contract is implemented behind the backend rollout flag `CUSTOMER_ACCESS_MODES_ENABLED`. With the flag off, public storefront behavior remains transaction-capable for compatibility while onboarding and Settings can store the new mode settings. A controlled tenant rollout can be enabled with `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` while the global flag remains false. With either rollout path enabled for a tenant, public Storefront APIs enforce the effective Customer Access Mode.

Authoritative docs used for this plan:

- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
- `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`

## Mode Definitions
Use the internal v1 codes already understood by the onboarding classifier, but never show the old names in merchant UI.

| Code | Merchant label | Public behavior |
|---|---|---|
| `ghost` | Map Listing Only | Discovery/profile only. Show business name, category, location, and contact. Hide catalog, prices, cart, booking, quote, and checkout. |
| `catalog` | Catalog Only | Show catalog/menu/services, photos, prices, and inventory presentation. Hide cart, booking, quote, and checkout. |
| `inquiry` | Inquiry Mode | Show catalog plus contact calls to action. V1 uses phone/email/social links only; no stored lead inbox is introduced. |
| `transaction` | Online Ordering Mode | Enable order, booking, quote, checkout, and payment options when compliance/payment readiness allows. |

Inventory Display is independent:

| Code | Customer-facing output |
|---|---|
| `hidden` | Hide inventory labels entirely. |
| `availability` | Show availability status only. This is the default for existing tenants. |
| `low_stock` | Show status plus low-stock copy such as `Only 3 left` under a tenant-configured threshold. |
| `exact_quantity` | Show exact quantity only after explicit tenant selection. |

Inventory Display is presentation-only. It never changes the backend inventory accounting path. For stock-bearing items, Storefront and POS checkout still use the paired location-stock and FIFO-batch contract: the selected fulfillment/operating location provides the stock ledger row, and FIFO batch rows at that location provide the cost, age, expiry, and depletion order. This applies across all workflow modes that expose stock-bearing items, including mixed Services Mode catalogs. Truly service-only rows remain stock-exempt because there is no physical batch to deplete.

## Implemented Integration
1. Backend domain and settings
- Shared policy helpers live in `backend/src/modules/shared/utils/customerAccessPolicy.js`.
- Tenant-local settings are persisted in `system_settings`: `customer_access_mode`, `inventory_display_mode`, and `inventory_low_stock_display_threshold`.
- Existing and newly provisioned tenants default to `customer_access_mode=catalog`, `inventory_display_mode=availability`, and low-stock threshold `5`.
- Settings validation and normalization accept the new keys through the modular Settings flow. Controllers remain transport-only. Bulk Settings saves compare incoming keys with persisted values before compliance preflight, so unchanged fiscal POS fields included by the full Settings form do not block unrelated Storefront/profile/system changes for non-compliant tenants.
- Settings, onboarding classifier saves, tenant location changes, and storefront asset changes refresh the discovery index after successful use-case results so public search/profile rows do not carry stale access-mode or location data.

2. Onboarding
- The onboarding classifier UI uses Customer Access Mode copy.
- The `business_classification` step stores both new settings and the legacy-compatible `online_visibility.mode`/`visibility_mode` alias.
- Inventory Display selection is captured during onboarding with default `availability`.
- Keep onboarding completion gates unchanged: onboarding remains a soft reminder and does not block IMS/POS access.

3. Settings
- The Storefront tab exposes `#storefront-access-settings` for Customer Access Mode and Inventory Display.
- The section shows requested mode, effective mode, max allowed mode, limitation copy, and backend rollout-flag guidance.
- Modes above the declared onboarding registration stage are disabled in normal tenant UI; backend runtime still enforces public actions.
- Item-level storefront catalog controls live on inventory item setup surfaces, not Settings. Settings controls whether the Storefront can browse/order overall; `Show in Storefront` controls one item.

4. Storefront public APIs
- Discovery/profile/catalog responses include additive access metadata. The landlord discovery index materializes `customer_access_mode`, `effective_customer_access_mode`, `inventory_display_mode`, `access_capabilities`, limitation metadata, and the rollout-enabled state so discovery cards can suppress Order Now without a tenant DB fanout.
- For `ghost`, discovery/profile still work, item-search snapshots are suppressed during discovery indexing, and `/store/catalog` returns no public items when the rollout flag is enabled.
- For `catalog` and `inquiry`, `/store/catalog` returns public rows but quote/checkout/booking mutations fail closed when the rollout flag is enabled.
- For `transaction`, quote/checkout/booking remain available subject to existing location, stock, compliance, and payment gates.
- Public product catalog payloads continue to omit `current_stock` and `cost_per_unit`; `default_sale_price` is the customer price and `inventory_display.display_quantity` is the only public quantity field.
- `/store/catalog` item membership and checkout item eligibility use `storefront_catalog_overrides.storefront_visible`. `pos_catalog_overrides.pos_visible` remains POS-only after backfill, with a temporary missing-table fallback for additive rollout safety.
- Storefront catalog images use `storefront_catalog_overrides.storefront_image_url`. POS menu images remain independent and are used only when the Storefront override table itself is unavailable during rollout compatibility fallback.
- When the Storefront override table exists but an individual item has no Storefront override row, public Storefront reads use the Storefront default policy rather than inheriting POS state. For products, finished goods default visible and non-finished goods default hidden; services follow service storefront metadata.
- POS and Storefront image replacement is visibility-preserving and failure-aware: upload stores the new file, commits the override update, then removes the old file. A failed override update cleans up the newly stored file and leaves the old image path intact.

5. Storefront UI
- Map Listing Only: shows map/profile/contact and hides catalog, cart, quote, checkout, booking, and Order Now.
- Catalog Only: shows catalog browse UI and hides cart, booking, quote, checkout, and Order Now.
- Inquiry Mode: shows catalog plus existing contact channels and hides cart, booking, quote, and checkout.
- Online Ordering Mode: shows cart, quote, checkout, booking, tracking, and account flows as currently applicable.
- Cart and quote state are cleared if the loaded profile no longer permits checkout/booking.
- Storefront rendering now lives in `frontend/apps/store/src/StorefrontApp.jsx`, with `frontend/apps/store/src/main.jsx` limited to app bootstrap and test-compatible export.
- `modePresentationRegistry.js` supplies mode-specific labels, catalog headings, search placeholders, and primary action copy for generic and services storefronts.
- `normalizeStorefrontPageModel.js` and `servicesStorefrontViewModel.js` normalize public storefront payloads before rendering service-first sections, service-family tabs, booking page content, review sections, and footer content.
- F&B storefronts can expose a reservation tab and carry menu line modifiers into checkout payloads without changing the backend customer-access enforcement rules.
- Item cards and item setup modals in inventory expose separate `Show in POS` and `Show in Storefront` controls. Uploading or removing either POS or Storefront image must not mutate either visibility flag.
- Storefront setup controls are shown only to users who can configure item Storefront state (`items:edit`). The read endpoint is intentionally edit-gated, so users without edit permission must not see disabled Storefront switches backed only by inferred defaults.
- The inventory Catalog Setup workflow covers both POS and Storefront setup. It shows mode-aware recommendations, POS readiness, missing blockers, visibility state, image state, SKU-filename bulk image previews, and bulk POS/Storefront visibility actions.
- Bulk POS visibility uses `PATCH /api/v1/pos/catalog-overrides/bulk`; enabling requires POS readiness, while disabling is allowed for incomplete rows.
- Bulk Storefront visibility uses `PATCH /api/v1/items/storefront-overrides/bulk`; enabling requires Storefront readiness and positive customer price, while disabling is allowed for incomplete rows and never mutates POS visibility.
- Bulk POS images use `POST /api/v1/pos/catalog-overrides/images/bulk` with multipart field `images`. Bulk Storefront images use `POST /api/v1/items/storefront-images/bulk` with multipart field `images`. Both match files by SKU filename stem, preserve current visibility, return per-file partial-success results, and keep POS and Storefront image assets independent.
- Visible/default-visible Storefront rows without a positive `default_sale_price` are blocked from Storefront bulk image upload. Hidden rows may store Storefront images for later setup.
- Bulk image upload parsing is intentionally lenient enough for the use cases to return per-file validation results for unsupported MIME/signature and 5 MB readiness failures instead of rejecting the whole batch at the upload middleware. The transport cap remains 50 files per request and 10 MB per uploaded temp file; catalog use cases enforce the 5 MB image policy per result row.
- Onboarding `has_sellable_item` uses POS readiness rather than the legacy item `pos_visible` column. It evaluates effective POS override/default visibility, positive sale price, active status, non-negative stock, available stock for stock-bearing rows, and service stock exemption with service metadata.

6. Inventory item detail UI
- Stock-bearing item detail views group active FIFO batches by `location_id` and show location stock, batch quantity, weighted cost, and inventory value together.
- The location filter is item-aware and resets/coerces to `All locations` when the selected location does not exist for the next item being viewed.
- "Next to use" is calculated within each location. The all-location view keeps global totals visible but does not present a single cross-location FIFO batch as the global next batch.
- Service-only rows stay stock-exempt and do not show misleading FIFO, average-cost, location-cost, on-hand value, or stock-movement controls. Mixed Services Mode transactions must represent physical add-ons, retail products, consumables, kits, or supplies as separate stock-bearing lines so those lines still use location-scoped FIFO.
- IMS item financial fields follow the mode preset: sellable services, F&B menu items, packaged beverages, food-manufacturing finished products, and MSME sellable rows show Selling Price; stock-bearing inventory rows show Cost; POS/Storefront-enabled rows require a positive Selling Price.

## Registration And Compliance Rules
Use declared onboarding registration status as the v1 merchant-stage signal, with compliance/payment state as stronger runtime evidence when available.

| Stage | Max normal mode |
|---|---|
| Informal | `catalog` |
| Partial | `inquiry` |
| Registered | `transaction` |
| Verified + payment ready | `transaction` plus online payment options |

Runtime behavior:

- The effective mode is the lower of requested mode and max normal mode unless a future platform override contract is added.
- If a tenant requests a higher mode than allowed, Storefront uses the effective mode and exposes a limitation reason for Settings/admin UX.
- Quote, checkout, booking, and payment actions return deterministic failure metadata when blocked by Customer Access Mode.
- Compliance lifecycle rules from ADR 0007 still govern fiscal output and payment capability; Customer Access Mode must not mutate compliance state.

## Test Plan
- Backend unit tests: mode normalization, rank comparison, stage-derived max mode, inventory display serialization, Settings validator coverage, legacy `visibility_mode` compatibility.
- Backend API/use-case tests: Storefront catalog hides public quantity by default, emits availability labels, strips catalog for `ghost`, blocks quote/checkout/booking for `ghost`, `catalog`, and `inquiry`.
- Backend catalog split tests: POS catalog uses `pos_visible`, Storefront catalog uses `storefront_visible`, image upload/removal preserves visibility state, row-missing Storefront overrides do not inherit POS state, sale-price readiness rejects missing public prices, image upload DB failures clean up newly stored files, and missing `storefront_catalog_overrides` falls back without `500`.
- Backend bulk setup tests: POS readiness emits `STOCK_UNAVAILABLE` for stock-bearing out-of-stock rows, stock-exempt service rows remain ready without stock, onboarding sellable-item readiness uses POS readiness, bulk POS/Storefront visibility returns per-item `updated`, `blocked`, `not_found`, or `failed` results, and bulk image uploads cover matched, unmatched, duplicate filename, unsupported MIME, oversize, blocked readiness, and failed-write cleanup paths.
- Frontend tests: onboarding labels and defaults, Settings section/deep link, Storefront CTA behavior for all four modes, cart reset when mode blocks checkout, inventory display labels, and independent POS/Storefront item-card toggles.
- Frontend inventory tests: FIFO item-detail behavior, location grouping contract, stale-filter reset on item switch, accessible selected filter state, and long location-name wrapping.
- Frontend Catalog Setup tests: recommendations, readiness blockers, visibility state, image state, Storefront controls hidden without `items:edit`, bulk action preview, and POS/Storefront image upload independence.
- Governance checks: `npm run check:architecture`, `npm run lint:docs`, and targeted backend/frontend test suites.
- Stock-bearing mode regression tests: checkout/fulfillment in every mode with physical items preserves location-scoped FIFO depletion, while truly service-only rows remain stock-exempt.

## Latest Validation Snapshot
Current implementation readiness is code/test/build ready for controlled rollout, not yet fully production-proven until tenant canary smoke evidence is captured after migrations.

Validated on 2026-05-04:
- Backend targeted suites: onboarding schema compatibility, catalog visibility, store use cases, services use cases, customer access policy, settings validator, settings handlers, storefront discovery repository, runtime schema audit.
- Frontend targeted suites: Storefront checkout rules, customer access helpers, Settings deep-link contract, onboarding modal behavior.
- Governance/build gates: `npm run lint:docs`, `npm run check:architecture`, `npm run build:store`, `npm --prefix frontend run build:skupervisor`, and `git diff --check`.

Validated on 2026-05-06 for FIFO/location stock hardening:
- Backend targeted suites: `tests/posCheckoutFnbContracts.usecase.test.js`, `tests/posUsecases.applicationResult.test.js`, and `tests/stockBearingPolicy.test.js`.
- Frontend targeted suites: `Components/items/__tests__/FIFOBatchViewer.behavior.test.jsx` and `Components/items/__tests__/FIFOBatchViewer.locationContract.test.js`.
- Frontend build gate: `npm --prefix frontend run build`.
- Governance gates: `npm run lint:docs`, `npm run check:architecture`, and `git diff --check`.

Validated on 2026-05-08 for the storefront UI merge:
- Frontend storefront suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__` passed 12 files and 55 tests, covering discovery, follow behavior, customer access helpers, checkout rules, catalog search, business-mode pins, F&B storefront source contract, mode presentation, storefront normalization, and services view-model behavior.
- Storefront build gate: `npm --prefix frontend run build:store` passed. The current store build still emits Vite's large main chunk warning after minification.
- Governance gates: `npm run lint:docs`, `npm run check:architecture`, and `git diff --check` passed.
- Browser smoke: local `/tenant-store` rendered the Storefront shell with no console errors.

Operational readiness rating after this hardening pass: **8.7/10**. Remaining risk is rollout evidence, not missing implementation: apply migrations, sync discovery, enable `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` for controlled tenant smoke, then widen only after evidence confirms no checkout/cart/booking appears for non-transaction effective modes.

Validated on 2026-05-11 for bulk Catalog Setup hardening:
- Backend targeted suites: `npm test -- --runInBand tests/posUsecases.applicationResult.test.js tests/storefrontCatalogUseCases.test.js tests/catalogVisibilityPolicy.test.js` passed 43 tests, covering POS `STOCK_UNAVAILABLE`, service stock exemption, bulk POS visibility mixed results, POS bulk image duplicate/unmatched per-file results, Storefront visibility price blockers, Storefront image preservation/cleanup, and Storefront bulk image price blockers.
- Frontend targeted suite: `npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemFinancialPolicy.test.js` passed.
- SKUpervisor build: `npm --prefix frontend run build:skupervisor` passed.
- Governance gates: `npm run check:architecture`, `npm run lint:docs`, and `git diff --check` passed.

Operational readiness rating after the bulk Catalog Setup hardening pass: **8.8/10**. Remaining risk is browser-level multipart smoke evidence against a real tenant with sample images, plus broader frontend interaction tests for the Catalog Setup modal.

## Assumptions
- Inquiry Mode v1 uses existing contact channels only. No stored lead inbox, notification workflow, or inquiry database table is included.
- Internal mode codes stay `ghost`, `catalog`, `inquiry`, and `transaction` for compatibility. UI copy uses only the new labels.
- Existing tenants default to browseable catalog behavior with availability-only stock display.
- No local source folder outside `docs/` remains as a planning source after this document is added.
