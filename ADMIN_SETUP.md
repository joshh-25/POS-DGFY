# Admin Account Setup Guide

## Quick Start

### 1. Run Database Seeders

The system includes a seeder that automatically creates an admin account:

```bash
cd backend
npm run seed
```

### 2. Default Admin Credentials

```
Email:    admin@test.com
Password: Admin123!
Role:     admin
```

### 3. ⚠️ IMPORTANT: Change Password Immediately

After first login:

1. Go to **Settings** page
2. Find the **Profile Settings** card
3. Under "Change Password" section:
   - Enter current password: `Admin123!`
   - Enter new strong password
   - Confirm new password
4. Click **Save Changes**

---

## User Registration Security

### All New Users Are Created as "Staff"

- ✅ Public registration is enabled
- ✅ All new registrations default to **"Staff"** role
- ✅ New users have read-only access
- ✅ Only admins can promote users to Manager or Admin

### How to Promote Users (Admin Only)

1. Login as admin
2. Go to **Settings** page
3. Click **"Manage Users"** button (only visible to admins)
4. In the User Management table:
   - Change role via dropdown (Staff → Manager → Admin)
   - Toggle active/inactive status
5. Changes take effect immediately

---

## Role Permissions

| Permission | Staff | Manager | Admin |
|---|---|---|---|
| View items, suppliers, reports | ✅ | ✅ | ✅ |
| Create/edit items & orders | ❌ | ✅ | ✅ |
| Delete items & orders | ❌ | ❌ | ✅ |
| User management | ❌ | ❌ | ✅ |

---

## Creating Additional Admin Accounts

### Option 1: Via User Management (Recommended)

1. Have the user register normally at `/register`
2. Login as admin
3. Go to Settings → Manage Users
4. Find the user and change role to "Admin"

### Option 2: Via Database Seeder (Advanced)

Edit `backend/src/seeders/20240101000000-seed-admin-user.js` to add more admin users, then run:

```bash
npx sequelize-cli db:seed:undo
npx sequelize-cli db:seed:all
```

---

## Troubleshooting

### "Admin user already exists" message

This is normal - the seeder is idempotent and won't create duplicate admins.

### Forgot admin password

Run this command to reset the admin password:

```bash
cd backend
npx sequelize-cli db:seed:undo --seed 20240101000000-seed-admin-user.js
npx sequelize-cli db:seed --seed 20240101000000-seed-admin-user.js
```

This will recreate the admin account with default password `Admin123!`

### Cannot access User Management

Only users with **"admin"** role can see the "Manage Users" button in Settings.

---

## Security Best Practices

1. ✅ Change default admin password immediately
2. ✅ Use strong passwords (8+ chars, mixed case, numbers, symbols)
3. ✅ Don't share admin credentials
4. ✅ Create separate admin accounts for each administrator
5. ✅ Deactivate users who leave the organization
6. ✅ Regularly review user roles and permissions

---

## For Production Deployment

Before going live:

1. **Change admin password** to a strong unique password
2. **Update admin email** from admin@test.com to real email
3. **Create backup admin** account in case primary is locked out
4. **Document** who has admin access
5. **Set up** regular security audits

---

**Need Help?** Check [admin-account-security.md](.claude/admin-account-security.md) for technical details.
