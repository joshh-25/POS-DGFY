---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-06-03
applies_to: customer_access_modes_and_storefront_inventory_display
topic: customer_access_modes_inventory_display
---

# Customer Access Modes And Inventory Display

## Summary
Customer Access Mode replaces the old merchant-facing "Visibility Mode" wording with a capability contract: what customers can see and do after finding a business. Inventory Display is a separate Storefront control for how much stock information customers can see. Item-level `Show in Storefront` is a third control: it determines whether an individual item is included in the customer-facing catalog when the tenant's effective Customer Access Mode allows catalog browsing.

This contract is enforced by default. Public Storefront APIs use the effective Customer Access Mode from tenant settings to decide whether customers can browse catalog rows, contact the tenant, request quotes, book services, or complete checkout. `CUSTOMER_ACCESS_MODES_ENABLED=false` is now an explicit rollback switch only; when it is set, `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` may still re-enable enforcement for selected canary tenants.

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
- Settings, tenant onboarding location/item saves, tenant location changes, and storefront asset changes refresh the discovery index after successful use-case results so public search/profile rows do not carry stale access-mode, location, or starter-catalog data.

2. Onboarding
- The current first-login wizard no longer captures Customer Access Mode or Inventory Display choices.
- Legacy tenants may still have `business_classification` or `classification_snapshot` payloads; those records are backward-compatible context only.
- New tenants use the Settings > Storefront controls for Customer Access Mode and Inventory Display, with default `catalog` and `availability` behavior.
- Onboarding remains a soft reminder and does not block IMS/POS access.

3. Settings
- The Storefront tab exposes `#storefront-access-settings` for Customer Access Mode and Inventory Display.
- The section shows requested mode, effective mode, max allowed mode, limitation copy, and a runtime enforcement status sourced from `GET /settings` key `customer_access_modes_enabled`.
- `customer_access_modes_enabled` is a virtual runtime setting derived from `CUSTOMER_ACCESS_MODES_ENABLED` and tenant allowlisting. It is read-only and must not be persisted in `system_settings`.
- Modes above the declared onboarding registration stage are disabled in normal tenant UI; backend runtime still enforces public actions.
- Item-level storefront catalog controls live on inventory item setup surfaces, not Settings. Settings controls whether the Storefront can browse/order overall; `Show in Storefront` controls one item.

4. Storefront public APIs
- Discovery/profile/catalog responses include additive access metadata. The landlord discovery index materializes `customer_access_mode`, `effective_customer_access_mode`, `inventory_display_mode`, `access_capabilities`, limitation metadata, and runtime enforcement state so discovery cards can suppress Order Now without a tenant DB fanout.
- For `ghost`, discovery/profile still work, item-search snapshots are suppressed during discovery indexing, and `/store/catalog` returns no public items while enforcement is active.
- For `catalog` and `inquiry`, `/store/catalog` returns public rows but quote/checkout/booking mutations fail closed while enforcement is active.
- For `transaction`, quote/checkout/booking remain available subject to existing location, stock, compliance, and payment gates.
- Public product catalog payloads continue to omit `current_stock` and `cost_per_unit`; `default_sale_price` is the customer price and `inventory_display.display_quantity` is the only public quantity field.
- Public product quote and checkout aggregate requested quantity by stock-bearing `item_id` before stock validation. This applies across MSME/product, Food Manufacturing finished products, F&B menu or packaged rows with separate modifier lines, physical Services Mode add-ons, and future stock-bearing mode rows. Pure service rows remain stock-exempt here and use Services booking capacity/hold validation instead.
- `/store/catalog` item membership and checkout item eligibility use `storefront_catalog_overrides.storefront_visible`. `pos_catalog_overrides.pos_visible` remains POS-only after backfill, with a temporary missing-table fallback for additive rollout safety.
- Storefront catalog images use `storefront_catalog_overrides.storefront_image_url` for the primary image and `storefront_catalog_overrides.storefront_image_gallery` for ordered detail images. POS menu images remain independent and are used only when the Storefront override table itself is unavailable during rollout compatibility fallback.
- Merchant image upload supports appendable Storefront galleries: selecting multiple Storefront item images adds them after the existing ordered images. The first gallery entry is primary and is mirrored to `storefront_image_url`; item/product setup can promote another image to first position or remove one image without clearing the whole gallery. Drag-and-drop ordering is not required because explicit `Set first` covers the primary customer-facing image and per-image deletion covers cleanup.
- Onboarding `Item image` uploads use the same Storefront catalog image/gallery contract as inventory item setup. Onboarding copy is merchant-facing only; backend fields remain `storefront_image_url` and `storefront_image_gallery`.
- When the Storefront override table exists but an individual item has no Storefront override row, public Storefront reads use the Storefront default policy rather than inheriting POS state. For products, finished goods default visible and non-finished goods default hidden; services follow service storefront metadata.
- POS and Storefront image replacement is visibility-preserving and failure-aware: upload stores the new file, commits the override update, then removes the old file. A failed override update cleans up the newly stored file and leaves the old image path intact.

