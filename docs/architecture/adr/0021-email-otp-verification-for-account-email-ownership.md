---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-17
applies_to: auth, tenant_registration, tenant_user_invitations, profile_email_change
topic: email_otp_verification
---

# ADR 0021: Email OTP Verification For Account Email Ownership

## Status
Accepted (2026-05-17)

## Context
Company registration, tenant user registration, invitation acceptance, and profile email changes all create or mutate login identity through an email address. The existing SMTP path sends lifecycle notifications, but it did not prove that the actor controls the target email before persisting tenant mappings or user identity changes.

## Decision
Add a landlord-level `email_otps` registry for purpose-scoped email verification codes.

1. OTP rows store purpose, normalized email, optional tenant ID, hashed code, expiry, attempts, delivery state, and consumed timestamp.
2. Codes are six digits, single-use, expire after `EMAIL_OTP_TTL_MINUTES` (default 10), and lock after `EMAIL_OTP_MAX_ATTEMPTS` (default 5).
   Successful verification consumes the row with a conditional update on the OTP ID and `consumed_at IS NULL` so a concurrent request cannot reuse the same code after another request has consumed it.
3. Public OTP request supports:
   - `company_registration`
   - `tenant_user_registration`
   - `invitation_acceptance`
4. Authenticated OTP request supports:
   - `email_change`
5. The final mutation must consume a matching OTP before:
   - public company registration creates a tenant request,
   - tenant user registration creates an account,
   - invitation acceptance activates an invited account,
   - authenticated profile update changes email and landlord email-to-tenant mapping.
6. Configured email delivery failure is fail-closed for OTP requests. Delivery may use SMTP or the Brevo HTTPS API fallback, but account email ownership checks cannot be bypassed by manual links.
7. OTP request routes use `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS` with purpose, tenant, request IP, and email/invitation-token identity in the key.
8. Invitation-acceptance OTP requests resolve tenant context from `invitation_token` when no `x-company-token` is present, matching token-only invite validation and acceptance links.
9. Controllers remain transport-only. OTP creation/verification lives in service/use-case boundaries and the registry is landlord-scoped so tenant-local schemas are not required before company registration.

## Consequences
1. Email ownership is proved before new login identities and email-to-tenant mappings are written.
2. Company registration now depends on working email delivery for the first step, so production SMTP credentials or Brevo API credentials must be valid before the public registration journey is usable.
3. Invitation acceptance remains token-first, but the invited email must also receive and provide the OTP.
4. Email changes no longer update tenant lookup mappings unless the new email is verified.
5. OTP rows are auditable and disposable; expired/consumed rows can be cleaned by future maintenance without changing account state.

## Rollback Notes
1. Runtime rollback can set `EMAIL_OTP_ENFORCEMENT_ENABLED=false`; validators stop requiring `email_otp_code` and verification calls return a disabled-enforcement success result without querying OTP rows.
2. Existing tenant records, users, invitations, and email-to-tenant mappings remain valid.
3. The `email_otps` table is additive and can remain unused during rollback.
