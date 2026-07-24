# DGFY Access-Control Planning Rule Proposal

## Metadata

- title: DGFY access-control planning rule proposal
- status: draft
- owner: Collaborators
- created: 2026-07-16
- last updated: 2026-07-21
- related code areas: `backend/src/middleware/`, `backend/src/modules/auth/`,
  `backend/src/modules/adminAuth/`, `backend/src/modules/users/`,
  `backend/src/modules/tenants/`, `apps/dgfy-api/src/`, `frontend/`
- related docs or dependencies: `docs/START_HERE.md`,
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`,
  `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md`,
  `docs/architecture/adr/0028-dgfy-account-company-switching.md`,
  `docs/api/specification.md`, `docs/features/TENANT_MANAGEMENT.md`

## Status and Purpose

This is a proposal-level planning checklist, not a new security contract. Every
plan that changes authentication, authorization, a protected API route, tenant
data access, account lifecycle, or permission-sensitive UI must identify how
existing server-side controls and tenant isolation remain enforced.

The authoritative architecture and domain documents control whenever this
checklist differs from them.

## Required Planning Checks

### Route, Authentication, and Middleware Boundary

Identify the actual route and middleware chain from the affected backend or
standalone application. State which controls apply, such as authentication,
tenant context, role or permission enforcement, CSRF protection, capability or
workflow-mode gates, rate limiting, and integration-specific trust checks.

Do not infer authorization from frontend visibility or from a nearby protected
route. Controllers and handlers remain transport-only and must delegate through
the governed use-case and repository boundaries.

### Tenant and Resource Scope

For tenant-bound operations, state:

- how tenant identity is resolved and validated
- how the principal's membership, role, and location scope are verified
- how repository queries constrain resources to the authorized tenant
- how landlord-scoped DGFY identity differs from tenant-local compatibility data
- whether platform-admin or other exception paths are explicit and audited

Reject cross-tenant access server-side. Never rely on an empty UI, a client
supplied tenant identifier, or frontend route gating as the isolation boundary.

### Roles, Permissions, and Capabilities

Specify the exact role, permission, capability, or workflow-mode requirement
and its backend enforcement point. If a plan changes role presets or permission
semantics, evaluate ADR 0020 and update the governed feature/API documentation.

Temporary authorization exceptions require the approval and removal plan
defined by architecture governance. Do not introduce undocumented allowlists.

### Input, Ownership, and Business Rules

Distinguish:

- authentication of the principal
- authorization for the requested action
- tenant and resource ownership
- input validation and normalization
- business-rule validation in the use case
- persistence constraints in the repository or model layer

Valid input never proves that the caller may act on the target resource.

### Public, Internal, and Cross-Origin Boundaries

For public callbacks or webhooks, define signature verification, replay and
idempotency behavior, payload validation, safe logging, and acknowledgement.
For internal or device-facing endpoints, preserve their specific authentication
and scope contracts. For cookie-backed or cross-origin browser flows, identify
CSRF, CORS, cookie, token handoff, logout, and replay implications.

### Frontend Boundary

Frontend permission and capability gates support user experience but never
replace backend enforcement. Plans must cover disabled and error states without
leaking sensitive resource existence or enabling accidental adjacent submits.

## Required Security Tests

Cover the applicable cases with targeted evidence:

- unauthenticated principal is rejected
- authenticated principal without the required permission is rejected
- authorized principal succeeds
- an authorized principal cannot access another tenant's or disallowed
  location's resource
- disabled capability or incompatible workflow mode is rejected
- missing, invalid, expired, or replayed credentials or handoff artifacts fail
- platform-admin and compatibility exceptions behave exactly as governed
- public callbacks reject invalid signatures and replay when applicable
- persistence proves the authorization-sensitive side effect is durable
- frontend tests prove gated/disabled states and at least one negative adjacent
  action does not submit accidentally

Use the error and status behavior established by the existing API contract.
Avoid information-revealing distinctions unless the governed contract requires
them.

## Handoff Evidence

An implemented plan must name the security tests and validation commands
actually executed, their observed results, deferred checks, and residual risks.
A green general suite does not replace targeted negative authorization tests.
