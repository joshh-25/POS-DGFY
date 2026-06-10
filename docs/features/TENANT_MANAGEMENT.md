---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-06-08
applies_to: tenant_management_and_plan_gating
topic: tenant_management
---

# Tenant Management System

## Overview

The SKU Inventory Manager uses a **Multi-Tenant Architecture** with **Database Isolation**. Each registered company (tenant) gets its own dedicated MySQL database, ensuring data privacy and security. The "Admin Portal" allows the Platform Owner (Superadmin) to manage these tenants.

## Tenant Lifecycle

### 1. Registration (Current Policy)
- **DGFY Account Requirement**: Public company registration requires a signed-in global DGFY account. DGFY account signup first sends a `dgfy_account_verification` SMTP OTP to the submitted email and consumes that code before creating the account. The founder's email, phone, username seed, and password hash are derived server-side from the verified DGFY account.
- **DGFY Account Registration Order**: Account creation collects Last Name, First Name, Optional Middle Name, email, contact number, password, and confirm password in that order. Password and confirmation fields expose visibility toggles. The optional middle name is persisted as `dgfy_accounts.middle_name` and appears in DGFY profile/customer account surfaces when present.
- **Premium-Capable Account**: Every newly registered tenant persists `plan=premium` by default so mode-specific premium-gated surfaces are available after activation. The registration UI no longer displays a premium-capable widget.
- **Default Auto-Accept Mode**: `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` is the default. Public company registration immediately creates the landlord tenant row, provisions the isolated tenant database, activates the tenant, and automatically exchanges the signed-in DGFY account plus accepted founder membership for the normal tenant session without retyping credentials.
- **Manual Approval Rollback Mode**: `TENANT_REGISTRATION_APPROVAL_MODE=manual` keeps the traditional pending flow available when operators intentionally need platform-admin review before provisioning.
- **Provider Subscription Onboarding**: Disabled for this phase. Requests that include provider subscription verification are rejected with `503` and `PAYMENTS_DISABLED`.
- **Founder Contact Requirement**: Public company registration uses the signed-in DGFY account phone number. The landlord tenant record stores it as `admin_phone`, and provisioning copies it into the founder/admin user's `phone_number`.
- **Founder Account Source**: Public company registration requires a signed-in active DGFY account. The company-registration path uses that already-verified account email as the founder email and does not show or require a separate DGFY email-code step after successful sign-in or storefront handoff. Future DGFY email-change work owns its own verification contract before a changed email can be treated as verified identity elsewhere.
- **Required Terms Acknowledgement**: DGFY account registration and public company registration both require current ToS/T&C acknowledgement loaded from `GET /api/v1/dgfy/legal-terms/current`. The account checkbox remains disabled until `terms_version`, `privacy_version`, and `marketplace_terms_version` are present; the company checkbox remains disabled until `company_terms_version` and `marketplace_terms_version` are present. The backend rejects missing, false, or stale acknowledgement with `422 TERMS_ACKNOWLEDGEMENT_REQUIRED`, fails closed when legal persistence is unavailable, and persists successful acknowledgement evidence in landlord `dgfy_legal_acknowledgements`.
- **Legal Evidence Atomicity**: DGFY account creation, invitation membership mirroring, and account acknowledgement evidence are written in one landlord transaction. Company registration checks legal-persistence availability before tenant creation; after confirming there is a signed-in active DGFY account, the landlord tenant row and company acknowledgement evidence are written in one landlord transaction before tenant provisioning.
- **Marketplace Provider Framing**: Registration copy must identify DGFY as an e-marketplace/platform service provider. The company remains seller of record, owns the product/service listing, sets prices, fulfills orders, handles customer obligations, and uses a registered business payout account. DGFY facilitates the transaction, uses a licensed payment partner, deducts disclosed fees, and remits the seller's net settlement; the product must not describe this as DGFY wallet points, cash-out credit, or DGFY reselling the merchant's goods.
- **Compliance Default**: Public company registration no longer asks for compliance mode. New companies start `non_compliant_active`; master admins can start compliance activation later in Settings > Compliance.
- **Password Requirement**: Account registration, invitation acceptance, and password changes require only a minimum password length of 8 characters. The UI offers a readable 16-character generator, but generated passwords are optional.
- **Phone Format**: Company admin phone numbers and user phone numbers are trimmed and must be 7-40 characters using digits, spaces, `+`, `-`, parentheses, and periods.
- **Provisioning Trigger**: Database provisioning runs during public registration in default `auto_standard` mode, or after explicit admin approval when `manual` mode is configured.
- **Storefront Handoff**: `Register Your Business` launched from DGFY/storefront discovery must start from the signed-in DGFY account surface when possible, create a short-lived DGFY handoff token, and send the user to `/register-company?source=dgfy&auth=login&handoff_token=<token>#business-registration`. If no valid DGFY session exists, the launcher must route the user to `/dgfy/auth?intent=register-business&return_to=/register-company#business-registration` first. `/register-company` must exchange the token once, remove `handoff_token` from the URL after success or failure, and keep the canonical DGFY sign-in fallback focused on `#business-registration` when the handoff is expired or already consumed. The browser registration flow uses the exchange endpoint's `soft_fail` mode so expected expired/consumed handoff recovery returns an invalid status payload instead of a browser-visible 4xx resource error; strict replay failure remains the default API behavior when `soft_fail` is not requested. The authenticated company-registration area is focused before tenant registration can proceed, and the page no longer owns create-account or reset-password UI directly.
- **Email Mapping**: Manual pending registrations create the founder email-to-tenant mapping at registration time so lookup can show pending status. Auto-provisioned registrations leave mapping creation to the provisioning path so the mapping is written only after tenant activation succeeds.
- **Abuse Control**: Public company registration is IP rate-limited (`RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5` per `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000` by default in production). Keep this strict because default accepted registrations create tenant databases.

