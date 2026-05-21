---
status: reference
owner: engineering
last_reviewed: 2026-04-26
declaration_id: 2026-04-26-tenant-onboarding-first-login-remediation
classification: regulatory
surfaces: settings,pos,store,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run check:architecture,npm --prefix backend test -- --runInBand,npm --prefix frontend test
rollback_note: Revert onboarding routes/services/contracts together with frontend onboarding modal/reminder integration and onboarding telemetry limiter to preserve auth bootstrap and UI behavior contract consistency.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-26T12:05:00+08:00
preflight_request_ref: TENANT-ONBOARDING-FIRST-LOGIN-2026-04-26
---

# 2026-04-26 Tenant First-Login Onboarding Remediation

## Compliance Impact Classification
Regulatory

Computed classification rationale:
1. Changes touch onboarding-related settings persistence, auth bootstrap metadata, POS/admin reminder surfaces, and regulated route guardrails.
2. No fiscal receipt issuance contract or tax computation path is changed.

## Affected Surfaces
- Tenant onboarding lifecycle: first-login wizard, soft reminders, completion state contract.
- POS and IMS shell reminder UX while onboarding is incomplete.
- Storefront readiness synchronization and profile/discovery visibility alignment.

## Compliance Preconditions
1. Manual approval path remains unchanged and is still required before onboarding access.
2. Onboarding mutation and telemetry endpoints remain master-admin scoped.
3. Route-level permission contracts and architecture guardrails stay green.

## Verification Evidence
1. `npm run check:architecture`
2. `npm --prefix backend test -- --runInBand`
3. `npm --prefix frontend test`
