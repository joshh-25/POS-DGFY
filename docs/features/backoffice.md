---
status: reference
authority_level: reference
owner: product-and-pos
date: 2026-09-15
last_reviewed: 2026-09-15
review_by: 2027-03-14
applies_to: apps/dgfy-pos, apps/dgfy-api
topic: business_admin_backoffice_parity
---

# Business Admin (Back Office) parity plan

This document is the implementation plan for the user's requested UTAK-like
Business Admin capability. The attached UTAK feature breakdown is a benchmark
for capability discovery, not an instruction to copy UTAK code or its data
model. `BO-01` through `BO-15` are stable capability slices; they do not reset
the repository's continuous phase numbering.

## Architecture and ownership

Until the dedicated Back Office product in issue #1354 ships, the POS app is
the canonical merchant back-office surface. This follows the interim
placement rule in `AGENTS.md` and the amended [ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md).
The route is available at `/business-admin/*` and `/backoffice/*` on POS
(port 5174). The old `apps/dgfy-web` surface is not revived.

Business Admin is a tenant-scoped read and control-plane projection. It calls
the canonical owners instead of creating parallel truth:

- POS owns checkout, payments, receipts, shifts, drawer events, refunds,
  voids, delivery operations, and terminal/hardware mutations.
- Catalog and inventory services own item identity, category membership,
  pricing, stock movements, FIFO batches, and recipe consumption. See
  [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md),
  [ADR 0009](../architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md),
  and [ADR 0040](../architecture/adr/0040-weighted-average-cost-valuation-and-variance-analytics.md).
- Storefront owns public catalog/order presentation; accepted online orders
  are visible through the POS order center.
- DGFY identity, membership, and company switching remain owned by the DGFY
  account/authentication contracts. Customer analytics keeps tenant-scoped
  identity rather than merging global identities; see [ADR 0023](../architecture/adr/0023-front-facing-dgfy-customer-account.md).
- F&B tables, checks, kitchen tickets, modifiers, and service-charge
  snapshots remain POS/F&B-owned; see [ADR 0019](../architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md).
- Fiscal evidence is read-only until the BIR/CAS accreditation and legal
  filing gates in [ADR 0042](../architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md)
  are satisfied.

The API follows the governed `routes -> controllers -> usecases ->
repositories -> models` boundary from
[Architecture Boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md) and
[Architecture Governance](../architecture/ARCHITECTURE_GOVERNANCE.md).

## BO slices

| Slice | UTAK benchmark area | Present implementation | Status and remaining gate |
| --- | --- | --- | --- |
| BO-01 | Dashboard and real-time business overview | `GET /api/v1/business-admin/bootstrap` and `/overview`; POS Overview workspace with sales, branches, registers, shifts, alerts, and recent orders. | `implemented`; real-time means the latest server read model, with alert reconciliation scheduled by the API. |
| BO-02 | Transactions and transaction details | `/orders` and `/orders/:id`; searchable order center, receipt-safe lines, payment state, refunds, and status timeline. The existing POS terminal also owns park/resume-sale flow, linked from the workspace rather than duplicated here. | `implemented`; mutations stay in POS. |
| BO-03 | Sales reports and analytics | Report catalog, paginated datasets, CSV/XLS export, date/branch scope, and cost redaction. | `implemented`; formulas are delegated to finalized POS snapshots. |
| BO-04 | Z-reading and BIR reporting | Fiscal workspace reads X-reading summaries, persisted Z-reading records, and eSales evidence. | `partial`; BIR accreditation, CAS/POS registration, and legal filing are external gates. |
| BO-05 | Product Mix | `sales_by_item` and `sales_by_category` report datasets with quantity, net sales, and transaction counts. | `implemented`; no second sales calculation is introduced. |
| BO-06 | Products and menu configuration | POS-native catalog/inventory entry point, recipe visibility, and report links; catalog identity and mutations remain in the POS/catalog owner. | `partial by design`; category/item authoring must use the canonical POS catalog workflow. |
| BO-07 | Inventory, ingredients, movement, and low stock | FIFO valuation projection, branch stock read model, low-stock dataset, recipe visibility, alert snapshots, and additive indexes. | `implemented` for read/monitoring; stock mutations remain inventory-owned. |
| BO-08 | Expenses and profit after expenses | Explicit Expenses workspace explains the missing accounting ledger and links cash movement to POS drawer history. | `blocked`; accounting owner, tax treatment, retention, and an approved expense schema are required before writes or profit-after-expenses are enabled. |
| BO-09 | Cash drawer monitoring | Shifts & cash workspace reads shift totals, drawer variance, open/overdue shifts, and handoff/refund activity. | `implemented` read-only; force-close remains a canonical POS command. |
| BO-10 | Customers and purchase behavior | Tenant-scoped customer list/detail, purchase frequency, spend, favorite products, and recent orders. | `implemented`; global identity remains separate. |
| BO-11 | Staff and attendance | Team & access/workforce read model and an Attendance workspace for POS operator sessions. | `partial`; selfie time-in/time-out is an explicit ADR 0073 non-goal until privacy, consent, retention, and owner approval exist. Payroll is also out of scope. |
| BO-12 | Audit trail | Tenant-wide audit endpoint with actor/entity/outcome fields and sensitive-value redaction. | `implemented`; audit writes remain at the owning command boundary. |
| BO-13 | Multiple stores and centralized monitoring | Branch workspace, branch-scoped filters, and optional all-company overview backed by accepted DGFY memberships. | `implemented` for authorized memberships; unavailable or unauthorized companies are excluded fail-closed. |
| BO-14 | Online orders | POS order center exposes Storefront source, fulfillment, payment, and lifecycle status. | `implemented`; public ordering remains Storefront-owned and delivery runs remain POS-owned. |
| BO-15 | Account and business configuration | Bootstrap access/capability contract, onboarding, storefront, F&B, settings, notification, and approval workspaces. | `partial by design`; identity, catalog, terminal, payments, and other writes must use their canonical owners. |

