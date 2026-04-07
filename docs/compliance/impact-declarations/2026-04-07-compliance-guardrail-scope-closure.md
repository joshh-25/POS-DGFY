---
status: reference
owner: engineering
last_reviewed: 2026-04-07
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-07-compliance-guardrail-scope-closure
classification: regulatory
surfaces: compliance,settings
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,COMPLIANCE_PROFILE_INCOMPLETE,ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run lint:docs,npm run check:architecture,npm -C backend test -- --runTestsByPath tests/checkComplianceImpactScript.integration.test.js tests/compliancePreflight.transport.test.js tests/complianceAuditFallback.usecase.test.js,npm -C frontend run lint,npm -C frontend test,npm -C backend run audit:indexes:local
rollback_note: Revert guardrail scope matrix, transport assertions, and local audit command split as one unit; then rerun architecture/compliance/docs checks before reattempt.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-07T22:50:00+08:00
preflight_request_ref: PLANV2-GUARDRAIL-2026-04-07
---

# 2026-04-07 Compliance Guardrail Scope Closure

## Compliance Impact Classification
Regulatory

Computed classification rationale:
1. Guardrail scope now explicitly covers compliance verification and lifecycle paths in admin/tenant modules.
2. Mixed admin paths that include compliance verification actions now enforce regulatory floor classification.

## Affected Surfaces
- Compliance declaration gate perimeter (`scripts/check-compliance-impact.js`, guardrail integration tests).
- Admin/tenant compliance verification and lifecycle path coverage.
- Request preflight transport contract assurance (validator-path 422 behavior).
- Local readiness audit safety workflow (safe default + explicit destructive variant).

## Compliance Preconditions
1. No breaking change to `/api/v1/compliance/preflight`.
2. No change to dual-mode lifecycle state machine semantics.
3. Runtime compliance decisions remain in existing policy engine and middleware boundaries.
4. Local cleanup remains available but requires explicit destructive command path.

## Verification Evidence
1. `npm run lint:docs`
   - Result: PASS (`[docs-lint] OK. Validated 14 governed docs.`)
2. `npm run check:architecture`
   - Result: PASS (`ArchitectureGuardrails OK`, `ControllerBoundary OK`)
3. `npm -C backend test -- --runTestsByPath tests/checkComplianceImpactScript.integration.test.js tests/compliancePreflight.transport.test.js tests/complianceAuditFallback.usecase.test.js`
   - Result: PASS (3 suites, 20 tests)
4. `npm -C frontend run lint`
   - Result: PASS
5. `npm -C frontend test`
   - Result: PASS (18 files, 65 tests)
6. `npm -C backend run audit:indexes:local`
   - Result: PASS (`mode=dry_run` cleanup + `status=healthy` local index audit)

