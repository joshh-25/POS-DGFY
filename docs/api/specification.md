# API Specification & Frontend-Backend Integration Plan

## Table of Contents

> **Navigation Tip:** Click a section link to jump directly to that part of the API documentation.

### API Reference
- [API Overview](#api-overview)
- [Authentication Endpoints](#authentication-endpoints)
- [User Management Endpoints](#user-management-endpoints)
- [Items (SKU Master) Endpoints](#items-sku-master-endpoints)
- [Suppliers Endpoints](#suppliers-endpoints)
- [Purchase Orders Endpoints](#purchase-orders-endpoints)
- [Job Orders Endpoints](#job-orders-endpoints)
- [Stock Movements Endpoints](#stock-movements-endpoints)
- [Dispatch Orders Endpoints](#dispatch-orders-endpoints)
- [POS Endpoints](#pos-endpoints)
- [Food & Beverage Endpoints](#food--beverage-endpoints)
- [Storefront Hospitality Endpoints](#storefront-hospitality-endpoints)
- [Hospitality Admin Endpoints](#hospitality-admin-endpoints)
- [Unified Sales Endpoints](#unified-sales-endpoints)
- [Reports Endpoints](#reports-endpoints)
- [AI Assistant Endpoints](#ai-assistant-endpoints)
- [Admin Tenant Management Endpoints](#admin-tenant-management-endpoints)

### Integration
- [Frontend-Backend Integration Points](#frontend-backend-integration-points)
- [Data Synchronization Strategy](#data-synchronization-strategy)
- [API Rate Limiting](#api-rate-limiting)
- [Security Considerations](#security-considerations)

---

# API Specification & Frontend-Backend Integration Plan

## API Overview

### Base URL
```
Development: http://localhost:5000/api/v1
Production: https://api.sku-inventory.com/api/v1
```

### API Version
- Current Version: v1
- Versioning Strategy: URL-based versioning (/api/v1, /api/v2, etc.)

### Authentication
- **Method**: short-lived JWT access token in memory + HttpOnly browser session cookies
- **Auth Header**: `Authorization: Bearer <token>` for the in-memory access token
- **Tenant Context**: browser sessions receive an HttpOnly tenant context cookie; public tenant-entry requests may still send `x-company-token`
- **Token Expiry**: access tokens are short-lived bootstrap credentials; refresh/session authority is cookie-backed
- **Refresh Token**: 7 days, rotated server-side and stored in an HttpOnly cookie for browser clients
- **CSRF**: cookie-authenticated unsafe requests must send `x-csrf-token` matching the `sku_csrf_token` cookie

### Response Format
All responses follow a consistent JSON structure:

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": null
}
```

### Error Responses
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 204 | No Content - Successful but no content |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 500 | Internal Server Error |

### Soft Delete Contract (Manual-Only)
- Applies to `items`, `suppliers`, and `users`.
- Records are retained with audit fields (`deleted_at`, `deleted_by`), not physically removed.
- Default API resource behavior for soft-deleted targets is `404 Not Found`.
- `410 Gone` is reserved for future privileged admin/audit endpoints and is not used by default routes.
- Authentication/session checks for removed users may return `401` (account no longer allowed to authenticate).

---

## Authentication & Multi-Tenancy

### Multi-Tenant Header Requirement
All API requests (except for root `/admin` registration) must include the `x-company-token` header. This token determines which isolated database context is used for the request.

---

## Authentication Endpoints

### POST /auth/register
Register a new user

`phone_number` and `email_otp_code` are required for new company-user registrations. Values are trimmed and must be 7-40 characters using only digits, spaces, `+`, `-`, parentheses, and periods. Admin user onboarding must use the tenant user invitation endpoints; Settings and AI tooling no longer generate company-token registration links.

Passwords only require a minimum length of 8 characters. The registration UI can generate a readable 16-character password, but users may enter any password that meets the minimum length.

**Request**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "phone_number": "+63 912 345 6789",
  "password": "abcdefgh",
  "email_otp_code": "123456"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "phone_number": "+63 912 345 6789",
    "role": "staff"
  },
  "message": "User registered successfully"
}
```

### POST /auth/email-otp/request
Request a one-time email verification code for public account-entry flows. Email delivery must succeed; this endpoint fails closed when SMTP/Brevo API delivery is unavailable or provider authentication fails. Requests are OTP-rate-limited with `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`.

Supported purposes:
- `company_registration`: body requires `email`; retained for compatibility with older flows, but current DGFY company registration uses the signed-in DGFY account directly and does not ask for this second OTP.
- `tenant_user_registration`: body requires `email` and a tenant context (`x-company-token`).
- `invitation_acceptance`: body requires `invitation_token`; the backend resolves tenant context and invited email from the invitation when `x-company-token` is absent.
- `dgfy_account_verification`: body requires `email` for DGFY account registration before account creation. The public request is landlord-global, does not require a company token, and must ignore stale browser tenant context because `/dgfy/auth/register` verifies only a global OTP. Existing signed-in accounts can also request this purpose through the authenticated DGFY account endpoint.
- `dgfy_password_reset`: requested through the DGFY password recovery flow before changing a global DGFY account password.
- `dgfy_business_step_up`: requested through the authenticated DGFY business-management surface for owner-sensitive actions such as ownership transfer. Routine invitation accept/reject and company switch/open-inventory actions do not send or require this OTP.
- `dgfy_legacy_link`: requested from an authenticated legacy IMS/POS tenant session before linking that tenant-local authorization profile to a DGFY account during the migration grace period.

Codes are six digits, single-use, expire after `EMAIL_OTP_TTL_MINUTES` (default 10), lock after `EMAIL_OTP_MAX_ATTEMPTS` (default 5), and are consumed with a conditional update so a concurrently submitted request cannot reuse a code after it is consumed. Production enables enforcement by default; `EMAIL_OTP_ENFORCEMENT_ENABLED=false` is the rollback switch.

**Request**
```json
{
  "purpose": "tenant_user_registration",
  "email": "staff@acme.com"
}
```

**Request (invitation acceptance)**
```json
{
  "purpose": "invitation_acceptance",
  "invitation_token": "64-character-invitation-token"
}
```

**Response (202)**
```json
{
  "success": true,
  "data": {
    "otp_id": "uuid",
    "purpose": "tenant_user_registration",
    "email": "staff@acme.com",
    "expires_at": "2026-05-17T04:20:00.000Z",
    "delivery_status": "sent"
  },
  "message": "Email verification code sent"
}
```

### POST /auth/login
Authenticate user and establish a browser session.

Tenant-local login remains selected by the `x-company-token` request header. Standalone POS terminal unlock must first call `POST /api/v1/auth/lookup` for the submitted email and then send `/auth/login` with the resolved company token. The current browser company token may be reused only when it is one of the lookup tenants, or as a temporary fallback when lookup fails because of a network/server outage. Missing email-to-tenant mapping, multiple-tenant ambiguity, lookup rate limiting, and invalid password must remain distinguishable operator outcomes. Lookup rate limiting is scoped by client IP plus normalized email, defaults to a 5-minute retry window, and returns retry metadata so POS can tell the operator when to try again without falling back to stale tenant context.

**Request**
```json
{
  "email": "john@example.com",
  "password": "abcdefgh"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "phone_number": "+63 912 345 6789",
    "role": "staff",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400,
    "company": {
      "id": "tenant-uuid",
      "name": "Acme Store",
      "token": "token-acme-123"
    }
  },
  "message": "Login successful"
}
```

Browser responses set HttpOnly `sku_refresh_token` and `sku_tenant_context` cookies plus the browser-readable `sku_csrf_token` cookie. The refresh token is not returned in JSON. Tenant login responses include `data.company.token` so browser clients can keep tenant context in memory without persisting it in browser-readable storage.

### POST /auth/refresh-token
Refresh the in-memory access token using the HttpOnly browser session cookie.

Browser refresh authority is the HttpOnly `sku_refresh_token` cookie. If `sku_tenant_context` or `x-company-token` is missing, the backend may recover tenant context by verifying the signed refresh cookie, reading its `tenant_id`, and resolving the landlord tenant before running refresh-token rotation. Invalid, expired, tenant-less, tenant-mismatched, blacklisted, or inactive-user refresh attempts fail through the normal auth error path. The refresh token is never accepted as browser-readable JSON authority and is never returned in the response body. Successful tenant refresh responses include `data.company.token` when tenant context is available so browser clients can restore the in-memory company-token header after hard reload.

**Request**
```json
{}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400,
    "company": {
      "id": "tenant-uuid",
      "name": "Acme Store",
      "token": "token-acme-123"
    }
  }
}
```

### POST /auth/logout
Logout user (invalidate tokens)

**Response (200)**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### POST /auth/accept-invite
Accept an invitation and create the user account. Token-only links are the active browser contract. The backend resolves tenant context from the invitation registry; the frontend invitation page does not forward `company` or `companyToken` URL parameters as tenant context. New invite acceptances must include `phone_number` and an `email_otp_code` sent to the invited email.

`phone_number` follows the same account-phone validation contract as `/auth/register`.

Passwords only require a minimum length of 8 characters. The invitation-acceptance UI can generate a readable 16-character password and fills both password fields when it does.

**Request**
```json
{
  "token": "64-character-invitation-token",
  "username": "jane_staff",
  "phone_number": "+63 912 345 6789",
  "password": "abcdefgh",
  "email_otp_code": "123456"
}
```

Successful responses include the usable login shape: `user`, `token`, `expiresIn`, and `company`. Browser responses establish refresh authority through HttpOnly session cookies and do not return `refreshToken` in JSON.

---

## User Management Endpoints

### GET /users/me
Get current authenticated user profile

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "phone_number": "+63 912 345 6789",
    "role": "admin",
    "role_preset_key": "food_manufacturing_admin",
    "role_preset_label": "Food Manufacturing Admin",
    "role_preset_status": "current",
    "is_active": true,
    "permissions": ["items:view", "items:create"],
    "is_master_admin": true,
    "last_login": "2024-01-15T10:00:00Z"
  }
}
```

### PUT /users/me
Update the current authenticated user's profile-level account details. Existing users may add or change `phone_number` here after login. Email changes require an `email_otp_code` sent to the new email before the email and landlord lookup mapping are updated. When profile identity fields are updated, the resulting profile must keep a non-empty valid `phone_number`; sending an empty phone number is rejected with `422`. The authenticated shell surfaces a remediation prompt for accepted legacy users whose stored account phone is still blank.

Phone-completion enforcement is controlled by `PHONE_COMPLETION_ENFORCEMENT_MODE`:
- `observe` is the non-test default and does not block historical users yet.
- `tenant_allowlist` enforces only tenants listed in `PHONE_COMPLETION_ENFORCED_TENANTS` by tenant ID or company token.
- `all` enforces globally after rollout closure is complete.

When enforcement is active for a tenant, accepted legacy users with a blank stored `phone_number` are restricted after login until they complete this field. During that state:
- `GET /users/me`, `PUT /users/me`, and `POST /auth/logout` remain available.
- Other authenticated tenant routes return:

```json
{
  "success": false,
  "data": null,
  "message": "Phone number is required before continuing.",
  "error_code": "PHONE_NUMBER_REQUIRED",
  "errors": {
    "remediation": "Update your phone number in Settings > Profile."
  }
}
```

The frontend redirects this response to `/settings?tab=profile&reason=phone_required`.

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Request**
```json
{
  "username": "admin",
  "email": "admin@example.com",
  "phone_number": "+63 912 345 6789",
  "email_otp_code": "123456"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user_id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "phone_number": "+63 912 345 6789",
    "role": "admin"
  }
}
```

### POST /users/me/email-otp/request
Request a one-time code before changing the authenticated user's email address. Requests are OTP-rate-limited with `RATE_LIMIT_EMAIL_OTP_WINDOW_MS` and `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`.

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Request**
```json
{
  "email": "new-admin@example.com"
}
```

**Response (202)**
```json
{
  "success": true,
  "data": {
    "otp_id": "uuid",
    "purpose": "email_change",
    "email": "new-admin@example.com",
    "expires_at": "2026-05-17T04:20:00.000Z",
    "delivery_status": "sent"
  },
  "message": "Email verification code sent"
}
```

### PUT /users/me/password
Change the current authenticated user's password from Settings > Profile.

The request requires the current password and a new password. New passwords only require a minimum length of 8 characters; composition rules for uppercase, lowercase, numbers, or special characters are not enforced. The Settings UI can generate a readable 16-character password and fills the new-password confirmation field before submission.

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Request**
```json
{
  "currentPassword": "existing-password",
  "newPassword": "abcdefgh"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

### GET /users
Get all users (Admin/Manager only). Excludes soft-deleted users.

Query:
- `include_invitations=true` includes pending, cancelled, and expired invitation rows with invitation lifecycle and delivery metadata.

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "user_id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "role_preset_key": "food_manufacturing_admin",
      "role_preset_label": "Food Manufacturing Admin",
      "role_preset_status": "current",
      "is_active": true,
      "permissions": [],
      "is_master_admin": true,
      "last_login": "2024-01-15T10:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Supported Roles (Current Contract)**
- `admin`
- `manager`
- `staff`
- `cashier`
- `po`
- `do`
- `jo`

Mode-aware role presets are additive. `role` remains the compatibility and hierarchy field, while `role_preset_key` records the active mode's preset when assigned. Users with no preset are returned with `role_preset_status="legacy"` and display as `Legacy <role>` in User Management. Users whose preset belongs to a different active tenant mode are returned with `role_preset_status="mode_mismatch"` for admin review.

### GET /users/role-catalog
Get the role presets and visible permission groups for the tenant's active workflow mode. Requires `users:view`.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "version": "2026-05-06.mode-aware-rbac-v1",
    "workflow_mode": "services",
    "presets": [
      {
        "key": "services_scheduler",
        "label": "Scheduler",
        "mode": "services",
        "role": "staff",
        "rank": 4,
        "location_scope": "assigned",
        "permissions": [
          "services:bookings:view",
          "services:bookings:manage",
          "services:waitlist:manage"
        ]
      }
    ],
    "permission_groups": [
      {
        "key": "SERVICES",
        "label": "Services",
        "permissions": {
          "VIEW_BOOKINGS": "services:bookings:view",
          "MANAGE_BOOKINGS": "services:bookings:manage"
        }
      }
    ]
  }
}
```

### POST /users/invite
Legacy tenant-local invitation endpoint. Disabled by default for business-user onboarding. New integrations must use `GET /dgfy/accounts/search` and `POST /dgfy/invitations` so invitations target registered DGFY accounts.

**Request Body**
```json
{
  "email": "teammate@example.com",
  "role_preset_key": "services_scheduler",
  "location_ids": [1],
  "delivery_mode": "email"
}
```

Legacy `role` is still accepted for compatibility when the legacy endpoint is explicitly re-enabled. When `role_preset_key` is provided, the backend resolves the compatibility `role` and default permissions from the active tenant mode catalog. Location-scoped presets require at least one `location_ids` entry when the tenant has multiple active locations.

Direct invite links, resend-link generation, and manual-link recovery are retired by default. Already-issued tenant-local legacy links may remain a bounded compatibility/error path until expiry, but new Settings, AI, email, resend, and manual-link flows must not generate invitation URLs or company-token URLs. Role, status, permission, and location-scope edits are rejected until the invited DGFY account accepts the invitation.

### POST /users/:user_id/invitation/resend
Legacy endpoint. Disabled by default; use `POST /dgfy/invitations` for a new DGFY account invitation.

### POST /users/:user_id/invitation/link
Legacy endpoint. Disabled by default; manual invitation links are no longer generated for business-user onboarding.

### DELETE /users/:user_id/invitation
Cancel a pending invitation. Cancelled invitation links cannot be accepted.

### PUT /users/:user_id/role
Update user role (Admin only)

**Request Body**
```json
{
  "role_preset_key": "fnb_server",
  "location_ids": [1, 2]
}
```

Legacy role updates are still accepted:

```json
{
  "role": "manager"
}
```

`location_ids` is optional for tenant-wide presets. Assigned-scope presets require at least one active location when the tenant has multiple active locations; the role preset and location grants are saved in the same backend transaction. CSV user import accepts `role_preset_key` plus `location_ids`, `locationIds`, or `locations` as a semicolon-, comma-, or pipe-separated list and passes those locations through the same invitation validation.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 2,
    "username": "staff1",
    "role": "cashier",
    "role_preset_key": "fnb_server",
    "role_preset_label": "Server",
    "role_preset_status": "current",
    "permissions": ["items:view", "items:create", "..."]
  }
}
```

### PUT /users/:user_id/status
Update user active status (Admin only)

**Request Body**
```json
{
  "is_active": false
}
```

### PUT /users/:user_id/permissions
Update user permissions (Master Admin only)

**Request Body**
```json
{
  "permissions": ["items:view", "items:create", "po:view"],
  "is_master_admin": false
}
```

### DELETE /users/:user_id
Remove user from company (soft delete). Requires Admin or Manager role with hierarchical access control.

**Access Control Rules:**
- Master Admin can remove: Admin, Manager, Staff
- Admin can remove: Manager, Staff
- Manager can remove: Staff only
- Cannot remove yourself
- Cannot remove Master Admin

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 5,
    "username": "removed_user",
    "email": "removed@example.com",
    "role": "staff",
    "removed_at": "2026-02-06T12:00:00Z"
  },
  "message": "User has been removed from the company"
}
```

**Error Responses:**
- `400` - Cannot remove yourself
- `403` - Cannot remove Master Admin / Insufficient hierarchy level
- `404` - User not found (including already removed users)

---

## Items (SKU Master) Endpoints

### GET /items
Get all items with pagination and filtering

**Query Parameters**
```
?page=1
&limit=20
&category=raw_material
&search=flour
&sortBy=name
&sortOrder=asc
&status=active
&fields=dropdown     # Lightweight projection: returns only item_id, sku_code, name, unit_of_measure, category, current_stock. Skips all JOINs. Use for dropdowns.
&valuation_location_id=3   # Optional: adds location-scoped weighted metrics in cost_metrics.scoped
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "item_id": 1,
        "sku_code": "ING-001",
        "name": "All-Purpose Flour",
        "category": "raw_material",
        "current_stock": 150.50,
        "max_capacity": 500,
        "min_threshold": 200,
        "purchase_allowance": 100,
        "unit_of_measure": "kg",
        "cost_per_unit": 25.50,
        "default_sale_price": null,
        "cost_metrics": {
          "global": {
            "available_qty": 150.5,
            "weighted_avg_cost": 24.9,
            "inventory_value": 3747.45,
            "source": "fifo_batches"
          },
          "scoped": {
            "location_id": 3,
            "available_qty": 120.5,
            "weighted_avg_cost": 24.6,
            "inventory_value": 2964.3,
            "source": "fifo_batches"
          }
        },
        "fifo_enabled": true,
        "is_active": true,
        "created_at": "2024-01-01T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

**Notes:**
- Default listing excludes soft-deleted rows (`deleted_at IS NULL`).
- Inactive items are excluded by default unless explicitly queried by status where permitted.
- `cost_metrics.global` is always returned. `cost_metrics.scoped` is returned only when `valuation_location_id` is provided.
- `cost_metrics.*.source` indicates valuation origin (`fifo_batches` or `item_cost_fallback`).
- `cost_per_unit` is internal inventory/COGS data. `default_sale_price` is the explicit customer price used only when the row is sellable through POS, Storefront, or Dispatch Orders.

> **Performance note — `fields=dropdown`**: When `fields=dropdown` is passed, the endpoint still uses a lightweight row projection (no join-heavy composition/folder payload), but now includes additive `cost_metrics` valuation data for procurement and planning surfaces. Prefer this mode for dropdowns and quick selectors; avoid it when you need full `ProductComposition`, `ItemFolder`, or deep detail payloads.

### GET /items/:item_id
Get single item details

**Query Parameters**
```
?valuation_location_id=3   # Optional: sets cost_metrics.scoped to selected location
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "All-Purpose Flour",
    "category": "raw_material",
    "description": "High-quality all-purpose flour",
    "current_stock": 150.50,
    "max_capacity": 500,
    "min_threshold": 200,
    "purchase_allowance": 100,
    "unit_of_measure": "kg",
    "cost_per_unit": 25.50,
    "default_sale_price": null,
    "cost_metrics": {
      "global": {
        "available_qty": 150.5,
        "weighted_avg_cost": 24.9,
        "inventory_value": 3747.45,
        "source": "fifo_batches"
      },
      "scoped": {
        "location_id": 3,
        "available_qty": 120.5,
        "weighted_avg_cost": 24.6,
        "inventory_value": 2964.3,
        "source": "fifo_batches"
      },
      "by_location": [
        {
          "location_id": 3,
          "location_name": "Villa Store",
          "available_qty": 120.5,
          "weighted_avg_cost": 24.6,
          "inventory_value": 2964.3,
          "source": "fifo_batches"
        }
      ]
    },
    "fifo_enabled": true,
    "batch_size": 50,
    "yield_percentage": 98.5,
    "processing_loss": 1.5,
    "nutrition": {
      "calories": 364,
      "protein": 10,
      "fat": 1,
      "carbohydrates": 76
    },
    "allergens": ["wheat"],
    "shelf_life": {
      "duration_days": 365,
      "storage_temperature": "20-25°C",
      "storage_conditions": "Dry, cool place"
    },
    "fifo_batches": [
      {
        "batch_id": 1,
        "location_id": 3,
        "location": {
          "location_id": 3,
          "name": "Villa Store"
        },
        "quantity": 100,
        "cost_per_unit": 25.00,
        "received_date": "2024-01-10",
        "expiry_date": "2025-01-10",
        "quantity_consumed": 10
      }
    ],
    "item_location_stocks": [
      {
        "item_location_stock_id": 45,
        "item_id": 1,
        "location_id": 3,
        "location_name": "Villa Store",
        "quantity_on_hand": 140.5
      }
    ],
    "suppliers": [
      {
        "supplier_id": 1,
        "name": "Flour Supplier Inc",
        "moq": 50,
        "price_per_unit": 25.50
      }
    ]
  }
}
```

**Notes:**
- `current_stock` remains compatibility aggregate; authoritative per-location balances are in `item_location_stocks`.
- FIFO batches include location metadata to support location-scoped FIFO consumption. For stock-bearing items, frontend item detail views should read `item_location_stocks` and `fifo_batches.location_id` together: location stock shows where quantity exists, while batch rows show the cost, age, expiry, and remaining-quantity differences inside that location.
- `cost_metrics.by_location` is included in detail responses for per-location weighted valuation visibility.
- No API shape change is required for the location-aware FIFO viewer. Clients should group `fifo_batches` by `location_id`, join summaries from `item_location_stocks` and `cost_metrics.by_location`, calculate "next to use" within each location, and avoid labeling one batch as globally next when multiple locations exist.
- IMS clients must hide stock/FIFO/weighted-cost presentation for pure service rows. They should show `default_sale_price` as the primary service financial field and show `cost_per_unit` only as optional internal service-cost tracking.

### POST /items
Create new item

**Request**
```json
{
  "sku_code": "ING-001",
  "name": "All-Purpose Flour",
  "category": "raw_material",
  "mode_item_preset": "raw_material",
  "description": "High-quality all-purpose flour",
  "current_stock": 100,
  "location_id": 3,
  "max_capacity": 500,
  "min_threshold": 200,
  "purchase_allowance": 100,
  "unit_of_measure": "kg",
  "cost_per_unit": 25.50,
  "default_sale_price": null,
  "fifo_enabled": true,
  "batch_size": 50,
  "yield_percentage": 98.5,
  "processing_loss": 1.5
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "All-Purpose Flour",
    "category": "raw_material",
    "mode_item_preset": "raw_material"
  },
  "message": "Item created successfully"
}
```

**Notes:**
- `fifo_enabled` defaults to `true` when omitted.
- `sku_code` is trimmed server-side before persistence.
- Active SKU uniqueness is case/whitespace-insensitive. Conflicts return `409` with `Item with this SKU code already exists`.
- When `current_stock` is provided with `location_id`, opening/adjustment stock is recorded for that location ledger.
- Stock-bearing items should be created with location context whenever opening stock is provided so FIFO batches and location stock stay aligned from the first receipt/adjustment.
- Corrected workflow modes enforce mode-aware item taxonomy for new non-draft rows and draft finalization:
  - Food Manufacturing: raw materials/ingredients, packaging, supplies, and finished products.
  - MSME: products and supplies, with legacy raw/packaging rows preserved when not recategorized.
  - Services: service rows (`category=service`, stock-exempt), physical add-on products, and supplies.
  - Food & Beverage: menu items (`serving`), ingredients (`kg`/weight-volume-count), packaged beverage/retail items (`bottle`/packaging), and to-go packaging/supplies.
  - Hospitality: room nights (`room_night`), paid amenities, facility bookings, minibar/retail products, housekeeping supplies, reusable linen assets, and physical add-ons.
- Valid UOMs include convertible inventory units (`kg`, `g`, `mL`, `L`, `pcs`, etc.) plus non-convertible business units such as `serving`, `portion`, `service`, `session`, `ticket`, `booking`, `room_night`, `pack`, `case`, `carton`, `bottle`, and `can`. Automatic conversion is limited to weight, volume, and count groups.
- Corrected-mode clients may send `mode_item_preset` to persist the selected mode-native item type. F&B uses this to distinguish `menu_item` from `packaged_beverage`; Hospitality uses this to separate stock-exempt room nights/amenities/facility bookings from stock-bearing minibar, supply, linen, and physical add-on rows.
- `default_sale_price > 0` is required before an item can be sold through POS, Storefront checkout, or Dispatch Orders. Cost-only internal inventory rows may keep `default_sale_price=null`.
- Placeholder modes (`retail`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`) keep conservative defaults until their governed mode-specific item taxonomy is added.

### PUT /items/:item_id
Update item

**Request**
```json
{
  "name": "Premium All-Purpose Flour",
  "cost_per_unit": 26.00,
  "max_capacity": 600
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "Premium All-Purpose Flour",
    "cost_per_unit": 26.00,
    "max_capacity": 600
  },
  "message": "Item updated successfully"
}
```

**Notes:**
- SKU updates are normalized (trimmed) before persistence.
- In multi-location tenants, stock adjustments with `location_id` use that location's stock baseline (not global aggregate baseline).

### DELETE /items/:item_id
Delete item (soft delete)

**Response (200)**
```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```
**Notes:**
- Sets `status` to 'inactive'
- Sets `deleted_at` timestamp and `deleted_by` user ID
- Subsequent detail/update/delete calls for that item return `404`
- `410` is not returned by default item endpoints

### GET /items/:item_id/stock-history
Get stock movement history for an item
...

### GET /items/:item_id/batches
Get available FIFO batches for an item.

**Query Parameters**
```
?location_id=3
```

**Notes:**
- Returns only batches with available quantity (`quantity > quantity_consumed`).
- `location_id` is optional; when supplied, only batches for that location are returned.
- Response rows include optional location metadata (`location.location_id`, `location.name`).
- In multi-location mode, callers should pass the selected operating/fulfillment `location_id` when showing or consuming batches so the frontend batch view matches the stock ledger that checkout, production, transfer, or adjustment will affect.

### Item Barcode Identity Endpoints
Manage tenant-local barcode identities and label payloads. `sku_code` remains the human/business SKU; barcode rows are scan aliases.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/items/barcodes/resolve?code=...` | authenticated item read | Resolve a scan value to `resolved`, `not_found`, `inactive`, or `conflict` without authorizing stock/POS/Storefront action |
| `POST` | `/items/barcodes/conflicts/resolve` | `items:edit` | Process controlled conflict actions: `keep_existing`, `move_code`, `add_package_alias`, `reject_import` |
| `GET` | `/items/:item_id/barcodes` | authenticated item read | List active/inactive aliases for one item |
| `POST` | `/items/:item_id/barcodes` | `items:edit` | Attach manufacturer, supplier, internal, or legacy barcode |
| `POST` | `/items/:item_id/barcodes/generate` | `items:edit` | Generate tenant-local internal barcode; not an official UPC/EAN/GTIN |
| `PATCH` | `/items/:item_id/barcodes/:barcode_id` | `items:edit` | Update source, scope, packaging level, multiplier, metadata, or active flag |
| `DELETE` | `/items/:item_id/barcodes/:barcode_id` | `items:edit` | Deactivate an alias while retaining history |
| `POST` | `/items/:item_id/barcodes/:barcode_id/primary` | `items:edit` | Mark one active alias as primary |
| `GET` | `/items/:item_id/barcode-label` | authenticated item read | Render browser-printable label payload with layout metadata and audit print intent |

**Barcode request fields**
```json
{
  "code": "012345678905",
  "source": "manufacturer",
  "scope": "inventory",
  "packaging_level": "case",
  "quantity_multiplier": 24
}
```

**Rules**
- Active barcode uniqueness is tenant-local, not global. One tenant cannot silently assign the same active normalized code to unrelated active items.
- Accepted sources: `manufacturer`, `supplier`, `tenant_generated`, `legacy_import`, `system_generated_reference`.
- Accepted scopes: `inventory`, `pos`, `storefront_qr`, `batch`, `service`, `ticket`, `package`.
- Duplicate active assignments fail closed with `BARCODE_CONFLICT` metadata for explicit operator resolution.
- Label rendering and scan resolution identify context only; stock movement, POS eligibility, Storefront visibility, location grants, and compliance rules still run in their own use cases.
- Label payloads include normalized label type, human-readable type, browser-print layout metadata, and a `barcode.label_print_intent` audit entry.

### Item CSV Import/Export Endpoints
The item CSV endpoints share the same workflow-mode template contract for corrected item-taxonomy modes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/items/export` | Export filtered items as CSV |
| `POST` | `/items/export` | Export selected `itemIds` as CSV |
| `GET` | `/items/export/all` | Export all items as CSV |
| `GET` | `/items/export/preview` | Return export count and template metadata without downloading |

**Export query/body parameters**

| Name | Type | Description |
| --- | --- | --- |
| `workflow_mode` | string | Optional. When omitted, export resolves the tenant's active `ops_workflow_mode`. Legacy `manufacturing` normalizes to `food_manufacturing`. |
| `type` | string | Optional legacy compatibility value: `items`, `products`, or `master`. Explicit legacy values preserve the old category-split export behavior. |
| `category`, `search`, `fifo`, `folder` | string | Optional filters for filtered export and preview. |

**Current CSV contract**
- Corrected-mode exports for `food_manufacturing`, `msme`, `services`, `fnb`, and `hospitality` reuse the same template definitions as item import.
- Export headers include the mode template marker columns (`template_workflow_mode`, `mode_compatibility_note`, `template_schema_version`, `template_issued_at`, `template_signature`) and are emitted in the same order as import templates.
- Rows include `mode_item_preset` and `default_sale_price` whenever the mode template includes those columns.
- Services exports include `category=service` rows. Pure service rows export `current_stock=0` and `fifo_enabled=FALSE` to preserve the stock-exempt import contract.
- F&B exports preserve restaurant preset keys such as `menu_item`, `ingredient`, `packaged_beverage`, and `packaging_supply`.
- Hospitality exports preserve PMS preset keys such as `room_night`, `paid_amenity`, `facility_booking`, `minibar_retail_product`, `housekeeping_supply`, `linen_reusable_asset`, and `physical_add_on`.
- Export preview returns `workflowMode` and `templateType` metadata so the frontend can label the active export template before download.

### GET /items/supplier-coverage
Get item-supplier coverage statistics showing which items have/lack supplier assignments

**Response (200)**
```json
{
  "success": true,
  "data": {
    "items_with_supplier": [
      {
        "item_id": 1,
        "name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "category": "raw_material",
        "current_stock": 150.50,
        "min_threshold": 200,
        "unit_of_measure": "kg",
        "supplier_count": 2
      }
    ],
    "items_without_supplier": [
      {
        "item_id": 5,
        "name": "Black Square Bottle 350ml",
        "sku_code": "PKG-003",
        "category": "packaging",
        "current_stock": 50,
        "min_threshold": 100,
        "unit_of_measure": "pcs"
      }
    ],
    "summary": {
      "total_purchasable_items": 64,
      "items_with_supplier": 45,
      "items_without_supplier": 19,
      "coverage_percentage": 70.31
    }
  }
}
```

**Notes:**
- Only returns purchasable items (categories: raw_material, packaging, supplies)
- Products are excluded as they are manufactured, not purchased
- Used by the PO Wizard to validate item selection
- Used by the Item Coverage Panel on the Suppliers page

### GET /items/storefront-overrides
List item-level Storefront catalog overrides for authenticated inventory setup screens.

**Permission**: `items:edit`

**Query Parameters**
```
?search=milk
&limit=200
```

**Response Data**
```json
[
  {
    "item_id": 1,
    "name": "Milk Tea",
    "sku_code": "FG-001",
    "category": "product",
    "product_type": "finished_goods",
    "storefront_visible": true,
    "storefront_image_url": "/uploads/storefront-catalog/default/item-1.png",
    "storefront_image_gallery": [
      { "url": "/uploads/storefront-catalog/default/item-1.png", "is_primary": true, "sort_order": 0 }
    ],
    "location_availability": [
      {
        "location_id": 1,
        "name": "Main Branch",
        "is_open": true,
        "is_active": true,
        "is_primary_storefront": true,
        "storefront_available": true
      },
      {
        "location_id": 2,
        "name": "Branch 2",
        "is_open": true,
        "is_active": true,
        "is_primary_storefront": false,
        "storefront_available": false
      }
    ],
    "has_storefront_override": true
  }
]
```

`location_availability` lists active tenant branches for IMS setup screens. Missing branch override rows default to `storefront_available=true` for additive rollout compatibility.

### PATCH /items/:item_id/storefront-override
Update item-level Storefront visibility and/or branch availability.

**Permission**: `items:edit`

**Request Body**
```json
{
  "storefront_visible": true,
  "location_availability": [
    { "location_id": 1, "storefront_available": true },
    { "location_id": 2, "storefront_available": false }
  ]
}
```

At least one of `storefront_visible` or `location_availability` is required. Branch availability does not bypass Storefront readiness, mode readiness, branch stock, or service capacity rules. Public `/store/catalog?location_id=<id>`, QR resolution, quote, checkout, and booking flows must hide or reject items explicitly disabled for the selected branch.

**Notes**
- This is an inventory-facing authenticated setup endpoint, not a public Storefront read.
- `storefront_visible` controls customer-facing catalog membership for one item when Customer Access Mode permits catalog browsing.
- POS visibility remains controlled by `/pos/catalog-overrides` and `pos_visible`.
- When `storefront_catalog_overrides` exists, rows without an explicit Storefront override use Storefront defaults and do not inherit POS visibility or POS image data. POS-derived data is compatibility fallback only when the Storefront override table is unavailable during rollout.

### PATCH /items/:item_id/storefront-override
Create/update item-level Storefront catalog visibility.

**Permission**: `items:edit`

**Request**
```json
{
  "storefront_visible": false
}
```

**Notes**
- Does not mutate `pos_visible`.
- Does not upload, remove, or infer an image.

### POST /items/:item_id/storefront-image
Upload/replace the Storefront catalog primary image override. This endpoint remains backward compatible for single-image clients and writes a one-item gallery where the uploaded image is primary.

**Permission**: `items:edit`
**Request**: `multipart/form-data` with `image` file field.

**Accepted image MIME types**
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/bmp`
- `image/avif`

**Security Contract**
- Maximum file size is 5 MB.
- Backend validates both reported MIME type and binary signature.
- Stored paths are served through `/uploads` with `nosniff` static serving.
- Upload preserves existing `storefront_visible`; it must not silently show a hidden Storefront item.
- Replacement is failure-aware: the backend stores the new file, commits the Storefront image override, then best-effort removes the previous Storefront image. If the override update fails after storage succeeds, the newly stored file is removed and the old image path remains intact.

### POST /items/:item_id/storefront-images
Append images to the ordered Storefront catalog image gallery for one item.

**Permission**: `items:edit`
**Request**: `multipart/form-data` with up to 5 `images` file fields.

**Notes**
- If no gallery exists, the first accepted image becomes the primary `storefront_image_url`.
- If a gallery already exists, accepted images are appended after the existing ordered entries and the existing first image remains primary.
- The response includes `storefront_image_gallery` ordered by `sort_order`.
- Upload validation uses the same 5 MB per-image and safe MIME/signature checks as the single-image endpoint.
- Appending to the gallery preserves `storefront_visible` and does not mutate POS menu images.

### POST /items/storefront-images/bulk
Upload Storefront catalog images in bulk by SKU filename stem.

**Permission**: `items:edit`

**Request**: `multipart/form-data` with up to 50 `images` file fields.

**Matching Contract**
- Each file is matched to an item by filename stem. For example, `SKU-001.png` matches item SKU `SKU-001`.
- Duplicate filename stems in the same request return per-file `duplicate_filename`.
- Unmatched filename stems return per-file `unmatched`.
- POS menu image fields are not mutated.
- Existing `storefront_visible` state is preserved.

**Bulk Upload Security Contract**
- Bulk upload transport intentionally accepts the multipart batch so the API can return per-file partial-success results.
- Transport cap: 50 files, 6 MB per temporary upload.
- Product policy cap: 5 MB per image result row.
- Each file is validated before storage against the safe image MIME allowlist and binary signature. Unsupported MIME, unsupported signatures, and MIME/signature mismatches return per-file `failed`.
- Rejected temp files are removed best-effort. If image storage succeeds but the catalog write fails, the newly stored image is removed best-effort.
- Single-item and gallery image endpoints remain transport-strict; this lenient transport contract applies only to bulk setup endpoints.

**Response Data**
- `summary` counts `uploaded`, `failed`, `unmatched`, `duplicate_filename`, and `blocked_readiness`.
- `results[]` includes `filename`, `sku_code`, `item_id`, `surface`, `status`, `image_url`, `errors`, and optional readiness/data payloads.

### PATCH /items/:item_id/storefront-images/gallery
Reorder or prune the existing Storefront catalog gallery for one item.

**Permission**: `items:edit`

**Request**
```json
{
  "gallery": [
    { "path": "storefront-catalog/tenant/item-second.png", "url": "/uploads/storefront-catalog/tenant/item-second.png" },
    { "path": "storefront-catalog/tenant/item-first.png", "url": "/uploads/storefront-catalog/tenant/item-first.png" }
  ]
}
```

**Notes**
- The first supplied existing gallery entry becomes primary and is mirrored to `storefront_image_url`.
- Entries must already belong to the item's current Storefront gallery; this endpoint cannot inject arbitrary URLs.
- Omitted existing entries are removed from the gallery and their stored files are removed best-effort.
- An empty gallery clears the Storefront image fields.
- Preserves `storefront_visible` and does not mutate POS menu image fields.

### DELETE /items/:item_id/storefront-images/:image_index
Remove one image from the Storefront catalog gallery by its current zero-based order.

**Permission**: `items:edit`

**Notes**
- Removing index `0` promotes the next image to primary when one exists.
- Removing the last remaining image clears the Storefront image fields.
- Preserves `storefront_visible` and does not mutate POS menu image fields.

### DELETE /items/:item_id/storefront-image
Remove the Storefront catalog image override and any ordered Storefront gallery entries.

**Permission**: `items:edit`

**Notes**
- Clears `storefront_image_path`, `storefront_image_url`, and `storefront_image_gallery`.
- Preserves `storefront_visible`.
- Does not mutate POS menu image fields.

### GET /items/folders
List inventory folders.

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "folder_id": 12,
      "name": "Beverages",
      "description": "",
      "item_count": 8,
      "show_in_pos_filter": true
    }
  ]
}
```

### POST /items/folders
Create a new inventory folder.

**Request**
```json
{
  "name": "Beverages",
  "description": "Finished goods drinks"
}
```

### PATCH /items/folders/:folder_id
Update folder metadata.

**Request**
```json
{
  "show_in_pos_filter": false
}
```

**Notes:**
- `show_in_pos_filter` controls whether the folder appears as a POS category filter chip.
- This flag does not change item sellability; item-level `pos_visible` is still authoritative.

### DELETE /items/folders/:folder_id
Delete a folder and unassign linked items.

---

## Purchase Orders Endpoints

...

### POST /purchase-orders/:po_id/archive
Archive a Purchase Order (hide from default lists)

**Response (200)**
```json
{
  "success": true,
  "message": "Purchase order archived"
}
```

### POST /purchase-orders/:po_id/restore
Restore an archived Purchase Order

**Response (200)**
```json
{
  "success": true,
  "message": "Purchase order restored"
}
```

---

## Job Orders Endpoints

...

### POST /job-orders/:jo_id/complete
Complete production and update inventory

**Request**
```json
{
  "actual_quantity_produced": 50,
  "notes": "Production went smoothly",
  "expiry_date_override": "2026-06-01"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "completed",
    "notes": "Production went smoothly"
  }
}
```

### POST /job-orders/:jo_id/archive
Archive a Job Order

**Response (200)**
```json
{
  "success": true,
  "message": "Job order archived"
}
```

### POST /job-orders/:jo_id/restore
Restore an archived Job Order

**Response (200)**
```json
{
  "success": true,
  "message": "Job order restored"
}
```

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
&movementType=production_consumption
&limit=50
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "movement_id": 1,
        "item_id": 1,
        "movement_type": "production_consumption",
        "quantity": 25.5,
        "reference_id": "JO-001",
        "reference_type": "JO",
        "user_responsible": "john_doe",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

## Suppliers Endpoints

### GET /suppliers
Get all suppliers

**Query Parameters**
```
?page=1
&limit=20
&search=supplier_name
&sortBy=quality_rating
&sortOrder=desc
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "supplier_id": 1,
        "name": "Flour Supplier Inc",
        "contact_person": "John Smith",
        "email": "contact@floursupplier.com",
        "phone": "+63-2-1234-5678",
        "address": "123 Main St, Manila",
        "quality_rating": 4.5,
        "avg_delivery_days": 3,
        "is_active": true,
        "last_delivery_date": "2024-01-14"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "pages": 2
    }
  }
}
```

**Notes:**
- Default listing excludes soft-deleted/inactive suppliers.
- Detail or mutation requests on soft-deleted suppliers return `404`.

### GET /suppliers/:supplier_id
Get supplier details with items and pricing

**Response (200)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc",
    "contact_person": "John Smith",
    "email": "contact@floursupplier.com",
    "phone": "+63-2-1234-5678",
    "address": "123 Main St, Manila",
    "quality_rating": 4.5,
    "avg_delivery_days": 3,
    "items": [
      {
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "moq": 50,
        "price_per_unit": 25.50,
        "last_price_update": "2024-01-10T00:00:00Z"
      }
    ],
    "bulk_discounts": [
      {
        "min_quantity": 100,
        "discount_percent": 5
      },
      {
        "min_quantity": 500,
        "discount_percent": 10
      }
    ]
  }
}
```

### POST /suppliers
Create new supplier

**Request**
```json
{
  "name": "Flour Supplier Inc",
  "contact_person": "John Smith",
  "email": "contact@floursupplier.com",
  "phone": "+63-2-1234-5678",
  "address": "123 Main St, Manila"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc"
  },
  "message": "Supplier created successfully"
}
```

### PUT /suppliers/:supplier_id
Update supplier

**Response (200)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc",
    "quality_rating": 4.7
  },
  "message": "Supplier updated successfully"
}
```

### POST /suppliers/:supplier_id/items
Add item to supplier's catalog

**Request**
```json
{
  "item_id": 1,
  "moq": 50,
  "price_per_unit": 25.50
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "supplier_item_id": 1,
    "item_id": 1,
    "moq": 50,
    "price_per_unit": 25.50
  }
}
```

---

## Purchase Orders Endpoints

### GET /purchase-orders
Get all purchase orders

**Query Parameters**
```
?page=1
&limit=20
&status=pending
&supplier_id=1
&startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "purchase_orders": [
      {
        "po_id": 1,
        "po_number": "PO-2024-001",
        "supplier_id": 1,
        "supplier_name": "Flour Supplier Inc",
        "order_date": "2024-01-10",
        "expected_delivery_date": "2024-01-13",
        "received_date": null,
        "status": "pending",
        "total_amount": 5100.00,
        "created_by": "john_doe"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

### GET /purchase-orders/:po_id
Get detailed PO with line items

**Query Parameters**
```
?valuation_location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "po_number": "PO-2024-001",
    "supplier_id": 1,
    "supplier_name": "Flour Supplier Inc",
    "order_date": "2024-01-10",
    "expected_delivery_date": "2024-01-13",
    "received_date": null,
    "status": "pending",
    "line_items": [
      {
        "line_item_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "quantity_ordered": 200,
        "quantity_received": 0,
        "unit_price": 25.50,
        "total_price": 5100.00,
        "quality_check_status": "pending"
      }
    ],
    "subtotal": 5100.00,
    "discount": 0,
    "total_amount": 5100.00,
    "notes": "Urgent order"
  }
}
```

**Notes**
- PO detail responses now include weighted valuation context on item payloads used by receipt/review UIs:
  - `line_items[].item.weighted_avg_cost`
  - `line_items[].item.cost_metrics`
- `valuation_location_id` is optional. When provided, `line_items[].item.weighted_avg_cost` and `line_items[].item.cost_metrics.scoped` are computed from the selected location baseline.

### POST /purchase-orders
Create new purchase order

**Request**
```json
{
  "supplier_id": 1,
  "order_date": "2024-01-10",
  "expected_delivery_date": "2024-01-13",
  "line_items": [
    {
      "item_id": 1,
      "quantity": 200,
      "unit_price": 25.50
    }
  ],
  "discount": 0,
  "notes": "Urgent order"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "po_number": "PO-2024-001",
    "status": "pending",
    "total_amount": 5100.00
  },
  "message": "Purchase order created successfully"
}
```

### POST /purchase-orders/:po_id/receive
Record PO receipt and update inventory

**Request**
```json
{
  "received_date": "2024-01-13",
  "line_items": [
    {
      "line_item_id": 1,
      "quantity_received": 200,
      "quality_check_status": "passed"
    }
  ],
  "notes": "All items received in good condition"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "status": "received",
    "received_date": "2024-01-13"
  },
  "message": "PO receipt recorded successfully"
}
```

---

## Job Orders Endpoints

### GET /job-orders
Get all job orders

**Query Parameters**
```
?page=1
&limit=20
&status=in_progress
&product_id=5
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "job_orders": [
      {
        "jo_id": 1,
        "jo_number": "JO-2024-001",
        "product_id": 5,
        "product_name": "Chocolate Cake",
        "quantity_to_produce": 50,
        "status": "in_progress",
        "created_date": "2024-01-15T08:00:00Z",
        "responsible_user": "baker_john"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 30,
      "pages": 2
    }
  }
}
```

### GET /job-orders/:jo_id
Get detailed job order with ingredients

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "jo_number": "JO-2024-001",
    "product_id": 5,
    "product_name": "Chocolate Cake",
    "quantity_to_produce": 50,
    "status": "in_progress",
    "created_date": "2024-01-15T08:00:00Z",
    "completion_date": null,
    "responsible_user": "baker_john",
    "ingredients": [
      {
        "jo_ingredient_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "quantity_required": 100,
        "quantity_consumed": 100,
        "stock_before": 250,
        "stock_after": 150
      },
      {
        "jo_ingredient_id": 2,
        "item_id": 3,
        "item_name": "Cocoa Powder",
        "quantity_required": 20,
        "quantity_consumed": 20,
        "stock_before": 50,
        "stock_after": 30
      }
    ],
    "notes": "Standard batch production"
  }
}
```

### POST /job-orders
Create new job order

**Request**
```json
{
  "product_id": 5,
  "quantity_to_produce": 50,
  "responsible_user": "baker_john",
  "notes": "Standard batch production"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "jo_number": "JO-2024-001",
    "status": "draft"
  },
  "message": "Job order created successfully"
}
```

### PUT /job-orders/:jo_id/start
Start production (transition from draft to in_progress)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "in_progress"
  },
  "message": "Production started"
}
```

### PUT /job-orders/:jo_id/complete
Complete production and update inventory

**Request**
```json
{
  "actual_quantity_produced": 50,
  "notes": "Production completed successfully"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "completed",
    "completion_date": "2024-01-15T16:00:00Z"
  },
  "message": "Job order completed successfully"
}
```

---

## Stock Movements Endpoints

### GET /stock-movements
Get all stock movements

**Query Parameters**
```
?page=1
&limit=50
&item_id=1
&movement_type=production_consumption
&location_id=3
&source_location_id=3
&destination_location_id=5
&startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "movement_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "movement_type": "production_consumption",
        "quantity": 100,
        "location_id": 3,
        "source_location_id": null,
        "destination_location_id": null,
        "location": {
          "location_id": 3,
          "name": "Villa Store"
        },
        "sourceLocation": null,
        "destinationLocation": null,
        "reference_id": "JO-2024-001",
        "reference_type": "JO",
        "user_responsible": "baker_john",
        "timestamp": "2024-01-15T10:30:00Z",
        "notes": "Used in chocolate cake production"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 250,
      "pages": 5
    }
  }
}
```

**Notes:**
- `location_id`, `source_location_id`, and `destination_location_id` filters are optional and can be combined with date filters.
- Transfer rows carry source/destination location objects; single-location rows carry `location`.

### POST /stock-movements
Record manual stock movement

**Request**
```json
{
  "item_id": 1,
  "movement_type": "calculated_loss",
  "quantity": 5.5,
  "location_id": 3,
  "loss_reason": "spoilage",
  "notes": "Flour damaged due to moisture"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "movement_id": 1,
    "item_id": 1,
    "quantity": 5.5,
    "timestamp": "2024-01-15T11:00:00Z"
  },
  "message": "Stock movement recorded successfully"
}
```

**Transfer Request Contract**
```json
{
  "item_id": 1,
  "movement_type": "transfer",
  "quantity": 10,
  "source_location_id": 3,
  "destination_location_id": 5,
  "notes": "Rebalancing stock"
}
```

**Validation Notes:**
- `quantity` must be `> 0`.
- For `movement_type=transfer`, both `source_location_id` and `destination_location_id` are required and must be different.
- For `movement_type=calculated_loss`, `loss_reason` is required.
- Optional batch targeting uses `batch_id`; if omitted on deduction flows, FIFO oldest batch is used.
- Pure service rows (`category=service` or `mode_item_preset=service`) are stock-exempt and cannot receive manual stock movements or transfers. Physical service add-ons/products remain stock-bearing and use the normal movement contract.

### POST /stock-movements/:id/void
Void a specific stock movement

**Request**
```json
{
  "reason": "Duplicate entry error"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movement_id": 95,
    "item_id": 1,
    "movement_type": "adjustment",
    "quantity": -10,
    "reference_type": "MANUAL",
    "notes": "Void of movement #94: Duplicate entry error"
  },
  "message": "Movement voided successfully"
}
```

### GET /stock-movements/export
Export stock movements as CSV

**Query Parameters**
```
?format=csv
&startDate=2024-01-01
&endDate=2024-01-31
&item_id=1
&movement_type=all
```

**Response (200)**
Content-Type: text/csv
Content-Disposition: attachment; filename="stock_movements_2024-01-16.csv"
```csv
Movement ID,Date,Item Name,SKU,Type,Quantity,Location ID,Location,Source Location ID,Source Location,Destination Location ID,Destination Location,Current Stock,Reference,Batch ID,User,Notes
94,"1/16/2026, 3:43:53 PM","Calamansi Label 330ml","PKG-005","transfer","1.00","","","3","Villa Store","5","Bernwood Tower","","N/A","N/A","admin",""
```

---

## Dispatch Orders Endpoints

Dispatch Orders (DO) are first-class outbound documents for finished goods. They trigger `goods_issue` stock movements and support partial dispatch (ship now, ship later). Requires `do:view`, `do:create`, `do:dispatch`, or `do:delete` permissions.

### GET /dispatch-orders
List Dispatch Orders (paginated, filterable).

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (default: 50, max: 200) |
| `status` | string | Filter by status: `draft`, `confirmed`, `partial`, `completed`, `cancelled` |
| `recipient_name` | string | Search by recipient name (partial match) |
| `from_date` | date | Filter dispatch_date >= this date |
| `to_date` | date | Filter dispatch_date <= this date |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "do_id": 1,
        "do_number": "DO-2026-0001",
        "recipient_name": "Metro Supermarket",
        "recipient_type": "external",
        "dispatch_date": "2026-03-02",
        "status": "confirmed",
        "reference_jo": "JO-2026-0012",
        "reference_po": null,
        "notes": "Rush delivery",
        "line_count": 3,
        "created_at": "2026-03-02T08:00:00Z"
      }
    ],
    "count": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

### GET /dispatch-orders/stats
Summary counts grouped by status. Used by the Dispatch Orders page stats cards and Dashboard "Pending Dispatches" card.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "draft": 2,
    "confirmed": 5,
    "partial": 3,
    "completed": 41,
    "cancelled": 1
  }
}
```

---

### GET /dispatch-orders/export
Export Dispatch Orders list as CSV. Applies formula injection protection on all text cells.

**Query Params**: Same filters as GET /dispatch-orders.

**Response (200)**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="dispatch-orders-2026-03-02.csv"
```
```csv
DO Number,Recipient,Recipient Type,Dispatch Date,Status,Reference JO,Reference PO,Lines,Notes,Created At
DO-2026-0001,Metro Supermarket,external,2026-03-02,confirmed,JO-2026-0012,,3,Rush delivery,2026-03-02T08:00:00.000Z
```

