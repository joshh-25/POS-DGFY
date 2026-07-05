---
status: reference
owner: engineering
last_reviewed: 2026-07-05
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-05-backend-lint-cleanup
classification: major
surfaces: pos,terminal,dgfy,inventory,health
reason_codes_impacted: ALLOWED
policy_version: 2026.07.05
verification_evidence: npm --prefix backend run lint,npm run check:compliance,git diff --check
rollback_note: Revert the backend lint cleanup and this declaration together. No POS sale, pricing, payment, receipt, stock, authorization, or compliance lifecycle behavior is changed by this cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-05T22:35:00+08:00
preflight_request_ref: BACKEND-LINT-CLEANUP-2026-07-05
---

# Backend Lint Cleanup

## Compliance Impact Classification

Major.

This declaration covers non-functional backend lint cleanup in DGFY invitation handling, inventory repository payload filtering, POS use cases, health runtime SHA reading, and cashier credential email status initialization. The POS use-case file is compliance-sensitive, but this change removes unused variables and preserves existing behavior.

## Affected Surfaces

1. POS checkout stock loop no longer creates an unused local item variable.
2. Retired local POS cashier creation use case no longer declares an unused dependency parameter.
3. DGFY invitation, inventory payload filtering, health SHA fallback, and cashier email-status code are lint-cleaned without changing public API behavior.

## Compliance Preconditions

1. POS checkout stock effects, recipe movement planning, pricing, payment capture, and receipt issuance remain unchanged.
2. Retired local cashier creation still returns the same `410` validation failure.
3. Cashier reset and provisioning email status values remain `skipped`, `missing_email`, `not_configured`, `sent`, or `failed` as before.
4. No database migration, public API field, fiscal document behavior, or compliance lifecycle policy is included.

## Verification Evidence

1. `npm --prefix backend run lint`
2. `git diff --check`