## High-risk and policy gates

The following are intentionally visible in the UI as explicit gates rather
than being represented by invented tables or unsafe mutations:

| Gate | Current status | Owner / decision date |
| --- | --- | --- |
| Expenses and profit-after-expenses | `deferred`; cash added/cash-out remains POS drawer activity, not an expense. | Finance/accounting owner to be assigned; date pending. |
| Selfie attendance | `deferred`; biometric capture is outside the approved POS attendance contract. | Product, privacy/legal, and HR owner to be assigned; date pending. |
| Refund and force-close approvals | `blocked`; the canonical POS command is not exposed, so the API fails closed with `BUSINESS_ADMIN_APPROVAL_OWNER_UNAVAILABLE`. | POS command owner; date pending. |
| BIR/CAS accreditation | `deferred`; stored fiscal evidence is not proof of accreditation, registration, or filing. | Compliance/legal owner; date pending. |
| PayMongo payout/settlement | `deferred`; monitoring reports stored sessions/refunds only, not provider payout or bank settlement. | Payments/finance owner; date pending. |
| Terminal heartbeat | `deferred`; the terminal registry is authoritative and heartbeat is optional telemetry. | Terminal telemetry owner; date pending. |

`date pending` is an explicit unresolved dependency, not an inferred approval.
Do not add camera storage, expense writes, payout reconciliation, fiscal filing,
or duplicate POS command paths until the listed owner makes the corresponding
contract decision.

## Data and API delivery

The additive Business Admin schema is provided by migration-runner files
`20260914000005` through `20260914000009` (saved report views, alert
snapshots, report indexes, notification lifecycle, and approval requests).
The API module is under `apps/dgfy-api/src/modules/businessAdmin`, mounted at
`/api/v1/business-admin`, and the POS client is under
`apps/dgfy-pos/src/features/businessAdmin`.

No destructive migration or historical data rewrite is required. The local
development landlord/tenant schemas were migrated and the read models reuse
existing POS, inventory, fiscal, customer, and commerce-payment records.

## Validation and acceptance

Completed evidence for the current implementation:

- migration-runner applied `20260914000005`–`20260914000009` successfully;
- Business Admin contract tests pass (access denial, reconciliation projection,
  and approval fail-closed behavior);
- API lint and POS lint/build pass with zero errors;
- authenticated local API smoke reached bootstrap, overview, reports,
  valuation, low stock, recipes, customers, orders, shifts, workforce, fiscal,
  notifications, approvals, audit, and payment monitoring; unauthenticated
  Business Admin access returns 401;
- authenticated desktop (1440px) and mobile (390px) renders show the complete
  navigation and a working Orders transition, with no console errors, failed
  Business Admin requests, or horizontal page overflow;
- the targeted compliance declaration/API-contract check passed for this
  initiative. The unscoped local compliance command still sees unrelated dirty
  declarations from other worktree changes and is not used as evidence for
  this phase;
- local stack is healthy on SKUpervisor 5173, POS 5174, Storefront 5175, API
  5000, device bridge 5101, and MySQL 3306.

