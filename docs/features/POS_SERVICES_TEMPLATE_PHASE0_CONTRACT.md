---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-08-09
applies_to: pos_services_template_rollout
topic: pos_services_template_phase_zero_contract
---

# POS Services Template Phase 0 Contract

## 1. Purpose And Status

This document freezes the discovery contract for bringing the governed Services business template into POS without making POS the owner of catalog identity or duplicating Services business logic.

Phase 0 is complete when this contract is reviewed. It changes no runtime behavior, database schema, API response, permission, or user-facing route.

Planning packet:

- Packet: `feature-slice`
- Domain: `web-fullstack`
- Source material: repository code, governed documentation, and approved chat scope
- Readiness: `mostly-ready`
- Output shape: `single-packet`

## 2. Rewritten Objective

Allow an authorized Services-mode operator to manage the service catalog and, in a later release, the full service-business workflow from POS without depending on the SKUpervisor Services page. Reuse the existing Services APIs, models, taxonomy, pricing rules, and permission model. Keep non-Services POS behavior unchanged.

## 3. Authoritative Documentation Used

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- ADR 0014: multi-template mode taxonomy and offline replay contract
- ADR 0016: Services Mode item, booking, add-on, pricing, and operational contracts
- ADR 0017: independent POS and Storefront visibility
- ADR 0020: mode-aware Services permissions
- ADR 0029: Catalog, Inventory, POS, and Storefront ownership boundaries
- ADR 0055: tenant-scoped POS catalog invalidation
- `docs/features/SERVICES_MODE.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`
- `docs/api/specification.md`

All cited authoritative documents are within their configured review windows as of 2026-08-09. ADR 0037 is `proposed` and is not used as a constraint.

## 4. Architecture Classification

- Classification: `within-existing-boundary`
- ADR required: no
- New architecture allowlist entry: prohibited
- New compatibility seam: not expected
- Backend flow: `routes -> controllers -> usecases -> repositories -> models`

POS is a presentation and sales-execution surface. Catalog continues to own item identity, Services owns service metadata and booking behavior, Inventory owns physical stock effects, and Storefront owns public presentation.

If implementation writes Sequelize models from a POS controller, copies Services validation into the frontend, or makes POS own service records outside the Services use cases, the change becomes non-compliant and must stop for architecture review.

## 5. Current-System Inventory

### 5.1 Shared taxonomy and template

- `packages/shared-constants/src/modeItemTaxonomy.js` defines the Services presets:
  - `service`: stock-exempt, UOM `service|session|booking|hour`, FIFO disabled.
  - `physical_add_on`: product/finished goods, stock-bearing.
  - `supplies`: supplies, stock-bearing.
- `frontend/src/features/settings/businessModeTemplates.js` defines Services defaults and the labels `Create Service`, `Create Service Package`, and `Services POS`.

These registries are the only permitted source for item-type defaults. POS must not add a separate hardcoded Services taxonomy.

### 5.2 Existing SKUpervisor Services surface

`frontend/src/features/services/pages/ServicesPage.jsx` currently owns a monolithic Services workspace with:

- Today
- Calendar
- Services
- Variations & Add-ons
- Team & Resources
- Waitlist
- Reminders
- Clients

The service catalog form includes service identity, duration, price, payment policy, service area, intake question, bookability, POS visibility, Storefront visibility, and add-ons enablement.

The page itself must not be embedded wholesale in POS. Reusable forms, panels, hooks, and mappers should be extracted from the Services feature and consumed by both surfaces.

### 5.3 Existing backend Services surface

`backend/src/routes/services.js` exposes authenticated, Services-capability-guarded routes for:

