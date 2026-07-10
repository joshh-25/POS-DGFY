---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: 0034-manual-delivery-job-foundation.md
declaration_id: 2026-07-10-pos-active-shift-void-authorization
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_SHIFT_CLOSED,ALLOWED
policy_version: 2026.07.10
verification_evidence: backend-lint,architecture-guardrails,controller-boundaries,focused-void-regression,pos-production-build
rollback_note: Revert the active-shift void request and validation changes together; the former transaction-terminal guard remains available in prior history.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T15:20:00+08:00
preflight_request_ref: POS-VOID-2026-07-10
---

# POS Active-Shift Void Authorization

## Compliance Impact Classification

Major. The change affects a governed POS mutation, but does not change fiscal document generation, stock-reversal records, permission requirements, or Storefront contracts.

## Affected Surfaces

- POS history void action.
- POS transaction void validation and use case.
- Terminal shift authorization.

## Compliance Preconditions

- The authenticated user has the existing `pos:void` permission.
- The request supplies a current open shift owned by that user.
- The current terminal identity, when supplied, matches that shift.
- A non-empty void reason remains required.

## Verification Evidence

- Backend lint, architecture guardrails, and controller-boundary checks pass.
- Focused fiscal void regression passes with a current shift that differs from the original transaction terminal.
- POS production build passes.
