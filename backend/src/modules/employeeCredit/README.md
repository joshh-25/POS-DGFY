# Employee Credit Module

Tenant-local Employee Credit account, ledger, management, and
reporting boundary for the POS.

Flow:

`POS routes -> employee credit handlers -> employee credit use cases -> employee credit repository -> tenant models`

## Rules

- Employee Credit is a non-cash POS tender, not an employee discount.
- Account eligibility and available balance are server-authoritative.
- Checkout and void orchestration call the service inside the existing POS database transaction.
- Debit and reversal ledger entries are immutable and idempotent.
- Normal in-limit checkout does not require an admin, approver, cashier, or employee PIN.
- The employee name and signature line are printed on the receipt as acknowledgment evidence.
- The legacy authorization hash column remains unused for schema compatibility and is never returned by an API.
- Employee Credit is online-only, excluded from cashflow, and unavailable to Storefront checkout.

See `docs/architecture/adr/0051-pos-employee-credit-tender-and-ledger.md`.
