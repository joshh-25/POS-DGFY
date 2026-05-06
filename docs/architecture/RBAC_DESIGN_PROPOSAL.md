---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-05-06
applies_to: tenant_rbac_and_mode_access
topic: rbac_design
---

# RBAC & Granular Access Control Reference

This document is reference material for the RBAC evolution. The current authoritative architecture decision for mode-aware RBAC is ADR 0020. Current implementation already has `users.permissions`, `users.is_master_admin`, role default permission templates, permission middleware, `users.role_preset_key`, and the mode role catalog at `backend/src/config/modeRolePresets.js`.

New mode architecture decisions must still follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, relevant ADRs, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`. Do not treat the historical proposal sections below as a replacement for ADR 0020, the API spec, or the mode playbook.

## Current State: Mode-Aware Role Presets

Mode-aware role presets are implemented as an additive layer governed by ADR 0020. Existing compatibility roles remain `admin`, `manager`, `staff`, `cashier`, `po`, `do`, and `jo`, while `users.role_preset_key` records the mode-native preset when an admin assigns one.

Mode capability guards decide whether a route/module is available in a workflow mode. RBAC decides whether the authenticated user can perform an action. Services and F&B routes now prefer mode-native permissions and temporarily accept generic fallback permissions for existing users.

The current mode-aware RBAC contract includes:

1. Mode-specific role presets and labels.
2. Mode-specific permission groups using the mode's native nouns.
3. A mapping from role preset to granular permission strings.
4. Tenant-mode UI filtering so irrelevant roles are not offered in invitations or role-change controls.
5. Backend validation so a role that is invalid for the active mode cannot be assigned unless an explicit migration/compatibility path permits it.
6. Legacy display behavior for existing users and mismatch flags when a tenant changes mode.
7. Location-scope rules for operational roles.
8. Tests proving UI role visibility, backend role validation, permission enforcement, and workflow capability denial all agree.

Expected examples:

| Mode | Example role preset direction |
|---|---|
| MSME | Owner/Admin, cashier, inventory clerk, viewer. |
| Food Manufacturing | Production lead, purchase officer, dispatch officer, inventory controller, cashier. |
| Services | Service manager, provider, scheduler, front desk/cashier, viewer. |
| Food & Beverage | Restaurant manager, server, cashier, kitchen staff, host/reservations, inventory controller. |

The authoritative implementation entry point is `backend/src/config/modeRolePresets.js`; the User Management API surface is `GET /api/v1/users/role-catalog`.

## Historical Baseline Proposal

The sections below describe the original granular-permission direction that led to the current RBAC implementation. They are retained for context, but current work should use the implemented contracts above.

## Goal
Granular permissions let the Master Admin define what each user can **see** (navigation) and **do** (actions like create, edit, and delete). Newly registered or invited users should receive only the permissions granted by their explicit role preset, compatibility role, or admin edits.

## 1. Historical Database Direction

### `users` Table Updates
The historical direction was to add a flexible `permissions` column to the `users` table for checklist-style control. Current implementation also keeps `role`, `is_master_admin`, and the additive `role_preset_key`.

```sql
ALTER TABLE `users` 
ADD COLUMN `permissions` JSON DEFAULT NULL,
ADD COLUMN `is_master_admin` BOOLEAN DEFAULT FALSE;
```

- **`permissions`**: A JSON array of permission strings (e.g., `["item_view", "item_create", "po_view"]`). If `NULL` or empty, the user has NO access.
- **`is_master_admin`**: Flag to identify the super-user (`admin@test.com`) who can edit permissions. Existing `role` column can be kept as a "template" label or deprecated.

## 2. Permission Registry

The backend permission registry is the source of truth for available permission strings. User Management receives visible permission groups from the backend role catalog instead of hardcoding global role lists in the frontend.

**Structure:**
```javascript
export const PERMISSIONS = {
  INVENTORY: {
    label: "Inventory Management",
    actions: {
      VIEW_ITEMS: "items:view",
      CREATE_ITEMS: "items:create",
      EDIT_ITEMS: "items:edit",
      DELETE_ITEMS: "items:delete",
      EXPORT_ITEMS: "items:export",
      IMPORT_ITEMS: "items:import",
    }
  },
  ORDERS: {
    label: "Order Management",
    actions: {
      VIEW_PO: "po:view",
      CREATE_PO: "po:create",
      APPROVE_PO: "po:approve", // e.g. finalize
      VIEW_JO: "jo:view",
      CREATE_JO: "jo:create"
    }
  },
  // ... Suppliers, Stock, Reports, Settings
  SYSTEM: {
    label: "System Administration",
    actions: {
      MANAGE_USERS: "users:manage", // Master Admin only
      VIEW_SETTINGS: "settings:view",
      EDIT_SETTINGS: "settings:edit"
    }
  }
};
```

## 3. Backend Implementation

### Middleware `checkPermission`
Replace/Augment existing `authorize` middleware.

```javascript
export const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const userPermissions = req.user.permissions || [];
    const isMasterAdmin = req.user.is_master_admin;

    if (isMasterAdmin) return next(); // Master Admin bypass

    if (userPermissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({ message: "Access denied" });
  };
};
```

### API Updates
- **`GET /users/me`**: Must return the `permissions` array.
- **`PUT /users/:id/permissions`**: New endpoint (Master Admin only) to save the checklist.

## 4. Frontend Implementation

### Auth & Context
- Update `AuthProvider` to fetch and store `user.permissions` in global state.
- Create a `usePermission` hook:
  ```javascript
  const { can } = usePermission();
  if (can('items:create')) { ... }
  ```

### Navigation Control (`Layout.jsx`)
Filter `navItems` based on permissions.
```javascript
const navItems = [
  { name: 'Items', page: 'Items', permission: 'items:view' },
  // ...
];

