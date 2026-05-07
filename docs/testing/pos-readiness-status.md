# POS Readiness Status (Canonical)

Status: authoritative-for-pos-readiness
Last updated: 2026-05-07
Overall status: in_progress

## 1) Canonical Blockers

1. Human cashier/admin UAT signoff is pending.
2. Release-gate/nightly browser E2E evidence is configured but still needs sustained green history capture.
3. Terminal identity is policy-driven (`warn`/`enforce`) but centralized admin-managed registry governance still requires operational rollout discipline.
4. Source-separation manual UAT parity proof (POS History source filter vs Sales POS channel filter vs CSV `pos_order_source`) is pending human evidence capture.
5. Strict location-binding rollout cutover remains gated until legacy shift-location remediation evidence is fully reviewed and accepted by operations.

## 2) Current Behavior Snapshot

1. IMS to POS handoff now includes guided POS readiness behavior:
- item-level POS visibility and media controls are explicit
- readiness blockers are surfaced before cashier flow handoff
 - readiness blockers for enabling POS visibility are: `pos_visible`, explicit `default_sale_price > 0`, non-negative stock, active item status, and available stock unless the row is a stock-exempt service
 - POS menu image and folder assignment/`show_in_pos_filter` are optional UX enhancements (non-blocking)
2. POS catalog eligibility is item-level with explicit defaults:
- override row present => use `pos_visible`
- no override row =>
  - finished goods visible by default
  - non-finished categories hidden by default until enabled
