---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-06-27
applies_to: dgfy_accounts, tenant_registration, storefront_account, tenant_user_invitations
topic: global_dgfy_account_business_registration
---

# ADR 0022: Global DGFY Account For Business Registration

## Context

DGFY customer accounts and SKUpervisor tenant staff accounts were historically separate. Public storefront customer auth was tenant-scoped, while SKUpervisor staff auth required tenant context. The new business-registration flow requires one DGFY account to support customer profile/order surfaces and also register a company.

## Decision

Introduce a landlord-scoped DGFY account identity.

1. A DGFY account exists before tenant selection and stores last name, first name, optional middle name, username, email, phone, password hash, and account status.
2. Public company registration requires an authenticated DGFY account.
3. Founder email, phone, username seed, and password hash are derived server-side from the DGFY account. Registration clients must not provide or override founder contact, password, plan, or compliance mode.
4. Every new company starts in `non_compliant_active`. Compliance activation remains a SKUpervisor Settings > Compliance lifecycle.
5. Public DGFY account registration requires a global `dgfy_account_verification` SMTP OTP before account creation. The public OTP request must work without a company token and must ignore stale tenant cookies/headers; the registration mutation consumes the global code and sets `email_verified_at` when the account is created.
6. Public company registration requires a signed-in active DGFY account but does not require a separate DGFY email OTP before tenant creation because the account email was verified at DGFY signup. The authenticated DGFY account email is the founder email source for this registration. If a future DGFY email-change flow changes the account email, that email-change flow owns its own verification requirement before the changed email can be treated as verified identity elsewhere.
7. The tenant workflow selector remains required, but public-facing copy calls it Business Industry.
8. A landlord membership registry links DGFY accounts to tenant users. Founder membership is accepted immediately after tenant provisioning.
9. Existing tenant-local storefront customer auth and tenant staff auth remain valid compatibility surfaces while the shared DGFY identity is rolled across storefront Account, Orders, Track, and invitation notifications.
10. Storefront account endpoints may accept a DGFY JWT, but they must lazily link/create a tenant-local `store_customers` row before using existing order/profile behavior. Storefront token resolution must prefer existing tenant-local store tokens over a global DGFY token so legacy customer sessions are not displaced.
11. Company invitations to existing DGFY emails create pending DGFY memberships and can be accepted through `POST /api/v1/dgfy/invitations/:membership_id/accept` after `dgfy_business_step_up` email OTP verification; the accept step activates the tenant-local staff row instead of reusing `store_customers`. Pending landlord invitations are backfilled into DGFY memberships when a matching DGFY account is later created or loaded. ADR 0028 owns multi-company switching and business step-up semantics.
12. DGFY accounts support email verification with a dedicated `dgfy_account_verification` OTP purpose and nullable `email_verified_at`/`phone_verified_at` audit fields.
13. DGFY browser handoff uses a short-lived `dgfy_handoff` JWT with a persisted handoff `jti`; exchanging the token atomically consumes the matching landlord handoff row before issuing a normal DGFY account JWT. Replay, expired, or missing handoff rows must fail, and tenant-local SKUpervisor sessions remain separate.
14. DGFY account lifecycle supports profile updates, authenticated password change, and email-OTP password reset using `dgfy_password_reset`. Profile updates may change last name, first name, optional middle name, and phone; changing phone clears `phone_verified_at`.
15. Phone verification is intentionally deferred. The `phone_verified_at` field remains reserved for a future phone OTP rollout and must not be treated as verified by profile editing alone.
16. DGFY email changes remain deferred until a dedicated verified email-change flow is added for the global account.
17. DGFY account registration and DGFY company registration both require explicit, versioned ToS/T&C acknowledgement before the mutation can proceed. Registration clients load current versions and acknowledgement copy from `GET /api/v1/dgfy/legal-terms/current`; duplicated client-owned term versions are not authoritative. Clients must fail closed when the account flow lacks `terms_version`, `privacy_version`, or `marketplace_terms_version`, or when the company flow lacks `company_terms_version` or `marketplace_terms_version`. Acknowledgement evidence is landlord-scoped in `dgfy_legal_acknowledgements` with account, optional tenant, flow, version, accepted timestamp, request metadata, and immutable text/hash snapshots.
18. Registration copy must preserve the marketplace/platform framing: DGFY is an e-marketplace/platform service provider; the seller owns the product, sets the price, fulfills the order, and remains seller of record; payment is processed through a licensed payment partner; DGFY deducts disclosed fees and remits the seller's net settlement. DGFY must not present the flow as wallet balance, points conversion, cash-out credit, or DGFY reselling merchant goods.
19. Legal acknowledgement persistence is fail-closed. DGFY account creation, invitation membership mirroring, and account acknowledgement persistence run in one landlord transaction. Company registration checks legal-persistence availability before tenant creation; after confirming there is a signed-in active DGFY account, the landlord tenant row, pending-founder membership when applicable, and acknowledgement persistence run in one landlord transaction before tenant provisioning.
20. Storefront business-registration handoff must start from a signed-in DGFY account when launched from `dgfy.ph`, create a short-lived one-time `dgfy_handoff` token, then land the authenticated user on the focused business-registration area of `/register-company`. The company form collects only company name and Business Industry as business data; founder contact and credentials remain server-derived from the DGFY account.
21. Public company registration is mandatory manual review. Submission creates a pending tenant, a pending founder membership, and a landlord-scoped application/attempt record; it must not provision a tenant database, issue a tenant session, or return a company-token capability. The client immediately navigates to the owner-authorized registration status page and must not render a POS action while approval is pending. A tenant-session bridge may run only after an active tenant user and accepted founder membership exist; it is not a registration-time activation bypass.
22. Platform admin may manage global DGFY accounts through `/api/v1/dgfy/admin/accounts`. V1 scope is all landlord-scoped DGFY accounts, with name/phone profile edits, suspend/reactivate lifecycle actions, and credential-releasing delete/deidentify.
23. Platform-admin DGFY profile edits may update first name, optional middle name, last name, and phone. Phone updates clear `phone_verified_at`; phone verification remains deferred. Email changes remain deferred and must not be exposed through platform-admin edit until a dedicated verified email-change or approved admin override design exists.
24. Platform-admin suspend/reactivate uses `dgfy_accounts.is_active` as the lifecycle source of truth. Suspended accounts cannot log in and existing DGFY sessions fail on the next authenticated DGFY request because account auth reloads the landlord account and checks `is_active`.
25. Platform-admin DGFY account delete is a deidentify action, not a physical row purge. It requires a reason and current-email confirmation, sets `deleted_at`, deactivates the account, clears verification/login timestamps, overwrites password hash with an inert placeholder, and replaces email, phone, username, and display names with non-user placeholders so the original credentials can register again.
26. Delete/deidentify must preserve legal acknowledgements, tenant memberships, customer activity, reviews, loyalty, order/history records, and admin audit evidence. Deleted accounts are excluded from normal credential lookup and default platform-admin lists; the `deleted` status filter may show redacted deleted identities for support audit.
27. Every platform-admin DGFY account mutation writes a landlord-scoped `dgfy_account_admin_audit_logs` record with safe before/after snapshots, actor username, reason when applicable, request metadata, and no secrets such as password hashes, tokens, or OTPs.
28. Platform admin may create admin-provisioned DGFY accounts for merchant onboarding without public OTP. These accounts are active and may use a temporary password for platform-led DGFY, IMS, and POS setup, but they must be marked `provisioning_status='admin_provisioned'`, `temporary_password_active=true`, and `email_verification_source='platform_admin_provisioned'`. Phone remains unverified. Temporary passwords are returned only in the creation response and must never be written to audit snapshots.
29. Admin-provisioned accounts are a privileged platform-admin path only. Public DGFY registration still requires `dgfy_account_verification` OTP and legal acknowledgement before account creation. Admin provisioning evidence is not a substitute for merchant-facing legal acknowledgement; merchant terms acceptance remains distinct and must be captured before owner-authorized self-service or sensitive business actions depend on it.
30. Platform-admin tenant provisioning is fail-closed and retryable. A tenant remains `pending` until database provisioning completes. Retrying the same company may reuse only an exact pending `platform_admin` record with the same ownership shape; active completed companies and mismatched identities remain conflicts. Retry rotates the submitted temporary credential and records `provisioning_attempt=retry` in audit metadata.
31. Combined DGFY-plus-company reconciliation may reuse an exact admin-provisioned account and linked tenant only when tenant provisioning is still pending, or when the tenant is active but the linked account still lacks an accepted membership. The active case must skip database reprovisioning and reconcile the tenant-local master-admin profile and accepted membership. Responses after post-commit failure must identify the failed phase and state that the retained partial state is retryable; they must not return generic success.
32. The authenticated assisted-provisioning transports allow up to 180 seconds for synchronous first-time tenant migration while the global server timeout remains 30 seconds. This route-scoped transport allowance prevents a completed provisioning operation from appearing as a network failure to the Platform Admin UI; it does not relax authentication, validation, or database activation rules.

