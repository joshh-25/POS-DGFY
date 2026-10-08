---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-09-26
related_adr: docs/architecture/adr/0021-dgfy-global-account-identity.md
declaration_id: 2026-09-26-dgfy-business-registration-materialization
classification: regulatory
surfaces: api,database,storefront,onboarding,user_registration,settings,pos,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED,SERVICE_UNAVAILABLE
policy_version: 2026.09.26
verification_evidence: Materialization approval/idempotency/retry tests 4/4, migration tests 2/2, prior draft contract/migration tests 8/8, targeted API ESLint, architecture guardrails, docs/ADR lint, compliance check
rollback_note: Revert the materialization use case, approval/retry routes, draft state migration/model fields, landlord projection changes, landlord-only model-factory guard, tests, and this declaration together; the existing tenant-backed approval flow and the pre-materialization draft contract remain available.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-26T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-DGFY-REGISTRATION-MATERIALIZATION-LOCAL-ONLY
---

# 2026-09-26 DGFY business registration approval-time materialization

## Compliance Impact Classification

Major. This change adds the authorized approval boundary that creates a
tenant, preserves legal acknowledgement evidence, provisions an isolated
tenant database, and copies approved Storefront data into tenant settings,
locations, and tenant-scoped asset storage. It does not publish extracted menu
items or alter existing transactions.

## Affected Surfaces

- Landlord registration drafts, applications, legal acknowledgements, and
  materialization state.
- Admin authorization for approval and materialization retry.
- Tenant provisioning, Storefront settings, primary location, discovery index,
  and Storefront asset storage.
- Private menu-upload retention for later authorized review/download.

## Compliance Preconditions

1. Approval and retry routes require platform-admin authentication; the use
   case also rejects missing administrator actor context.
2. The draft remains landlord-side and private until approval. A tenant is
   created only inside the approval transaction, and tenant Storefront writes
   happen only after provisioning succeeds.
3. Legal terms, acknowledgement text/hash, account, timestamp, request, IP,
   and user-agent evidence are validated and persisted before provisioning.
4. Original staged files are preserved. Image copies use the existing scoped
   Storefront asset storage policy; menu files remain private and are not
   parsed or published.
5. Materialization state is durable and retryable. Existing locations,
   settings, and available asset mappings are reused to avoid duplicate
   Storefront data.

## Verification Evidence

- Materialization approval/idempotency/retry and Storefront settings/location
  tests: 4/4.
- Additive materialization migration tests: 2/2.
- Prior draft contract and migration suites: 8/8.
- Targeted API ESLint passed. The declaration's local compliance fields use the
  repository's `NOT-EXECUTED-*` handoff convention; live compliance preflight,
  migration rehearsal, authenticated browser acceptance, and deployed review
  remain required before release promotion.