3. POS override and POS image write actions require `items:edit`.
4. Folder POS visibility (`show_in_pos_filter`) controls POS category chips only.
5. Terminal opening float defaults from configured petty cash when input is empty/zero-like and no shift is open.
6. Terminal identity policy is now explicit in runtime responses:
- `warn`: continues with warning reason code (`TERMINAL_ID_MISSING_WARN`, `TERMINAL_ID_UNREGISTERED_WARN`)
- `enforce`: blocks with deterministic reason code (`TERMINAL_REGISTRY_REQUIRED`, `TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY`, `TERMINAL_ID_NOT_REGISTERED`)
7. Incoming online queue UI distinguishes access states:
- no `pos:view` -> permission message (not empty queue)
- load failure -> explicit error state
- zero records -> explicit empty queue state
8. Incoming queue polling now suppresses duplicate global error toasts during silent refresh while keeping explicit on-screen error state.
9. Incoming order status actions are disabled when `pos:transact` is missing.
10. Locked terminal disables navigation mode switching until terminal unlock.
11. POS history supports direct handoff to Sales (`Open in Sales Report`) with preserved query context.
12. Sales export now provides explicit export completion feedback tied to active filters.
13. POS/store checkout validation errors (`422`) now surface structured field-level messages instead of generic failure copy.
14. POS/Sales transaction tables no longer rely on row-level `role="button"` semantics for primary detail actions.
15. Settings remediation navigation is deterministic across POS/compliance surfaces:
- known `/settings?tab=...#...` targets are normalized/resolved
- malformed hash targets fail safely without blocking page actions
- final-review `Fix now` targets remain scrollable in `compliant_active`
16. Workflow-mode-aware UX is active:
- tenant workflow mode now supports expanded template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`)
- runtime route/wizard compatibility remains family-safe (`manufacturing`/`msme`) and independent from compliance lifecycle
- MSME uses simplified inventory/POS surfaces while preserving manufacturing data
17. Single-item POS setup is wizard-first:
- item cards are compact and do not host single-item POS setup widgets
- enabling POS visibility is readiness-gated with deterministic denial metadata (`reason_code`, `missing_requirements`)
18. Final Review documentary readiness is tenant self-serve:
- requirements are completed in Settings > Compliance > Final review (upload or external URL)
- `Go to step` targets deep-link to per-document anchors (`#final-review-doc-...`)
19. POS/storefront source separation is now explicit on read UX/contracts:
- POS history supports explicit source badge/filter (`in_store`, `online_store`)
- unified sales includes POS channel discriminator (`pos_order_source`) while preserving `source=POS`
- sales CSV export includes `pos_order_source`
- storefront quote/checkout/track error copy is normalized for actionable operator/customer feedback
20. Sales transactions route now enforces strict query validation (including `pos_order_source`) before use-case execution.
21. Settings deep-link resolver now supports dynamic final-review document anchors (`#final-review-doc-*`) without hash resolution drift.
22. POS operational surfaces now share centralized fulfillment label/action mapping (`ready_for_pickup` displayed as `Ready for pickup`).
23. Storefront error normalization is extracted into a dedicated utility with direct unit coverage.
24. Legacy POS shift-location remediation is implemented with deterministic precedence and provenance:
- precedence: `transaction_unique_location` -> `terminal_home_location` -> `tenant_primary_location` -> `active_location_fallback`
- remediation writes per-shift provenance rows to `pos_shift_location_backfill_audit`
- strict-binding activation is blocked when unresolved/low-confidence readiness remains
- terminal setup context surfaces `location_binding_readiness` for operator visibility
25. POS pane keyboard scrolling is centralized and directly unit-tested:
- shared scroll key handler utility covers `ArrowUp/Down`, `PageUp/Down`, `Home/End`
- contract coverage still enforces focus-target and independent scroll-zone behavior
26. DGFY fee/branding rollout is active across POS + storefront:
- mandatory fee policy is fixed at `1%` of gross subtotal (`DGFY convenience fee`)
- POS checkout ignores caller `service_fee_amount` overrides at runtime
- storefront quote and checkout persist deterministic DGFY fee label snapshots
- receipt header keeps legal issuer prominence while preserving DGFY brand line and acronym footer
27. Terminal fee-policy UX is explicit and no longer method-count based:
- operational widgets now expose global policy state (`DGFY Global Fee Policy: Active/Inactive`)
- legacy "Fee Methods Enabled" count semantics are retired from operator-facing summaries
28. API route naming clarity is now explicit in docs:
- canonical external routes are documented as `/api/v1/pos/checkouts`, `/api/v1/store/cart/quote`, `/api/v1/store/checkout`
- singular `/api/v1/pos/checkout` is documented as non-canonical
29. POS checkout offline replay now uses the same durable sync contract as other terminal operations:
- queue storage: IndexedDB-first with fallback compatibility path
- statuses: `queued`, `replaying`, `replayed`, `failed_manual_resolution_required`
- replay ownership in terminal workspace mode is centralized to prevent duplicate replay loops
30. SKUpervisor/admin PWA infrastructure is now explicit:
- root admin and `apps/skupervisor` builds publish manifests and service workers
- admin service-worker registration is production-only and non-blocking
- `/api/` and `/uploads/` bypass service-worker caching to avoid stale authenticated data and stale tenant uploads
- POS and Storefront keep their existing service-worker entrypoints
31. POS and Storefront catalog controls are split:
- POS visibility uses `pos_catalog_overrides.pos_visible`; POS image upload/removal preserves the existing visibility state.
- Storefront visibility uses `storefront_catalog_overrides.storefront_visible`; Storefront image upload/removal preserves the existing visibility state.
- Storefront catalog images are independent from POS menu images.
- Public Storefront catalog payloads expose customer price through `default_sale_price` and must not expose `current_stock`, `cost_per_unit`, FIFO cost, weighted cost, or raw inventory value.
32. Storefront catalog fallback boundaries are now explicit:
- When `storefront_catalog_overrides` exists, a missing per-item Storefront override row uses Storefront default policy and must not inherit POS visibility or POS image state.
- POS-derived Storefront membership/media is allowed only as table-missing rollout compatibility fallback, with warning logging.
- Public `/store/catalog` retries without optional Storefront/POS/service include tables when those tables are unavailable during additive rollout, instead of returning `500`.
33. POS and Storefront image replacement is failure-aware:
- upload stores the new file, commits the override update, then best-effort removes the previous file
- if the override update fails after storage succeeds, the newly stored file is removed and the old image remains referenced
34. Inventory UI Storefront controls are permission-aware:
- `Show in Storefront` and Storefront item image controls are shown only when the user can configure item Storefront catalog state
- users without `items:edit` do not see disabled Storefront controls backed only by inferred default data
35. Barcode scan routing is now POS-readiness gated:
- `/pos/scan` resolves barcodes through the POS use case layer and returns deterministic `resolved`, `blocked`, or `routed` status.
- Package/case aliases apply `quantity_multiplier` only as a suggested cart quantity.
- Blocked scans return reason codes such as `BARCODE_NOT_FOUND`, `BARCODE_CONFLICT`, `BARCODE_SCOPE_NOT_POS`, `TICKET_SCAN_NOT_CARTABLE`, `NOT_POS_VISIBLE`, `ITEM_INACTIVE`, `MISSING_PRICE`, `OUT_OF_STOCK`, `LOCATION_CONTEXT_REQUIRED`, `UNAUTHORIZED_LOCATION`, `COMPLIANCE_BLOCKED`, and `SERVICE_UNAVAILABLE`.
- Offline checkout replay revalidates stored `scan_metadata` against barcode mapping, item state, stock/location scope, and compliance before committing.
- Services Mode barcode scans remain stock-exempt when the resolved row is `category=service`.
- Service booking/ticket QR scans return `SERVICE_BOOKING_SCAN_ROUTED` and route to Services booking context instead of adding cart lines.
- Label print payloads include normalized type, browser-print layout metadata, and audited `barcode.label_print_intent`.
36. Food & Beverage POS metadata is additive:
- `/api/v1/fnb/*` owns tables, checks, kitchen tickets, reservations/waitlist requests, reservation table assignments, modifiers, and restaurant service-charge settings.
- POS checkout accepts F&B table/check/server/guest/course/modifier/kitchen-station metadata and stores immutable snapshots on `pos_transactions` and `pos_transaction_lines`.
- Restaurant service charge is stored in `restaurant_service_charge_*` fields and `fnb_restaurant_service_charge_snapshots`; DGFY convenience fee remains `service_fee_amount`.
- F&B hides job-order and dispatch-order UI, but keeps stock movements available for ingredient/menu inventory.
37. Food & Beverage hardening is active:
- F&B check lifecycle now exposes table transfer, line-level split, and check merge actions behind the existing `fnbDining` route guard.
- F&B item modifier groups and item kitchen routes have authenticated assignment APIs and IMS controls; IMS assignment now uses menu-item selectors instead of raw item IDs.
- POS checkout validates F&B line modifiers against assigned database groups/options, snapshots server-owned modifier names/deltas, includes taxable restaurant service charge in VATable gross, allows kitchen-station line overrides, and deducts recipe ingredients from `product_composition` when present.
- POS cart lines now use modifier-aware line identity so the same menu item can appear with different options.
- IMS reservations validate assigned tables, expose table/date/status schedule filters, and allow multi-table assignment during reservation status updates.
- Reservation windows now carry duration and reset-buffer minutes. Confirmed/seated reservations block overlap on any assigned table; requested/waitlisted requests remain non-blocking capacity leads. Combined-table bookings reject party sizes above selected seat capacity.
- Storefront splits the F&B reservation panel and map components out of the primary Storefront entry; the remaining large chunk is the isolated lazy MapLibre vendor chunk.
38. Mode-aware RBAC is active:
- `users.role_preset_key` stores the mode-native preset while preserving legacy `users.role`, `users.permissions`, and `is_master_admin`.
- `GET /api/v1/users/role-catalog` returns the active tenant mode's role presets and visible permission groups for User Management.
- Services and F&B route guards prefer mode-native `services:*` and `fnb:*` permissions, with generic fallback controlled by `MODE_RBAC_GENERIC_FALLBACK_ENABLED` only for legacy remapping.
- Assigned-scope presets require location grants when the tenant has multiple active locations; single role updates and bulk role assignment save preset and location grants as one operator intent.
- Legacy users without a preset remain operational and display as `Legacy <role>` until remapped; presets from a previous tenant mode are surfaced as mode mismatch for admin review.