The rendered route, targeted compliance, architecture, documentation, relevant
API/POS tests, migration status, and `git diff --check` gates are complete.
The unresolved owner/policy gates above are formally deferred and remain
visible in the product; they are follow-up decisions, not hidden parity gaps.

## Continuous phase mapping

This initiative is recorded as repository **Phase 351** in the authoritative
[implementation phase ledger](IMPLEMENTATION_PHASE_LEDGER.md). The BO IDs
above are capability slices inside that phase; they do not create a new
Phase 0/1 sequence and do not modify `Implementation.md`. Current phase
status is `completed` for all feasible implementation scope. The listed
external/policy gates are formally deferred with owners still to be assigned;
resolving them requires a separately approved follow-up phase.

## POS settings migration into Back Office

Recorded: 2026-09-15. Status: Phases 360–364 (inventory, reusable model, route
access/navigation, editor relocation, and POS entry-point switching) are
completed; final hardening remains planned.
Current phase for this initiative: 364 (completed). Next eligible phase: 365.
These phases extend the existing Back Office workspace within the POS application.

### Migration destinations

| Current setting | Back Office destination |
| --- | --- |
| Business details, TIN, receipt information/footer | Business settings → Business & receipts |
| Terminal registry and branch assignments | Registers |
| Cashier invitations, permissions, approval PIN administration | Team & access |
| Attendance configuration | Attendance → Settings |
| Discounts and POS business preferences | POS configuration |
| Downpayment/payment policies | Payments → Settings |
| Storefront profile, images, hours and visibility | Storefront → Settings |
| Branches, fulfillment rules and delivery pricing | Branches / Delivery settings (dedicated delivery editor) |
| Employee directory and credit administration | Team & access / Employee credit |

Keep terminal controls accessible in POS: printer/device setup, test printing,
sound preferences, terminal selection, opening/closing shifts, cash drawer
actions, cashier handoff and checkout.

### Phase 360 inventory baseline (completed 2026-09-15)

Phase 360 records the current POS settings contract before any form extraction or
route move. The inventory covers the `SettingsWorkspace`, its shared settings
cards, the settings services they call, and the adjacent user, employee,
location, attendance, and payment-policy surfaces. A setting is not considered
migrated merely because it has a Back Office navigation label; Phase 361 and
later must provide the reusable form and the route-level authorization.

#### Tenant `system_settings` and generic `/settings`

These values are stored as rows in the tenant `system_settings` table. The
tenant is selected by `dbStore`/request context; there is no `tenant_id` column
on the row. `GET /settings` returns the safe value projection and is cached by
the web-core settings service for 30 seconds. `PUT /settings` and
`PUT /settings/:key` require `settings:edit`, invalidate that cache, and retain
the existing settings use-case guards. A later Back Office route must preserve
these server-side checks rather than treating Business Admin access as edit
authority.

