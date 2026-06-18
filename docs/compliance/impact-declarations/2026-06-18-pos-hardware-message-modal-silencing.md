---
status: reference
owner: pos
last_reviewed: 2026-06-18
declaration_id: 2026-06-18-pos-hardware-message-modal-silencing
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.06.18
verification_evidence: npm run lint:docs,npm run check:compliance,npm --prefix frontend test -- --run src/features/pos/utils/__tests__/posHardwareMessageBus.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js,npm --prefix frontend run build:pos,git diff --check
rollback_note: Re-enable POS hardware message event dispatch and revert the message-policy test and this declaration together if interrupting modal behavior is required again.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T14:40:00+08:00
preflight_request_ref: POS-HARDWARE-MESSAGE-SILENCE-2026-06-18
---

# POS Hardware Message Modal Silencing

## Compliance Impact Classification

Major.

This declaration covers disabling the interrupting POS hardware-message modal at the central browser event bus. Hardware operations, returned payloads, operation-level failures, and diagnostic logging remain unchanged.

## Affected Surfaces

1. POS hardware messages no longer dispatch the browser event that opens `PosHardwareMessageModal`.
2. Hardware message payload normalization remains available to calling printer, cash-drawer, and device-bridge code.
3. A focused policy test keeps the modal disabled unless a future governed change explicitly re-enables it.

## Compliance Preconditions

1. Printer, cash-drawer, and device-bridge requests must continue to execute normally.
2. Hardware call failures must continue to reject or return their existing operation-level error state.
3. Silencing the modal must not convert failed hardware operations into successful operations.
4. Receipt generation, fiscal values, transaction persistence, authentication, and authorization must remain unchanged.
5. Re-enabling the modal requires updating the policy test and compliance declaration together.

## Verification Evidence

Required validation:

1. `npm run lint:docs`
2. `npm run check:compliance`
3. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/posHardwareMessageBus.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js`
4. `npm --prefix frontend run build:pos`
5. `git diff --check`

## Deployment And Rollback

Deploy the message-bus policy, policy test, and this declaration together. Rollback requires restoring hardware-message browser event dispatch and reverting the policy test and declaration. No database or backend rollback is required.
