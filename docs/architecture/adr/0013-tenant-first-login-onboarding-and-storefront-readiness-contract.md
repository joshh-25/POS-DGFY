# ADR 0013: Tenant First-Login Onboarding and Storefront Readiness Contract

## Status
Accepted (2026-04-25)

## Context
The product direction requires three connected surfaces:
1. DGFY storefront
2. DGFY POS
3. SKUpervisor IMS

Tenant registration originally entered onboarding after platform-admin approval. As of the 2026-05-18 addendum, public company registration defaults to auto-standard provisioning and activation, and the tenant master admin needs the same deterministic first-login setup flow after the normal login handoff.

Before this ADR:
1. Registration + approval lifecycle exists.
2. Storefront template stack and branding asset endpoints exist.
3. No dedicated tenant onboarding state machine or first-login onboarding API contract exists.

## Decision
Adopt a tenant-scoped onboarding lifecycle with soft-reminder UX:

1. State contract
- `tenant_onboarding_state`: `not_started | in_progress | completed`
- `tenant_onboarding_started_at` and `tenant_onboarding_completed_at` timestamps
- `tenant_onboarding_progress` JSON snapshot with required checklist progress

2. Initialization
- On tenant provisioning, initialize onboarding state to `not_started`.

3. Ownership and access
- Onboarding status and mutations are tenant-master-admin only.
- Routes:
  - `GET /api/v1/onboarding/status`
  - `PUT /api/v1/onboarding/step`
  - `POST /api/v1/onboarding/items/bulk`
  - `POST /api/v1/onboarding/complete`

4. First-login wizard steps
- `brand_assets`: optional storefront profile picture and cover photo. Missing images never block completion.
- `primary_location`: captures whether the tenant wants a public/searchable storefront and whether that storefront has a published map pin. Public visibility is opt-in. When enabled with a location, this step creates or updates the active primary storefront location pin used by discovery map surfaces. When enabled with `store_has_no_location=true`, the tenant remains searchable and has a public storefront page, but discovery sync materializes nullable location fields and excludes the tenant from map pins until a location is published. IMS setup surfaces use a MapLibre pin picker with explicit locked/adjust modes, delivery-radius preview, browser geolocation accuracy feedback, first-party PH-local reverse-geocoded address suggestions, and initial Storefront business-hours setup while preserving editable coordinate fields when a location is required.
- `bulk_items`: create starter catalog rows from the active workflow mode's onboarding item presets.

5. Required completion checklist
- Store name ready (registration baseline)
- At least one active primary storefront location when public visibility is enabled and `store_has_no_location` is not enabled. Hidden storefronts and searchable no-location storefronts satisfy this readiness check without a map pin.
- At least one active starter item with positive `default_sale_price`
- For corrected item-taxonomy modes, the starter item must carry a mode-valid `mode_item_preset`
- `current_stock=0` does not block onboarding completion

6. Mode-aware starter item contract
- The bulk item step resolves the tenant workflow mode and presents item type choices from the shared `mode_item_preset` taxonomy.
- Corrected modes use their existing presets: Food Manufacturing (`raw_material`, `packaging`, `supplies`, `finished_product`), MSME (`product`, `supplies`), Services (`service`, `physical_add_on`, `supplies`), and Food & Beverage (`menu_item`, `ingredient`, `packaged_beverage`, `packaging_supply`).
- The first-login F&B starter-item UI intentionally narrows the selector to `Menu Item` only, because the starter row is for the customer-facing Storefront/POS catalog. Ingredients, packaging, and other F&B stock setup remains available after onboarding in full item management.
- At the F&B onboarding boundary only, starter item input values `product`, `product item`, `product_item`, and `menu_item` normalize to `mode_item_preset=menu_item`; the persisted item remains a normal product row with `category=product` and `product_type=finished_goods`, while Storefront/POS can render it as a restaurant menu item.
- At the F&B onboarding boundary only, legacy starter item input values `raw material`, `raw_material`, and `ingredient` normalize to `mode_item_preset=ingredient`; the persisted item category remains `raw_material`.
- Placeholder modes keep conservative default item behavior until their governed taxonomy is promoted.
- Bulk onboarding rows require only `mode_item_preset`, `name`, and positive `default_sale_price`. `cost_per_unit`, `current_stock`, and item image upload are optional.
- Onboarding image selection is appendable and capped at five images per starter item. The UI must show the selected-image carousel with one focused image at a time and remove only the focused image when requested; selecting files again appends to the queued images instead of replacing the existing queue.
- The backend derives hidden item fields from the preset, generates a deterministic onboarding SKU when the UI does not expose one, creates valid rows, and returns row-level errors for invalid rows without discarding successful rows.
- If the primary location step has saved a location, starter item rows include that `location_id` so optional initial stock can be recorded through the existing location-scoped stock movement path.
- Previously created rows must not be resubmitted by the frontend. Duplicate row keys and generated SKU conflicts return row-level failures instead of retrying into duplicate inventory records.
- Completion readiness for corrected modes requires a customer-facing onboarding preset: Food Manufacturing `finished_product`, MSME `product`, Services `service` or `physical_add_on`, and Food & Beverage `menu_item` or `packaged_beverage`.