| Ownership group | Existing keys and fields | API/permission | Stored scope and Back Office destination |
| --- | --- | --- | --- |
| Business and receipts | `pos_registered_name`, `pos_business_name`, `pos_business_style`, `pos_taxpayer_type`, `pos_tin_branch`, `pos_address`, `pos_ptu_number`, `pos_min_number`, `pos_accreditation_number`, `pos_fiscal_buyer_details_required`, `pos_receipt_footer_message` | `GET /settings` and `PUT /settings`; normal edit is `settings:edit`, with existing fiscal/platform/legal guards preserved | Tenant/company-wide rows; Business settings → Business & receipts. Fiscal identifiers and buyer-detail behavior must remain read-only or gated until the BIR/CAS contract allows editing. |
| POS configuration and operational defaults | `pos_discount_profiles` (name, percentage, active; maximum 20), `pos_employee_discount_self_approval_enabled`, `voucher_pos_redemption_enabled`, `pos_petty_cash_symbol`, `pos_petty_cash_amount`, `pos_open_status`, `pos_wait_time_minutes`, `inventory_low_stock_display_threshold`, `pos_best_seller_settings` (`enabled`, `lookback_days`, `top_limit`, `daily_top_enabled`) | `GET/PUT /settings`; `settings:edit` and the existing discount/feature guards. `voucher_pos_redemption_enabled` is currently off by default because its redemption runtime is not complete | Tenant/company-wide. POS configuration. `pos_wait_time_minutes` is a tenant default; location-specific wait time lives on `tenant_locations`. Petty-cash fields are configuration/display values, not cash-drawer events. |
| Registers and terminal policy | `pos_terminal_registry` (each entry: `terminal_id`, `label`, `location_id`, `cashier_email`, `is_active`, `is_default`, `device_enforcement`; pairing/password material is write-only), `pos_terminal_registry_mode` (`warn`/`enforce`), `pos_terminal_location_binding_enforced` | `GET/PUT /settings`; `settings:edit` plus the existing tenant-admin/device-policy checks. Secret hashes are created and sanitized by the settings use case | Tenant-wide policy with entries bound to a branch/location. Registers. Actual device enrollment, pairing challenges, device proof, printer tests, sound, drawer, and terminal selection remain POS/device-owned. |
| Storefront identity and access | `store_tenant_slug` (including `POST /settings/storefront-slug/generate`), `store_is_visible`, `store_has_no_location`, and editable `customer_access_mode` | Generic settings reads/writes; slug generation requires `settings:edit`; customer-access changes retain their policy guard | Tenant/company-wide rows. Storefront → Settings. The effective/max/registration-stage projection fields (`customer_access_effective_mode`, `customer_access_max_mode`, `customer_access_platform_max_mode`, `customer_access_registration_stage_max_mode`, `customer_access_limitation_reason`, `customer_access_registration_stage`, `customer_access_flag_status`) are read-only runtime values, not editors. |
| Storefront profile and presentation | `storefront_tagline`, `storefront_phone`, `storefront_email`, `storefront_about`, `storefront_hours`, `storefront_why_choose_us`, `storefront_social_links` (Messenger/Facebook/Instagram), `storefront_ui_v2_enabled`, `storefront_categories`, `storefront_gallery_images`, `storefront_delivery_partners`, `storefront_review_highlights`, `storefront_review_summary` (`score`, `total_count`, `star_distribution`), `storefront_follow_enabled`, `storefront_share_enabled`, `storefront_guest_checkout_enabled`, `storefront_cash_payment_enabled` | Generic settings read/write; branding uploads use `POST/DELETE /settings/storefront-assets/:asset_type` and `settings:storefront_branding_edit` | Tenant/company-wide rows. Storefront → Settings. Cover/profile assets use URL/path pairs (`storefront_cover_image_url/path`, `storefront_profile_image_url/path`); gallery upload returns a path and is published in `storefront_gallery_images` on save. Discovery/cache synchronization remains part of the existing settings use case. |
| Delivery pricing | `store_delivery_fee`, `store_delivery_fee_mode` (`fixed`/`calculated`/`free`), `store_delivery_fee_calc` (`min_fee`, `included_km`, `per_km_rate`, `increment_km`, `max_distance_km`) | `GET/PUT /settings`; `settings:edit`/master admin | Tenant/company-wide storefront policy. Dedicated Business Admin → Delivery pricing editor. The card still warns that calculated/free modes are not applied at checkout yet; Phase 363 keeps those modes visibly non-active until the checkout contract is implemented. |
| Safe indicators and protected values | `pos_settings_access_pin_enabled` is a read-only indicator. `pos_settings_access_pin_hash` is server-only; `pos_settings_access_pin` and `clear_pos_settings_access_pin` are write-only request fields and are master-admin-only. `pos_receipt_metadata_pending_changes` is a read-only review status. | `POST /settings/verify-pos-access-pin` for verification; normal settings reads redact protected values; writes retain master-admin and receipt-metadata guards | Tenant-scoped settings rows. POS configuration/Business & receipts as read-only status. Never expose a PIN or hash to a Back Office form. |
| Not a current editor / legacy or platform-owned | `pos_order_method_fees`, `storefront_promo`, `storefront_promos`, platform-controlled POS software identity keys, image-conversion keys, and workflow/capability/inventory authority keys recognized by the settings module but not edited by the current workspace | No new editor route in Phase 360; only their existing owning module/API may change them | Explicitly excluded from migration until an owner and contract are identified. Do not silently expose generic EAV keys just because `PUT /settings` accepts arbitrary keys. |

#### Canonical settings outside `system_settings`

