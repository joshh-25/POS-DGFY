---
status: reference
authority_level: reference
owner: product-and-pos
date: 2026-09-22
last_reviewed: 2026-09-22
review_by: 2027-03-22
applies_to: apps/dgfy-pos, packages/web-core, apps/dgfy-api
topic: backoffice_workflow_consolidation_acceptance
---

# Back Office workflow consolidation — Phases 455–459

This contract records the approved follow-up to the Phase 453 capability
comparison and Phase 454 navigation simplification. It consolidates entry
points and explanations around the existing canonical owners; it does not
create a second inventory, financial, user, customer, or loyalty command
owner.

## Authoritative boundaries

- POS remains the interim merchant Back Office surface under the repository
  placement policy and [ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md).
- Catalog, inventory ledger, stock commands, and production ownership follow
  [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md).
- Financial and transaction summaries remain read-model projections under
  [ADR 0005](../architecture/adr/0005-unified-sales-read-model.md); receipt-safe
  investigation remains Order Center-owned.
- Role and branch access remain mode-aware under
  [ADR 0020](../architecture/adr/0020-mode-aware-rbac.md).
- Customer identity and loyalty remain governed by
  [ADR 0023](../architecture/adr/0023-front-facing-dgfy-customer-account.md).

## Implemented consolidation contract

### Phase 455 — Inventory workflows

The Inventory insights workspace exposes one link for each verified canonical
workflow: Catalog editor, Stock movements, Suppliers, Purchase orders,
Ingredients & recipes, and Production/job orders. Packaging and labels remain
under the Catalog editor's existing product wizard. Transfers and adjustments
remain Stock Movements commands. Inventory insights remains read-only.

Physical stock counting is not represented as a new form because no canonical
count command owner is exposed by the current inventory contract. It is a
scoped follow-up (`INV-COUNT-OWNER-01`) requiring an owner, data contract,
authorization, audit semantics, and reconciliation behavior before any UI or
write path is added.

### Phase 456 — Reports and investigation

Reports keep date and branch scope at the report-owned surface, preserve
read-model totals, and export the same scope. The Sales & stock report adds
report-supported sorting and pagination. Its row-level handoffs open the
existing Sales timeline for transaction analysis and Order Center for scoped
receipt-safe investigation. Employee-focused summaries remain report-owned;
transaction sorting/paging remain in Sales timeline, and report summary rows
are not relabeled as receipts.

### Phase 457 — Team & Access

Workforce activity now distinguishes employee records from login accounts,
shows role and branch assignments from the existing workforce read model, and
directs effective permission, branch-grant, invitation, and role changes to
the existing Users & Roles workflow. Terminal permissions and Back Office
permissions are described as separate authorization surfaces. No new user
management modal or permission endpoint is introduced.

### Phase 458 — Customer workspace and loyalty boundary

Customer analytics and detail explicitly state the tenant/branch/date scope,
preserve canonical Order Center transaction detail, and do not infer global
DGFY identity from guest snapshots. Loyalty is displayed as read-only and
unimplemented for merchant writes until earning, redemption, refund,
adjustment, ownership, and accounting treatment are approved as one governed
contract.

## Phase 459 acceptance boundary

Static contracts, API authorization tests, builds, architecture checks,
documentation checks, and unauthenticated desktop/mobile route smoke are
required for the local evidence set. Authenticated browser acceptance still
requires configured company credentials and representative authorized and
restricted accounts; the local repository does not contain those credentials.
Until those scenarios run, Phase 459 remains open and must not be marked
completed.