## Consequences

1. Company registration is now a cross-boundary flow covering DGFY identity, tenant provisioning, tenant staff bootstrap, and storefront entry points.
2. ADR 0006 remains valid: tenant-local store customer records must not be treated as the global account. They become linkable customer records under the global DGFY identity.
3. ADR 0007 is amended for public registration: tenant mode is no longer selected at registration; new tenants start non-compliant and pending manual approval.
4. ADR 0013 is amended: first-login handoff can originate from DGFY account membership instead of direct founder password collection.
5. ADR 0015 remains the invitation baseline, but DGFY account invitations can be accepted from account notifications without exposing company tokens.
6. Account-management UI on the registration surface must not nest profile/password forms inside the company registration form; each mutation has its own submit boundary to prevent accidental tenant creation attempts.
7. The implementation hardening contract in `docs/architecture/ARCHITECTURE_GOVERNANCE.md` applies to all future DGFY account, registration, invitation, and storefront account changes.
8. Seller-of-record and payment-partner wording is part of the registration contract. Future payment work must keep ADR 0012 pricing separate from provider settlement mechanics and must not imply that DGFY operates a stored-value wallet unless a separate regulated-wallet design is approved.
9. Registration acknowledgement hardening improves evidence capture but does not itself implement PayMongo Platform/sub-merchant split settlement. Payment-provider onboarding, payout routing, withholding, and settlement reports remain separate governed payment work.
10. Platform support can suspend compromised or abusive global DGFY identities without deleting legal and transaction evidence. Reactivation remains explicit and reason-audited.
11. Platform support can release a DGFY account's credentials for re-registration without erasing legal, customer, tenant, or admin audit records by using the delete/deidentify action.
12. Platform support can create temporary-password DGFY accounts for assisted onboarding, but the account state must remain visibly admin-provisioned until the merchant changes the temporary password and completes any required merchant-facing acknowledgements.