| Area | Routes |
| --- | --- |
| Dashboard | `GET /services/dashboard` |
| Catalog | `GET/POST /services/catalog`, `PUT /services/catalog/:item_id` |
| Resources | `GET/POST /services/resources` |
| Assignments | `GET/POST/PATCH /services/assignments` |
| Bookings | `GET/POST /services/bookings`, status and settlement mutations |
| Waitlist | `GET/POST/PATCH /services/waitlist` |
| Clients | `GET /services/clients` |
| Reminders | list, queue-due, and send-due routes |
| Variations/add-ons | option-group CRUD, item assignment, and quote routes |

Catalog creation already creates the Item and `ServiceItemDetail` in one database transaction.

### 5.4 Existing POS surface

`frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` already has Items, Categories, and Service add-ons tabs. It also has staged post-create handling for catalog overrides, images, barcodes, and recovery.

The current Add Item path is not Services-aware:

- It hardcodes `category = 'product'`.
- It selects a product preset, which resolves to `physical_add_on` in Services mode.
- It requires cost and enforces `selling price > cost`.
- It validates stock even for workflows that should create a pure service.
- It queues the generic item payload as an offline draft and cannot atomically carry `ServiceItemDetail`.

The edit path recognizes existing `category=service` rows but still applies mandatory cost, margin, and stock validation before saving.

## 6. Frozen Item-Type Contract

| POS label | Canonical preset | Item persistence | Stock behavior | Create endpoint |
| --- | --- | --- | --- | --- |
| Service | `service` | `category=service`, `product_type=null`, `mode_item_preset=service` | Stock-exempt; stock `0`; FIFO disabled | `POST /services/catalog` |
| Physical Add-on / Product | `physical_add_on` | `category=product`, `product_type=finished_goods`, preset persisted | Location/FIFO stock-bearing | Governed Item create endpoint |
| Supplies | `supplies` | `category=supplies`, preset persisted | Location/FIFO stock-bearing | Governed Item create endpoint |

Services mode defaults to `Service`. It must still allow the other two governed item types. A visual folder/category must never be used as a substitute for canonical `items.category` or `mode_item_preset`.

Legacy records are not automatically recategorized. A later reconciliation phase may backfill unambiguous missing preset/detail data, but it must not convert physical rows based only on folder name.

## 7. Frozen Service Field Mapping

### 7.1 Item identity and finance

| POS field | API field | Persistence | Rule |
| --- | --- | --- | --- |
| Service name | `name` | `items.name` | Required |
| Service code | `sku_code` | `items.sku_code` | Optional unless a shared SKU policy supplies it |
| Description | `description` | `items.description` | Optional |
| Unit | `unit_of_measure` | `items.unit_of_measure` | Only governed service UOMs |
| Selling price | `default_sale_price` | `items.default_sale_price` | Positive for active POS/Storefront service |
| Track internal cost | UI-only toggle controlling submission | none | Off by default |
| Internal service cost | `cost_per_unit` | `items.cost_per_unit` | Optional; never a customer-price fallback |
| VAT classification | `vat_type` | `items.vat_type` | `vatable|vat_exempt|zero_rated` |
| Status | `status` | `items.status` | `active|inactive` on update |

Server-owned create values are `category=service`, `product_type=null`, `mode_item_preset=service`, `current_stock=0`, `fifo_enabled=false`, and `max_capacity>=1`.

### 7.2 Service behavior

| POS field | API field | Persistence |
| --- | --- | --- |
| Service category | `service_category` | `service_item_details.service_category` |
| Duration | `duration_minutes` | `service_item_details.duration_minutes` |
| Buffer before | `buffer_before_minutes` | `service_item_details.buffer_before_minutes` |
| Buffer after | `buffer_after_minutes` | `service_item_details.buffer_after_minutes` |
| Lead time | `lead_time_minutes` | `service_item_details.lead_time_minutes` |
| Cancellation window | `cancellation_window_hours` | `service_item_details.cancellation_window_hours` |
| Bookable | `bookable` | `service_item_details.bookable` |
| Show in POS | `visible_in_pos` | `service_item_details.visible_in_pos` |
| Show in Storefront | `visible_in_storefront` | `service_item_details.visible_in_storefront` |
| Allow add-ons | `addons_enabled` | `service_item_details.addons_enabled` |
| Payment policy | `payment_policy` | `service_item_details.payment_policy` |
| Service area | `service_area_type` | `service_item_details.service_area_type` |
| Intake form | `intake_form_schema` | `service_item_details.intake_form_schema` |
| Client notes template | `client_notes_template` | `service_item_details.client_notes_template` |

