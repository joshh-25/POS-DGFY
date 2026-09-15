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

## Phase 8 Workforce Read Model

`GET /api/v1/business-admin/workforce` is a read-only employee, branch-grant,
and POS-activity view. It derives performance and review indicators from
immutable transactions, successful refunds, and terminal shifts. It does not
own employee identity, PINs, terminal access, payroll, or shift-closing writes.

## All-Company Overview

`GET /api/v1/business-admin/multi-company/overview` is a separate, read-only
aggregate view. It never changes the active tenant session and never accepts a
client-provided tenant list. The backend derives the DGFY account from the
current tenant user's accepted membership, rechecks every target accepted
membership, and requires tenant-wide Business Admin access inside every target
tenant before it contributes a safe company summary. It returns no write
controls, transaction lines, payment credentials, inventory cost, or target
tenant session material.
