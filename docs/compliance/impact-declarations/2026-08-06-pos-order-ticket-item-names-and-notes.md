---
status: reference
owner: engineering
last_reviewed: 2026-08-06
related_adr: 0045-shared-pos-receipt-renderer.md,0053-pluggable-pos-hardware-device-drivers.md
declaration_id: 2026-08-06-pos-order-ticket-item-names-and-notes
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.06
verification_evidence: targeted iMin order-ticket and receipt tests,receipt contract conformance tests,POS production build,architecture checks,compliance checks
rollback_note: Revert the order-ticket name normalization, order-note forwarding, receipt business-icon regression test, and this declaration together. Receipt totals, fiscal classification, transaction persistence, and Cashier ID history filtering are unaffected.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-06T21:23:14+08:00
preflight_request_ref: DGFY-000-POS-ORDER-TICKET-PRINT-DETAILS
---

# POS Order-Ticket Item Names And Notes

## Compliance Impact Classification

Major, within the existing POS frontend and client-managed hardware-driver boundary. The change
corrects descriptive text sent to the kitchen/order-copy printer and forwards the cashier-entered
kitchen note to that same non-fiscal order copy. It does not change receipt totals, taxes, fiscal
classification, payment handling, transaction persistence, authorization, or backend contracts.

## Affected Surfaces

1. The iMin order-ticket formatter resolves item names from the supported cart and incoming-order
   payload shapes before using `Item #<id>` as a last-resort fallback.
2. The POS checkout forwards the existing Kitchen Notes value to the order-ticket hardware driver.
3. Incoming-order printing forwards an existing order-note field when one is present.
4. Focused tests prove the item-name precedence, explicit ID fallback, order-note output, and the
   existing tenant business-icon dispatch used by printed receipts.
5. The History Cashier ID filter is not changed or included in this work.

## Compliance Preconditions

1. Order-ticket item names and notes are display-only and must not alter catalog, cart, transaction,
   payment, tax, discount, or inventory values.
2. The item number remains available only when every supported item-name field is absent.
3. Order notes must be omitted when empty and wrapped to the configured thermal paper width when
   present.
4. Receipt business-icon dispatch remains optional; a missing icon or bitmap-capable bridge must
   never block receipt text printing or transaction completion.
5. No new hardware reason code, backend API shape, schema field, or architecture exception is
   introduced.

## Verification Evidence

Required validation:

1. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/iminHardwareBridge.orderTicket.test.js src/features/pos/utils/__tests__/iminHardwareBridge.printFailure.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js`
2. `npm --prefix frontend run build:pos`
3. `npm run check:architecture`
4. `npm run check:compliance`
5. `npm run lint:docs`
6. `git diff --check`

Expected results:

- Supported payloads print their item name; only nameless payloads print `Item #<id>`.
- Kitchen/order notes print without affecting fiscal receipt calculations or persistence.
- Configured business icons continue to dispatch before receipt text on bitmap-capable bridges.
- POS production build and repository architecture/compliance gates pass.

## Deployment And Rollback

Deploy the order-ticket formatter, POS note forwarding, hardware-driver forwarding, focused tests,
and this declaration together. Roll back the same files together if kitchen/order-copy output
regresses. No database migration, data cleanup, backend rollback, or Cashier ID search change is
required.