5. Storefront UI
- Map Listing Only: shows map/profile/contact and hides catalog, cart, quote, checkout, booking, and Order Now.
- Catalog Only: shows catalog browse UI and hides cart, booking, quote, checkout, and Order Now.
- Inquiry Mode: shows catalog plus existing contact channels and hides cart, booking, quote, and checkout.
- Online Ordering Mode: shows cart, quote, checkout, booking, tracking, and account flows as currently applicable.
- Cart and quote state are cleared if the loaded profile no longer permits checkout/booking.
- Discovery map pins use preview-first marker cards. Hover or tap opens a compact branded card with tenant cover/profile assets, tenant name, exact pinned branch, address, status, match/distance context, and an action that opens the tenant page with that pin's `location_id` selected. Click-open previews remain available when the pointer leaves the marker and dismiss with Escape. Active search results auto-open the same marker preview card with `Open storefront` for item/product matches and direct tenant/store-name matches; every active result pin receives the CSS glow/ripple treatment while search results are active. Exact-coordinate shared markers auto-open the shared storefront list first, then show the selected tenant preview card. Popup state is tied to the marker set so stale previews are removed when pins are rebuilt. The default discovery scope is `tenant_primary`, so each tenant renders its configured primary Storefront pin unless the user explicitly triggers a nearest/matching-branch search path. The public discovery row coordinate is the marker-placement source of truth; `/store/locations` enrichment may only add branch labels/routing metadata when it matches the indexed `location_id`, and tenant-scoped cached reads must vary by `X-Store-Slug`. Same-coordinate results render as one exact-coordinate shared marker with a selectable storefront list; client-side marker fanout and pixel display offsets are not part of the current contract because they make exact IMS coordinates appear displaced.
- The discovery search UI no longer exposes the older `Result Mode`, `Stock Filter`, or `Pin Scope` controls. The current client submits the API discovery contract directly with `result_mode=union`, `stock_filter=include_out_of_stock`, `pin_scope=tenant_primary`, and `include_match_meta=true`; the location icon action is titled `Use my current location` and switches to nearest-matching-branch behavior after successful geolocation.
- Storefront rendering now lives in `frontend/apps/store/src/StorefrontApp.jsx`, with `frontend/apps/store/src/main.jsx` limited to app bootstrap and test-compatible export.
- `modePresentationRegistry.js` supplies mode-specific labels, catalog headings, search placeholders, and primary action copy for generic and services storefronts.
- `normalizeStorefrontPageModel.js` and `servicesStorefrontViewModel.js` normalize public storefront payloads before rendering service-first sections, service-family tabs, booking page content, review sections, and footer content.
- F&B storefronts can expose a reservation tab and carry menu line modifiers into checkout payloads without changing the backend customer-access enforcement rules.
- Item cards and item setup modals in inventory expose separate `Show in POS` and `Show in Storefront` controls. Merchant-facing image upload copy says `Item image`; backend/API fields and services still use the Storefront catalog image contract (`storefront_catalog_overrides.storefront_image_url` plus `storefront_catalog_overrides.storefront_image_gallery`). Uploading, promoting, or removing either POS images or item images must not mutate either visibility flag.
- Item and product create/edit flows expose `Save and exit` in the footer. For new rows and existing draft rows it saves draft data and closes without finalizing; for existing active rows it saves the update and closes. `Finalize Item`, `Finalize Product`, `Create`, and `Update` remain separate actions. The footer buttons are guarded while saves are in flight to prevent duplicate submits or step navigation during a pending save.
- Storefront setup controls are shown only to users who can configure item Storefront state (`items:edit`). The read endpoint is intentionally edit-gated, so users without edit permission must not see disabled Storefront switches backed only by inferred defaults.
- The inventory Catalog Setup workflow covers both POS and Storefront setup. It shows mode-aware recommendations, POS readiness, missing blockers, visibility state, image state, SKU-filename bulk image previews, and bulk POS/Storefront visibility actions.
- Bulk POS visibility uses `PATCH /api/v1/pos/catalog-overrides/bulk`; enabling requires POS readiness, while disabling is allowed for incomplete rows.
- Bulk Storefront visibility uses `PATCH /api/v1/items/storefront-overrides/bulk`; enabling requires Storefront readiness and positive customer price, while disabling is allowed for incomplete rows and never mutates POS visibility.
- Storefront discovery reconciliation uses the same location-stock rollout fallback as the public Storefront/POS catalog reads. If an older tenant database is missing `item_location_stocks` or one of its required columns, reconciliation logs `storefront_discovery_location_stock_fallback`, keeps that tenant indexable, and derives in-stock search metadata from aggregate `items.current_stock` instead of failing the full release deploy.
- Bulk POS images use `POST /api/v1/pos/catalog-overrides/images/bulk` with multipart field `images`. Bulk Storefront images use `POST /api/v1/items/storefront-images/bulk` with multipart field `images`. Both match files by SKU filename stem, preserve current visibility, return per-file partial-success results, and keep POS and Storefront image assets independent.
- Visible/default-visible Storefront rows without a positive `default_sale_price` are blocked from Storefront bulk image upload. Hidden rows may store Storefront images for later setup.
- Single item-image and gallery uploads are strict at transport because they are all-or-nothing mutations. Bulk image upload parsing is intentionally lenient enough for the use cases to return per-file validation results for unsupported MIME, unsupported or mismatched binary signatures, duplicate SKU filenames, unmatched SKU filenames, 5 MB product-policy failures, and readiness blockers instead of rejecting the whole batch at the upload middleware. The transport cap remains 50 files per request and 6 MB per uploaded temp file; catalog use cases enforce the 5 MB image policy per result row before storage. Rejected files are removed from temp storage best-effort, and newly stored files are removed if the catalog write fails. Production ingress is expected to stay above this backend temp cap; the current Nginx `client_max_body_size=8m` leaves transport headroom without accepting images above the product policy.
- Onboarding `has_sellable_item` uses POS readiness rather than the legacy item `pos_visible` column. It evaluates effective POS override/default visibility, positive sale price, active status, non-negative stock, available stock for stock-bearing rows, and service stock exemption with service metadata.

