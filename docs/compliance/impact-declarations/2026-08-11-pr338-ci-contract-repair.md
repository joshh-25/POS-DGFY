---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-pr338-ci-contract-repair
classification: major
surfaces: storefront,payments,security
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: frontend lint,Storefront production build,customer dashboard tests,PayMongo revenue security contract,tenant credential security contract
rollback_note: Revert the CI repair commit; no schema, payment processing, or stored financial records are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: PR338-CI-REPAIR-PHASE43-20260811
---

# PR 338 CI Contract Repair

## Compliance Impact Classification

Major because the repaired contracts verify PayMongo signature ordering and
tenant credential removal, although the implementation changes are limited to
test paths, Storefront modal lifecycle, and build configuration.

## Affected Surfaces

1. Storefront DGFY Business POS launch and Day Close PIN modal lifecycle.
2. Optional Storefront bundle-analysis configuration.
3. PayMongo revenue security and tenant credential-removal contracts.

## Compliance Preconditions

1. PayMongo signature verification must remain before verified paid-session
   processing and tenant revenue posting.
2. Plaintext tenant database credential columns remain absent from the model
   and are removed only by the centralized migration runner.
3. The optional bundle visualizer must not be required for normal builds.

## Verification Evidence

1. Frontend lint completed with zero errors.
2. Storefront production build passed without the optional visualizer package.
3. DGFY customer dashboard tests passed: 11/11.
4. Affected backend security contracts passed: 27/27 across focused runs.
