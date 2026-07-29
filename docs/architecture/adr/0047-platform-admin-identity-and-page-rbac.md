---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-28
last_reviewed: 2026-07-28
review_by: 2027-01-28
topic: platform_admin_identity_rbac
---

# ADR 0047: Platform Admin Identity and Page RBAC

## Context

The historical admin JWT represented a shared master credential and carried no revocable session or page-level authority. Platform operations now include scoped tenant, account, payment, feedback, hosting, pricing, and QA invoice pages.

## Decision

- Store Platform Admin users, grants, sessions, and audit records in the landlord database.
- Bootstrap one immutable Platform Master Admin from the existing environment credential. The master is the only actor that can create, suspend, reactivate, reset, or change page grants for delegated admins.
- Store bearer tokens in an HttpOnly cookie. Each request resolves the live session, account status, auth version, and database grants; a JWT grant is never authoritative.
- Use explicit page permissions. The backend enforces the route matrix before every protected endpoint; hiding a menu item is only a usability control.
- Issue delegated accounts the documented temporary default when none is supplied and visibly mark that account as temporary-password active. Explicit delegated and changed passwords require at least eight characters. Password changes, grant changes, suspension, and deletion revoke active sessions.
- Keep old shared-admin JWTs invalid once database-backed Platform Admin sessions are enabled.

## Consequences

- Every new protected Platform Admin route must be added to the permission matrix and middleware classification before release.
- Audit records must exclude password hashes, raw passwords, tokens, cookies, and IP/user-agent raw values.
- Platform Master credentials remain an environment/secret-store operational control, not a UI-editable account.

## Validation

- Prove login, session rehydration, logout/revocation, disabled-user rejection, password reset/change invalidation, and stale JWT rejection.
- Prove each delegated grant can access only its mapped API/page and direct requests are rejected without it.
- Prove Platform Master-only user management rejects delegated admins.
