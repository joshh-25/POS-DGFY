---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-10-24
applies_to: tenant_management_and_plan_gating
topic: tenant_management
---

# Tenant Management System

## Overview

The SKU Inventory Manager uses a **Multi-Tenant Architecture** with **Database Isolation**. Each registered company (tenant) gets its own dedicated MySQL database, ensuring data privacy and security. The "Admin Portal" allows the Platform Owner (Superadmin) to manage these tenants.

## Tenant Lifecycle

### 1. Registration (Current Policy)
- **DGFY Account Requirement**: Public company registration requires a signed-in global DGFY account. DGFY account signup first sends a global `dgfy_account_verification` SMTP OTP to the submitted email and consumes that code before creating the account. The public OTP request and resend path do not require a company token and must ignore stale tenant cookies/headers, because DGFY account registration verifies only global OTP rows. The founder's email, phone, username seed, and password hash are derived server-side from the verified DGFY account.
- **DGFY Account Registration Order**: Account creation collects Last Name, First Name, Optional Middle Name, email, contact number, password, and confirm password in that order. Password and confirmation fields expose visibility toggles. The optional middle name is persisted as `dgfy_accounts.middle_name` and appears in DGFY profile/customer account surfaces when present.
- **Premium-Capable Account**: Every newly registered tenant persists `plan=premium` by default so mode-specific premium-gated surfaces are available after activation. The registration UI no longer displays a premium-capable widget.
- **Automatic Restricted Registration**: `auto_standard` is the default. Public company registration creates the landlord application and immutable attempt, then the system claims the application as approved/in-progress and provisions it in the background. The endpoint returns `202` with `setting_up_company`; it never discloses a company token or tenant session.
- **Applicant Status and POS Handoff**: The submitting DGFY account can view `/register-company/status/:applicationId` for review/provisioning state and failure details. After successful provisioning, the owner receives an email with the POS onboarding link. The link is an entry point only and does not bypass authenticated company selection.
- **Provider Subscription Onboarding**: Disabled for this phase. Requests that include provider subscription verification are rejected with `503` and `PAYMENTS_DISABLED`.
- **Founder Contact Requirement**: Public company registration uses the signed-in DGFY account phone number. The landlord tenant record stores it as `admin_phone`, and provisioning copies it into the founder/admin user's `phone_number`.
- **Founder Account Source**: Public company registration requires a signed-in active DGFY account. The company-registration path uses that already-verified account email as the founder email and does not show or require a separate DGFY email-code step after successful sign-in or storefront handoff. Future DGFY email-change work owns its own verification contract before a changed email can be treated as verified identity elsewhere.
- **Required Terms Acknowledgement**: DGFY account registration and public company registration both require current ToS/T&C acknowledgement loaded from `GET /api/v1/dgfy/legal-terms/current`. The account checkbox remains disabled until `terms_version`, `privacy_version`, and `marketplace_terms_version` are present; the company checkbox remains disabled until `company_terms_version` and `marketplace_terms_version` are present. The backend rejects missing, false, or stale acknowledgement with `422 TERMS_ACKNOWLEDGEMENT_REQUIRED`, fails closed when legal persistence is unavailable, and persists successful acknowledgement evidence in landlord `dgfy_legal_acknowledgements`.
- **Legal Evidence Atomicity**: DGFY account creation, invitation membership mirroring, and account acknowledgement evidence are written in one landlord transaction. Company registration checks legal-persistence availability before tenant creation; after confirming there is a signed-in active DGFY account, the landlord tenant row and company acknowledgement evidence are written in one landlord transaction before tenant provisioning.
- **Marketplace Provider Framing**: Registration copy must identify DGFY as an e-marketplace/platform service provider. The company remains seller of record, owns the product/service listing, sets prices, fulfills orders, handles customer obligations, and uses a registered business payout account. DGFY facilitates the transaction, uses a licensed payment partner, deducts disclosed fees, and remits the seller's net settlement; the product must not describe this as DGFY wallet points, cash-out credit, or DGFY reselling the merchant's goods.
- **Compliance Default**: Public company registration no longer asks for compliance mode. New companies start `non_compliant_active`; master admins can start compliance activation later in Settings > Compliance.
- **Password Requirement**: Account registration, invitation acceptance, and password changes require only a minimum password length of 8 characters. The UI offers a readable 16-character generator, but generated passwords are optional.
- **Phone Format**: Company admin phone numbers and user phone numbers are trimmed and must be 7-40 characters using digits, spaces, `+`, `-`, parentheses, and periods.
- **Provisioning Trigger**: Database provisioning starts automatically after the governed registration transaction claims the application. A failed provisioning attempt remains auditable and retryable; it must not leave a reusable partial tenant database.
- **Restricted Access Defaults**: Newly provisioned public-registration tenants seed `tenant_pos_enabled=false` and `store_is_visible=false`. The owner may complete POS onboarding and manage catalog items and categories only; selling, checkout, scanning, other operational POS pages, and the public storefront remain unavailable until Platform Admin enables the audited capabilities.
- **Storefront Handoff**: `Register Your Business` runs inside the signed-in DGFY/Storefront business-registration surface. A successful submission opens the owner-authorized status route using the returned `application_id`; the follow-up email contains the POS onboarding URL. Legacy one-time DGFY handoff tokens remain a compatibility path for cross-surface authentication, not an activation bypass.
- **Registration Draft Persistence**: Editable business, storefront, and schedule fields autosave to the authenticated account's server-side registration draft after a 700 ms idle debounce. A session-scoped recovery snapshot preserves recent field edits if the page refreshes or unmounts before that debounce fires; on reload, the wizard reconciles the snapshot with the latest server draft and retries saving recovered changes. The wizard also flushes pending field changes before step navigation, continuation, or submission, communicates saving/saved/failed states, and retains local edits with a retry action after failure. Recovery snapshots exclude legal consent evidence and file contents. Legal consent checkboxes remain separate submission evidence, and a selected map candidate is not persisted until the user explicitly adds it as a store location. Uploaded files continue to use the draft's upload/remove endpoints; replacing a profile or cover image swaps the active upload atomically so a failed replacement leaves the prior image staged.
- **Email Mapping**: Registration creates the founder email-to-tenant mapping so lookup can report setup state. Provisioning completes the active tenant-user and accepted-membership links before the onboarding email is sent.
- **Abuse Control**: Public company registration is IP rate-limited (`RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5` per `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000` by default in production). Keep this strict to protect landlord application creation and the later tenant-provisioning queue.