7. Surface behavior
- Soft reminder only while onboarding incomplete (no hard block for POS/IMS access).
- Completion is one-time; onboarding does not auto-reopen after completion.

8. Storefront readiness integration
- Saving `primary_location` or `bulk_items`, and completing onboarding, triggers storefront discovery sync reliability runner.
- Saving `primary_location` may also persist `storefront_hours` as the tenant's weekly business-hours schedule. That schedule is displayed on Storefront discovery/profile surfaces and is used by Storefront checkout availability checks.
- Saving `primary_location` may also persist `store_is_visible`. When `store_is_visible=false`, public discovery and public storefront profile reads must not expose the tenant, and no default/bootstrap map pin may make the tenant public.
- Saving `primary_location` may also persist `store_has_no_location`. When `store_is_visible=true` and `store_has_no_location=true`, public profile reads by slug remain valid, text/category/item search may return the tenant, default map browsing omits it, and `/storefront/discovery/map-pins` must exclude it because the materialized discovery row has `location_id`, `latitude`, and `longitude` set to `null`.
- Existing discovery/profile/checkout contracts remain backward compatible.

9. Generation policy
- Storefront remains template-based for this scope; no AI-generated storefront configuration in onboarding completion path.

## Consequences
1. Tenant first-login setup is now explicit, measurable, and API-driven.
2. Master admin receives guided setup while preserving operational access.
3. Readiness checks become deterministic and portable across surfaces.
4. Additional maintenance burden exists for onboarding state and checklist evolution.
5. Telemetry-only UX events are decoupled from onboarding checklist persistence to avoid progress-state write noise.

## Acceptance Criteria
1. Approved tenant has onboarding state initialized to `not_started`.
2. Master admin can read/save/complete onboarding through dedicated endpoints.
3. Completion fails with deterministic missing-requirements payload when checklist is incomplete.
4. Completion sets `completed` and timestamps and triggers storefront sync.
5. Login and current-user bootstrap payloads expose onboarding metadata.
6. POS and IMS surfaces show persistent onboarding reminder until completion.
7. The onboarding wizard renders exactly `brand_assets`, `primary_location`, and `bulk_items`.
8. Bulk starter item creation supports partial success, validates presets against the active workflow mode, and treats zero stock as completion-ready when selling price and preset requirements pass.

## Rollback Notes
1. Runtime rollback can hide onboarding UI and stop calling onboarding routes.
2. Existing tenant operations continue because onboarding is reminder-only.
3. Stored onboarding settings are non-destructive and can be ignored safely.

## Addendum (2026-04-25): Ownership and Telemetry Separation Hardening
1. Session/bootstrap onboarding metadata is master-admin scoped; non-master users do not own onboarding state lifecycle.
2. Reminder/wizard telemetry events are tracked via dedicated onboarding event endpoint and do not mutate onboarding step payload storage.
3. Onboarding settings writes are transaction-wrapped and payload-size constrained to reduce partial-write and storage-abuse risk.

