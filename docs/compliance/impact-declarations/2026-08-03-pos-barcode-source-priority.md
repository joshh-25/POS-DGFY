---
status: reference
owner: engineering
last_reviewed: 2026-08-03
declaration_id: 2026-08-03-pos-barcode-source-priority
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.07.20
verification_evidence: barcode-policy-unit-tests,item-transport-tests,pos-production-build,eslint
rollback_note: Revert the barcode policy, POS item form, repository guard, and tests together; no schema migration or historical barcode deletion is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-03T14:15:00+08:00
preflight_request_ref: POS-BARCODE-SOURCE-PRIORITY-2026-08-03
---

# POS Barcode Source Priority Compliance Note

## Compliance Impact Classification

Major under the repository's automated classification because the shared POS workspace is also a terminal surface. The functional change remains limited to how administrators select an item's primary barcode and preserves existing barcode aliases for scanning and audit continuity.

## Affected Surfaces

- POS Add Item and Edit Item barcode fields.
- Inventory barcode attachment and generation safeguards.
- Barcode input validation and source-priority tests.

## Compliance Preconditions

- Manual barcode takes priority when supplied.
- A valid GTIN is used only when no manual barcode is supplied.
- Automatic generation occurs only when both inputs are empty.
- Existing active barcodes are never replaced by the generation endpoint.
- Tenant-scoped uniqueness remains enforced by the existing barcode registry.
- No barcode records, inventory movements, transactions, or receipts are deleted or rewritten.

## Verification Evidence

- Barcode policy tests: 8 passed.
- Item transport tests: 8 passed.
- POS production build passed.
- Changed frontend and backend files passed ESLint with no new errors.
- `git diff --check` passed.