### 2. Approval & Provisioning (Active)
- Public registration auto-accepts and provisions the tenant when `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` (default). Admin clicks **Approve** in the Tenant Manager only for pending accounts created while `TENANT_REGISTRATION_APPROVAL_MODE=manual` is explicitly configured.
- System performs **Provisioning**:
    1.  Generates a unique database name (must start with `sku_tenant_` for safety).
    2.  Creates the database.
    3.  Runs migrations to create all required tables (Items, Users, POs, etc.).
    4.  Seeds the default Admin User.
    5.  Updates status to **Active**.
    6.  Sends specific email with login credentials.
    7.  Keeps approval retryable if provisioning fails before activation.
- Approval email delivery is non-blocking after successful provisioning. If SMTP fails, the active registration response still succeeds with `email_sent=false`, and the founder can continue from the in-app confirmation page.
- Tenant-session handoff uses the signed-in DGFY account and returned tenant identity immediately after active provisioning; the tenant master-admin row is seeded from the DGFY account during provisioning. The registration response does not return tenant auth tokens.
- If the automatic tenant-session handoff fails after activation, the tenant remains active and the UI routes the founder to manual sign-in with DGFY email and company token prefilled.
- Tenant schema provisioning is mode-wide. The backend clones tenant-local models from the canonical model registry into each new tenant database while excluding landlord-only models, so Services, F&B, and future modes must add tenant-local tables through the same model graph.
- Provisioning failure cleanup is retry-safe for approval paths. If schema sync, seed data, storefront bootstrap, or email-adjacent setup fails before activation, the isolated database is dropped and the landlord tenant row is restored to a valid `pending` status instead of an out-of-enum temporary state. Future mode work must preserve this behavior.
- After first login, the tenant master admin sees the soft-reminder onboarding flow from ADR 0013: optional storefront profile/cover photos, a primary storefront location pin, and mode-aware bulk starter item creation. Onboarding completion is independent from platform approval and does not hard-block IMS/POS access.

### 3. Rejection
- Admin rejects a pending registration.
- Status becomes **Rejected**.
- Data remains for audit but no database is created.

