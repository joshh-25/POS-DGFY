---
status: reference
owner: pos
last_reviewed: 2026-06-18
declaration_id: 2026-06-18-pos-receipt-paper-width-and-dgfy-reminder-dismiss
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.06.18
verification_evidence: npm run lint:docs,npm run check:compliance,npm --prefix frontend test -- --run src/features/pos/__tests__/receiptContractConformance.contract.test.js,npm --prefix frontend run build:pos,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the receipt paper-width selector, ReceiptPrintView paper-width rendering, DGFY reminder dismiss state, POS recent-changes documentation, and this declaration together.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T14:15:00+08:00
preflight_request_ref: POS-RECEIPT-WIDTH-DGFY-REMINDER-2026-06-18
---

# POS Receipt Paper Width And DGFY Reminder Dismiss

## Compliance Impact Classification

Major.

This declaration covers frontend-only POS and SKUpervisor receipt presentation changes plus a dismiss control for the legacy DGFY account reminder. The files are compliance-sensitive because they render POS receipts and terminal workflow controls. The change does not alter receipt amounts, tax calculations, fiscal document classification, transaction persistence, authentication decisions, or backend authorization.

## Affected Surfaces

1. `ReceiptPrintView` accepts a presentation-only paper width and renders either `80mm` or `57mm` output while preserving the existing receipt data contract.
2. POS receipt preview and print controls allow the cashier to select `80mm (3 1/8 inches)` or `57mm (2 1/4 inches)`.
3. SKUpervisor receipt preview uses the same paper-width selection and shared receipt renderer.
4. The POS legacy DGFY account reminder has an accessible dismiss button that hides the reminder for the current mounted terminal session.
5. The POS recent-changes document records the receipt and reminder behavior.

## Compliance Preconditions

1. Receipt totals, tax fields, fiscal labels, transaction identifiers, and immutable receipt contract data must remain unchanged.
2. Paper width must affect presentation only and must not modify persisted transaction or business settings data.
3. Unsupported paper-width values must fall back to `80mm`.
4. Dismissing the DGFY reminder must not mark the user as linked, change account state, bypass authentication, or modify the backend grace-period policy.
5. Existing link-code and DGFY account creation actions must remain available until the reminder is dismissed.
6. POS and SKUpervisor production builds must both succeed because they share receipt rendering behavior.

## Verification Evidence

Validation required for this declaration:

1. `npm run lint:docs`
2. `npm run check:compliance`
3. `npm --prefix frontend test -- --run src/features/pos/__tests__/receiptContractConformance.contract.test.js`
4. `npm --prefix frontend run build:pos`
5. `npm --prefix frontend run build:skupervisor`
6. `git diff --check`

Expected results:

- The compliance declaration is accepted for the `pos` and `terminal` surfaces.
- Receipt contract tests continue to pass without fiscal-data changes.
- POS and SKUpervisor builds complete successfully.
- No whitespace errors are introduced.

## Deployment And Rollback

Deploy the receipt renderer, both paper selectors, the DGFY reminder dismiss control, the POS recent-changes documentation, and this declaration together. If receipt preview or terminal workflow regresses, revert the same files together. No database rollback or backend deployment is required.