// In render:
navItems.filter(item => can(item.permission)).map(...)
```

### New User Experience
1. User Registers -> Account created, but `permissions` are empty (`[]`).
2. User Logs in -> Redirected to a "Pending Approval" page or an empty Dashboard with a message: *"Your account is waiting for administrator approval."*

## 5. UI/UX: Admin User Management

**Page:** `Settings` -> `User Management` (Visible only to Master Admin)

**UI Layout:**
- **List View:** Shows distinct users.
- **Detail/Edit View (The Checklist):**
  - **Header:** User Name & Email.
  - **Quick Role Template:** Dropdown to fast-fill checkboxes (e.g., "Select 'Manager' to check all Manager boxes").
  - **Permissions Matrix:**
    - Accordions for each Module (Inventory, Orders, etc.).
    - Checkboxes for each action.
  - **Save Button**.

## 6. Migration Plan
1. **Migration:** Update DB table. Set `admin@test.com` to `is_master_admin = true`.
2. **Data Patch:** Convert existing `role` ('admin', 'staff') into their respective permission lists and save to `permissions` column so current users don't lose access.

## 7. Analysis of "Consistency"
- The current `role` enum is rigid. Moving to JSON permissions is the robust way to handle "checklists".
- We must ensure **Server-Side Validation** mirrors the UI. Hiding a button isn't enough; the API endpoint must check the permission.

## 8. Known Caveats

### MariaDB JSON Column Parsing
MariaDB may return `permissions` JSON columns as **strings** rather than parsed arrays, depending on the driver version. Frontend code must check `typeof permissions === 'string'` and call `JSON.parse()` before using `Array.isArray()`. This was resolved in Phase 32 of the development history — see `PermissionContext.jsx`.

### State Synchronization
When user data (including permissions and plan) is fetched in a wrapper component like `Layout.jsx`, it must be synced to the global state store (Zustand) so child components (e.g., `Dashboard.jsx`) can reliably access `currentUser` and `tenantPlan`.