The create/edit form must submit this normalized payload through the Services API client. The frontend may validate for usability, but the backend remains authoritative.

### 7.3 Variations and add-ons

| Concept | Persistence | Frozen behavior |
| --- | --- | --- |
| Variation/add-on group | `service_option_groups` | `variation|addon`, single/multi selection, min/max, required, order, status |
| Option | `service_options` | Name, price adjustment, duration adjustment, optional linked physical item |
| Service assignment | `service_item_option_groups` | Connects a service item to option groups |
| Historical selection | `service_booking_line_options` | Immutable name, price, duration, tax, and linked-item snapshots |

Server quote calculation is authoritative. Service add-ons are stock-exempt. Options linked to a physical item generate separate stock-bearing effects through Inventory during fulfillment.

### 7.4 Images and visibility

Service catalog persistence and image persistence are separate actions:

- POS image: POS catalog override image route.
- Storefront image/gallery: Item Storefront image routes.
- POS visibility and Storefront visibility remain independent.
- Image upload must not silently enable either visibility flag.
- Release 1 reuses the existing staged post-create recovery pattern; it does not make image upload part of the Item plus `ServiceItemDetail` transaction.

## 8. Frozen Authorization Contract

| Capability | Primary permission | Compatibility fallback |
| --- | --- | --- |
| View service catalog/options | `services:catalog:view` | `items:view` while fallback is enabled |
| Manage service catalog/options | `services:catalog:manage` | `items:create` or `items:edit` according to mutation |
| View/manage resources | `services:resources:view/manage` | Existing inventory compatibility permissions |
| View/manage bookings | `services:bookings:view/manage` | Existing POS compatibility permissions |
| View/manage waitlist | `services:waitlist:view/manage` | Existing POS compatibility permissions |
| View clients | `services:clients:view` | Existing reports compatibility permission |
| View/manage reminders | `services:reminders:view/manage` | Existing POS compatibility permissions |

Rules:

- Authorization is based on granular permissions and the Services workflow capability, never role labels alone.
- A normal cashier remains unable to create, edit, or delete catalog items by default.
- POS tabs and actions must use the same Services permission that protects the endpoint.
- The generic fallback remains temporary and must continue honoring `MODE_RBAC_GENERIC_FALLBACK_ENABLED`.

## 9. Frozen Online And Offline Contract

- Release 1 service create, edit, image, option-group, and assignment maintenance is online-only.
- Offline checkout of a previously cached, POS-visible service may continue under the existing POS offline contract.
- POS must not put a partial service payload into the current generic offline item-draft queue.
- A future offline service-maintenance feature would require a complete Item plus service-detail draft schema, deterministic manual sync, and manual resolution for uncertain create outcomes. It is not part of Release 1 or Release 2.

## 10. Release Boundaries

### Release 1: Service catalog parity in POS

In scope:

- Services-mode item-type selector.
- Service create and edit through the Services API.
- Physical Add-on/Product and Supplies through the governed Item path.
- Reusable service form and payload mapper shared with the existing Services feature.
- Optional internal service cost.
- Variations/add-ons management and service assignment.
- Correct Services permissions.
- Online-only maintenance messaging.
- Existing catalog invalidation after successful mutations.

Out of scope:

- Full Today/Calendar/resources/waitlist/reminders/clients workspace.
- Offline service creation or editing.
- Destructive legacy-row recategorization.
- New payment or booking lifecycle rules.

