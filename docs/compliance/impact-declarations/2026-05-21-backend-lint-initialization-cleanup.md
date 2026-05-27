---
status: reference
owner: engineering
last_reviewed: 2026-05-21
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-05-21-backend-lint-initialization-cleanup
classification: major
surfaces: pos,terminal,hospitality,auth
reason_codes_impacted: ALLOWED
policy_version: 2026.05.21
verification_evidence: npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the backend lint cleanup and this declaration together. No data migration, public API field, pricing, payment, receipt, or compliance lifecycle behavior is changed by this cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-21T19:35:00+08:00
preflight_request_ref: BACKEND-LINT-INITIALIZATION-CLEANUP-2026-05-21
---

# Backend Lint Initialization Cleanup

## Compliance Impact Classification

Major.

This declaration covers non-functional backend cleanup that removes unused catch bindings and narrows variable initialization in DGFY authentication middleware, hospitality booking holds, and the POS repository check flow. The POS repository file is compliance-sensitive, but this change does not alter POS order creation, pricing, payment authorization, tax calculation, receipt issuance, or compliance-mode lifecycle behavior.

## Affected Surfaces

- DGFY account authentication middleware error handling.
- Hospitality booking hold lookup local variable scope.
- POS F&B check local variable initialization.

## Compliance Preconditions

1. POS check creation and lookup semantics remain unchanged.
2. Hospitality booking hold validation still rejects missing, expired, or mismatched holds.
3. DGFY authentication still returns the same unauthorized response for invalid tokens.
4. No public API contract, migration, fiscal receipt, payment, pricing, or compliance activation behavior is included.

## Verification Evidence

- `npm run check:architecture`
- `npm run check:compliance`
- `git diff --check`