6. Inventory item detail UI
- Stock-bearing item detail views group active FIFO batches by `location_id` and show location stock, batch quantity, weighted cost, and inventory value together.
- The location filter is item-aware and resets/coerces to `All locations` when the selected location does not exist for the next item being viewed.
- "Next to use" is calculated within each location. The all-location view keeps global totals visible but does not present a single cross-location FIFO batch as the global next batch.
- Service-only rows stay stock-exempt and do not show misleading FIFO, average-cost, location-cost, on-hand value, or stock-movement controls. Mixed Services Mode transactions must represent physical add-ons, retail products, consumables, kits, or supplies as separate stock-bearing lines so those lines still use location-scoped FIFO.
- IMS item financial fields follow the mode preset: sellable services, F&B menu items, packaged beverages, food-manufacturing finished products, and MSME sellable rows show Selling Price; stock-bearing inventory rows show Cost; POS/Storefront-enabled rows require a positive Selling Price.

7. Storefront location pins
- Settings > Storefront can add, edit, set primary, deactivate/reactivate, and permanently delete inactive tenant location pins. Active pins show deactivate as the first-line path before permanent delete is exposed.
- Permanent delete is allowed only for unused location rows with no POS transaction, terminal shift/transition/audit, inventory stock, FIFO batch, stock movement, user-location grant, service resource, provider assignment, booking, or booking-hold references. The backend keeps this as a named reference-source manifest and test coverage compares it against direct `TenantLocation` model associations, exact foreign keys, and manifest where-clauses so future location references cannot silently bypass the guard.
- Blocked permanent deletes return `409` with `reference_counts`; Settings must show the blocking categories and keep deactivate as the safe fallback instead of leaving the operator with only a failed delete toast. If the backend cannot inspect every named tenant-local reference model, permanent delete returns `503 SERVICE_UNAVAILABLE` and remains disabled until tenant schema/runtime health is restored. If a dependent row is created concurrently after the pre-delete count, database FK failure is also mapped to the same `409` conflict so permanent delete remains fail-closed.
- Successful location create, update, deactivate, reactivate, and delete actions refresh Storefront discovery so public map/profile rows do not carry stale primary-pin state.
- Business Mode selectors hide the legacy `manufacturing` alias from new choices. Existing `manufacturing` data still normalizes to `food_manufacturing`; a distinct future Manufacturing mode requires its own governed mode pass before it becomes selectable.

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
- Backend bulk setup tests: POS readiness emits `STOCK_UNAVAILABLE` for stock-bearing out-of-stock rows, stock-exempt service rows remain ready without stock, onboarding sellable-item readiness uses POS readiness, bulk POS/Storefront visibility returns per-item `updated`, `blocked`, `not_found`, or `failed` results, and bulk image uploads cover matched, unmatched, duplicate filename, unsupported MIME, MIME/signature mismatch, oversize, mixed valid/invalid batches, rejected-temp cleanup, blocked readiness, and failed-write cleanup paths.
- Frontend tests: onboarding labels and defaults, Settings section/deep link, Settings runtime enforcement status for enforced/rollback states, Storefront CTA behavior for all four modes, cart reset when mode blocks checkout, inventory display labels, guarded item/product `Save and exit` behavior, and independent POS/Storefront item-card toggles.
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