## 3) Automated Gate Status (Latest)

### 3.21 Mode-Aware RBAC And FIFO Location Follow-Up (2026-05-06)

1. Root-cause closure:
   - User Management previously exposed global role lists even though Services, Food Manufacturing, MSME, and F&B require different daily operator responsibilities.
   - Services and F&B route authorization could rely on generic permissions, which made delegated access hard to audit and easy to over-grant.
   - Assigned-location operational roles could be selected without an atomic preset-plus-location save path, leaving room for scope drift.
   - FIFO batch visibility could become misleading when item or location filters changed independently of the selected item.
2. Implemented fixes:
   - Added the additive mode role catalog, `role_preset_key`, mode-native Services/F&B permission strings, role catalog API, and backend validation for invite, role update, CSV import, legacy fallback, and mode mismatch behavior.
   - User Invitation, User Management, Permission Matrix, permission picker, and bulk role assignment now consume the backend role catalog and preserve hidden legacy permissions.
   - Services and F&B route guards now prefer native permissions and test generic fallback both enabled and disabled.
   - FIFO batch viewing now follows the selected item and location scope so operators can compare the same item's per-location batch differences without stale filters hiding valid batches.
3. Regression coverage and gates:
   - `npm --prefix backend run lint` -> PASS.
   - `npm --prefix backend test -- --runTestsByPath tests/userService.modeRbac.test.js tests/modeRbacRouteContracts.test.js tests/modeRbacFallback.test.js tests/modeRolePresets.test.js tests/checkAnyPermission.middleware.test.js tests/stockBearingPolicy.test.js tests/authModuleExports.contract.test.js` -> PASS.
   - `npm --prefix frontend test -- --run Components/users/__tests__/UserManagementModal.rbacContract.test.js Components/items/__tests__/FIFOBatchViewer.behavior.test.jsx Components/items/__tests__/FIFOBatchViewer.locationContract.test.js` -> PASS.
   - `npm --prefix frontend run lint` -> PASS.
   - `npm --prefix frontend run build` -> PASS.
   - `npm run lint:docs` -> PASS.
   - `npm run check:architecture` -> PASS.
   - `git diff --check` -> PASS with line-ending warnings only.
4. Updated honest rating:
   - Backend RBAC architecture: `9.0/10`; additive mode catalog preserves compatibility and keeps authorization granular, with the remaining risk being the temporary generic fallback window.
   - Backend RBAC completeness: `8.7/10`; invite, role update, current-user/user-list payloads, CSV import, route guards, and location scope are covered, but a full legacy remapping workflow and fallback-removal runbook remain future work.
   - Frontend User Management readiness: `8.5/10`; role catalogs, legacy display, assigned-location bulk assignment, and permission grouping are implemented, but large-tenant role review still needs richer audit/history UX.
   - Mode-development governance: `9.2/10`; the playbook now requires RBAC in every mode plan before production readiness, but future modes must still prove their own presets and route guards with tests.
   - FIFO location UX correctness: `8.8/10`; stale-filter and per-location comparison issues are covered, while manual operator QA is still needed on real multi-location datasets.

### 3.22 Production PM2, Release Gate, And FIFO Runtime Confidence Pass (2026-05-06)

1. Root-cause closure:
   - Local PM2 production startup initially used production defaults without a dotenv-safe local `JWT_SECRET`, causing backend crash-loop risk under `NODE_ENV=production`.
   - The canonical production ecosystem needed to carry non-secret VPS safety defaults so `pm2 startOrReload ecosystem.config.cjs --env production --update-env` starts with fail-closed/Redis-backed production behavior.
   - QA rollback/restore drills needed to tolerate Windows OpenSSH versions that reject `WarnWeakCrypto=no`.
2. Implemented fixes:
   - `ecosystem.config.cjs` now defines the canonical four-process PM2 runtime and non-secret production defaults for VPS hosting, fail-closed blacklist behavior, Redis-backed discovery cache behavior, manual tenant approval, payments disabled, and `DB_AUTO_SYNC=false`.
   - Local ignored `backend/.env` was hardened with generated dotenv-safe secrets and a dedicated local DB user for PM2 production preview.
   - QA rollback/restore scripts now probe `WarnWeakCrypto=no` support before adding that SSH option.