### Platform Admin Assisted Provisioning

Platform admin can create companies and DGFY accounts for merchant onboarding without using the public self-service OTP flow. This is a privileged admin path only:

- **DGFY account only**: creates an active DGFY account with `provisioning_status=admin_provisioned`, `temporary_password_active=true`, `email_verification_source=platform_admin_provisioned`, and a one-time temporary password returned only in the response. Phone remains unverified.
- **Company only**: creates and immediately provisions the tenant database with `provisioning_source=platform_admin` and `ownership_status=unassigned`. The tenant can be configured by platform staff, but no DGFY tenant session, POS unlock, company switch, or owner action is available until a DGFY owner is assigned.
- **DGFY + company**: creates the account, tenant, tenant-local master-admin authorization profile, explicit accepted membership, and `owner_dgfy_account_id` in the platform-admin flow.
- **Owner handover**: platform admin may force-assign ownership to an existing active DGFY account id. Handover must create/update explicit `DgfyAccountTenantMembership` state and audit the reason; tenant settings must not edit DGFY account email or password.

Public registration remains unchanged: public DGFY signup requires OTP and public company registration requires an authenticated DGFY account.

### Legacy Direct Tenant Login Grace

Direct tenant-local IMS/POS login remains only as a migration grace path for accepted existing users who do not yet have an accepted DGFY membership. The default grace deadline is June 17, 2027 through `LEGACY_TENANT_LOGIN_GRACE_END=2027-06-17` and `LEGACY_TENANT_LOGIN_GRACE_ENABLED=true`. Login, current-user, and Manage Users responses expose `dgfy_link_status`, `legacy_grace_expires_at`, `dgfy_membership_id`, `dgfy_account_id`, `can_legacy_login`, and `legacy_login_block_reason` so IMS/POS can show direct DGFY-linking reminders, admins can report unlinked accounts, and owner-transfer UI can target accepted linked members.

