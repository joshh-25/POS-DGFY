---
declaration_id: 2026-04-07-phase1-3-compliance-restart-baseline
classification: regulatory
surfaces: pos, terminal, settings, compliance
reason_codes_impacted: COMPLIANCE_RESTART_BASELINE
policy_version: 2026.04.07
verification_evidence: docs/testing/pos-readiness-status.md
rollback_note: Restore prior compliant release commit and rerun deploy gates.
preflight_result: no_breach
preflight_reason_code: NO_POLICY_BREACH
preflight_run_at: 2026-04-07T00:00:00Z
preflight_request_ref: PR-140
---

# Compliance Restart Baseline (Phase 1-3)

## Compliance Impact Classification
Regulatory.

## Affected Surfaces
- POS runtime and workflow mode controls
- Terminal operations and offline flow contracts
- Settings and compliance policy enforcement paths

## Compliance Preconditions
- Architecture and controller-boundary guardrails must pass.
- Compliance API contract checks must pass in CI and pre-commit.
- Production deploy must run with public endpoint verification enabled.

## Verification Evidence
- `npm run check:compliance`
- `npm run gate:release:prod-contracts`
- `logs/deploy/deploy_*.summary.txt`