Operational readiness rating after this hardening pass: **8.7/10**. Remaining risk is rollout evidence, not missing implementation: apply migrations, sync discovery, run controlled tenant smoke, then keep `CUSTOMER_ACCESS_MODES_ENABLED=true` unless an explicit rollback is required. If rollback is required, set `CUSTOMER_ACCESS_MODES_ENABLED=false` and use `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` to re-enable enforcement for selected tenants while recovery evidence is gathered.

Validated on 2026-05-11 for bulk Catalog Setup hardening:
- Backend targeted suites: `npm test -- --runInBand tests/posUsecases.applicationResult.test.js tests/storefrontCatalogUseCases.test.js tests/catalogVisibilityPolicy.test.js` passed 43 tests, covering POS `STOCK_UNAVAILABLE`, service stock exemption, bulk POS visibility mixed results, POS bulk image duplicate/unmatched per-file results, Storefront visibility price blockers, Storefront image preservation/cleanup, and Storefront bulk image price blockers.
- Frontend targeted suite: `npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemFinancialPolicy.test.js` passed.
- SKUpervisor build: `npm --prefix frontend run build:skupervisor` passed.
- Governance gates: `npm run check:architecture`, `npm run lint:docs`, and `git diff --check` passed.

Operational readiness rating after the bulk Catalog Setup hardening pass: **8.8/10**. Remaining risk is browser-level multipart smoke evidence against a real tenant with sample images, plus broader frontend interaction tests for the Catalog Setup modal.

Validated on 2026-06-05 for bulk item-image upload contract hardening:
- Backend targeted suites: `npm --prefix backend test -- --runTestsByPath tests/imageUploadValidation.util.test.js tests/uploadConfig.contract.test.js tests/storefrontCatalogUseCases.test.js tests/posUsecases.applicationResult.test.js` passed 4 files and 53 tests, covering strict single-image/gallery transport, intentionally lenient bulk transport caps, unsupported MIME rejection, MIME/signature mismatch rejection, oversize rejection, mixed valid/invalid batch results, rejected-temp cleanup, failed-write stored-file cleanup, and POS/Storefront bulk image independence.
- Contract decision: bulk POS and Storefront item-image upload remains lenient at transport for per-file partial-success reporting, while use cases reject invalid files before image persistence. Single image and gallery uploads remain transport-strict.

