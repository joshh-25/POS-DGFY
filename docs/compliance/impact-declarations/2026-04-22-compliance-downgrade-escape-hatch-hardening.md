---
status: reference
owner: engineering
last_reviewed: 2026-04-22
related_adr: 0007-dual-mode-pos-compliance-program.md,0011-compliance-downgrade-escape-hatches.md
declaration_id: 2026-04-22-compliance-downgrade-escape-hatch-hardening
classification: regulatory
surfaces: compliance,api,database,frontend,testing,docs,pos,terminal,settings
reason_codes_impacted: MODE_TRANSITION_NOT_ALLOWED,AUTHORIZATION_FAILED,ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.04.22
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm -C backend test -- --runTestsByPath tests/complianceModeDowngrade.transport.test.js tests/complianceModeDowngrade.usecase.test.js tests/complianceDowngradeHardening.migration.test.js tests/complianceDowngradeTrigger.db.integration.test.js,npm -C frontend test -- src/features/compliance/components/__tests__/ComplianceProgramPanel.test.jsx src/pages/__tests__/TenantManager.compliancePartialLoad.integration.test.jsx
rollback_note: Revert downgrade escape-hatch migrations and guarded route/usecase changes as a single unit, then re-run architecture, docs, and compliance gates.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-22T11:20:00+08:00
preflight_request_ref: COMPLIANCE-DOWNGRADE-HARDENING-2026-04-22
snapshot_commit: pending-local
---

# 2026-04-22 Compliance Downgrade Escape Hatch Hardening

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Compliance lifecycle policy docs and ADR alignment (`0007` + `0011`).
- Governed downgrade endpoints and actor authorization:
  - `POST /api/v1/admin/tenants/:id/force-non-compliant`
  - `POST /api/v1/compliance/mode/revert-to-non-compliant`
- Tenant landlord lifecycle state columns:
  - `compliance_mode_override_*`, `compliance_mode_revert_*`
  - `compliance_cycle_version`, `compliance_revert_last_cycle_version`
- DB trigger controls:
  - same-update governed marker mutation requirement
  - no mixed override+revert mutation in one downgrade update
  - one-per-cycle tenant revert invariant
- Audit taxonomy:
  - `mode_force_non_compliant`
  - `mode_revert_non_compliant`

## Compliance Preconditions
1. Generic compliant downgrade remains blocked; only governed override/revert paths are allowed.
2. Force/revert operations fail closed if primary audit log persistence does not succeed.
3. Tenant self-revert is limited to once per compliance cycle and resets only after a new compliant cycle starts.
4. Request-time preflight remains required for compliance-sensitive implementation work.

## Verification Evidence
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm -C backend test -- --runTestsByPath tests/complianceModeDowngrade.transport.test.js tests/complianceModeDowngrade.usecase.test.js tests/complianceDowngradeHardening.migration.test.js tests/complianceDowngradeTrigger.db.integration.test.js`
- `npm -C frontend test -- src/features/compliance/components/__tests__/ComplianceProgramPanel.test.jsx src/pages/__tests__/TenantManager.compliancePartialLoad.integration.test.jsx`