---

### GET /dispatch-orders/:id
Get a single Dispatch Order with all lines and associated stock movements.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "do_id": 1,
    "do_number": "DO-2026-0001",
    "recipient_name": "Metro Supermarket",
    "recipient_type": "external",
    "dispatch_date": "2026-03-02",
    "status": "partial",
    "reference_jo": "JO-2026-0012",
    "reference_po": null,
    "notes": null,
    "created_by": 1,
    "confirmed_by": 2,
    "archived_at": null,
    "lines": [
      {
        "line_id": 1,
        "do_id": 1,
        "item_id": 5,
        "qty_ordered": 100,
        "qty_dispatched": 50,
        "qty_voided": 0,
        "unit_of_measure": "pcs",
        "cost_per_unit": "15.5000",
        "notes": null,
        "Item": {
          "item_id": 5,
          "name": "Bottled Juice 330ml",
          "sku_code": "FG-001",
          "current_stock": 200
        }
      }
    ],
    "movements": [
      {
        "movement_id": 88,
        "movement_type": "goods_issue",
        "quantity": -50,
        "reference_type": "DO",
        "reference_id": "1",
        "notes": "Dispatched 50 pcs to Metro Supermarket (DO-2026-0001)",
        "created_at": "2026-03-02T09:15:00Z"
      }
    ],
    "creator": { "user_id": 1, "username": "admin" },
    "confirmer": { "user_id": 2, "username": "manager1" }
  }
}
```

---

### POST /dispatch-orders
Create a new Dispatch Order (status = `draft`). No stock is deducted at this step.

**Permission**: `do:create`

**Request Body**
```json
{
  "recipient_name": "Metro Supermarket",
  "recipient_type": "external",
  "dispatch_date": "2026-03-05",
  "reference_jo": "JO-2026-0012",
  "reference_po": null,
  "notes": "Rush delivery",
  "lines": [
    { "item_id": 5, "qty_ordered": 100, "notes": null },
    { "item_id": 8, "qty_ordered": 50, "notes": "Check expiry first" }
  ]
}
```

**Validation Rules**
- `recipient_name`: required, max 200 chars
- `recipient_type`: `external` | `internal`
- `dispatch_date`: required, valid date
- `lines`: required, non-empty array; each line must have `item_id` and `qty_ordered > 0`

**Response (201)**
```json
{
  "success": true,
  "data": { "do_id": 3, "do_number": "DO-2026-0003", "status": "draft", ... },
  "message": "Dispatch Order DO-2026-0003 created"
}
```

---

### PUT /dispatch-orders/:id
Update a Dispatch Order. Only allowed when status is `draft`.

**Permission**: `do:create`

**Request Body**: Same schema as POST. All fields optional (partial update).

**Response (200)**
```json
{ "success": true, "data": { ...updatedDO }, "message": "Dispatch Order updated" }
```

---

### POST /dispatch-orders/:id/confirm
Confirm a Dispatch Order: `draft` → `confirmed`. Locks the header; items are reserved for dispatch. No stock change yet.

**Permission**: `do:create`

**Response (200)**
```json
{ "success": true, "data": { "status": "confirmed", ... }, "message": "Dispatch Order confirmed" }
```

---

### POST /dispatch-orders/:id/dispatch
Execute a dispatch run. Deducts stock from `fifo_batches` and creates `goods_issue` StockMovement records. Transitions status: `confirmed` → `partial` or `completed`.

**Permission**: `do:dispatch`

**Request Body**
```json
{
  "lines": [
    { "line_id": 1, "qty_to_dispatch": 50 },
    { "line_id": 2, "qty_to_dispatch": 30 }
  ]
}
```

**Behavior**:
- FIFO used for non-perishable items (`shelf_life_days = null`)
- FEFO used for perishable items (`shelf_life_days IS NOT NULL`) — batches sorted by `expiry_date ASC`
- Partial dispatch: if `qty_to_dispatch < qty_remaining` on all lines, status = `partial`
- Full dispatch: if all lines are now fully dispatched, status = `completed`
- Creates one `StockMovement` per line dispatched: `movement_type = 'goods_issue'`, `reference_type = 'DO'`, `reference_id = line_id`

**Response (200)**
```json
{
  "success": true,
  "data": {
    "do_id": 1,
    "status": "partial",
    "lines_dispatched": 2,
    "movements_created": 2
  },
  "message": "Dispatched 2 line(s) successfully"
}
```

**Error (400)** — Insufficient stock:
```json
{
  "success": false,
  "message": "Insufficient stock for Bottled Juice 330ml. Available: 30, Requested: 50"
}
```

---

### POST /dispatch-orders/:id/cancel
Cancel a Dispatch Order. Only allowed from `draft` or `confirmed` status.

**Permission**: `do:delete`

**Request Body**
```json
{ "reason": "Customer cancelled order" }
```

**Response (200)**
```json
{ "success": true, "data": { "status": "cancelled" }, "message": "Dispatch Order cancelled" }
```

---

### POST /dispatch-orders/:id/archive
Archive a completed or cancelled Dispatch Order. Sets `archived_at` timestamp.

**Permission**: `do:delete`

**Response (200)**
```json
{ "success": true, "message": "Dispatch Order archived" }
```

---

## POS Endpoints

Point-of-Sale (POS) handles real-time cashier transactions for POS-visible active items. Stock-controlled product checkouts create `goods_issue` stock movements using `reference_type='POS'`; Services Mode service rows and rows explicitly configured as POS Always Available are stock-exempt and do not require inventory stock to be sold.

Gating notes:
- Plan gate uses `requirePremium`.
- Permission gate uses `checkPermission` (for example `pos:view`, `pos:transact`).
- In billing-paused mode (`PAYMENTS_ENABLED=false`), `requirePremium` is plan-driven (`plan === premium`) and does not block on `subscription_status`.
- In live billing mode (`PAYMENTS_ENABLED=true`), `requirePremium` also enforces active/grace subscription state.

### GET /pos/catalog
List sellable POS catalog items.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name/SKU search |
| `limit` | number | Max rows (default 100, capped at 500) |
| `folder_id` | number | Optional folder filter (`item_folders.folder_id`) |

**Notes:**
- Response enforces `pos_visible !== false`.
- Response includes out-of-stock rows. POS clients should display unavailable state for stock-controlled products with `current_stock <= 0`.
- Services Mode rows (`category=service`) are visible when service metadata exists and `service_item_details.visible_in_pos` is not false. They remain addable even when `current_stock=0`.
- `pos_always_available=true` is an explicit POS-only stock exemption. It does not change `pos_visible`, Storefront visibility, or Inventory balances.
- POS folder chips should only show folders where `show_in_pos_filter = true`.
- Hidden folders (`show_in_pos_filter = false`) are not listed as POS filters, but their eligible items remain discoverable in unfiltered/search catalog results.
- Default visibility policy when no override row exists:
  - `category=product` + `product_type=finished_goods`: visible by default
  - `category=service` + service metadata with `visible_in_pos !== false`: visible by default in POS
  - other categories/types: hidden until explicitly enabled (`pos_visible=true`)

### POST /pos/scan
Resolve a barcode scan for the current POS context before cart insertion.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "code": "CASE-6",
  "location_id": 3,
  "terminal_id": "FRONT-01",
  "quantity": 1
}
```

