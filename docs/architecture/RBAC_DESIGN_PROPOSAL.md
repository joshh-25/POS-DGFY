# RBAC & Granular Access Control Design Proposal

## Goal
Implement a granular permission system where the Master Admin can explicitly define what each user can **see** (Navigation) and **do** (Actions like Create, Edit, delete). Newly registered users will see nothing until configured.

## 1. Database Schema Changes

### `users` Table Updates
We will add a flexible `permissions` column to the `users` table. This allows for the "checklist" style control requested.

```sql
ALTER TABLE `users` 
ADD COLUMN `permissions` JSON DEFAULT NULL,
ADD COLUMN `is_master_admin` BOOLEAN DEFAULT FALSE;
```

- **`permissions`**: A JSON array of permission strings (e.g., `["item_view", "item_create", "po_view"]`). If `NULL` or empty, the user has NO access.
- **`is_master_admin`**: Flag to identify the super-user (`admin@test.com`) who can edit permissions. Existing `role` column can be kept as a "template" label or deprecated.

## 2. Permission Registry (Concept)

We will define a hardcoded list of available permissions in a constant file (`src/constants/permissions.js`). This acts as the source of truth for the UI "Checklist".

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
