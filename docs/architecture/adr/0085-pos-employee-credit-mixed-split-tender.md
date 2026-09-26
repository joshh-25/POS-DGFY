---
status: accepted
authority_level: authoritative
owner: pos
date: 2026-09-21
last_reviewed: 2026-09-21
review_by: 2027-03-21
applies_to: architecture_decision
topic: pos_employee_credit_mixed_split_tender
---

# ADR 0085: POS Employee Credit Mixed Split Tender

## Status

Accepted (2026-09-21). This ADR is a scoped supersession of ADR 0063 clauses
1 and 4 and the split-tender restriction in ADR 0051 decision 4. All other
Employee Credit, split-tender, payment-provider, and accounting rules remain
in force.

## Context

Employee Credit is already a server-authorized POS tender for a full-credit
sale. The split-payment session can already persist multiple successful
allocation rows and complete them through the normal checkout transaction, but
its contract deliberately deferred combining Employee Credit with another
tender. That restriction prevents common counter use cases such as charging a
portion to an eligible employee tab and collecting the balance in cash, but it
is no longer required by the existing Employee Credit service or transaction
ledger.

## Decision

1. Employee Credit may be one allocation in an online POS split-payment
   session and may be combined with one or more supported cash or merchant
   owned tenders. `[binding]`
2. A split session may contain at most one successful or pending Employee
   Credit allocation. The cashier must select an eligible employee through the
   existing Employee Credit checkout selector, and the server must revalidate
   the account during final checkout. `[binding]`
3. The allocation stores the normalized internal account code needed for
   completion. Public allocation/session responses do not expose that code.
   The final checkout debits only the successful Employee Credit allocation
   amount, not the whole mixed-tender sale total. `[binding]`
4. Employee Credit is an internal tender for split allocation purposes. It
   does not use merchant-owned digital attestation, provider confirmation,
   payment references, cash received, or cash change. `[binding]`
5. Employee Credit allocation acceptance does not mutate the employee ledger.
   The existing Employee Credit service performs the account lock, eligibility
   revalidation, ledger charge, and transaction snapshots inside the same
   atomic final checkout transaction. `[binding]`
6. Cancelling an accepted but not-yet-completed Employee Credit allocation
   reverses the payment-session allocation audit row only; it does not create
   an Employee Credit ledger reversal because no ledger debit occurred.
   Completed-sale void and refund behavior remains governed by ADR 0051.
   `[default]`
7. The capability remains online-only, tenant/location/terminal/shift scoped,
   idempotent, and unavailable to offline payment replay. `[binding]`

## Consequences

- Mixed Employee Credit sales retain one POS transaction and one immutable
  payment breakdown while preserving the Employee Credit ledger as the source
  of truth for the credit portion.
- Cash reporting and drawer reconciliation include only the cash allocation;
  the Employee Credit amount remains separate from cashflow.
- The allocation schema gains an internal nullable account-code field and
  appends `employee_credit` to the allocation ENUM. The migration refuses
  rollback after Employee Credit allocation data exists.
- The existing full-credit single-payment checkout path is unchanged.

## Validation

1. Select an eligible Employee Credit account in the split dialog and combine
   it with cash; confirm the split allocation records the correct portions and
   final completion debits only the Employee Credit portion.
2. Reject Employee Credit allocation without a verified account, with an
   ineligible account, or with a second Employee Credit row.
3. Cancel an accepted pre-completion Employee Credit allocation and confirm
   the payment-session balance is restored without a ledger charge.
4. Confirm a mixed Employee Credit plus cash transaction stores cash received,
   change, and payment breakdown correctly while excluding the credit portion
   from cash totals.
5. Pass tenant migration, runtime schema audit, backend use-case/validator
   tests, frontend split-payment tests, lint, and affected builds.

## Related

- ADR 0051 (POS Employee Credit Tender and Ledger) — the split-tender
  restriction in decision 4 is superseded only for the mixed-tender capability
  defined here; all account, authorization, ledger, receipt, and void rules
  remain in force.
- ADR 0063 (POS Split Tender and Manual Walk-in Payment Recording) — clauses 1
  and 4 are superseded only to add Employee Credit to split allocation scope;
  all other clauses remain in force.
- ADR 0039 (ADR Lifecycle, Strictness Tiers, and Amendment Path) — binding
  clause supersession process.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `apps/dgfy-migration-runner/migrations/20260921000002-add-employee-credit-split-tender.cjs`

## Approval

Per ADR 0039's binding-clause change process, Pat, acting as tech lead,
approved this scoped supersession in the implementing task on 2026-09-21.