### Release 2: Full Services operations in POS

In scope:

- Today and Calendar.
- Services and Variations & Add-ons.
- Team & Resources.
- Waitlist.
- Reminders.
- Clients.
- Permission-aware front-desk and manager presentation.
- Booking settlement connected to POS shift/payment rules without requiring a shift for non-payment service-desk actions.

Release 2 reuses the established Services endpoints and extracted components. SKUpervisor becomes optional for a Services operator only after Release 2 parity and regression proof pass.

## 11. Confirmed Gap Register

| ID | Confirmed gap | Required phase |
| --- | --- | --- |
| `SVC-POS-001` | POS Add Item hardcodes `category='product'` | Phase 3 |
| `SVC-POS-002` | POS service edit still requires cost, margin, and stock validation | Phase 4 |
| `SVC-POS-003` | Services catalog create does not persist `mode_item_preset='service'` | Phase 1 |
| `SVC-POS-004` | Services validator permits zero sale price even for visible active services | Phase 1 |
| `SVC-POS-005` | Option routes reference nonexistent `VIEW_SERVICES` and `MANAGE_SERVICES` permission constants | Phase 1 |
| `SVC-POS-006` | POS Service add-ons tab uses item/category permissions instead of Services permissions | Phase 1/3 |
| `SVC-POS-007` | POS and SKUpervisor maintain separate Services API wrappers for option groups | Phase 2 |
| `SVC-POS-008` | Generic offline item drafts cannot atomically represent service details | Frozen online-only policy |
| `SVC-POS-009` | `ServicesPage.jsx` is monolithic and cannot safely be embedded in POS | Phase 2/5 |
| `SVC-POS-010` | Services mode has no dedicated POS item-workspace presentation copy | Phase 3 |

## 12. Phase 0 Acceptance Gates

- [x] Shared Services taxonomy and business template identified.
- [x] POS create/edit behavior inventoried.
- [x] Services API, model, and frontend client inventory completed.
- [x] Services operational tabs inventoried.
- [x] Permission mapping and permission defects identified.
- [x] Service and add-on field-to-persistence mapping frozen.
- [x] Release 1 and Release 2 boundaries frozen.
- [x] Offline service maintenance explicitly excluded.
- [x] Architecture ownership and no-duplication rules frozen.
- [x] No runtime code or data changed during Phase 0.

## 13. Phase 1 Entry Gate

Phase 1 is ready for implementation after explicit approval. It is limited to backend contract and permission corrections:

1. Persist the Services mode preset on service creation.
2. Align sale-price validation with Services readiness.
3. Replace nonexistent option-route permission keys with governed Services catalog permissions.
4. Add focused backend tests for transaction rollback, stock exemption, permission fallback on/off, and catalog invalidation.
5. Run architecture and controller-boundary checks.

Phase 1 must not include the POS form implementation, data backfill, or Release 2 operational workspace.

## 14. Phase 1 Completion Record (2026-08-09)

Phase 1 implemented the approved backend-only contract:

- [x] Service create and update persist `mode_item_preset=service`.
- [x] Service catalog responses expose the governed preset.
- [x] Active service creation requires a positive selling price.
- [x] Final transactional readiness validation rolls back a visible service with a missing or zero selling price.
- [x] Item plus `ServiceItemDetail` failures roll back atomically.
- [x] Variation/add-on routes use `services:catalog:view/manage`; nonexistent permission keys were removed.
- [x] Generic permission fallback remains controlled by `MODE_RBAC_GENERIC_FALLBACK_ENABLED`.
- [x] Successful service catalog create/update publishes tenant-scoped POS catalog invalidation after use-case commit.
- [x] Focused and wider Services regression tests pass.
- [x] No migration, data backfill, POS form, or Release 2 workspace change was included.

Phase 2 is the next eligible slice: extract the reusable Services catalog form, mapper, and API client without changing POS create behavior yet.

