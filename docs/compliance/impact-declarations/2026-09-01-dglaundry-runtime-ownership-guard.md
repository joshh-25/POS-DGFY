---
status: reference
owner: engineering
last_reviewed: 2026-09-01
related_adr: 0078-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-09-01-dglaundry-runtime-ownership-guard
classification: regulatory
surfaces: compliance,settings,dgfy-laundry
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,LAUNDRY_WORKFLOW_MODE_RUNTIME_MISMATCH,ALLOWED
policy_version: 2026.09.01
verification_evidence: npm run check:architecture,npm run check:compliance,npm run check:adr -- --strict,npm test --prefix apps/dgfy-api -- --runTestsByPath tests/settingsUsecases.applicationResult.test.js tests/settingsCustomerAccessModeFulfillmentGuard.usecases.test.js tests/laundryWorkflowModeRuntimeGuard.usecases.test.js tests/dgfyLaundryProviderUseCases.test.js
rollback_note: Revert the laundry runtime ownership guard, settings wiring, intent route scoping, tests, and this declaration together; leave laundry workflow mode disabled until the qualified provider contract is restored.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T15:34:00+08:00
preflight_request_ref: DGLAUNDRY-PR1186-RF2-RF3-2026-09-01
---

# DGLaundry Runtime Ownership Guard

## Compliance Impact Classification

Regulatory. This change prevents a tenant settings write from selecting
laundry operations unless the immutable tenant classification and runtime
owner already identify DGLaundry.

## Affected Surfaces

- Tenant settings bulk and single-key write use cases.
- DGFY-to-DGLaundry provider intent read routes.
- Compliance-sensitive settings guardrails and their regression tests.

## Compliance Preconditions

1. `ops_workflow_mode=laundry` remains master-admin-only.
2. A tenant context is required for the laundry mode write.
3. The landlord tenant record must have `business_mode=laundry` and
   `runtime_owner=dglaundry`; otherwise the write fails before persistence.
4. Each intent read route returns only its own intent type and responds 404 for
   a mismatched type.
5. DGLaundry remains contract-connected only; no DGFY credentials, database,
   or runtime source is introduced.

## Verification Evidence

- Architecture guardrails and controller-boundary checks pass.
- Compliance declaration and API-contract checks pass.
- Strict ADR validation passes.
- Settings and DGLaundry provider regression suites pass (75 tests).
