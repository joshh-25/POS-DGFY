# Admin Account Security - Implementation Summary

**Date:** 2025-12-27
**Status:** ✅ Implemented

---

## Overview

Implemented security measures to prevent normal users from creating admin accounts during registration. All new registrations default to 'staff' role, and only existing admins can promote users.

---

## Changes Made

### 1. Frontend - Registration Page

**File:** `Pages/Register.jsx`

**Changes:**
- ✅ Removed role selection dropdown from registration form
- ✅ Added informational notice that all new accounts are created as "Staff"
- ✅ Updated registration to not send role parameter

**Before:**
```jsx
<select value={formData.role}>
  <option value="staff">Staff</option>
  <option value="manager">Manager</option>
  <option value="admin">Admin</option>
</select>
```

**After:**
```jsx
<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <p className="text-sm font-medium text-blue-900">Account Type</p>
  <p className="text-xs text-blue-700 mt-1">
    New accounts are created as <span className="font-semibold">Staff</span> with basic access.
    Contact an administrator to request role changes.
  </p>
</div>
```

---

### 2. Backend - Validator

**File:** `backend/src/validators/authValidator.js`

**Changes:**
- ✅ Removed `role` field from registration schema
- ✅ Added comment explaining security policy

**Before:**
```javascript
export const registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(...).required(),
  role: Joi.string().valid('admin', 'manager', 'staff').default('staff')
});
```

**After:**
```javascript
export const registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(...).required()
  // role is NOT allowed during registration - always defaults to 'staff'
});
```

---

### 3. Backend - Auth Service

**File:** `backend/src/services/authService.js`

**Changes:**
- ✅ Hardcoded role to 'staff' in `registerUser()` function
- ✅ Ignores any role value passed from frontend

**Before:**
```javascript
export const registerUser = async (userData) => {
  const { username, email, password, role = 'staff' } = userData;
  // ...
};
```

**After:**
```javascript
export const registerUser = async (userData) => {
  const { username, email, password } = userData;
  // Always create new users as 'staff' - only admins can change roles
  const role = 'staff';
  // ...
};
```

---

### 4. Database Seeder - Initial Admin

**File:** `backend/src/seeders/20240101000000-seed-admin-user.js` (NEW)

**Purpose:** Create the first admin account automatically when database is seeded

**Default Admin Credentials:**
```
Email:    admin@test.com
Password: Admin123!
Role:     admin
```

**Features:**
- ✅ Runs automatically with other seeders
- ✅ Idempotent - only creates admin if none exists
- ✅ Uses bcrypt to hash password
- ✅ Logs warning to change password in production

**Run Seeder:**
```bash
cd backend
npm run seed
# or manually:
npx sequelize-cli db:seed:all
```

---

## Security Flow

### Registration Process:

```
1. User fills registration form (username, email, password)
   └─> NO role selection available

2. Frontend sends registration request (no role field)
   └─> POST /api/v1/auth/register
       {
         "username": "john_doe",
         "email": "john@example.com",
         "password": "SecurePass123!"
       }

3. Backend validator checks schema
   └─> Role field is NOT accepted
   └─> If somehow included, it's ignored

4. Auth service creates user
   └─> role = 'staff' (hardcoded)
   └─> Cannot be overridden

5. User created successfully with 'staff' role
   └─> User sees success message
   └─> Redirected to dashboard with limited access
```

### Role Change Process (Admin Only):

```
1. Admin logs in and goes to Settings page

2. Clicks "Manage Users" (only visible to admins)

3. User Management Modal opens
   └─> Shows all users in table
   └─> Role dropdown for each user
   └─> Active/Inactive toggle

4. Admin changes role via dropdown
   └─> PUT /api/v1/users/:id/role
   └─> Authorization: requires admin role
   └─> Prevents admin from changing own role

5. Role updated successfully
   └─> User's permissions change immediately
   └─> User sees new role on next login
```

---

## User Roles & Permissions

### Staff (Default for All New Registrations)
- ✅ View items, suppliers, reports
- ✅ View purchase orders and job orders
- ❌ Create/edit items
- ❌ Create/edit purchase orders
- ❌ Delete anything
- ❌ Access user management

### Manager
- ✅ All staff permissions
- ✅ Create/edit items
- ✅ Create/edit suppliers
- ✅ Create/edit purchase orders
- ✅ Create/edit job orders
- ❌ Delete items/orders
- ❌ Access user management

### Admin
- ✅ All manager permissions
- ✅ Delete items/orders/suppliers
- ✅ Access user management
- ✅ Change user roles
- ✅ Activate/deactivate users
- ✅ View all users

---

## Testing Checklist

**Registration Security:**
- [ ] New user registration creates account with 'staff' role
- [ ] Attempting to send 'role' field in registration is ignored
- [ ] New users cannot access admin features
- [ ] New users cannot access manager features

**Admin User Management:**
- [ ] Admin can see "Manage Users" button
- [ ] Non-admins cannot see "Manage Users" button
- [ ] Admin can change any user's role
- [ ] Admin cannot change own role (prevented by backend)
- [ ] Role changes take effect immediately

**Database Seeder:**
- [ ] Running `npm run seed` creates admin user
- [ ] Admin credentials work for login
- [ ] Running seeder again doesn't duplicate admin
- [ ] Admin user has full permissions

---

## Production Deployment Checklist

Before deploying to production:

1. **Change Default Admin Password**
   ```
   ⚠️  CRITICAL: Change admin@test.com password immediately!
   ```
   - Login as admin
   - Go to Settings → Profile Settings
   - Change password to strong unique password
   - Store securely in password manager

2. **Optional: Change Admin Email**
   - Update email from admin@test.com to real admin email
   - Verify email ownership

3. **Create Additional Admins** (if needed)
   - Create regular accounts for admin users
   - Promote to admin via User Management
   - Test their access

4. **Disable Test Admin** (optional)
   - Keep admin@test.com for emergency access
   - OR deactivate after creating real admin accounts

---

## Future Enhancements

Potential security improvements for future implementation:

1. **Email Verification**
   - Require email confirmation before account activation
   - Send verification link on registration

2. **Account Approval Workflow**
   - New registrations require admin approval
   - Users receive notification when approved

3. **Registration Restrictions**
   - Allow registration only from specific email domains
   - Implement registration codes/tokens

4. **Audit Logging**
   - Log all role changes with timestamp and admin user
   - Track user account creation and modifications

5. **Two-Factor Authentication (2FA)**
   - Require 2FA for admin accounts
   - Optional 2FA for all users

---

## Files Modified Summary

**Frontend:**
- ✏️ `Pages/Register.jsx` - Removed role selection

**Backend:**
- ✏️ `backend/src/validators/authValidator.js` - Removed role from schema
- ✏️ `backend/src/services/authService.js` - Hardcoded role to 'staff'
- ➕ `backend/src/seeders/20240101000000-seed-admin-user.js` - Admin seeder

**Documentation:**
- ➕ `.claude/admin-account-security.md` - This file

---

**Status: ✅ COMPLETE - Normal users can no longer create admin accounts**

All new registrations default to 'staff' role. Only existing admins can promote users via the User Management interface in Settings.
