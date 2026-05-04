---
status: reference
authority_level: reference
owner: setup
last_reviewed: 2026-05-04
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
4. Change the user's role to `manager` or `admin`.
5. Toggle active/inactive status when needed.

## Role Permissions

| Permission | Staff | Manager | Admin |
|---|---:|---:|---:|
| View items, suppliers, reports | Yes | Yes | Yes |
| Create/edit operational records | No | Yes | Yes |
| Delete operational records | No | No | Yes |
| User management | No | No | Yes |
| System/storefront/POS settings | No | Limited by permission | Yes |

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
| `auto_standard` | Standard registrations can be activated automatically after provisioning. Premium/subscription flows remain payment-gated when payments are disabled. |

## Customer Access And Storefront Admin Notes

Customer Access Mode and Inventory Display controls are implemented behind rollout flags.

Default local and production-safe rollout values:

```env
CUSTOMER_ACCESS_MODES_ENABLED=false
CUSTOMER_ACCESS_MODES_ENABLED_TENANTS=
```

With the global flag off, settings can store Customer Access and Inventory Display preferences, but public runtime enforcement stays compatible unless a tenant is included in the controlled rollout list.

Before enabling a tenant:

1. Run migrations.
2. Run `npm run doctor:runtime`.
3. Refresh or verify storefront discovery indexing for that tenant.
4. Confirm Storefront hides quote/checkout/booking for non-transaction effective modes.

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
6. Keep `CUSTOMER_ACCESS_MODES_ENABLED=false` until controlled rollout smoke evidence is complete.
7. Choose the correct hosting profile env example.
8. Run docs, architecture, migration, runtime doctor, and targeted smoke checks.

## Developer Feedback Dashboard

The legacy developer feedback dashboard is hidden from normal navigation and must not be treated as a tenant-admin support surface.

If this dashboard is retained for local diagnostics, keep its credentials out of production docs and rotate any hardcoded values before public deployment.