3. Regression coverage and gates:
   - `npm run preflight:vps` -> PASS.
   - `npm run doctor:runtime` -> PASS.
   - `pm2 startOrReload ecosystem.config.cjs --env production --update-env` -> PASS locally; backend, IMS, POS, and Storefront processes remain online.
   - `GET http://localhost:5000/health` -> PASS with production, DB connected, Redis connected/required, runtime schema healthy, schema indexes healthy, tenant pool healthy, and fail-closed token blacklist mode.
   - `GET http://localhost:5173`, `GET http://localhost:5174`, and `GET http://localhost:5175` -> PASS.
   - `npm run gate:release:local` -> PASS.
   - `npm run gate:release:no-staging` with QA env overlay -> PASS; the current verdict reports QA deploy-summary SHA mismatch as non-blocking because strict SHA enforcement is not enabled.
   - `npm run gate:release:prod-contracts` with exported production values -> PASS (`12/12` checks).
   - `npm run audit:location-stock-parity` -> PASS.
   - `npm run audit:fifo-drift` -> PASS.
   - `npm run audit:tenant-index-headroom -- --redundant-groups-threshold=0` -> PASS.
   - Backend FIFO/service/F&B targeted tests -> PASS (`27` tests).
   - Frontend FIFO batch viewer targeted tests -> PASS (`6` tests).
   - `npm --prefix frontend run build:all` -> PASS.
   - `npm run check:frontend-budgets` -> PASS with the known large Storefront `vendor-map-*` warning.
   - `git diff --check` -> PASS with line-ending warnings only.
4. Updated honest rating:
   - Local PM2 production runtime readiness: `9.4/10`; remaining risk is production host parity and post-deploy evidence, not local process stability.
   - FIFO/location stock behavior confidence: `9.3/10`; tests and audits cover policy, F&B ingredient preflight, service add-on behavior, batch grouping, and stale location filters.
   - Release gate confidence: `9.1/10`; gates pass, but exact QA deployed-head matching should be made strict for final production signoff.
   - Full production deploy confidence: `8.7/10` until tracked runtime fixes are committed/pushed and a post-deploy summary confirms the exact deployed SHA.

### 3.18 Food & Beverage Restaurant Hardening Rerun (2026-05-05)

1. `npm --prefix backend test -- fnbMode.usecases.test.js --runInBand` -> PASS (`12 tests`)
2. `npm --prefix backend test -- posCheckoutFnbContracts.usecase.test.js --runInBand` -> PASS (`1 test`)
3. `npm --prefix backend test -- posUsecases.applicationResult.test.js --runInBand` -> PASS (`21 tests`)
4. `npm --prefix backend test -- posRepository.locationStockFallback.test.js --runInBand` -> PASS (`2 tests`)
5. `npm --prefix frontend test -- fnbMode.contract.test.js` -> PASS (`4 tests`)
6. `npm --prefix frontend run build:pos` -> PASS
7. `npm --prefix frontend run build:store` -> PASS with residual Vite chunk warning for isolated `vendor-map-*` MapLibre chunk; primary Storefront entry reduced to about `119KB`.

### 3.19 Food & Beverage Operator Workflow Follow-Up (2026-05-05)

1. Root-cause closure:
   - IMS F&B menu assignment controls previously accepted raw item IDs, which made item routing/modifier assignment error-prone for operators.
   - IMS check splitting used comma-separated line IDs even though backend already had check-line data.
   - POS carried kitchen-station snapshots but did not expose a station override control.
   - Reservation requests stored `table_id` but the backend did not validate assigned table existence and IMS did not provide table/date schedule filters.
   - Reservation requests did not model seating duration/reset buffer, so overlap enforcement could not be done safely.
   - POS statically imported the F&B API helper for kitchen stations, reducing bundle headroom in the already near-budget POS terminal chunk.
2. Implemented fixes:
   - F&B console loads menu items and uses a menu-item selector for kitchen-route and modifier-group assignment.
   - Open-check split now uses check-line checkboxes; transfer and merge selections are tracked per check.
   - POS dynamically loads the F&B API only when a check context is active, then exposes a line-level kitchen-station selector.
   - Reservation list supports `status`, `table_id`, `from`, and `to` filters; create/update validates table assignments through the F&B table repository.
   - F&B reservations default to `90` minutes plus a `15` minute reset buffer; confirmed/seated updates reject same-table overlap, while requested/waitlisted rows remain non-blocking.
3. Regression coverage and gates:
   - `npm --prefix backend test -- fnbMode.usecases.test.js --runInBand` -> PASS (`15 tests`).
   - `npm --prefix frontend test -- fnbMode.contract.test.js` -> PASS (`4 tests`).
   - `npm --prefix frontend run build:pos` -> PASS.
   - `npm --prefix frontend run build:skupervisor` -> PASS.
   - `npm --prefix frontend run build:store` -> PASS with residual Vite chunk warning for isolated `vendor-map-*` MapLibre chunk; primary Storefront entry remains about `119KB`.
   - `npm --prefix backend test -- posCheckoutFnbContracts.usecase.test.js --runInBand` -> PASS (`1 test`).
   - `npm run check:architecture` -> PASS.
   - `npm run lint:docs` -> PASS.
   - `npm run check:frontend-budgets` -> PASS with existing MapLibre vendor warning.

### 3.20 Food & Beverage Combined-Table Reservation Follow-Up (2026-05-06)

1. Root-cause closure:
   - Reservation requests had a single `table_id`, so large parties that require joined tables were either under-modeled or forced into notes.
   - Same-table overlap protection did not cover joined-table bookings because there was no side-table assignment list to compare.
   - IMS assignment UX allowed one reservation table, which was not sufficient for full-service floor planning.
2. Implemented fixes:
   - Added `fnb_reservation_tables` as the reservation table-assignment side table while keeping `fnb_reservation_requests.table_id` as the primary compatibility shortcut.
   - Create/update reservation flows now accept `table_ids`, validate every assigned table, reject out-of-service tables, and reject party sizes above selected seat capacity.
   - Confirmed/seated overlap checks now evaluate every assigned table, so a joined-table booking blocks conflicts on each table in the set.
   - IMS reservation create/update surfaces now use multi-table checkboxes and preserve schedule filters.
   - Storefront map components moved to lazy `StoreMaps.jsx`; the primary Storefront entry is smaller, and the large MapLibre vendor chunk is only needed when map surfaces render.
