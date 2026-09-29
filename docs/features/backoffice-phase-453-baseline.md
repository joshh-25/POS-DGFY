---
status: reference
authority_level: reference
owner: product-and-pos
date: 2026-09-22
last_reviewed: 2026-09-22
review_by: 2027-03-22
applies_to: apps/dgfy-pos, apps/dgfy-api
topic: backoffice_phase_453_baseline
---

# Back Office capability baseline — Phase 453

## Purpose

Phase 453 establishes the evidence-backed baseline for the Loyverse comparison
and the next Back Office cleanup phases. It traces the current POS Back Office
navigation manifest, Business Admin API boundary, delegated feature owners, and
available regression coverage. A feature is not marked missing because it is
owned by another module or because its authenticated browser flow could not be
run locally.

The comparison benchmark uses the public [Loyverse Support
Center](https://help.loyverse.com/), including its [Sales Summary
report](https://help.loyverse.com/help/sales-summary-report-back-office),
[Advanced Inventory](https://help.loyverse.com/help/advanced-inventory-management),
[employee access rights](https://help.loyverse.com/help/how-manage-access-rights-employees),
[multiple-store management](https://help.loyverse.com/help/how-create-and-manage-multiple),
[customer base](https://help.loyverse.com/help/how-work-customer-base-back-office),
[loyalty program](https://help.loyverse.com/help/how-customer-loyalty-program), and
[data export](https://help.loyverse.com/help/exporting-data-from-loyverse-account)
documentation. The benchmark describes public capability behavior; it does not
override DGFY ownership or compliance contracts.

## Repository baseline

- The canonical merchant surface is POS at `/business-admin/*` and
  `/backoffice/*`. The feature contract is [Business Admin parity](backoffice.md).
- [businessAdminManifest.js](../../apps/dgfy-pos/src/features/businessAdmin/businessAdminManifest.js)
  contains 30 modules in seven navigation groups and nine settings sections.
- [businessAdmin.js](../../apps/dgfy-api/src/routes/businessAdmin.js) declares
  34 authenticated Business Admin routes. The router applies authentication,
  the tenant POS capability gate, and the Business Admin rollout gate before
  feature handlers run.
- Business Admin is a tenant-scoped read/control projection. POS owns checkout,
  payments, receipts, shifts, drawer events, refunds, voids, delivery
  operations, and terminal mutations. Catalog owns product identity and
  Inventory owns stock truth and stock effects.

## Capability status matrix

| Area | Current DGFY path and owner | Baseline status | Next decision |
| --- | --- | --- | --- |
| Overview and business health | `overview`; `/bootstrap` and `/overview`; Business Admin read model | Implemented and contract-covered | Keep as the landing page; avoid adding a second dashboard calculation. |
| Sales, orders, receipts, and payments | `sales`, `orders`, `payments`; Order Center, POS report owners, and payment monitoring | Implemented and contract-covered | Clarify Transactions versus Orders labels and entry points. |
| Reports and exports | `reports`; report registry, datasets, pagination, CSV/XLS export | Implemented and contract-covered | Standardize filters and links into receipt-safe detail. |
| Catalog and item configuration | `catalog`; delegated Catalog editor and canonical catalog owner | Implemented by delegation | Verify authenticated item, category, variant, modifier, tax, import, and export flows before adding screens. |
| Stock, valuation, recipes, and movements | `inventory`, `recipes`, `stock-movements`; Inventory Health, valuation, recipe projection, and Inventory-owned mutations | Read/monitoring implemented; mutation ownership is explicit | Verify whether transfer, count, production, and label workflows already exist behind delegated pages or require first-class entry points. |
| Suppliers and purchasing | `suppliers`, `purchase-orders`; delegated merchant Back Office pages | Present and contract-covered for current purchase-order flows | Trace receiving and supplier updates through their owning APIs before consolidating UI. |
| Customers and purchase behavior | `customers`; tenant-scoped customer read model and Order Center history | Implemented for customer analytics and history | Define merchant loyalty management separately; DGFY loyalty is currently account-scoped and read-only under ADR 0023. |
| Team, employees, permissions, and attendance | `team`, `attendance`; workforce read model, user/employee owners, attendance configuration | Present with API and contract coverage; authenticated role matrix remains unverified | Combine role, branch grant, employee, and login-account explanations into one Team & Access experience. |
| Locations, branches, registers, and company scope | `locations`, settings register section, multi-company overview | Implemented with branch and membership gates | Keep location policy separate from device enrollment and terminal hardware controls. |
| Settings and business configuration | `settings`; shared `PosSettingsWorkspace` with nine Back Office sections | Implemented; ownership split is deliberate | Simplify the navigation and labels while preserving section-level server permissions. |
| Expenses and cash control | `expenses` and `shifts`; operational expense ledger plus immutable shift/drawer projection | Expenses are partial by design; Shifts & cash is implemented read-only | Do not turn expenses into a replacement for drawer events or statutory accounting. |
| F&B, services, hospitality, jobs, and dispatch | `fnb`, `services`, `hospitality`, `job-orders`, `dispatch-orders`; workflow-owned pages | Present and workflow-gated; broader than the Loyverse retail benchmark | Keep these vertical workflows grouped and avoid exposing irrelevant modules to a tenant mode. |
| Notifications, approvals, audit, and fiscal | `notifications`, `approvals`, `audit`, `fiscal`; governed read models and approval/audit boundaries | Notifications, approvals, and audit are implemented; fiscal is partial pending external accreditation/legal gates | Preserve read-only fiscal evidence and canonical command ownership. |
| Storefront, onboarding, and assistant | `storefront`, `onboarding`, `ai-chat`; Storefront/settings/onboarding/AI owners | Present with separate ownership boundaries | Treat these as system/readiness tools, not substitutes for the core operational groups. |

## Comparison findings

Loyverse presents a smaller, more unified merchant product. Its documented
Back Office makes inventory documents, employee access rights, customer
loyalty, store selection, reports, and exports easy to find from a compact
administration surface. DGFY has equivalent coverage across the core sales,
orders, reports, catalog, inventory, customers, staff, settings, and branch
areas, but spreads the behavior across canonical owners because the system also
supports F&B, services, hospitality, dispatch, fiscal evidence, and multi-tenant
company access.

The verified DGFY cleanup target is therefore navigation and workflow clarity.
The audit did not justify merging Catalog with Inventory, Orders with POS sales
execution, Locations with terminal enrollment, or Team with attendance data.
Those are separate ownership boundaries, not duplicate sources of truth.

The following comparison items remain evidence gaps rather than confirmed
missing features:

- dedicated Back Office entry points for inventory transfers, inventory counts,
  production, and label printing;
- authenticated item/catalog flows for variants, composite items, modifiers,
  taxes, import, and export;
- authenticated multi-role testing for Owner, Administrator, Manager, Cashier,
  Inventory staff, and restricted/custom access;
- merchant-facing loyalty configuration and adjustment behavior.

## Validation evidence

- Local API, device bridge, POS, IMS, Storefront, and MySQL endpoints were
  available; API and frontend health requests returned HTTP 200.
- POS Back Office contract batch passed: 25 files and 104 tests.
- API Business Admin, reporting, inventory-health, settings, permissions,
  audit, attendance, and shift batch passed: 51 suites and 293 tests.
- Direct-route browser matrix passed: 30 modules × 2 viewports = 60 checks.
  Every unauthenticated route rendered the terminal login boundary, remained
  non-blank, produced no page errors or failed requests, and returned no HTTP
  5xx response.
- `npm run check:architecture` passed: 56 modules, 650 code files, and 101
  controller files checked.
- `git diff --check` passed.
- No E2E credential files are present in the local POS, IMS, or Storefront
  apps. Authenticated workflow proof is therefore recorded as pending rather
  than inferred from static contracts.

## Phase boundary

Phase 453 is complete when this baseline is recorded and the next work is
evidence-backed. Phase 454 is the next eligible phase and covers navigation
simplification; it requires separate approval before implementation.