## 15. Phase 2 Completion Record (2026-08-09)

Phase 2 implemented the approved frontend extraction without enabling service creation in POS:

- [x] Reusable Services catalog form defaults and API payload mapping were extracted from the SKUpervisor page.
- [x] A controlled `ServiceCatalogForm` component now owns the existing SKUpervisor service-create fields and validation attributes.
- [x] SKUpervisor `ServicesPage` consumes the shared form and mapper without changing its create workflow.
- [x] POS Services option-group helpers now reuse the authoritative Services API client instead of duplicating endpoint calls.
- [x] Focused mapper, component, API-boundary, and POS option-modal contract tests pass.
- [x] SKUpervisor and POS production builds pass.
- [x] POS Add Item behavior remains unchanged; it still creates product items only.
- [x] No backend, database, migration, booking lifecycle, or Release 2 workspace behavior was changed in Phase 2.

Phase 3 is the next eligible slice: add an explicit service-create entry point to the POS item workspace using the extracted form and governed Services API, while keeping product creation behavior separate.

## 16. Phase 3 Completion Record (2026-08-09)

Phase 3 implemented the approved POS service-create entry point without changing the product-create contract:

- [x] Services mode exposes a dedicated `Add Service` action separately from `Add Item`.
- [x] The action is gated by `services:catalog:manage`; the Service add-ons tab now uses the same governed permission.
- [x] POS reuses the shared `ServiceCatalogForm`, form defaults, payload mapper, and Services API client.
- [x] Service creation calls `POST /services/catalog`; it does not call the generic Item create endpoint.
- [x] Successful creation refreshes the POS catalog and publishes the existing catalog-refresh signal.
- [x] Service creation is online-only and never enters the generic offline item-draft queue.
- [x] Existing Add Item behavior remains a separate physical-product workflow.
- [x] Focused permission, mode visibility, submission, refresh, and offline-negative tests pass.
- [x] POS and SKUpervisor production builds pass.
- [x] No backend, database, migration, service edit, booking lifecycle, or Release 2 workspace behavior was changed.

Phase 4 is the next eligible slice: route existing service edits through the shared Services form and API so stock, mandatory cost, and product-margin validation no longer apply to service records.

## 17. Phase 4 Completion Record (2026-08-09)

Phase 4 implemented the approved POS service-edit path without changing physical-item editing:

- [x] Canonical service rows route to a dedicated `Edit Service` modal instead of the generic Item editor.
- [x] Service detection uses canonical category/preset data rather than the visual POS folder/category.
- [x] The modal loads authoritative service metadata from the Services catalog before editing.
- [x] POS reuses the shared `ServiceCatalogForm`, mapper, and `PUT /services/catalog/:item_id` API client.
- [x] Product-only stock, mandatory-cost, margin, category-folder, barcode, and FIFO fields do not appear in or submit from service editing.
- [x] Optional internal service cost remains omitted when it is not tracked.
- [x] Service editing is gated by `services:catalog:manage` and remains online-only.
- [x] Successful updates refresh the POS catalog and publish the existing catalog-refresh signal.
- [x] Physical products continue using the existing generic Item editor and validation.
- [x] Focused loading, update, permission, no-cost, no-stock, stale-record, and offline-negative tests pass.
- [x] No backend, database, migration, destructive recategorization, booking lifecycle, or Release 2 workspace behavior was changed.

Phase 5 is the next eligible slice: complete Release 1 service-catalog presentation and assignment parity in POS, including the remaining governed service fields and focused catalog UX hardening, without adding Release 2 operational tabs.

## 18. Phase 5 Completion Record (2026-08-09)

Phase 5 completed the approved Release 1 service-catalog parity and presentation hardening:

