---
status: reference
authority_level: reference
owner: product-and-pos
date: 2026-09-15
last_reviewed: 2026-09-24
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
| BO-01 | Dashboard and real-time business overview | `GET /api/v1/business-admin/bootstrap` and `/overview`; POS Overview workspace with date/branch-scoped Gross Sales, Refunds, Discounts, Net Sales, Gross Profit, and VAT KPI totals, sales, branches, registers, shifts, canonical operational notifications, and recent orders. | `implemented`; real-time means the latest server read model, with notification reconciliation scheduled by the API. |
| BO-02 | Transactions and transaction details | `/orders` and `/orders/:id`; searchable order center with date/branch/receipt-type filters for sales, finalized refunds, and voided receipts. Selecting a row opens an accessible read-only popup that renders the original shared POS receipt from canonical transaction fields and saved fiscal snapshots, with refund/void evidence. The existing POS terminal also owns park/resume-sale flow, linked from the workspace rather than duplicated here. | `implemented`; mutations stay in POS. |
| BO-03 | Sales reports and analytics | Report catalog, paginated datasets, CSV/XLS export, date/branch scope, and cost redaction. | `implemented`; formulas are delegated to finalized POS snapshots. |
| BO-04 | Z-reading and BIR reporting | Fiscal workspace reads X-reading summaries, persisted Z-reading records, and eSales evidence. | `partial`; BIR accreditation, CAS/POS registration, and legal filing are external gates. |
| BO-05 | Product Mix | `sales_by_item` and `sales_by_category` report datasets with quantity, net sales, and transaction counts. | `implemented`; no second sales calculation is introduced. |
| BO-06 | Products and menu configuration | POS-native catalog/inventory entry point, recipe visibility, and report links; catalog identity and mutations remain in the POS/catalog owner. | `partial by design`; category/item authoring must use the canonical POS catalog workflow. |
| BO-07 | Inventory, ingredients, movement, and low stock | FIFO valuation projection, branch stock read model, low-stock dataset, recipe visibility, alert snapshots, and additive indexes. | `implemented` for read/monitoring; stock mutations remain inventory-owned. |
| BO-08 | Expenses and profit after expenses | POS Business Admin now provides a tenant-local operational expense ledger with branch scope, PHP totals, idempotent create, audit-backed void, and search/date/branch filters. Cash movement remains in Shifts & cash. | `partial`; operational expense capture is enabled for authorized admin/manager users, while statutory accounting, tax treatment, retention mapping, and profit-after-expenses remain deferred. |
| BO-09 | Cash drawer monitoring | Shifts & cash workspace reads shift totals, drawer variance, open/overdue shifts, and handoff/refund activity. Overview and Shift History consume the shared `businessAdminShiftActivityRepository` projection for per-shift orders, discounts, refunds, and voids. | `implemented` read-only; force-close remains a canonical POS command. |
| BO-10 | Customers and purchase behavior | Tenant-scoped customer list/detail, purchase frequency, spend, favorite products, and recent orders. | `implemented`; global identity remains separate. |
| BO-11 | Staff and attendance | Team & access/workforce read model plus a read-only Attendance workspace for canonical POS attendance and operator sessions. | `implemented` for POS attendance/operator-session reads; selfie time-in/time-out remains an explicit ADR 0073 non-goal until privacy, consent, retention, and owner approval exist. Payroll is also out of scope. |
| BO-12 | Audit trail | Tenant-wide audit endpoint with actor/entity/outcome fields and sensitive-value redaction. | `implemented`; audit writes remain at the owning command boundary. |
| BO-13 | Multiple stores and centralized monitoring | Branch workspace, branch-scoped filters, and optional all-company overview backed by accepted DGFY memberships. | `implemented` for authorized memberships; unavailable or unauthorized companies are excluded fail-closed. |
| BO-14 | Online orders | POS order center exposes Storefront source, fulfillment, payment, and lifecycle status. | `implemented`; public ordering remains Storefront-owned and delivery runs remain POS-owned. |
| BO-15 | Account and business configuration | Bootstrap access/capability contract, onboarding, storefront, F&B, settings, notification, and approval workspaces. | `partial by design`; identity, catalog, terminal, payments, and other writes must use their canonical owners. |

