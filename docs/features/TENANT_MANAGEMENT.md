---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-30
applies_to: tenant_management_and_plan_gating
topic: tenant_management
---

# Tenant Management System

## Overview

The SKU Inventory Manager uses a **Multi-Tenant Architecture** with **Database Isolation**. Each registered company (tenant) gets its own dedicated MySQL database, ensuring data privacy and security. The "Admin Portal" allows the Platform Owner (Superadmin) to manage these tenants.

## Tenant Lifecycle

### 1. Registration (Current Policy)
- **Standard Account**: Uses the traditional pending flow. User submits registration -> record is created as `pending` -> awaits Admin approval.
- **Premium/Subscription Onboarding**: Disabled for this phase. Requests that require subscription verification are rejected with `503` and `PAYMENTS_DISABLED`.
- **Provisioning Trigger**: Database provisioning runs only after explicit admin approval for standard onboarding.

### 2. Approval & Provisioning (Active)
- Admin clicks **Approve** in the Tenant Manager (for Standard accounts).
- System performs **Provisioning**:
    1.  Generates a unique database name (must start with `sku_tenant_` for safety).
    2.  Creates the database.
    3.  Runs migrations to create all required tables (Items, Users, POs, etc.).
    4.  Seeds the default Admin User.
    5.  Updates status to **Active**.
    6.  Sends specific email with login credentials.

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
- **Legacy Note**: Databases created with non-standard naming conventions (e.g., `tenant_standard`) cannot be deleted via the UI and require manual script intervention.

## Subscription Plans (Current Policy)

Tenants still store plan metadata, but billing/subscription workflows are hard-disabled in this phase.

- **Standard**: Core features (Inventory, Suppliers, Purchase/Job Orders, Reports, Settings).
- **Premium**: Reserved plan tier metadata for gated features.
- **Enterprise**: Reserved for future expansion.

Current policy notes:
1. Payment/subscription endpoints return `503` with `PAYMENTS_DISABLED`.
2. Legacy billing admin actions (`/admin/tenants/:id/change-plan`, billing setup) are disabled while billing is paused.
3. Admin can still edit tenant `plan` metadata in Tenant Manager via `PUT /admin/tenants/:id` as an operational override.
4. Premium registration via provider verification is disabled.
5. Premium route gates in billing-paused mode are plan-driven (`plan === premium`); live subscription-status enforcement is only applied when `PAYMENTS_ENABLED=true`.

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
    plan ENUM('standard', 'premium') DEFAULT 'standard',
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
The **Users** tab shows accepted users. The **Pending Invitations** tab shows invite email, role, expiry, delivery state, inviter, and actions:
- Resend email
- Copy/generate manual link
- Cancel invitation

Invite creation supports:
- `delivery_mode=email`: attempts email delivery; returns manual-link recovery details if SMTP is missing or delivery fails.
- `delivery_mode=manual`: creates the invite and returns the manual link without attempting SMTP.
- Optional `location_ids`: invite-time location scope. Operational roles require explicit selection when multiple active locations exist; admin-like roles default to all active locations but remain editable before submission.

### Acceptance UX
`/accept-invite?token=<token>` validates the token without needing tenant context in the URL. The page shows company, inviter, invite email, role, and expiry before password setup. Successful acceptance returns the same usable auth shape as login (`user`, `token`, `refreshToken`, `expiresIn`, `company`) and immediately signs the invited user into the app.

### Delivery And Recovery Caveat
The product handles SMTP unavailable or failed delivery as a first-class state and gives the admin a manual link. Real SMTP success still depends on valid provider credentials in the deployed environment.

---

## Admin Interface

Located at `/admin/tenants`.

**Features:**
- **List View**: Filter by status (Pending, Active, etc.).
- **Search/Filter**: Quickly find companies.
- **Quick Actions**: Approve, Reject, Edit, Delete.
- **Compliance Safety Guard**: `Force non-compliant` is available only when backend eligibility indicates allowed (`can_force_non_compliant=true`). For blocked states, UI uses server-provided `force_non_compliant_block_reason` to render disabled helper text.
- **Stats**: Total tenants, active vs pending counts.