New non-DGFY business users are not allowed during the grace period. Direct tenant-user registration is blocked unless `DGFY_LEGACY_TENANT_REGISTRATION_ENABLED=true` is intentionally set for an emergency operator exception, and new invitations remain DGFY-account search/selection only. After June 17, 2027, unlinked legacy users are blocked from IMS/POS until they create or link a DGFY account.

Legacy link completion is hardened as a repairable landlord transaction after OTP verification: accepted membership state, founder ownership bootstrap, email-to-tenant mapping, and success audit complete together. If a landlord write fails, the link is not reported as successful and a `legacy_link_failed` business audit row records the repair context. DGFY POS unlock also writes separate attempt, success, and failure business audit events so no-access, permission-denied, terminal-registry, and hardware-adjacent warnings can be tracked independently during rollout. During the grace period, the DGFY-first POS drawer may fall back to the governed tenant-local login path when the submitted email is not yet a DGFY account or DGFY login returns `401`; that fallback still uses `/auth/lookup`, tenant-local password validation, POS permission checks, and explicit terminal identity before unlock.

### 2. Automatic Provisioning and Capability Gate (Active)
- In the default `auto_standard` mode, the system claims a valid public registration as approved and starts background tenant-database provisioning. `manual` remains an explicit rollback/admin-review mode.
- System performs **Provisioning**:
    1.  Generates a unique database name (must start with `sku_tenant_` for safety).
    2.  Creates the database.
    3.  Runs migrations to create all required tables (Items, Users, POs, etc.).
    4.  Seeds the default Admin User.
    5.  Seeds `tenant_pos_enabled=false` and `store_is_visible=false`.
    6.  Updates the tenant status to **Active** after the isolated database and founder membership are ready.
    7.  Sends the owner an email containing the POS onboarding link.
    8.  Keeps provisioning retryable if a step fails before completion.
- Onboarding email delivery is non-blocking after the durable provisioning transition. If SMTP fails, the tenant remains restricted and the delivery attempt remains auditable/retryable.
- Once the application status becomes `ready`, the owner uses the emailed POS link to authenticate and complete onboarding. The tenant master-admin row and accepted founder membership are created during provisioning; registration returns neither tenant auth tokens nor a company-token capability.
- Until Tenant Manager enables `pos_enabled`, the owner can manage catalog items and categories only. Checkout, scanning, selling, order/shift/terminal operations, and other POS operational pages remain unavailable.
- Until Tenant Manager enables `storefront_visible`, the tenant has no public storefront/discovery visibility. `pos_enabled` and `storefront_visible` are independent audited platform-admin capabilities.
- Tenant schema provisioning is mode-wide. The backend clones tenant-local models from the canonical model registry into each new tenant database while excluding landlord-only models, so Services, F&B, and future modes must add tenant-local tables through the same model graph.
- Provisioning failure cleanup is retry-safe for approval paths. If schema sync, seed data, storefront bootstrap, or email-adjacent setup fails before activation, the isolated database is dropped and the landlord tenant row is restored to a valid `pending` status instead of an out-of-enum temporary state. Future mode work must preserve this behavior.
- After first login, the tenant master admin sees the onboarding flow from ADR 0013. Public auto-registered owners may complete the catalog portion and create items/categories, but the restricted capability gate prevents selling and operational POS work until platform enablement. Storefront setup may be prepared privately but does not publish the storefront while `storefront_visible=false`.

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

Tenant-facing UX is reactive in-app messaging only. `TENANT_CAPABILITY_DISABLED` and `CUSTOMER_ACCESS_MODE_BLOCKED` responses normalize to the title `Platform admin changed your permissions` with exact IMS, POS, Storefront checkout, or Storefront mode impact copy. The shared IMS shell can show a tenant-wide notice after settings hydration or a blocked-action event; POS terminal layouts show POS-specific disabled-state copy; Storefront helpers show Map Listing Only, Catalog Only, and Inquiry Mode public-action limits. Tenant Manager confirmation modals preview the tenant/customer impact before the platform admin submits the required audit reason. This UX does not add email, notification-center records, new schema, or new permission semantics.