- [x] The shared create/edit form exposes description, governed service UOM, scheduling buffers, lead time, cancellation window, optional internal cost, VAT classification, client notes template, bookability, POS visibility, Storefront visibility, add-ons enablement, and edit-only status.
- [x] Previously tracked internal cost can be explicitly cleared; untracked cost remains omitted from new-service payloads.
- [x] POS and SKUpervisor consume the same expanded form and normalized Services payload mapper.
- [x] Service add-on groups and service assignments remain managed through the shared Services API and `services:catalog:manage` permission boundary.
- [x] POS stock filters treat services as sellable stock-exempt entries rather than zero-stock inventory.
- [x] POS service cards show `Service catalog entry`, canonical `Service`, and `Stock Exempt` presentation instead of inventory/out-of-stock language.
- [x] Untracked service cost displays as optional/not tracked instead of a misleading zero cost or profit.
- [x] Physical-item stock filters, cards, create flow, and editor remain unchanged.
- [x] Focused full-field, cost-clear, visibility, status, permission, assignment-boundary, service-card, create, and edit tests pass.
- [x] POS and SKUpervisor production builds pass.
- [x] No backend, database, migration, destructive recategorization, booking lifecycle, or Release 2 operational workspace behavior was changed.

Release 1 service-catalog work is complete. The next rollout requires a separately approved Release 2 plan for Today, Calendar, Team & Resources, Waitlist, Reminders, and Clients in POS.

## 19. Phase 6 Completion Record (2026-08-09)

Phase 6 applied the existing SKUpervisor Services operational template directly to standalone POS:

- [x] POS Services mode exposes a `Service operations` workspace under Items.
- [x] The workspace includes Today, Calendar, Team & Resources, Waitlist, Reminders, and Clients.
- [x] Operational presentation components and Services API methods are shared rather than copied into POS business logic.
- [x] POS access follows the existing mode-aware Services permissions and compatibility fallbacks.
- [x] Service operations are online-only and do not enter POS offline mutation queues.
- [x] Existing service catalog and add-on tabs remain available.
- [x] Focused component, API-boundary, offline-negative, and POS integration tests pass.
- [x] Standalone POS production build passes.
- [x] Architecture and documentation gates pass.
- [x] Playwright on port 5174 confirms the Services template is visible inside POS without requiring SKUpervisor login.

Phase 7 is the next eligible continuous phase. It is limited to a dedicated permission-aware POS Services navigation shell and view-only/action-state hardening; it must not change settlement, receipt, or shift ownership rules.

## 20. Phase 7 Completion Record (2026-08-09)

Phase 7 completed the dedicated standalone POS Services shell and permission hardening:

- [x] Services-mode tenants expose a dedicated `Services` sidebar action in desktop and mobile POS navigation.
- [x] The action opens the POS-native Services workspace directly; no SKUpervisor route, login, or session handoff is used.
- [x] Services navigation is online-only and requires at least one Services view capability.
- [x] Services operations remain available without an active cashier shift; payment settlement still follows existing POS authorization and shift rules.
- [x] View-only operators can inspect permitted tabs while booking, resource, assignment, waitlist, and reminder mutations are disabled.
- [x] Unauthorized or no-longer-valid restored Services views fall back to checkout.
- [x] Focused component and navigation-contract tests pass, and the standalone POS production build succeeds.
- [x] Playwright on port 5174 confirms direct sidebar navigation, the Services workspace identity, all six operational tabs, and no unexpected runtime errors.
- [x] No backend, database, migration, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 8 was the next eligible continuous phase and is recorded below.

## 21. Phase 8 Completion Record (2026-08-09)

Phase 8 completed Today and Calendar booking operations inside standalone POS:

- [x] Today presents active local-day appointments in chronological order with requested, confirmed, checked-in, and in-service counts.
- [x] Booking status controls follow the existing deterministic lifecycle transitions and remain disabled without booking-manage permission.
- [x] Successful lifecycle mutations refresh authoritative Services booking state; duplicate status interaction is blocked while an update is in progress.
- [x] Calendar groups active appointments chronologically by day and supports accessible identity/contact search plus active-status filtering.
- [x] Loading, empty, filtered-empty, API error, retry, and read-only states are represented explicitly.
- [x] Desktop and mobile Playwright proof runs exclusively against standalone POS on port 5174 with browser exception, console error, request failure, HTTP 5xx, nonblank-root, and error-boundary checks.
- [x] No SKUpervisor login, backend behavior, database schema, booking lifecycle rule, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 9 is the next eligible continuous phase and requires separate approval.

## 22. Phase 9 Completion Record (2026-08-09)

Phase 9 completed Team, Resources, and service assignments inside standalone POS:

- [x] Resource creation supports the governed provider, room, equipment, vehicle, and station types, positive capacity, and optional location scope.
- [x] Assignment creation requires a service plus at least one resource, provider, or location capacity anchor before submission.
- [x] Resources display active counts, type, capacity, and location scope in responsive cards.
- [x] Assignments display all available resource, provider, and location anchors.
- [x] Assignment removal now sends `{ is_active: false }`, matching the established API and preserving historical rows.
- [x] Mutation controls prevent duplicate submits and are disabled for view-only operators with explicit guidance.
- [x] Focused tests cover normalized resource payloads, assignment-anchor gating, governed removal, and view-only behavior.
- [x] Desktop and mobile Playwright proof runs only against standalone POS on port 5174 with runtime diagnostics.
- [x] No SKUpervisor login, backend behavior, database schema, Today/Calendar lifecycle, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 10 is the next eligible continuous phase and requires separate approval.

## 23. Phase 10 Completion Record (2026-08-09)

Phase 10 completed Waitlist and Clients inside standalone POS:

- [x] Waitlist intake requires a governed service, client name, and email or phone contact.
- [x] Preferred schedule windows are validated before submission and normalized to the existing Services API payload.
- [x] Waitlist entries are chronologically ordered and support client/contact/service/notes search plus lifecycle-status filtering.
- [x] Waitlist status mutations use the established endpoint, refresh authoritative server state, and prevent concurrent status interaction.
- [x] Clients support identity/contact/service search, repeat/new segmentation, retention signals, and spend-descending ordering.
- [x] Empty, filtered-empty, pending, and view-only states are explicit.
- [x] Focused tests cover validation, exact mutation payloads, status updates, ordering, filtering, segmentation, and mutation locking.
- [x] POS build and repository governance checks pass; standalone POS Playwright proof passes once plus five consecutive stability runs on desktop/mobile.
- [x] No SKUpervisor login, backend behavior, database schema, reminder processing, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 11 is the next eligible continuous phase. It is limited to reminder operations and outcomes in standalone POS and requires separate approval.

## 24. Phase 11 Completion Record (2026-08-09)

Phase 11 completed reminder operations and outcomes inside standalone POS:

- [x] Operators can queue upcoming reminder candidates using validated 24-hour, 48-hour, 72-hour, or 7-day windows.
- [x] Operators can process due reminders through the existing Services email outbox and SMTP adapter.
- [x] Queue results show backend-returned queued and skipped counts.
- [x] Delivery results show backend-returned sent, failed, and skipped counts.
- [x] Missing SMTP configuration remains an auditable skipped outcome with `email_not_configured`; the POS does not misrepresent it as sent.
- [x] Reminder history provides pending/sent/failed/skipped counts, search, status filters, delivery identifiers, and failure reasons.
- [x] Reminder mutations are permission-aware and prevent concurrent queue/send actions.
- [x] Focused tests cover exact queue payloads, authoritative outcome summaries, filtering, skipped reasons, busy locking, and view-only behavior.
- [x] POS build and architecture checks pass; standalone POS Playwright proof passes once plus five consecutive stability runs on desktop/mobile.
- [x] No SKUpervisor login, backend behavior, database schema, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 12 is the next eligible continuous phase. It covers booking settlement integration with existing POS authorization, terminal, location, payment, receipt, and shift rules and requires separate approval plus its documented settlement discovery gate.