| Surface and fields | Canonical API and permission | Storage, scope, and Back Office destination |
| --- | --- | --- |
| Personal profile: `username`, `email`, `phone_number` | `PUT /users/me`; authenticated account owner | Tenant `users` row; personal scope. Account/Profile. The same tenant account can be used by IMS and POS. |
| Company identity: company name/token returned by `GET /settings/company-info` | `GET /settings/company-info`; `requireMasterAdmin` | Landlord tenant identity; read-only. Business settings can display it but cannot turn it into a tenant setting. |
| Branch/location: `name`, `address_line`, `latitude`, `longitude`, `delivery_radius_km`, `is_open`, `is_active`, `is_primary_storefront`, `operating_hours`, `current_wait_time_minutes`, `allow_out_of_stock_sales`, `supports_delivery`, `supports_pickup`, `supports_dine_in`, `scheduling_enabled`, `immediate_fulfillment_enabled`, `fulfillment_lead_time_min_days`, `fulfillment_lead_time_max_days` | `GET /tenant-locations?include_inactive=true`; `POST/PUT/DELETE /tenant-locations`; writes require `settings:edit` | Tenant `tenant_locations` rows; branch/location scope. Branches and Storefront locations. `updated_at` is exposed as a read-only `location_version`; the current POS save does not yet submit it, so optimistic concurrency belongs to Phase 365 hardening. |
| User access and cashier administration: invitations, role/status/location grants, permission sets, `pos:void`, `pos:cash_drawer_adjust`, `pos:discount_authorize`, `pos:close_day`, plus approval/day-close PIN set or reset | `/users*`, `/pos/setup/cashiers`; `users:view`/`users:manage` or master admin, with each POS permission enforced by the API | Tenant `users` row and its bcrypt PIN hashes; per-user and optional branch grants. Team & access. Back Office access never automatically grants these edit permissions. |
| Cashier attendance configuration: `enabled`, `location_ids`, revision token | `GET/PUT /pos/attendance/config`; `settings:view` for read and `settings:edit` for write | Tenant `system_settings` key `pos_cashier_attendance_lifecycle_v1`, with active locations from `tenant_locations`; tenant/location rollout and transactional stale-revision/open-operation blockers. Attendance → Settings. Time-in/out, breaks, relief, and operator-session commands remain POS operational flows. |
| Downpayment policy: `payment_mode`, `downpayment_type`, `downpayment_rate_bps`, `downpayment_fixed_centavos`, `min_downpayment_centavos`, `downpayment_refundable`, and backend field `allowed_capture_methods` | `GET/PUT /downpayment/settings`; view requires `downpayment:view` or `downpayment:settings`, write requires `downpayment:settings` or master admin | Landlord `tenant_downpayment_settings`, one row per tenant. Payments → Settings. `allowed_capture_methods` is currently an API/model field not rendered by the POS panel and must remain explicitly backend-only until its UI/contract is approved. |
| Employee directory: `employee_code`, `full_name`, `email`, `phone`, nullable `location_id`, `is_active` | `GET/POST/PATCH /pos/employees`; `pos:employees:manage` or master admin | Tenant `employees` rows; employee/optional branch scope. Team & access. Employees may exist without a login account. |
| Employee credit: eligibility, `credit_limit`; read-only account code/balance/outstanding/version; repayment/adjustment reason and amount | `/pos/employee-credit/*`; `pos:employee_credit:manage` or master admin | Tenant `employee_credit_accounts` plus append-only ledger entries; employee/location scope. Employee credit. Repayment and adjustment are audited commands, not generic settings writes. |

#### Ownership overlaps and explicit exclusions

| Existing surface | Phase 360 decision |
| --- | --- |
| Phase 348 strict device UI/enrollment | Keep enrollment records, pairing challenges, device proof, printer/drawer/sound controls, and shift-safe terminal operations in POS. Back Office may later link to or monitor the registry, but does not create a second device store. |
| Phase 356 permission UI | Reuse the existing user, permission, role, and location-grant APIs. Do not create a second grant table. Phase 362 must add section-level authorization because the generic `settings:edit` route currently covers the generic settings contract. |
| Current `BusinessAdminPage` settings/onboarding/storefront/F&B/expenses/attendance workspaces | These are currently policy-gated informational workspaces (`SimpleWorkspace`), not migrated editors. Phase 361+ will embed extracted forms; Phase 360 records this gap without claiming it is fixed. |
| Park/resume sale | Remains the POS terminal's canonical transaction flow. Business Admin links to it instead of duplicating cart or shift state. |
| Settings refresh | Keep the existing 30-second tenant/company cache and invalidation after successful writes. Later phases must document whether each value takes effect immediately, on next order, on next shift, or after terminal refresh. |

#### Phase 360 result and migration decision

Every current editor field and adjacent settings contract now has a named API,
permission, storage owner, scope, Back Office destination, and terminal-owned
exclusion. The inventory found no schema or data migration requirement:
`system_settings`, `tenant_locations`, `users`, `employees`, employee-credit
tables, and landlord downpayment settings remain the source of truth. No runtime
code, setting key, stored value, or historical receipt was changed in Phase 360.
The identified follow-ups (section-specific authorization, location-version
write protection, delivery-mode runtime support, and explicit treatment of
backend-only/platform keys) are acceptance inputs for Phases 361–365.