**Resolved Response (200)**
```json
{
  "success": true,
  "data": {
    "status": "resolved",
    "barcode": { "item_barcode_id": 44, "scope": "package", "quantity_multiplier": 6 },
    "suggested_line": {
      "item_id": 10,
      "quantity": 6,
      "unit_price": 35,
      "source": "barcode_scan",
      "scan_metadata": {
        "barcode_id": 44,
        "code": "CASE-6",
        "normalized_code": "CASE-6",
        "location_id": 3
      }
    }
  }
}
```

**Blocked Response (200)**
```json
{
  "success": true,
  "data": {
    "status": "blocked",
    "reason_code": "NOT_POS_VISIBLE",
    "message": "Item is not visible in POS"
  }
}
```

**Routed Response (200)**
```json
{
  "success": true,
  "data": {
    "status": "routed",
    "reason_code": "SERVICE_BOOKING_SCAN_ROUTED",
    "message": "Service booking scan routed to Services",
    "route": {
      "type": "service_booking",
      "reference": "SB-2026-0001"
    }
  }
}
```

**Rules**
- Resolution runs through POS use cases, not direct Inventory lookup from the UI.
- Successful scans may enter cart only after item status, POS visibility, sale price, shift/location scope, stock/service exemption, and compliance readiness pass.
- Service booking/ticket QR scans return routed metadata and must not add cart lines. Ticket-scope barcodes that are not service booking routes return `TICKET_SCAN_NOT_CARTABLE`.
- Blocked reason codes include `BARCODE_NOT_FOUND`, `BARCODE_CONFLICT`, `BARCODE_SCOPE_NOT_POS`, `TICKET_SCAN_NOT_CARTABLE`, `NOT_POS_VISIBLE`, `ITEM_INACTIVE`, `MISSING_PRICE`, `OUT_OF_STOCK`, `LOCATION_CONTEXT_REQUIRED`, `UNAUTHORIZED_LOCATION`, `COMPLIANCE_BLOCKED`, and `SERVICE_UNAVAILABLE`.
- Offline checkout payloads may include `scan_metadata`; replay revalidates barcode mapping, item state, stock/location, and compliance before committing.

### GET /pos/catalog-overrides
List POS catalog overrides for admin inventory/POS configuration screens.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name/SKU search |
| `limit` | number | Max rows (default 200, capped at 1000) |

**Response Notes**
- Includes normalized `pos_readiness` object for guided UX:
  - `ready`, `state`, `score`
  - `checks` map
  - `missing_requirements[]` with `code`, `label`, `fix_hint`
- Readiness is used by IMS setup flows to resolve POS blockers before cashier checkout.

### PATCH /pos/catalog-overrides/:item_id
Create/update POS catalog override for an item.

**Permission**: `items:edit`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "pos_visible": true,
  "pos_always_available": false
}
```

At least one field is required. `pos_always_available=true` keeps an otherwise
eligible POS row sellable at zero stock. Checkout persists an immutable
`stock_effect_type='stock_exempt'` and
`stock_exempt_reason='pos_always_available'` line snapshot and creates no
Inventory stock movement for that line.

### POST /pos/terminal/pair
Optionally enroll the current physical POS device against a selected registered terminal after DGFY master-admin authentication. This endpoint is retained for compatibility and hardware-specific flows; normal shift opening and checkout do not require a pairing cookie.

**Permission**: `pos:view`

**Request Body**
```json
{
  "terminal_id": "FRONT-01"
}
```

Success sets the HttpOnly `sku_pos_terminal_pairing` cookie. The response does
not expose the token. Enrollment requires the company master admin and is bound
to the current tenant, terminal, location, and rotatable pairing version.
Cashiers use their accepted DGFY membership and assigned location grants; no
reusable terminal password exists.

### GET /pos/terminal/paired
Return sanitized current pairing metadata after revalidating the terminal,
location, pairing version, user authorization profile, and DGFY membership.
Missing, expired, stale, or rotated pairing state must not block normal
shift opening or checkout when the operator is otherwise authorized.

### DELETE /pos/terminal/paired
Clear the pairing cookie. Explicit terminal lock uses this endpoint before
clearing the frontend terminal session.

### POST /pos/catalog-overrides/images/bulk
Upload POS catalog images in bulk by SKU filename stem.

**Permission**: `items:edit`
**Plan Gate**: Premium (`requirePremium`)

**Request**: `multipart/form-data` with up to 50 `images` file fields.

**Matching Contract**
- Each file is matched to an item by filename stem. For example, `SKU-001.png` matches item SKU `SKU-001`.
- Duplicate filename stems in the same request return per-file `duplicate_filename`.
- Unmatched filename stems return per-file `unmatched`.
- Storefront catalog image fields are not mutated.
- Existing `pos_visible` state is preserved.

**Bulk Upload Security Contract**
- Bulk upload transport intentionally accepts the multipart batch so the API can return per-file partial-success results.
- Transport cap: 50 files, 6 MB per temporary upload.
- Product policy cap: 5 MB per image result row.
- Each file is validated before storage against the safe image MIME allowlist and binary signature. Unsupported MIME, unsupported signatures, and MIME/signature mismatches return per-file `failed`.
- Rejected temp files are removed best-effort. If image storage succeeds but the catalog write fails, the newly stored image is removed best-effort.
- Single POS image upload remains transport-strict; this lenient transport contract applies only to bulk setup endpoints.

**Response Data**
- `summary` counts `uploaded`, `failed`, `unmatched`, and `duplicate_filename`.
- `results[]` includes `filename`, `sku_code`, `item_id`, `surface`, `status`, `image_url`, `errors`, and optional readiness/data payloads.

### POST /pos/catalog-overrides/:item_id/image
Upload/replace POS catalog image override (multipart file upload).

**Permission**: `items:edit`
**Plan Gate**: Premium (`requirePremium`)

**Request**: `multipart/form-data` with `image` file field.

**Validation Contract**
- Endpoint accepts image files only.
- Unsupported upload types are rejected with `422 Validation failed`.
- Existing image is replaced atomically when a valid new image is uploaded.

**Image URL Contract**
- Backend stores and returns `pos_image_url` as a path under `/uploads/...`.
- Upload preserves existing `pos_visible`; it must not silently show a hidden POS item.
- POS menu image fields are independent from Storefront catalog image fields.
- Local frontend dev/prod-preview surfaces must proxy `/uploads` to backend target (same as `/api`) so catalog/terminal/storefront images render correctly from local app hosts (for example `localhost:5173`, `localhost:5174`, `localhost:5175`).
- If `/uploads` proxy is missing, images appear as broken placeholders even when upload succeeds.
- Frontend clients must treat returned `/uploads/...` paths as backend assets; when API origin differs from app origin, resolve these paths with this precedence:
  1. `VITE_ASSET_BASE_URL`
  2. `VITE_API_BASE_URL`
  3. absolute `VITE_API_URL` (ignore relative values such as `/api/v1`)

### DELETE /pos/catalog-overrides/:item_id/image
Remove POS image override and revert to default item image behavior.

**Permission**: `items:edit`
**Plan Gate**: Premium (`requirePremium`)

**Notes**
- Preserves `pos_visible`.
- Does not mutate Storefront catalog visibility or image fields.

### POST /pos/checkouts
Execute a POS checkout transaction (atomic). Creates:
1. `pos_transactions` header
2. `pos_transaction_lines` with immutable VAT snapshots
3. `stock_movements` entries (`movement_type='goods_issue'`, `reference_type='POS'`) for stock-controlled product lines only

The route requires an authenticated POS operator with `pos:transact`, a selected
active registered terminal, a terminal location matching the checkout location,
authorized access to that location, and an open shift. POS Always Available
lines create no `stock_movements` row and instead retain the explicit
stock-exempt snapshot on `pos_transaction_lines`.

Route mapping note:
- This spec uses module-relative paths (for example `/pos/checkouts`).
- Public API path is `/api/v1/pos/checkouts` (plural).
- `POST /api/v1/pos/checkout` (singular) is not the canonical route.

Order-method fee policy (current contract):
- Mandatory fixed policy: `service_fee_amount = round4(items_subtotal * 0.01)` (`DGFY convenience fee`).
- `service_fee_amount` request field is accepted for backward payload compatibility but ignored at runtime.
- Food & Beverage restaurant service charge is separate. F&B check/table/server/guest/course/modifier/kitchen metadata is additive and stored in `fnb_*` and `restaurant_service_charge_*` snapshot fields; do not reuse `service_fee_amount` for restaurant service charge.
- `pos_order_method_fees` is deprecated and no longer used by checkout pricing logic.
- Service fee is stored as immutable snapshots on transaction header:
  - `service_fee_amount`
  - `service_fee_label_snapshot`
  - `service_fee_method_snapshot`
  - `service_fee_overridden`

Discount policy (current contract):
- Non-zero discount requires `discount_profile_name` from tenant-configured `pos_discount_profiles`.
- Backend recomputes discount from the saved preset percentage and ignores client-side tampering.
- POS transaction stores immutable snapshots:
  - `discount_label_snapshot`
  - `discount_rate_snapshot` (percentage, `0.0000` to `100.0000`)
- Special-discount identity evidence:
  - For discount labels that map to `senior`, `pwd`, or `national_athlete`, request must include:
    - `discount_beneficiary.category`
    - `discount_beneficiary.name`
    - `discount_beneficiary.id_number`
  - Evidence is stored in immutable transaction metadata and exposed in compliance package exports.

Payment handoff policy (current contract):
- Optional request field: `payment_handoff_mode` (`external` | `internal`).
- Default behavior:
  - `cash` -> `internal`
  - non-cash (`gcash`, `maya`, `card`, `bank_transfer`) -> `external`
- When BSP OPS controls are incomplete, internal non-cash flows are denied with reason-coded compliance errors; external handoff remains allowed.

**Permission**: `pos:transact`
**Plan Gate**: Premium (`requirePremium`)

**Compliance Gate (dual-mode, fail-closed for compliant mode)**
Checkout is evaluated by the compliance policy engine:
1. `compliance_mode_choice_required=true` blocks checkout and terminal operations (`LEGACY_MODE_SELECTION_REQUIRED`).
2. `non_compliant_active` allows checkout with non-fiscal receipt contract only (`document_type=non_fiscal_slip`, `document_context=non_fiscal`).
3. `compliant_pending` allows operations, but fiscal output remains blocked until activation checklist is complete.
4. `compliant_active` fails closed when checklist controls are unmet:
   - incomplete profile/settings (`COMPLIANCE_PROFILE_INCOMPLETE`)
   - unverified/missing artifacts (`COMPLIANCE_ARTIFACTS_INCOMPLETE`)
   - missing terminal-qualified accredited peripherals (`TERMINAL_DEVICE_MISMATCH` or `ACCREDITED_PERIPHERAL_REQUIRED`)
   - incomplete RMO 24-2023 filing evidence (`RMO_FILING_EVIDENCE_REQUIRED`)
   - no verified fiscal terminal registration (`FISCAL_TERMINAL_REGISTRATION_REQUIRED`)

Compliance checklist contract (used by Settings > Compliance and Admin review):
- `GET /api/v1/compliance/checklist` includes legacy missing arrays plus guided UX fields:
  - `requirements[]` (`code`, `label`, `section`, `status`, `action_target`)
  - `section_progress`
  - `activation_blockers[]`
  - `next_blocking_step`
  - `documentary_readiness` (`complete`, `total`, `missing`, `ready`, `items[]`)
    - `items[]` includes `quality_ok`, `quality_issues[]`, `fresh`, and `age_days` for deterministic documentary evidence gating
  - `evidence.encryption_policy_prerequisites_ready`
  - `evidence.encryption_policy_checks`
  - `evidence.encryption_policy_issues[]`
  - `evidence.rmo_filing_readiness` (`ready`, `complete`, `total`, `missing`, `items[]`)
    - RMO items include `rmo.control_matrix`, `rmo.filing_authority_decision`, `rmo.receipt_sample_pack`, `rmo.fiscal_integrity_evidence`, and `rmo.esales_reporting_plan`
  - `evidence.fiscal_terminal_registration` (`ready`, `verified_count`, `total_count`)
- `POST /api/v1/compliance/activate` requires body payload:
  - `{ "confirmation_text": "ACTIVATE COMPLIANT" }`
- `POST /api/v1/compliance/mode/revert-to-non-compliant` requires:
  - `reason` (required, min length 3)
  - optional `context` object
  - allowed only from `compliant_pending` or `compliant_active`
  - one successful revert per compliance cycle (`compliance_cycle_version`)

Final Review documentary (tenant self-serve):
- `GET /api/v1/compliance/final-review/documents`
  - Returns tenant documentary records plus sign-off metadata.
- `POST /api/v1/compliance/final-review/documents`
  - Create or update a requirement submission (source type `upload` or `external_url`).
- `POST /api/v1/compliance/final-review/documents/:document_id/upload`
  - Attach or replace uploaded file (multipart form field `file`).
- `PUT /api/v1/compliance/final-review/signoff-metadata`
  - Store tenant sign-off metadata (`engineering_approver`, `compliance_approver`, `filing_batch_id`, signed-at dates).
- `POST /api/v1/compliance/final-review/documents/:document_id/review`
  - Platform-admin only review/revoke/restore (tenant path supports only platform admin actors).

**Calculation Contract**
1. `items_subtotal = sum(line qty * line sale_price)`
2. `discount_amount = selected_discount_percentage * items_subtotal`
3. `net_items_total = items_subtotal - discount_amount`
4. `service_fee_amount = round4(items_subtotal * 0.01)` (mandatory `DGFY convenience fee`)
5. `total_amount = net_items_total + service_fee_amount`

**VAT Rule**
- VAT buckets are computed from discounted item lines only.
- `service_fee_amount` is treated as non-VAT for POS VAT buckets.

**Receipt Document Contract**
- Checkout responses include `receipt_contract` with explicit `document_type` and `document_context`.
- Persisted POS transaction headers include the same explicit fields; `GET /pos/transactions` and `GET /pos/transactions/:id` expose them with the transaction rows.
- Print and preview clients must classify fiscal status only from `receipt_contract.document_type`/`receipt_contract.document_context` or the persisted transaction `document_type`/`document_context`.
- Invoice number prefixes such as `INV-` and `NFS-` are sequence identifiers only. They must not be used by clients to infer fiscal status, choose fiscal headers, or decide whether fiscal print/reprint evidence is required.
- Idempotent checkout replay returns the persisted transaction receipt contract, not a newly inferred contract from the caller payload, invoice prefix, or current compliance policy state.

### GET /pos/transactions
List POS transactions with cashier metadata and pagination.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 200) |
| `search` | string | Invoice number search |
| `status` | string | `completed` or `voided` |
| `cashier_id` | number | Filter by cashier user id |
| `payment_type` | string | `cash`, `gcash`, `maya`, `card`, `bank_transfer` |
| `order_method` | string | `dine_in`, `takeout`, `pickup`, `delivery` (legacy `online` accepted for historical filters) |
| `order_source` | string | `in_store`, `online_store` |
| `date_from` | ISO date | Inclusive start date filter |
| `date_to` | ISO date | Inclusive end date filter |

### GET /pos/transactions/:id
Get full POS transaction details (header + lines + item snapshots).

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

### GET /pos/terminal/shifts/current
Get the current open shift and cash summary for a terminal.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `terminal_id` | string | Terminal identifier (e.g. `COUNTER-01`) |

### POST /pos/terminal/shifts/open
Open a terminal shift for cashier operations.

**Permission**: `pos:transact`
**Plan Gate**: Premium (`requirePremium`)

Shift opening uses a logical terminal contract. The selected `terminal_id` must
be active in the terminal registry and assigned to a location that the operator
is authorized to use. A physical-device pairing cookie is not required.

**Request Body**
```json
{
  "idempotency_key": "shift-open-20260409-counter-01",
  "terminal_id": "COUNTER-01",
  "opening_float_amount": 500.0,
  "opening_note": "Start of day float"
}
```

**Response Notes**
- Successful responses include:
  - `data.idempotent_replay` (`true` for replay hit, otherwise `false`)
  - `data.replay_outcome` (`processed` or `idempotent_replay`)
  - `data.terminal_identity_policy` with mode/registry context and optional warning metadata
- Idempotency conflict/blocked outcomes return error payloads with `errors.idempotency.outcome` (`conflict` or `blocked`).
- Frontend contract: terminal unlock/sign-in must resolve and forward a concrete `terminal_id` to shift/dashboard/checkout flows. The backend still requires `terminal_id` for shift opening. In `warn` registry mode, a first-use tenant with no active registry entry and no stored terminal may resolve `COUNTER-01` as the default terminal identity before storing terminal state. In `enforce` mode, the frontend must block unlock/shift actions until an admin configures an active terminal in Settings > POS Setup > Terminal Registry.
- Registry policy is mode-driven:
  - `warn`: operation continues with warning reason codes (`TERMINAL_ID_MISSING_WARN`, `TERMINAL_ID_UNREGISTERED_WARN`)
  - `enforce`: operation is denied when registry controls fail (`TERMINAL_REGISTRY_REQUIRED`, `TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY`, `TERMINAL_ID_NOT_REGISTERED`)

### POST /pos/terminal/shifts/:id/cash-events
Record a cash drawer adjustment event for an active shift.

**Permission**: `pos:cash_drawer_adjust`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "cash-event-20260409-001",
  "event_type": "cash_in",
  "amount": 100.0,
  "reason": "Petty cash top-up"
}
```

**Response Notes**
- Successful responses include `data.idempotent_replay` and `data.replay_outcome` with the same contract as shift-open.

### POST /pos/terminal/shifts/:id/close
Close a terminal shift and lock in shift-level cash variance data.

**Permission**: `pos:close_day`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "shift-close-20260409-001",
  "closing_cash_amount": 1200.0,
  "closing_note": "End of shift handover"
}
```

**Response Notes**
- Successful responses include `data.idempotent_replay` and `data.replay_outcome` with the same contract as shift-open.

### GET /pos/terminal/dashboard/today
Get today dashboard totals for terminal operations.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `terminal_id` | string | Terminal identifier (e.g. `COUNTER-01`) |

### GET /pos/incoming-orders
List incoming online orders for POS fulfillment queue.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `location_id` | number | Optional active location filter |
| `limit` | number | Optional row limit (default 200, max 500) |

**Response Notes**
1. Returns orders still in operational queue (`placed`, `confirmed`, `preparing`, `ready_for_pickup`, `out_for_delivery`).
2. Completed, cancelled, and rejected orders are excluded from this queue endpoint.

### PATCH /pos/orders/:id/status
Update online order fulfillment status from POS terminal operations.

**Permission**: `pos:transact`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "order-status-20260409-789-completed",
  "fulfillment_status": "confirmed"
}
```

**Supported Status Values**
- `placed`
- `confirmed`
- `preparing`
- `ready_for_pickup`
- `out_for_delivery`
- `completed`
- `cancelled`
- `rejected`

**Transition Notes**
1. Allowed transitions are lifecycle-validated server-side.
2. Delivery orders must progress to `out_for_delivery` (not `ready_for_pickup`).
3. Non-delivery orders must use `ready_for_pickup` where applicable.
4. Successful responses include:
   - `data.idempotent_replay`
   - `data.replay_outcome`
   - `data.status_transition` (`current_status`, `requested_status`, `order_method`, `applied_by`, `applied_at`)
   - `data.idempotency` (`key`, `request_fingerprint`, `outcome`, `idempotent_replay`)
5. Conflicts/blocked replays surface deterministic idempotency details in error payloads.
6. Invalid transitions return `409` with `errors.order_lifecycle.reason_code` and transition metadata.

### POST /pos/z-reading/close-day
Generate same-day Z-reading summary for completed POS transactions.

**Permission**: `pos:close_day`
**Plan Gate**: Premium (`requirePremium`)

**Extended Response Fields (non-breaking)**
- `snapshot_persisted` (`boolean`)
- `reading_identifier` (`string`, stable per persisted close-day snapshot)
- `counters`:
  - `z_counter`
  - `reset_counter`
  - `lifetime_grand_total_cents`
  - `lifetime_grand_total`

### GET /pos/z-reading/:date
Retrieve Z-reading summary for a specific business date (`YYYY-MM-DD`).

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

When a persisted snapshot exists for the requested date, response uses the stored snapshot payload.
When no snapshot exists, response is computed on demand with `snapshot_persisted=false`.

Z-reading summary includes:
- `transaction_count`
- `subtotal_amount`
- `discount_amount`
- `service_fee_total`
- VAT buckets and `total_amount`
- `payment_breakdown[]`

### GET /pos/x-reading/current
Retrieve an in-progress (on-demand) X-reading snapshot for a business date and optional terminal.

**Permission**: `pos:view`
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `business_date` | ISO date | Optional business date (`YYYY-MM-DD`, defaults to today in Manila business timezone) |
| `terminal_id` | string | Optional terminal filter |

**Response Notes**
- Always computed on-demand (`snapshot_persisted=false`).
- Includes `reading_identifier` with `XR-` prefix.
- Includes current counters (`z_counter`, `reset_counter`, `lifetime_grand_total_cents`, `lifetime_grand_total`).

### POST /pos/z-reading/governed-reset
Record a governed reset-counter increment event with immutable event metadata.

**Permission**: `pos:close_day`
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "reason": "Audit reset event after regulator validation",
  "evidence_ref": "AUDIT-2026-04-08-001",
  "confirmation_text": "INCREMENT RESET COUNTER"
}
```

**Response Notes**
- Increments `reset_counter`.
- Persists a reset event snapshot (`reading_identifier` with `RST-` prefix) for audit traceability.
- Returns updated counters and `reset_event_identifier`.

### GET /reports/compliance-package
Return compliance books package with stable schema contracts for:
1. `sales_journal`
2. `purchase_journal`
3. `inventory_book`
4. `special_discount_journal`

**Permission**: `reports:view` (same report-surface policy as other report endpoints)
**Plan Gate**: Existing report gates

**Response Fields**
- `schema_version` (`compliance-books.v1`)
- `generated_at`
- `date_range`
- `sales_journal.columns[]`, `sales_journal.rows[]`
- `purchase_journal.columns[]`, `purchase_journal.rows[]`
- `inventory_book.columns[]`, `inventory_book.rows[]`
- `special_discount_journal.columns[]`, `special_discount_journal.rows[]`
- `record_counts`
- `submission_manifest` (`version`, `filing_profile`, `generated_at`, `checksums`, `instructions_ref`)
  - `checksums` includes journal hashes plus documentary artifact hashes:
    - `system_flow_diagram_sha256`
    - `system_flow_diagram_image_sha256`
    - `software_specification_sha256`
    - `backup_disaster_recovery_plan_sha256`
    - `filing_instructions_sha256`
    - `restore_drill_evidence_sha256`
    - `encryption_verification_evidence_sha256`

**Security Signal Notes**
- Large exports (threshold-based) emit immutable compliance security signal audit events (`event_type=security_signal`, `operation=security.mass_export_threshold_reached`) for breach-readiness evidence.

### GET /reports/compliance-package/export
Return submission-ready compliance export bundle metadata and CSV file payloads for filing workflows.

**Permission**: `reports:view`
**Plan Gate**: Existing report gates

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `startDate` | ISO datetime | Optional inclusive range start |
| `endDate` | ISO datetime | Optional inclusive range end |
| `filing_profile` | string | Optional filing profile token (`dgfy` default) |

**Response Fields**
- `bundle_name`
- `generated_at`
- `filing_profile`
- `submission_manifest`
- `record_counts`
- `files[]` (`name`, `mime_type`, `content`)

---

## Storefront Discovery And Guest Store Endpoints

### GET /settings
Return tenant system settings for IMS Settings.

**Auth**: Private

**Response Notes**
- Persisted settings are returned by key from tenant `system_settings`.
- `store_is_visible.value=true` means the tenant may appear in public DGFY discovery search and public storefront profile reads. A map pin requires a valid active primary location unless `store_has_no_location.value=true`, in which case the storefront remains searchable/profile-readable but is excluded from map pins, embedded profile maps, directions links, and public branch-location responses. `store_is_visible.value=false` hides both discovery and the canonical root-handle public profile page (`/:store_tenant_slug`). `/store/:slug` and `/tenant-store/:slug` are compatibility paths only.
- `store_has_no_location.value=true` is a reversible merchant setting. It preserves saved IMS tenant locations but public Storefront APIs must treat the storefront as search/profile-only until the setting is turned off and a primary pin is published.
- `customer_access_modes_enabled` is an additive read-only virtual key, not a persisted tenant setting. It reflects the effective runtime Customer Access Mode enforcement state for the current tenant context.
- `customer_access_modes_enabled.value=true` means public Storefront Customer Access Mode enforcement is active for the tenant.
- `customer_access_modes_enabled.value=false` means the global rollback switch is active for the tenant. Operators should treat `CUSTOMER_ACCESS_MODES_ENABLED=false` as rollback-only and use `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` for tenant re-enablement while recovery evidence is gathered.

### POST /settings/storefront-assets/:asset_type
Upload or replace tenant storefront branding image from IMS Settings.

**Auth**: Private (`master admin`, `admin` role, or `settings:storefront_branding_edit`)
**Request**: `multipart/form-data` with `image` file field
**Params**:
- `asset_type`: `cover` or `profile`
**Accepted image MIME types**:
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/bmp`
- `image/avif`
**Validation**:
- Server enforces MIME allowlist and binary signature (magic-byte) validation.
- Maximum upload size: `5 MB`.

