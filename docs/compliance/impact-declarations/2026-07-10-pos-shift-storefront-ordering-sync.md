---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: 0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-07-10-pos-shift-storefront-ordering-sync
classification: major
surfaces: pos,terminal,storefront
reason_codes_impacted: POS_ORDERING_CLOSED,ALLOWED
policy_version: 2026.07.10
verification_evidence: pos-shift-usecase-tests,storefront-error-message-test,storefront-production-build
rollback_note: Revert the shift lifecycle setting synchronization; the existing location and business-hours gates remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T17:06:00+08:00
preflight_request_ref: POS-STOREFRONT-ORDERING-2026-07-10
---

# POS Shift Storefront Ordering Synchronization

## Compliance Impact Classification

Major. This changes the tenant operational ordering flag when a cashier shift opens or the final cashier shift closes. It does not alter fiscal transaction recording, discounts, tax, receipt evidence, or payment behavior.

## Affected Surfaces

- POS terminal shift open and close lifecycle.
- Storefront quote and checkout readiness feedback.

## Compliance Preconditions

- A successful shift open sets `pos_open_status` to `true`.
- Closing the final open shift sets `pos_open_status` to `false`.
- Location open/active state and configured Storefront business hours remain independent checkout gates.

## Verification Evidence

- POS shift application-result tests pass.
- Storefront error-message tests pass.
- Storefront production build passes.