3. Regression coverage and gates:
   - `npm --prefix backend test -- fnbMode.usecases.test.js --runInBand` -> PASS (`18 tests`).
   - `npm --prefix frontend test -- fnbMode.contract.test.js fnbStorefront.contract.test.js` -> PASS (`6 tests`).
   - `npm --prefix frontend run build:store` -> PASS; primary Storefront entry reduced to about `112.66KB`, with MapLibre isolated behind lazy `StoreMaps`.
   - `npm run check:frontend-budgets` -> PASS; Storefront MapLibre remains a warning-only lazy vendor chunk.
4. Updated honest rating:
   - Backend F&B contracts: `9.2/10`; remaining gaps are operational policies outside this patch, mainly deposits/no-show automation and advanced best-table assignment.
   - IMS F&B UI: `8.8/10`; combined-table assignment is now usable, but it is still a checkbox scheduler rather than a drag-and-drop floor/timeline planner.
   - POS UI: `8.2/10`; unchanged by this follow-up and still needs manual tableside/offline replay QA.
   - Storefront: `7.8/10`; the map and reservation panel are lazy-loaded now, but the MapLibre vendor chunk still exceeds Vite's default warning threshold when map surfaces are included.
   - Overall F&B readiness: `8.8/10`; suitable for structured restaurant pilot QA, not yet a no-supervision production rollout for high-volume restaurants.

### 3.15 Barcode Identity, Labels, And Scan Routing Hardening Rerun (2026-05-05)

1. `npm --prefix backend test -- --runTestsByPath tests/barcodePolicy.test.js tests/posUsecases.applicationResult.test.js tests/storeUsecases.applicationResult.test.js tests/itemHandlers.transport.test.js tests/csvImportService.workflowMode.test.js tests/itemBarcodeLabelContract.test.js` -> PASS (`74 tests`)
2. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js Components/items/__tests__/BarcodeManager.contract.test.js` -> PASS (`23 tests`)
3. `npm --prefix backend test` -> PASS (`217 passed suites`, `4 skipped`; `1017 passed tests`, `10 skipped`)
4. `npm --prefix frontend test -- --run` -> PASS (`61 files`, `246 tests`)
5. `npm run check:architecture` -> PASS
6. `npm run lint:docs` -> PASS
7. `npm run check:compliance` -> PASS
8. `npm run check:frontend-budgets` -> PASS with the existing Storefront chunk-size warning only
9. `npm --prefix frontend run build:store` -> PASS
10. `npm --prefix frontend run build:pos` -> PASS
11. `npm --prefix frontend run build:skupervisor` -> PASS
12. `git diff --check` -> PASS with line-ending warnings only

Verified outcomes:
- POS service booking/ticket QR scans are routed with `SERVICE_BOOKING_SCAN_ROUTED` and do not mutate cart state.
- Ticket-scope scans that are not POS-cartable fail closed with `TICKET_SCAN_NOT_CARTABLE`.
- Label payloads now carry backend-owned browser-print layout contracts and label print audit metadata consumed by the Inventory UI.
- Storefront QR service booking resolution redacts customer contact data and does not expose raw inventory/cost fields.
- POS, Storefront checkout, and barcode cart handoff must not fall back from missing `default_sale_price` to `cost_per_unit`; missing or zero sale price returns `MISSING_PRICE`/validation failure instead.
- Pure Services rows (`category=service` or `mode_item_preset=service`) remain revenue/bookable rows but are excluded from stock movement, FIFO, inventory valuation, low-stock, surplus/shortage, and stock-aging tracking. Services physical add-ons/products continue using normal stock tracking.

Remaining non-automated readiness checks:
- Physical scanner and browser label print-margin validation still require manual QA against target hardware and label stock.
- Service package redemption remains a separately audited package/redemption workflow, not an inventory movement shortcut.

### 3.1 Full rerun baseline (2026-04-03)

1. `npm run install:all` -> PASS
2. `npm --prefix backend run migrate` -> PASS (schema already up to date)
3. `npm run check:architecture` -> PASS
4. `npm run lint:docs` -> PASS
5. `npm --prefix backend run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
6. `npm --prefix backend run audit:indexes` -> PASS (`status=healthy`, `missing=0`)
7. `npm run smoke:pos-local` -> PASS (all endpoint checks `200`)
8. `npm --prefix backend run lint` -> PASS
9. `npm --prefix frontend run lint` -> PASS
10. `npm --prefix backend test` -> PASS (`140 passed suites / 143 total`, `624 passed tests / 631 total`)
11. `npm --prefix frontend test -- --run` -> PASS (`15 files / 57 tests`)
12. `npm run build:skupervisor` -> PASS
13. `npm run build:pos` -> PASS
14. `npm run build:store` -> PASS

### 3.2 Targeted remediation rerun (2026-04-08)

1. `npm --prefix backend run migrate` -> PASS
   - Applied: `20260407000002`, `20260407000003`, `20260407000004`, `20260407000005`
