---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-26
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
12. DGFY browser handoff uses a short-lived `dgfy_handoff` JWT with a persisted handoff `jti`; exchanging the token atomically consumes the matching landlord handoff row before issuing a normal DGFY account JWT. Replay, expired, or missing handoff rows must fail, and tenant-local SKUpervisor sessions remain separate.
13. DGFY account lifecycle supports profile updates, authenticated password change, and email-OTP password reset using `dgfy_password_reset`. Profile updates may change first name, last name, and phone; changing phone clears `phone_verified_at`.
14. Phone verification is intentionally deferred. The `phone_verified_at` field remains reserved for a future phone OTP rollout and must not be treated as verified by profile editing alone.
15. DGFY email changes remain deferred until a dedicated verified email-change flow is added for the global account.
16. DGFY account registration and DGFY company registration both require explicit, versioned ToS/T&C acknowledgement before the mutation can proceed. Registration clients load current versions and acknowledgement copy from `GET /api/v1/dgfy/legal-terms/current`; duplicated client-owned term versions are not authoritative. Acknowledgement evidence is landlord-scoped in `dgfy_legal_acknowledgements` with account, optional tenant, flow, version, accepted timestamp, request metadata, and immutable text/hash snapshots.
17. Registration copy must preserve the marketplace/platform framing: DGFY is an e-marketplace/platform service provider; the seller owns the product, sets the price, fulfills the order, and remains seller of record; payment is processed through a licensed payment partner; DGFY deducts disclosed fees and remits the seller's net settlement. DGFY must not present the flow as wallet balance, points conversion, cash-out credit, or DGFY reselling merchant goods.
18. Legal acknowledgement persistence is fail-closed. DGFY account creation, invitation membership mirroring, and account acknowledgement persistence run in one landlord transaction. Company registration checks legal-persistence availability before OTP consumption; after OTP verification, the landlord tenant row, pending-founder membership when applicable, and acknowledgement persistence run in one landlord transaction before tenant provisioning.

## Consequences

1. Company registration is now a cross-boundary flow covering DGFY identity, tenant provisioning, tenant staff bootstrap, and storefront entry points.
2. ADR 0006 remains valid: tenant-local store customer records must not be treated as the global account. They become linkable customer records under the global DGFY identity.
3. ADR 0007 is amended for public registration: tenant mode is no longer selected at registration; new tenants start non-compliant.
4. ADR 0013 is amended: first-login handoff can originate from DGFY account membership instead of direct founder password collection.
5. ADR 0015 remains the invitation baseline, but DGFY account invitations can be accepted from account notifications without exposing company tokens.
6. Account-management UI on the registration surface must not nest profile/password forms inside the company registration form; each mutation has its own submit boundary to prevent accidental tenant creation attempts.
7. The implementation hardening contract in `docs/architecture/ARCHITECTURE_GOVERNANCE.md` applies to all future DGFY account, registration, invitation, and storefront account changes.
8. Seller-of-record and payment-partner wording is part of the registration contract. Future payment work must keep ADR 0012 pricing separate from provider settlement mechanics and must not imply that DGFY operates a stored-value wallet unless a separate regulated-wallet design is approved.
9. Registration acknowledgement hardening improves evidence capture but does not itself implement PayMongo Platform/sub-merchant split settlement. Payment-provider onboarding, payout routing, withholding, and settlement reports remain separate governed payment work.

## Hardening Contract For This Flow

This ADR requires the following final-phase hardening practices for DGFY account and company-registration work:

1. Handoff tokens must be persisted and atomically consumed by `jti`; successful exchange and replay rejection are both required test cases.
2. Email OTP purposes must be purpose-scoped and single-use. New purposes such as `dgfy_password_reset` must be added to the service enum, model enum, migration, and tests together.
3. DGFY account lifecycle must include profile update, authenticated password change, and email-OTP password reset before the business-registration surface is treated as user-ready.
4. Phone verification remains explicitly deferred. Changing a phone number clears `phone_verified_at`, and no UI or backend flow may present the phone as verified until a future phone OTP rollout exists.
5. DGFY email changes remain explicitly deferred and must not be implemented through the profile form until a dedicated verified email-change flow is designed.
6. The registration surface must keep account-management forms separate from the company-registration form so account updates cannot submit tenant creation.
7. Frontend tests must prove the DGFY-gated registration state, verified-account gate, required legal acknowledgements, backend-owned legal terms loading/fail-closed behavior, Business Industry label, password visibility controls, reset flow, and non-submission of tenant registration from profile/password actions.
8. Rendered QA must exercise `/register-company` with desktop and mobile viewports, verify nonblank content, verify the Reset interaction, check for framework overlays, and review console output for errors on the target route.
9. Build proof must include the root frontend app and the owned SKUpervisor build. Storefront and POS builds are required when shared frontend code, shared services, or shared UI components are touched.
10. Final implementation reporting must include an honest residual-risk statement and an updated readiness rating after hardening.

## Validation

Implementations must prove:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. DGFY auth tests for register/login/me/email verification/handoff.
4. Company registration tests proving DGFY account requirement, verified-account gate, terms acknowledgement enforcement before OTP consumption, non-compliant default, and no client override of founder or compliance fields.
5. Frontend tests proving DGFY-gated registration, verified-account gating, terms acknowledgement gating, Business Industry labeling, and password visibility controls.
6. DGFY lifecycle tests proving handoff replay rejection, profile phone uniqueness, phone-verification clearing on phone change, authenticated password change, and email-OTP password reset.
7. Frontend tests proving DGFY profile/password reset actions do not submit the company-registration form.
8. Rendered route QA for `/register-company`, including Reset interaction and mobile/desktop visual checks.
9. Root frontend build plus SKUpervisor build; Storefront/POS builds when shared surfaces are touched.
