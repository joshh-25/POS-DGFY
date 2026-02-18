# Tenant Management System

## Overview

The SKU Inventory Manager uses a **Multi-Tenant Architecture** with **Database Isolation**. Each registered company (tenant) gets its own dedicated MySQL database, ensuring data privacy and security. The "Admin Portal" allows the Platform Owner (Superadmin) to manage these tenants.

## Tenant Lifecycle

### 1. Registration (Pending vs. Instant)
- **Standard Account**: Uses the traditional "Pending" flow. User fills registration -> Record created as `pending` -> Awaits Admin approval.
- **Premium Account (PayPal)**: Uses the **Instant Approval** flow.
    1. User selects Premium and completes PayPal payment.
    2. System verifies subscription (via backend service).
    3. If verified, the system triggers **Immediate Provisioning** (bypasses Pending state).
    4. User is automatically logged in and redirected to their new Dashboard.
    5. Database is created and seeded in real-time.
- **Mocking (Dev)**: In development, setting `MOCK_PAYPAL=true` in `backend/.env` allows bypassing real payment verification.

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

## Subscription Plans

Tenants can be assigned a plan, which can be toggled by the Admin via the Admin Portal.

- **Standard**: Core features (Inventory, Suppliers, Purchase/Job Orders, Reports, Settings).
- **Premium**: All Standard features + AI Chat Assistant, AI Demand Forecasting.
- **Enterprise**: Reserved for future expansion.

### Feature Gating

| Feature | Standard | Premium |
|---------|:--------:|:-------:|
| Dashboard & Stats | ✅ | ✅ |
| Items / Suppliers / Orders | ✅ | ✅ |
| Stock Movements & Reports | ✅ | ✅ |
| Settings & User Management | ✅ | ✅ |
| **AI Chat Assistant** | ❌ (upgrade prompt) | ✅ |
| **AI Demand Forecasting** | ❌ (upgrade prompt) | ✅ |

### Gating Implementation
- **Frontend**: `PermissionContext.jsx` exposes `tenantPlan` from the user's company record. Components check `tenantPlan === 'premium'` to show/hide premium features.
- **Backend**: AI endpoints (`/api/v1/ai/chat`, `/api/v1/forecast/*`) return `403` for non-premium tenants.

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Routing Logic
1.  Frontend sends `x-company-token` header.
2.  Backend Middleware (`tenantMiddleware`) looks up the token in `Tenants` table.
3.  If found and Active, it establishes a connection to the specific `db_name`.
4.  All subsequent queries in that request use that connection.

## Admin Interface

Located at `/admin/tenants`.

**Features:**
- **List View**: Filter by status (Pending, Active, etc.).
- **Search/Filter**: Quickly find companies.
- **Quick Actions**: Approve, Reject, Edit, Delete.
- **Stats**: Total tenants, active vs pending counts.