## High-risk and policy gates

The following are intentionally visible in the UI as explicit gates rather
than being represented by invented tables or unsafe mutations:

| Gate | Current status | Owner / decision date |
| --- | --- | --- |
| Expenses and profit-after-expenses | Operational expense capture is `implemented` for the approved ledger contract; cash added/cash-out remains POS drawer activity, not an expense. Profit-after-expenses, tax mapping, and statutory accounting remain `deferred`. | Finance/accounting owner and follow-up accounting contract required for deferred calculations; date pending. |
| Selfie attendance | `deferred`; biometric capture is outside the approved POS attendance contract. | Product, privacy/legal, and HR owner to be assigned; date pending. |
| Refund and force-close approvals | `blocked`; the canonical POS command is not exposed, so the API fails closed with `BUSINESS_ADMIN_APPROVAL_OWNER_UNAVAILABLE`. | POS command owner; date pending. |
| BIR/CAS accreditation | `deferred`; stored fiscal evidence is not proof of accreditation, registration, or filing. | Compliance/legal owner; date pending. |
| PayMongo payout/settlement | `deferred`; monitoring reports stored sessions/refunds only, not provider payout or bank settlement. | Payments/finance owner; date pending. |
| Terminal heartbeat | `deferred`; the terminal registry is authoritative and heartbeat is optional telemetry. | Terminal telemetry owner; date pending. |

`date pending` is an explicit unresolved dependency, not an inferred approval.
Do not add camera storage, tax/accounting calculations, payout reconciliation, fiscal filing,
or duplicate POS command paths until the listed owner makes the corresponding
contract decision.

## Data and API delivery

The additive Business Admin schema is provided by migration-runner files
`20260914000005` through `20260914000009` (saved report views, alert
snapshots, report indexes, notification lifecycle, and approval requests).
The API module is under `apps/dgfy-api/src/modules/businessAdmin`, mounted at
`/api/v1/business-admin`, and the POS client is under
`apps/dgfy-pos/src/features/businessAdmin`.

The read-only shift activity projection is implemented by
`businessAdminShiftActivityRepository.js`. It owns the shared shift-grain
aggregation used by Overview and Shift History, while the canonical POS report
read models remain responsible for gross/net sales, payment totals, and broader
financial reporting semantics. This phase introduces no new accounting
calculation or storage owner.

The Sales & Orders consolidation is implemented in the POS Back Office. Overview
stays summary-only; Sales timeline is the chronological unified POS/Dispatch
analysis surface; Order center owns original receipt investigation through the shared POS renderer; and Customers
reuses Order Center summaries for related transaction history. Shared Order
Center detail preserves customer, item, discount, payment, refund, and audit
evidence. Provider refund monitoring remains under Payments, and no standalone
refund mutation or duplicate refund owner is introduced. The sidebar keeps
Customers separate from Sales and groups governance, fiscal, notification,
onboarding, storefront, assistant, and business configuration destinations under
Settings without changing their route or canonical owner.

### Phases 455–459 workflow consolidation

The approved follow-up is recorded in the [Phase 455–459 workflow contract](backoffice-phase-455-459-contract.md).
Inventory insights now links to the existing Catalog editor, Stock Movements,
Suppliers, Purchase Orders, Recipes, and Production owners without adding a
second stock command surface. Packaging and labels remain Catalog-editor
workflow steps; physical stock counts remain an explicit owner decision rather
than an invented adjustment form. Reports preserve summary/read-model totals,
provide applicable report sorting and pagination, and hand transaction analysis
to Sales timeline and original receipt detail to Order Center. Workforce activity
distinguishes employee records, login accounts, roles, and branch grants while
Users & Roles remains the only permission-management workflow. Customer reads
remain tenant-scoped and loyalty is explicitly read-only until the earning,
redemption, refund, adjustment, ownership, and accounting contract is approved.

### Phase 442 reporting architecture consolidation