2. `npm --prefix backend run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
3. `npm --prefix backend test -- runtimeSchemaAuditService.test.js` -> PASS
4. `npm run check:architecture` -> PASS
5. `npm run build:frontend` -> PASS
6. Targeted endpoint probes -> PASS
   - `GET /api/v1/compliance/profile` -> `200`
   - `GET /api/v1/compliance/artifacts` -> `200`
   - `GET /api/v1/compliance/peripherals` -> `200`
   - `GET /api/v1/pos/incoming-orders` -> `200`
   - `GET /api/v1/sales/transactions` -> `200`
7. Store checkout failure mode validated:
   - `POST /api/v1/store/checkout` now returns contract-level `422` for validation/stock violations (no server `500`).

### 3.3 Journey Gate Enforcement Status (2026-04-09)

1. Core browser journey command exists and is wired for release gate use:
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e`
2. Matrix browser journey command exists for nightly drift/a11y pass:
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix`
3. Release gate workflow is defined in:
   - `.github/workflows/ci.yml` (`journey-e2e-release-gate`)
4. Nightly matrix workflow is defined in:
   - `.github/workflows/nightly-ims-pos-sales-e2e.yml`
5. Artifact retention policy is configured:
   - release gate: 14 days
   - nightly matrix: 21 days

### 3.4 Settings/Compliance Remediation Hardening Rerun (2026-04-10)

1. `npm --prefix frontend test -- --run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js` -> PASS (`4 files`, `35 tests`)
2. `npm --prefix frontend run build` -> PASS
3. Verified outcomes:
   - cross-surface remediation targets from policy/POS remain resolvable by Settings contract
   - compliance final-review `Fix now` action remains functional in `compliant_active`
   - malformed hash and clipboard failure paths provide deterministic non-blocking feedback

### 3.5 POS/Storefront Source-Separation Contract Rerun (2026-04-16)

1. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posValidator.transactionsQuery.test.js tests/salesHandlers.transport.test.js` -> PASS
2. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posSalesReconciliation.db.integration.test.js -t "keeps totals consistent across POS checkout, Z-reading, and unified sales summary"` -> PASS
3. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/posSalesReconciliation.db.integration.test.js -t "covers storefront checkout -> tracking -> POS lifecycle -> reporting -> inventory end-to-end"` -> PASS
4. `npx vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/sales/__tests__/salesHandoffContracts.test.js` -> PASS
5. Canonical contract matrix published:
   - `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`

### 3.6 Gap-Closure Hardening Rerun (2026-04-16)

1. `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/salesValidator.transactionsQuery.test.js tests/salesHandlers.transport.test.js` -> PASS
2. `npx vitest run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/sales/__tests__/salesHandoffContracts.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js` -> PASS
3. `npm run check:architecture` -> PASS
4. `npm run check:compliance` -> PASS
5. `npm run build:frontend` -> PASS
6. Dedicated manual run log scaffold created:
   - `docs/testing/pos-e2e-uat-run-2026-04-16.md`

### 3.7 POS Shift-Location Remediation + Strict-Binding Guardrail Rerun (2026-04-21)

1. `npm --prefix backend test -- --runInBand posValidator.terminalShiftIdentity.test.js posUsecases.applicationResult.test.js posHandlers.transport.test.js rbacRouteCoverage.contract.test.js settingsUsecases.applicationResult.test.js posShiftLocationResolution.test.js posShiftLocationBackfillRemediation.migration.test.js posTerminalReadiness.usecase.test.js` -> PASS
2. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalLocationScope.integration.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posSettingsStrictBinding.contract.test.js` -> PASS
3. `npm --prefix frontend run build:pos` -> PASS
4. `npm run check:architecture` -> PASS
5. `npm run lint:docs` -> PASS
6. Strict-binding readiness guardrails verified:
   - settings update blocks `pos_terminal_location_binding_enforced=true` when readiness is not complete
   - terminal setup context returns `location_binding_readiness` summary payload

### 3.8 Production Hardening Rerun (2026-04-21, Evening)

1. `npm --prefix backend run migrate` -> PASS
   - Applied pending migration: `20260422000002-harden-compliance-downgrade-controls.cjs`
2. `npm run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
3. `npm --prefix frontend run build:all` -> PASS
4. `npm --prefix frontend test` -> PASS (`48 files`, `192 tests`)
5. `npm --prefix backend test` -> PASS (`192 passed suites`, `4 skipped`; `848 passed tests`, `9 skipped`)
6. `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix` -> PASS (`4/4` scenarios; desktop+mobile)
7. `npm run check:architecture` -> PASS
8. `npm run lint:docs` -> PASS
9. `npm run check:compliance` -> PASS
10. `npm run check:frontend-budgets` -> PASS (route budget thresholds rebased to current POS route complexity with bounded headroom)
11. `npm run gate:release:no-staging` -> FAIL (expected in local env without QA remote contract inputs)
    - release verdict artifact generated at:
      - `.tmp/release-gates/<target_sha>/release_verdict.json`
    - failing release verdict checks were:
      - `qa.smoke.command` (missing `QA_BASE_URL`)
      - `qa.rollback.command` + `qa.restore.command` (`QA_SSH_HOST` missing)
      - `qa.deploy.summary.exists` (missing `qa_deploy_summary.txt`)

### 3.9 No-Staging QA Gate Closure (2026-04-21, Night)

1. Local QA env wiring completed via `.env.qa.local` + loader/wrapper scripts.
2. `npm run evidence:qa:deploy-summary` -> PASS
3. `npm run gate:release:no-staging:qa-env` -> PASS
4. `node scripts/verify-release-verdict.js --file .tmp/release-gates/<target_sha>/release_verdict.json --sha <target_sha>` -> PASS
5. Release verdict artifact now reports `verdict: pass` with `failed_gate_count: 0` for target SHA `b315629978b9e772dc93d406c6ac15a8af53c655`.