**Response Data**
- `asset_type`
- `image_url` (backend-relative `/uploads/...` path)

### DELETE /settings/storefront-assets/:asset_type
Remove tenant storefront branding image from IMS Settings.

**Auth**: Private (`master admin`, `admin` role, or `settings:storefront_branding_edit`)
**Params**:
- `asset_type`: `cover` or `profile`

**Response Data**
- `asset_type`
- `deleted` (`true`)

### Tenant Location Pin Endpoints
Manage tenant-private storefront/POS/service location pins from IMS Settings.

**Auth**: Private (`system:edit_settings`)

IMS location clients should submit the merchant-editable address with the normal location payload. The shared map pin picker may suggest an address from first-party PH-local reverse geocoding after adjust-mode click, marker drag, or geolocation selection, but backend persistence treats the submitted address text and the submitted latitude/longitude as separate fields; reverse-geocode failure must not prevent saving valid coordinates. Address suggestions may fill an empty address field, but must not overwrite merchant-edited text unless the merchant applies the suggestion. IMS clients must not coerce empty coordinate fields to `0`; missing values, `0,0`, and coordinates outside the Philippines are invalid merchant storefront pins and must be blocked before tenant-location create/update calls.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/tenant-locations?include_inactive=true` | List active and inactive tenant location pins plus storefront sync metadata |
| `POST` | `/tenant-locations` | Create a location pin |
| `PUT` | `/tenant-locations/:id` | Update location details, active/open state, or primary storefront flag |
| `DELETE` | `/tenant-locations/:id` | Deactivate a location while preserving history |
| `DELETE` | `/tenant-locations/:id/permanent` | Permanently delete an unused pin only |

**Permanent Delete Contract**
- Use permanent delete only for pins with no inventory, POS, booking, service, or user-location history.
- IMS Settings exposes permanent delete only after a location is inactive; active pins stay on the deactivate/reactivate path first.
- The backend checks tenant-local operational references before deleting and refreshes Storefront discovery after successful deletion.
- The reference guard fails closed. If any named tenant-local reference model is missing from the active tenant context or cannot count rows, permanent delete returns `503` with `error_code=SERVICE_UNAVAILABLE`; clients should not retry as a delete success or assume zero references.
- A blocked delete returns `409` with `error_code=CONFLICT` and `errors.reference_counts`. Clients should surface those counts and keep deactivate as the safe fallback.
- A database FK conflict raised by a concurrent dependent write is also returned as `409 CONFLICT`; clients should handle it the same as a reference-count block.

**Blocked Delete Example**
```json
{
  "success": false,
  "data": null,
  "message": "Location has operational history and cannot be permanently deleted. Deactivate it instead.",
  "error_code": "CONFLICT",
  "errors": {
    "reference_counts": {
      "posTransactions": 2,
      "serviceBookings": 1,
      "total": 3
    }
  }
}
```

**Reference Guard Unavailable Example**
```json
{
  "success": false,
  "data": null,
  "message": "Location reference guard is unavailable. Permanent delete is disabled until tenant schema/runtime is healthy.",
  "error_code": "SERVICE_UNAVAILABLE",
  "errors": {
    "source_key": "serviceBookings",
    "model_name": "ServiceBooking",
    "reason": "model_missing_from_tenant_context"
  }
}
```

### GET /storefront/discovery
List publicly discoverable stores for list/grid/map storefront views.

**Auth**: Public
**Tenant Context**: Not required for this discovery endpoint
**Caching Contract**: `Cache-Control: public, max-age=20, s-maxage=20, stale-while-revalidate=40, stale-if-error=90`

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional keyword against store name/slug/address/location or tenant catalog item name; bounded public aliases are applied for approved customer-facing terms such as `aircon`, `A/C`, `AC`, `air conditioning`, and `air conditioner` |
| `latitude` | number | Optional user latitude for distance sorting |
| `longitude` | number | Optional user longitude for distance sorting |
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 100) |
| `result_mode` | string | Optional match mode: `union` (default), `item_only`, `store_only` |
| `stock_filter` | string | Optional item-match stock scope: `in_stock_only` (default when `search` is present) or `include_out_of_stock` |
| `pin_scope` | string | Optional map pin scope: `nearest_matching_branch` (default when coordinates are provided), `all_matching_branches`, `tenant_primary` |
| `include_match_meta` | boolean | Optional, defaults `true`; when `false`, match metadata fields are omitted from each row |

**Search Notes**
- Tenants with `store_is_visible=false` are excluded from public discovery/map responses and public profile reads. This tenant-level public visibility switch is evaluated before Customer Access Mode; hidden tenants are not exposed as Map Listing Only entries.
- Tenants with `store_is_visible=true` and `store_has_no_location=true` are included only when the customer expresses search/filter intent. Their discovery/profile coordinates are nullable, `/storefront/discovery/map-pins` excludes them, and clients must not coerce nullable coordinates to `0`.
- Item-name search includes tenants that have matching catalog items from indexed storefront snapshots.
- Search matching is index-backed and deterministic. It is not a general fuzzy-search engine; bounded alias expansion is shared between `item_search_snapshot` generation and discovery query matching so common public terms can match equivalent catalog/service wording without making unrelated short strings match.
- Default item-search behavior is stock-aware (`in_stock_only`) unless caller explicitly requests `include_out_of_stock`.
- The current Storefront web client explicitly requests `stock_filter=include_out_of_stock` so broad customer discovery can still show out-of-stock item matches with match metadata. API consumers that omit the parameter keep the backend stock-aware default.
- `union` mode returns the union of store-field matches and eligible item matches.
- `pin_scope` changes discovery anchor/pin behavior for map/list/grid without changing checkout source contracts.
- Storefront map marker preview cards may combine discovery-row branding and match metadata with `/store/locations` branch data. The indexed discovery row latitude/longitude selected by the active `pin_scope` is authoritative for marker placement; branch-location enrichment may add names, addresses, and routing metadata only when it matches the selected indexed `location_id`. The card action must route with the pinned branch `location_id` when available so catalog, quote, checkout, and booking reads stay scoped to the selected fulfillment location. Clients must not mutate stored branch coordinates for visual spreading; same-coordinate pins should render as an exact-coordinate shared marker or equivalent grouping that preserves the stored coordinate and selected `location_id`.
- Tenant-scoped public Storefront reads that use `X-Store-Slug`, including `/store/locations`, must vary cache entries by `X-Store-Slug`; otherwise browser or proxy caches can reuse another tenant's branch-location payload and collapse distinct discovery pins into one shared marker.
- Storefront-visible item-search eligibility follows shared catalog policy precedence: explicit `storefront_catalog_overrides.storefront_visible` first; temporary rollout fallback uses `pos_visible` only when Storefront override data is unavailable; otherwise products default to `category=product` + `product_type=finished_goods`, and services default to visible when service metadata exists with `visible_in_storefront !== false` and `bookable !== false`.
- When Customer Access Mode enforcement is active, tenants whose effective mode is `ghost` remain discoverable by store/profile fields but are not eligible for item-search matches. Enforcement is active by default; `CUSTOMER_ACCESS_MODES_ENABLED=false` is an explicit rollback switch, and `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` can re-enable selected tenants during rollback recovery.

**Discovery Row Metadata**
- When `include_match_meta=true`, discovery rows include:
  - `match_reasons` (`store`, `item`, or both)
  - `matching_item_count`
  - `matching_item_sample`
  - `has_in_stock_match`
  - `matching_location_ids`
  - `nearest_matching_location_id`
- Response also includes `applied_filters` with resolved values for `result_mode`, `stock_filter`, `pin_scope`, and `include_match_meta`.
- Discovery rows also include optional tenant branding fields:
  - `storefront_cover_image_url`
  - `storefront_profile_image_url`
- Discovery rows include additive Customer Access metadata materialized from the public discovery index so clients can hide order/cart CTAs before profile load:
  - `customer_access_mode`
  - `effective_customer_access_mode`
  - `max_customer_access_mode`
  - `inventory_display_mode`
  - `inventory_low_stock_display_threshold`
  - `access_capabilities`
  - `access_limitation_reason`
  - `customer_access_modes_enabled`

### GET /storefront/discovery/map-pins
List publicly discoverable storefront locations in a flat JSON shape for third-party map auto-parsers.

**Auth**: Public
**Tenant Context**: Not required
**Caching Contract**: `Cache-Control: public, max-age=20, s-maxage=20, stale-while-revalidate=40, stale-if-error=90`
**CORS Contract**: Third-party callers such as MapViu must be listed in `PUBLIC_API_CORS_ORIGIN`. This public allowlist applies only to `GET`/`HEAD`/`OPTIONS` reads for public storefront discovery endpoints and does not open authenticated backend APIs.
Unsupported public API CORS methods are rejected as `403` client errors with `CORS_NOT_ALLOWED`.

Supported query parameters match `GET /storefront/discovery`. The backend forces `include_match_meta=false` and defaults `limit=100` when no limit is provided.

Additional map-pins parameters:

| Name | Type | Description |
|------|------|-------------|
| `include_items` | boolean | Optional, defaults `false`; when `true`, each pin includes public available item summary fields from the indexed discovery snapshot |
| `item_limit` | number | Optional, defaults `5`, max `10`; caps `available_items` and the flat `available_item_names` string |

When `include_items=true`, item fields are public availability summaries only. They are scoped to the pin `location_id`, built from the existing Storefront discovery item snapshot, and do not expose exact stock quantities, unit cost, supplier data, company tokens, or unpublished catalog rows.

Response:

```json
{
  "success": true,
  "data": {
    "pins": [
      {
        "title": "DGFY Demo Store",
        "latitude": 10.7202,
        "longitude": 122.5621,
        "subtitle": "Main Branch",
        "description": "Fresh daily",
        "category": "retail",
        "address": "Iloilo City",
        "slug": "dgfy-demo-store",
        "storefront_url": "https://dgfy.ph/store/dgfy-demo-store",
        "tenant_id": "tenant-1",
        "location_id": 10,
        "storefront_open": true,
        "supports_delivery": true,
        "supports_pickup": true,
        "supports_dine_in": false,
        "catalog_count": 12,
        "available_item_count": 2,
        "available_item_names": "A/C Cleaning, A/C Repair",
        "available_items": [
          {
            "name": "A/C Cleaning",
            "category": "service",
            "availability_status": "available"
          },
          {
            "name": "A/C Repair",
            "category": "service",
            "availability_status": "available"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 1,
      "totalPages": 1
    }
  },
  "timestamp": "2026-05-29T00:00:00.000Z"
}
```

### GET /storefront/discovery/:slug
Resolve one storefront profile by tenant slug for public storefront entry.

**Auth**: Public
**Tenant Context**: Not required
**Caching Contract**: `Cache-Control: public, max-age=30, s-maxage=30, stale-while-revalidate=60, stale-if-error=120`

**Security Note**: Discovery payloads do not expose `company_token`.
Profile payload may include optional tenant branding fields:
- `storefront_cover_image_url`
- `storefront_profile_image_url`

Profile payload may also include additive Customer Access metadata:
- `customer_access_mode`
- `effective_customer_access_mode`
- `max_customer_access_mode`
- `inventory_display_mode`
- `inventory_low_stock_display_threshold`
- `access_capabilities`
- `access_limitation_reason`
- `customer_access_modes_enabled`

### GET /store/catalog
List tenant storefront catalog items (public read).

**Auth**: Public
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: public, max-age=45, s-maxage=45, stale-while-revalidate=90, stale-if-error=180`

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name filter |
| `limit` | number | Row limit (default 60, max 200) |
| `location_id` | number | Optional active fulfillment location scope for availability calculation |

Catalog rows include:
- `item_id`, `name`, `category`, `unit_of_measure`
- `is_available` (`true`/`false`)
- `availability_status` (`in_stock`/`out_of_stock`; Services Mode service rows return `bookable`)
- `inventory_display`:
  - `mode` (`hidden | availability | low_stock | exact_quantity`)
  - `label` (customer-facing string or `null`)
  - `display_quantity` only when the inventory display policy explicitly allows a public quantity
- `default_sale_price`
- `vat_type`
- `image_url` (from Storefront catalog override when available; POS image is table-missing rollout fallback only)
  - may be an absolute URL or backend-relative `/uploads/...` path
  - storefront/POS clients should gracefully show a placeholder when image load fails
- `image_gallery`, an ordered array of public Storefront item images. The first entry is the primary image and matches `image_url` when a Storefront image is configured.
- `service_detail` for Services Mode service rows, including duration, payment policy, bookable/storefront visibility, and normalized `intake_form_schema` fields when configured
- `allergens` for F&B menu rows, sourced from `item_allergens`
- `nutrition` for F&B menu rows, sourced from `item_nutrition`
- `fnb_modifier_groups` for F&B menu rows, with active modifier groups/options and server-owned `price_delta` values

**Availability Contract**
- `current_stock` is intentionally not exposed in public storefront catalog payloads.
- `cost_per_unit` is intentionally not exposed in public storefront catalog payloads.
- `default_sale_price` is the only item-level public customer price. Storefront quote/checkout rejects cartable rows with missing or zero `default_sale_price`; it does not fall back to item cost.
- Public catalog listing suppresses otherwise visible rows that do not have `default_sale_price > 0`. Storefront QR item resolution blocks those rows with `STORE_CATALOG_PRICE_REQUIRED` so a price-less item is not customer-visible or cartable through direct links.
- Storefront catalog image upload preserves hidden visibility, but it must not create or preserve a visible Storefront override until the item has `default_sale_price > 0`.
- Exact raw stock remains server-side and is enforced during quote/checkout validation. When Inventory Display is `exact_quantity`, the public response may include normalized `inventory_display.display_quantity`; this is not the raw item record.
- Services Mode service rows are stock-exempt and use service booking validation instead of product quantity availability.
- Compatibility hardening (2026-04-21): when a tenant is temporarily missing `item_location_stocks` schema support (table or required columns), `location_id` requests fail closed to global availability computation and still return `200` (no `500` contract drift).

**Catalog Search Note**
- `search` narrows by item name only; out-of-stock rows are still returned when `storefront_visible=true`.
- Storefront-visible follows shared catalog policy precedence: explicit `storefront_catalog_overrides.storefront_visible` first; temporary rollout fallback uses `pos_visible` only when the new Storefront override table is unavailable; otherwise products default to `category=product` + `product_type=finished_goods`, and services default to visible when service metadata exists with `visible_in_storefront !== false` and `bookable !== false`. A missing row in an existing Storefront override table does not inherit POS state.

**Error Code Contract (Catalog Read)**
- `error_code=STORE_CATALOG_LOCATION_INVALID` (`422`) when `location_id` is invalid.
- `error_code=STORE_CATALOG_RUNTIME_ERROR` (`500`) for unexpected catalog runtime failures.
- When effective mode is `ghost`, catalog read returns `200` with `items=[]` and additive `access_policy` metadata while enforcement is active.
- Compatibility fallback path (missing `item_location_stocks` table/columns) remains non-error and should still return `200`.
- Storefront clients should map catalog error UX from `error_code` first (code-driven guidance), not message-substring heuristics.
- Storefront catalog rendering should be deterministic by state (`loading`, `error`, `empty_setup`, `empty_search_on_zero`, `empty_no_match`, `ready`) to avoid blank states.

### GET /store/qr/resolve
Resolve a public Storefront QR/deep-link barcode value.

**Auth**: Public
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: Same public read contract as catalog.

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `code` | string | Required barcode code, QR URL, or QR payload containing `bc`, `barcode`, `code`, or `/qr/:code` |
| `location_id` | number | Optional active fulfillment location scope for availability calculation |

**Response**
```json
{
  "success": true,
  "data": {
    "status": "resolved",
    "reason_code": null,
    "barcode": {
      "item_barcode_id": 70,
      "scope": "storefront_qr",
      "quantity_multiplier": 1
    },
    "item": {
      "item_id": 601,
      "name": "QR Item",
      "inventory_display": { "mode": "availability", "label": "Available" }
    },
    "cart_allowed": true,
    "checkout_allowed": true,
    "access_policy": { "effective_customer_access_mode": "transaction" }
  }
}
```

**Rules**
- Storefront QR uses Storefront visibility only (`storefront_visible` and service storefront metadata), never POS visibility.
- `ghost` mode blocks item detail exposure. `catalog` exposes item detail only. `inquiry` exposes item detail plus contact affordance. `transaction` allows cart/checkout handoff subject to stock, location, compliance, and payment gates.
- Service booking QR payloads such as `SERVICE_BOOKING:<reference>` resolve to booking/ticket context and redact customer contact fields unless an authenticated/claim flow permits disclosure. They do not hand off to cart.
- Public QR responses do not expose `cost_per_unit` or raw `current_stock`; they use the same `inventory_display` contract as `/store/catalog`.

### Storefront Food & Beverage Endpoints

Food & Beverage storefront routes are public or optional Store JWT tenant routes under `/api/v1/store`. They require an F&B-capable tenant and use the same public tenant resolution as catalog/checkout (`x-store-slug` header).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/store/fnb/reservations` | Optional Store JWT | Create a public reservation/waitlist request with `source=storefront` |

Storefront quote and checkout line payloads may include additive F&B modifier metadata:

```json
{
  "lines": [
    {
      "item_id": 20,
      "quantity": 2,
      "line_modifiers": [
        {
          "modifier_group_id": 5,
          "modifier_option_id": 8
        }
      ]
    }
  ]
}
```

The backend validates selected modifier options against the item's published F&B modifier groups and computes modifier price deltas from database state. Public clients must not treat client-sent modifier price values as authoritative.

### Storefront Services Endpoints

Services Mode storefront routes are public or Store JWT-authenticated tenant routes under `/api/v1/store`. They require a Services-capable tenant and use the same public tenant resolution as catalog/checkout (`x-store-slug` header).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/store/services/catalog` | Public | List bookable storefront-visible service rows with service metadata and normalized intake form schema |
| `GET` | `/store/services/availability` | Public | Return no-store, capacity-aware service slots for a service/date/location/resource/provider/quantity selection |
| `POST` | `/store/services/holds` | Optional Store JWT | Create a short-lived service booking hold for a selected service schedule and capacity scope |
| `POST` | `/store/services/bookings` | Optional Store JWT | Create a service booking/ticket with payment timing, intake responses, and guest/account claim behavior |
| `POST` | `/store/services/bookings/batch` | Optional Store JWT | Create multiple service bookings in one all-or-nothing storefront checkout |
| `GET` | `/store/services/bookings` | Store JWT | List authenticated customer's service bookings |
| `GET` | `/store/services/bookings/:public_reference` | Public limited lookup | Read redacted public ticket/booking status by reference |
| `POST` | `/store/services/bookings/:public_reference/claim` | Store JWT | Claim a booking into the authenticated customer account using a valid short-lived claim token |
| `POST` | `/store/services/waitlist` | Optional Store JWT | Add a customer to the service waitlist |

**Booking/Ticket Contract**
- Public service booking and waitlist mutations fail closed unless `access_capabilities.booking=true` while enforcement is active.
- Public service catalog, availability, holds, bookings, and waitlist mutations accept/forward `location_id` when the customer has selected a branch. If tenant-local `storefront_location_item_overrides.storefront_available=false` for that service item and branch, public reads hide the service and mutations return not found before capacity is reserved.
- Public service booking, booking-hold, and batch-booking mutations also fail closed when the requested `start_at`/`scheduled_for` is outside a valid weekly `storefront_hours` schedule, returning `422` with `reason_code=OUTSIDE_STOREFRONT_BUSINESS_HOURS` before service capacity is reserved.
- Ticket means booking/order confirmation; receipt means payment proof.
- Public booking lookup redacts customer contact details.
- Authenticated customers are auto-linked to new bookings and receive image-download choice only.
- Guests whose email has no existing StoreCustomer account receive a short-lived claim token plus image download.
- Guests whose email already belongs to a StoreCustomer account are not prompted to register/sign in from the receipt prompt; image download remains available.
- Required `intake_form_schema` fields must be answered before booking is accepted.
- `GET /store/services/availability` accepts `service_item_id`, `date` (`YYYY-MM-DD`), optional `location_id`, optional `resource_id`, optional `provider_user_id`, `quantity` (`1+`), and `slot_interval_minutes`. It returns only slots that pass branch Storefront availability, service bookability, positive sale price readiness, lead time, active assignment/resource matching, resource weekly availability, blackout dates, overlapping booking quantity capacity, and active unexpired hold quantity capacity. The response also includes `diagnostics.blocked_counts`, `diagnostics.dominant_blocker`, `diagnostics.setup_warnings`, and `diagnostics.guidance` so storefronts can explain missing slots without exposing private booking details. The response is customer guidance; booking creation still revalidates under the booking mutation.
- `POST /store/services/holds` accepts `service_item_id`, `start_at`, optional `end_at` or `duration_minutes`, `quantity`, optional `location_id`/`resource_id`/`provider_user_id`, required `idempotency_key`, and optional `replace_hold_token`. Active unexpired holds reserve capacity briefly, can be replaced by an edited draft without self-blocking, and must be passed as `hold_token` to the final booking mutation to be consumed.
- Public hold and booking mutations require `idempotency_key` (`8..120` chars). Matching retries replay the existing hold/booking response; reuse with a different request payload returns conflict.
- `quantity` is accepted on service bookings and defaults to `1`; totals and capacity checks multiply by quantity. Quantity above `1` requires a capacity anchor, currently an active assigned service resource. Provider-only and location-only bookings remain effective capacity `1`.
- Single and batch booking payloads may include `hold_token`; the backend revalidates the hold, schedule, quantity, and capacity under transaction and marks a valid consumed hold as `consumed`.
- Batch booking payloads contain shared customer fields and `bookings[]`; each draft carries its own `service_item_id`, `quantity`, schedule, location/resource/provider fields, optional `hold_token`, payment timing, intake responses, and notes. If `resource_id` is omitted, the backend may auto-select an assigned resource with enough compatible capacity.
- Batch booking is all-or-nothing. If any draft fails availability, capacity, payment-policy, intake, or access validation, no booking is created and the error details include `booking_index`.
- Batch booking responses include `bookings[]`, `payments[]`, and a summary `payment` object. Frontends must render every `payments[].checkout_url` for multi-booking prepaid/deposit batches.
- `payment_timing=postpaid` creates an unpaid booking/ticket for POS collection later; `payment_timing=prepaid` depends on the configured commerce adapter and remains separate from fiscal/non-fiscal receipt issuance.

### Storefront Hospitality Endpoints

Hospitality Storefront routes live under `/api/v1/store/hospitality`. Most reads are public; stay history and claim routes require Store JWT. They implement the direct booking-engine contract for customer-facing room availability, room-type pricing, amenities, packages, quote/hold, confirmation, lookup, authenticated stay history, and customer claim. Public responses must expose selling prices and customer-safe availability only; they must never expose item costs, supplier data, internal housekeeping status, internal maintenance notes, or staff-only room movement details.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/store/hospitality/availability` | Public | Search available room types by `check_in_date`, `check_out_date`, optional guest counts, and optional property/location context |
| `POST` | `/store/hospitality/quote` | Public | Build a customer-safe quote for selected room type, room count, packages, and paid add-ons; response is `no-store` |
| `POST` | `/store/hospitality/booking-holds` | Public | Create a persisted short-lived booking hold token for the selected room type and quote; response is `no-store` |
| `GET` | `/store/hospitality/amenities` | Public | List active public amenities, including property, room, paid add-on, facility, accessibility, policy, local area, transport, meal, and package amenities |
| `GET` | `/store/hospitality/packages` | Public | List active customer-facing packages and add-on bundles |
| `POST` | `/store/hospitality/bookings` | Optional Store JWT | Confirm a direct booking from Storefront with a valid active `hold_token`; authenticated customers are linked to `store_customer_id`; response is `no-store` |
| `GET` | `/store/hospitality/bookings` | Store JWT | List authenticated customer's redacted Hospitality stay history |
| `POST` | `/store/hospitality/bookings/:public_reference/claim` | Store JWT | Claim an existing direct booking into the authenticated customer account when the booking email matches the signed-in customer email |
| `GET` | `/store/hospitality/bookings/:public_reference` | Public limited lookup | Customer-safe booking lookup by public reference; response is `no-store` |

**Availability and Booking Contract**
- `room_types[]` includes `room_type_id`, `code`, `name`, `description`, `max_occupancy`, `available_rooms`, `starting_rate`, `currency`, and `amenities`.
- `available_rooms` is capacity-safe, subtracts active reservations and unexpired booking holds, excludes out-of-order/out-of-service rooms, and may be rounded or suppressed later by revenue policy; it must not reveal room-level internal status.
- Room nights and facility bookings are capacity-backed service rows, not stock items. Minibar, retail, housekeeping supplies, linen assets, and physical add-ons remain normal inventory/SKU records when stock is consumed.
- Booking, quote, hold, payment, refund, and folio mutation routes must be `no-store`.
- Direct Storefront booking confirmation requires a valid unexpired hold token matching room type and stay dates.
- Idempotency keys and request hashes are persisted for booking confirmation. Matching replay returns the existing reservation; mismatched replay fails with an idempotency conflict.
- Optional Store JWT booking confirmation saves `store_customer_id`; authenticated stay history and claim responses are redacted to the same customer-safe booking summary used by public lookup.
- Claim by public reference is email-bound. A signed-in customer cannot claim a booking whose stored booking email belongs to a different address, and an already-linked booking cannot be moved to another customer account.
- Quote responses include `pricing.deposit_due`, `pricing.payment_collection`, and `pricing.payment_due_at`. Current v1 direct booking uses `payment_collection=property_collects`; no online card authorization or deposit capture is performed by Hospitality Storefront until a separate payment-adapter ADR is accepted.
- Booking payloads may persist future channel reconciliation fields: `external_source`, `external_reference`, and `channel_metadata`. These fields are metadata only; v1 does not poll, push, or reconcile live OTA/channel inventory.
- Staff reservation creation may request `auto_assign_rooms=true` to assign available physical rooms by PMS room-status priority. Check-in/in-house transitions must ensure each reservation-room row is assigned to a physical room before stays are created.
- Booking confirmation, reservation lifecycle changes, folio posting, and maintenance blocking write Hospitality domain audit events and mirror those events into the existing tenant `audit_logs` table using valid `CREATE`/`UPDATE`/`DELETE`/`VIEW` enum actions.
- Public lookup redacts guest contact/private notes and returns only `public_reference`, status, source, dates, selected rooms, total amount, deposit amount/due, payment collection status, and payment status.

## Hospitality Admin Endpoints

Hospitality admin routes live under `/api/v1/hospitality`, require authentication, and require the active tenant workflow mode to expose the `hospitalityReservations` capability. Controllers are transport-only; business behavior belongs in Hospitality use cases and repositories.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/hospitality/dashboard` | `hospitality:dashboard:view` or reports view | Today dashboard: arrivals, departures, in-house stays, room status counts, housekeeping, and maintenance |
| `GET` | `/hospitality/availability` | reservations/rooms view | Staff availability lookup |
| `GET`/`POST` | `/hospitality/room-types` | rooms view/manage | Manage sellable room types, occupancy, rate baseline, amenities snapshot, and policies |
| `GET`/`POST` | `/hospitality/rooms` | rooms view/manage | Manage physical rooms and room status |
| `PATCH` | `/hospitality/rooms/:room_id/status` | rooms manage or housekeeping manage | Update PMS room/housekeeping/maintenance status with audit-ready intent |
| `GET`/`POST` | `/hospitality/guests` | guests or reservations view/manage | Manage guest profiles |
| `GET`/`POST` | `/hospitality/reservations` | reservations view/manage | Manage direct/admin reservations; mutations are `no-store` |
| `PATCH` | `/hospitality/reservations/:reservation_id/status` | reservations manage | Confirm, check in, mark in-house, check out, cancel, or no-show |
| `PATCH` | `/hospitality/reservations/:reservation_id/rooms/:reservation_room_id` | reservations or rooms manage | Move or assign a reservation room after validating ownership, matching room type, and room conflict |
| `GET` | `/hospitality/stays` | reservations view | List in-house and historical stays |
| `GET`/`POST` | `/hospitality/rate-plans` | rates view/manage | Manage rate plans and policy metadata |
| `GET`/`POST` | `/hospitality/folios` | folios view/manage | Manage folios attached to reservations, stays, or guests |
| `POST` | `/hospitality/folios/:folio_id/lines` | folios manage or POS transact | Post room charges, taxes, fees, deposits, payments, refunds, amenities, minibar, retail, room service, and adjustments |
| `GET`/`POST` | `/hospitality/housekeeping/tasks` | housekeeping view/manage | Manage room-turnover and inspection work |
| `PATCH` | `/hospitality/housekeeping/tasks/:task_id` | housekeeping manage | Advance housekeeping status |
| `GET`/`POST` | `/hospitality/maintenance/requests` | maintenance view/manage | Manage room/facility maintenance and blocking workflow |
| `PATCH` | `/hospitality/maintenance/requests/:request_id` | maintenance manage | Advance maintenance status |
| `GET`/`POST` | `/hospitality/amenities` | amenities view/manage | Manage property, room, paid add-on, facility, accessibility, policy, local-area, transport, meal, and package amenities |
| `POST` | `/hospitality/room-amenities` | amenities/rooms manage | Link amenities to room types or specific rooms |
| `POST` | `/hospitality/property-amenities` | amenities manage | Link amenities to the property/location level |
| `GET`/`POST` | `/hospitality/facilities` | facilities view/manage | Manage pool/gym/spa/laundry/business center/parking/shuttle/meeting-room facilities |
| `POST` | `/hospitality/facilities/bookings` | facilities or reservations manage | Book capacity-backed facilities for a guest/reservation time window |
| `GET`/`POST` | `/hospitality/packages` | amenities or rates view/manage | Manage stay packages and add-on bundles |
| `POST` | `/hospitality/packages/items` | amenities or rates manage | Link amenities, facilities, or physical items into a package |
| `GET`/`POST` | `/hospitality/guest-messages` | guests or reservations view/manage | Store internal/storefront guest communication drafts and history |
| `GET` | `/hospitality/reports` | hospitality reports or reports view | Hospitality report summary surface for occupancy and operational metrics |

**Mode Boundary**
- Hospitality hides manufacturing, dispatch, production, F&B dining, and Services booking routes unless a future ADR explicitly shares a boundary.
- Inventory, suppliers, POS, reports, settings, users, and storefront remain available with Hospitality labels and guards.
- POS usage in Hospitality is front-desk/on-property charging: charge to room, minibar/retail stock deduction, paid amenities/add-ons, deposits, refunds, and folio settlement. Folio `payment` and `deposit` lines reduce balance; `refund` lines reverse payments and increase balance.
- Staff can send `auto_assign_rooms=true` when creating a reservation. The backend assigns available rooms by PMS room-status priority and returns a conflict if insufficient assignable rooms exist.
- `PATCH /hospitality/reservations/:reservation_id/status` may include `check_in_date` and/or `check_out_date` with the desired `status`; date changes update the reservation and reservation-room dates only after assigned-room conflicts and unassigned room-type capacity are revalidated.
- Checkout returns `HOSPITALITY_FOLIO_BALANCE_DUE` while open folios have a positive balance. Staff may send `override_open_balance=true`; this flag permits the action but is removed before reservation persistence.
- Room moves emit Hospitality audit events with before/after `room_id` and reservation context. Status changes emit before/after status, dates, and reservation-room summaries.
- Manager reports expose occupancy percentage, ADR, RevPAR, unassigned arrivals, and out-of-order room counts in addition to arrivals, departures, in-house, housekeeping, and maintenance counts.

## Services Admin Endpoints

Services Mode IMS/POS operator routes live under `/api/v1/services`. They require tenant authentication plus the Services workflow capability guard. The Permission column lists the primary mode-native permission. Generic compatibility fallback remains enabled by default for legacy users and can be disabled with `MODE_RBAC_GENERIC_FALLBACK_ENABLED=false` after remapping.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/services/dashboard` | `services:dashboard:view` | Service desk metrics, future bookings, expected revenue, postpaid aging, reminders due, waitlist counts |
| `GET` | `/services/catalog` | `services:catalog:view` | List service catalog entries with service metadata |
| `POST` | `/services/catalog` | `services:catalog:manage` | Create item-backed service catalog entry and service detail metadata |
| `PUT` | `/services/catalog/:item_id` | `services:catalog:manage` | Update service catalog metadata |
| `GET`/`POST` | `/services/resources` | `services:resources:view` / `services:resources:manage` | List/create service resources such as providers, rooms, equipment, vehicles, or stations |
| `GET`/`POST`/`PATCH` | `/services/assignments` | `services:resources:view` / `services:resources:manage` | Link services to resources/providers/locations and deactivate assignments |
| `GET`/`POST` | `/services/bookings` | `services:bookings:view` / `services:bookings:manage` | List/create operator bookings |
| `PATCH` | `/services/bookings/:booking_id/status` | `services:bookings:manage` | Move bookings through allowed lifecycle transitions |
| `GET`/`POST`/`PATCH` | `/services/waitlist` | `services:waitlist:view` / `services:waitlist:manage` | Manage waitlist entries |
| `GET` | `/services/clients` | `services:clients:view` | Client history, repeat-client, no-show, and spend signals |
| `GET`/`POST` | `/services/reminders` | `services:reminders:view` / `services:reminders:manage` | List reminder outbox rows and queue/process due reminders |

**Lifecycle Contract**
- Booking statuses are `requested`, `confirmed`, `checked_in`, `in_service`, `completed`, `cancelled`, and `no_show`.
- Status updates are transition-guarded; arbitrary jumps are rejected.
- Resource/provider validation enforces active resources, weekly availability, blackout dates, capacity, and service assignment compatibility.
- Reminder sends are auditable: rows can be queued, sent, skipped, or failed; SMTP-missing state is skipped, not treated as sent.

### GET /store/locations
List active tenant fulfillment locations for a specific storefront tenant page.

**Auth**: Public
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: public, max-age=30, s-maxage=30, stale-while-revalidate=60, stale-if-error=120`

**Response Notes**
1. Returns active locations only.
2. Includes `primary_location_id`.
3. Discovery (`/storefront/discovery`) remains one row per tenant.
4. Storefront UI may additionally resolve `/store/locations` per tenant and rank/map by nearest active branch pin while still opening the same tenant page.
5. Storefront marker preview cards should use these location rows for branch name, address, status, coordinates, and the `location_id` passed into the tenant page route. Any visual offset used to separate overlapping pins is presentation-only.

### POST /store/cart/quote
Compute quote totals for guest or store-customer checkout.

**Auth**: Optional store customer (`Store JWT` or global DGFY account JWT). When a DGFY account JWT is supplied, the backend lazily links or creates the tenant-local `store_customers` row before applying existing customer/account behavior.
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`

Route mapping note:
- Public API path is `/api/v1/store/cart/quote`.

**Validation Note**
- When requested quantity exceeds current stock, response is `422` with machine-readable stock violation details in `errors`.
- Stock-bearing rows are validated by aggregate requested quantity per `item_id`, not by each submitted line alone. Duplicate product lines, F&B modifier-split lines, physical Services Mode add-ons, and future customized stock-bearing lines cannot exceed the selected location's available stock in one quote.
- When effective Customer Access Mode is not `transaction`, response is `403` with `error_code=CUSTOMER_ACCESS_MODE_BLOCKED` while enforcement is active.
- Customer Access Mode block details include `requested_action`, `requested_mode`, `effective_mode`, `limitation_reason`, and `allowed_capabilities`.

**Pricing Contract**
- Response totals now include:
  - `service_fee_amount`
  - `service_fee_label` (`DGFY convenience fee`, deterministic even when amount is `0`)
- Quote formula:
  - `service_fee_amount = round4(subtotal_amount * 0.01)`
  - `total_amount = subtotal_amount + delivery_fee + service_fee_amount`

### POST /store/checkout
Create online-store order and return tracking metadata.

**Auth**: Optional store customer (`Store JWT` or global DGFY account JWT)
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`

Route mapping note:
- Public API path is `/api/v1/store/checkout`.

**Validation Note**
- Validation or stock-constraint breaches return `422` with machine-readable error details.
- Checkout uses the same aggregate stock-bearing `item_id` quantity validation as quote before persisting lines. Separate submitted lines remain separate receipt/order lines, but their combined stock demand must fit available stock unless the selected location explicitly allows out-of-stock sales.
- When effective Customer Access Mode is not `transaction`, response is `403` with `error_code=CUSTOMER_ACCESS_MODE_BLOCKED` while enforcement is active.
- When `storefront_hours` contains a valid weekly business-hours schedule, immediate checkout uses the current tenant/server time and scheduled checkout uses `scheduled_for`; product quotes and orders outside configured hours return `422` with `reason_code=OUTSIDE_STOREFRONT_BUSINESS_HOURS`.
- Server errors (`500`) are not the expected contract for normal checkout validation failures.

**Persistence Contract**
- Checkout persists service-fee snapshots from the same fixed policy as quote:
  - `service_fee_amount`
  - `service_fee_label_snapshot` (`DGFY convenience fee`, deterministic even when amount is `0`)
  - `service_fee_method_snapshot` (order method for traceability)
  - `service_fee_overridden=false`
- Direct `/store/checkout` requests cannot self-finalize `payment_type=qrph`; QR Ph orders are committed only by the PayMongo webhook after a matching payment session reaches `payment.paid`.
- Services, F&B reservations, and Hospitality reservations do not use QR Ph commerce payment sessions yet. They remain blocked from QR Ph until hold-bound payment sessions are implemented.

### POST /store/checkout/payment-sessions
Create a PayMongo QR Ph payment session for Storefront online checkout. This is a payment handoff, not an order commit.

**Auth**: Optional store customer (`Store JWT`)
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`

**Request**
- Same payload as `/store/checkout`.
- `payment_type` must be `qrph`.
- `idempotency_key` is required and scoped to tenant + target type.

**Response (201)**
```json
{
  "payment_session": {
    "public_reference": "CPS-ABC123DEF4",
    "status": "awaiting_payment",
    "provider": "paymongo",
    "payment_method": "qrph",
    "qr_code_image_url": "data:image/png;base64,...",
    "expires_at": "2026-05-19T12:30:00.000Z",
    "service_fee_amount": 10,
    "service_fee_label": "DGFY convenience fee",
    "fee_policy": {
      "dgfy_fee_basis": "subtotal",
      "dgfy_fee_charged_to": "customer",
      "provider_fee_shoulder": "tenant_company"
    },
    "total_amount": 1010
  }
}
```

**Settlement Contract**
- The Storefront quote remains authoritative for totals.
- The mandatory DGFY 1% is stored as `service_fee_amount` and sent to PayMongo as a fixed split amount in centavos.
- The tenant PayMongo child merchant receives the remaining net settlement through `transfer_to`.
- PayMongo/provider processing, payout, bank, dispute, and related fees are not added to the DGFY 1%; they are shouldered by the tenant company and reduce company net settlement unless a signed provider contract says otherwise.
- QR Ph sessions finalize the Storefront order only after PayMongo sends `payment.paid`.

### GET /store/checkout/payment-sessions/:payment_session_id
Read the current public payment-session state for polling after QR Ph creation.

### Admin PayMongo Commerce Operations
Platform-admin endpoints for testing and operating the full PayMongo QR Ph commerce method.

`tenant_id` values in these endpoints are landlord tenant UUIDs. Integer tenant IDs are invalid because `tenants.id` is UUID-backed.

Sandbox credential verification is repeatable with `npm --prefix backend run verify:paymongo:sandbox`; the script checks PayMongo QR Ph Payment Intent creation, Payment Method creation, and QR next-action attachment using redacted output.

Webhook endpoint readiness is repeatable with `npm --prefix backend run verify:paymongo:webhook -- <https-webhook-url>`. The expected unsigned probe response is `401`; `404` means the route is not deployed/mounted, and any `2xx` unsigned response means signature enforcement is unsafe.

**PayMongo Test Webhook Endpoint**

For local sandbox runs through ngrok, configure PayMongo with:

```text
https://NGROK-FORWARDING-HOST/api/v1/commerce-payments/paymongo/webhook
```

Required events: `payment.paid`, `payment.failed`, `payment.refund.updated`, `payment.refunded`, `qrph.expired`, and linked-account activation/decline events (`account.*` or `merchant.*` as exposed by the PayMongo Dashboard for the account).

Unsigned manual probes should return `401 Invalid PayMongo webhook signature`. That is expected and confirms the public URL reaches the webhook route while still rejecting forged payloads.

After `PAYMONGO_TEST_WEBHOOK_SECRET` is configured, a locally signed fake payment event with a non-existent `commerce_payment_session` should return `200` with `handled=false` and `reason=session_not_found`. That proves signature verification and repository lookup execute without accepting a forged order finalization.

**PayMongo Live Webhook Endpoint**

Production live webhooks use the same route on the production backend:

```text
https://skupervisor.surebizcorp.com/api/v1/commerce-payments/paymongo/webhook
```

The production server must use `PAYMONGO_MODE=live` and `PAYMONGO_LIVE_WEBHOOK_SECRET`. If an unsigned probe returns `404`, the backend route is not deployed there yet and live PayMongo delivery will fail.

Live split checkout also requires explicit external PayMongo platform evidence. API-created tenant child merchant IDs are tenant readiness inputs only; they are not the DGFY parent/platform merchant ID used as the fixed 1% split recipient. When `COMMERCE_PAYMONGO_SPLIT_ENABLED=true` and `PAYMONGO_MODE=live`, production configuration is incomplete until PayMongo confirms the parent merchant ID plus live `split_payment.transfer_to` and fixed-recipient capability, and the operator sets `PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED=true` or `PAYMONGO_PLATFORM_SPLIT_CONFIRMED=true`. Current provider status as of June 25, 2026 is externally blocked: PayMongo support confirmed Linked Accounts is not configured for the account and self-service onboarding is still under development.

**Auth**: Admin JWT (`/admin/login`)
**Base Path**: `/api/v1/commerce-payments/admin`
**Caching Contract**: `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/payment-sessions` | List PayMongo commerce payment sessions. Supports `tenant_id`, `status`, `target_type`, `limit`, and `offset`. |
| `GET` | `/payment-sessions/:payment_session_id` | Inspect a payment session, provider IDs, order linkage, refundable balance, and refund attempts. |
| `GET` | `/settlement-report` | Summarize/export QR Ph gross, fixed DGFY 1%, estimated tenant gross, refund exposure, provider IDs, and variance. Supports the same filter shape as payment-session listing. |
| `GET` | `/certification/paymongo-sandbox` | Return app-verifiable PayMongo sandbox readiness checks, parent split-capability confirmation status, and the remaining external evidence required before live money movement. |
| `POST` | `/payment-sessions/:payment_session_id/retry-finalization` | Retry local order finalization for paid unresolved sessions without creating duplicate orders. |
| `POST` | `/payment-sessions/:payment_session_id/refunds` | Submit a PayMongo refund for a paid/finalized session. |
| `GET` | `/tenant-payment-accounts` | List tenant PayMongo child merchant readiness records. Supports `tenant_id`. |
| `POST` | `/tenants/:tenant_id/paymongo-child-account` | Create a PayMongo merchant child account for an existing tenant and store it as pending readiness. |
| `POST` | `/tenants/:tenant_id/paymongo-child-account/sync-requirements` | Pull current PayMongo child-merchant onboarding requirements into local readiness metadata. |
| `POST` | `/tenants/:tenant_id/paymongo-child-account/submit-review` | Submit the PayMongo child merchant for provider review after required tenant/company details are completed. |
| `POST` | `/tenants/:tenant_id/paymongo-child-account/activate` | Request PayMongo account activation and store only provider-evidenced readiness flags. |
| `PUT` | `/tenants/:tenant_id/payment-account` | Create/update tenant PayMongo child merchant readiness. |

**Create Tenant PayMongo Child Account Request**
```json
{
  "trade_name": "Tenant Trading Name"
}
```

`trade_name` is optional; when omitted the backend uses the tenant company name. The endpoint is idempotent when a tenant already has a `provider_merchant_id`. It stores the returned PayMongo child merchant ID as pending readiness and must not enable QR Ph/split/charges until PayMongo activation and wallet evidence are recorded.

**Child Account Provider Actions**
- `sync-requirements` stores the provider's current KYC/business requirement status so operators can see what is still missing.
- `submit-review` asks PayMongo to review the child merchant after the tenant/company finishes the required information.
- `activate` may mark `onboarding_status=active` and `qrph_enabled=true` only when PayMongo accepts activation. It must not mark wallet, split, or charge readiness unless the provider response contains explicit enabled wallet/capability evidence.

**Tenant Payment Account Request**
```json
{
  "provider_merchant_id": "org_child_merchant_id",
  "provider_wallet_id": "wallet_optional",
  "wallet_status": "enabled",
  "wallet_verified_at": "2026-05-20T00:00:00.000Z",
  "onboarding_status": "active",
  "qrph_enabled": true,
  "split_enabled": true,
  "charges_enabled": true,
  "verification_reference": "PAYMONGO-SANDBOX-TICKET-123",
  "verified_at": "2026-05-20T00:00:00.000Z",
  "verified_by": "platform-admin"
}
```

`verification_reference` and `verified_at` are required when `onboarding_status=active` or any of `qrph_enabled`, `split_enabled`, or `charges_enabled` is enabled. `wallet_status=enabled` and `wallet_verified_at` are also required before `split_enabled` or `charges_enabled` can be enabled. This prevents QR Ph split checkout from being exposed from manual flags alone.

**Refund Request**
```json
{
  "amount": 100.00,
  "refund_strategy": "proportional",
  "reason": "requested_by_customer",
  "notes": "Customer requested cancellation"
}
```

**Refund Strategy Notes**
- `proportional` lets PayMongo apply the default split-refund distribution.
- `tenant` sends a fixed split-refund source against the tenant transfer merchant.
- `dgfy` sends a fixed split-refund source against `PAYMONGO_DGFY_MERCHANT_ID`.
- `custom` is supported by backend payload shape for provider testing, but the current admin UI exposes only proportional, tenant, and DGFY strategies.
- Non-proportional `split_refund.refund_sources` must total exactly the requested refund amount in centavos before the provider API is called.
- Refund submission records `pending` refunds without marking the order refunded until PayMongo reports terminal success.
- The PayMongo webhook handler updates stored refund attempts for `payment.refunded` and `payment.refund.updated` events when the provider refund ID matches `commerce_payment_refunds`, then recomputes payment-session and tenant-order payment status.
- Possible tenant order payment statuses for commerce QR Ph refunds are `refund_pending`, `partial_refunded`, and `refunded`.

**Settlement Report Notes**
- The settlement report is based on landlord `commerce_payment_sessions` and `commerce_payment_refunds`.
- `platform_fee_centavos` is the stored fixed DGFY 1% split from ADR 0012/ADR 0027.
- `estimated_tenant_gross_centavos` is `total_amount_centavos - platform_fee_centavos`; it is not PayMongo payout truth.
- Provider fees, payout IDs, and final payout status require PayMongo reporting/payout data and must not be inferred from local records alone.

### GET /store/track/:tracking_pin
Track online-store order status for public users.

**Auth**: Public
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)
**Caching Contract**: `Cache-Control: private, max-age=5, s-maxage=5, stale-while-revalidate=10, stale-if-error=20`
**Response Contract**: Valid tracking PIN returns `200` with explicit status payload.
**Rate Limit Contract**: Public reads use a dedicated IP + store context + normalized tracking-PIN bucket sized for state-aware 10-20 second visible polling. Claim and cancellation mutations remain on the stricter Store tracking mutation limiter. `429` responses include `Retry-After` and `retryAfterSeconds`; clients must retain the last successful status, disable manual retry during cooldown, show customer-friendly countdown copy, and delay the next request for at least that duration.

### VAT Data Placement (Current Contract)
1. Default item classification: `items.vat_type`
2. Immutable legal snapshot per sold line:
   - `pos_transaction_lines.vat_type_snapshot`
   - `pos_transaction_lines.vat_rate_snapshot`
3. Transaction-level receipt totals:
   - `pos_transactions.vatable_sales`
   - `pos_transactions.vat_amount`
   - `pos_transactions.vat_exempt_sales`
   - `pos_transactions.zero_rated_sales`
4. Tenant POS receipt/business metadata is stored in `system_settings`. Tenant admins can request changes to the receipt/business fields below, but they are first written to `pos_receipt_metadata_pending_changes` and do not become live until platform admin approval:
   - `pos_registered_name`
   - `pos_business_name`
   - `pos_business_style`
   - `pos_taxpayer_type`
   - `pos_tin_branch`
   - `pos_address`
   - `pos_ptu_number`
   - `pos_min_number`
   - `pos_accreditation_number`
   - `pos_receipt_footer_message`
5. DGFY POS software identity is platform-admin controlled per tenant and is not accepted through tenant settings validators:
   - `pos_software_name`
   - `pos_software_version`
   - `pos_software_serial_number`
   - Fiscal receipt preview and iMin hardware print output include these values when the server receipt contract is `document_type=fiscal_invoice`.
6. Platform-admin POS metadata operations:
   - `GET /admin/tenants/:id/pos-metadata` returns current platform-controlled software identity, current receipt metadata, and any pending receipt metadata review.
   - `PATCH /admin/tenants/:id/pos-metadata` accepts either `software_settings` or `pending_action` (`approve` or `reject`) plus a required `reason` of at least 3 characters.
   - `GET /admin/tenants/:id/pos-metadata/audit-logs?limit=10` returns `tenant_admin_audit_logs` rows with `action = pos_metadata_update`.
7. Tenant POS operating settings remain tenant-editable when allowed by normal settings/compliance policy:
   - `pos_discount_profiles` (JSON array of `{name, percentage, active}`)
   - `pos_order_method_fees` (deprecated; retained for historical read compatibility only)
   - `pos_petty_cash_symbol`
   - `pos_petty_cash_amount`
8. Fiscal invoice checkout can carry buyer fiscal details:
   - `buyer_name`
   - `buyer_tin`
   - `buyer_business_style`
   - `buyer_address`
   - These buyer fiscal fields are optional for non-fiscal/non-compliant checkout. Non-fiscal checkout persists the fiscal buyer fields as `null`; the tenant schema still must contain the nullable columns so POS reads and order queues do not fail on model selection.
9. Fiscal invoice persistence stores a server-owned immutable preparation snapshot:
   - `pos_transactions.buyer_tin`
   - `pos_transactions.buyer_business_style`
   - `pos_transactions.buyer_address`
   - `pos_transactions.fiscal_document_template_version`
   - `pos_transactions.fiscal_document_hash`
   - `pos_transactions.fiscal_document_snapshot`
   - fiscal checkout also writes a `checkout_issued` fiscal event when the fiscal event repository is available.
10. Fiscal lifecycle persistence adds:
   - `pos_transactions.fiscal_lifecycle_state`
   - `pos_transactions.fiscal_reprint_count`
   - `pos_transactions.fiscal_void_event_hash`
   - `pos_transactions.void_reason`
11. Fiscal terminal registration and event tables:
   - `pos_fiscal_terminal_registrations`
   - `pos_fiscal_events`
   - `pos_fiscal_print_events`
   - `pos_esales_reports`
9. Compliance lifecycle/profile is tenant-level (`tenants` + compliance module tables), not controlled by a strict-toggle setting.

### POS Fiscal Lifecycle Endpoints

Authenticated premium POS routes:

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/pos/transactions/:id/print-events` | `pos:reprint` | Records operator-confirmed fiscal original print or reprint evidence after the browser print dialog is opened; reprints require a reason. |
| `POST` | `/api/v1/pos/transactions/:id/void` | `pos:void` | Voids a transaction, writes fiscal void evidence for fiscal invoices, and creates POS stock-return movements for original POS stock issues. |
| `GET` | `/api/v1/pos/fiscal-terminal-registrations` | `pos:view` | Lists fiscal terminal registration records. |
| `PUT` | `/api/v1/pos/fiscal-terminal-registrations` | `pos:fiscal_terminals:manage` | Creates or updates a terminal fiscal registration. Verified status requires MIN, machine serial, software serial, and PTU. |
| `GET` | `/api/v1/pos/esales-reports` | `pos:view` | Lists generated eSales packages, payload hashes, lifecycle status, and submission evidence references. |
| `GET` | `/api/v1/pos/fiscal-ledger/integrity` | `pos:view` | Recomputes fiscal event hashes and verifies event sequence continuity and previous-hash linkage. |
| `POST` | `/api/v1/pos/esales-reports/generate` | `pos:esales:manage` | Generates a monthly Asia/Manila eSales package, stores a payload hash, and separates gross, voided, and net totals. |
| `PATCH` | `/api/v1/pos/esales-reports/:id/status` | `pos:esales:manage` | Marks an eSales package as submitted, accepted, or rejected with an evidence reference and fiscal event. |

Fiscal activation also requires at least one verified fiscal terminal registration. Fiscal event rows include a monotonic `event_sequence` and hash-chain fields so issuance, print/reprint, void, Z-reading, reset, terminal registration, and eSales lifecycle events can be audited in order. Settings > POS exposes a fiscal ledger integrity panel backed by `/api/v1/pos/fiscal-ledger/integrity`.

---

## Food & Beverage Endpoints

Food & Beverage endpoints are authenticated tenant routes under `/api/v1/fnb`. They require `requireWorkflowCapability('fnbDining')`; tenants outside `fnb` receive the workflow-mode capability denial response. These endpoints are additive to shared `items`, POS, and Storefront contracts. The Permission column lists the primary mode-native permission. Generic compatibility fallback remains enabled by default for legacy users and can be disabled with `MODE_RBAC_GENERIC_FALLBACK_ENABLED=false` after remapping.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/fnb/dashboard` | `fnb:dashboard:view` | Load F&B dashboard counts and active floor/kitchen/reservation summaries |
| `GET` | `/fnb/modifier-groups` | `fnb:menu:view` | List menu modifier groups and options |
| `POST` | `/fnb/modifier-groups` | `fnb:menu:manage` | Create a modifier group with options and selection rules |
| `GET` | `/fnb/dining-areas` | `fnb:dining:view` | List dining areas and tables |
| `POST` | `/fnb/dining-areas` | `fnb:dining:manage` | Create a dining area and optional initial tables |
| `PATCH` | `/fnb/tables/:table_id/status` | `fnb:dining:manage` | Update table status (`available`, `seated`, `held`, `out_of_service`) |
| `GET` | `/fnb/kitchen-stations` | `fnb:kitchen:view` | List kitchen routing stations |
| `POST` | `/fnb/kitchen-stations` | `fnb:kitchen:manage` | Create a kitchen station |
| `GET` | `/fnb/item-kitchen-routes` | `fnb:menu:view` | List item-to-kitchen-station routing assignments |
| `PUT` | `/fnb/item-kitchen-routes/:item_id` | `fnb:menu:manage` | Upsert the primary kitchen route and default course for a menu item |
| `GET` | `/fnb/item-modifier-groups` | `fnb:menu:view` | List menu item modifier group assignments |
| `PUT` | `/fnb/item-modifier-groups/:item_id` | `fnb:menu:manage` | Replace modifier groups assigned to a menu item |
| `GET` | `/fnb/checks` | `fnb:checks:view` | List active/open checks |
| `POST` | `/fnb/checks` | `fnb:checks:manage` | Open a dine-in/takeout/pickup/delivery check |
| `PATCH` | `/fnb/checks/:check_id/status` | `fnb:checks:manage` | Move a check through guarded lifecycle states |
| `PATCH` | `/fnb/checks/:check_id/transfer` | `fnb:checks:manage` | Transfer an active check to another table/server snapshot |
| `POST` | `/fnb/checks/:check_id/split` | `fnb:checks:manage` | Split selected line IDs from an active check into a new check |
| `POST` | `/fnb/checks/:check_id/merge` | `fnb:checks:manage` | Merge a source active check into a target active check and close the source as transferred |
| `POST` | `/fnb/checks/:check_id/lines` | `fnb:checks:manage` | Add a line with course, modifier, instruction, and kitchen-station metadata |
| `POST` | `/fnb/checks/:check_id/kitchen-tickets` | `fnb:kitchen:manage` | Queue a kitchen ticket from check lines |
| `PATCH` | `/fnb/kitchen-tickets/:ticket_id/status` | `fnb:kitchen:manage` | Move a kitchen ticket through guarded kitchen states |
| `GET` | `/fnb/reservations` | `fnb:reservations:view` | List reservation/waitlist requests; supports `status`, `table_id`, `from`, `to`, and `limit` filters |
| `POST` | `/fnb/reservations` | `fnb:reservations:manage` | Create an admin/POS reservation or waitlist request with optional `table_id`, `table_ids`, `duration_minutes`, and `buffer_minutes` |
| `PATCH` | `/fnb/reservations/:reservation_id/status` | `fnb:reservations:manage` | Move a reservation through guarded states; confirmed/seated assigned-table windows cannot overlap |
| `GET` | `/fnb/service-charge-settings` | `fnb:service_charge:view` | Read restaurant service-charge settings |
| `PUT` | `/fnb/service-charge-settings` | `fnb:service_charge:manage` | Update optional restaurant service-charge settings |

POS checkout accepts these additive fields when F&B context is attached:

```json
{
  "fnb_check_id": 12,
  "fnb_table_id": 4,
  "fnb_table_label_snapshot": "Main 4",
  "fnb_guest_count": 3,
  "fnb_server_id": 9,
  "restaurant_service_charge": {
    "enabled": true,
    "label": "Restaurant service charge",
    "rate": 10,
    "taxable": false
  },
  "lines": [
    {
      "item_id": 101,
      "quantity": 1,
      "course": "main",
      "line_modifiers": [
        {
          "modifier_group_id": 2,
          "modifier_option_id": 8,
          "group_name": "Doneness",
          "option_name": "Medium",
          "price_delta": 0
        }
      ],
      "kitchen_station_id": 1
    }
  ]
}
```

F&B checkout validation uses database modifier assignments and active modifier options for `line_modifiers`; submitted `price_delta`, `group_name`, and `option_name` are treated as display hints only and are re-snapshotted from server state. POS can send line-level `kitchen_station_id` overrides from active F&B kitchen stations; otherwise item kitchen routes provide the default station/course snapshot. If `restaurant_service_charge.taxable=true`, POS includes the restaurant service charge in VATable gross for `vatable_sales`/`vat_amount` while keeping `service_fee_amount` reserved for the DGFY convenience fee. For F&B menu items with `product_composition` ingredient rows, checkout deducts ingredient stock through POS `goods_issue` movements.

Restaurant service charge snapshots are stored separately from the DGFY convenience fee. `service_fee_amount` remains DGFY-only.

Reservation requests store optional `table_id` assignments only after the table exists in the F&B floor plan. For combined-table parties, `table_id` is the primary compatibility shortcut and `table_ids` stores every assigned table through the F&B reservation-table side table. IMS uses `/fnb/reservations` schedule filters for table/date views. Reservation windows default to `duration_minutes=90` and `buffer_minutes=15`; requested/waitlisted rows do not block capacity, while confirmed/seated rows block overlapping confirmed/seated bookings on any assigned table. Confirming or seating a booking also checks that selected table seats cover the party size.

---

## Unified Sales Endpoints

Unified Sales is a **read-only** reporting surface that consolidates POS and Dispatch data.

### Domain Boundary Note
- Dispatch and POS remain separate write domains.
- Unified Sales combines both domains only at query/reporting time.
- No mutation of POS or Dispatch source records is performed by unified sales reads.

### GET /sales/transactions
List normalized sales timeline rows from:
1. POS (`source='POS'`)
2. Dispatch (`source='DISPATCH'`)

Shared fields include date/time, reference number, source, gross sales, VAT buckets (if available), COGS, gross profit, and status.
For POS rows, service-fee snapshots are included (`service_fee_amount`, label/method/override fields).
POS rows now also expose `pos_order_source` (`in_store`, `online_store`) for channel-level filtering/audit.

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 200) |
| `source` | string | `POS`, `DISPATCH`, or omitted for both |
| `source_id` | number | Optional source transaction ID (`pos_transaction_id` or `do_id`) |
| `search` | string | Search reference/customer/recipient |
| `status` | string | Source status filter |
| `payment_type` | string | POS-only filter |
| `order_method` | string | POS-only filter (`dine_in`, `takeout`, `pickup`, `delivery`; legacy `online` accepted for historical rows) |
| `pos_order_source` | string | POS-only channel filter (`in_store`, `online_store`) |
| `date_from` | ISO date | Inclusive start date |
| `date_to` | ISO date | Inclusive end date |
| `sort_by` | string | `occurred_at`, `gross_sales`, `cogs`, `gross_profit`, `reference_no` |
| `sort_order` | string | `asc` or `desc` |
| `export` | string | `csv` returns CSV download |

**Validation Notes**
1. Query values are validated before read execution.
2. Invalid enum values (for example unsupported `pos_order_source` or `sort_by`) return `422 Validation failed` with field-level errors.

---

## Dashboard Endpoints

### GET /dashboard/stats
Get operational dashboard counters and inventory valuation totals.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "totalItems": 420,
    "lowStockCount": 37,
    "healthyCount": 301,
    "overStockCount": 82,
    "totalValue": 120000,
    "weightedTotalValue": 118700,
    "weightedAverageCostPerUnit": 24.52,
    "weightedTotalAvailableQty": 4840,
    "inventoryValueDelta": -1300,
    "pending_purchase_orders": 12,
    "active_job_orders": 4,
    "pending_dispatch_orders": 9,
    "dataQuality": {
      "items_missing_cost": 6,
      "items_with_zero_stock": 21,
      "items_with_cost_data": 414
    }
  }
}
```

**Notes**
- `totalValue` remains the legacy aggregate (`current_stock * item.cost_per_unit`) for backward compatibility.
- Weighted fields are derived from on-hand FIFO balances and are additive, not breaking existing consumers.

---

## Reports Endpoints

### GET /reports/expiry
Get expiry-risk report (near-expiry, expired, and healthy buckets).

**Query Parameters**
```
?startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "near_expiry": [
      {
        "batch_id": 22,
        "item_name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "location_id": 3,
        "location_name": "Villa Store",
        "remaining_quantity": 40,
        "expiry_date": "2024-12-01",
        "days_until_expiry": 5
      }
    ]
  }
}
```

### GET /reports/stock-aging-enhanced
Get FIFO batch aging analytics with value-at-risk details.

**Query Parameters**
```
?startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "batch_id": 22,
        "item_name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "location_id": 3,
        "location_name": "Villa Store",
        "received_date": "2026-03-01",
        "expiry_date": "2026-05-01",
        "days_in_stock": 48,
        "remaining_quantity": 40,
        "cost_per_unit": 25.5,
        "value_at_risk": 1020
      }
    ]
  }
}
```

### GET /reports/export
Export report output as CSV.

**Query Parameters**
```
?type=expiry
&startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Supported `type` values**
- `expiry`
- `stock_aging`
- `production`
- `po_analysis`
- `executive_summary`

**CSV Contract Notes (location-aware):**
- `type=expiry` CSV includes `Location` column.
- `type=stock_aging` CSV includes `Location` column.
- `type=po_analysis` CSV includes weighted cost variance summary plus top supplier/item variance slices.
- `type=executive_summary` CSV includes weighted inventory fields and procurement weighted-variance fields.
- Date filters are normalized server-side to a max range of 365 days.

### GET /reports/stock-aging
Legacy lightweight aging endpoint kept for backward compatibility.

### GET /reports/surplus-shortage
Get surplus and shortage report

**Response (200)**
```json
{
  "success": true,
  "data": {
    "surplus": [
      {
        "item_id": 2,
        "item_name": "Sugar",
        "current_stock": 800,
        "max_capacity": 500,
        "excess_quantity": 300,
        "estimated_value": 7500
      }
    ],
    "shortage": [
      {
        "item_id": 3,
        "item_name": "Cocoa Powder",
        "current_stock": 10,
        "min_threshold": 50,
        "shortage_quantity": 40,
        "recommended_action": "Urgent PO required"
      }
    ]
  }
}
```

**Mode-Aware Inventory Reporting Notes**
- Stock aging, surplus/shortage, inventory valuation, weighted-cost, FIFO, and stock-movement reports include stock-bearing rows only.
- Pure service rows (`category=service` or `mode_item_preset=service`) are excluded from inventory-readiness and valuation totals so service businesses are not flagged for valid stock-exempt catalog entries.
- Physical Services Mode add-ons/products, F&B ingredients, F&B packaged goods, Food Manufacturing materials/products, and MSME stock items remain inventory rows and continue to appear in stock and cost reports.

### GET /reports/financial-summary
Get financial tracking report

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
&groupBy=category
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "report": [
      {
        "category": "raw_material",
        "total_inventory_value": 45000,
        "total_cogs": 12000,
        "total_movements": 150,
        "average_cost_per_unit": 25.50
      }
    ],
    "summary": {
      "total_inventory_value": 120000,
      "legacy_total_inventory_value": 120000,
      "weighted_total_inventory_value": 118700,
      "weighted_total_available_qty": 4840,
      "weighted_average_cost_per_unit": 24.52,
      "inventory_value_delta": -1300,
      "total_cogs": 35000,
      "inventory_turnover_ratio": 2.5
    }
  }
}
```

### GET /reports/po-analysis
Get purchase order analytics with weighted-cost variance.

**Query Parameters**
```
?startDate=2026-03-01
&endDate=2026-03-31
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_orders": 12,
      "total_order_value": 92840,
      "total_received_value": 74210,
      "pending_orders": 4,
      "fulfillment_rate": 66.7
    },
    "supplier_performance": [
      {
        "supplier_id": 5,
        "supplier_name": "Prime Flour Supply",
        "total_orders": 4,
        "ordered_supplier_value": 22500,
        "ordered_weighted_baseline_value": 21420,
        "ordered_vs_weighted_variance_value": 1080,
        "ordered_vs_weighted_variance_percent": 5.0
      }
    ],
    "most_ordered_items": [
      {
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "total_quantity": 850,
        "total_value": 21250,
        "weighted_baseline_value": 20570,
        "ordered_vs_weighted_variance_value": 680,
        "ordered_vs_weighted_variance_percent": 3.3
      }
    ],
    "cost_variance": {
      "baseline_scope": "location",
      "baseline_location_id": 3,
      "summary": {
        "ordered_supplier_value": 92840,
        "ordered_weighted_baseline_value": 90100,
        "ordered_vs_weighted_variance_value": 2740,
        "ordered_vs_weighted_variance_percent": 3.0
      },
      "by_supplier": [],
      "by_item": [],
      "line_samples": []
    }
  }
}
```

### GET /reports/executive-summary
Get consolidated KPIs with weighted inventory and procurement variance overlays.

**Query Parameters**
```
?startDate=2026-03-01
&endDate=2026-03-31
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "inventory_overview": {
      "total_inventory_value": 120000,
      "legacy_total_inventory_value": 120000,
      "weighted_total_inventory_value": 118700,
      "weighted_total_available_qty": 4840,
      "weighted_average_cost_per_unit": 24.52
    },
    "procurement_overview": {
      "total_orders": 12,
      "pending_orders": 4,
      "total_order_value": 92840,
      "fulfillment_rate": 66.7,
      "ordered_vs_weighted_variance_value": 2740,
      "ordered_vs_weighted_variance_percent": 3.0
    }
  }
}
```

### GET /reports/supplier-performance
Get supplier performance report

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "supplier_id": 1,
        "supplier_name": "Flour Supplier Inc",
        "total_orders": 5,
        "on_time_delivery_rate": 100,
        "quality_rating": 4.5,
        "average_delivery_days": 3,
        "total_spent": 25500
      }
    ]
  }
}
```

---

## Frontend-Backend Integration Points

### 1. Authentication Flow

```
Frontend                          Backend
   │                                │
   ├─── POST /auth/login ──────────>│
   │                                │
   │<─── Access Token + HttpOnly Refresh Cookie ───────┤
   │                                │
   ├─ Store access token in memory ─┐      │
   │                         │      │
   │ Add to headers ──────────────>│
   │ (Authorization: Bearer)       │
   │                                │
   │<─── Protected Resource ───────┤
   │                                │
