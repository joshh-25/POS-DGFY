---
status: reference
owner: engineering
last_reviewed: 2026-04-07
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-07-compliance-hardening-plan-v2-closure
classification: regulatory
surfaces: compliance,settings,payments,pos
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,COMPLIANCE_PROFILE_INCOMPLETE,BSP_PAYMENT_CONTROL_REQUIRED,ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm -C backend test,npm -C frontend run lint,npm -C frontend test,npm -C frontend run build:all,npm run check:frontend-budgets,npm run doctor:runtime,npm -C backend run audit:indexes:local,npm -C backend run audit:indexes
rollback_note: Revert compliance hardening guardrail/audit/index-filter changes as one unit and rerun release evidence checks before reattempt.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-07T23:10:00+08:00
preflight_request_ref: PLANV2-PR-2026-04-07
---

# 2026-04-07 Compliance Hardening Plan v2 Closure

## Compliance Impact Classification
Regulatory

Computed classification rationale:
1. `frontend/src/features/compliance/**` and backend compliance surfaces are in the regulatory floor matrix.
2. Guardrail semantics and audit durability contracts were tightened without API break.

## Affected Surfaces
- Compliance declaration guardrail (`scripts/check-compliance-impact.js`, `.husky/pre-commit`).
- Preflight transport and behavior assurance (`/api/v1/compliance/preflight` backend transport + policy/use-case tests).
- Audit durability fallback persistence and observability.
- Local/test index audit stabilization and stale test-tenant cleanup workflow.

## Compliance Preconditions
1. No breaking change to `/api/v1/compliance/preflight` route shape.
2. Dual-mode lifecycle and reason-code taxonomy remain unchanged.
3. Audit fallback persistence remains non-blocking for operation decisions.
4. Test-tenant exclusions apply only when explicitly enabled in local/test audit mode.

## Verification Evidence
1. `npm run lint:docs`
   - Result: PASS (`[docs-lint] OK. Validated 14 governed docs.`)
2. `npm run check:architecture`
   - Result: PASS (`ArchitectureGuardrails OK`, `ControllerBoundary OK`)
3. `npm run check:compliance`
   - Result: PASS (`No compliance-sensitive changes detected`)
4. `npm -C backend test`
   - Result: PASS (156 passed of 158 total suites, 664 passed tests, 3 skipped)
5. `npm -C frontend run lint`
   - Result: PASS
6. `npm -C frontend test`
   - Result: PASS (18 files, 65 tests)
7. `npm -C frontend run build:all`
   - Result: PASS (skupervisor, pos, store bundles built)
8. `npm run check:frontend-budgets`
   - Result: PASS (route chunk budgets within thresholds)
9. `npm run doctor:runtime`
   - Result: PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
10. `npm -C backend run audit:indexes:local`
    - Result: PASS (`mode=dry_run` cleanup + `status=healthy`, `mode=local`, `tenants_checked=1`, `missing=0`)
11. `npm -C backend run audit:indexes`
    - Result: PASS (`status=healthy`, `mode=standard`, `tenants_checked=1`, `missing=0`)

Rollback path validated as code-level revert + migration rollback for fallback table when policy allows.
