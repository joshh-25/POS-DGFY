---
status: reference
owner: engineering
last_reviewed: 2026-04-08
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-08-compliance-redesign-slice-and-readiness-e2e
classification: regulatory
surfaces: compliance,pos,terminal,settings
reason_codes_impacted: COMPLIANCE_PROFILE_INCOMPLETE,COMPLIANCE_ARTIFACTS_INCOMPLETE,ACCREDITED_PERIPHERAL_REQUIRED,ALLOWED
policy_version: 2026.04.07
verification_evidence: npm -C backend run test:frontend-compliance-e2e:matrix,npm -C backend test -- tests/complianceActivation.transport.test.js tests/complianceActivation.usecase.test.js tests/complianceActivationReadiness.e2e.transport.test.js tests/complianceRepository.profileMerge.test.js tests/authenticateAdmin.middleware.test.js tests/adminLogoutUsecase.test.js,npm -C frontend test -- --run src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/pages/__tests__/TenantManager.complianceReviewContracts.test.js src/services/__tests__/adminService.logout.contract.test.js src/services/__tests__/complianceService.preflight.test.js,npm -C frontend run build,npm -C backend run check:compliance
rollback_note: Revert compliance UX slices and readiness transport test additions together, then rerun backend/frontend validation suites before redeploy.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-08T12:45:00+08:00
preflight_request_ref: COMPLIANCE-SLICE-PR-2026-04-08
---

# 2026-04-08 Compliance Redesign Slice and Readiness E2E

## Compliance Impact Classification
Regulatory

Computed classification rationale:
1. Changes refine UX guidance, status normalization, and test coverage without altering lifecycle semantics.
2. API contracts and reason-code taxonomy remain backward compatible.

## Affected Surfaces
- Settings > Compliance guided messaging (`next_blocking_step`, unresolved requirement count).
- POS terminal compliance blocker messaging with missing requirement counts.
- Admin compliance review workspace status normalization and queue visibility.
- End-to-end compliance activation readiness transport test coverage.

## Compliance Preconditions
1. Lifecycle policy remains `non_compliant_active -> compliant_pending -> compliant_active`.
2. Activation still requires explicit `confirmation_text = ACTIVATE COMPLIANT`.
3. Checklist readiness remains mandatory before activation.
4. Existing compatibility fields (`missing_*`) remain available during migration.

## Verification Evidence
1. `npm -C backend run test:frontend-compliance-e2e:matrix`
   - Result: PASS (1 suite, 2 browser tests executed across desktop + mobile viewport profiles).
2. `npm -C backend test -- tests/complianceActivation.transport.test.js tests/complianceActivation.usecase.test.js tests/complianceActivationReadiness.e2e.transport.test.js tests/complianceRepository.profileMerge.test.js tests/authenticateAdmin.middleware.test.js tests/adminLogoutUsecase.test.js`
   - Result: PASS (6 suites, 15 tests).
3. `npm -C frontend test -- --run src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/pages/__tests__/TenantManager.complianceReviewContracts.test.js src/services/__tests__/adminService.logout.contract.test.js src/services/__tests__/complianceService.preflight.test.js`
   - Result: PASS (6 files, 22 tests).
4. `npm -C frontend run build`
   - Result: PASS (Vite production build successful).
5. `npm -C backend run check:compliance`
   - Result: PASS.

## Residual Risk Status
Primary residual risk addressed: contract-level coverage without browser-validated interaction assertions on compliance readiness and activation.

Hardening added:
1. `ComplianceProgramPanel.integration.test.jsx` now validates jsdom interaction behavior for:
   - checklist guidance rendering (`unresolved requirement` + `next blocking step`)
   - profile validation error surfacing + focus-to-first-error behavior
   - activation confirmation payload submission contract
2. `frontend.complianceActivationReadiness.e2e.test.js` now validates real-browser readiness flow with deterministic seed state and viewport matrix coverage:
   - blocked checklist payload is surfaced in authenticated browser session
   - activation confirmation path transitions to compliant active when checklist is ready
   - runs against desktop and mobile viewport profiles in one matrix pass
3. Existing API/use-case transport tests remain in place to validate lifecycle and server-side activation controls.

Remaining residual risk (explicit):
1. Browser E2E currently covers one browser engine (Chromium) and one tenant/auth flow; add cross-engine runs (`firefox`,`webkit`) and visual diff checks if this becomes a release gate.
