---
status: reference
owner: engineering
last_reviewed: 2026-06-02
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
declaration_id: 2026-06-02-pos-receipt-contract-prefix-hardening
classification: major
surfaces: pos,terminal,receipt,compliance
reason_codes_impacted: NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,COMPLIANT_ACTIVATION_PENDING
policy_version: 2026.06.02
verification_evidence: npm --prefix backend test -- --runInBand --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js,npm --prefix frontend test -- --run src/features/pos/utils/__tests__/checkoutSurfaceContract.test.js src/features/pos/__tests__/checkoutSurfaceParity.contract.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js,npm run lint:docs,npm run check:architecture,npm run check:compliance
rollback_note: Revert the receipt-contract resolver and backend replay contract changes together; do not reintroduce invoice-prefix fiscal inference on print surfaces.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-02T00:00:00+08:00
preflight_request_ref: POS-RECEIPT-CONTRACT-PREFIX-HARDENING-2026-06-02
---

# POS Receipt Contract Prefix Hardening

## Compliance Impact Classification

Major.

This declaration covers a receipt-contract hardening pass for POS checkout replay, standalone POS receipt preview/print, SKUpervisor POS receipt preview/print, and `ReceiptPrintView`. The change is compliance-sensitive because it controls how cashier print surfaces distinguish fiscal invoices from non-fiscal slips.

## Affected Surfaces

- Backend idempotent POS checkout replay now returns the persisted transaction `document_type` and `document_context` receipt contract instead of mixing current policy output with an existing transaction.
- `ReceiptPrintView` classifies fiscal display only from explicit `receipt_contract` or persisted transaction `document_type` and `document_context`.
- Standalone `POSCheckoutTerminal` and `SkupervisorPOSCheckoutTerminal` share the same resolver for receipt badges, print behavior, and preview payloads.
- Invoice number prefixes such as `INV-` and `NFS-` remain sequence identifiers only and are not fiscal-status signals.

## Compliance Preconditions

1. Server checkout and transaction-detail responses must provide explicit `document_type` and `document_context` for every receipt-capable transaction.
2. Fiscal rendering requires `document_type=fiscal_invoice` and `document_context=fiscal`.
3. Missing, invalid, or partial document contract metadata must fail closed to non-fiscal display in frontend print surfaces.
4. Fiscal print/reprint evidence remains required only when the explicit persisted transaction document type is `fiscal_invoice`.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runInBand --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js`
2. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/checkoutSurfaceContract.test.js src/features/pos/__tests__/checkoutSurfaceParity.contract.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js`
3. `npm run lint:docs`
4. `npm run check:architecture`
5. `npm run check:compliance`

## No Architecture Exception Required

The change stays within the existing POS use-case and frontend receipt-rendering boundaries. It does not add routes, repositories, models, migrations, or architecture allowlist entries.