Validated on 2026-05-12 for Storefront marker preview cards:
- Frontend storefront suite: `npm --prefix frontend exec vitest run apps/store/src/__tests__ --pool=threads` passed 14 files and 66 tests after the default Vitest fork pool timed out starting workers. Coverage includes marker preview models, preview-first marker routing, keyboard focus moving into the popup CTA, Escape dismissal, discovery flow, follow behavior, checkout rules, customer access helpers, and mode-specific storefront helpers.
- Targeted marker suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx` passed 14 tests.
- Storefront build gate: `npm --prefix frontend run build:store` passed with MapLibre still isolated in the existing lazy-loaded vendor chunk and marker preview styling moved into Storefront CSS classes.
- Governance gates: `npm run check:architecture`, `npm run lint:docs`, and `git diff --check` passed. Browser plugin tooling and a local Playwright binary were not available in this session, so rendered hover/tap screenshots remain the only uncollected evidence.

Operational readiness rating after the marker preview remediation pass: **9.6/10**. Remaining risk is browser-device smoke evidence for real touch hardware and production tile/network behavior; no known implementation gap blocks release.

Validated on 2026-05-21 for Storefront exact-coordinate marker behavior:
- Frontend Storefront targeted suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryPresentation.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx` passed locally. Coverage includes tenant-primary pin scoping before search, no-op duplicate-coordinate display offsets, exact shared-coordinate cluster placement, marker preview models, preview-first marker routing, keyboard focus moving into the popup CTA, Escape dismissal, discovery flow, follow behavior, checkout rules, customer access helpers, and mode-specific storefront helpers.
- Storefront build gate: `npm --prefix frontend run build:store` passed.
- Backend Storefront discovery index suite: `npm --prefix backend test -- --runInBand tests/storefrontDiscoveryIndexService.catalogVisibility.test.js` passed after the reconciliation fallback for stale `item_location_stocks` tenant schemas was added.
- Production release gate and deploy: `bash scripts/deploy-remote.sh --yes` passed for commit `116247cd75600ca83e13061f8f8123f6e2e03326`. The no-staging gate validated QA deployed-head parity, docs lint, architecture checks, QA multi-location smoke, rollback drill, and restore drill before production SSH deploy.
- Production deploy evidence: backend, IMS, POS, Storefront, and Tenant Store health checks passed; Tenant Store asset integrity and frontend asset parity passed; Storefront discovery reconciliation completed `status=healthy`, `upserted=8`, `removed=2`, `failed=0`; public `https://dgfy.ph/tenant-store` returned `200`.
- Live discovery smoke for `aircon` returned `A/C Innovative Solutions` with its indexed primary Storefront coordinate `10.7001938, 122.5623094`.

Operational readiness rating after the exact-coordinate marker production deploy: **9.0/10** production validated. Remaining risk is visual browser confirmation across zoom levels and touch devices; source-level coordinate, index reconciliation, deploy-gate, API, and public endpoint evidence is in place.

Validated on 2026-05-13 for Business Mode selector cleanup, tenant-location permanent delete, and Storefront aggregate stock validation:
- Frontend targeted suites: `npm exec vitest run src/pages/__tests__/Settings.deepLinking.integration.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/features/settings/__tests__/workflowMode.services.test.js` passed 3 files and 26 tests. Coverage includes hidden legacy `manufacturing` selector choices, Settings reset controlled-input stability, inactive-pin delete UI, permanent-delete blocker display, terminal active-location assignment, and registration/admin selector parity.
- Backend tenant-location suites: `npm --prefix backend test -- --runInBand tests/tenantLocationUsecases.applicationResult.test.js tests/tenantLocationReferenceSources.coverage.test.js tests/tenantLocationRepository.referenceGuard.test.js tests/workflowModes.crossLayer.contract.test.js` passed 4 files and 20 tests. Coverage includes unused-pin permanent delete, operational-reference `409` blockers, FK-race conflict mapping, tenant-reference guard `503` fail-closed behavior, manifest association/foreign-key coverage, and cross-layer workflow-mode alignment.
- Backend Storefront suite: `npm --prefix backend test -- --runInBand tests/storeUsecases.applicationResult.test.js` passed 33 tests, including duplicate-line aggregate stock validation for Storefront quote/checkout.
- Rendered smoke: local SKUpervisor Vite served `/settings?tab=locations` and unauthenticated routing landed on the login screen as expected; the authenticated Settings delete flow remains covered by component/integration tests.
- Governance/build gates: `npm run check:architecture`, `npm run lint:docs`, `git diff --check`, `npm --prefix frontend run build:skupervisor`, and `npm --prefix frontend run build:store` passed.