```

### 2. Item Management Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /items ───────────────>│
   │                                │
   │<─── Items List ────────────────┤
   │                                │
   ├─── POST /items ──────────────>│
   │ (Create new item)              │
   │                                │
   │<─── Item Created ──────────────┤
   │                                │
   ├─── PUT /items/:id ───────────>│
   │ (Update item)                  │
   │                                │
   │<─── Item Updated ──────────────┤
   │                                │
```

### 3. Purchase Order Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /suppliers ───────────>│
   │ (Get available suppliers)      │
   │                                │
   │<─── Suppliers List ────────────┤
   │                                │
   ├─── POST /purchase-orders ────>│
   │ (Create PO)                    │
   │                                │
   │<─── PO Created ────────────────┤
   │                                │
   ├─ Poll status or WebSocket ────>│
   │                                │
   │<─── PO Status Updates ─────────┤
   │                                │
   ├─── POST /purchase-orders/receive
   │ (Record receipt)               │
   │                                │
   │<─── Inventory Updated ─────────┤
   │                                │
```

### 4. Job Order Production Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /items (products) ────>│
   │ (Get available products)       │
   │                                │
   │<─── Products List ─────────────┤
   │                                │
   ├─── POST /job-orders ─────────>│
   │ (Create JO)                    │
   │                                │
   │<─── JO Created ────────────────┤
   │                                │
   ├─── PUT /job-orders/:id/start >│
   │ (Start production)             │
   │                                │
   │<─── Production Started ────────┤
   │                                │
   ├─── PUT /job-orders/:id/complete
   │ (Complete production)          │
   │                                │
   │<─── Inventory Updated ─────────┤
   │ (Ingredients deducted,         │
   │  Products added)               │
   │                                │
```