## Addendum (2026-05-18): Default Auto-Activation Registration
1. Public company registration now defaults to `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard`.
2. The tenant is provisioned and activated during registration, then the frontend immediately exchanges the signed-in DGFY founder membership for a normal tenant session and redirects to IMS/onboarding. Manual login with prefilled company context remains the fallback if tenant-session exchange fails.
3. `TENANT_REGISTRATION_APPROVAL_MODE=manual` remains available as an explicit rollback/admin-review mode for operators who need pending platform-admin approval before provisioning.
4. Tenant onboarding initialization still occurs during provisioning and remains a soft-reminder flow after first login.

## Addendum (2026-05-18): Mode-Aware Three-Step Onboarding
1. The previous business-profile, business-classification, and readiness-only wizard contract is replaced by three merchant setup steps: optional brand assets, primary storefront location, and mode-aware bulk starter items.
2. Completion readiness now checks `store_name_ready`, `has_primary_storefront_location`, and `has_priced_starter_item`.
3. Stock quantity and item image uploads are optional onboarding data. A zero-stock active item can complete onboarding when it has a positive customer selling price and, for corrected modes, a valid onboarding preset. Merchant-facing onboarding copy uses `Item image`; images upload only after item creation succeeds, repeated selections append instead of replace, the selected-image carousel supports focused one-by-one removal, and uploads are capped at 5 images per item. The existing Storefront catalog image storage/API contract remains unchanged.
4. Future workflow modes must define onboarding item choices, default hidden fields, financial rules, stock behavior, and backend/frontend tests before being considered production-ready.

## Addendum (2026-05-28): Business Hours Capture
1. The `primary_location` step now captures weekly Storefront business hours in addition to the primary pin and delivery radius.
2. Business hours remain non-blocking for onboarding completion, but the saved schedule becomes the long-term `storefront_hours` setting so merchants do not need a second setup pass in Settings.
3. Storefront discovery/profile surfaces display the derived business-hours label.
4. Storefront product quote/checkout and service booking/hold/batch mutations use the same setting to reject immediate or scheduled customer transactions outside configured hours while preserving legacy free-text `storefront_hours` values as display-compatible and non-breaking.

## Addendum (2026-06-06): Public Storefront Visibility Opt-In

1. Auto-provisioned tenants start with `store_is_visible=false` and no synthetic/default primary storefront location. Provisioning must override any migration-seeded public-visible default for the new tenant database before the discovery bootstrap runs, and must not place a new company on the DGFY map using fallback coordinates.
2. The onboarding `primary_location` step and Settings > Storefront expose the same tenant-level public visibility control. When off, the tenant is hidden from DGFY discovery/map feeds and the public root-handle profile page (`/:store_tenant_slug`) is hidden; legacy `/store/:slug` and `/tenant-store/:slug` paths remain compatibility routes only.
3. Hidden tenants may continue onboarding without saving a public location pin. The primary-location readiness check is only required after the merchant opts into public visibility and has not explicitly marked `store_has_no_location=true`.
4. When the merchant opts in and does not mark the store as having no location, they must save a real active primary storefront location before discovery sync can publish a map pin. When `store_has_no_location=true`, discovery sync publishes a searchable/profile row with null coordinates and no map pin. Settings must make this dependency visible so merchants do not confuse public/searchable storefront publication with map publication.
5. Operators must use the Storefront public visibility audit before tightening legacy fallback behavior or after any discovery remediation. The audit reports hidden tenants that remain indexed, visible tenants without active primary pins, missing or invalid visibility settings, stale indexed locations, and fallback-location publication.

## Addendum (2026-06-16): Searchable No-Location Storefronts