## 25. Phase 12 Completion Record (2026-08-09)

Phase 12 completed governed booking settlement inside standalone POS:

- [x] The settlement discovery gate found the existing endpoint's missing POS shift enforcement before UI exposure.
- [x] The endpoint now requires the authenticated cashier's matching open shift, terminal, and location and writes that shift identity to the POS transaction.
- [x] Booking location and active-shift location must match when the booking is location-scoped.
- [x] Cash received must cover the authoritative server total; change is calculated server-side and client `change_amount` input is forbidden.
- [x] Settlement remains atomic across booking lines, optional stock deductions, POS transaction creation, booking payment state, and booking completion.
- [x] Repeated settlement returns the existing linked transaction rather than creating another sale.
- [x] Eligible unpaid bookings expose a separate collection action; operators without an active shift can continue scheduling but cannot collect payment.
- [x] Successful collection presents the transaction and invoice identity used for POS Transaction History and receipt lookup while preserving the separate booking-ticket contract.
- [x] Backend tests prove success, immutable price snapshots, stock-bearing parts, invalid lifecycle, invalid parts, wrong shift, insufficient cash, and idempotent replay.
- [x] Frontend tests prove exact shift/terminal/location payloads, no client-calculated change, no-shift blocking, and unaffected scheduling controls.
- [x] POS build, architecture checks, and standalone POS Playwright proof pass once plus five consecutive desktop/mobile stability runs.
- [x] No schema migration, destructive data change, parallel payment ledger, or new receipt renderer was introduced.

Non-cash methods in this flow record the cashier-selected tender type. They do not represent external payment-provider authorization, payout, or reconciliation evidence.

Phase 13 is the next eligible continuous phase. It covers final responsive, permission, lifecycle, settlement, regression, documentation, and parity hardening and requires separate approval.

## 26. Phase 13 And Release 2 Completion Record (2026-08-09)

Phase 13 completed final hardening for the standalone POS Services template:

- [x] Standalone POS provides the service catalog, variations/add-ons, Today, Calendar, Team & Resources, Waitlist, Reminders, Clients, and governed booking collection without requiring SKUpervisor authentication.
- [x] Shared presentation and API boundaries keep SKUpervisor and POS behavior aligned without duplicating Services business logic.
- [x] Services view/manage permissions control tab visibility and mutations; no-shift access remains non-transactional and collection remains shift-bound.
- [x] Booking lifecycle, resource capacity, assignments, waitlist, reminders, clients, settlement idempotency, stock-exempt services, optional stock-bearing parts, and ticket/receipt separation have focused regression proof.
- [x] Settlement validation fails closed without shift, terminal, or location context and rejects client-calculated change.
- [x] Backend regression passes 85 tests and frontend regression passes 106 tests.
- [x] SKUpervisor and standalone POS production builds pass.
- [x] Architecture, controller-boundary, compatibility-seam, documentation, and ADR gates pass without exceptions.
- [x] Runtime-diagnostic Playwright proof passes five consecutive runs across desktop, mobile, and tablet with keyboard-operable tab navigation.
- [x] No database migration, destructive recategorization, parallel payment ledger, receipt-template fork, compatibility seam, or architecture allowlist was introduced by final hardening.

Release 2 rollback is presentation-first: the dedicated POS Services entry and collection controls can be withdrawn without deleting Services records or weakening backend payment-integrity checks. Existing SKUpervisor Services operations remain available.

Residual boundary: non-cash tender labels are cashier-recorded evidence unless a future governed payment-provider integration supplies authorization and reconciliation truth.

POS Services Release 2 is complete through continuous Phase 13. Any future initiative must begin at Phase 14 and requires a separately documented scope and approval.
