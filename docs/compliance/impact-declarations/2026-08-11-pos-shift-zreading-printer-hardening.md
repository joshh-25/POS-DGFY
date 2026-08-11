---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-pos-shift-zreading-printer-hardening
classification: regulatory
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: POS shift and Z-reading use-case tests,isolated sales reconciliation,canonical payment-breakdown contracts,iMin hardware audit contracts,POS production build
rollback_note: Revert the POS reporting and hardware commits together; retain immutable Z-reading and audit rows and use compensating records rather than deleting financial evidence.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: POS-SHIFT-ZREADING-PRINTER-PHASE42-20260811
---

# POS Shift, Z-Reading, And Printer Hardening

## Compliance Impact Classification

Regulatory. The change affects cashier shift lifecycle, Day Close eligibility,
recognized-sales summaries, payment-method disclosure, POS void reporting,
tenant receipt branding, and auditable physical print/drawer actions. It does
not change the ownership of provider settlement or authorize fiscal receipts.

## Affected Surfaces

1. POS open, resume, close, and post-shift Day Close navigation.
2. Cashier shift summaries and immutable branch Z-readings.
3. Cash, GCash, Maya, card, employee-credit, and Other tender disclosure.
4. Browser, iMin, and LAN receipt/report rendering and company branding.
5. iMin print and drawer result reporting with idempotent audit evidence.
6. Shift-location schema reconciliation for existing tenant databases.

## Compliance Preconditions

1. All branch shifts must be closed before a Z-reading can be generated.
2. Only an authorized authenticated user with their own verified Day Close PIN
   can generate the branch Z-reading.
3. Recognized sales include completed transactions only; voids are disclosed
   separately and are not double-subtracted.
4. Provider refunds remain in the payment/settlement ledger and are not
   reclassified as POS voids.
5. Existing immutable Z-reading snapshots remain readable and are normalized
   without silently rewriting historical totals.
6. A successful physical action is never repeated solely because backend audit
   acknowledgement failed; audit retries use stable idempotency keys.
7. Additive/remediation migration behavior must pass fresh tenant-schema and
   existing-schema reconciliation before promotion.

## Verification Evidence

1. Focused repository/use-case tests cover shift readiness, Z-reading,
   payment-method aggregation, void disclosure, and transport contracts.
2. Isolated database tests cover POS checkout, online orders, inventory,
   Z-reading, unified sales, and shift-location migration reconciliation.
3. Frontend contracts cover Day Close gates, terminal handoff, payment rows,
   report rendering, and negative UI states.
4. iMin driver tests cover separate receipt/drawer audit events, stable
   idempotency, audit retry, and rejection without shift context.
5. Architecture, compliance, documentation, POS build, and post-merge browser
   qualification remain required before opening the draft PR.
