# Critical Systems Documentation

This document identifies high-risk components where changes can cause significant regressions.

## 1. PermissionContext (Frontend)
**Location:** `frontend/src/store/PermissionContext.jsx`
- **Purpose:** Centralized authority for user roles, permissions, and "Master Admin" status.
- **Risk:** If the logic is replaced by placeholders or fails to load, the entire application UI will be restricted or broken.
- **Key Logic:** `loadPermissions()` must handle both array-based and object-based permission formats from the backend.

## 2. TenantHandler (Backend)
**Location:** `backend/src/middleware/tenantHandler.js`
- **Purpose:** Resolves the `x-company-token` header to switch database context.
- **Risk:** If broken, all API calls will fail or return data from the wrong tenant.
- **Dependency:** Relies on `dbStore.run()` to maintain isolation across async calls.

## 3. AuthService (Both)
**Location:** `frontend/src/services/authService.js`, `backend/src/services/authService.js`
- **Purpose:** JWT token management and company token insertion.
- **Risk:** Missing the `x-company-token` during token refresh or login will crash the multi-tenant resolution.

## 4. UI Layout (Frontend)
**Location:** `frontend/Layout.jsx`
- **Purpose:** Sidebar rendering based on permissions.
- **Risk:** Incorrectly filtering `ALL_NAV_ITEMS` can hide critical features from administrators.