Current production status as of 2026-06-26:
- DGFY OTP-first account signup, global OTP scoping, no-company-token OTP request access, and automatic IMS tenant-session handoff are deployed at SHA `8b03dfea4f9615d665baa14df59a78de5c797a60`.
- Production remote `HEAD`, remote `origin/master`, and `.deploy-state/last_deployed_commit` matched that SHA at proof time; deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260610_234107.summary.txt` reports backend health, IMS, POS, Storefront, public endpoints, tenant-store asset integrity, frontend asset parity, tenant schema sync, tenant schema sync regression, tenant index headroom, permission backfill, Storefront discovery index reconciliation, and PM2 reload passing.
- The June 26, 2026 production runtime proof in this workspace is SHA `c375dd90f2db16d8ed924c0b10ecd653319e8b16`, recorded by `/var/www/skupervisor/logs/deploy/deploy_20260626_161139.summary.txt`, production remote `HEAD`, production `.deploy-state/last_deployed_commit`, and live `/api/v1/health.services.observability.runtime_sha`. That runtime includes platform-admin assisted provisioning: admin-created DGFY accounts, ownerless tenant provisioning, combined account+tenant provisioning, force owner assignment to an active DGFY account id, and Tenant Manager / DGFY Accounts admin UI panels. It also includes the batch registration handoff behavior: active company creation uses the DGFY account session to create an IMS tenant session and falls back to a visible manual-login path only if tenant-session creation fails; founder tenant-user linkage fallback for production raw-insert metadata; unique DGFY session token ids so immediate logout-then-login cannot reuse a blacklisted token; Storefront delivery-map blank-space hardening; canonical side-tracking-drawer cleanup; IMS storefront location map pinning reliability; PH-local reverse-geocode metadata; same-origin `/openfreemap` MapLibre resource routing; multi-interval Storefront business hours; Storefront discovery map pin-stability restore; and Storefront current-location map control restore, with live bundle/source inclusion verified after deployment. Controlled production DGFY business-registration UAT passed with evidence `.tmp/production-uat/dgfy-business-handoff/evidence-20260620054511.json`: the run created a QA DGFY account and company, proved `/api/v1/dgfy/auth/tenant-session` returned an IMS tenant token, proved a second tenant-session call was not rate-limited, verified founder membership/ownership linkage, and cleaned up the QA account, tenant, membership, legal acknowledgement rows, and tenant database. Future releases must keep exact QA deployed-head parity deterministic. The June 26 assisted-provisioning deploy used owner-authorized emergency bypass because QA deploy-summary SHA evidence was stale, then closed runtime parity through deploy summary, production remote `HEAD`, deploy marker, live health proof, and frontend asset parity.
- Local validation for the latest DGFY OTP hotfix included `npm --prefix backend test -- --runInBand tests/tenantHandler.emailOtp.test.js tests/authEmailOtpTenantScope.test.js tests/emailOtpService.test.js tests/dgfyAuthUseCases.test.js`, `npm run check:architecture`, `npm run check:compliance`, and `git diff --check`.
- Live proof after deployment showed `POST /api/v1/auth/email-otp/request` with purpose `dgfy_account_verification` and no company token no longer returns `TENANT_TOKEN_REQUIRED`; an intentionally invalid email returns normal request validation instead.

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
    status ENUM('pending', 'active', 'inactive', 'rejected', 'archived') DEFAULT 'pending',
    plan ENUM('standard', 'premium') DEFAULT 'premium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Backend uses `underscored: true` mapping in Sequelize to ensure snake_case
    -- model attributes (createdAt, updatedAt) map correctly to these columns.
);
```

This is the landlord database schema sketch: `company_token` is a stored routing credential and
`created_at` is the physical SQL column. The admin tenant-list API does not return `company_token`
and serializes the timestamp as `createdAt`; see the
[Platform Admin Tenant Console inventory](PLATFORM_ADMIN_TENANT_CONSOLE.md) for that response
contract.

