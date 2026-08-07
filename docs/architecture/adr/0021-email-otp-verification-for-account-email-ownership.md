---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-05-17
last_reviewed: 2026-08-07
review_by: 2026-11-17
applies_to: auth, tenant_registration, tenant_user_invitations, profile_email_change, dgfy_accounts
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
   - `dgfy_account_verification`
5. DGFY password recovery supports:
   - `dgfy_password_reset`
6. The final mutation must consume a matching OTP before:
   - DGFY account registration creates a global account and marks its email verified,
   - tenant user registration creates an account,
   - invitation acceptance activates an invited account,
   - authenticated profile update changes email and landlord email-to-tenant mapping.
   - an existing DGFY account is marked email-verified from the account surface.
   - a DGFY password reset changes the global DGFY account password.
7. Public DGFY account registration requests a global `dgfy_account_verification` OTP through the public email-OTP endpoint before account creation. This request must not require a company token and must ignore stale browser tenant context, because the registration mutation consumes only a global OTP (`tenant_id: null`), creates the account, and sets `email_verified_at` in the same successful account-creation flow.
8. Public company registration must use the authenticated DGFY account email. Because account registration already verifies that email, company registration must not require a second same-address `company_registration` OTP. If the DGFY email is changed, the DGFY account email verification state must be cleared and the new email must be verified before the changed email can be treated as verified identity elsewhere.
9. Configured email delivery failure is fail-closed for OTP requests. Delivery may use SMTP or the Brevo HTTPS API fallback, but account email ownership checks cannot be bypassed by manual links.
10. OTP request routes use `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS` with purpose, tenant, request IP, and email/invitation-token identity in the key.
11. Invitation-acceptance OTP requests resolve tenant context from `invitation_token` when no `x-company-token` is present, matching token-only invite validation and acceptance links. Other tenant-scoped OTP purposes remain tenant-bound and still require tenant context.
12. Controllers remain transport-only. OTP creation/verification lives in service/use-case boundaries and the registry is landlord-scoped so tenant-local schemas are not required before company registration.
13. Phone verification is out of scope for this ADR version. `phone_verified_at` on DGFY accounts is reserved for a future phone OTP flow and must stay nullable until that flow is implemented.
14. Guest Storefront orders require a tenant-bound `storefront_guest_checkout` email OTP when `STOREFRONT_GUEST_OTP_REQUIRED` is not explicitly disabled. Verification consumes the six-digit OTP and returns a short-lived signed proof bound to the normalized email, tenant, and checkout idempotency key. The checkout endpoint validates that proof for non-DGFY customers; DGFY-authenticated customers continue through the authenticated account path without a guest OTP.
15. The guest checkout proof may be replayed only with its bound idempotency key. Checkout idempotency returns the original order for a matching retry and rejects a changed payload, preventing the proof from creating multiple orders.

## Consequences
1. Email ownership is proved before new login identities and email-to-tenant mappings are written.
2. DGFY account registration depends on working email delivery. Once the authenticated DGFY account email is verified, registering a company with that same email does not send or consume a second same-address OTP.
3. Invitation acceptance remains token-first, but the invited email must also receive and provide the OTP.
4. Email changes no longer update tenant lookup mappings unless the new email is verified.
5. OTP rows are auditable and disposable; expired/consumed rows can be cleaned by future maintenance without changing account state.
6. DGFY password reset reuses the email OTP registry and does not introduce phone OTP behavior.
7. Guest checkout is protected from disposable browser retries and unverified email submissions without changing public browsing, Storefront catalog access, delivery routing, or payment-provider webhooks.

## Rollback Notes
1. Runtime rollback can set `EMAIL_OTP_ENFORCEMENT_ENABLED=false`; validators stop requiring `email_otp_code` and verification calls return a disabled-enforcement success result without querying OTP rows.
2. Existing tenant records, users, invitations, and email-to-tenant mappings remain valid.
3. The `email_otps` table is additive and can remain unused during rollback.
4. A temporary rollback can set `STOREFRONT_GUEST_OTP_REQUIRED=false`; this restores legacy guest checkout while leaving the additive OTP purpose and rows intact.

## Amendments

### 2026-08-07 — Brevo HTTPS API fallback removed; delivery is SMTP-only with no fallback
- Clause amended: Decision 9 (`default`)
- Change: Decision 9 said "Delivery may use SMTP or the Brevo HTTPS API fallback." Issue #135 found the Brevo relay was DMARC-blocked for Yahoo/iCloud recipients regardless of which path was used (Brevo had no authenticated sending domain for the configured `EMAIL_FROM`), and production cut over to Namecheap SMTP on `dgfy.ph`. Issue #279 then removed the Brevo HTTPS API fallback path entirely (`sendEmailViaBrevoApi`, `isBrevoApiConfigured`, `EMAIL_DELIVERY_PROVIDER`, `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`, `BREVO_API_KEY`, `BREVO_API_URL`) — it exercised zero production traffic and, being unauthenticated for the sending domain, would have failed the same way. Decision 9 now reads: delivery uses SMTP only; a send failure throws with no fallback provider attempted, and fail-closed OTP enforcement is unchanged. See ADR 0054 for the delivery-observability work (`email_delivery_logs`, async bounce capture, operational alerting) that #279 added alongside the removal.
- Superseded text (Decision 9, original): "Configured email delivery failure is fail-closed for OTP requests. Delivery may use SMTP or the Brevo HTTPS API fallback, but account email ownership checks cannot be bypassed by manual links."
