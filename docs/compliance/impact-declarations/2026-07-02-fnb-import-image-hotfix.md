---
status: reference
owner: engineering
last_reviewed: 2026-07-02
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-02-fnb-import-image-hotfix
classification: minor
surfaces: ims-items,fnb,pos-tests
reason_codes_impacted: ALLOWED
policy_version: 2026.07.02
verification_evidence: npm --prefix backend test -- --runInBand tests/errorHandler.loggingPolicy.test.js tests/csvImportService.workflowMode.test.js tests/inventoryItemRepository.test.js,npm run qa:fnb-readiness,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the CSV import concurrency cap, Storefront catalog image fallback, upload error mapping, and matching tests. No POS runtime checkout, fiscal receipt, payment, auth, terminal pairing, or shift-opening behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-02T17:00:00+08:00
preflight_request_ref: FNB-IMPORT-IMAGE-HOTFIX-2026-07-02
---

# F&B Import And Item Image Upload Hotfix

## Compliance Impact Classification

Minor. This hotfix stabilizes F&B item CSV import write pressure, maps upload-limit errors to client-visible responses, and keeps Storefront catalog image writes usable while tenant schemas catch up to the image-gallery column.

## Affected Surfaces

1. IMS Items CSV import confirm path.
2. IMS Items Storefront Catalog image upload path.
3. Storefront catalog override repository fallback.
4. POS terminal contract test expectation only, matching the current DGFY Email label.

## Compliance Preconditions

1. POS checkout calculations, fiscal receipts, payment behavior, shift rules, and terminal pairing behavior must remain unchanged.
2. CSV import must keep validating workflow-mode templates and item taxonomy.
3. Storefront image upload must still reject invalid files and enforce upload limits.
4. The POS contract test correction must not change runtime POS UI or authentication logic.

## Verification Evidence

The commands listed in front matter must pass before deployment. Production verification should confirm that F&B CSV imports no longer fail rows from tenant DB connection pressure and that item image upload failures show a specific client-safe error when the upload is invalid.
