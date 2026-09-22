# Business Admin Module

Business Admin owns tenant-scoped administrative read models for business owners
and authorized administrators. It does not own POS checkout, Storefront public
commerce, Catalog identity, or Inventory stock mutations.

Phase 1 exposes a read-only overview contract for business health across
branches, registers, cashiers, sales, payment collections, recent finalized
transactions, and overdue open shifts. Every result is tenant-scoped and uses
the caller's authorized branch scope.

## Phase 4 POS Reporting

`GET /api/v1/business-admin/reports` is a read-only adapter over the canonical
POS report repository. It does not recalculate financial totals or modify POS
transactions. The use case supplies the caller's authorized branch scope to the
POS query, so assigned Business Admin users cannot aggregate sales from another
branch.

The report response includes recognized sales, payments, discounts, refunds and
voids, fulfillment methods, cashiers, and top items. COGS, POS profit/loss, and
profit margins are removed by the backend unless the caller has the existing
`business_admin:view_costs` capability. The frontend must treat that server
flag as advisory only.

## Phase 442 canonical report registry

`domain/reportRegistry.js` is the shared metadata source for Business Admin
report definitions. It owns the stable report key, label, filter contract,
sort fields, aggregation/read-model owner, permission requirements, cost
visibility capability, pagination limit, export formats, formatting timezone,
and compatibility endpoint. `businessAdminReportCatalog.js` remains the
Business Admin row-shaping adapter, while financial and inventory repositories
consume the registry for sort validation instead of maintaining parallel field
lists.

This phase does not route terminal reporting through Business Admin. POS keeps
the active-shift, register, attendance, handoff, and offline/local report
calculators and permissions. Legacy `/reports/*` consumers remain registered
as compatibility seams for individual, result-compared migrations.

## Phase 443 inventory health adapter

Business Admin consumes Inventory Health as a read-only projection. Branch
low-stock rows use the inventory-owned status predicate and expose the
canonical `stock_status`; branch valuation calls the inventory cost service's
weighted location projection. Business Admin does not own threshold formulas,
FIFO valuation, stock mutations, movement history, catalog authoring, or
recipe composition.

## Phase 8 Workforce Read Model

`GET /api/v1/business-admin/workforce` is a read-only employee, branch-grant,
and POS-activity view. It derives performance and review indicators from
immutable transactions, successful refunds, and terminal shifts. It does not
own employee identity, PINs, terminal access, payroll, or shift-closing writes.

## Shared Shift Activity Projection

`businessAdminShiftActivityRepository.getByShiftIds` is the shared read-only
source for shift-grain orders processed, discounts, successful refunds, and
void counts. Overview and Shift History use the same projection so identical
transactions cannot produce different activity totals. The canonical POS
report repositories remain the owner of gross/net sales, payment totals, and
broader financial report semantics; this projection does not recalculate
accounting totals or write shift data.

## Shared Sales & Orders Projection

The Business Admin Order Center is the canonical original-receipt investigation
source for POS and Storefront order detail, including customer, items,
discounts, payments, refund adjustments, and audit evidence. The Sales Timeline
remains the chronological unified POS/Dispatch analysis surface and links POS
records to Order Center detail rather than reconstructing operational history.
The Order Center list also accepts the read-only `receipt_type` filter:
`sales`, `refund`, or `voided`. Refund receipts require a finalized refund
state; pending refund requests remain visible through the unfiltered history
and their existing payment status rather than being presented as completed
refund receipts.
Customer history reuses Order Center summaries for related transactions while
retaining its own customer aggregate and favorite-product analytics. Provider
refund monitoring remains under Payments; no second refund mutation or
cross-source refund owner is introduced.

## All-Company Overview

`GET /api/v1/business-admin/multi-company/overview` is a separate, read-only
aggregate view. It never changes the active tenant session and never accepts a
client-provided tenant list. The backend derives the DGFY account from the
current tenant user's accepted membership, rechecks every target accepted
membership, and requires tenant-wide Business Admin access inside every target
tenant before it contributes a safe company summary. It returns no write
controls, transaction lines, payment credentials, inventory cost, or target
tenant session material.