### 3.10 Storefront Catalog Production Incident Remediation (2026-04-21, Night)

1. Observed production symptom:
   - Public tenant storefront intermittently returned `500` on `GET /api/v1/store/catalog?limit=120&location_id=...` for one tenant while another tenant continued to return `200`.
2. Root cause:
   - Tenant-level schema drift on location-stock support (`item_location_stocks`) combined with `location_id` catalog scope path.
   - Existing catalog compatibility fallback handled missing `pos_catalog_overrides` but did not gracefully degrade missing location-stock schema.
3. Permanent backend fix:
   - `backend/src/modules/store/repositories/storeRepository.js` now treats missing location-stock table/column errors as compatibility fallback and returns global stock-based availability instead of propagating `500`.
4. Regression coverage:
   - `backend/tests/storeRepository.locationStockFallback.test.js`
5. Verification evidence:
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/storeUsecases.applicationResult.test.js` -> PASS
   - `npm run check:architecture` -> PASS
6. Deployment evidence:
   - Full verified deploy completed for commit `4a6d76a789cd60526cd2909cd4d72e5a225c683c`.
   - Summary artifact: `logs/deploy/deploy_20260421_212450.summary.txt`
   - Public checks passed for IMS/POS/storefront/tenant-store and tenant-store asset integrity.

### 3.11 Storefront and POS Compatibility/UX Polish Closure (2026-04-22)

1. Root-cause closure expansion:
   - Storefront catalog blank-state edge case identified when `catalog.length === 0` and catalog search query is non-empty.
   - Catalog error helper copy previously suggested setup guidance for generic runtime errors.
   - Adjacent POS repository location-stock path shared schema-drift risk for `item_location_stocks`.
2. Implemented fixes:
   - `frontend/apps/store/src/main.jsx` now uses deterministic catalog state rendering (`loading`, `error`, setup-empty, search-empty, no-match, ready) so no blank state is possible.
   - `frontend/apps/store/src/storefrontErrorMessages.js` now classifies catalog load failures and separates runtime faults from setup guidance.
   - `backend/src/modules/pos/repositories/posRepository.js` now applies the same table/column compatibility fallback policy for location-stock reads as storefront catalog.
3. Regression coverage:
   - `frontend/apps/store/src/__tests__/discoveryFlow.integration.test.jsx`
   - `frontend/apps/store/src/__tests__/storefrontErrorMessages.test.js`
   - `backend/tests/posRepository.locationStockFallback.test.js`
4. Verification evidence:
   - `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontErrorMessages.test.js` -> PASS
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/posRepository.locationStockFallback.test.js` -> PASS

### 3.12 Storefront Catalog Explicit Error-Code Contract (2026-04-22)

1. Contract hardening:
   - Added explicit backend error codes for storefront catalog read failures:
     - `STORE_CATALOG_LOCATION_INVALID` (`422`)
     - `STORE_CATALOG_RUNTIME_ERROR` (`500`)
2. Frontend hardening:
   - Catalog error guidance now keys off `error_code` contract rather than message substring matching.
3. Regression coverage:
   - `backend/tests/storeUsecases.applicationResult.test.js` (catalog invalid location + runtime error code assertions)
   - `frontend/apps/store/src/__tests__/storefrontErrorMessages.test.js` (code-driven classification assertions)
4. Verification evidence:
   - `npm --prefix backend test -- --runInBand --runTestsByPath tests/storeUsecases.applicationResult.test.js tests/storeRepository.locationStockFallback.test.js tests/posRepository.locationStockFallback.test.js` -> PASS
   - `npm --prefix frontend test -- --run apps/store/src/__tests__/storefrontErrorMessages.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx` -> PASS
   - `npm run check:architecture` -> PASS
   - `npm run lint:docs` -> PASS

### 3.13 Scroll UX Assurance + Local Readiness Gate Automation (2026-04-23)

