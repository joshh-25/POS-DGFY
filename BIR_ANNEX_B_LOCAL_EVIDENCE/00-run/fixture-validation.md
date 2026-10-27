# Local Annex B Fixture Validation

Evidence label: `LOCAL TEST — NOT FOR SUBMISSION`

Environment: localhost only (`127.0.0.1:5002` API and local MySQL). No staging or production activity was performed.

## Disposable fixtures

| Fixture | Tenant database | Taxpayer type | Terminal | Result |
|---|---|---|---|---|
| VAT | `test_tenant_bir_vat_1793081885473` | `vat_registered` | `BIR-LOCAL-VAT-01` | PASS |
| Non-VAT | `test_tenant_bir_non_vat_1793081940249` | `non_vat_registered` | `BIR-LOCAL-NONVAT-01` | PASS |

Both fixtures are separate from Masu Cafe and contain one disposable branch, three synthetic items, terminal configuration, and local-only compliance/peripheral records. No password or session token is stored in the fixture manifest.

## Verified local behavior

- DGFY login and company listing found both fixtures.
- Tenant-session establishment succeeded for both fixtures.
- Compliance profile loaded with taxpayer classification, settings, artifacts, and peripherals complete.
- Compliance mode selection succeeded for both fixtures with `non_compliant_active`.
- POS catalog returned 3 fixture items for each tenant.
- Current-shift lookup returned successfully with no open shift.
- `training_test` / `non_fiscal_slip` preflight: allowed (`ALLOWED`).
- `fiscal` / `fiscal_invoice` preflight: denied (`NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`).

The fiscal denial is intentional. The disposable fixtures do not bypass the compliant-mode activation gate and do not claim official BIR filing, RMO evidence, physical printer evidence, or accreditation.

## Defect corrected during validation

Compliance mode selection was starting its write transaction on the tenant database while updating landlord-owned `Tenant` and compliance records. That caused:

`Table 'test_tenant_bir_*.tenants' doesn't exist`

The compliance repository now starts that transaction on the landlord connection. Focused compliance tests passed: 2 suites, 17 tests.