### Phase 361 implementation result (completed 2026-09-15)

Phase 361 extracted the reusable settings model from the terminal workspace into
`packages/web-core/src/features/pos/utils/settingsWorkspaceModel.js`. The model
now owns settings hydration/readback, POS and Storefront payload construction,
discount and field validation, terminal-registry add/update/remove rules,
Storefront list/object-row mutations, location payload construction, and
fulfillment lead-time validation. `TerminalOperationsWorkspace.jsx` delegates
these state and persistence operations to the shared model while preserving its
existing route, permissions, API keys, terminal protections, and visual behavior.

The existing specialized settings cards remain the canonical reusable UI for
downpayment, delivery pricing, cashier attendance, employee credit, and related
settings. Phase 361 intentionally does not move the visual editors into the
Business Admin route; route authorization is Phase 362 and the actual editor
relocation is Phase 363. No API contract, setting key, storage owner, schema, or
historical data changed, so no data migration was required.

Acceptance evidence for this phase includes the focused
`settingsWorkspaceModel.contract.test.js` suite (4 tests passed), the shared POS
settings contract suites (15 tests passed), POS lint, and the POS production
build. The extraction keeps one implementation of the normalization, payload,
registry, storefront-list, and location-validation rules for both current and
future settings surfaces.

### Phase 362 implementation result (completed 2026-09-15)

Phase 362 adds the route and authorization boundary for the settings migration
without moving an editor or changing a settings owner. The Business Admin
bootstrap now projects `settings_sections` from the existing owner permissions:
`settings:view`/`settings:edit`, `users:view`/`users:manage`, and
`downpayment:view`/`downpayment:settings`. Branch and register authoring is
exposed as editable only for tenant-wide Business Admin scope; assigned users
can still see the section without receiving a cross-branch edit grant.

The POS Business Admin surface now supports nested settings routes under both
`/business-admin/settings/:section` and `/backoffice/settings/:section`. It
shows only server-authorized sections, labels tenant-wide versus selected-branch
scope, constrains branch context to the bootstrap location scope, and links to
the canonical POS settings view modes (`settings_profile`, `settings_pos`, or
`settings_storefront`). Those POS settings modes are shift-exempt; no cashier
shift is opened by the handoff. Existing owning APIs remain the write boundary,
so Business Admin access does not grant `settings:edit`, user-management, or
payment-policy permissions.

Internal Business Admin navigation and owner handoffs use the unsaved-change
guard. The page also registers a `beforeunload` guard whenever a migrated editor
reports a dirty draft. Phase 362 supplied this reusable navigation boundary;
Phase 363 connects the extracted forms to it without changing any setting key,
API write contract, storage owner, schema, or historical data, so no data
migration was required.

The focused Business Admin settings capability tests (7 tests) and POS settings
navigation/model tests (6 tests) passed. API lint and POS lint passed; the
existing canonical API permission gates remain the rejection path for
unauthorized mutations.

### Phase 363 implementation result (completed 2026-09-15)

Phase 363 moves the named configuration editors into the nested Business Admin
settings routes while keeping the existing POS implementation as the single
form and API owner. `BusinessAdminPage.jsx` now embeds the exported
`SettingsWorkspace` with a section-specific tab allow-list and a narrow,
server-projected editor user. The routes cover Business & receipts, POS
configuration, Storefront, dedicated Delivery pricing, branch/location
authoring, Attendance, Payments, Registers, and Team & access.

The Team route also exposes the canonical User Management modal (read-only when
the account only has `users:view`), employee directory, delivery personnel,
employee credit, cashier invitations and existing POS cashier/discount/Day
Close access controls. The editor preserves the owning permissions and
write-only PIN behavior; Business Admin visibility never grants a new API
permission. View-only projections still load persisted values, while fieldsets,
handlers, and save actions are disabled when the projected edit capability is
absent. Branch routes constrain the locations list to the selected visible
branch, and the shared dirty-draft callback feeds the internal and
`beforeunload` navigation guards.

Storefront uploads, gallery edits, validation modals, location CRUD, settings
cache invalidation, save feedback, and forced readback continue to use the
existing services. Terminal queue/sound/device controls, active-shift and cash
drawer operations, checkout, and device enrollment remain POS-only. Calculated
and free delivery modes remain explicitly marked as unavailable at checkout;
this phase does not claim runtime pricing support that the backend does not
provide. No database, settings-key, or data migration was required.

