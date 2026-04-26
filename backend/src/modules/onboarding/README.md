# Onboarding Module

Tenant master-admin onboarding lifecycle module.

## Responsibilities
- Resolve tenant onboarding status snapshot
- Persist onboarding step progress (idempotent)
- Complete onboarding with readiness validation
- Trigger storefront sync on completion

## Contracts
- Repository contract: `getStatus`, `saveStep`, `complete`
- State values: `not_started | in_progress | completed`