### 5. Real-time Notifications (WebSocket)

```
Frontend                          Backend
   │                                │
   ├─── WebSocket Connect ────────>│
   │                                │
   │<─── Connection Established ───┤
   │                                │
   │                   (Background Job)
   │                   Low Stock Alert
   │                                │
   │<─── Real-time Alert ──────────┤
   │ {type: 'LOW_STOCK',            │
   │  item: 'Cocoa Powder'}         │
   │                                │
```

---

## Data Synchronization Strategy

### 1. Initial Data Load
- Load items, suppliers, and settings on app startup
- Cache in Redux/Zustand store
- Implement optimistic updates

### 2. Real-time Updates
- Use WebSocket for critical updates (stock levels, alerts)
- Poll for non-critical data (reports, analytics)
- Implement exponential backoff for failed requests

### 3. Offline Support
- Implement service worker for offline caching
- Queue mutations when offline
- Sync when connection restored

### 4. Error Handling
- Implement retry logic with exponential backoff
- Display user-friendly error messages
- Log errors to backend for debugging

---

## API Rate Limiting

### Rate Limits
- **Authenticated Users**: 1000 requests per hour
- **Unauthenticated**: 100 requests per hour
- **Burst Limit**: 50 requests per minute
- **Company Registration**: production default 5 requests per IP per hour (`RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5`, `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000`)
- **Email Lookup**: production default 5 requests per IP per 15 minutes

### Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642329600
```

---

## API Documentation Tools

### Swagger/OpenAPI
- Auto-generated from code
- Interactive API explorer
- Available at: `/api/v1/docs`

### Postman Collection
- Export for team collaboration
- Pre-configured authentication
- Example requests and responses

---

## Security Considerations

### Input Validation
- All inputs validated on backend
- Sanitize to prevent SQL injection
- Validate data types and ranges

### Authorization
- Role-based access control (RBAC)
- Resource-level permissions
- Audit all sensitive operations

### Data Protection
- Encrypt sensitive data in transit (HTTPS)
- Hash passwords with bcrypt
- Implement CORS properly

### API Security
- Implement CSRF protection
- Rate limiting
- Request signing for critical operations

---

## AI Assistant Endpoints

### POST /ai/chat
Send a message to the AI assistant, optionally with file attachments.

**Request (Multipart Form Data)**
- `message` (string): User message
- `conversationId` (uuid, optional): ID of existing conversation
- `files` (file[], optional): Up to 5 files (PDF, DOCX, Images, Text, CSV)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "content": "Hello! I see you uploaded a PDF. Based on the content...",
    "conversationId": "uuid",
    "type": "text",
    "toolContext": {}
  }
}
```

### POST /ai/confirm
Confirm and execute a pending AI action.

**Request**
```json
{
  "actionId": "uuid"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "result": { "po_id": 123 },
    "message": "Purchase Order created successfully"
  }
}
```