## Hardening Contract For This Flow

This ADR requires the following final-phase hardening practices for DGFY account and company-registration work:

1. Handoff tokens must be persisted and atomically consumed by `jti`; successful exchange and replay rejection are both required test cases.
2. Email OTP purposes must be purpose-scoped and single-use. New purposes such as `dgfy_password_reset` and `dgfy_business_step_up` must be added to the service enum, model enum, migration, and tests together.
3. DGFY account lifecycle must include profile update, authenticated password change, and email-OTP password reset before the account-management surface is treated as user-ready. The company-registration surface remains focused on company creation after DGFY authentication.
4. Phone verification remains explicitly deferred. Changing a phone number clears `phone_verified_at`, and no UI or backend flow may present the phone as verified until a future phone OTP rollout exists.
5. DGFY email changes remain explicitly deferred and must not be implemented through the profile form until a dedicated verified email-change flow is designed.
6. The registration surface must not nest account-management forms inside the company-registration form so account updates cannot submit tenant creation.
7. Frontend tests must prove the DGFY-gated registration state, no separate DGFY email-code gate after sign-in/handoff, required legal acknowledgements, backend-owned legal terms loading/fail-closed behavior including incomplete legal-version payloads, Last Name > First Name > Optional Middle Name registration order, Business Industry label, password visibility controls, storefront-to-business-registration handoff, reset flow, and non-submission of tenant registration from non-company account actions.
8. Rendered QA must exercise `/register-company` with desktop and mobile viewports, verify nonblank content, verify the Reset interaction, check for framework overlays, and review console output for errors on the target route.
9. Build proof must include the root frontend app and the owned SKUpervisor build. Storefront and POS builds are required when shared frontend code, shared services, or shared UI components are touched.
10. Final implementation reporting must include an honest residual-risk statement and an updated readiness rating after hardening.

## Validation

Implementations must prove:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. DGFY auth tests for register/login/me/email verification/handoff.
4. Company registration tests proving DGFY account requirement without a separate DGFY email-code gate, terms acknowledgement enforcement before tenant creation, non-compliant default, and no client override of founder or compliance fields.
5. Frontend tests proving DGFY-gated registration, absence of the signed-in email-code gate, terms acknowledgement gating including malformed legal-version payloads, Business Industry labeling, storefront-to-business-registration handoff, and password visibility controls.
6. DGFY lifecycle tests proving handoff replay rejection, profile phone uniqueness, phone-verification clearing on phone change, authenticated password change, and email-OTP password reset.
7. Frontend tests proving non-company DGFY account actions do not submit the company-registration form.
8. Rendered route QA for `/register-company`, including Reset interaction and mobile/desktop visual checks.
9. Root frontend build plus SKUpervisor build; Storefront/POS builds when shared surfaces are touched.
10. Platform-admin DGFY account lifecycle tests proving list/detail, profile validation, duplicate/invalid phone rejection, email-edit rejection, suspend/reactivate reason enforcement, delete/deidentify confirmation and credential release, audit persistence, and suspended/deleted-account login/auth rejection.
11. Platform-admin DGFY account creation tests proving no public OTP is consumed, duplicate email/phone conflicts fail safely, temporary-password state is visible, password change clears `temporary_password_active`, and audit snapshots contain no secrets.
12. Rendered admin-route QA for `/admin/dgfy-accounts`, including nonblank content, console health, filters, detail drawer, create-account panel, and one profile or lifecycle interaction.
