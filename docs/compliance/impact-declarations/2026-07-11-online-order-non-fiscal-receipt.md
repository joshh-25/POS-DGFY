---
status: reference
owner: engineering
last_reviewed: 2026-07-11
related_adr: 0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
declaration_id: 2026-07-11-online-order-non-fiscal-receipt
classification: major
surfaces: pos,terminal,online-orders,printing
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: POS production build,focused POS contract test,architecture guardrails,docs lint
rollback_note: Revert the dedicated receipt modal and restore the prior active-order print entry; no persisted fiscal records are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T10:20:00+08:00
preflight_request_ref: POS-ONLINE-ORDER-NON-FISCAL-RECEIPT-2026-07-11
---

# Active Online Order Non-Fiscal Receipt

## Compliance Impact Classification

Major. This changes a POS printing surface. It adds a clearly labelled non-fiscal active-order copy and does not create, alter, or infer any fiscal document.

## Affected Surfaces

- POS incoming online-order queue.
- Active-order details modal and printable order receipt.
- iMin and browser print invocation for active online orders.

## Compliance Preconditions

- The active-order document must remain labelled `Non-Fiscal Order Receipt` and state that it is not a fiscal receipt.
- Final fiscal receipts remain server-owned and available only through the completed transaction history flow.
- No fiscal print event, payment state, checkout payload, Storefront route, API response, or database record changes as part of this UI-only change.

## Verification Evidence

- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `npm run build:pos`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`
