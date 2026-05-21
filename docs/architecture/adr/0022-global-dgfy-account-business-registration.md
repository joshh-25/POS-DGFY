---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-21
applies_to: dgfy_accounts, tenant_registration, storefront_account, tenant_user_invitations
topic: global_dgfy_account_business_registration
---

# ADR 0022: Global DGFY Account For Business Registration

## Context

DGFY customer accounts and SKUpervisor tenant staff accounts were historically separate. Public storefront customer auth was tenant-scoped, while SKUpervisor staff auth required tenant context. The new business-registration flow requires one DGFY account to support customer profile/order surfaces and also register a company.

## Decision

Introduce a landlord-scoped DGFY account identity.

1. A DGFY account exists before tenant selection and stores first name, last name, username, email, phone, password hash, and account status.
2. Public company registration requires an authenticated DGFY account.
3. Founder email, phone, username seed, and password hash are derived server-side from the DGFY account. Registration clients must not provide or override founder contact, password, plan, or compliance mode.
4. Every new company starts in `non_compliant_active`. Compliance activation remains a SKUpervisor Settings > Compliance lifecycle.
5. Registration requires the DGFY account email to be verified with `dgfy_account_verification`, then still requires a fresh purpose-scoped `company_registration` email OTP for the DGFY account email before tenant creation.
6. The tenant workflow selector remains required, but public-facing copy calls it Business Industry.
7. A landlord membership registry links DGFY accounts to tenant users. Founder membership is accepted immediately after tenant provisioning.
8. Existing tenant-local storefront customer auth and tenant staff auth remain valid compatibility surfaces while the shared DGFY identity is rolled across storefront Account, Orders, Track, and invitation notifications.
9. Storefront account endpoints may accept a DGFY JWT, but they must lazily link/create a tenant-local `store_customers` row before using existing order/profile behavior. Storefront token resolution must prefer existing tenant-local store tokens over a global DGFY token so legacy customer sessions are not displaced.
10. Company invitations to existing DGFY emails create pending DGFY memberships and can be accepted through `POST /api/v1/dgfy/invitations/:membership_id/accept`; the accept step activates the tenant-local staff row instead of reusing `store_customers`. Pending landlord invitations are backfilled into DGFY memberships when a matching DGFY account is later created or loaded.
11. DGFY accounts support email verification with a dedicated `dgfy_account_verification` OTP purpose and nullable `email_verified_at`/`phone_verified_at` audit fields.
12. DGFY browser handoff uses a short-lived `dgfy_handoff` JWT exchanged back into a normal DGFY account JWT; tenant-local SKUpervisor sessions remain separate.

## Consequences

1. Company registration is now a cross-boundary flow covering DGFY identity, tenant provisioning, tenant staff bootstrap, and storefront entry points.
2. ADR 0006 remains valid: tenant-local store customer records must not be treated as the global account. They become linkable customer records under the global DGFY identity.
3. ADR 0007 is amended for public registration: tenant mode is no longer selected at registration; new tenants start non-compliant.
4. ADR 0013 is amended: first-login handoff can originate from DGFY account membership instead of direct founder password collection.
5. ADR 0015 remains the invitation baseline, but DGFY account invitations can be accepted from account notifications without exposing company tokens.

## Validation

Implementations must prove:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. DGFY auth tests for register/login/me/email verification/handoff.
4. Company registration tests proving DGFY account requirement, verified-account gate, OTP consumption, non-compliant default, and no client override of founder or compliance fields.
5. Frontend tests proving DGFY-gated registration, verified-account gating, Business Industry labeling, and password visibility controls.