### Routing Logic
1.  Frontend sends `x-company-token` header.
2.  Backend Middleware (`tenantMiddleware`) looks up the token in `Tenants` table.
3.  If found and Active, it establishes a connection to the specific `db_name`.
4.  All subsequent queries in that request use that connection.

## Email-to-Tenant Lookup

The `UserTenantMapping` table in the main DB maps email addresses to tenant IDs. This powers the login pre-screen: users enter their email and the system resolves which company (or companies) they belong to, returning the `company_token` without the user needing to memorize it.

`POST /api/v1/auth/lookup` is a pre-login identification endpoint. It remains rate-limited to reduce tenant enumeration risk, but it must not require CSRF even when the browser still carries stale HttpOnly session cookies from a previous login; otherwise users can be blocked before they can identify their company or enter a manual token. The lookup limiter is scoped by client IP plus normalized email, not IP alone, and defaults to a 5-minute retry window so shared store networks do not cross-throttle different POS cashiers while repeated lookup attempts for the same email remain controlled.

The credentialed IMS/DGFY login limiter also defaults to five attempts in a five-minute window, keyed by client IP plus normalized email. IMS and POS intentionally share that identity bucket so alternating surfaces cannot bypass brute-force protection. Login clients must use `Retry-After`, must not loop automatic retries, and must reset stale company/account state before a changed identity can submit. Public lookup does not preflight `/auth/refresh-token` and does not inherit stale tenant headers.

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
- Rate-limited to **5 requests per 5-minute window** in production (bypassed in `NODE_ENV=test`).
- Standalone POS terminal unlock uses this lookup before password validation. If lookup returns one tenant, POS logs in with that company token. If the current browser token is present, POS may reuse it only when it matches one of the lookup tenants. Multiple-tenant lookup blocks with an explicit operator instruction, and missing mappings or rate-limit responses must not silently fall back to an unrelated stale browser tenant. Fallback to the current browser token is reserved for transient lookup outages.

### Mapping management
Mappings are created automatically when:
1. A public company application is submitted, so pending lookup can resolve the applicant; active tenant-user linkage is completed only after approved provisioning succeeds
2. A user is invited and accepts their invitation through the tenant invitation flow or the DGFY invitation membership flow

Company-user registration, tenant invitation acceptance, and DGFY account registration now require a phone number and an email OTP. Public company registration derives phone and credentials from the authenticated DGFY account and does not ask for a separate company-registration email OTP or DGFY email-code step after sign-in. Existing accepted users created before this requirement can add or change their phone number from Settings > Profile. Settings rejects profile saves that would leave the resulting account phone blank or invalid, and the authenticated shell shows a remediation banner with a direct Profile link until the stored account phone is completed.

Email ownership checks are required before login identity is created or changed:
- `dgfy_account_verification`: requested before DGFY account registration creates the global account, and still available from the authenticated account surface for older unverified accounts.
- Company registration uses the signed-in DGFY account email directly and does not require a separate DGFY email-code step before `/admin/tenants/register`.
- `tenant_user_registration`: requested with tenant context before `/auth/register`.
- `invitation_acceptance`: requested from an invitation token before `/auth/accept-invite`.
- `email_change`: requested by the authenticated user before `PUT /users/me` changes the email.

OTP rows live in the landlord `email_otps` table. Codes are six digits, single-use, expire after `EMAIL_OTP_TTL_MINUTES` (default 10), lock after `EMAIL_OTP_MAX_ATTEMPTS` (default 5), and are consumed through a conditional update so concurrent accepts cannot reuse the same code. Production enables enforcement by default; `EMAIL_OTP_ENFORCEMENT_ENABLED=false` is the rollback switch. OTP request routes are throttled with `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`. OTP requests fail closed when configured email delivery cannot actually send the code; manual invitation links do not bypass email ownership verification.

