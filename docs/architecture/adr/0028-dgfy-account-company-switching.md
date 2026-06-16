---
status: authoritative
authority_level: authoritative
last_reviewed: 2026-06-16
---

# ADR 0028: DGFY Account Company Switching

## Context

A single landlord-scoped DGFY account can register or be invited into multiple tenant companies. Company navigation must be convenient without weakening tenant isolation or exposing tenant company tokens in public/account-picker payloads.

## Decision

DGFY company switching is authorized only through explicit `DgfyAccountTenantMembership` rows. Email or mobile-number matches are not sufficient to switch companies. Accepted active memberships are switchable; pending IMS invitations are visible to the matching DGFY account but must be accepted before switching.

Business-sensitive DGFY actions use email-OTP step-up with purpose `dgfy_business_step_up`. A successful business action records a short recent-step-up timestamp on the DGFY account so follow-up business actions can proceed without another code until the window expires. SMS/mobile 2FA and authenticator-app MFA are out of scope for this version.

The switcher list endpoint and invitation-acceptance response must not expose `company_token`. The switch mutation may return the normal IMS tenant-session payload after successful email step-up because the browser still needs the existing tenant session contract. Refresh authority remains HttpOnly cookie based under ADR 0026.

IMS may load the same company-switching contract from a normal tenant session only when the current tenant user resolves through an accepted `DgfyAccountTenantMembership` row for the current tenant and tenant-local user id. This tenant-session bridge is an authorization bridge, not an identity-inference rule: the backend must not resolve the DGFY account from email or mobile matches alone. If no accepted membership link exists, the switcher must fail closed and direct the user to sign in with DGFY or accept an invitation first.

## Consequences

- IMS Settings > Manage Users remains the source for adding invited company users.
- DGFY users can see accepted companies and pending invitations in the DGFY account Business area, and Storefront must switch/open the selected company rather than route through a generic handoff.
- Successful switching clears tenant-scoped frontend caches and lands on the IMS Dashboard.
- POS does not expose full company switching in v1.
- Switch success/failure and invitation accept success/failure are landlord-audited without secrets.
- IMS users who entered SKUpervisor through ordinary tenant auth can still see switcher choices when their tenant-local user is explicitly linked to a DGFY account membership. Legacy tenant users without a membership link will see a closed-state message until a DGFY account invitation/founder membership is created and accepted.

## Validation

Release validation must include DGFY account company-list tests, invitation acceptance tests, switch authorization tests, the IMS tenant-session membership bridge test, browser storage guards, and frontend IMS/Storefront account rendering tests.
