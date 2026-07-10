---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: 0034-manual-delivery-job-foundation.md
declaration_id: 2026-07-10-pos-open-order-modal-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: pos-production-build,pos-terminal-contract-tests,frontend-eslint
rollback_note: Revert the Open Order modal presentation component; no order data or backend behavior changes are required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T17:28:00+08:00
preflight_request_ref: POS-OPEN-ORDER-MODAL-2026-07-10
---

# POS Open Order Modal Layout

## Compliance Impact Classification

Major by repository surface classification. The implementation itself is a presentation-only reorganization of the existing active-order details modal.

## Affected Surfaces

- POS incoming-order detail review.
- POS active-order print action placement.

## Compliance Preconditions

- Existing order data, status labels, totals, and customer information remain unchanged.
- Existing Close and Print Order handlers remain unchanged.
- No fiscal, payment, discount, inventory, or fulfillment mutation logic is added.

## Verification Evidence

- POS production build passes.
- POS terminal contract tests pass.
- Frontend ESLint passes for the modal component.