### 4. Deactivation (Soft Delete)
- Admin changes status to **Inactive**.
- Tenant record and database remain intact.
- **Effect**: Users cannot log in. API requests with that company token are rejected.
- Useful for non-payment or temporary suspension.

### 5. Permanent Deletion
- Admin deletes the tenant from the Admin Portal.
- **Effect**: The specific tenant database is **DROPPED**. The tenant record is removed.
- **Safety Measures**:
    1. **Name Matching**: Requires typing the company name exactly to confirm.
    2. **Prefix Enforcement**: For security, the backend ONLY allows dropping databases that start with the `sku_tenant_` prefix.
    3. **Storefront Discovery Cleanup**: The landlord `storefront_discovery_index` row is removed before database deletion. If discovery cleanup fails, the delete request fails and the tenant database is left intact so public discovery cannot continue showing a tenant after a reported successful deletion. If database deletion fails after index cleanup succeeds, the delete flow attempts to restore the discovery row before returning the failure.
- **Legacy Note**: Databases created with non-standard naming conventions (e.g., `tenant_standard`) cannot be deleted via the UI and require manual script intervention.

## Subscription Plans (Current Policy)

Tenants still store plan metadata, but billing/subscription workflows are hard-disabled in this phase. New pending and active registrations default to `plan=premium`; migration `20260508000001-default-registered-tenants-to-premium.cjs` backfills existing pending/active rows.

- **Standard**: Legacy/reserved plan tier for inactive historical rows only. Pending and active tenants are normalized back to `premium` by registration, approval, and admin status-update paths.
- **Premium**: Default registered-tenant plan tier for gated mode surfaces.
- **Enterprise**: Reserved for future expansion.

Current policy notes:
1. Payment/subscription endpoints return `503` with `PAYMENTS_DISABLED`.
2. Legacy billing admin actions (`/admin/tenants/:id/change-plan`, billing setup) are disabled while billing is paused.
3. Tenant Manager no longer exposes plan edits. `PUT /admin/tenants/:id` accepts legacy `plan` input for transport compatibility, but pending/active tenants are normalized to `premium`; active tenants cannot be downgraded through that route.
4. Manual premium-capable tenants keep `subscription_status=inactive` unless a provider subscription id is supplied and verified by an enabled payment flow. Premium route gates in billing-paused mode still use plan metadata only.
5. Provider-verified subscription registration is disabled while payments are paused.
6. Live subscription-status enforcement is only applied when `PAYMENTS_ENABLED=true`.
7. Tenant list responses include `effective_plan` and `plan_policy`; admin UI renders `effective_plan` so stale historical `standard` rows cannot contradict backend premium-capable enforcement.

### Feature Gating

| Feature | Standard | Premium |
|---------|:--------:|:-------:|
| Dashboard & Stats | Yes | Yes |
| Items / Suppliers / Orders | Yes | Yes |
| Stock Movements & Reports | Yes | Yes |
| Settings & User Management | Yes | Yes |
| **AI Chat Assistant** | No (upgrade prompt) | Yes |
| **AI Demand Forecasting** | No (upgrade prompt) | Yes |
| **POS API surfaces** | No | Yes (with POS permissions) |

### Gating Implementation
- **Frontend**: `PermissionContext.jsx` exposes `tenantPlan` from the user's company record. Components check `tenantPlan === 'premium'` to show/hide premium features.
- **Backend plan gate (`requirePremium`)**:
  - `plan !== premium` returns `403` with upgrade-required metadata.
  - When `PAYMENTS_ENABLED=false`, premium-only routes are unlocked by plan metadata alone.
  - When `PAYMENTS_ENABLED=true`, premium routes additionally enforce active/grace subscription state.
- **Backend permission gate (`checkPermission`)**:
  - Premium plan does not bypass user permissions.
  - POS endpoints still require permissions such as `pos:view` and `pos:transact`.
- **Example**:
  - A premium tenant user without `pos:view` still receives `403` on `/api/v1/pos/catalog`.

> **Known Caveat**: MariaDB may return the `permissions` JSON column as a string. `PermissionContext.jsx` handles this with `JSON.parse()` pre-processing (fixed in Phase 32).