DGFY account sessions are landlord-scoped and separate from tenant-local SKUpervisor JWTs. `/api/v1/dgfy/auth/handoff` issues a short-lived handoff token for redirected account flows; `/api/v1/dgfy/auth/handoff/exchange` converts it back into a normal DGFY JWT. Public DGFY auth and `/register-company` routes must not trigger tenant-session `/auth/refresh-token` recovery; an expired DGFY handoff must remain a DGFY sign-in recovery path, not a SKUpervisor tenant-session failure. `/api/v1/dgfy/auth/logout` blacklists only the DGFY account token. Frontend explicit sign-out additionally clears browser-readable DGFY/customer state and records a session-scoped suppression marker so cookie-backed `/dgfy/auth/me` rehydration does not immediately restore the account the user just signed out from.

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

Master admins invite users from **Settings -> Company -> Manage Users**. The current invitation flow is DGFY-account-first: admins search for an active registered DGFY account by email or phone, select the account, assign role and location scope, and send the invitation. New direct invitation links, manual-link recovery, and tenant-local password setup for invited business users are retired by default.

### Registry And Identity Policy
- The landlord `UserInvitation` registry stores tenant ID, tenant user ID, email, role, status, delivery status, and lifecycle timestamps for IMS visibility.
- The durable identity link is `DgfyAccountTenantMembership`; switching, acceptance, rejection, leave-company, ownership transfer, and POS unlock all require this membership.
- Tenant-local `users` rows are authorization profiles only. They store role, permissions, location scope, and audit actor mapping; they must not receive copied DGFY password hashes.
- Legacy raw-token tenant rows are blocked by default for new acceptance and may remain only as a safe compatibility error/redirect path while old invitations expire.

### Lifecycle
Invitation rows use these statuses:
- `pending`: invite has not been accepted yet.
- `accepted`: DGFY invitation acceptance succeeded and the user can access the tenant through DGFY membership.
- `declined`: invited DGFY account rejected the invitation.
- `expired`: expiry has passed; acceptance is blocked.
- `cancelled`: admin cancelled the invite; acceptance is blocked.

Pending, declined, expired, and cancelled invitation rows are non-login rows and cannot be edited through role/status/permission/location-scope controls. Admins can cancel pending invitations or create a new DGFY-account invitation after the prior invitation is closed.

### Admin UX
The **Users** tab shows accepted users, including phone number when present and a missing-phone marker for accepted legacy rows. User search matches username, email, and phone number, and the **Missing Phone** filter isolates accepted legacy accounts that still need remediation before tenant-level enforcement is enabled for them. Linked accepted members expose a transfer-ownership action for owner/master-admin flows; it opens a confirmation dialog, sends `dgfy_business_step_up`, and calls the DGFY owner-transfer endpoint. The backend remains authoritative: only the current owner can complete the transfer, and the target must be an accepted active DGFY member. The **Pending Invitations** tab shows invite email, role, expiry, delivery state, inviter, and lifecycle state. It does not expose or generate invite links. Pending rows can be cancelled; accepted, declined, expired, and cancelled rows are shown for tracking.

Invite creation supports:
- Search-only account targeting through rate-limited `GET /api/v1/dgfy/accounts/search?query=...`.
- Selected-account invitation through `POST /api/v1/dgfy/invitations` with `dgfy_account_id`, role or role preset, and optional `location_ids`.
- Email delivery plus DGFY in-account notification. If email delivery fails, the invite still appears in the invited account's Business area; no manual link is generated.
- Optional `location_ids`: invite-time location scope. Operational roles require explicit selection when multiple active locations exist; admin-like roles default to tenant scope but remain governed by admin hierarchy.

### Acceptance UX
`/accept-invite?token=<token>` is no longer the normal business-user onboarding path. New Settings, AI user-management tooling, invitation email templates, resend, and manual-link recovery must not generate direct invitation links. The compatibility route must be non-mutating by default and tell users to sign in with their registered DGFY account and open My Account -> Business.

Invited users sign in with DGFY, see pending invitations in My Account -> Business, and can accept or reject without a separate email verification code. Accept is authorized by the authenticated DGFY account plus the pending explicit membership row. Reject marks the membership and tenant invitation `declined` and audits the action. Successful acceptance activates the tenant authorization profile from the authenticated DGFY membership and does not create a separate tenant login password.

### Delivery And Recovery Status
The product handles SMTP/API unavailable or failed delivery as a first-class state, but recovery is through the DGFY in-account invitation notification, not a manual link.