Reporting now has one canonical metadata registry at
`apps/dgfy-api/src/modules/reports/domain/reportRegistry.js`. It describes
definitions, filters, aggregation/read-model ownership, permissions, export
formats, pagination, formatting, and compatibility endpoints for the existing
Business Admin, legacy `/reports/*`, and terminal report families.

Business Admin dataset definitions and the financial/inventory repository sort
contracts consume that registry, removing the previous duplicated field lists.
Legacy report routes remain compatibility seams, and terminal reporting stays
POS-owned so active-shift, register, operational-state, and offline/local
reporting continue using the existing terminal read model. Individual report
migrations must still compare the existing result before switching a consumer;
this phase does not retire an endpoint or duplicate a financial calculation.

### Phase 443 inventory health consolidation

Inventory Health is now the shared read-only contract for stock status and
expiry classification. Dashboard, alerts, AI context/tools, the legacy
executive report, and Business Admin's branch low-stock dataset consume the
inventory-owned classification instead of carrying separate threshold logic.
Weighted inventory totals and branch projections are owned by the inventory
cost valuation service; Business Admin no longer contains a second branch
valuation loop.

The Back Office inventory workspace remains read-only. Catalog still owns item
identity and authoring, Stock Movements still owns inventory mutations and
history, and Recipes still owns composition. The health projection adds
out-of-stock visibility without creating a new mutation endpoint or removing
the existing compatibility routes.

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
- the repository-wide compliance declaration/API-contract check passed for the
  current worktree, including the Phase 365 declaration;
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
| Current `BusinessAdminPage` settings/onboarding/storefront/F&B/expenses/attendance workspaces | Settings/onboarding/storefront/F&B remain policy-gated or extracted workspaces. Expenses is now the exception: it uses the approved tenant-local operational ledger contract; it does not become a statutory accounting or POS cash-drawer editor. |
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

### Phase 365 implementation progress (completed 2026-09-15)

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

After an accepted event, the mounted POS `SettingsWorkspace` refreshes its
clean editor draft from the canonical settings readback. Dirty local drafts are
left untouched, so a manager editing in POS is not silently overwritten by a
remote Business Admin save.

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

The authenticated `apps/dgfy-pos/tests/e2e/business-admin-pos-settings-sync.spec.js`
test also passed from Warn → Enforce on Masu Cafe and restored the original
setting. `npm run check:compliance`, the focused contracts, POS build,
documentation/ADR, architecture, whitespace, and authenticated sync E2E checks
all passed.

Rollback is code-only: revert the Phase 365 application changes to restore the
previous write path and event subscriber. Persisted setting keys and values
remain valid because no schema/data migration or new owner was added; no data
rollback is required. Phase 365 is complete; the next eligible phase is 366.

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

## POS and Back Office settings access follow-up

Objective: Keep business configuration in Back Office, retain terminal controls
inside POS, and let authorized managers open Back Office without starting a
cashier shift. Phases 365–368 are completed. Preserve completed phases
360–370.

### Critical assessment and boundaries

- Access before terminal unlock still requires authenticated manager identity,
  company membership and server authorization. Removing a lock check alone is
  not sufficient; the earlier locked-screen observation did not establish why
  authorization had not finished loading.
- Keep **Back Office** and **Terminal setup** as the two entry points. Do not
  introduce a duplicate generic manager Settings button. Defer the optional
  Business settings shortcut until usage justifies it.
- Separate terminal-local controls from registry and branch-binding policies
  currently exposed in both surfaces. Reuse the canonical settings editor and
  existing storage owners; preserve onboarding and required legacy paths.
- Existing cross-window notifications cover the same browser/origin. Do not
  claim separate-device synchronization without independent evidence.

### Delivery sequence