## Platform-Admin Capability Controls

Tenant Manager exposes platform-owner capability switches for active tenants:

- **IMS** uses tenant-local `system_settings.tenant_ims_enabled`. Missing rows default to enabled. When disabled, authenticated IMS route groups such as Settings, Items, Suppliers, Purchases, Stock, Dashboard, Reports, AI, Services, F&B, Hospitality, Sales, Analytics, Feedback, Compliance, Onboarding, tenant locations, and tenant user-management operations return `403 TENANT_CAPABILITY_DISABLED`; auth, current-user profile/password remediation, platform-admin, receive-token, billing/payment, and public Storefront routes remain outside this gate.
- **POS** uses tenant-local `system_settings.tenant_pos_enabled`. Missing rows default to enabled. When disabled, `/api/v1/pos/*` returns `403 TENANT_CAPABILITY_DISABLED` after normal authentication and premium context checks. Shared mode routes that authorize through POS permission fallbacks ignore those POS fallback permissions while the tenant POS capability is disabled, but native Services/F&B/Hospitality permissions remain usable.
- **Storefront / Maps** reuses the governed public visibility and access-mode contract. Parent visibility writes `store_is_visible`; sub-mode writes `customer_access_mode` using the existing labels `Map Listing Only`, `Catalog Only`, `Inquiry Mode`, and `Online Ordering Mode`.

Capability changes require a platform-admin reason, write a landlord `tenant_admin_audit_logs` row with before/after capability snapshots, and write tenant-local settings in a tenant DB transaction. Platform-admin Storefront changes must refresh the landlord `storefront_discovery_index` after successful tenant setting writes; if the refresh fails, the backend compensates by rolling back the Storefront setting changes and returns an error instead of reporting a stale success. Tenant list responses include `capabilities.storefront_readiness` so the admin UI can show whether Storefront visibility is actually publishable through an active primary storefront map pin with coordinates. These switches must not mutate tenant lifecycle `status`, subscription `plan`, item-level POS visibility, item-level Storefront visibility, or branch availability overrides.

