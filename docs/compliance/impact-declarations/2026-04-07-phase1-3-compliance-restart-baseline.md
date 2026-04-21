---
status: historical
owner: engineering
last_reviewed: 2026-04-22
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-07-phase1-3-compliance-restart-baseline
classification: regulatory
surfaces: compliance,settings,pos,terminal
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,COMPLIANCE_PROFILE_INCOMPLETE,ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm -C backend test -- --runTestsByPath tests/compliancePolicyEngine.test.js tests/complianceUsecases.authorization.test.js tests/compliancePreflightUsecase.test.js,npm -C frontend test -- src/features/pos/__tests__/terminalViewModeContracts.test.js src/services/__tests__/paymentService.disabled.test.js src/services/__tests__/complianceService.preflight.test.js
rollback_note: Revert Phase 1-3 compliance baseline changes as a single set and rerun full validation before reattempt.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-07T12:13:06+08:00
preflight_request_ref: PHASE1-3-BASELINE-2026-04-07
snapshot_commit: 2c3a8a23c713abef01055899a1d4e2c72f4aec93
superseded_by: 2026-04-22-compliance-downgrade-escape-hatch-hardening
---

# 2026-04-07 Phase 1-3 Compliance Restart Baseline

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Compliance governance docs and canonical source of truth under `docs/compliance`.
- Compliance policy version parity for runtime decision metadata (`2026.04.07`).
- Compliance preflight contract test coverage and declaration guardrail hardening.

## Compliance Preconditions
1. Historical note: this baseline predates ADR 0011 governed downgrade exceptions.
2. Request-time preflight remains hard-gated: only `result=no_breach` permits implementation.
3. Compliance-sensitive diffs still require declaration evidence before merge.

## Verification Evidence
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm -C backend test -- --runTestsByPath tests/compliancePolicyEngine.test.js tests/complianceUsecases.authorization.test.js tests/compliancePreflightUsecase.test.js`
- `npm -C frontend test -- src/features/pos/__tests__/terminalViewModeContracts.test.js src/services/__tests__/paymentService.disabled.test.js src/services/__tests__/complianceService.preflight.test.js`
- Snapshot commit: `2c3a8a23c713abef01055899a1d4e2c72f4aec93`
