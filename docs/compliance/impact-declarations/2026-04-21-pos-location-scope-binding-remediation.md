---
status: reference
owner: engineering
last_reviewed: 2026-04-21
declaration_id: 2026-04-21-pos-location-scope-binding-remediation
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run check:architecture,npm run lint:docs,npm run test:backend,npm run test:frontend,npm run build
rollback_note: Revert POS operational location-scope fallback and strict-binding guard updates together with related POS integration test alignment.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-21T16:45:00+08:00
preflight_request_ref: POS-LOCATION-BINDING-REMEDIATION-2026-04-21
---

# 2026-04-21 POS Location Scope Binding Remediation

## Compliance Impact Classification
Major

Computed classification rationale:
1. Change set modifies POS/terminal operational scope resolution behavior in backend POS use-cases.
2. Frontend POS location-scope contract tests were added/updated for strict binding behavior.
3. No compliance lifecycle policy transitions or fiscal document issuance policy rules were changed.

## Affected Surfaces
- Backend POS checkout/open-shift location scope resolution and binding enforcement handling.
- POS terminal location scope frontend contract/integration test coverage.

## Compliance Preconditions
1. `compliant_active` / `compliant_pending` / `non_compliant_active` policy decisions remain unchanged.
2. Terminal home-location enforcement remains required when `pos_terminal_location_binding_enforced=true`.
3. Fallback to unresolved (`null`) scope is only accepted where strict binding is not enforced and no explicit context can be resolved.

## Verification Evidence
1. `npm run check:architecture`
2. `npm run lint:docs`
3. `npm run test:backend`
4. `npm run test:frontend`
5. `npm run build`
