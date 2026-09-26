---
status: accepted
authority_level: authoritative
owner: engineering
date: 2026-09-17
last_reviewed: 2026-09-17
review_by: 2027-03-17
applies_to: pos_business_admin, operational_expenses, tenant_financial_evidence
topic: pos_business_admin_operational_expense_ledger
---

# ADR 0084: POS Business Admin Operational Expense Ledger

## Status

Accepted (2026-09-17)

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> clauses below are tagged `binding`, `default`, or `snapshot`.

## Context

The POS Business Admin surface exposed an Expenses entry point, but it only
showed a policy placeholder. The product needs a useful operational record of
money spent by a tenant without inventing a second POS cash drawer, tax engine,
or statutory general ledger. No existing accounting owner or tax contract
defines profit-after-expenses calculations.

## Decision

1. `[binding]` **Owner and boundary.** POS Business Admin owns a tenant-local
   operational expense ledger. It records operating-cost evidence for merchant
   review; it is not a statutory general ledger, tax filing ledger, payout
   settlement ledger, or profit calculator.
2. `[default]` **Record shape.** Each record stores a Manila-local expense date,
   optional branch, branch-name snapshot, category, description, positive PHP
   amount with four-decimal storage, payment method, optional vendor/reference/
   notes, creator, and lifecycle status. The supported lifecycle is
   `posted -> voided`; posted records are never edited or hard-deleted.
3. `[binding]` **Tenant and scope.** Records live in the active tenant
   database. Admin/master users may create company-wide or branch records;
   assigned managers must select an assigned active branch. Reads, creates, and
   voids are filtered server-side by the authenticated tenant and branch grants.
4. `[binding]` **Authorization.** `expenses:view`, `expenses:create`, and
   `expenses:void` are separate permissions. Admin/master users bypass the
   permission-array check; the default manager role receives all three. Cashier
   users cannot access Business Admin or this ledger.
5. `[binding]` **Audit and retry safety.** Creates and voids append an audit
   event. Creates require a unique idempotency key and replay the original
   result when the same request is safely retried. Voids require a reason and
   retain the original amount and record in the ledger.
6. `[binding]` **Cash boundary.** Cash added, cash-out, drawer variance, and
   shift reconciliation remain owned by POS Shifts & cash. Recording a cash
   expense does not create a drawer event or alter shift totals.
7. `[default]` **Deferred calculations.** Profit after expenses, tax/VAT/BIR
   treatment, account-code mapping, accruals, payable settlement, and statutory
   exports remain deferred until Finance/accounting ownership and an approved
   data contract exist.

## Consequences

- Merchants can record, search, filter, review, and void operating expenses in
  the POS Business Admin workspace.
- Existing tenants receive the additive table and indexes through the reviewed
  migration and tenant-schema repair registry; no historical POS data is
  rewritten.
- The UI can show ledger totals, but it must not label them as accounting
  profit, tax totals, or drawer cash movement.
- A future accounting integration may consume these records only through an
  explicit follow-up ADR or amendment that defines ownership, retention,
  mapping, and reconciliation.

## Validation and rollback

- Unit/use-case contracts cover branch scoping, validation, idempotent create,
  reasoned void, audit calls, and cashier denial.
- POS contracts and production build cover the data-backed workspace, create
  form, void flow, search/filter wiring, and responsive mobile cards.
- Rollback is additive code/schema rollback only before production adoption;
  once records exist, remove/disable UI access through a governed migration or
  follow-up decision rather than dropping tenant evidence.
