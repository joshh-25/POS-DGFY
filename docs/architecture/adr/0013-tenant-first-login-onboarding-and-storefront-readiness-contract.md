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
- `primary_location`: create or update the active primary storefront location pin used by discovery and tenant-page map surfaces. IMS setup surfaces use a MapLibre pin picker for click-to-place, drag-to-adjust, geolocation, delivery-radius preview, and initial Storefront business-hours setup while preserving editable coordinate fields.
- `bulk_items`: create starter catalog rows from the active workflow mode's onboarding item presets.

5. Required completion checklist
- Store name ready (registration baseline)
- At least one active primary storefront location
- At least one active starter item with positive `default_sale_price`
- For corrected item-taxonomy modes, the starter item must carry a mode-valid `mode_item_preset`
- `current_stock=0` does not block onboarding completion

6. Mode-aware starter item contract
- The bulk item step resolves the tenant workflow mode and presents item type choices from the shared `mode_item_preset` taxonomy.
- Corrected modes use their existing presets: Food Manufacturing (`raw_material`, `packaging`, `supplies`, `finished_product`), MSME (`product`, `supplies`), Services (`service`, `physical_add_on`, `supplies`), and Food & Beverage (`menu_item`, `ingredient`, `packaged_beverage`, `packaging_supply`).
- Placeholder modes keep conservative default item behavior until their governed taxonomy is promoted.
- Bulk onboarding rows require only `mode_item_preset`, `name`, and positive `default_sale_price`. `cost_per_unit`, `current_stock`, and item image upload are optional.
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
2. The tenant is provisioned and activated during registration before the frontend performs the normal login call for the founder.
3. `TENANT_REGISTRATION_APPROVAL_MODE=manual` remains available as an explicit rollback/admin-review mode for operators who need pending platform-admin approval before provisioning.
4. Tenant onboarding initialization still occurs during provisioning and remains a soft-reminder flow after first login.

## Addendum (2026-05-18): Mode-Aware Three-Step Onboarding
1. The previous business-profile, business-classification, and readiness-only wizard contract is replaced by three merchant setup steps: optional brand assets, primary storefront location, and mode-aware bulk starter items.
2. Completion readiness now checks `store_name_ready`, `has_primary_storefront_location`, and `has_priced_starter_item`.
3. Stock quantity and item image uploads are optional onboarding data. A zero-stock active item can complete onboarding when it has a positive customer selling price and, for corrected modes, a valid onboarding preset. Merchant-facing onboarding copy uses `Item image`; the existing Storefront catalog image storage/API contract remains unchanged.
4. Future workflow modes must define onboarding item choices, default hidden fields, financial rules, stock behavior, and backend/frontend tests before being considered production-ready.

## Addendum (2026-05-28): Business Hours Capture
1. The `primary_location` step now captures weekly Storefront business hours in addition to the primary pin and delivery radius.
2. Business hours remain non-blocking for onboarding completion, but the saved schedule becomes the long-term `storefront_hours` setting so merchants do not need a second setup pass in Settings.
3. Storefront discovery/profile surfaces display the derived business-hours label.
4. Storefront product quote/checkout and service booking/hold/batch mutations use the same setting to reject immediate or scheduled customer transactions outside configured hours while preserving legacy free-text `storefront_hours` values as display-compatible and non-breaking.

## Addendum (2026-05-21): DGFY Account Founder Source

1. Public company registration now requires an authenticated global DGFY account as defined by ADR 0023.
2. Founder email, phone, username seed, and password hash are derived from that DGFY account instead of being collected directly on the company-registration form.
3. First login can still use the normal SKUpervisor login handoff with company token, while the DGFY membership registry becomes the durable link between the founder's global account and tenant master-admin user.
