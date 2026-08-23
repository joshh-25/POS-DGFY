---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-pos-refund-and-audit-rebuild
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: POS_REFUND_AUDIT_AND_REVERSAL
policy_version: 2026.08.22
verification_evidence: pos-refund-contract-tests,split-reversal-tests,pos-terminal-contract-tests,pos-checkout-contract-tests,backend-syntax-checks
rollback_note: Revert the refund/audit implementation and retain additive adjustment tables until no dependent records remain.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T00:00:00+08:00
preflight_request_ref: #843
---

# POS Refund and Audit Rebuild

## Compliance Impact Classification

Major because this change affects POS void/refund authorization, payment reversal state, and
audit persistence. It does not authorize a production deployment.

## Affected Surfaces

- POS cash, merchant-owned, provider, and split-payment reversal workflows.
- POS transaction adjustment and audit records.
- Tenant schema synchronization for the additive adjustment tables.

## Compliance Preconditions

- Administrator bypasses remain audited and payment-provider boundaries remain unchanged.
- No production credentials or production database access are used by local validation.
- Additive migrations are reviewed and must pass fresh-tenant and upgrade tests.

## Verification Evidence

- Refund, provider-refund, and split-allocation reversal contract tests pass.
- Changed backend files pass syntax validation and architecture/controller-boundary checks.