| Phase | Scope | Acceptance gate |
| --- | --- | --- |
| 365 — Finish existing hardening | Recheck the recorded compliance blocker and any current build/dependency failures. Reuse valid evidence; complete only missing save/readback, permission and branch-isolation checks. Reconcile navigation documentation with observed behavior. | Existing required gates pass and completion evidence is recorded; do not redo completed migration work or mark the phase complete while blocked. |
| 366 — Manager access and navigation | Make authenticated Back Office entry independent of cashier shift activation. Resolve company membership and server permissions before access; offer sign-in for absent/expired identity. Keep explicit separate-window confirmation and correct reports wording when opening Overview. | Authorized manager opens Back Office without starting a shift; cashiers and unauthorized direct requests remain denied. POS cart, shift and lock state remain unchanged. |
| 367 — Terminal settings ownership | Keep device/printer controls, terminal selection, queue scope and local sound in POS. Make Back Office the primary editor for registry policy, branch bindings, business/receipt metadata, discounts, payments, team and Storefront configuration. Preserve needed onboarding and legacy entry paths. | Each setting has a clear primary destination, with no duplicate business logic; terminal controls still honor permission, device-policy and connectivity requirements. |
| 368 — Final acceptance | Verify desktop/mobile navigation, fresh-tab authentication, expired sessions, logout, company switching, denied access, branch refresh and unsaved changes. Verify actual window opening and accurate feedback. Run affected builds and architecture/docs checks; record evidence and rollback. | No blank page, unauthorized access, lost cart/shift or wrong-company/branch refresh. All required checks pass before completion. |

Dependencies are sequential for the settings-access follow-up: Phase 368 is
complete. Phase 366 remains an isolated manager-entry hardening step and does
not change the completed Phase 365 settings-sync scope. Phases 369 and 370 are
separately allocated completed follow-ups; the next eligible repository phase
is Phase 371.

### Phase 366 implementation result

The POS now keeps Back Office visible only for an authenticated, authorized
non-cashier manager and permits its separate-window confirmation while checkout
is locked or no cashier shift is active. The persistent sidebar, mobile lock
drawer, and unlock modal expose the same guarded entry; locked POS content and
cashier actions remain disabled. Fresh-tab authentication continues to use the
existing HttpOnly cookie/session authority, and expired sessions show a direct
POS sign-in action. Server authentication, tenant membership, branch grants,
and section permissions remain authoritative.

### Implementation targets and validation

- Navigation: shared `TerminalWorkspaceSidebar.jsx`, `TerminalPage.jsx` and
  `TerminalPageDialogLayer.jsx`; retain the Overview destination
  `/?view=reports#/backoffice/overview` in an individual browser page.
- Settings: shared `TerminalOperationsWorkspace.jsx` (`SettingsWorkspace`),
  POS `BusinessAdminPage.jsx` and `businessAdminSettingsModel.js`; retain
  server-projected view/edit rights and tenant/branch scope.
- Refresh: `businessAdminSettingsSync.js`; test same-origin window behavior and
  tenant/branch filtering without broadcasting credentials.
- Extend relevant existing navigation, settings, authentication and permission
  tests. Include rendered desktop/mobile evidence, API denial checks and
  save/readback for controls whose entry points change. Record exact test paths
  and commands in the ledger when implementation evidence exists.