Current production status as of 2026-06-10:
- DGFY OTP-first account signup and automatic IMS tenant-session handoff are deployed at SHA `9e7c64ceaaa6e0f636db0cf59e413874b03f7b70`.
- Production remote `HEAD`, remote `origin/master`, and `.deploy-state/last_deployed_commit` matched that SHA at proof time; deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260610_151425.summary.txt` reports backend health, IMS, POS, Storefront, public endpoints, tenant-store asset integrity, frontend asset parity, tenant schema sync, tenant schema sync regression, tenant index headroom, permission backfill, Storefront discovery index reconciliation, and PM2 reload passing.
- The release used the documented emergency no-staging bypass because stale QA deployed-head evidence was the sole failed gate after QA smoke, rollback, restore, docs, and architecture passed. `System_Audit/7.2-Release_evidence_depends_on_stale_or_bypassable_QA_paths.md` remains open until QA deployed-head evidence is deterministic.
- Local validation for the release included `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`, `npm --prefix backend test -- --runInBand tests/dgfyAuthUseCases.test.js tests/emailOtpService.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js`, `npm run check:architecture`, and `npm --prefix frontend run build`.
- Live route smoke returned HTTP 200 with root content and no framework overlay for `/dgfy/auth?intent=register-business&mode=create-account` and `/register-company`.

## Technical Architecture

### Database Schema (Main DB)
The `Tenants` table in the primary database acts as the directory.

```sql
CREATE TABLE Tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255), -- Optional custom domain
    admin_email VARCHAR(255) NOT NULL,
    company_token VARCHAR(255) UNIQUE NOT NULL, -- Header: x-company-token
    db_name VARCHAR(255), -- The name of their isolated DB
    status ENUM('pending', 'active', 'inactive', 'rejected') DEFAULT 'pending',
    plan ENUM('standard', 'premium') DEFAULT 'premium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Backend uses `underscored: true` mapping in Sequelize to ensure snake_case
    -- model attributes (createdAt, updatedAt) map correctly to these columns.
);
```

### Routing Logic
1.  Frontend sends `x-company-token` header.
2.  Backend Middleware (`tenantMiddleware`) looks up the token in `Tenants` table.
3.  If found and Active, it establishes a connection to the specific `db_name`.
4.  All subsequent queries in that request use that connection.

## Email-to-Tenant Lookup

The `UserTenantMapping` table in the main DB maps email addresses to tenant IDs. This powers the login pre-screen: users enter their email and the system resolves which company (or companies) they belong to, returning the `company_token` without the user needing to memorize it.

`POST /api/v1/auth/lookup` is a pre-login identification endpoint. It remains rate-limited to reduce tenant enumeration risk, but it must not require CSRF even when the browser still carries stale HttpOnly session cookies from a previous login; otherwise users can be blocked before they can identify their company or enter a manual token.

### Endpoint
```
POST /api/v1/auth/lookup
Body: { "email": "user@example.com" }
```

### Response shapes

**Single tenant** (most common):
```json
{
  "success": true,
  "data": {
    "company_token": "abc123...",
    "company_name": "Acme Corp",
    "status": "pending"
  }
}
```

**Multiple tenants** (email belongs to more than one company):
```json
{
  "success": true,
  "data": {
    "multiple": true,
    "tenants": [
      { "id": 1, "name": "Acme Corp", "company_token": "abc...", "status": "active" },
      { "id": 2, "name": "Beta LLC",  "company_token": "def...", "status": "pending" }
    ]
  }
}
```

**Not found** (no active/pending tenant for that email): `404`

**Invalid email** (validation failure): `422` with `errors[]` array

### Key behaviors
- Email is **case-normalized** (lowercased) before lookup — `USER@EXAMPLE.COM` and `user@example.com` resolve identically.
- Only tenants with status `'active'` or `'pending'` are returned. Rejected/inactive tenants are excluded.
- Rate-limited to **5 requests per 15-minute window** in production (bypassed in `NODE_ENV=test`).

### Mapping management
Mappings are created automatically when:
1. A company is registered and provisioning succeeds in `auto_standard`, or immediately for pending manual registrations
2. A user is invited and accepts their invitation through the tenant invitation flow or the DGFY invitation membership flow

Company-user registration, tenant invitation acceptance, and DGFY account registration now require a phone number and an email OTP. Public company registration derives phone and credentials from the authenticated DGFY account and does not ask for a separate company-registration email OTP or DGFY email-code step after sign-in. Existing accepted users created before this requirement can add or change their phone number from Settings > Profile. Settings rejects profile saves that would leave the resulting account phone blank or invalid, and the authenticated shell shows a remediation banner with a direct Profile link until the stored account phone is completed.

Email ownership checks are required before login identity is created or changed:
- `dgfy_account_verification`: requested before DGFY account registration creates the global account, and still available from the authenticated account surface for older unverified accounts.
- Company registration uses the signed-in DGFY account email directly and does not require a separate DGFY email-code step before `/admin/tenants/register`.
- `tenant_user_registration`: requested with tenant context before `/auth/register`.
- `invitation_acceptance`: requested from an invitation token before `/auth/accept-invite`.
- `email_change`: requested by the authenticated user before `PUT /users/me` changes the email.

OTP rows live in the landlord `email_otps` table. Codes are six digits, single-use, expire after `EMAIL_OTP_TTL_MINUTES` (default 10), lock after `EMAIL_OTP_MAX_ATTEMPTS` (default 5), and are consumed through a conditional update so concurrent accepts cannot reuse the same code. Production enables enforcement by default; `EMAIL_OTP_ENFORCEMENT_ENABLED=false` is the rollback switch. OTP request routes are throttled with `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`. OTP requests fail closed when configured email delivery cannot actually send the code; manual invitation links do not bypass email ownership verification.

DGFY account sessions are landlord-scoped and separate from tenant-local SKUpervisor JWTs. `/api/v1/dgfy/auth/handoff` issues a short-lived handoff token for redirected account flows; `/api/v1/dgfy/auth/handoff/exchange` converts it back into a normal DGFY JWT. Public DGFY auth and `/register-company` routes must not trigger tenant-session `/auth/refresh-token` recovery; an expired DGFY handoff must remain a DGFY sign-in recovery path, not a SKUpervisor tenant-session failure. `/api/v1/dgfy/auth/logout` blacklists only the DGFY account token.

Phone completion rollout is staged rather than globally forced while historical accounts are still unresolved:
- `PHONE_COMPLETION_ENFORCEMENT_MODE=observe` is the non-test default. Users see the remediation banner and admins see missing-phone rows, but normal authenticated work is not blocked yet.
- `PHONE_COMPLETION_ENFORCEMENT_MODE=tenant_allowlist` enforces only tenants named in `PHONE_COMPLETION_ENFORCED_TENANTS` (tenant IDs or company tokens). Use this only for tenants whose missing-phone count is already zero.
- `PHONE_COMPLETION_ENFORCEMENT_MODE=all` globally enforces the completion gate after closure evidence is clean.
- Where enforcement is active, `/api/v1/users/me` `GET` and `PUT` remain available so the user can inspect and complete their own profile, `/api/v1/auth/logout` remains available, and other authenticated tenant routes return `428 PHONE_NUMBER_REQUIRED` until the number is completed.
- A successful profile update clears the short-lived auth cache immediately, so the account can continue without waiting for cache expiry.
- Operator checks:
  - `npm run verify:phone-rollout` reports tenant and unresolved-user totals plus current enforcement mode.
  - `npm run verify:phone-rollout:users` prints the exact accepted active users still missing phone numbers for remediation work.
  - `npm run verify:phone-rollout:config-safe` fails if any currently enforced tenant still has missing phones or missing schema.
  - `npm run verify:phone-rollout:complete` remains the global rollout-closure gate and fails until every active accepted user has a stored phone number.

The `landlordService.js` functions handle mapping CRUD: `addEmailTenantMapping`, `removeEmailTenantMapping`, `updateEmailTenantMapping`, `findTenantsByEmail`.

---

## Company User Invitations

Master admins invite users from **Settings -> Company -> Manage Users**. The current invitation flow is token-first: new invitation links resolve tenant context from a landlord-level invitation registry and do not require `company_token` in the URL. Legacy links with `company` remain accepted only while their underlying tenant invite is still valid.

### Registry And Token Policy
- The landlord `UserInvitation` registry stores tenant ID, tenant user ID, email, role, token hash, expiry, delivery status, and lifecycle timestamps.
- New invitation tokens are stored as hashes. Raw tokens are exposed only for explicit admin manual-link actions.
- Legacy raw-token tenant rows are still supported during acceptance so old pending links can expire naturally.
- Resending or generating a manual link invalidates the previous token by replacing the token hash and expiry.

### Lifecycle
Invitation rows use these statuses:
- `pending`: invite has not been accepted yet.
- `accepted`: password setup succeeded and the user can log in.
- `expired`: expiry has passed; acceptance is blocked.
- `cancelled`: admin cancelled the invite; acceptance is blocked.

Pending, expired, and cancelled invitation rows are non-login rows and cannot be edited through role/status/permission/location-scope controls. Admins must resend, copy a fresh link, cancel, or wait for acceptance.

### Admin UX
The **Users** tab shows accepted users, including phone number when present and a missing-phone marker for accepted legacy rows. User search matches username, email, and phone number, and the **Missing Phone** filter isolates accepted legacy accounts that still need remediation before tenant-level enforcement is enabled for them. The **Pending Invitations** tab shows invite email, role, expiry, delivery state, inviter, and actions:
- Resend email
- Copy/generate manual link
- Cancel invitation

Invite creation supports:
- `delivery_mode=email`: attempts email delivery; returns manual-link recovery details if SMTP is missing or delivery fails.
- `delivery_mode=manual`: creates the invite and returns the manual link without attempting SMTP.
- Optional `location_ids`: invite-time location scope. Operational roles require explicit selection when multiple active locations exist; admin-like roles default to all active locations but remain editable before submission.

### Acceptance UX
`/accept-invite?token=<token>` validates the token without needing tenant context in the URL. Settings, AI user-management tooling, invitation email templates, resend, and manual-link recovery must not generate company-token registration links for tenant user onboarding. The page shows company, inviter, invite email, role, and expiry before password setup. The invited user must request an invitation-acceptance OTP from the same page and submit `email_otp_code` with the token, username, phone number, and password. The API resolves tenant context from `invitation_token` for token-only OTP requests, matching validation and acceptance behavior, and the frontend ignores legacy `company` / `companyToken` query parameters for registry-backed invite links. Successful acceptance returns the same usable auth shape as login (`user`, `token`, `expiresIn`, `company`), establishes refresh authority through HttpOnly session cookies, and immediately signs the invited user into the app.

If the invited email already belongs to a global DGFY account, invite creation also mirrors a pending DGFY membership. The invited user can sign in with their DGFY account, see the company invitation in the registration/account surface, and accept it without a registration link. Acceptance activates the tenant-local user row from the authenticated DGFY identity and keeps the tenant staff row separate from storefront customer records.

### Delivery And Recovery Status
The product handles SMTP/API unavailable or failed delivery as a first-class state and gives the admin a manual link for non-OTP invitation recovery.

Current verified status as of `2026-05-17`:
- Local Gmail SMTP is configured, but the saved credential fails with `EAUTH 535 BadCredentials`. Use a valid Gmail App Password for local/testing SMTP.
- Production is deployed at commit `064766a3c465ca398f2abd821eb8465b72e13e7c`; the landlord `email_otps` migration is applied.
- Production Brevo SMTP is verified with the Brevo SMTP login (`a1b722001@smtp-brevo.com`), active SMTP key, and `EMAIL_FROM=skupervisor@gmail.com`. Generic lifecycle emails keep the configured sender display name (`EMAIL_FROM_NAME`, default `SKUpervisor`), while OTP emails sent through `sendEmailOtpCode()` explicitly use the sender display name `DGFY` so email verification appears as DGFY without changing the authenticated SMTP mailbox. `npm run verify:email` passes, and `npm run verify:email -- --send-to skupervisor@gmail.com` sent a real message through provider `smtp`.
- Brevo HTTPS API delivery is supported through `BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_PROVIDER`, and `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`; production has the non-secret fallback keys present, but `BREVO_API_KEY` remains empty because SMTP is the verified active provider.
- Before enabling enforced OTP flows in any new environment, run `npm run verify:email` and then `npm run verify:email -- --send-to operator@example.com` from that environment.

Production email delivery is closed for the SMTP path. Manual-link invitation recovery remains available for non-OTP invitation sends, but email-ownership OTP flows now have a verified production delivery path and still fail closed if provider delivery fails.

---

## Admin Interface

Located at `/admin/tenants`.

**Features:**
- **List View**: Filter by status (Pending, Active, etc.).
- **Search/Filter**: Search is a first-class admin tool for large tenant lists. It matches company name, admin email, company token, status, plan, Customer Access Mode, and capability state, and shows the current result count beside the search box.
- **Quick Actions**: Approve, Reject, Edit, Delete.
- **Capability Controls**: IMS/POS controls are grouped as core workspace access, while Storefront/Maps visibility and Customer Access Mode are grouped as public Storefront controls. Changes open a confirmation modal and require a reason persisted to the platform-admin audit trail. Storefront/Maps shows readiness when the tenant is visible but lacks an active primary mapped location.
- **Capability Audit Trail**: Active tenant cards expose recent platform-admin capability changes from `GET /admin/tenants/:id/capabilities/audit-logs`, including actor, reason, timestamp, and before/after capability state.
- **Compliance Safety Guard**: `Force non-compliant` is available only when backend eligibility indicates allowed (`can_force_non_compliant=true`). For blocked states, UI uses server-provided `force_non_compliant_block_reason` to render disabled helper text.
- **Stats**: Total tenants, active vs pending counts.
