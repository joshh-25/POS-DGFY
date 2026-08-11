---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-pos-terminal-dialog-code-splitting
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: POS terminal contract tests,production builds,frontend route chunk budget gate
rollback_note: Revert the dialog-layer extraction and lazy service-options import together; no database or financial records are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: POS-TERMINAL-BUNDLE-PHASE42-20260811
---

# POS Terminal Dialog Code Splitting

## Compliance Impact Classification

Major. This refactor preserves the existing POS authorization, shift,
Day Close, order, and receipt behaviors while loading modal-only UI in a
separate route chunk. It does not alter financial calculations, persistence,
permissions, or tenant boundaries.

## Affected Surfaces

1. POS terminal startup and modal rendering.
2. Shift, Day Close, online-order, receipt, and hardware-message dialogs.
3. Checkout service-options loading.

## Compliance Preconditions

1. Existing authorization and shift gates remain owned by `TerminalPage`.
2. The extracted layer receives state and actions only through its model; it
   does not create alternate API or persistence paths.
3. Existing financial calculations and immutable reporting records remain
   unchanged.

## Verification Evidence

1. POS terminal and Day Close source contracts pass against the extracted
   dialog layer.
2. Production builds complete for SKUpervisor, POS, and Storefront.
3. The enforced route budget passes without increasing configured limits.
4. Authenticated browser qualification remains required before promotion.
