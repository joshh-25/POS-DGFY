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

## Consequences

- IMS Settings > Manage Users remains the source for adding invited company users.
- DGFY users can see accepted companies and pending invitations in the DGFY account Business area, and Storefront must switch/open the selected company rather than route through a generic handoff.
- Successful switching clears tenant-scoped frontend caches and lands on the IMS Dashboard.
- POS does not expose full company switching in v1.
- Switch success/failure and invitation accept success/failure are landlord-audited without secrets.

## Validation

Release validation must include DGFY account company-list tests, invitation acceptance tests, switch authorization tests, browser storage guards, and frontend IMS/Storefront account rendering tests.