Acceptance evidence: the six shared editor/navigation behavior files passed (27
tests); six shared POS settings contract files passed (98 tests); the API
Business Admin contracts passed (7 tests); the POS Business Admin settings model
contract passed (6 tests); POS lint and production build passed (3,009 modules,
existing chunk-size/dynamic-import warnings only); architecture checks passed
(55 modules, 617 code files, 98 controllers); documentation/ADR checks passed
(30 governed docs, 89 ADRs); and the scoped changed-file whitespace check
passed. Current phase: 363 completed. Next eligible phase: 364.

### Phase 364 implementation result (completed 2026-09-15)

Phase 364 switches the administrator entry points without moving terminal
operations out of POS. The POS sidebar now sends authorized non-cashier users
to the scoped Business Admin settings route, while a separate Terminal Setup
view keeps terminal registry and branch-binding policy plus local queue/sound
controls in POS. Cashiers and onboarding users retain their existing settings
entry behavior, and direct legacy settings URLs continue to resolve.

Business Admin save operations publish versioned tenant/branch metadata through
the local event, storage, and BroadcastChannel paths. An open POS terminal
subscribes to that signal and refreshes user, terminal metadata, setup state,
locations, and operational context in the background. The Team & access modal
uses the same callback for role, permission, invitation, status, branch-grant,
bulk, removal, and ownership mutations. The refresh is scoped to the active
tenant, never carries setting values, and does not navigate, clear a cart, close
a shift, or change the active terminal. Existing owner APIs, permissions,
setting keys, storage owners, PIN secrecy, and device/shift protections remain
unchanged; no data migration was required.

Acceptance evidence: the Business Admin navigation/sync contract suites passed
(2 files, 8 tests); the shared Back Office navigation suite passed (6 files,
83 tests); the full POS suite passed (4 files, 16 tests); POS lint passed; and
the POS production build passed (3,010 modules, existing dynamic-import and
chunk-size warnings only). Documentation/ADR checks passed (30 governed docs,
89 ADRs), architecture checks passed (55 modules, 617 code files, 98
controllers), and `git diff --check` passed. The targeted source checks cover
scoped settings URLs, terminal-only entry points, tenant/branch metadata
publication, subscriber deduplication, Team mutation callbacks, and background
refresh wiring. Final concurrency, offline, cross-company, and responsive
hardening remains Phase 365.

### Phase 365 implementation progress (in progress 2026-09-15)

Phase 365 now closes the stale-write and cross-window isolation gaps identified
by the Phase 360 field inventory while keeping the existing owners. Generic
`system_settings` writes use the existing `updated_at` timestamp as a
transport-only optimistic-concurrency precondition (`expected_updated_at` for a
single setting or a keyed map for bulk writes). The repository performs a
compare-and-set update and returns HTTP 409 on a stale or missing version.
Downpayment settings use the existing landlord
`tenant_downpayment_settings.updated_at` column and the same 409 contract.
Tenant-location primary updates continue to use the existing
`last_known_updated_at` contract. No migration or new persistence owner was
introduced.

The shared POS settings model now captures setting versions from read responses
and maps conflict/network failures to safe user feedback. POS, Storefront,
delivery-pricing, and downpayment saves send the precondition when one is
available and force a canonical readback after success. Save handlers only clear
their drafts after a successful response, so a conflict or offline failure does
not claim success or discard the local draft. Existing carts, shifts, terminal
identity, and offline POS persistence are outside this settings refresh path.

Cross-window Business Admin signals remain metadata-only. The POS subscriber
now rejects mismatched tenants, mismatched branches, malformed branch IDs, and
branch-scoped events when no active branch is known; tenant-wide events retain
their existing tenant scope. The server-projected Business Admin capability
matrix and canonical route permission gates remain the authorization boundary;
the new concurrency metadata does not grant access.

Evidence completed in this pass: API concurrency/validator/use-case tests
passed (7 suites, 101 tests, including compare-and-set and stale-write cases),
and the API permission/business-admin contracts passed (2 suites, 10 tests).
The configured POS suite passed (5 files, 21 tests), the selected shared
web-core settings/navigation suites passed (4 files, 23 tests), and the
responsive contract covers the 900px settings collapse, 680px mobile shell,
one-column context grid, and horizontally scrollable tables. POS, Storefront,
and API lint/build checks passed with repository-existing warnings only; docs,
architecture, and API compliance-contract checks passed. The changed-file
scoped compliance-impact check also passed for the Phase 365 surfaces (8
sensitive files and `2026-09-15-business-admin-parity.md`). No migration was
required. Authenticated two-company/two-branch browser and rendered
desktop/mobile evidence are also complete: using the documented local admin
account and direct tenant-session handoff, the Back Office loaded for both
`Tindahan Ko` and `Masu Cafe` with HTTP 200 login/session responses, expected
tenant cookies, no page errors or failed page responses, and no cross-company
names in either tenant's profile or branch view. Tindahan Ko exposed only
branch 1 (`Tindahan Ko`); Masu Cafe exposed branches 1, 4, and 3 (`Masu Cafe`,
`Spacebar`, and `Ungka Branch`), and selecting branch 4 updated the visible
branch to `Spacebar`. Desktop and mobile captures for both companies, plus
mobile branch captures, are stored under `.tmp/phase365-browser-evidence/`.