Operational readiness rating after this pass: **8.8/10** for controlled rollout. Remaining risk is live tenant/browser evidence for an authenticated Settings permanent-delete walkthrough and live MySQL concurrency proof; no known source-level implementation gap blocks review.

Validated on 2026-05-15 for default-on Customer Access enforcement and Settings runtime status:
- Backend targeted suites: `npm --prefix backend test -- --runInBand tests/settingsUsecases.applicationResult.test.js tests/settingsHandlers.transport.test.js tests/customerAccessPolicy.test.js tests/storeUsecases.applicationResult.test.js tests/servicesMode.usecases.test.js` passed 5 files and 86 tests. Coverage includes Settings virtual runtime status, transport tenant context propagation, default-on policy behavior, rollback allowlisting, Storefront quote/checkout blocking, and Services Mode booking/waitlist blocking.
- Frontend Settings suite: `npm exec vitest run src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads` from `frontend/` passed 16 tests. Coverage includes rendered IMS Settings runtime status for enforced and rollback states.
- Frontend Storefront helper suites: `npm exec vitest run apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/checkoutRules.test.js --pool=threads` from `frontend/` passed 7 tests.
- Governance gates: `npm run lint:docs`, `npm run check:architecture`, `npm run check:compliance`, and `git diff --check` passed.

Operational readiness rating after this pass: **8.9/10**. Source-level implementation, docs, and targeted tests are ready for production deploy. Remaining risk is live production environment confirmation that `CUSTOMER_ACCESS_MODES_ENABLED` is not intentionally set to `false`, plus post-deploy tenant smoke for the public Storefront and IMS Settings runtime-status display.

Validated on 2026-05-15 for the merged Storefront pilot UI and discovery test refresh:
- Merge/runtime commits integrated the current Storefront discovery/follow contracts into `master` while preserving newer master functionality.
- Frontend Storefront suites: `npm --prefix frontend test -- apps/store/src/__tests__/discoveryPresentation.test.js apps/store/src/__tests__/storefrontFollow.integration.test.jsx apps/store/src/__tests__/discoveryFlow.integration.test.jsx` passed 3 files and 25 tests. Coverage includes current explicit search submission, default discovery query parameters, profile/cover branding fallbacks, marker preview routing, follow behavior, and discovery presentation helpers.
- Storefront build gate: `npm --prefix frontend run build:store` passed.
- Cleanup check: `git diff --check` passed.

Operational readiness rating after this merge/test refresh: **9.0/10** locally validated. Remaining risk is production deploy evidence and live browser smoke for the merged Storefront shell, IMS Settings branding upload path, and public tenant-store branding render.

Validated on 2026-05-21 for the Storefront pilot pin-glow adoption:
- The adopted runtime slice was selected by intent from `codex/storefront-merged-pilot` rather than merged wholesale, so PayMongo implementation files and older branch defaults were excluded.
- Storefront discovery keeps normal loads on `pin_scope=tenant_primary`; the Near Me action updates the request-local scope to `nearest_matching_branch`, matching ADR 0010 and the current public API contract.
- Selected/highlighted Storefront map pins now render a CSS-only glow/ripple around the existing branded marker element, with `prefers-reduced-motion` disabling animation for reduced-motion users.
- Targeted Storefront suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontMarkerPreview.test.js` passed 2 files and 18 tests.
- Storefront build gate: `npm --prefix frontend run build:store` passed.
- Governance gates: `npm run check:architecture` and `git diff --check` passed.

Operational readiness rating after this adoption pass: **9.1/10** locally validated. Remaining risk is production browser confirmation after deploy; no known source-level implementation gap blocks promotion.

Validated on 2026-06-06 for Storefront search-active marker previews:
- Active search result pins now pulse for both tenant/store-name matches and item/product matches, and search result pins auto-open the compact marker preview card with `Open storefront`.
- Popup retention is marker-set aware: click/focus previews remain stable while the marker set is unchanged, but stale previews are removed when pins are rebuilt so cards do not remain detached from the active pin.
- Targeted Storefront suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryPresentation.test.js --pool=threads` passed 3 files and 37 tests.

