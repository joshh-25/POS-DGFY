---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-05-09
applies_to: tenant_management_and_plan_gating
topic: tenant_management
---

# Tenant Management System

## Overview

The SKU Inventory Manager uses a **Multi-Tenant Architecture** with **Database Isolation**. Each registered company (tenant) gets its own dedicated MySQL database, ensuring data privacy and security. The "Admin Portal" allows the Platform Owner (Superadmin) to manage these tenants.

## Tenant Lifecycle

### 1. Registration (Current Policy)
- **Premium-Capable Account**: Every newly registered tenant persists `plan=premium` by default so mode-specific premium-gated surfaces are available after approval/activation.
- **Manual Approval Mode**: Defaults to the traditional pending flow. User submits registration -> record is created as `pending` -> awaits Admin approval.
- **Temporary Auto-Accept Mode**: When `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard`, manual registrations are immediately provisioned, activated, and the registration UI signs the founder in through the normal login API. `manual` remains the default and rollback mode.
- **Provider Subscription Onboarding**: Disabled for this phase. Requests that include provider subscription verification are rejected with `503` and `PAYMENTS_DISABLED`.
- **Founder Contact Requirement**: Public company registration requires an admin phone number. The landlord tenant record stores it as `admin_phone`, and provisioning copies it into the founder/admin user's `phone_number`.
- **Founder Email Verification**: Public company registration requires a single-use email OTP for `adminEmail` before any tenant request is created. The registration page includes Send Code/Resend Code controls, requests the code through `POST /api/v1/auth/email-otp/request` with `purpose=company_registration`, and submits it as `email_otp_code`.
- **Phone Format**: Company admin phone numbers and user phone numbers are trimmed and must be 7-40 characters using digits, spaces, `+`, `-`, parentheses, and periods.
- **Provisioning Trigger**: Database provisioning runs after explicit admin approval in `manual` mode, or during public registration in `auto_standard` mode.
- **Email Mapping**: Manual pending registrations create the founder email-to-tenant mapping at registration time so lookup can show pending status. Auto-provisioned registrations leave mapping creation to the provisioning path so the mapping is written only after tenant activation succeeds.
- **Abuse Control**: Public company registration is IP rate-limited (`RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5` per `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000` by default in production). Keep this strict when `auto_standard` is enabled because accepted registrations create tenant databases.

### 2. Approval & Provisioning (Active)
- Admin clicks **Approve** in the Tenant Manager (for pending premium-capable accounts) or the public registration use case auto-accepts a manual registration when `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard`.
- System performs **Provisioning**:
    1.  Generates a unique database name (must start with `sku_tenant_` for safety).
    2.  Creates the database.
    3.  Runs migrations to create all required tables (Items, Users, POs, etc.).
    4.  Seeds the default Admin User.
    5.  Updates status to **Active**.
    6.  Sends specific email with login credentials.
    7.  Keeps approval retryable if provisioning fails before activation.
- Approval email delivery is non-blocking after successful provisioning. If SMTP fails, the active registration response still succeeds with `email_sent=false`, and the founder can continue through in-app auto-login or manual login fallback.
- Auto-login is implemented as a frontend follow-up call to the normal `/auth/login` API using the just-submitted registration password in component state. The registration response does not return auth tokens and the password is not stored for handoff.
- If the follow-up auto-login call fails after activation, the tenant remains active and the UI routes the founder to manual sign-in with email and company token prefilled.
- Tenant schema provisioning is mode-wide. The backend clones tenant-local models from the canonical model registry into each new tenant database while excluding landlord-only models, so Services, F&B, and future modes must add tenant-local tables through the same model graph.
- Provisioning failure cleanup is retry-safe for approval paths. If schema sync, seed data, storefront bootstrap, or email-adjacent setup fails before activation, the isolated database is dropped and the landlord tenant row is restored to a valid `pending` status instead of an out-of-enum temporary state. Future mode work must preserve this behavior.

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
1. A company is registered (founder email is mapped)
2. A user is invited and accepts their invitation

Company-user registration and invitation acceptance now require a phone number and an email OTP. Existing accepted users created before this requirement can add or change their phone number from Settings > Profile. Settings rejects profile saves that would leave the resulting account phone blank or invalid, and the authenticated shell shows a remediation banner with a direct Profile link until the stored account phone is completed.

Email ownership checks are required before login identity is created or changed:
- `company_registration`: requested publicly for the founder/admin email before `/admin/tenants/register`.
- `tenant_user_registration`: requested with tenant context before `/auth/register`.
- `invitation_acceptance`: requested from an invitation token before `/auth/accept-invite`.
- `email_change`: requested by the authenticated user before `PUT /users/me` changes the email.

OTP rows live in the landlord `email_otps` table. Codes are six digits, single-use, expire after `EMAIL_OTP_TTL_MINUTES` (default 10), lock after `EMAIL_OTP_MAX_ATTEMPTS` (default 5), and are consumed through a conditional update so concurrent accepts cannot reuse the same code. Production enables enforcement by default; `EMAIL_OTP_ENFORCEMENT_ENABLED=false` is the rollback switch. OTP request routes are throttled with `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`. OTP requests fail closed when configured email delivery cannot actually send the code; manual invitation links do not bypass email ownership verification.

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
`/accept-invite?token=<token>` validates the token without needing tenant context in the URL. The page shows company, inviter, invite email, role, and expiry before password setup. The invited user must request an invitation-acceptance OTP from the same page and submit `email_otp_code` with the token, username, phone number, and password. The API resolves tenant context from `invitation_token` for token-only OTP requests, matching validation and acceptance behavior. Successful acceptance returns the same usable auth shape as login (`user`, `token`, `refreshToken`, `expiresIn`, `company`) and immediately signs the invited user into the app.

### Delivery And Recovery Status
The product handles SMTP/API unavailable or failed delivery as a first-class state and gives the admin a manual link for non-OTP invitation recovery.

Current verified status as of `2026-05-17`:
- Local Gmail SMTP is configured, but the saved credential fails with `EAUTH 535 BadCredentials`. Use a valid Gmail App Password for local/testing SMTP.
- Production previously timed out to `smtp-relay.brevo.com` on ports `587`, `2525`, and `465`.
- Brevo HTTPS API delivery is supported through `BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_PROVIDER`, and `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`.
- Before enabling enforced OTP flows in production, run `npm run verify:email` and then `npm run verify:email -- --send-to operator@example.com` from a production-equivalent shell.

Production email delivery can be closed out by either unblocking Brevo SMTP at the provider/network level or configuring Brevo HTTPS API delivery with a valid API key and verified `EMAIL_FROM` sender. Until then, manual-link invitation recovery remains available for non-OTP invitation sends, but email-ownership OTP flows are not production-ready because they must fail closed when the code cannot be delivered.

---

## Admin Interface

Located at `/admin/tenants`.

**Features:**
- **List View**: Filter by status (Pending, Active, etc.).
- **Search/Filter**: Quickly find companies.
- **Quick Actions**: Approve, Reject, Edit, Delete.
- **Compliance Safety Guard**: `Force non-compliant` is available only when backend eligibility indicates allowed (`can_force_non_compliant=true`). For blocked states, UI uses server-provided `force_non_compliant_block_reason` to render disabled helper text.
- **Stats**: Total tenants, active vs pending counts.
