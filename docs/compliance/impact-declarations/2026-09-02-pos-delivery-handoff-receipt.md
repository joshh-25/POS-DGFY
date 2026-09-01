---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-pos-delivery-handoff-receipt
classification: major
surfaces: pos,terminal,online-orders,printing,delivery
reason_codes_impacted: ALLOWED
policy_version: 2026.09.02
verification_evidence: npx vitest run (from apps/dgfy-ims) ../../packages/web-core/src/features/pos/__tests__/orderFulfillmentUi.test.js ../../packages/web-core/src/features/pos/__tests__/OnlineOrderReceiptModal.deliveryHandoff.test.jsx ../../packages/web-core/src/features/pos/__tests__/incomingQueueOrderActionsDeliveryPrint.test.js (24 passed),npx vitest run ../../packages/web-core/src/features/pos/__tests__/ (846 passed / 1 pre-existing unrelated failure in employeeCredit.contract.test.js),npm run build:skupervisor (succeeded),npm run build:pos (succeeded),npm run check:compliance
rollback_note: Revert this PR's diff. orderFulfillmentUi.js's getIncomingOrderUtilityActions is the sole behavioral change to an existing action-eligibility function (out_for_delivery gains 'print_receipt' alongside the pre-existing 'open_order'); OnlineOrderReceiptModal.jsx's additions are purely additive render blocks (merchant header, delivery-job block) gated on data already present in the fetched order payload; TerminalPageDialogLayer.jsx's change is one new prop (businessSettings) passed to an existing render site. No API, database, or hardware-dispatch code changes at all -- reverting the four touched frontend files fully restores prior behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1319
---

# POS Delivery Handoff Receipt (#1319)

## Compliance Impact Classification

Major. This extends an existing POS printing surface (the same surface the
`2026-07-11-online-order-non-fiscal-receipt.md` declaration covers) to also print during the
in-progress delivery handoff window, rather than opening a new/parallel document type or printing
pipeline.

## Affected Surfaces

- POS incoming online-order queue (card and table views) -- the print/reprint action becomes
  available while an order's `fulfillment_status` is `out_for_delivery`, across every
  `deliveryJob.status` sub-state (`pending_dispatch`/`assigned`/`picked_up`/`delivered`).
- `OnlineOrderReceiptModal.jsx` -- the existing "Non-Fiscal Order Receipt" document, extended
  (additive only) with a merchant/branch identity header and a delivery-job block (delivery status,
  assigned personnel or third-party courier name, delivery run label).
- ADR 0045's shared hardware-dispatch path (`posHardware.printReceipt` via the driver chain) is
  reused unchanged -- no new printing pipeline, no change to `@sieitzz/pos-receipt`.

## Compliance Preconditions

- The delivery receipt remains the existing `Non-Fiscal Order Receipt` document -- no new or
  renamed document type, and no OR/fiscal claim is made or implied by this change.
- No fiscal print event, payment field, checkout payload, API contract, or database record changes
  as part of this change -- it is a read (already-fetched order data) + render + optional
  hardware-dispatch action only. `buildTransactionInclude()`
  (`apps/dgfy-api/src/modules/pos/repositories/posRepository.js`) already includes every field this
  change renders (`deliveryJob`, `deliveryPersonnel`, `deliveryRun`); no backend file is touched.
- Respects #842/`docs/features/DOWNPAYMENT.md` §6: neither a capture nor a balance settlement
  produces a fiscal receipting event today (ADR 0069 cl.9, carried by ADR 0070), and this change
  does not introduce or imply a fiscal receipting event for the delivery leg either. Reusing
  `OnlineOrderReceiptModal` as-is, rather than authoring a new document type, is what keeps this
  constraint satisfied by construction.
- Reprint safety: the manual print path never calls `claimOnlineOrderReceiptAutoPrint` (gated
  behind `requireAutomaticClaim`, used only by the automatic payment-confirmation auto-print flow)
  and never writes `receipt_print_status` or any other transaction field -- confirmed structurally
  incapable of advancing `fulfillment_status`/`deliveryJob.status`/`payment_status` as a side effect
  of printing.

## Verification Evidence

- `orderFulfillmentUi.test.js` -- new assertion that `getIncomingOrderUtilityActions` returns
  `['print_receipt', 'open_order']` for `out_for_delivery` across every `deliveryJob.status`
  sub-state, and with no `deliveryJob` loaded yet; existing `completed` regression (`[]`) unchanged.
- `OnlineOrderReceiptModal.deliveryHandoff.test.jsx` (new) -- merchant identity rendering (including
  the DGFY-brand-name suppression rule mirrored from `ReceiptPrintView.jsx`), registered and
  third-party delivery-person rendering, the explicit "Not yet assigned" state, the delivery-run
  label (and its absence when the order isn't a run member), and a guard that the document still
  reads "Non-Fiscal Order Receipt" / "not a fiscal receipt" (#842 regression guard).
- `incomingQueueOrderActionsDeliveryPrint.test.js` (new) -- the shared `buildIncomingQueueOrderActions`
  builder (consumed by both card and table queue views) renders the print/reprint button for
  `out_for_delivery`, dispatches only `handleOpenIncomingOrderReceipt` (never
  `handleIncomingOrderStatusChange`/`handleDeliveryJobStatusChange`), supports independent repeat
  prints, and requests a retry when `receipt_print_status === 'failed'`.
- `npm run build:skupervisor` and `npm run build:pos` both succeed -- both consume
  `packages/web-core`'s touched files (`orderFulfillmentUi.js`, `OnlineOrderReceiptModal.jsx`,
  `TerminalPageDialogLayer.jsx`) through their `file:` dependency.
- Full `packages/web-core/src/features/pos/__tests__/` suite run from `apps/dgfy-ims`: 846/847
  passed; the one failure (`employeeCredit.contract.test.js`) is a pre-existing source-string
  contract assertion unrelated to any file this change touches.

## Residual Risks

None beyond what the 2026-07-11 declaration already accepted for this document type. A dedicated
bulk per-run print action (Delivery Runs tab) is explicitly out of scope for #1319 and is not added
here.

## Preflight Reconciliation

`NOT-EXECUTED-1319` is expected for a `develop`-targeting PR; the live preflight sweep
(`compliance-preflight-sweep.yml`) runs continuously against `develop` per
`docs/compliance/request-time-preflight-protocol.md`, not at promotion time, and will reconcile this
declaration's front matter automatically once triggered by this PR's merge.