Current verified status as of `2026-08-07` (issue #279 superseded the `2026-05-17` entry below, which described the Brevo-relay configuration that #135 found DMARC-blocked for Yahoo/iCloud):
- Production SMTP delivery is via Namecheap Private Email on the `dgfy.ph` domain, not Brevo -- see #135's Decision for why the cutover happened. Confirm the live `SMTP_HOST`/`EMAIL_FROM` values operationally with `npm run verify:email` in that environment; this doc intentionally does not restate secret-adjacent config values.
- The Brevo HTTPS API fallback path (`sendEmailViaBrevoApi`, `BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`) was **removed** in #279 -- it exercised zero production traffic and, being unauthenticated for our sending domain, would have failed DMARC the same way. `EMAIL_DELIVERY_PROVIDER` no longer has meaning; `getEmailProviderMode()` now returns only `smtp` or `unconfigured`. A send failure now throws with no fallback attempt.
- Every outbound send (not just OTPs) is now recorded in `email_delivery_logs`, and failures raise an operational alert -- see the #279 compliance impact declaration and ADR 0054 for the delivery-observability design.
- OTP emails sent through `sendEmailOtpCode()` still use the sender display name `DGFY`; generic lifecycle emails keep `EMAIL_FROM_NAME` (default `SKUpervisor`).
- Before enabling enforced OTP flows in any new environment, run `npm run verify:email` and then `npm run verify:email -- --send-to operator@example.com` from that environment.

<details>
<summary>Superseded `2026-05-17` entry (Brevo relay, pre-#135 cutover, pre-#279 removal)</summary>

- Local Gmail SMTP is configured, but the saved credential fails with `EAUTH 535 BadCredentials`. Use a valid Gmail App Password for local/testing SMTP.
- Production is deployed at commit `064766a3c465ca398f2abd821eb8465b72e13e7c`; the landlord `email_otps` migration is applied.
- Production Brevo SMTP is verified with the Brevo SMTP login (`a1b722001@smtp-brevo.com`), active SMTP key, and `EMAIL_FROM=skupervisor@gmail.com`. Generic lifecycle emails keep the configured sender display name (`EMAIL_FROM_NAME`, default `SKUpervisor`), while OTP emails sent through `sendEmailOtpCode()` explicitly use the sender display name `DGFY` so email verification appears as DGFY without changing the authenticated SMTP mailbox. `npm run verify:email` passes, and `npm run verify:email -- --send-to skupervisor@gmail.com` sent a real message through provider `smtp`.
- Brevo HTTPS API delivery is supported through `BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_PROVIDER`, and `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`; production has the non-secret fallback keys present, but `BREVO_API_KEY` remains empty because SMTP is the verified active provider.

</details>

Production email delivery is closed for the SMTP path. DGFY in-account invitation recovery remains available when email delivery fails, but email-ownership OTP flows now have a verified production delivery path and still fail closed if provider delivery fails.

---

## Admin Interface

Located at `/admin/tenants`.

The current-state action inventory and the next-slice search, filter, URL, and section contracts
are recorded in the [Platform Admin Tenant Console inventory](PLATFORM_ADMIN_TENANT_CONSOLE.md).

Platform-admin assisted provisioning exposes only `Company only` and `DGFY + Company` on this route; the redundant legacy `+ Add Tenant` control is removed. `Company only` remains operationally provisioned but cannot use DGFY login, company switching, owner actions, or POS access until owner assignment creates an accepted membership.

Assisted provisioning retries are identity-bound and fail-closed. A matching pending platform-admin tenant may resume database provisioning without creating a second tenant or database. For combined provisioning, an active tenant with the exact linked admin-provisioned account may resume only when accepted membership assignment is incomplete; this reconciliation skips database provisioning and repairs the tenant-local master-admin/membership link. Other duplicates remain conflicts. Partial failures return the failed phase, retained record identifiers, and `retryable=true` instead of a generic success response.

**Features:**
- **List View**: The current status buttons are All, Pending, Active, and Rejected. The API also stores Inactive and Archived tenants, but the current directory has no filter button for either status. The agreed Archived-only filter and default-hidden behavior are defined in the inventory above.
- **Search/Filter**: Search is a first-class admin tool for large tenant lists. The next directory slice's agreed search contract matches tenant identity fields; see the [agreed search and filter field set](PLATFORM_ADMIN_TENANT_CONSOLE.md#search-and-filter-contract) for the exact fields and structured filters. The current result count appears beside the search box.
- **Quick Actions**: Pending tenants expose Approve, Reject, and Retry setup; inactive tenants can be reactivated; tenant cards also expose status edit and delete actions. Confirmations and reason requirements vary by action and are listed in the inventory.
- **Registration review**: Tenant cards can open registration details, list and download registration files, and revoke an uploaded file. Submitted registration drafts have a separate review queue because no tenant row exists until materialization.
- **Capability Controls**: IMS/POS controls are grouped as core workspace access, while Storefront/Maps visibility, customer access, and platform-controlled allowances are grouped as public Storefront controls. Changes open a confirmation modal, preview the impact, and require a reason persisted to the tenant admin audit trail. Storefront/Maps shows readiness when the tenant is visible but lacks an active primary mapped location.
- **Tenant Impact Preview**: Capability confirmation modals show the tenant/customer-facing consequence before the platform admin submits the audit reason, using the same "Platform admin changed your permissions" copy that tenants see for disabled IMS/POS access or downgraded Storefront modes.
- **Capability Audit Trail**: Active tenant cards expose recent platform-admin capability changes from `GET /admin/tenants/:id/capabilities/audit-logs`, including actor, reason, timestamp, and before/after capability state.
- **Compliance Lifecycle Control**: Tenant cards expose exactly one backend-authoritative compliance action from `admin_compliance_mode_action`: set the mode for legacy/no-mode tenants, move `non_compliant_active` tenants to `compliant_pending`, or force `compliant_pending` / `compliant_active` tenants back to `non_compliant_active`. Each action opens a confirmation modal with the POS/fiscal effect and requires a reason for immutable audit evidence. Artifact/peripheral verification and security incident actions also write compliance audit events.
- **Compliance Safety Guard**: `Force non-compliant` remains available only when backend eligibility indicates allowed (`can_force_non_compliant=true`). For blocked states, UI uses server-provided helper text to render the disabled reason. Moving a tenant toward compliance never bypasses fiscal readiness: Platform Admin can move the tenant to `compliant_pending`, while `compliant_active` still requires the normal checklist activation flow.
- **Stats**: The current tiles show Total, Pending, Active, and Rejected counts from the set loaded for the selected status filter. The agreed directory contract requires whole-set counts, including Archived tenants, independent of the visible filter/search subset.
- **Assisted provisioning**: Company-only and DGFY-plus-company creation currently share an inline form on the directory. The agreed next slice moves it to `/admin/tenants/new`, keeps the required reason, and preserves the additional `admin.dgfy_accounts` grant for the combined path.
- **Archived tenant presentation**: The current All view can include archived rows, but there is no dedicated Archived button or label. The agreed contract hides archived rows from the default list, exposes an Archived filter, and presents a directly opened archived detail page as read-only; current API write guards are documented in the inventory.

### Tenant Schema Sync Caveat

Tenant schema sync is expected to remain zero-failure because `backend/config/deploy/tenant-schema-sync-failure-baseline.json` is intentionally empty. The June 15 POS remediation isolated four older/test-like active tenant databases with foreign-key drift during `alter` mode. That drift is not part of the compliance lifecycle switch and must be handled as an ops/schema-health slice:

1. Classify each affected tenant as real/customer or abandoned/test data.
2. Repair customer tenant FK/schema drift with tenant-specific idempotent remediation.
3. Deactivate/archive abandoned test tenants deliberately before relying on exclusion from active-tenant sync.
4. Do not add failures to the baseline unless there is an explicit accepted-risk decision.
5. Validate with `node backend/scripts/sync-tenant-schemas.js --mode alter --report-file <path>` and `node backend/scripts/check-tenant-schema-sync-regressions.js --report-file <path> --baseline-file backend/config/deploy/tenant-schema-sync-failure-baseline.json --require-zero`.
