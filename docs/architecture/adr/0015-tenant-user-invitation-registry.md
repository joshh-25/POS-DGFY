---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-04-30
applies_to: tenant_user_invitations
topic: tenant_user_invitation_registry
---

# ADR 0015: Tenant User Invitation Registry

## Status
Accepted (2026-04-30)

## Context
Tenant user invitations were stored only in the tenant-local `users` table. This forced invite acceptance links to carry the tenant company token so public auth routes could bind the correct tenant database before validating the invitation.

That link shape is operationally fragile and exposes tenant routing credentials in URLs.

## Decision
Add a landlord-level `user_invitations` registry for tenant user invitations.

1. Invitation acceptance resolves tenant context from a hashed invite token in the landlord registry.
2. New invite links use only `token`.
3. Existing tenant-local pending invite links that include `company` remain valid until expiry.
4. Tenant-local `users` remains the authoritative user account record.
5. The registry stores routing, lifecycle, and delivery metadata only.
6. Controllers remain transport-only; invitation logic stays in use-cases/services/repositories.

## Consequences
1. Invite URLs no longer need to expose company tokens.
2. Pending invitation UX can show reliable delivery and lifecycle state.
3. Invite acceptance becomes a cross-boundary auth flow and must preserve tenant isolation checks.
4. Registry rows must be updated when invites are resent, cancelled, expired, or accepted.

## Rollback Notes
1. Existing `?company=` links continue to work through the tenant-local compatibility path.
2. If the registry is unavailable, new token-only links cannot be accepted, but tenant-local invite records are not destructive.
