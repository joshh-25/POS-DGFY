---
status: reference
authority_level: reference
owner: product-and-architecture
date: 2026-09-29
last_reviewed: 2026-09-30
review_by: 2027-03-29
applies_to: apps/dgfy-pos, apps/dgfy-opis, packages/web-core
topic: pos_opis_business_admin_overlap
---

# POS and OPIS Business Admin overlap

This inventory records issue [#2140](https://github.com/Sieitzz/dgfy-platform/issues/2140)
and proposed [ADR 0088](../architecture/adr/0088-pos-opis-backoffice-overlap.md). POS
restores the capabilities from the user-selected pre-#2054 baseline
[`e4af6b7`](https://github.com/Sieitzz/dgfy-platform/tree/e4af6b768b3cfe3f114bde9a1af6394cc89a6b84).
The shared shell and module manifest are in
[`BusinessAdminPage.jsx`](../../packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx)
and [`businessAdminManifest.js`](../../packages/web-core/src/features/businessAdmin/businessAdminManifest.js).

## Shared access and data boundaries

Both apps call the existing `/api/v1/business-admin` projection and owner APIs.
The surface value (`pos` or `opis`) only selects presentation and route behavior;
it is not sent as authorization and does not add capabilities. API middleware and
canonical commands continue to enforce authenticated tenant identity, page
permissions, settings-section capabilities, branch assignments, and resource
ownership. A requested `branch_id` is constrained to branches visible to the
authenticated user. The UI does not turn read-only or unavailable-command states
into new mutations.

POS keeps HashRouter under `/business-admin/*`, plus `/sales` and `/reports`
aliases. OPIS keeps BrowserRouter root routes and is manually accessed while
POS contains no direct OPIS links or references. OPIS is the permanent Back
Office destination; restored POS workflows coexist during a gradual,
user-aware transition whose migration scope and sequencing remain future work.
OPIS alone exposes the additional Taxes and Discounts settings sections and account controls. POS
terminal tax and discount workflows remain available under their existing owners.

The baseline links below resolve to the user-selected commit. The legacy Business
Admin shell, route map, and settings models were in
[`BusinessAdminPage.jsx`](https://github.com/Sieitzz/dgfy-platform/blob/e4af6b768b3cfe3f114bde9a1af6394cc89a6b84/apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx),
[`businessAdminManifest.js`](https://github.com/Sieitzz/dgfy-platform/blob/e4af6b768b3cfe3f114bde9a1af6394cc89a6b84/apps/dgfy-pos/src/features/businessAdmin/businessAdminManifest.js),
and [`main.jsx`](https://github.com/Sieitzz/dgfy-platform/blob/e4af6b768b3cfe3f114bde9a1af6394cc89a6b84/apps/dgfy-pos/src/main.jsx).

## Capability inventory

| Baseline capability / route key | Current shared implementation | POS | OPIS | Canonical owner and scope |
| --- | --- | --- | --- | --- |
| `overview` | Overview workspace | `/business-admin/overview` | `/` | Business Admin read model; authenticated tenant, branch/date filters, cost masking, `business_admin:access`. |
| `sales` | Sales timeline module | `/business-admin/sales`, `/sales` | `/sales` | POS and Dispatch finalized read models; tenant and visible branch scope; no duplicate financial calculation. |
| `orders` | Order center and shared receipt renderer | `…/orders` | `/orders` | POS transaction/receipt owner; tenant and allowed branch; refund/void commands remain POS-owned and separately authorized. |
| `payments` | Payment workspace | `…/payments` | `/payments` | Payments provider/read model plus POS transaction snapshots; tenant scope and existing payment permissions. |
| `customers` | Customer workspace | `…/customers` | `/customers` | Tenant customer identity and POS order summaries; no global identity merge; customer mutations use existing API permissions. |
| `catalog` | Catalog module | `…/catalog` | `/catalog` | Catalog owner for item identity, categories, variants, price, import/export; tenant scope, mutations require catalog permissions. |
| `inventory` | Inventory workspace | `…/inventory` | `/inventory` | Inventory owner for stock truth, FIFO valuation, and location stock; tenant plus visible location scope and inventory permissions. |
| `suppliers` | Suppliers module | `…/suppliers` | `/suppliers` | Procurement/supplier owner; tenant scope, with branch filters where supported and existing supplier permissions. |
| `purchase-orders` | Purchase Orders module | `…/purchase-orders` | `/purchase-orders` | Procurement owner; tenant and selected/authorized receiving location; receiving and archive commands remain owner-authorized. |
| `stock-movements` | Stock Movements module | `…/stock-movements` | `/stock-movements` | Inventory owner; tenant/location scope, audited movement permissions; no second stock ledger. |
| `recipes` | Recipe workspace | `…/recipes` | `/recipes` | Catalog and Inventory owners; tenant/location visibility; composition and consumption mutations remain canonical owner commands. |
| `locations` | Locations workspace | `…/locations/branches`, `…/locations/registers` | `/locations/branches`, `/locations/registers` | Tenant locations and POS register owners; branch grants and settings-section capabilities govern access. |
| `shifts` | Shifts & cash workspace | `…/shifts` | `/shifts` | POS shift/drawer owner; tenant, register, branch and existing shift permissions; force-close is unavailable here. |
| `attendance` | Attendance workspace | `…/attendance` | `/attendance` | POS attendance/operator-session owner; tenant and assigned branch visibility; read-only; biometric attendance and payroll stay deferred. |
| `expenses` | Operational expenses workspace | `…/expenses` | `/expenses` | POS operational expense ledger; tenant and branch scope, existing admin/manager authorization; statutory accounting remains deferred. |
| `fnb` | F&B module | `…/fnb` | `/fnb` | POS/F&B owner for tables, checks, kitchen tickets, modifiers and service charges; tenant/location and workflow capabilities. |
| `services` | Services module | `…/services` | `/services` | Services owner for catalog, resources and bookings; tenant/location scope and service workflow permissions. |
| `hospitality` | Hospitality module | `…/hospitality` | `/hospitality` | Hospitality/PMS owner; tenant/property scope, room and reservation permissions. |
| `job-orders` | Job Orders module | `…/job-orders` | `/job-orders` | Production and Inventory owners; tenant/location scope and workflow permissions. |
| `dispatch-orders` | Dispatch Orders module | `…/dispatch-orders` | `/dispatch-orders` | POS fulfillment/delivery owner; tenant and assigned branch/run permissions. |
| `team` | Team & Access workspace | `…/team` | `/team` | Tenant Users and Employees owners; user/employee permissions and per-user location grants; shell access grants no user-management permission. |
| `reports` | Reports module | `…/reports`, `/reports` | `/reports` | Report registry and canonical POS, Inventory, Procurement and Operations read models; tenant/branch filters, server-side cost masking. |
| `notifications` | Notifications workspace | `…/notifications` | `/notifications` | Source-domain owners and notification read/acknowledgement APIs; tenant scope and per-action authorization. |
| `fiscal` | Fiscal & BIR workspace | `…/fiscal` | `/fiscal` | POS fiscal evidence owner; tenant/register scope and read permissions; accreditation and legal filing remain external gates. |
| `audit` | Audit Logs workspace | `…/audit` | `/audit` | Audit log owner; tenant scope, sensitive-value masking and audit-read permission. |
| `approvals` | Approvals workspace | `…/approvals` | `/approvals` | Each canonical command owner executes after independent approval; tenant/resource scope; unavailable commands fail closed. |
| `onboarding` | POS Onboarding workspace | `…/onboarding` | `/onboarding` | Tenant, location and workflow readiness owners; tenant scope and existing onboarding permissions. |
| `storefront` | Storefront readiness workspace | `…/storefront` | `/storefront` | Storefront owner for public presentation and commerce; tenant scope; writes use existing Storefront permissions. |
| `ai-chat` | Business Assistant module | `…/ai-chat` | `/ai-chat` | Existing assistant service; authenticated tenant context and service policy; no new authority over business commands. |
| `settings/profile` | Shared profile editor | `…/settings/profile` | `/settings/profile` | Tenant profile settings owner; server-projected view/edit capability. |
| `settings/pos` | Shared POS configuration editor | `…/settings/pos` | `/settings/pos` | POS settings owner; tenant scope and `settings:view`/`settings:edit` plus specific feature guards. |
| `settings/storefront` | Shared Storefront settings editor | `…/settings/storefront` | `/settings/storefront` | Storefront settings owner; tenant scope and Storefront capability checks. |
| `settings/delivery` | Shared delivery pricing editor | `…/settings/delivery` | `/settings/delivery` | POS delivery pricing settings owner; tenant scope and settings capabilities. |
| `settings/branches` | Shared branch/location editor | `…/settings/branches` | `/settings/branches` | Tenant Locations owner; visible branch grants, `settings:view`/`settings:edit`, and location-specific API checks. |
| `settings/team` | Shared team/access editor | `…/settings/team` | `/settings/team` | Users and Employees owners; user-management/employee-management capabilities and branch grants. |
| `settings/attendance` | Shared attendance settings editor | `…/settings/attendance` | `/settings/attendance` | POS attendance configuration owner; tenant/location scope and `settings:view`/`settings:edit`. |
| `settings/payments` | Shared payment policy editor | `…/settings/payments` | `/settings/payments` | Downpayment policy owner; tenant scope and existing `downpayment:view`/`downpayment:settings` authorization. |
| `settings/registers` | Shared register/terminal policy editor | `…/settings/registers` | `/settings/registers` | POS register/device policy owner; branch scope and existing settings/terminal permissions. |

The ellipsis in a POS route means the complete prefix is `/business-admin`. All listed workflows are available in both apps after the
restoration, subject to server authorization and workflow-mode visibility.
OPIS remains the permanent Back Office destination. The restored POS routes
preserve current access during a gradual, user-aware transition; migration
scope and sequencing will be determined as that transition is planned.
POS filters settings navigation and direct-route resolution to the nine baseline
sections listed above. OPIS retains separate Taxes and Discounts sections from
its post-extraction implementation.

## Validation evidence

- Route and surface policy: `businessAdminSurface.test.js`; POS and OPIS route
  contracts; the POS browser harness covers both app origins.
- Shared service/settings behavior: the `__tests__/businessAdmin*` suite now
  runs from `apps/dgfy-ims` as part of the `packages/web-core` test suite.
- API tenant, branch, cost-masking and session isolation evidence remains in the
  existing `apps/dgfy-api` and app-specific contracts. No API or migration files
  are changed by this restoration.
- Desktop/mobile authenticated rendered acceptance, persisted settings edit,
  terminal continuity, builds, and architecture checks are recorded in issue
  #2140 and its PR. Any unavailable authenticated evidence remains incomplete;
  it must not be described as passed.

## Release inclusion

Carry this exact text into the including candidate's release inventory:

> Restore existing POS administration workflows while retaining independently accessible DGFY OPIS.

Do not associate this work with a frozen candidate until the promoter includes it
in the actual candidate that contains the merge.
