---
status: accepted
date: 2026-07-29
last_reviewed: 2026-07-30
classification: authoritative
---

# ADR 0039: POS Employee Credit Tender and Ledger

## Context

The POS supports employee discounts, but a discount is not a payment method. The
business also needs an employee open-tab account that an eligible employee may use
to charge an active POS sale. A charge is allowed even when the legacy funded
balance or available-credit value is zero. Treating that charge as cash would
corrupt drawer and cashflow totals, while treating it as a discount would lose the
amount owed, employee evidence, outstanding balance, repayment history, and
reversal trail.

## Decision

1. Employee Credit is a POS payment tender named `employee_credit`. It is separate
   from the governed Employee Discount defined by ADR 0033.
2. The employee receiving the credit may differ from the signed-in cashier. The
   cashier selects the tender and looks up the eligible employee account; the
   employee acknowledges the purchase by signing the printed receipt.
3. Normal in-limit Employee Credit checkout does not require an admin, approver,
   cashier, or employee PIN. Existing authorization hash columns remain unused for
   backward-compatible schemas and are never returned by an API.
4. Version 1 supports full-credit payment only. Split tender, payroll deduction,
   interest, rollover policy, and Storefront use are outside this decision.
5. Employee Credit checkout is online-only and requires the normal authenticated
   POS permission, tenant, terminal, location, and active-shift controls.
6. The server is authoritative for employee identity, active and eligible status,
   outstanding balance, final transaction amount, and account mutation.
   Client-supplied balances are display data only. Legacy funded balance and credit
   limit fields remain backward-compatible metadata and do not block an otherwise
   eligible open-tab charge.
7. Checkout locks the employee account and writes the POS transaction, positive
   outstanding-balance charge, immutable ledger entry, audit log, stock effects,
   and receipt snapshots in the same tenant database transaction.
8. Every charge has a unique idempotency key. A retry returns the existing ledger
   entry and cannot increase the outstanding balance twice or create a second sale
   payment.
9. Voiding an Employee Credit transaction creates one idempotent negative reversal
   ledger entry and reduces the outstanding balance in the same void transaction.
   Historical charge entries are never deleted or rewritten. Legacy debit entries
   remain reversible for backward compatibility.
10. Receipts show `Employee Credit`, employee name, masked account code, amount,
    resulting outstanding balance, authorization reference, and an employee
    signature line.
11. Employee Credit is excluded from cash received, cash drawer opening, and cash
    flow totals. It has a dedicated permissioned ledger report.
12. Managers or admins with the dedicated management permission may enable an
    employee, record reasoned idempotent repayments, and post reasoned idempotent
    outstanding-balance corrections. A repayment cannot exceed the outstanding
    balance, and a correction may never create a negative outstanding balance.
13. Employee identity is tenant-owned and does not require a POS login account.
    The Employee Directory stores an employee code, full name, optional contact
    details, optional branch assignment, and active status. Authentication roles,
    credentials, and permissions remain separate.
14. New Employee Credit accounts reference an Employee Directory record. Existing
    user-linked Employee Credit accounts remain supported for backward compatibility
    and are not rewritten or deleted by the directory migration.
15. POS checkout uses a permissioned, searchable employee selector instead of
    requiring cashiers to type an account code. Checkout options expose only the
    employee identity, branch, eligibility, safe account status, balance, and credit
    limit needed for selection. The existing account code remains an internal
    compatibility identifier and is revalidated by the server after selection.
16. Employee Credit charge audit evidence records both the selected employee
    identity and the authenticated cashier or admin who applied the tender. The
    immutable ledger remains the financial source of truth.
17. Employee Credit is an open-tab workflow, not a prepaid wallet. Checkout does
    not require a funded balance, available-credit balance, or credit-limit
    sufficiency check. Business collection policy is represented through repayments
    and reporting rather than by silently rejecting an eligible employee at
    checkout.

## Boundary Consequences

The Employee Credit module owns account eligibility, outstanding-balance mutation,
repayment and correction commands, ledger queries, and management use cases. POS
checkout and void use cases orchestrate the module inside their existing database
transaction. Routes remain transport-only, repositories own Sequelize access, and
the receipt layer reads saved transaction snapshots rather than live employee
account data.

No Storefront route, payload, response, payment webhook, delivery workflow, or
commercial/statutory discount contract changes under this decision. No architecture
allowlist exception is introduced.

## Migration and Rollback

Migration `20260729000001-create-employee-credit-ledger.cjs` creates tenant-local
`employee_credit_accounts` and `employee_credit_ledger_entries`, extends the POS
payment enum, and adds nullable receipt/audit snapshots to `pos_transactions`.
Migration `20260729000002-create-employee-directory.cjs` creates tenant-local
`employees`, permits either a legacy user or directory employee credit-account
owner, and adds the directory employee reference to POS transactions.
Migration `20260730000001-convert-employee-credit-to-outstanding-balance.cjs`
adds the account outstanding balance, charge and repayment ledger types, and the
transaction outstanding-balance snapshot without removing legacy funded-balance
or debit history.
The tenant schema synchronizer and runtime schema audit require the same capability
set so deployment fails before runtime if a tenant is missing it.

Rollback is safe only after Employee Credit is disabled and all environments have
confirmed that no active transaction depends on the new tender. Financial history
must be exported or retained according to the release rollback plan before dropping
ledger tables or transaction snapshots. The directory migration refuses rollback
while any employee-only credit account exists, preventing orphaned financial data.

## Validation

1. Successful full-credit open-tab charge with employee, cashier, shift, terminal,
   location, authorization reference, and resulting outstanding-balance evidence.
2. Ineligible or inactive employee, offline checkout, closed shift, and missing
   permission rejection without any checkout PIN requirement. An eligible employee
   with zero funded or available credit remains chargeable.
3. Duplicate checkout replay without a second outstanding-balance update or ledger
   entry.
4. Void reversal and duplicate void replay without reducing the outstanding
   balance twice.
5. Receipt and iMin output include credit evidence and never open the cash drawer.
6. Employee Credit report totals are separate and explicitly excluded from cashflow.
7. Fresh and upgraded tenant migration coverage, runtime schema audit, architecture
   guardrails, backend tests, frontend contract tests, lint, and affected builds.
8. Create, update, deactivate, reactivate, and branch-assign a non-login employee;
   configure credit for that employee; complete and void a credit sale; confirm the
   receipt and dedicated report retain the employee identity.
9. Search and select eligible, ineligible, unconfigured, branch-assigned, and legacy
   employees; confirm checkout remains disabled until server validation succeeds and
   audit history identifies both employee and acting cashier/admin.
10. Record a repayment, replay the same idempotency key, reject overpayment, and
    confirm outstanding balance and immutable ledger history.
11. Apply a reasoned administrative correction, reject a correction that would
    create a negative balance, and confirm the legacy funded balance is unchanged.

## Authoritative Sources

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0007-pos-storefront-and-payment-boundaries.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
