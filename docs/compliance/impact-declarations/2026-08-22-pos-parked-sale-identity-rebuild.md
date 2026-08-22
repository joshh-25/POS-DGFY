---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-pos-parked-sale-identity-rebuild
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_PARKED_SALE_IDENTITY
policy_version: 2026.08.22
verification_evidence: pos-parked-sale-contract-tests,frontend-build
rollback_note: Revert the parked-sale identity changes; no destructive migration is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T00:00:00+08:00
preflight_request_ref: #843
---

# POS Parked-Sale Identity Rebuild

This declaration covers the parked-sale resume change that preserves stable catalog identity
when a sale is parked and later resumed. It does not change payment-provider behavior, inventory
quantities, or production deployment configuration.

## Compliance Impact Classification

Major because the change affects POS terminal sale-resume behavior. No payment credentials,
fiscal rules, inventory quantities, or production configuration are changed.

## Affected Surfaces

- POS parked-sale snapshot and resume behavior.
- POS terminal cart identity handling.

## Compliance Preconditions

- No payment credentials or production database access are used by local validation.
- Existing server-side parked-sale validation remains authoritative.
- No migration is introduced by this change.

## Verification Evidence

- Parked-sale resume contract tests pass.
- POS production build passes.