Follow [Architecture Boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md)
(last reviewed 2026-03-06),
[Architecture Governance](../architecture/ARCHITECTURE_GOVERNANCE.md)
(2026-05-21),
[ADR 0026](../architecture/adr/0026-browser-session-cookie-authority.md)
(2026-07-08),
[ADR 0031](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
(2026-09-15), and
[ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md)
(2026-09-03). Recheck freshness before implementation. Preserve browser-cookie
session authority, shared-component boundaries and shift/device protections.
Phase 366 rechecked document freshness and records a dated ADR 0031 clarification with the manager-entry
implementation. No new storage owner, architecture exception or allowlist
dependency is proposed. Run applicable architecture boundary checks for
affected shared POS/authentication changes.

### Phase 367 implementation result

Business Admin is the primary editor for business and receipt metadata, tenant
POS configuration and discount presets, Storefront and branch configuration,
payment policies, team and attendance access, and terminal registry/branch-
binding policy. These sections continue to use the shared
`SettingsWorkspace`, existing settings APIs and server-projected tenant/branch
view/edit permissions.

The POS `terminal_setup` route now passes its own terminal-local editor scope.
It retains queue scope and local order sound controls, while the Terminal
Registry, registry mode, strict location binding, voucher policy, and cashier
assignment policy remain in the Back Office `registers` section. Device/printer
bridge operations, terminal selection, shifts, cash drawer actions and checkout
remain in the POS operational surface. `PosTenantSetupModal` onboarding and
legacy settings URLs remain usable compatibility paths; no duplicate API,
storage owner or migration was introduced.

Validation completed 2026-09-15: the focused Back Office navigation, strict
binding ownership, terminal session/view and pairing contracts passed (5 files,
100 tests), the Business Admin settings ownership model contract passed (1
file, 7 tests), and the existing Phase 366 navigation/session/API/browser
evidence remained green. The company-scoped settings ownership E2E passed,
covering the rendered POS/Back Office split and Back Office save/readback. The
existing terminal-location integration coverage was inspected and left
unchanged; the ownership regression is covered by the focused source contracts
and the production POS build. POS lint/build,
documentation/ADR lint, architecture, compliance and `git diff --check` are
required completion gates and are recorded in the phase ledger.

### Phase 368 implementation result

Final acceptance now covers the complete manager settings-access lifecycle.
Business Admin bootstrap requests are sequence-guarded so an older response
cannot restore a previous tenant or branch after refresh, and the UI
distinguishes unavailable, authenticated-but-denied, and missing/expired
session states. Logout/session-expiry/company-switch events clear the mounted
Business Admin data and dirty draft state with actionable feedback. Branch
settings selection is persisted in the hash-route `branch_id` query and
survives reload; sidebar navigation, POS handoff, refresh, branch changes, and
browser unload all protect unsaved settings with an explicit discard prompt.
An accepted refresh remounts and rehydrates the canonical shared settings
editor, while a cancelled refresh leaves the draft unchanged.

Validation completed 2026-09-15: the focused navigation/session/settings
contracts passed (9 files, 141 tests), the settings model contract passed (7
tests), Phase 368 authenticated browser acceptance passed (3 tests) for branch
refresh, dirty-draft protection, session/logout/company invalidation, and a
server-returned 403 denial state, and the Phase 366 desktop/mobile independent
Back Office window checks passed (2 tests). POS lint passed and the production
build passed with 3,770 modules; existing Vite chunk-size and dynamic-import
warnings remain non-blocking. The browser acceptance found no blank page,
unexpected page error, failed request, server error, lost cart/shift state, or
wrong-company branch refresh. Existing API permission contracts and the
company-scoped settings save/readback evidence remain the server-side
authorization and persistence proof. Same-origin popup/session behavior was
verified; no separate-device synchronization claim is made.

Rollback is code/test/documentation-only: revert the Phase 368 changes to
restore the previous Business Admin bootstrap/error, branch-route, refresh,
and acceptance-test behavior. No schema, setting key, session, cart, shift,
tenant, or branch data rollback is required.

## Phase 369 — Back Office roles and cashier lifecycle

The Team & access section is now the clear Back Office entry point for the
existing canonical User Management owner. Its action is labeled **Manage Users
& Roles** and its supporting copy names the available F&B Admin, Restaurant
Manager, Cashier, and other mode-aware role presets. User Management continues
to load the server role catalog, granular permissions, invitation state, and
location grants; Back Office access itself does not grant user-management
permissions.

The separate **Invite Cashier** action intentionally remains cashier-only. It
continues to create the existing DGFY invitation/authorization profile and does
not create a local cashier credential or expose admin/manager roles. Active
cashiers now also have a `users:delete`-gated **Remove cashier** action in the
canonical cashier access list. Removal uses the existing tenant-user DELETE
contract as a soft delete, updates the visible list and sends the established
settings refresh notification; sales, shifts, and other historical records are
preserved.

The API now refuses removal while the target owns an open POS shift, active POS
operator session, or open attendance session. The user must close or hand off
that operating state first, protecting the attendance/register invariants in
ADR 0073. Master-admin and hierarchy checks remain server-authoritative.

Validation completed 2026-09-15: the focused cashier contract, API soft-delete
policy tests, configured POS test suite, POS lint/build, API lint, and
whitespace checks passed. Authenticated Masu Cafe browser verification showed
the full role catalog, cashier-only invitation, and cancellation-safe cashier
removal confirmation without removing any live cashier. No migration or new
storage owner was required. The next eligible repository phase is 370.

## Phase 370 — POS Back Office merchant-surface consolidation

The POS Back Office is now the single merchant-facing administration surface.
The Business Admin shell groups the migrated catalog editor, suppliers,
purchase orders, job orders, stock movements, dispatch orders, services,
Food & Beverage, hospitality, sales timeline, and tenant-scoped assistant
without sending the operator to a second merchant application. Reports and
settings entry points also remain inside the POS route boundary.

The shared `packages/web-core/src/features/merchantBackOffice` boundary now
owns the migrated IMS-only pages and the phone-first purchase-order/job-order
receiving flow. It reuses the existing APIs, permission checks, workflow gates,
inventory ledger, and tenant/branch context; it does not create a second
catalog, procurement, inventory, or receiving owner. The POS route also maps
legacy shared page links and `/sales`/`/reports` URLs back to the canonical
Back Office sections.

Storefront business inventory and company-switch actions now hand off directly
to POS Back Office through the tenant-session handoff builder. The old
SKUpervisor handoff builder is removed. Old IMS merchant URLs remain only as
authenticated compatibility routes that show a retirement handoff to the
equivalent POS destination. IMS `/admin/*` platform administration, auth,
invitation, and legal compatibility routes remain available and are not part
of the merchant-surface retirement.

Phase 370 is completed. The POS migration contract, shared route/handoff
contracts, POS suite (6 files, 26 tests), Storefront suite (220 files, 1,187
tests), IMS/shared suite (366 files, 2,383 tests), POS/Storefront/IMS lint and
builds, authenticated Masu Cafe browser checks for all 12 migrated modules,
390px overflow checks, the IMS `/items` retirement handoff, compliance,
architecture, docs/ADR, and whitespace checks are green. The receiving
route/build contracts passed without mutating a live token. No database
migration or new data owner is planned. The next eligible repository phase is
372.

## Phase 371 — Back Office attendance read model

The Back Office Attendance route now renders the canonical POS attendance and
operator-session read model instead of the previous informational placeholder.
Authorized managers can filter by date and visible branch, review attendance
and terminal operator-session tables, and receive explicit loading, empty,
error, and access-denied states. Branch scope is enforced server-side from the
existing Business Admin permission and location-grant contracts; client input
cannot widen an assigned user's locations.

The API is a thin Business Admin adapter over the existing POS lifecycle
repository. It adds no attendance tables, biometric capture, payroll export,
schedule management, attendance writes, or duplicate calculations. The
workspace continues to show biometric attendance and payroll as out of scope
under ADR 0073.

Validation completed 2026-09-16: the focused Business Admin attendance and POS
lifecycle repository suites passed (2 suites, 17 tests), the POS attendance
workspace contract passed (2 tests), and authenticated local Playwright
acceptance passed against `/?view=reports#/backoffice/attendance` with an HTTP
200 attendance response, visible date/branch filters, both tables, branch
filter refresh, no blank page, no page errors, no unexpected console errors,
and no server errors. Targeted API lint, architecture/controller-boundary
checks, POS lint, and the POS production build (3,770 modules) passed; the
existing non-blocking Vite chunk-size/dynamic-import warnings remain.

Implementation targets are `businessAdminAttendanceUseCase.js`, the existing
POS `loadCashierLifecycleReport`/`posRepository` contract, the Business Admin
route/controller/client, and `BusinessAdminPage.jsx`. No migration or new data
owner was introduced. Rollback is code/test/documentation-only; no historical
attendance or operator-session data rollback is required. Phase 371 is
completed; the next eligible repository phase is 372.

## Phase 372 — Workflow-aware merchant Back Office navigation

The POS Back Office now applies the shared tenant workflow capability contract
to migrated merchant modules. For an F&B tenant, Services, Hospitality, Job
Orders, and Dispatch Orders are hidden from the sidebar while Catalog,
Inventory, F&B configuration, Orders, Settings, Storefront, Sales, and Reports
remain available. This is capability-based rather than a hardcoded F&B-only
allow-list, so a tenant with an explicit composed capability overlay can still
see an enabled vertical module.

Direct navigation to an unavailable workflow route is protected as well. The
Back Office resolves workflow visibility before mounting the migrated module;
unavailable or unresolved sections redirect to Back Office Overview without
calling the module's denied APIs. Backend workflow capability guards remain
authoritative and unchanged.

Validation completed 2026-09-16: the focused workflow visibility contract,
Business Admin migration contract, shared Back Office navigation contract, POS
test suite (8 files, 31 tests), POS lint, and POS production build (3,771
modules) passed. Repository documentation/ADR checks, architecture guardrails,
compliance checks, and `git diff --check` also passed. Authenticated local Masu
Cafe browser verification confirmed
that desktop and 390px mobile navigation hide Services, Hospitality, Job
Orders, and Dispatch Orders, preserve F&B navigation, redirect direct Services
and Hospitality URLs to Overview, report no console errors, and have no mobile
horizontal overflow. No API, database, setting key, migration, or data owner
changed. Rollback is code/test/documentation-only; no tenant or workflow data
rollback is required. Phase 372 is completed; the next eligible repository
phase is 373.

## Phase 373 — POS Settings shortcut to Back Office

The POS terminal sidebar now restores a manager-facing **Settings** entry that
opens the canonical POS Back Office settings workspace at
`/backoffice/settings/profile`. The existing **Back Office** entry still opens
the full merchant overview, while **Terminal setup** remains in POS for
terminal-local queue scope, order sound, device, and printer controls. The
shortcut reuses the existing authenticated separate-window opener, branch
context handling, and Back Office authorization checks; it does not create a
second settings owner or route through the retired IMS/SKUpervisor surface.

Validation completed 2026-09-16: the shared Back Office navigation contract
passed (9 tests), the POS test suite passed (8 files, 31 tests), POS lint and
the POS production build (3,771 modules) passed, and authenticated Masu Cafe
browser verification showed the Settings entry, the canonical Back Office
settings workspace, and the unchanged terminal-only setup controls. The
Settings workspace rendered Business & receipts with the expected authorized
sections and retained the POS terminal-controls handoff. No API, database,
setting key, migration, or data owner changed. Phase 373 is completed; the
next eligible repository phase is 374.

### Phase 373 follow-up — simplified terminal entry points

Post-completion navigation refinement completed 2026-09-16: after reviewing
the terminal workflow against the canonical Back Office split, the direct POS
Settings shortcut was removed. The final POS sidebar exposes **Back Office**
for merchant administration and **Terminal setup** for terminal-local
controls; Settings remains available inside Back Office at
`/backoffice/settings/profile`. This supersedes the shortcut's presentation
only. Authorization, branch context, settings ownership, APIs, storage, and
data owners are unchanged. The shared navigation contract, POS suite, lint,
build, repository checks, and authenticated Masu Cafe browser verification
passed for the final flow.

## Phase 375 — Business Admin historical read visibility

The data-backed Shifts, Orders, and Audit tabs now open on the previous 30
Asia/Manila calendar days through today, so historical tenant records are
visible without requiring a manual date search. Each route exposes Today, Last
7 days, Last 30 days, and Custom range controls; changing a preset or date
reloads the canonical read model. Audit correctly remains tenant-wide and
does not display a misleading branch filter.

Audit date-only boundaries are converted from Asia/Manila midnight and
end-of-day to their UTC instants before querying the existing redacted audit
read model. Empty states identify the selected range and explain how to widen
it. POS onboarding and Storefront remain their intentional read-model/policy
gates. Expenses now has an operational ledger path with no tax/profit inference,
no payroll or biometric behavior, no commerce mutation, and no duplicate POS
cash-drawer storage.

Validation completed 2026-09-16 under the Phase 375 ledger entry. The focused
date-range/API boundary contracts, POS suite, authenticated Masu Cafe desktop
browser acceptance for all three routes and preset switching, POS/API
lint/build, architecture/documentation/compliance checks, and
`git diff --check` passed. No database migration, live data mutation, or new
data owner was introduced. Phase 375 is completed; the next eligible
repository phase is 376.

## Phase 376 — Tier-aware POS terminal setup

The POS now has a complete local setup path for tenants/operators who do not
use Business Admin. The existing authorization contract defines the three
surfaces without introducing a new subscription or database tier field:

- POS-only: `pos:view` without Business Admin access. The operator sees one
  **POS setup** entry, not Back Office or a duplicate generic Settings entry.
- POS + Back Office: an authorized non-cashier sees **Back Office** plus the
  existing **Terminal setup** entry for terminal-local controls.
- Full admin: the existing admin/master-admin access continues to expose the
  authorized Back Office surface and its server-projected settings sections.

POS setup contains the controls that must remain available at the counter:
terminal identity selection, assigned branch/queue visibility, local online
order sound, printer detection/refresh, and a no-sale test print. Terminal
registry creation, registry mode, strict branch-binding policy, and cashier
assignment remain Back Office-owned. Active shifts, cross-branch changes,
pairing, permission checks, and API authorization continue to use the existing
POS contracts; no new credential, schema, or storage owner was added.

The printer test reuses the existing iMin and LAN bridge drivers. LAN tests
use `POST /pos/device/test-print` with bounded message/copy validation and an
audit row; native iMin tests use the existing local bridge and never create a
sale. A missing printer disables the action and reports the actual hardware
state instead of showing a misleading successful control.

Validation completed 2026-09-16: focused shared POS contracts passed (6 files,
114 tests), backend test-print/device contracts passed (3 suites, 15 tests),
POS lint passed, POS and IMS production builds passed, and the documentation,
architecture, compliance/API-contract, and whitespace checks passed. Local
authenticated Masu Cafe browser verification rendered the terminal setup
surface at desktop and 390px mobile widths, showed the assigned Masu Cafe
queue, reported no printer detected honestly, and found no Error Boundary or
mobile horizontal overflow. The first browser load exposed and fixed a
declaration-order regression before the clean verification reload. No live
tenant, branch, shift, sale, printer, or settings data was changed.

Rollback is code/test/documentation-only: revert the Phase 376 POS terminal
setup, printer diagnostic, and navigation changes. No schema, tenant, branch,
session, shift, transaction, or hardware-pairing data rollback is required.
Phase 376 is completed; the next eligible repository phase is 377.

## 2026-09-23 — OPIS move (issue #2052, epic #1354, Phase 461)

Recorded, not a rewrite of the history above: the Back Office shell documented here
moved from `apps/dgfy-pos/src/features/businessAdmin` to `apps/dgfy-opis`
(the dedicated DGFY Back Office at `opis.dgfy.ph`), with canonical routes
`/backoffice/*` and the `/business-admin/*` alias, an isolated `opis_*`
browser-session namespace, POS external redirects preserving path/query, and IMS
handoff retargeting. POS terminal operational flows are unaffected. The interim
"POS is the canonical merchant back-office surface" framing above was superseded
when ADR 0087 was accepted on 2026-09-29; OPIS is now canonical for new back-office
work.
See Phase 461 in the [implementation phase ledger](IMPLEMENTATION_PHASE_LEDGER.md),
[ADR 0087](../architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md),
and the `opis-pos-backoffice-redirect` / `opis-ims-merchant-handoff` compatibility
seams.

## 2026-09-24 — OPIS root-level section URLs (issue #2052 follow-up)

The dashboard remains at `/`; Back Office sections now use root-level URLs such as
`/sales`, `/orders`, `/catalog`, and `/settings/profile`. Older `/backoffice/*` and
`/business-admin/*` links redirect to their root-level equivalent while preserving
query and hash. OPIS-owned authentication, company registration, and protected receive
routes keep their reserved paths. See the updated route contract in ADR 0087.
