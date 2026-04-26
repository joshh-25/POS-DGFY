# ADR 0013: Tenant First-Login Onboarding and Storefront Readiness Contract

## Status
Accepted (2026-04-25)

## Context
The product direction requires three connected surfaces:
1. DGFY storefront
2. DGFY POS
3. SKUpervisor IMS

Tenant registration remains manual-approval first. After approval, tenant master admin needs a deterministic first-login setup flow that captures operational readiness and storefront assets without introducing AI generation.

Before this ADR:
1. Registration + approval lifecycle exists.
2. Storefront template stack and branding asset endpoints exist.
3. No dedicated tenant onboarding state machine or first-login onboarding API contract exists.

## Decision
Adopt a tenant-scoped onboarding lifecycle with soft-reminder UX:

1. State contract
- `tenant_onboarding_state`: `not_started | in_progress | completed`
- `tenant_onboarding_started_at` and `tenant_onboarding_completed_at` timestamps
- `tenant_onboarding_progress` JSON snapshot with required checklist progress

2. Initialization
- On tenant provisioning (after approval), initialize onboarding state to `not_started`.

3. Ownership and access
- Onboarding status and mutations are tenant-master-admin only.
- Routes:
  - `GET /api/v1/onboarding/status`
  - `PUT /api/v1/onboarding/step`
  - `POST /api/v1/onboarding/complete`

4. Required completion checklist (v1)
- Store name ready (registration baseline)
- At least one active tenant location
- At least one active primary storefront location
- At least one sellable POS-visible item

5. Surface behavior
- Soft reminder only while onboarding incomplete (no hard block for POS/IMS access).
- Completion is one-time; onboarding does not auto-reopen after completion.

6. Storefront readiness integration
- Completing onboarding triggers storefront discovery sync reliability runner.
- Existing discovery/profile/checkout contracts remain backward compatible.

7. Generation policy
- Storefront remains template-based for this scope; no AI-generated storefront configuration in onboarding completion path.

## Consequences
1. Tenant first-login setup is now explicit, measurable, and API-driven.
2. Master admin receives guided setup while preserving operational access.
3. Readiness checks become deterministic and portable across surfaces.
4. Additional maintenance burden exists for onboarding state and checklist evolution.
5. Telemetry-only UX events are decoupled from onboarding checklist persistence to avoid progress-state write noise.

## Acceptance Criteria
1. Approved tenant has onboarding state initialized to `not_started`.
2. Master admin can read/save/complete onboarding through dedicated endpoints.
3. Completion fails with deterministic missing-requirements payload when checklist is incomplete.
4. Completion sets `completed` and timestamps and triggers storefront sync.
5. Login and current-user bootstrap payloads expose onboarding metadata.
6. POS and IMS surfaces show persistent onboarding reminder until completion.

## Rollback Notes
1. Runtime rollback can hide onboarding UI and stop calling onboarding routes.
2. Existing tenant operations continue because onboarding is reminder-only.
3. Stored onboarding settings are non-destructive and can be ignored safely.

## Addendum (2026-04-25): Ownership and Telemetry Separation Hardening
1. Session/bootstrap onboarding metadata is master-admin scoped; non-master users do not own onboarding state lifecycle.
2. Reminder/wizard telemetry events are tracked via dedicated onboarding event endpoint and do not mutate onboarding step payload storage.
3. Onboarding settings writes are transaction-wrapped and payload-size constrained to reduce partial-write and storage-abuse risk.