Rollback is code-only: revert the Phase 365 application changes to restore the
previous write path and event subscriber. Persisted setting keys and values
remain valid because no schema/data migration or new owner was added; no data
rollback is required. The repository-wide compliance impact check is still
blocked by eight pre-existing unrelated dirty declaration/surface mismatches;
the Phase 365 scoped impact and API contract checks passed. The phase remains
in progress only until that repository-wide compliance condition is resolved.

### Implementation phases

| Phase | Scope | Completion requirement |
| --- | --- | --- |
| 360 — Settings inventory and ownership | Map every existing field, API, permission, storage location and scope: business, branch, terminal or personal. Identify overlapping device/access work. | Every current setting has an explicit destination; no missing controls. |
| 361 — Extract reusable settings forms | Separate forms and loading/saving logic from the large terminal workspace. Reuse shared components where both surfaces need them. | Existing POS forms still work; no duplicated business logic. |
| 362 — Back Office access and navigation | Add settings routes, section permissions, tenant/branch context and unsaved-change protection. | Authorized users can configure the business without opening a cashier shift; unauthorized API requests are rejected. |
| 363 — Migrate configuration editors | Move the configuration forms, including validation, uploads, save feedback and reload/readback. | Every migrated form saves successfully and displays the persisted value after refresh. |
| 364 — Switch POS entry points | Replace migrated configuration screens with Back Office links. Retain device and operational controls. Refresh affected POS settings after changes. | Existing links remain usable; active carts/shifts survive navigation; settings reach the correct terminal/branch. |
| 365 — Hardening and acceptance | Test permissions, company switching, branch isolation, concurrent edits, offline behavior, desktop/mobile layouts and affected builds. | Complete field-by-field migration evidence, successful save/readback tests and documented rollback. |

### Implementation rules

- Preserve existing settings keys and backend ownership; no database migration
  is expected unless inventory reveals a specific need.
- Back Office access must not automatically grant editing rights. Preserve
  `settings:edit`, user-management, payment-policy and master-admin restrictions.
- Mark company-wide settings clearly so selecting a branch cannot accidentally
  imply a branch-only change.
- Preserve receipt history, configured PIN secrecy, device enforcement and
  active shift protections.
- Use existing settings refresh/cache mechanisms; define when each change takes effect.

### Documentation and validation

Keep the detailed plan here, with phase entries in the required
[phase ledger](IMPLEMENTATION_PHASE_LEDGER.md). Leave `Implementation.md` untouched.

The approach follows [Architecture Boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md),
[Architecture Governance](../architecture/ARCHITECTURE_GOVERNANCE.md),
[ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md)'s shared-component rules,
and [ADR 0031](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)'s
terminal/settings ownership. For Phase 360, documentation lint,
architecture-boundary checks, and the changed-file whitespace check passed. For
Phase 361, the focused model and shared POS contract tests, POS lint/build,
documentation lint, architecture checks, and changed-file whitespace checks
passed. Phase 362 added the route boundary; Phase 363 completed the runtime
editor relocation; and Phase 364 completed entry-point switching plus the
cross-window refresh contract. Final cross-device, concurrency, offline, and
responsive hardening remains Phase 365.

Primary existing code: `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
(`SettingsWorkspace`), `apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx`,
and their existing settings, identity, payment and terminal API services.
Phase 360 reconciled the specific API/permission and ADR impacts before
extraction. Phase 361 now provides the shared extraction boundary without a new
architecture exception. Phase 362 now supplies server-projected section access,
tenant/branch context, canonical owner handoffs, and the navigation guard. Phase
363 now supplies the canonical embedded editors, read-only projections, and
save/readback evidence. Phase 364 now supplies the POS-to-Back-Office entry
point split, terminal-only POS setup view, and tenant/branch settings refresh
signal. Phase 365 must verify all affected app builds,
behavioral/API tests, desktop/mobile rendering, documentation, architecture and
scoped compliance checks, plus rollback and settings readback.
