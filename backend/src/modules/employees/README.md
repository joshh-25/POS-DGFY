# Employees Module

Tenant-local directory for company employees who may not have a DGFY or POS
login account.

Flow:

`POS routes -> employee handlers -> employee use cases -> employee repository -> tenant models`

## Rules

- Employee records belong to one tenant and never grant authentication or POS permissions.
- Employee codes are unique within the tenant and normalized to uppercase.
- Employees may be assigned to one active tenant location or remain available company-wide.
- Deactivation preserves financial and audit history.
- Employee Credit accounts may reference directory employees while legacy user-linked accounts remain supported.
- Create and update operations are transactional and write audit records.

See `docs/architecture/adr/0039-pos-employee-credit-tender-and-ledger.md`.