Validated on 2026-06-06 for Storefront map/search viewport and result stability:
- Initial Storefront discovery centers on the browser location only when location permission is already granted, or when a prior explicit `Near me` success is available in a browser without Permissions API support. The frontend stores only the permission-success hint, not user coordinates.
- Normal submitted text searches stay storefront-first and do not request geolocation, inherit a tiny `0.1 km` location radius, or clip valid tenant/item matches by the user's last location. The discovery request continues to use `result_mode=union`, `stock_filter=include_out_of_stock`, `pin_scope=tenant_primary`, and `include_match_meta=true`.
- Item searches render tenant storefronts that carry the searched item as the primary result cards. Item match details remain supporting context only.
- The map remains mounted during search refreshes when existing pins are available, then fits once per changed submitted query/filter result set. Repeating the same submitted search does not repeatedly refit or produce zoom flicker.
- Matching pins use a shared popup offset for standalone and clustered-marker previews so marker-card spacing follows the A/C Innovative Solutions spacing target while preserving exact stored coordinates.
- Targeted Storefront suites: `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryPresentation.test.js --pool=threads` passed 4 files and 42 tests.
- Backend discovery contract suites: `npm --prefix backend test -- --runTestsByPath tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js` passed 2 files and 19 tests, including union store/item matching, out-of-stock inclusion, nearest matching branches, and degraded snapshot behavior.
- Storefront build and architecture gates passed with `npm --prefix frontend run build:store` and `npm run check:architecture`. Rendered local route health passed, but automated browser text-entry and screenshot capture were blocked by the current Browser tooling in this session, so live production visual smoke remains required after deployment.

Operational readiness rating after this Storefront map/search remediation: **8.6/10** locally validated. Remaining risk is production-data/browser confirmation for item/store searches, exact-coordinate cluster card behavior, and desktop/mobile screenshot evidence after deploy.

Validated on 2026-05-24 for inventory item/product `Save and exit` hardening and item image copy:
- Product and item create/edit footers now wrap on narrow viewports, disable footer actions during pending saves, and use a ref-backed save guard to prevent same-tick duplicate submissions.
- New and draft item/product `Save and exit` paths save draft state and close without finalizing; existing active rows update and close; explicit finalize/create/update buttons remain the only finalization paths.
- Merchant-facing image copy in onboarding and item setup uses `Item image`; tracked frontend source no longer contains the old `Storefront image` visible phrase, while backend/API Storefront catalog image names remain stable.
- Frontend targeted suites: `npm --prefix frontend test -- src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx` passed 2 files and 17 tests.
- SKUpervisor build gate: `npm --prefix frontend run build:skupervisor` passed with the existing Vite large chunk warning.
- Governance and hygiene gates: `npm run check:architecture`, `git diff --check`, and `git grep -n -i "storefront image" -- frontend` passed.
- Rendered UI proof remained environment-limited: local Vite served the login page, but authenticated inventory proof could not proceed because the Browser runtime could not type credentials in this session (`Browser Use virtual clipboard is not installed`), and local auth had previously shown `426` login/auth failures.

Operational readiness rating after this inventory UX hardening pass: **8.8/10** locally validated. Remaining risk is authenticated browser proof for the inventory modal across desktop/mobile; no known source-level implementation gap blocks review.

## Assumptions
- Customer Access Mode enforcement is default-on. `CUSTOMER_ACCESS_MODES_ENABLED=false` is reserved for rollback, not normal operation.
- Inquiry Mode v1 uses existing contact channels only. No stored lead inbox, notification workflow, or inquiry database table is included.
- Internal mode codes stay `ghost`, `catalog`, `inquiry`, and `transaction` for compatibility. UI copy uses only the new labels.
- Existing tenants default to browseable catalog behavior with availability-only stock display.
- No local source folder outside `docs/` remains as a planning source after this document is added.
