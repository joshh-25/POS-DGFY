---
status: authoritative
authority_level: authoritative
last_reviewed: 2026-06-17
---

# ADR 0028: DGFY Account Company Switching

## Context

A single landlord-scoped DGFY account can register or be invited into multiple tenant companies. Company navigation must be convenient without weakening tenant isolation or exposing tenant company tokens in public/account-picker payloads.

## Decision

DGFY company switching is authorized only through explicit `DgfyAccountTenantMembership` rows. Email or mobile-number matches are not sufficient to switch companies. Accepted active memberships are switchable; pending IMS invitations are visible to the matching DGFY account but must be accepted before switching.

Legacy founder/master-admin companies are bootstrapped into this same explicit-membership contract. When a DGFY account has a verified email, the backend may mirror an accepted `source='founder'` membership only if the landlord email-to-tenant mapping exists, the tenant is active, the tenant-local user has the same normalized email, the tenant-local user is active and not deleted, and `is_master_admin=true`. This mirror runs at account registration/login/handoff/profile/company-list refresh time and creates the durable membership row before any switch is authorized. Staff/admin invitations that are not founder/master-admin ownership remain pending invitations and still require acceptance.

Business-sensitive DGFY actions use email-OTP step-up with purpose `dgfy_business_step_up`. A successful business action records a short recent-step-up timestamp on the DGFY account so follow-up business actions can proceed without another code until the window expires. SMS/mobile 2FA and authenticator-app MFA are out of scope for this version.

The switcher list endpoint and invitation-acceptance response must not expose `company_token`. The switch mutation may return the normal IMS tenant-session payload after successful email step-up because the browser still needs the existing tenant session contract. Refresh authority remains HttpOnly cookie based under ADR 0026.

IMS may load the same company-switching contract from a normal tenant session only when the current tenant user resolves through an accepted `DgfyAccountTenantMembership` row for the current tenant and tenant-local user id. This tenant-session bridge is an authorization bridge, not an identity-inference rule: the backend must not resolve the DGFY account from email or mobile matches alone. Mixed DGFY/IMS routes must distinguish token scope before authentication so a normal IMS tenant bearer token reaches tenant auth instead of being rejected as an invalid DGFY account token. If no accepted membership link exists, the switcher must fail closed and direct the user to sign in with DGFY or accept an invitation first. When an accepted membership exists, the IMS switcher must still render the current company even if it is the only available company; a missing DGFY account cookie may require re-authentication for cross-company actions, but it must not erase the active tenant from the current-company list.

## Consequences

- IMS Settings > Manage Users remains the source for adding invited company users.
- DGFY users can see accepted companies and pending invitations in the DGFY account Business area, and Storefront must switch/open the selected company rather than route through a generic handoff.
- Successful switching clears tenant-scoped frontend caches and lands on the IMS Dashboard.
- POS does not expose full company switching in v1.
- Switch success/failure and invitation accept success/failure are landlord-audited without secrets.
- IMS users who entered SKUpervisor through ordinary tenant auth can still see switcher choices when their tenant-local user is explicitly linked to a DGFY account membership. Legacy master-admin/founder tenant users can receive an accepted founder membership through the verified-email bootstrap; non-founder users without a membership link will see a closed-state message until a DGFY account invitation is accepted.

## Validation

Release validation must include DGFY account company-list tests, invitation acceptance tests, switch authorization tests, the IMS tenant-session membership bridge test, browser storage guards, and frontend IMS/Storefront account rendering tests.
