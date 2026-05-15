---
status: reference
authority_level: reference
owner: setup
last_reviewed: 2026-05-09
applies_to: admin_bootstrap_and_local_setup
topic: admin_account_setup
---

# Admin Account Setup Guide

Use this guide to bootstrap a local admin account, verify tenant administration surfaces, and keep production admin setup safe.

Production/live credentials are not documented here. Use a password manager or another secure channel for production secrets.

## Quick Start

### 1. Prepare The Database

From the repository root:

```bash
cd backend
npm run migrate
npm run doctor:runtime
```

The runtime doctor should report a healthy schema before running seeders.

### 2. Run Seeders

```bash
cd backend
npm run seed
```

The default admin seeder is idempotent. It creates the default admin only when no admin user already exists.

### 3. Default Local Admin Credentials

```text
Email:    admin@test.com
Password: Admin123!
Role:     admin
```

Change this password immediately in any shared, staging, or production-like environment.

## Change The Default Password

After first login:

1. Go to `Settings`.
2. Open `Profile`.
3. Use the change-password controls.
4. Enter current password `Admin123!`.
5. Save a strong replacement password.

## User Registration Security

Public user registration creates normal tenant users as `staff`.

Current rules:

- New public users default to `staff`.
- Staff users have limited access.
- Admins can promote users through User Management.
- Role changes take effect immediately after save.

## Promote Users

1. Login as an admin.
2. Go to `Settings`.
3. Open User Management.
4. Change the user's role preset to the correct mode-native role, or use a legacy role only for compatibility.
5. Toggle active/inactive status when needed.

## Role Permissions

Current tenant RBAC is mode-aware and additive. The legacy `users.role` enum remains the hierarchy compatibility field, granular `users.permissions` remains the authorization source, `role_preset_key` records the mode-native role template when assigned, and `is_master_admin` bypasses tenant-local permission checks.

| Permission | Staff | Manager | Admin |
|---|---:|---:|---:|
| View items, suppliers, reports | Yes | Yes | Yes |
| Create/edit operational records | No | Yes | Yes |
| Delete operational records | No | No | Yes |
| User management | No | No | Yes |
| System/storefront/POS settings | No | Limited by permission | Yes |

Legacy compatibility roles still exist and remain accepted by the API:

| Role | Current intent |
|---|---|
| `cashier` | POS checkout, receipts, cash drawer, day close, movement/report visibility. |
| `po` | Purchase order lifecycle and receiving. |
| `do` | Dispatch order creation, dispatch execution, and fulfillment visibility. |
| `jo` | Job order planning, approval, production completion, and stock visibility. |

Mode-aware role presets are now served by `GET /api/v1/users/role-catalog` and consumed by User Management. Existing users with no `role_preset_key` remain operational and display as `Legacy <role>` until an admin remaps them. When an assigned-scope preset is selected in a multi-location tenant, User Management requires location selection and saves the role plus location grants together. Bulk assignment is allowed for assigned-scope presets only after the admin selects the shared location scope that will be applied to every selected user.

Current role preset families:

| Mode | Presets |
|---|---|
| MSME | `msme_admin`, `msme_manager`, `msme_cashier`, `msme_inventory_clerk`, `msme_viewer` |
| Food Manufacturing | `food_manufacturing_admin`, `food_manufacturing_manager`, `food_manufacturing_purchase_officer`, `food_manufacturing_production_lead`, `food_manufacturing_dispatch_officer`, `food_manufacturing_cashier`, `food_manufacturing_inventory_controller`, `food_manufacturing_viewer` |
| Services | `services_admin`, `services_manager`, `services_provider`, `services_scheduler`, `services_front_desk_cashier`, `services_inventory_clerk`, `services_viewer` |
| Food & Beverage | `fnb_admin`, `fnb_restaurant_manager`, `fnb_server`, `fnb_cashier`, `fnb_kitchen_staff`, `fnb_host_reservations`, `fnb_inventory_controller`, `fnb_viewer` |

Services routes prefer `services:*` permissions and F&B routes prefer `fnb:*` permissions. Temporary fallback to current generic permissions remains enabled by default so existing users do not lose access during remapping. Set `MODE_RBAC_GENERIC_FALLBACK_ENABLED=false` only after tenant users have been remapped to mode-native presets and targeted route tests confirm access.

Every future mode must answer these access questions before it is called production-ready:

1. Which roles are shown for this tenant mode.
2. Which granular permissions each role grants by default.
3. Which sensitive actions require explicit permissions beyond normal role labels.
4. Whether each role is tenant-wide or limited by location assignments.
5. What happens to existing users when the tenant switches modes.

