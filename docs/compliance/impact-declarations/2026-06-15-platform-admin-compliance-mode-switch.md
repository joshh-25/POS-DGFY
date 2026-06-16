---
status: reference
owner: engineering
last_reviewed: 2026-06-15
related_adr: 0007-dual-mode-pos-compliance-program.md,0011-compliance-downgrade-escape-hatches.md
declaration_id: 2026-06-15-platform-admin-compliance-mode-switch
classification: regulatory
surfaces: compliance,api,frontend,testing,docs,pos,terminal,settings
reason_codes_impacted: AUTHORIZATION_FAILED,MODE_TRANSITION_NOT_ALLOWED,ALLOWED,VALIDATION_FAILED
policy_version: 2026.06.15
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/complianceModeDowngrade.usecase.test.js tests/adminForceNonCompliant.handler.test.js tests/adminForceNonCompliant.transport.test.js tests/rbacRouteCoverage.contract.test.js,npm --prefix frontend exec vitest run src/pages/__tests__/TenantManager.forceNonCompliant.integration.test.jsx
rollback_note: Revert the admin compliance lifecycle routes, usecase audit metadata changes, Tenant Manager modal, and docs declaration together; keep ADR 0007/0011 lifecycle constraints unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-15T00:00:00+08:00
preflight_request_ref: PLATFORM-ADMIN-COMPLIANCE-MODE-SWITCH-2026-06-15
snapshot_commit: pending-local
---

# 2026-06-15 Platform Admin Compliance Mode Switch

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Platform Admin tenant compliance lifecycle controls.
- Admin API endpoints for selecting legacy tenant mode and moving non-compliant tenants into `compliant_pending`.
- Tenant Manager confirmation modal for compliance lifecycle actions.
- RBAC sensitive-action evidence for platform-admin lifecycle actions.

## Compliance Preconditions
1. Platform Admin can move a tenant into `compliant_pending`, but cannot force `compliant_active`.
2. Fiscal issuance remains gated by the existing compliant activation checklist.
3. Governed downgrade from compliant states still uses ADR 0011 force/revert paths.
4. Platform-admin lifecycle mutations require a reason and fail closed if primary compliance audit persistence is unavailable.
5. Non-compliant POS output remains explicitly non-fiscal.

## Verification Evidence
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/complianceModeDowngrade.usecase.test.js tests/adminForceNonCompliant.handler.test.js tests/adminForceNonCompliant.transport.test.js tests/rbacRouteCoverage.contract.test.js`
- `npm --prefix frontend exec vitest run src/pages/__tests__/TenantManager.forceNonCompliant.integration.test.jsx`