### GET /ai/conversations
List user's conversation history.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversation_id": "uuid",
        "title": "Inventory Status",
        "updated_at": "2026-02-02T..."
      }
    ]
  }
}
```

### GET /ai/exports/:id
Download a temporary CSV export generated by the AI assistant.

**Response (200)**
- Stream: CSV File Attachment

---

## Payments & Subscription Endpoints

> Status update (2026-04-03): Subscription/payment workflows are disabled by default.
> Unless `PAYMENTS_ENABLED=true` is explicitly set on the backend and matching frontend flags are enabled, all `/payments/*` endpoints are treated as unavailable.

### `/payments/*` route behavior in default mode

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Applies to public and private payment routes, including but not limited to:
- `POST /payments/webhook`
- `POST /payments/request-reactivation`
- `POST /payments/reactivate-with-paypal`
- `POST /payments/reactivate-with-paymongo`
- `POST /payments/migrate-to-paypal`
- `POST /payments/migrate-to-paymongo`
- `POST /payments/change-plan`
- `POST /payments/setup-paymongo-recurring`
- `GET /payments/history`
- `GET /payments/pending-plan`

### `POST /payments/webhook` PayMongo signature contract

When payment workflows are intentionally enabled, PayMongo webhook requests must include the provider `Paymongo-Signature` header. The backend verifies the documented timestamped signature over the raw request body before creating webhook logs or mutating payment/subscription state.

Required runtime configuration:
- `PAYMONGO_WEBHOOK_SECRET`, or the mode-specific `PAYMONGO_TEST_WEBHOOK_SECRET` / `PAYMONGO_LIVE_WEBHOOK_SECRET`.
- Production, live-mode, or `PAYMENTS_ENABLED=true` environments must not use unsigned webhook bypasses.

Failure behavior:
- Missing secret: `401 Invalid Signature`
- Missing signature: `401 Invalid Signature`
- Invalid or stale signature: `401 Invalid Signature`
- Replayed processed event: `200 OK` with no repeated payment mutation

Unsigned webhook bypass is limited to explicit non-production local testing while `PAYMENTS_ENABLED=false`.

---
### POST /admin/tenants/resubmit
Re-submit a rejected registration for review. Resets status to `pending` and clears `rejection_reason`. **Public endpoint** — authenticated only by `x-company-token` header.

**Access:** x-company-token header only

**Response (200)**
```json
{ "success": true, "message": "Registration re-submitted for review." }
```

**Errors**: 400 if account is not in rejected state.

---

### POST /admin/tenants/:id/setup-paypal-recurring
Legacy billing endpoint. In default mode (`PAYMENTS_ENABLED=false`), this endpoint is disabled.

**Access:** Admin JWT required

**Request**: No body required.

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Enable payment workflows first before using this endpoint in non-default mode.

---

### POST /admin/tenants/:id/change-plan
Legacy billing endpoint. In default mode (`PAYMENTS_ENABLED=false`), this endpoint is disabled.

**Access:** Admin JWT required

**Request**
```json
{ "plan": "standard" }
```

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Enable payment workflows first before using this endpoint in non-default mode.

---

### POST /admin/tenants/:id/reactivate
Reactivate an inactive tenant. Sets `status='active'`, `subscription_status='active'`, extends `current_period_end` by 30 days, sends approval email.

**Access:** Admin JWT required

**Request**: No body required.

**Response (200)**
```json
{ "success": true, "message": "Tenant reactivated successfully." }
```

**Errors**: 400 if tenant is not inactive.

---

## Admin Tenant Management Endpoints

> **Note**: These endpoints are for the Developer Portal (superadmin) and are NOT tenant-isolated. They manage company registrations across the entire platform.
>
> **Scope clarification**: `company_token` in this section is internal/admin context only. Public storefront flows use `x-store-slug` and do not expose tenant tokens in discovery payloads.

### GET /dgfy/legal-terms/current

Return the backend-owned current legal-term versions, document summaries, acknowledgement snapshot text, and marketplace-provider clause used by DGFY account and company registration. Registration clients must load this endpoint before enabling legal acknowledgement checkboxes and must submit the returned version fields with the registration mutation.

Clients must fail closed when account registration lacks `terms_version`, `privacy_version`, or `marketplace_terms_version`, or when company registration lacks `company_terms_version` or `marketplace_terms_version`.

**Access:** Public.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "provider_clause": "DGFY is an e-marketplace/platform service provider...",
    "versions": {
      "accountTerms": "dgfy-account-terms-2026-06-08",
      "privacy": "dgfy-privacy-2026-06-08",
      "marketplaceTerms": "dgfy-marketplace-provider-2026-06-08",
      "companyTerms": "dgfy-company-terms-2026-06-08"
    },
    "flows": {
      "account_registration": {
        "acknowledgement_field": "accepted_terms",
        "version_fields": ["terms_version", "privacy_version", "marketplace_terms_version"]
      },
      "company_registration": {
        "acknowledgement_field": "accepted_company_terms",
        "version_fields": ["company_terms_version", "marketplace_terms_version"]
      }
    }
  }
}
```

If this endpoint is unavailable, registration UI must fail closed and keep the registration submit action disabled.

### POST /dgfy/auth/register/preflight

Check whether the submitted DGFY registration email and phone are available before requesting the public signup OTP.

**Access:** Public, rate-limited.

**Request**

```json
{
  "email": "ada@example.com",
  "phone": "+639123456789"
}
```

Email is checked before phone. This endpoint does not create an account, request an OTP, consume an OTP, or persist legal acknowledgement evidence.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "available": true
  },
  "message": "DGFY registration credentials are available."
}
```

**Conflict (409)**

```json
{
  "success": false,
  "data": null,
  "message": "A DGFY account already exists with this email.",
  "error_code": "DGFY_ACCOUNT_ALREADY_EXISTS",
  "details": {
    "error_code": "DGFY_ACCOUNT_ALREADY_EXISTS",
    "field": "email"
  }
}
```

For phone conflicts, `message` is `A DGFY account already exists with this phone number.` and `details.field` is `phone`.

### POST /dgfy/auth/register

Create a global DGFY account used for customer account surfaces and business registration.

**Access:** Public, rate-limited.

**Request**

```json
{
  "last_name": "Lovelace",
  "first_name": "Ada",
  "middle_name": "Byron",
  "email": "ada@example.com",
  "phone": "+639123456789",
  "password": "minimum8",
  "confirm_password": "minimum8",
  "email_otp_code": "123456",
  "accepted_terms": true,
  "terms_version": "dgfy-account-terms-2026-06-08",
  "privacy_version": "dgfy-privacy-2026-06-08",
  "marketplace_terms_version": "dgfy-marketplace-provider-2026-06-08"
}
```

Registration requires a prior global `dgfy_account_verification` code from `POST /auth/email-otp/request` for the submitted email, plus the current DGFY account terms, privacy terms, and marketplace-provider terms acknowledgement from `GET /dgfy/legal-terms/current`. Browser registration must call `POST /dgfy/auth/register/preflight` and block duplicate DGFY email or phone credentials before requesting this OTP. The public OTP request does not require tenant context; tenant-scoped browser cookies/headers must not scope this OTP because the registration mutation consumes the email OTP with `tenant_id: null`, creates the account with `email_verified_at` set, and writes the account row, mirrored DGFY invitation memberships, and acknowledgement evidence in one landlord transaction. Persistence misconfiguration fails closed with `500 LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_UNAVAILABLE`. Missing, false, or stale acknowledgement returns `422 TERMS_ACKNOWLEDGEMENT_REQUIRED`.

The customer-facing registration order is Last Name, First Name, Optional Middle Name, email, contact number, password, and confirm password. Password fields expose visibility toggles. `middle_name` is optional and nullable; when present it is returned on account/profile/customer surfaces.

**Response (201)**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "dgfy-account-uuid",
      "last_name": "Lovelace",
      "first_name": "Ada",
      "middle_name": "Byron",
      "username": "Ada",
      "email": "ada@example.com",
      "phone": "+639123456789",
      "is_active": true,
      "email_verified_at": "2026-05-21T10:03:00.000Z",
      "is_email_verified": true,
      "last_login_at": null
    },
    "token": "dgfy-jwt",
    "expiresIn": 86400
  }
}
```

### POST /dgfy/auth/login

Sign in to a global DGFY account.

**Access:** Public, rate-limited.

**Request**

```json
{
  "email": "ada@example.com",
  "password": "minimum8"
}
```

**Response (200)**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "dgfy-account-uuid",
      "first_name": "Ada",
      "middle_name": "Byron",
      "last_name": "Lovelace",
      "username": "Ada",
      "email": "ada@example.com",
      "phone": "+639123456789",
      "is_active": true,
      "last_login_at": "2026-05-21T10:00:00.000Z"
    },
    "token": "dgfy-jwt",
    "expiresIn": 86400
  }
}
```

### POST /dgfy/auth/logout

Requires an authenticated DGFY account JWT or `sku_dgfy_session` cookie.

Blacklist the current DGFY account JWT. Tenant-local SKUpervisor and Store JWT sessions are separate and are not revoked by this route.

### POST /dgfy/auth/email-verification/request

Requires `Authorization: Bearer <dgfy-account-token>`.

Send a purpose-scoped `dgfy_account_verification` email OTP to the authenticated DGFY account email. If the account email is already verified, the response returns `verified: true` without sending another code.

### POST /dgfy/auth/email-verification/verify

Requires `Authorization: Bearer <dgfy-account-token>`.

Verify the DGFY account email with the code sent by `/dgfy/auth/email-verification/request`.

**Request**

```json
{
  "code": "123456"
}
```

**Response (200)**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "dgfy-account-uuid",
      "email": "ada@example.com",
      "email_verified_at": "2026-05-21T10:03:00.000Z",
      "is_email_verified": true
    }
  },
  "message": "DGFY email verified."
}
```

### POST /dgfy/auth/handoff

Requires `Authorization: Bearer <dgfy-account-token>`.

Create a short-lived DGFY handoff token for browser-to-browser or redirected account flows. The token scope is `dgfy_handoff` and default expiry is two minutes.

### POST /dgfy/auth/handoff/exchange

Exchange a valid DGFY handoff token for a normal DGFY account JWT.

**Request**

```json
{
  "handoff_token": "short-lived-dgfy-handoff-token"
}
```

Browser registration recovery may include `"soft_fail": true`. With that flag, expired, malformed, or already-consumed handoff tokens return HTTP `200` with `data.status="invalid"` and `data.reason="expired_or_consumed"` so `/register-company` can show the DGFY sign-in fallback without surfacing an expected 4xx resource error in the browser console. Without `soft_fail`, replay, expired, or invalid handoff tokens continue to fail with the normal authentication error response.

### POST /dgfy/auth/tenant-session

Requires `Authorization: Bearer <dgfy-account-token>`.

Start a normal SKUpervisor tenant session from an authenticated DGFY account and an accepted active company membership. This endpoint is used after active auto-standard company registration so the founder can enter IMS directly without re-entering the DGFY password.

**Request**

```json
{
  "tenant_id": "tenant-uuid",
  "company_token": "token-acme-123"
}
```

At least one of `tenant_id` or `company_token` is required. The authenticated DGFY account must have an accepted membership for the active tenant, and the linked tenant user must be active. The response sets the normal SKUpervisor refresh/company cookies and returns the standard tenant access session payload without exposing the refresh token. If a later browser reload has the refresh cookie but loses the companion tenant-context cookie, `/auth/refresh-token` can recover tenant context from the signed refresh cookie's `tenant_id` before normal rotation.

### GET /dgfy/auth/me

Return the authenticated DGFY account and linked company memberships. Memberships include pending company invitations when the invited email matches an existing DGFY account.

Requires `Authorization: Bearer <dgfy-account-token>`.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "dgfy-account-uuid",
      "first_name": "Ada",
      "middle_name": "Byron",
      "last_name": "Lovelace",
      "username": "Ada",
      "email": "ada@example.com",
      "phone": "+639123456789",
      "is_active": true,
      "last_login_at": "2026-05-21T10:00:00.000Z"
    },
    "memberships": [
      {
        "id": 12,
        "tenant_id": "tenant-uuid",
        "tenant_user_id": 7,
        "role": "admin",
        "status": "accepted",
        "source": "founder",
        "accepted_at": "2026-05-21T10:05:00.000Z",
        "company": {
          "id": "tenant-uuid",
          "name": "Example Foods",
          "company_token": "token-example-123",
          "status": "active",
          "plan": "premium"
        }
      }
    ]
  }
}
```

### PATCH /dgfy/auth/me

Requires `Authorization: Bearer <dgfy-account-token>`.

Update the authenticated DGFY profile. Last name, first name, and phone are required in the resulting profile; `middle_name` is optional and nullable. Email changes are rejected from this endpoint until a dedicated verified email-change flow is designed. Changing `phone` clears `phone_verified_at`; phone OTP verification remains deferred.

**Request**
```json
{
  "last_name": "Lovelace",
  "first_name": "Ada",
  "middle_name": "Byron",
  "phone": "+639123456789"
}
```

### POST /dgfy/auth/password/change

Requires `Authorization: Bearer <dgfy-account-token>`.

Change the authenticated DGFY account password. Passwords require a minimum length of 8 characters.

**Request**
```json
{
  "current_password": "current-password",
  "new_password": "minimum8",
  "confirm_password": "minimum8"
}
```

### POST /dgfy/auth/password-reset/request

Public, rate-limited. Request a `dgfy_password_reset` email OTP. The response is generic when no active matching DGFY account exists.

**Request**
```json
{
  "email": "ada@example.com"
}
```

### POST /dgfy/auth/password-reset/complete

Public, rate-limited. Verify a `dgfy_password_reset` code and set the new DGFY account password.

**Request**
```json
{
  "email": "ada@example.com",
  "code": "123456",
  "password": "minimum8",
  "confirm_password": "minimum8"
}
```

### POST /dgfy/invitations/:membership_id/accept

Requires an authenticated DGFY account JWT, `sku_dgfy_session` cookie, or a normal IMS tenant session whose current tenant user is explicitly linked to an accepted `DgfyAccountTenantMembership`.

Accept a pending company invitation from the DGFY account notification surface. This path does not require an invitation link, company token in the URL, a tenant-local password setup form, or an email verification code. The backend activates the matching tenant-local authorization profile from the authenticated DGFY account, writes the landlord email-to-tenant mapping, and marks the DGFY membership accepted. DGFY password hashes are not copied into tenant-local users.

**Request**

```json
{}
```

**Response (200)**

```json
{
  "success": true,
  "data": {
    "membership": {
      "id": 12,
      "tenant_id": "tenant-uuid",
      "tenant_user_id": 7,
      "role": "staff",
      "status": "accepted",
      "source": "invite",
      "company": {
        "id": "tenant-uuid",
        "name": "Example Foods"
      }
    }
  }
}
```

### GET /dgfy/account/companies

Requires an authenticated DGFY account JWT, `sku_dgfy_session` cookie, or a normal IMS tenant session whose current tenant user is explicitly linked to an accepted `DgfyAccountTenantMembership`.

Return companies connected to the DGFY account. Accepted active memberships are switchable. Pending IMS email invitations are visible but not switchable until accepted. Verified DGFY accounts may also mirror legacy founder/master-admin companies into accepted `source='founder'` memberships before listing, but only after the landlord email mapping, active tenant, active non-deleted tenant-local user, exact normalized email match, and `is_master_admin=true` checks pass. The response does not expose tenant `company_token`.

The IMS tenant-session path is available for the SKUpervisor company switcher after direct IMS login. It resolves the DGFY account only through the accepted membership row for the current `tenant_id` and tenant-local `user_id`; email or mobile matches alone are rejected.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "accepted_count": 1,
    "pending_count": 1,
    "business_step_up": {
      "verified": false,
      "verified_at": null,
      "expires_at": null
    },
    "companies": [
      {
        "membership_id": 12,
        "tenant_id": "tenant-uuid",
        "tenant_user_id": 7,
        "company_name": "Example Foods",
        "role": "admin",
        "source": "founder",
        "membership_status": "accepted",
        "tenant_status": "active",
        "plan": "premium",
        "accepted_at": "2026-06-16T10:00:00.000Z",
        "last_selected_at": "2026-06-16T10:15:00.000Z",
        "is_current": true,
        "can_switch": true,
        "is_owner": true,
        "can_leave": false,
        "can_transfer_ownership": true,
        "group": "owned",
        "requires_action": null
      }
    ],
    "owned_companies": [],
    "invited_companies": [],
    "pending_invitations": []
  }
}
```

### GET /dgfy/legacy-link/status

Requires a normal authenticated tenant session. Returns the current tenant-local user's DGFY migration state for IMS/POS grace messaging and guided linking UI.

```json
{
  "success": true,
  "data": {
    "dgfy_link_status": "not_linked",
    "legacy_grace_expires_at": "2027-06-17T23:59:59.999Z",
    "dgfy_membership_id": null,
    "dgfy_account_id": null,
    "can_legacy_login": true,
    "legacy_login_block_reason": null
  }
}
```

`dgfy_link_status` may be `linked`, `not_linked`, `pending`, or `legacy_grace_expired`. Direct tenant login for unlinked users is allowed only while `LEGACY_TENANT_LOGIN_GRACE_ENABLED=true` and before `LEGACY_TENANT_LOGIN_GRACE_END` (default June 17, 2027).

### POST /dgfy/legacy-link/request-email-otp

Requires a normal authenticated legacy tenant session. Sends a six-digit `dgfy_legacy_link` OTP to the tenant-local user's email before linking the existing authorization profile to a DGFY account.

### POST /dgfy/legacy-link/complete

Requires a normal authenticated legacy tenant session, a valid `dgfy_legacy_link` OTP for the tenant-local email, and an authenticated DGFY account token or cookie. The DGFY account email must exactly match the tenant-local user email. After OTP verification, the accepted `DgfyAccountTenantMembership`, founder owner bootstrap when applicable, email-to-tenant mapping, and success audit are written in a landlord transaction. If any landlord write fails, the link fails closed and writes `legacy_link_failed` audit evidence for repair. Success preserves tenant role/permissions/location scope through the existing tenant-local user row and returns the updated link status.

```json
{
  "email_otp_code": "123456",
  "dgfy_account_token": "optional-dgfy-account-jwt"
}
```

### POST /dgfy/legacy-link/start-registration-handoff

Requires a normal authenticated legacy tenant session. Returns a DGFY registration/linking handoff payload for clients that need to route the user to DGFY account creation before completing `/dgfy/legacy-link/complete`.

### GET /dgfy/accounts/search

Requires an IMS tenant session with `users:manage` and the DGFY auth limiter. Search active registered DGFY accounts by email, phone, username, first name, or last name for invitation targeting. Responses expose only safe identity fields and current company connection state.

```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "dgfy_account_id": "42",
        "display_name": "Maria Santos",
        "email": "maria@example.com",
        "masked_phone": "*******1234",
        "account_status": "active",
        "membership_status": null,
        "already_connected": false
      }
    ]
  }
}
```

### POST /dgfy/invitations

Requires an IMS tenant session with `users:manage`. Invite an existing active DGFY account to the current tenant. The request creates a pending tenant-local authorization profile, pending `DgfyAccountTenantMembership`, and landlord invitation registry row with compensating rollback if landlord membership/registry writes fail after the tenant-local profile is prepared. No invitation link or `company_token` is returned.

```json
{
  "dgfy_account_id": "42",
  "role": "cashier",
  "role_preset_key": "cashier",
  "location_ids": [3]
}
```

### POST /dgfy/invitations/:membership_id/reject

Requires the invited authenticated DGFY account. Marks the membership and tenant invitation `declined` and audits the rejection.

### POST /dgfy/account/companies/:tenant_id/leave

Requires the authenticated DGFY account to have an accepted non-owner membership for the tenant. Founder-owned companies cannot be left until ownership is transferred.

### POST /dgfy/account/companies/:tenant_id/transfer-ownership

Requires the current owner DGFY account, a recent or supplied `dgfy_business_step_up` code, and a target DGFY account with an accepted membership in the same tenant.

```json
{
  "target_dgfy_account_id": "84",
  "email_otp_code": "123456"
}
```

### POST /dgfy/account/companies/:tenant_id/pos-session

Requires an authenticated DGFY account with accepted membership, POS permission/capability, and a selected terminal/counter. Creates the normal tenant session for POS and returns terminal context. Company-token context can preselect the company only after DGFY access is confirmed.

```json
{
  "terminal_id": "COUNTER-01"
}
```

### POST /dgfy/account/business-step-up/request

Requires an authenticated DGFY account JWT, `sku_dgfy_session` cookie, or a normal IMS tenant session whose current tenant user is explicitly linked to an accepted `DgfyAccountTenantMembership`.

Send a six-digit `dgfy_business_step_up` email OTP to the DGFY account email for owner-sensitive actions such as ownership transfer. This version is email-only and does not use mobile/SMS OTP. Invitation accept/reject and company switch/open-inventory actions are intentionally not gated by this code.

### POST /dgfy/account/companies/:tenant_id/switch

Requires an authenticated DGFY account JWT, `sku_dgfy_session` cookie, or a normal IMS tenant session whose current tenant user is explicitly linked to an accepted `DgfyAccountTenantMembership`.

Switch into an accepted active company membership without sending or requiring an email verification code. The response sets normal SKUpervisor tenant refresh/company cookies and returns the standard tenant access session payload without exposing the refresh token.

**Request**

```json
{}
```

### DGFY Platform Admin Account Endpoints

Platform-admin DGFY account endpoints live under `/api/v1/dgfy/admin/accounts` and require the admin JWT/cookie accepted by `authenticateAdmin`. These endpoints are landlord-scoped and are not tenant-isolated.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/dgfy/admin/accounts` | List all DGFY accounts with filters for status, email verification, company membership, search, page, and limit |
| `POST` | `/dgfy/admin/accounts` | Create an admin-provisioned active DGFY account with a temporary password and audit reason |
| `GET` | `/dgfy/admin/accounts/:account_id` | Return one DGFY account with tenant memberships and recent admin audit rows |
| `PATCH` | `/dgfy/admin/accounts/:account_id/profile` | Update first name, optional middle name, last name, and phone |
| `POST` | `/dgfy/admin/accounts/:account_id/suspend` | Suspend a DGFY account and require a reason |
| `POST` | `/dgfy/admin/accounts/:account_id/reactivate` | Reactivate a suspended DGFY account and require a reason |
| `DELETE` | `/dgfy/admin/accounts/:account_id` | Deidentify a DGFY account, release original credentials for registration, and require reason plus current-email confirmation |

List query parameters:

| Name | Values | Description |
| --- | --- | --- |
| `status` | `all`, `active`, `suspended`, `deleted` | Filters by lifecycle status. `all`, `active`, and `suspended` exclude deleted rows; `deleted` returns redacted deleted rows. |
| `verification` | `all`, `verified`, `unverified` | Filters by `email_verified_at` presence |
| `membership` | `all`, `has_membership`, `no_membership` | Filters by landlord DGFY tenant membership rows |
| `search` | string | Searches first/middle/last name, username, email, or phone |
| `page` | number | Defaults to `1` |
| `limit` | number | Defaults to `25`, max `100` |

**List Response (200)**

```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "dgfy-account-uuid",
        "first_name": "Ada",
        "middle_name": null,
        "last_name": "Lovelace",
        "username": "Ada",
        "email": "ada@example.com",
        "phone": "+639123456789",
        "is_active": true,
        "lifecycle_status": "active",
        "deleted_at": null,
        "deleted_by": null,
        "deletion_reason": null,
        "is_email_verified": true,
        "email_verified_at": "2026-05-21T00:00:00.000Z",
        "phone_verified_at": null,
        "membership_count": 1,
        "last_login_at": "2026-06-01T00:00:00.000Z",
        "created_at": "2026-05-21T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 1,
      "total_pages": 1
    },
    "summary": {
      "total": 1,
      "active": 1,
      "suspended": 0,
      "deleted": 0,
      "verified_email": 1,
      "unverified_email": 0
    }
  }
}
```

**Profile Update Request**

```json
{
  "first_name": "Ada",
  "middle_name": "Byron",
  "last_name": "Lovelace",
  "phone": "+639123456789"
}
```

**Create Admin-Provisioned Account Request**

```json
{
  "first_name": "Maria",
  "middle_name": "",
  "last_name": "Santos",
  "email": "maria@example.com",
  "phone": "+639123456789",
  "temporary_password": "optional-admin-supplied-password",
  "reason": "White glove onboarding"
}
```

This endpoint does not consume public OTP. It creates an active account with `provisioning_status="admin_provisioned"`, `temporary_password_active=true`, `email_verification_source="platform_admin_provisioned"`, and `phone_verified_at=null`. The temporary password is returned only in the create response and is excluded from audit snapshots.

Email changes are rejected from this endpoint. DGFY email changes remain deferred until a dedicated verified email-change or approved admin override design exists. Phone changes clear `phone_verified_at`; phone verification remains deferred and must not be presented as verified identity.

**Suspend/Reactivate Request**

```json
{
  "reason": "Risk review completed"
}
```

Suspend/reactivate uses `dgfy_accounts.is_active` as the lifecycle source of truth. Suspended accounts cannot log in, and existing DGFY sessions fail on the next authenticated DGFY request because the account is reloaded and checked. Every profile/lifecycle mutation writes `dgfy_account_admin_audit_logs` with safe before/after snapshots and no secrets.

**Delete Request**

```json
{
  "reason": "Account owner requested credential reset",
  "confirm_email": "ada@example.com"
}
```

Delete is a landlord-scoped deidentify action, not physical erasure. It requires the current account email in `confirm_email`, sets `deleted_at`, deactivates the account, clears verification/login timestamps, replaces the account email, phone, username, display names, and password hash with non-user placeholders, and writes a `delete` audit row. The original email, phone, and username are then available for a new DGFY registration. Legal acknowledgements, tenant memberships, customer activity, reviews, loyalty, order/history records, and admin audit evidence remain preserved.

### DGFY Customer Account Endpoints

Front-facing customer account endpoints live under `/api/v1/dgfy/customer`. Except for tracking recovery request/verify, they require `Authorization: Bearer <dgfy-account-token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/dgfy/customer/dashboard` | Return DGFY profile summary, recent account activity, orders, bookings, addresses, and read-only loyalty summary |
| `GET` | `/dgfy/customer/activities` | Return paginated normalized cross-store history with filters for `type`, `tenant_id`, `store_slug`, `status`, `payment_status`, date range, page, and limit |
| `GET` | `/dgfy/customer/orders` | List account-linked order activities |
| `GET` | `/dgfy/customer/bookings` | List account-linked service/hospitality booking activities |
| `GET` | `/dgfy/customer/notifications` | List account-scoped customer notifications with optional unread filtering |
| `PATCH` | `/dgfy/customer/notifications/:notification_id/read` | Mark one account-owned notification as read |
| `PATCH` | `/dgfy/customer/notifications/read-all` | Mark all account-owned notifications as read |
| `GET` | `/dgfy/customer/events` | Stream account-scoped live activity and notification events with Server-Sent Events |
| `POST` | `/dgfy/customer/track` | Track an account-linked reference by `reference` or `tracking_pin` |
| `POST` | `/dgfy/customer/orders/:reference/cancel` | Cancel an eligible account-linked order |
| `POST` | `/dgfy/customer/orders/:reference/reorder` | Return reusable cart lines for a prior order; checkout revalidates current state |
| `GET` | `/dgfy/customer/addresses` | List global DGFY saved addresses |
| `POST` | `/dgfy/customer/addresses` | Create a saved address |
| `PUT/PATCH` | `/dgfy/customer/addresses/:address_id` | Update a saved address |
| `PATCH` | `/dgfy/customer/addresses/:address_id/default` | Set a saved address as the account default |
| `DELETE` | `/dgfy/customer/addresses/:address_id` | Delete a saved address |
| `GET` | `/dgfy/customer/loyalty` | Return read-only loyalty balance and transactions |
| `POST` | `/dgfy/customer/reviews` | Submit a paid-or-completed activity-gated typed review as pending approval |
| `GET` | `/dgfy/customer/review-invites/:token` | Validate a fulfilled guest review invite token and return safe review target metadata |
| `POST` | `/dgfy/customer/review-invites/:token/submit` | Submit a fulfilled guest invite review as pending approval and consume the single-use token |
| `POST` | `/dgfy/customer/tracking-recovery/request` | Request a generic tracking recovery response for email/phone lookup |
| `POST` | `/dgfy/customer/tracking-recovery/verify` | Verify a six-digit recovery code and return matching activity references |

`POST /dgfy/customer/addresses` and `PUT/PATCH /dgfy/customer/addresses/:address_id` accept `label`, `address_line`, optional nullable `latitude`, optional nullable `longitude`, and `is_default`. Latitude must be within `-90..90`, longitude must be within `-180..180`, and coordinates must be supplied or cleared as a pair. Text-only addresses remain valid fallback records and must not be rejected only because coordinates are absent. Coordinate-backed addresses are preferred for delivery checkout because Storefront checkout persists them as nullable `delivery_latitude` and `delivery_longitude` on the online POS transaction.

Storefront checkout keeps account-saved, temporary checkout, recommended store or branch, manual map, current-device, and text-only location states internally distinct while preserving the public checkout payload shape. A delivery checkout is valid when it has readable address text, with or without coordinates. If coordinates are present, POS incoming orders can render address text, coordinate text, and a map-navigation link; if coordinates are absent, POS must render the text address without a broken map link.

`PATCH /dgfy/customer/addresses/:address_id/default` is a transport alias for updating the address with `is_default=true`; it must remain registered before the generic `PATCH /dgfy/customer/addresses/:address_id` route. Storefront checkout and booking forms consume the default saved address for signed-in customers only when the visible customer address field is still empty.

`GET /dgfy/customer/activities` is the canonical customer history endpoint. Activity `type` may be `order`, `service_booking`, `hospitality_booking`, `fnb_order`, `booking`, or `all`; `booking` expands to Services and Hospitality activity. Response cards include `reference`, `store`, `type`, `status`, `payment_status`, `occurred_at`, `total_amount`, `summary_lines`, `allowed_actions`, and `review_targets`.

Dashboard, activities, and account reference tracking reads refresh account-owned order snapshots from the tenant POS transaction before returning data when the activity is already explicitly linked to the signed-in DGFY account. This read-time refresh must not adopt guest orders by email or phone matching.

`GET /dgfy/customer/notifications` returns only notifications owned by the signed-in DGFY account. `unread_only=true` limits the result to unread rows, and `limit` bounds the returned rows. Notification rows include `notification_id`, `type`, `title`, `body`, `status`, `reference`, optional `tenant_id`, optional `activity_id`, `read_at`, and `created_at`; the response also includes `unread_count`. Order-status notification writes are idempotent by `event_key`. Read mutations publish account-scoped `notification.read` events, and newly created order-status notifications publish `notification.created`.

`GET /dgfy/customer/events` is an authenticated SSE stream for the active DGFY account. It emits `connected`, periodic `heartbeat`, `activity.updated`, `notification.created`, and `notification.read` events. Stream events are account-scoped and do not expose other tenants or other DGFY accounts.

`POST /dgfy/customer/reviews` accepts `activity_id`, `target_type`, optional `target_id`, `rating`, `comment`, and optional `anonymous`. Supported target types are `product`, `service`, `hospitality_booking`, `fnb_order`, and `fnb_item`; the activity snapshot must prove eligibility, and reviews remain pending until moderated. Public review reads require `tenant_id` plus `item_id` or explicit `target_type`/`target_id`, only return approved rows, and include summary fields such as average rating, total count, verified count, and rating distribution.

Guest review invite endpoints are public token routes. Invite tokens are stored as hashes, are scoped to fulfilled activity targets, and can be rejected when expired, submitted, revoked, duplicated, or replayed. `GET /dgfy/customer/review-invites/:token` returns safe target/store/item metadata for a valid invite. `POST /dgfy/customer/review-invites/:token/submit` accepts `rating`, `comment`, and optional `anonymous`, creates a pending review, and marks the invite submitted. The guest invite path must not create or mutate signed-in DGFY account activity/history.

Tracking recovery intentionally uses generic production responses and does not reveal whether a lookup matched an order or whether delivery was attempted. Email delivery is used when matching activity has an email address. Phone OTP remains deferred and phone values must not be treated as verified; phone lookup supports common Philippine variants for matching only.

Historical DGFY customer activity backfill is an operator command, not a public API. Use `npm run backfill:dgfy-customer-activity:apply` for apply mode so landlord migrations run before activity writes. Dry-run uses `npm run backfill:dgfy-customer-activity -- ...`. The backfill indexes POS customer orders, F&B checks linked through POS transactions, Services bookings, and Hospitality reservations into `dgfy_customer_activities`. Production dry-runs can require mode discovery with `--require-activity-types=order,service_booking,hospitality_booking,fnb_order` before apply.

Storefront checkout and Services booking responses include `account_action` when account follow-up is available:

| Type | Meaning |
| --- | --- |
| `linked_authenticated` | The transaction was linked to the authenticated DGFY account. |
| `offer_signup` | Guest checkout used a new email that can create a DGFY account. |
| `existing_account_download_only` | Guest checkout used an email that already belongs to a DGFY account; prompt sign-in instead of duplicate registration. |
| `download_only_guest_no_email` | No account association is available; show only confirmation/download/tracking guidance. |

### POST /admin/tenants/register

Requires `Authorization: Bearer <dgfy-account-token>`.

Public company registration derives founder email, phone, username seed, and password hash from the authenticated DGFY account. Clients must not send founder contact, password, plan, or compliance mode. New companies start `non_compliant_active`; compliance activation is handled later from Settings > Compliance.

**Request**

```json
{
  "name": "Example Foods",
  "workflowMode": "food_manufacturing",
  "accepted_company_terms": true,
  "company_terms_version": "dgfy-company-terms-2026-06-08",
  "marketplace_terms_version": "dgfy-marketplace-provider-2026-06-08"
}
```
Submit a public company registration request.

**Access:** Public, rate-limited.

**Current policy**
- All new registrations persist `plan: "premium"` by default so mode-specific premium-gated surfaces are available after activation.
- `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` (default): public company registrations are provisioned immediately and return `status: "active"` with a `company_token`; the registration UI then immediately starts a normal SKUpervisor tenant session through the authenticated DGFY account membership handoff.
- `TENANT_REGISTRATION_APPROVAL_MODE=manual`: registrations return `status: "pending"` and require platform admin approval before login. Use this as an explicit rollback/admin-review mode.
- Provider subscription registration remains disabled while `PAYMENTS_ENABLED=false`; payloads with `subscriptionId` return `503` with `PAYMENTS_DISABLED`.
- Auto-standard and manual premium-capable registrations keep `subscription_status: "inactive"` while payments are paused. In that mode, premium route access is plan-driven and does not require an active subscription row.
- Approval email delivery is non-blocking after provisioning; active responses include `email_sent`.
- Active registration responses do not include tenant auth tokens. For active auto-standard responses, the frontend immediately calls `POST /api/v1/dgfy/auth/tenant-session` with the returned tenant identity while authenticated as the DGFY account; that endpoint sets the standard SKUpervisor session cookies and returns the normal tenant access token payload. If that exchange fails, the frontend routes the founder to manual sign-in with email/company token prefilled.
- Storefront-originated business registration starts from the signed-in DGFY account surface. The storefront creates a short-lived one-time DGFY handoff token and routes to `/register-company?source=dgfy&auth=login&handoff_token=<token>#business-registration`; after exchange, the page focuses the business registration section.
- Manual pending registrations create founder email lookup mappings during registration. Default auto-standard registrations rely on the provisioning path to create the mapping after successful activation.
- Abuse control: public company registration is IP rate-limited by `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` and `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS` (production default: 5 requests per hour). Keep this strict because each accepted registration provisions an isolated tenant database by default.
- Tenant-session fallback: if the DGFY tenant-session exchange fails after active provisioning, the frontend routes the founder to manual sign-in with email/company token prefilled.
- Founder contact and credentials: public company registration no longer accepts `adminEmail`, `adminPhone`, or `adminPassword`; the server derives them from the authenticated DGFY account.
- Founder account source: public company registration requires a signed-in active DGFY account. The backend derives founder email, phone, username seed, and password hash from that account and does not require a separate DGFY email-code step or `email_verified_at` gate before tenant creation.
- Legal acknowledgement: public company registration requires the current company terms and marketplace-provider terms acknowledgement from `GET /dgfy/legal-terms/current` before tenant creation. The backend fails closed before tenant creation if legal acknowledgement persistence is unavailable. After confirming there is a signed-in active DGFY account, the landlord tenant row, pending-founder membership when applicable, and acknowledgement evidence are written in one landlord transaction. The acknowledgement states that DGFY is an e-marketplace/platform service provider, the seller owns the product, sets the price, fulfills the order, remains seller of record, payment is processed by a licensed payment partner, and DGFY deducts disclosed fees before remitting the seller's net settlement. Missing, false, or stale acknowledgement returns `422 TERMS_ACKNOWLEDGEMENT_REQUIRED`.

### Platform Admin Assisted Provisioning Endpoints

These endpoints require the platform admin JWT/cookie accepted by `authenticateAdmin`. They are privileged onboarding paths and do not change the public `/admin/tenants/register` OTP/DGFY-account requirement.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/admin/tenants/admin-provision` | Create and immediately provision an ownerless platform-admin company |
| `POST` | `/admin/tenants/admin-provision-with-account` | Create a DGFY account and company together, then link accepted founder membership |
| `POST` | `/admin/tenants/:id/owner` | Assign or force-assign an existing active DGFY account as company owner |

Company-only provisioning accepts company name, workflow mode, admin email, admin phone, temporary password, and reason. It creates a tenant with `provisioning_source="platform_admin"` and `ownership_status="unassigned"`, provisions the tenant database immediately, and returns the temporary password once. Ownerless companies cannot issue DGFY tenant sessions, POS sessions, or switcher access until an owner is assigned.

Combined provisioning accepts a DGFY account payload plus company payload and reason. It creates an admin-provisioned DGFY account, provisions the tenant database, creates the tenant-local master admin profile, and writes an accepted membership with explicit owner linkage.

Owner assignment accepts `dgfy_account_id`, `reason`, and optional `force` (default `true`). The target must be an existing active DGFY account. The backend must not infer ownership from raw email or phone values.

**Response (201, explicit manual mode)**
```json
{
  "success": true,
  "message": "Your premium plan registration has been submitted for review. You will be notified once approved.",
  "data": {
    "id": "tenant-id",
    "name": "ACME Corp",
    "status": "pending",
    "plan": "premium",
    "company_token": "token-acme-123"
  }
}
```

**Response (201, default auto_standard mode)**
```json
{
  "success": true,
  "message": "Company registered and activated successfully. You can sign in now.",
  "data": {
    "id": "tenant-id",
    "name": "ACME Corp",
    "status": "active",
    "plan": "premium",
    "company_token": "token-acme-123",
    "email_sent": false
  }
}
```

### GET /admin/tenants
List all tenant registrations with their status.

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "ACME Corp",
      "admin_email": "admin@acme.com",
      "company_token": "token-acme-123",
      "status": "pending",
      "plan": "standard",
      "effective_plan": "premium",
      "plan_policy": "registered_tenant_premium_capable",
      "compliance_mode_state": null,
      "compliance_mode_choice_required": true,
      "admin_compliance_mode_action": {
        "action": "select_mode",
        "allowed": true,
        "label": "Set compliance mode",
        "helper_text": "Select non-compliant POS access or move the tenant into compliant pending mode.",
        "options": ["non_compliant", "compliant"]
      },
      "can_force_non_compliant": false,
      "force_non_compliant_block_reason": "Compliance mode has not been selected yet.",
      "capabilities": {
        "ims_enabled": true,
        "pos_enabled": true,
        "storefront_visible": false,
        "customer_access_mode": "catalog",
        "storefront_readiness": {
          "has_active_primary_location": false,
          "has_coordinates": false,
          "publishable": false,
          "visible_and_publishable": false,
          "reason": "missing_active_primary_storefront_location"
        }
      },
      "created_at": "2026-02-06T..."
    }
  ]
}
```

**Eligibility fields (server-computed)**
- `can_force_non_compliant`: authoritative eligibility flag for admin `POST /admin/tenants/:id/force-non-compliant` action.
- `force_non_compliant_block_reason`: human-readable reason when force action is blocked.
- `admin_compliance_mode_action`: authoritative next platform-admin compliance lifecycle action. Supported actions are `select_mode`, `upgrade_to_compliant_pending`, `force_non_compliant`, and `none`. A `compliant` selection or upgrade moves the tenant only to `compliant_pending`; `compliant_active` remains gated by the existing checklist activation flow.
- Admin UI should treat these fields as source-of-truth instead of recomputing eligibility from local assumptions.
- `effective_plan`: authoritative plan value to render and use for admin presentation. Pending and active tenants return `premium` even if a historical stored `plan` value is still `standard`.
- `plan_policy`: explains whether `effective_plan` came from stored metadata (`stored_plan`) or registered-tenant premium capability normalization (`registered_tenant_premium_capable`).
- `capabilities`: active tenants include platform-admin capability settings. Missing tenant-local capability settings default to `ims_enabled=true`, `pos_enabled=true`, `storefront_visible=false`, and `customer_access_mode=catalog`.
- `capabilities.storefront_readiness`: indicates whether public Storefront visibility can publish through an active primary storefront location with valid coordinates.

### PATCH /admin/tenants/:id/capabilities
Update platform-admin capability controls for an active tenant.

**Request**
```json
{
  "ims_enabled": true,
  "pos_enabled": false,
  "storefront_visible": true,
  "customer_access_mode": "inquiry",
  "platform_max_customer_access_mode": "transaction",
  "customer_access_registration_stage": "registered",
  "reason": "Temporarily disable POS while the tenant completes terminal readiness remediation"
}
```

**Validation**
- At least one of `ims_enabled`, `pos_enabled`, `storefront_visible`, `customer_access_mode`, `platform_max_customer_access_mode`, or `customer_access_registration_stage` is required.
- Boolean fields must be JSON booleans, not strings.
- `customer_access_mode` must be one of `ghost`, `catalog`, `inquiry`, or `transaction`.
- `platform_max_customer_access_mode` must be one of `ghost`, `catalog`, `inquiry`, or `transaction`.
- `customer_access_registration_stage` must be one of `informal`, `partial`, or `registered`.
- `reason` is required, trimmed, and must be 3-500 characters.

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant capabilities updated successfully",
  "data": {
    "tenant_id": "tenant-uuid",
    "capabilities": {
      "ims_enabled": true,
      "pos_enabled": false,
      "storefront_visible": true,
      "customer_access_mode": "inquiry",
      "requested_customer_access_mode": "inquiry",
      "effective_customer_access_mode": "inquiry",
      "max_customer_access_mode": "transaction",
      "platform_max_customer_access_mode": "transaction",
      "registration_stage_max_customer_access_mode": "transaction",
      "registration_stage": "registered",
      "customer_access_limitation_reason": null,
      "storefront_readiness": {
        "has_active_primary_location": true,
        "has_coordinates": true,
        "publishable": true,
        "visible_and_publishable": true,
        "location_id": 12,
        "location_name": "Main Branch",
        "reason": null
      }
    }
  }
}
```

**Side Effects**
- Writes tenant-local `system_settings` rows inside one tenant database transaction.
- `customer_access_registration_stage` updates the tenant onboarding progress legitimacy payload used by the runtime access policy; it does not bypass checkout guards.
- Persists a landlord `tenant_admin_audit_logs` row with platform-admin actor, request metadata, reason, and before/after capability snapshots.
- Storefront visibility, access-mode, platform-ceiling, or registration-readiness changes refresh `storefront_discovery_index`. If that refresh fails, the backend rolls back the Storefront setting changes and returns an error instead of reporting success.

### GET /admin/tenants/:id/capabilities/audit-logs
List recent platform-admin capability changes for one tenant.

**Query**
- `limit`: optional integer from 1-100. Defaults to 20.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "tenant_id": "tenant-uuid",
    "logs": [
      {
        "id": 12,
        "tenant_id": "tenant-uuid",
        "action": "capability_update",
        "actor_username": "skupervisor",
        "reason": "Temporarily disable POS during terminal readiness remediation",
        "request_id": "req-123",
        "before_snapshot": {
          "ims_enabled": true,
          "pos_enabled": true,
          "storefront_visible": true,
          "customer_access_mode": "catalog"
        },
        "after_snapshot": {
          "ims_enabled": true,
          "pos_enabled": false,
          "storefront_visible": true,
          "customer_access_mode": "catalog"
        },
        "metadata": {
          "changed_fields": ["tenant_pos_enabled"],
          "storefront_sync_required": false
        },
        "created_at": "2026-06-07T03:00:00.000Z"
      }
    ]
  }
}
```

**Notes**
- The endpoint is tenant-scoped and requires platform-admin authentication.
- Returned rows are ordered newest first.

### POST /admin/tenants/:id/approve
Approve a pending tenant registration and provision their isolated database.

**Request**
No body required.

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant approved and provisioned successfully",
  "data": {
    "id": 1,
    "name": "ACME Corp",
    "status": "active",
    "database_name": "sku_tenant_acme_corp",
    "email_sent": true
  }
}
```

**Side Effects**:
- Creates isolated tenant database with all required tables
- Seeds default admin user with provided credentials
- **Sends approval email** with login credentials and company token (if SMTP configured)
- Uses the shared tenant model clone graph for all workflow modes. Tenant-local models are cloned from the canonical backend model registry; landlord-only models remain outside tenant databases.
- If provisioning fails before activation, drops the partially created tenant database and restores approval-flow tenants to a retryable `pending` status.

**Response Fields**:
- `email_sent`: Boolean indicating whether approval notification email was sent successfully

### POST /admin/tenants/:id/reject
Reject a pending tenant registration.

**Request**
```json
{
  "reason": "Optional rejection reason displayed to the registrant"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant registration rejected",
  "data": {
    "id": 1,
    "status": "rejected",
    "email_sent": true
  }
}
```

**Side Effects**:
- Updates tenant status to "rejected"
- **Sends rejection email** with reason (if provided) and link to re-register (if SMTP configured)

**Response Fields**:
- `email_sent`: Boolean indicating whether rejection notification email was sent successfully

### PUT /admin/tenants/:id
Update tenant status. The legacy `plan` field remains accepted for transport compatibility, but registered tenants are premium-capable by policy.

**Request**
```json
{
  "status": "inactive"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant updated successfully",
  "data": {
    "id": 1,
    "name": "ACME Corp",
    "status": "inactive",
    "plan": "premium",
    "updated_at": "2026-02-12T..."
  }
}
```

**Notes**:
- `status` values: "active", "inactive" (soft delete), "pending", "rejected"
- `plan` values: "standard", "premium"
- Changing status to "inactive" prevents all users of that tenant from logging in.
- Pending and active tenants are normalized to `plan: "premium"` by this route. Sending `"plan": "standard"` for an active tenant does not downgrade it.
- In default billing-paused mode (`PAYMENTS_ENABLED=false`), premium route access is plan-driven and does not require `subscription_status: "active"`.
- Billing automation endpoints remain disabled in that mode (`POST /admin/tenants/:id/change-plan`, `/payments/*` return `503` + `PAYMENTS_DISABLED`).

### DELETE /admin/tenants/:id
Permanently delete a tenant and their isolated database. **IRREVERSIBLE**.

**Request**
No body required.

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant and database permanently deleted"
}
```

**Side Effects**:
- Removes the landlord `storefront_discovery_index` row before database deletion. If discovery cleanup fails, the request returns `500` and does not drop the tenant database. If database deletion fails after index cleanup, the backend best-effort restores the discovery row before returning the failure.
- **DROPS** the tenant's isolated database (`sku_tenant_...`)
- Removes the tenant record from the `Tenants` table
- This action cannot be undone. All data is lost.

### GET /admin/tenants/:id/compliance/security-incidents
List tenant security incidents aggregated from immutable compliance audit logs.

### POST /admin/tenants/:id/compliance/final-review/documents/:document_id/review
Platform-admin review action for tenant documentary records (note/revoke/restore).

**Access:** Admin JWT required (`authenticateAdmin`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `limit` | number | Max log rows scanned for incident aggregation (default 200, max 500) |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "incident_id": "sig-mass_export_threshold_reached-20260408103000",
        "signal_code": "mass_export_threshold_reached",
        "severity": "warning",
        "status": "acknowledged",
        "opened_at": "2026-04-08T10:30:00.000Z",
        "updated_at": "2026-04-08T11:00:00.000Z",
        "event_count": 2,
        "dispatch": {
          "channel": "email",
          "delivery_status": "queued",
          "attempted_at": "2026-04-08T11:00:30.000Z",
          "error": null,
          "target_configured": true,
          "dispatch_reference": "email:compliance@example.com"
        }
      }
    ],
    "counts": {
      "total": 1,
      "requires_action": 1,
      "new": 0,
      "acknowledged": 1,
      "resolved": 0
    }
  }
}
```

### POST /admin/tenants/:id/compliance/security-incidents/:incident_id/acknowledge
Append immutable compliance audit evidence that an incident has been acknowledged.

### POST /admin/tenants/:id/compliance/security-incidents/:incident_id/resolve
Append immutable compliance audit evidence that an incident has been resolved.

### POST /admin/tenants/:id/compliance/mode/select
Platform-admin governed mode selection for tenants whose lifecycle has not been selected.

**Request Body**
```json
{
  "mode_choice": "compliant",
  "reason": "Tenant requested compliant onboarding",
  "context": {
    "ticket": "OPS-432"
  }
}
```

**Behavior**
- Allowed for tenants with no selected compliance lifecycle or `compliance_mode_choice_required=true`.
- `mode_choice=non_compliant` sets `non_compliant_active` and enables non-fiscal POS operation.
- `mode_choice=compliant` sets `compliant_pending`; fiscal issuance remains blocked until normal checklist activation succeeds.
- Requires platform-admin authentication and a 3-255 character reason.
- Persists immutable compliance audit event `mode_selection`; the mutation fails closed if the primary audit write is unavailable.

### POST /admin/tenants/:id/compliance/mode/upgrade
Platform-admin governed upgrade from non-compliant POS mode into compliant pending mode.

**Request Body**
```json
{
  "reason": "Tenant is preparing compliance documents",
  "context": {
    "ticket": "OPS-433"
  }
}
```

**Behavior**
- Allowed only from `non_compliant_active`.
- Moves the tenant to `compliant_pending`; it does not set `compliant_active`.
- Fiscal issuance remains gated by `POST /api/v1/compliance/activate` and the existing readiness checklist.
- Requires platform-admin authentication and a 3-255 character reason.
- Persists immutable compliance audit event `mode_upgrade`; the mutation fails closed if the primary audit write is unavailable.

### POST /admin/tenants/:id/force-non-compliant
Platform-admin governed downgrade to force tenant lifecycle back to `non_compliant_active`.

**Request Body**
```json
{
  "reason": "Emergency rollback due to compliance incident",
  "context": {
    "ticket": "OPS-431"
  }
}
```

**Behavior**
- Allowed only when tenant lifecycle is `compliant_pending` or `compliant_active`.
- Returns `409` when tenant is already `non_compliant_active`.
- Returns `422` when tenant lifecycle is not one of the allowed compliant states.
- Persists immutable compliance audit event `mode_force_non_compliant`.
- Platform admin UI guard: action is disabled for unsupported lifecycle states and shows helper text to prevent avoidable `422` requests.

**Request Body (both endpoints)**
```json
{
  "note": "Validated incident and completed remediation",
  "evidence_ref": "SEC-INC-2026-041"
}
```

**Response Notes (both endpoints)**
- `data.dispatch` includes latest dispatch summary (`channel`, `delivery_status`, `attempted_at`, `error`).
- `delivery_status` values:
  - `recorded` for `audit_only` mode
  - `queued` or `sent` when external channel target is configured
  - `failed` when strict channel delivery is enabled but target is missing or simulated dispatch failure is triggered
- `data.dispatch.target_configured` is `false` when strict channel delivery was requested but no endpoint/recipient is configured.
- `data.dispatch.dispatch_reference` is included when a concrete email/webhook target is available.
- `data.dispatch_attempt_append_result` indicates where immutable dispatch evidence was persisted (`primary`, `fallback`, or `none`).

---

## Receive Tokens (QR Scan) Endpoints

These endpoints power the mobile QR receiving flow for Purchase Orders and Job Orders. The validate and receive endpoints are **public** — the QR token itself is the authorization credential.

### POST /receive-tokens
Generate a QR token for a PO or JO. The token encodes a URL that the mobile receiver scans.

**Access:** Private (requires JWT)

**Request**
```json
{
  "order_type": "PO",
  "order_id": 39,
  "expiry_days": 7
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "token": "a3f8c2e1...",
    "expires_at": "2026-02-26T10:00:00.000Z",
    "url": "/receive/a3f8c2e1..."
  }
}
```

---

### GET /receive-tokens/:token
Validate a QR token and retrieve order details for the mobile receive page.

**Access:** Public (token is the credential)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "receiveToken": {
      "token_id": 5,
      "token_type": "PO",
      "expires_at": "2026-02-26T10:00:00.000Z"
    },
    "order": {
      "order_type": "PO",
      "order_id": 39,
      "order_number": "PO-2026-943841",
      "supplier_name": "Pillow Supplier",
      "status": "pending",
      "total_items": 1,
      "total_remaining": 60,
      "items": [
        {
          "line_item_id": 12,
          "item_name": "Pillow",
          "sku_code": "PIL-001",
          "quantity_ordered": 60,
          "quantity_received_total": 0,
          "quantity_remaining": 60,
          "unit_of_measure": "pcs"
        }
      ]
    }
  }
}
```

For a **JO** token the `order` shape is:
```json
{
  "order_type": "JO",
  "order_id": 12,
  "order_number": "JO-2026-001",
  "product_name": "Assembled Pillow",
  "status": "in_progress",
  "quantity_to_produce": 100,
  "quantity_produced": 0,
  "ingredients": [
    { "item_id": 3, "item_name": "Pillow Fill", "quantity_required": 200, "unit_of_measure": "g" }
  ],
  "items": []
}
```

---

### POST /receive-tokens/:token/receive
Perform the PO or JO receive operation. The QR token is validated server-side; no user JWT is required.

**Access:** Public (token is the credential)

**Request — PO**
```json
{
  "line_items": [
    { "line_item_id": 12, "quantity_received": 60, "quality_check_status": "passed" }
  ],
  "notes": "All items in good condition",
  "delivery_rating": 5
}
```

**Request — JO**
```json
{
  "quantity_produced": 80,
  "notes": "Batch complete",
  "quality_check": "pass"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": { "po_id": 39, "status": "received", ... },
  "message": "Received successfully"
}
```

> **Note:** This endpoint also marks the token as `used_at` atomically. A token can only be used once.

---

## Email Configuration

The system uses Nodemailer with SMTP for baseline email delivery and can use Brevo's HTTPS transactional email API as the production fallback when outbound SMTP ports are blocked. Most lifecycle emails gracefully degrade - if email fails, the primary operation (approval/invitation) still succeeds. Email OTP requests are stricter: delivery must succeed before the final account mutation can proceed.

Current operational status as of 2026-05-17:
- Local Gmail SMTP requires a valid Gmail App Password. A normal Gmail password will fail with `EAUTH 535 BadCredentials`.
- Production commit `064766a3c465ca398f2abd821eb8465b72e13e7c` is deployed, the landlord `email_otps` migration is up, and Brevo SMTP verifies with `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, the Brevo SMTP login, the active SMTP key, and verified `EMAIL_FROM=skupervisor@gmail.com`.
- A production send check using `npm run verify:email -- --send-to skupervisor@gmail.com` succeeded through the same `sendEmail` service path used by OTP delivery, returning provider `smtp` and a Brevo/Nodemailer message ID.
- Brevo HTTPS API fallback is configured in shape (`EMAIL_DELIVERY_PROVIDER=auto`, `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API=true`, `BREVO_API_URL=https://api.brevo.com/v3/smtp/email`) but `BREVO_API_KEY` is intentionally empty until an API key is provisioned. The active production path is SMTP.
- Gmail SMTP is acceptable for local/testing only. Production should use Brevo SMTP where ports and credentials verify, or Brevo HTTPS API where only HTTPS egress is reliable.

### Environment Variables
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=SKUpervisor
EMAIL_DELIVERY_PROVIDER=auto
EMAIL_DELIVERY_FALLBACK_TO_BREVO_API=true
BREVO_API_KEY=
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
APP_URL=https://your-domain.com
```

Run `npm run verify:email` from the repo root before enabling OTP enforcement in a new environment. Use `npm run verify:email -- --send-to operator@example.com` for an end-to-end provider send test. The check fails when placeholder SMTP/Brevo credentials are still present. On production, this check passed after correcting `SMTP_USER` to the Brevo SMTP login.

OTP email sends use `sendEmailOtpCode()` and explicitly set the sender display name to `DGFY`. Generic lifecycle email sends keep the configured `EMAIL_FROM_NAME` value, defaulting to `SKUpervisor`.

### Email Types

| Email Type | Trigger | Template |
|------------|---------|----------|
| User Invitation | Creating user invitation via AI or admin panel | `getInvitationTemplate()` |
| Company Approved | Admin approves pending company registration | `getCompanyApprovedTemplate()` |
| Company Rejected | Admin rejects pending company registration | `getCompanyRejectedTemplate()` |
| Email OTP | DGFY account verification, tenant-user registration, invite acceptance, email change verification, and DGFY password reset | `sendEmailOtpCode()` |

### Gmail SMTP Setup
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password at: https://myaccount.google.com/apppasswords
3. Use the 16-character app password as `SMTP_PASS`
4. Keep `EMAIL_FROM` aligned with `SMTP_USER` for Gmail.

## Tenant Onboarding Endpoints

**Bootstrap ownership note**
- Login and current-user bootstrap payloads expose onboarding metadata for tenant master admins.
- Non-master users do not own onboarding lifecycle and may receive `onboarding: null`.
- The active wizard has three steps: `brand_assets`, `primary_location`, and `bulk_items`.
- The `primary_location` wizard step uses the shared IMS MapLibre pin picker. The same picker is used by Settings > Storefront location editing. It uses the shared Storefront MapLibre basemap style for visible street context; adjust-mode click, marker drag, browser geolocation, or manual coordinate edits update the same latitude/longitude fields submitted to the tenant-location API. Settings opens locked and requires `Adjust Pin` before map interactions can change coordinates. Onboarding starts in adjust mode only after searchable storefront visibility is enabled and no valid saved pin exists. The picker opens over Iloilo City, Philippines when no saved pin exists, but that is camera state only and must not be saved as an implicit merchant pin. Missing coordinates, `0,0`, and browser geolocation results outside the Philippines are invalid for merchant-store pins. Browser geolocation uses high-accuracy mode when available and shows reported accuracy feedback, but it remains best effort and cannot guarantee device precision. Click, drag, and geolocation selections may ask the first-party reverse-geocode endpoint for an address suggestion; reverse-geocode failure must not block coordinate saving.
- `GET /api/v1/geo/reverse-geocode` returns first-party PH-local address metadata for IMS map suggestions. Successful responses include `provider="dgfy-ph-local"`, `precision` (`barangay`, `city`, `province`, or `coordinate_only`), optional `distance_meters`, optional PSGC code fields when a bundled local match exists, and `provenance` with the bundled PSGC release/generation metadata. The endpoint must not return vague `Near ...` labels; when no local match is available it returns `Pinned location (lat, lon)` with `precision="coordinate_only"`.
- The `primary_location` step also accepts `payload.business_hours` and persists it to the shared `storefront_hours` setting. The schedule uses `mode="weekly"`, `timezone` such as `Asia/Manila`, and `weekly.{sun..sat}` entries with `enabled`, compatibility `open`/`close`, and `intervals: [{ open, close }]` in `HH:mm` format. Legacy one-window `{ enabled, open, close }` entries normalize to one interval.
- Stored legacy `classification_snapshot` data may remain in older `tenant_onboarding_progress` records, but the current wizard does not create or require business classification output.

### GET /onboarding/status
Get tenant onboarding status snapshot for the authenticated tenant master admin.

**Access**: Private (`master admin` only)

**Response Data**
- `tenant_onboarding_state` (`not_started | in_progress | completed`)
- `tenant_onboarding_started_at` (ISO string or `null`)
- `tenant_onboarding_completed_at` (ISO string or `null`)
- `tenant_onboarding_progress`:
  - `step_payloads` (step-keyed object)
  - `checklist_snapshot` (`required_total`, `completed_required_count`, `missing_requirements`, `is_ready`)
    - required keys are `store_name_ready`, `has_primary_storefront_location`, and `has_priced_starter_item`
    - `has_priced_starter_item` accepts an active item with positive `default_sale_price`; zero stock does not block completion
    - corrected item-taxonomy modes require the item to have a mode-valid `mode_item_preset`

### PUT /onboarding/step
Persist onboarding progress for a step (idempotent).

**Access**: Private (`master admin` only)

**Request**
```json
{
  "step_key": "brand_assets",
  "payload": {
    "profile_uploaded": true,
    "cover_uploaded": false
  }
}
```

**Supported `step_key` values**
- `brand_assets`
- `primary_location`
- `bulk_items`

For `primary_location`, the payload may include:
- `public_storefront_visible` (`boolean`, strict JSON boolean): when `false`, the tenant remains hidden from DGFY discovery/map feeds and the canonical root-handle page (`/:store_tenant_slug`); no public pin is required for onboarding readiness. When `true`, the merchant must either save a real active primary location for map publication or set `store_has_no_location=true` for a searchable/profile-only storefront.
- `store_has_no_location` (`boolean`, strict JSON boolean): when paired with `public_storefront_visible=true`, the tenant can be searched and opened by slug but public map pins, embedded maps, directions links, and public branch-location responses remain disabled.
- `business_hours`: optional weekly Storefront business-hours schedule persisted to `storefront_hours`.
- `location_id`, `name`, and `is_primary_storefront`: metadata for the saved tenant location when public visibility is enabled.
- `address_line`: optional merchant-editable address text. IMS clients may prefill it from reverse geocoding after map pin selection, but latitude/longitude remain the authoritative pin coordinates.

### POST /onboarding/items/bulk
Create starter catalog items from the active workflow mode's onboarding presets.

Exact retries are idempotent at the generated-SKU boundary: when a repeated row resolves to the same generated SKU, item name, mode preset, and selling price as an already-created onboarding item, the response returns that existing item as `status: "created"` with `idempotent_replay: true` instead of creating a duplicate or surfacing a false failure.

**Access**: Private (`master admin` only)

**Request**
```json
{
  "rows": [
    {
      "client_row_id": "row-1",
      "mode_item_preset": "menu_item",
      "name": "Chicken Rice Bowl",
      "default_sale_price": 149,
      "cost_per_unit": 72,
      "current_stock": 0,
      "location_id": 12
    }
  ]
}
```

**Row rules**
- `mode_item_preset`, `name`, and positive `default_sale_price` are required per valid row.
- `cost_per_unit` and `current_stock` are optional and default to `0` when omitted.
- `location_id` is optional, but should be supplied by the onboarding UI after the primary location step when `current_stock` is greater than `0` so existing location-scoped stock movement rules can record the initial stock.
- Item images are optional and uploaded after creation through the existing storefront catalog image upload endpoint. Onboarding clients may queue up to five selected files, append repeated file selections to the queue, and remove one focused queued image without clearing the rest before upload.
- The backend derives hidden item defaults such as category, product type, UOM, FIFO behavior, capacity, stock behavior, and a deterministic generated onboarding SKU from the selected preset.
- Corrected modes validate `mode_item_preset` against the active workflow mode. Placeholder modes use conservative default item behavior until promoted by a governed mode pass.
- The first-login F&B starter-item UI submits only `mode_item_preset=menu_item` so new merchants create one customer-facing starter menu row first. Ingredients, packaging, and packaged retail rows remain available through normal item management after onboarding.
- For F&B onboarding only, `product`, `product item`, and `product_item` are accepted aliases for `mode_item_preset=menu_item`. The created row persists as `category=product`, `product_type=finished_goods`, and `mode_item_preset=menu_item` so customer-facing Storefront/POS surfaces can render it as a menu item without making ingredients publicly sellable by default.
- Partial save is supported: valid rows are created, invalid rows are returned with row-level `errors`.
- The frontend must not resubmit rows already returned as `created`. Duplicate `client_row_id` values in one request and generated SKU conflicts return row-level failures instead of creating retry duplicates.
- Completion readiness for corrected modes requires a customer-facing onboarding preset: Food Manufacturing `finished_product`, MSME `product`, Services `service` or `physical_add_on`, and Food & Beverage `menu_item` or `packaged_beverage`. Hospitality readiness is PMS-native and requires an active bookable room type with a positive default rate plus at least one active room.

**Response (207-style application payload over 200)**
```json
{
  "success": true,
  "data": {
    "workflow_mode": "fnb",
    "summary": {
      "total": 2,
      "created": 1,
      "failed": 1
    },
    "results": [
      {
        "client_row_id": "row-1",
        "status": "created",
        "item": {
          "item_id": 42,
          "sku_code": "ONB-CHICKEN-RICE-BOWL-1",
          "name": "Chicken Rice Bowl",
          "mode_item_preset": "menu_item"
        },
        "errors": []
      },
      {
        "client_row_id": "row-2",
        "status": "failed",
        "item": null,
        "errors": ["Selling price must be greater than 0."]
      }
    ]
  }
}
```

### POST /onboarding/complete
Finalize onboarding if required readiness checks are satisfied.

**Access**: Private (`master admin` only)

**Behavior**
- Returns `422` with `missing_requirements[]` if readiness is incomplete.
- Missing requirement keys are `store_name_ready`, `has_primary_storefront_location`, and `has_priced_starter_item`.
- `has_primary_storefront_location` is required only while public map/page visibility is enabled. Hidden storefronts satisfy this readiness check until the merchant opts in.
- Item image upload and stock quantity never block completion by themselves. The merchant-facing onboarding label is `Item image`; selected files append up to the five-image cap and can be removed one at a time before upload; the existing Storefront catalog image upload/storage contract remains unchanged.
- On success, sets onboarding state to `completed` and triggers storefront discovery sync.

### POST /onboarding/events
Track onboarding UX telemetry events without mutating onboarding checklist progress state.

**Access**: Private (`master admin` only)
**Rate limiting**: Tenant/user/event scoped limiter is applied to this route.

**Request**
```json
{
  "event_key": "reminder_shown",
  "metadata": {
    "surface": "layout"
  }
}
```

**Supported `event_key` values**
- `wizard_viewed`
- `reminder_shown`
- `reminder_dismissed`
- `optional_asset_skipped`
- `primary_location_saved`
- `bulk_items_saved`

**Response (202)**
```json
{
  "success": true,
  "data": {
    "accepted": true,
    "event_key": "reminder_shown"
  },
  "message": "Onboarding event accepted"
}
```
