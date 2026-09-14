---
status: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-assigned-delivery-job-status
classification: major
surfaces: pos,terminal,settings,rbac
reason_codes_impacted: NOT_PERMITTED,NO_LONGER_ASSIGNED,LOCATION_NOT_GRANTED
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/posDeliveryJobStatus.usecase.test.js,apps/dgfy-api/tests/staffAssignments.usecase.test.js,apps/dgfy-api/tests/rbacRouteCoverage.contract.test.js,node --check on changed JavaScript files
rollback_note: Revert the additive route authorization, assignment query, serializers, and documentation. No migration or schema change is included; broad open-shift POS behavior remains available throughout rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T00:00:00+08:00
preflight_request_ref: PREFLIGHT-1549-2026-09-14
---

# Assigned delivery-job lifecycle authorization (#1549)

This major POS/RBAC change adds a narrow no-shift path for `delivery_runs:act` staff to advance only
their currently assigned manual delivery job. Assignment and location are revalidated in the locked
transaction, audit actor/timestamp evidence is retained with explicit null shift attribution, and
tenant/payment/fiscal boundaries are unchanged. The broad `pos:transact` open-shift path remains the
default for terminal operators. No migration, checkout, cash-drawer, assignment, queue, or
provider-owned mutation is included.

## Compliance Impact Classification

Major. The POS route and staff assignment surface change authorization behavior while preserving
tenant, location, payment, fiscal, and terminal boundaries.

## Affected Surfaces

1. Authenticated POS delivery-job status authorization and locked lifecycle mutation.
2. Staff assignment discovery and its public-safe delivery-job projection.
3. Audit records and governed POS/RBAC documentation.

## Compliance Preconditions

1. Narrow actors must hold `delivery_runs:act`, remain directly assigned or current run members, and
   hold a location grant; checks run inside the transaction.
2. Broad `pos:transact` actors retain the owned open-shift requirement. No checkout, payment, drawer,
   assignment, queue, provider, or schema behavior is broadened.
3. Narrow audits record actor, location, transition, timestamp, and explicit `shift_id: null`.

## Verification Evidence

Focused use-case, assignment projection, route-contract, syntax, architecture, compliance,
documentation, diff, and API patch-version checks are required before the PR is opened. Deployed
tenant isolation and native workspace QA remain post-merge verification.

Verification must cover direct and run-member assignment, run-less jobs, reassignment/deactivation,
tenant and location isolation, invalid/provider transitions, idempotent replay, audit persistence,
and the additive public-safe assignment projection. Rollback is code/documentation reversal only.