1. `store_is_visible=true` means the storefront is public/searchable. It no longer means the tenant is necessarily map-pinned.
2. `store_has_no_location=true` is a reversible tenant setting stored in `system_settings`. It preserves any saved tenant locations, but discovery sync materializes the public row with `location_id=null`, `latitude=null`, and `longitude=null`.
3. `/storefront/discovery` includes no-location stores only when the customer expresses text/category/item search intent. Default map browsing and `/storefront/discovery/map-pins` require valid coordinates and exclude nullable-coordinate rows.
4. Public storefront profile reads by slug must work for no-location stores. Customer Access Mode remains authoritative for catalog/contact/checkout behavior; no-location does not automatically downgrade the effective access mode or bypass existing payment, item, stock, business-hours, branch, or compliance gates.
5. Store setup uses an apply-and-grid business-hours editor. `Open 24/7` sets all days enabled with `00:00-00:00`, preserving the existing 24-hour convention. The current structured schedule supports multiple ordered intervals per day under `weekly.{day}.intervals`; applying a bulk block overwrites selected days with one interval, while each day can then add, edit, remove, and reorder additional intervals.

## Addendum (2026-06-21): Explicit Pin Modes, PH-Local Address Suggestions, and Multi-Interval Hours

1. The shared IMS `MapPinPicker` has explicit locked and adjust modes. Settings opens locked; map click, marker drag, and browser-geolocation overwrite are disabled until the merchant presses `Adjust Pin`. Onboarding opens in adjust mode only after searchable storefront visibility is enabled and no valid saved pin exists, so first pin placement is immediate without creating a saved default pin.
2. Iloilo City, Philippines remains camera-only default state. Missing coordinates, `0,0`, and out-of-Philippines browser geolocation are invalid merchant storefront pins and must not be saved.
3. Browser geolocation remains best effort, uses high-accuracy mode, records reported accuracy, and presents accuracy feedback. It cannot guarantee device precision and must not overwrite a pin when permission, timeout, unsupported-browser, unavailable-position, or out-of-Philippines outcomes occur.
4. IMS address autofill uses first-party `/api/v1/geo/reverse-geocode` with `provider="dgfy-ph-local"` and `precision` metadata. The endpoint must return the most specific local label available from bundled PH-local data and must not return vague `Near ...` labels; if no local match is available, it returns `Pinned location (lat, lon)` with `precision="coordinate_only"`. Bundled local matches carry PSGC provenance metadata and may expose PSGC code fields, but centroid-based labels are administrative suggestions rather than street/building geocodes.
5. Map reverse geocode produces address suggestions. It may fill an empty address field, but it must not overwrite merchant-edited address text unless the merchant explicitly applies the suggested address.
6. `storefront_hours` weekly schedules now support multiple intervals per day with `weekly.{sun..sat}.intervals[]`. Legacy `{ enabled, open, close }` values normalize to one interval, and legacy free-text remains display-compatible. Storefront display groups matching multi-interval day schedules, and checkout/service booking gates evaluate every interval.

## Addendum (2026-05-21): DGFY Account Founder Source

1. Public company registration now requires an authenticated global DGFY account as defined by ADR 0022.
2. Founder email, phone, username seed, and password hash are derived from that DGFY account instead of being collected directly on the company-registration form.
3. First login can still use the normal SKUpervisor login handoff with company token, while the DGFY membership registry becomes the durable link between the founder's global account and tenant master-admin user.

## Addendum (2026-07-02): POS Onboarding Starter Item Reuse

1. DGFY POS onboarding includes a dedicated `starter_item` step after Storefront setup and before POS terminal setup.
2. The POS onboarding starter-item step must call the existing `POST /api/v1/onboarding/items/bulk` contract. It must not introduce a POS-only onboarding item API, duplicate mode taxonomy rules, or create a separate POS item model.
3. The starter row uses the same customer-facing onboarding presets already defined here: Food Manufacturing `finished_product`, MSME `product`, Services `service` or `physical_add_on`, and Food & Beverage `menu_item`.
4. Existing onboarding row-level validation, generated-SKU duplicate/idempotency behavior, optional stock, optional cost, optional images, saved primary `location_id`, and completion readiness remain authoritative for POS onboarding.
5. POS onboarding may use POS catalog readback as a local readiness hint, but backend onboarding completion remains governed by the tenant onboarding checklist and starter-item contract.