## Tenant Administration

Platform-level tenant administration is separate from tenant-local user management.

Current admin surfaces include:

- Tenant Manager for pending/active/inactive tenant lifecycle operations.
- Hosting Status for shared-hosting and Redis-capable runtime diagnostics.
- Settings sections for Profile, Company, Storefront, POS Setup, Compliance, and System.

Tenant registration approval is controlled by:

```env
TENANT_REGISTRATION_APPROVAL_MODE=manual
```

Allowed values:

| Value | Behavior |
|---|---|
| `manual` | Registrations remain pending until an admin approves them. |
| `auto_standard` | Manual non-subscription registrations can be activated automatically after provisioning. New pending and active tenants are premium-capable by plan metadata, while provider subscription flows remain payment-gated when payments are disabled. |

## Customer Access And Storefront Admin Notes

Customer Access Mode and Inventory Display controls are enforced by default for public Storefront behavior.

Default local and production values:

```env
CUSTOMER_ACCESS_MODES_ENABLED=true
CUSTOMER_ACCESS_MODES_ENABLED_TENANTS=
```

Use `CUSTOMER_ACCESS_MODES_ENABLED=false` only as an explicit rollback switch. If rollback is active, `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` can re-enable enforcement for selected tenant IDs, company tokens, slugs, or tenant names while recovery smoke evidence is gathered.

Before production smoke:

1. Run migrations.
2. Run `npm run doctor:runtime`.
3. Refresh or verify storefront discovery indexing for that tenant.
4. Confirm Storefront hides quote/checkout/booking for non-transaction effective modes.
5. Confirm stock-bearing items show both location stock and FIFO batch data on item detail views. These two surfaces are paired: location stock shows where quantity exists, and FIFO batches show the per-location batch differences operators use for depletion, age, cost, and expiry decisions.
6. Confirm the FIFO item-detail panel groups active batches by location, supports an accessible location filter, recalculates "next to use" inside the selected location, and does not label one cross-location batch as globally next to use.
7. Confirm service-only items do not show misleading stock/FIFO controls. If a Services Mode sale includes physical add-ons, retail products, consumables, kits, or supplies as separate lines, those stock-bearing lines must still show and deduct through location-scoped FIFO.

## Hosting Profile Notes

Use the hosting-specific env examples when configuring an environment:

- `backend/.env.shared.example` for shared hosting without Redis.
- `backend/.env.vps.example` for Redis-capable deployments.

Shared hosting should not configure `REDIS_URL` and should use fail-open blacklist behavior. VPS/Redis-capable hosting should configure Redis and fail-closed blacklist behavior.

Run:

```bash
npm run preflight:shared
npm run preflight:vps
```

Use the command matching the target hosting profile.

## Creating Additional Admin Accounts

Recommended path:

1. Have the user register normally.
2. Login as an admin.
3. Open User Management.
4. Promote the user to `admin`.

Advanced local-only path:

1. Edit `backend/src/seeders/20240101000000-seed-admin-user.js`.
2. Run the targeted seeder flow in a disposable local database.

Do not use seeder edits as a production admin-creation workflow.

## Troubleshooting

### "Admin user already exists"

This is expected when an admin already exists. The seeder skips duplicate admin creation.

### Forgot Local Admin Password

For disposable local data only:

```bash
cd backend
npm run seed:undo
npm run seed
```

This can remove seeded data, so do not run it against production or shared data.

Safer production-like recovery should use a controlled password reset or direct database update approved by the operator.

### Cannot Access User Management

Confirm:

- The current user has role `admin`, or the required user-management permission.
- The token is for the correct tenant/company token.
- The backend is running and `npm run doctor:runtime` is healthy.

### Cannot See Tenant Manager Or Hosting Status

Confirm the current account is a platform/master admin where those routes require platform administration privileges.

## Production Checklist

Before going live:

1. Change the default admin password.
2. Replace `admin@test.com` with a real operator-controlled admin account.
3. Create a backup admin account.
4. Document who has admin access.
5. Set `TENANT_REGISTRATION_APPROVAL_MODE` intentionally.
6. Keep Customer Access Mode enforcement on unless an explicit rollback is required.
7. Choose the correct hosting profile env example.
8. Run docs, architecture, migration, runtime doctor, targeted smoke checks, and the item-detail FIFO behavior tests when inventory UI changed.

## Developer Feedback Dashboard

The legacy developer feedback dashboard is hidden from normal navigation and must not be treated as a tenant-admin support surface.

If this dashboard is retained for local diagnostics, keep its credentials out of production docs and rotate any hardcoded values before public deployment.