1. Scroll behavior hardening:
   - extracted pane keyboard-scroll handling to shared utility:
     - `frontend/src/features/pos/utils/scrollKeyControls.js`
   - added direct behavior tests:
     - `frontend/src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js`
   - updated scroll contract test to enforce utility wiring:
     - `frontend/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
2. Local release-readiness automation:
   - added `scripts/gate-release-local.js`
   - added npm command `npm run gate:release:local`
   - gate emits artifact:
     - `.tmp/release-gates/<target_sha>/local_readiness.json`
3. Verification evidence:
   - `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js` -> PASS

### 3.14 DGFY Global Fee + Branding Contract Hardening (2026-04-23)

1. Cross-surface policy hardening:
   - storefront fee label is deterministic even when `service_fee_amount=0`
   - receipt header now preserves legal issuer-first display with explicit DGFY brand line
   - terminal summary cards now expose explicit global fee-policy state
2. Regression coverage:
   - `npm --prefix backend test -- --runTestsByPath tests/storeUsecases.applicationResult.test.js tests/posSalesReconciliation.db.integration.test.js` -> PASS
   - `npm --prefix frontend test -- --run src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx` -> PASS
3. Quality + gate evidence:
   - `npm --prefix frontend run lint -- Pages/Settings.jsx src/features/pos/components/TerminalOperationsWorkspace.jsx src/features/pos/components/TerminalSidebarPanel.jsx src/features/pos/components/ReceiptPrintView.jsx` -> PASS
   - `npm run lint:docs` -> PASS
   - `npm run check:architecture` -> PASS
   - `npm run check:compliance` -> PASS
   - `npm run gate:release:local` -> PASS

### 3.15 Settings Sectioning + Admin PWA Infrastructure Rerun (2026-04-30)

1. Settings sectioning update:
   - added dedicated Storefront tab for customer-facing DGFY operations, locations, media, and content
   - kept POS Setup focused on legal receipt metadata, cashier closeout, terminal policy, DGFY fee policy, and POS discounts
   - kept Company focused on tenant identity, users, and workflow/business mode
2. Admin/SKUpervisor PWA update:
   - added root admin and `apps/skupervisor` manifests
   - added root admin and `apps/skupervisor` service workers
   - added production-only admin service-worker registration
3. Regression coverage:
   - `npm --prefix frontend test -- src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/pages/__tests__/Settings.subscriptionVisibility.component.test.jsx` -> PASS (`3 files`, `20 tests`)
4. Build and static PWA checks:
   - `npm --prefix frontend run build` -> PASS
   - `npm --prefix frontend run build:skupervisor` -> PASS
   - `npm --prefix frontend run build:all` -> PASS
   - `node --check frontend/public/sw.js` -> PASS
   - `node --check frontend/apps/skupervisor/public/sw.js` -> PASS
   - manifest JSON parse checks -> PASS
5. Governance:
   - `npm run check:architecture` -> PASS
   - `git diff --check` -> PASS with line-ending warnings only

### 3.16 Services Mode Connection + POS Service Sale Hardening (2026-05-03)

1. Services Mode cross-surface verification:
   - Storefront Services tenant page loads the service catalog, active storefront location, and booking controls without browser console errors.
   - IMS `/services` renders Services dashboard metrics, service catalog, intake-form signal, and service workspace tabs after authenticated login.
   - POS `/pos` renders Services Queue and service catalog rows for the same tenant.
2. POS service sale hardening:
   - backend POS catalog now loads `ServiceItemDetail` and evaluates Services rows with POS surface visibility (`visible_in_pos`)
   - service rows are stock-exempt and remain POS-addable when `current_stock=0`
   - POS UI labels service rows as `Service sale` instead of `Out of stock`
   - POS order method includes `Appointment` and service additions select the appointment path
3. API evidence:
   - `/api/v1/services/dashboard`, `/catalog`, `/bookings`, `/clients`, `/waitlist`, `/resources`, `/assignments`, `/reminders` -> PASS
   - `/api/v1/store/catalog` and `/api/v1/store/services/catalog` include the service row for the Services tenant -> PASS
   - `/api/v1/pos/catalog` includes the service row with `category=service` and `pos_visible=true` -> PASS
   - service POS checkout succeeds as a non-fiscal appointment transaction without stock deduction -> PASS
4. Regression coverage:
   - `npm --prefix backend test -- --runTestsByPath tests/catalogVisibilityPolicy.test.js tests/servicesMode.usecases.test.js tests/workflowModes.crossLayer.contract.test.js` -> PASS (`21` tests)
   - `npm --prefix frontend test -- --run apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/businessModePins.test.js src/features/settings/__tests__/workflowMode.services.test.js` -> PASS (`8` tests)
5. Build and governance:
   - `npm --prefix frontend run build:pos` -> PASS
   - `npm --prefix frontend run build:skupervisor` -> PASS
   - `npm --prefix frontend run build:store` -> PASS
   - `npm run check:architecture` -> PASS
   - `npm run lint:docs` -> PASS

### 3.17 POS/Storefront Catalog Split Hardening (2026-05-04)

1. Root-cause closure:
   - Storefront catalog runtime reads previously allowed row-missing Storefront override data to fall back to POS visibility/media, which could make newly missing or unbackfilled Storefront rows appear to follow POS state again.
   - `/store/catalog` optional-table retry covered Storefront/POS override tables but not the service details include table.
   - POS and Storefront image replacement removed the old file before the override update was proven, and a failed update after storing the new file could orphan the new file.
2. Implemented fixes:
   - `backend/src/modules/store/repositories/storeRepository.js` uses POS-derived visibility/media only when the Storefront override table itself is unavailable.
   - `backend/src/modules/inventory/repositories/itemRepository.js` applies the same boundary for inventory-facing Storefront override listing.
   - POS and Storefront image upload use safe replacement order and clean up newly stored files after failed override updates.
   - Inventory item cards, item modal, table view, and product setup step hide Storefront controls when the user cannot load/configure Storefront override data.
3. Regression coverage and gates:
   - `npm --prefix backend test -- --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/storefrontCatalogUseCases.test.js tests/posUsecases.applicationResult.test.js` -> PASS (`26` tests)
   - `npm --prefix frontend test -- Components/items/__tests__/ItemCard.catalogToggles.test.jsx` -> PASS (`4` tests)
   - `npm run check:architecture` -> PASS
   - `npm run lint:docs` -> PASS
   - `npm run build:skupervisor` -> PASS
   - `npm run build:pos` -> PASS
   - `npm run build:store` -> PASS
   - `git diff --check` -> PASS with line-ending warnings only

## 4) Canonical UAT Assets

1. Checklist: `docs/testing/pos-e2e-uat-checklist.md`
2. Execution script: `docs/testing/pos-e2e-uat-execution-script.md`
3. Evidence template: `docs/testing/pos-e2e-uat-evidence-template.md`
4. Current run log: `docs/testing/pos-e2e-uat-run-2026-04-16.md`
5. Canonical IMS to POS to Sales role journey: `docs/features/IMS_POS_SALES_UX_JOURNEY.md`
6. Current release checklist: `docs/testing/release-go-no-go-checklist.md`

## 5) Update Rule

When POS readiness status changes, update this file first, then align references in:

1. `docs/testing/nonprod-gap-closure-checklist.md`
2. `docs/testing/production-readiness-audit.md`
