---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-06-05
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
5. Public company registration requires a signed-in active DGFY account but does not require a separate DGFY email OTP or `email_verified_at` gate before tenant creation. The authenticated DGFY account email is the founder email source for this registration. If a future DGFY email-change flow changes the account email, that email-change flow owns its own verification requirement before the changed email can be treated as verified identity elsewhere.
6. The tenant workflow selector remains required, but public-facing copy calls it Business Industry.
7. A landlord membership registry links DGFY accounts to tenant users. Founder membership is accepted immediately after tenant provisioning.
8. Existing tenant-local storefront customer auth and tenant staff auth remain valid compatibility surfaces while the shared DGFY identity is rolled across storefront Account, Orders, Track, and invitation notifications.
9. Storefront account endpoints may accept a DGFY JWT, but they must lazily link/create a tenant-local `store_customers` row before using existing order/profile behavior. Storefront token resolution must prefer existing tenant-local store tokens over a global DGFY token so legacy customer sessions are not displaced.
10. Company invitations to existing DGFY emails create pending DGFY memberships and can be accepted through `POST /api/v1/dgfy/invitations/:membership_id/accept`; the accept step activates the tenant-local staff row instead of reusing `store_customers`. Pending landlord invitations are backfilled into DGFY memberships when a matching DGFY account is later created or loaded.
11. DGFY accounts support email verification with a dedicated `dgfy_account_verification` OTP purpose and nullable `email_verified_at`/`phone_verified_at` audit fields.
12. DGFY browser handoff uses a short-lived `dgfy_handoff` JWT with a persisted handoff `jti`; exchanging the token atomically consumes the matching landlord handoff row before issuing a normal DGFY account JWT. Replay, expired, or missing handoff rows must fail, and tenant-local SKUpervisor sessions remain separate.
13. DGFY account lifecycle supports profile updates, authenticated password change, and email-OTP password reset using `dgfy_password_reset`. Profile updates may change last name, first name, optional middle name, and phone; changing phone clears `phone_verified_at`.
14. Phone verification is intentionally deferred. The `phone_verified_at` field remains reserved for a future phone OTP rollout and must not be treated as verified by profile editing alone.
15. DGFY email changes remain deferred until a dedicated verified email-change flow is added for the global account.
16. DGFY account registration and DGFY company registration both require explicit, versioned ToS/T&C acknowledgement before the mutation can proceed. Registration clients load current versions and acknowledgement copy from `GET /api/v1/dgfy/legal-terms/current`; duplicated client-owned term versions are not authoritative. Clients must fail closed when the account flow lacks `terms_version`, `privacy_version`, or `marketplace_terms_version`, or when the company flow lacks `company_terms_version` or `marketplace_terms_version`. Acknowledgement evidence is landlord-scoped in `dgfy_legal_acknowledgements` with account, optional tenant, flow, version, accepted timestamp, request metadata, and immutable text/hash snapshots.
17. Registration copy must preserve the marketplace/platform framing: DGFY is an e-marketplace/platform service provider; the seller owns the product, sets the price, fulfills the order, and remains seller of record; payment is processed through a licensed payment partner; DGFY deducts disclosed fees and remits the seller's net settlement. DGFY must not present the flow as wallet balance, points conversion, cash-out credit, or DGFY reselling merchant goods.
18. Legal acknowledgement persistence is fail-closed. DGFY account creation, invitation membership mirroring, and account acknowledgement persistence run in one landlord transaction. Company registration checks legal-persistence availability before tenant creation; after confirming there is a signed-in active DGFY account, the landlord tenant row, pending-founder membership when applicable, and acknowledgement persistence run in one landlord transaction before tenant provisioning.
19. Storefront business-registration handoff must start from a signed-in DGFY account when launched from `dgfy.ph`, create a short-lived one-time `dgfy_handoff` token, then land the authenticated user on the focused business-registration area of `/register-company`. The company form collects only company name and Business Industry as business data; founder contact and credentials remain server-derived from the DGFY account.
20. After active auto-standard tenant provisioning, the registration UI shows a company-created confirmation page. When the founder clicks **Proceed to SKUpervisor**, the UI exchanges the signed-in DGFY account plus accepted founder membership for a normal SKUpervisor tenant session through `POST /api/v1/dgfy/auth/tenant-session`, then redirects the founder to IMS without asking for SKUpervisor credentials again. The endpoint must only issue a session for an active accepted membership linked to the authenticated DGFY account and an active tenant user. Manual SKUpervisor login with prefilled DGFY email and company token remains only a failure fallback when the tenant-session exchange cannot be completed.
21. Platform admin may manage global DGFY accounts through `/api/v1/dgfy/admin/accounts`. V1 scope is all landlord-scoped DGFY accounts, with name/phone profile edits, suspend/reactivate lifecycle actions, and credential-releasing delete/deidentify.
22. Platform-admin DGFY profile edits may update first name, optional middle name, last name, and phone. Phone updates clear `phone_verified_at`; phone verification remains deferred. Email changes remain deferred and must not be exposed through platform-admin edit until a dedicated verified email-change or approved admin override design exists.
23. Platform-admin suspend/reactivate uses `dgfy_accounts.is_active` as the lifecycle source of truth. Suspended accounts cannot log in and existing DGFY sessions fail on the next authenticated DGFY request because account auth reloads the landlord account and checks `is_active`.
24. Platform-admin DGFY account delete is a deidentify action, not a physical row purge. It requires a reason and current-email confirmation, sets `deleted_at`, deactivates the account, clears verification/login timestamps, overwrites password hash with an inert placeholder, and replaces email, phone, username, and display names with non-user placeholders so the original credentials can register again.
25. Delete/deidentify must preserve legal acknowledgements, tenant memberships, customer activity, reviews, loyalty, order/history records, and admin audit evidence. Deleted accounts are excluded from normal credential lookup and default platform-admin lists; the `deleted` status filter may show redacted deleted identities for support audit.
26. Every platform-admin DGFY account mutation writes a landlord-scoped `dgfy_account_admin_audit_logs` record with safe before/after snapshots, actor username, reason when applicable, request metadata, and no secrets such as password hashes, tokens, or OTPs.

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
10. Platform support can suspend compromised or abusive global DGFY identities without deleting legal and transaction evidence. Reactivation remains explicit and reason-audited.
11. Platform support can release a DGFY account's credentials for re-registration without erasing legal, customer, tenant, or admin audit records by using the delete/deidentify action.

## Hardening Contract For This Flow

This ADR requires the following final-phase hardening practices for DGFY account and company-registration work:

1. Handoff tokens must be persisted and atomically consumed by `jti`; successful exchange and replay rejection are both required test cases.
2. Email OTP purposes must be purpose-scoped and single-use. New purposes such as `dgfy_password_reset` must be added to the service enum, model enum, migration, and tests together.
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
11. Rendered admin-route QA for `/admin/dgfy-accounts`, including nonblank content, console health, filters, detail drawer, and one profile or lifecycle interaction.
