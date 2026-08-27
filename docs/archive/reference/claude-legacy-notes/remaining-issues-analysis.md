# Remaining Issues & Incomplete Features Analysis

> **Archived (#365, 2026-08-26).** Moved out of `.claude/` — a one-off historical status report, not a live agent instruction; the product-name/architecture framing in this document may be stale. `AGENTS.md` is the current, canonical source of truth.

**Date:** 2025-12-27
**Status:** Comprehensive audit complete

---

## Executive Summary

The SKU Inventory Manager has solid foundations with working authentication, profile management, and basic CRUD operations. However, **significant gaps exist in system settings persistence, input validation, and feature completeness** that should be addressed before production.

**Total Issues Found:** 31
- **Critical:** 4 issues
- **High Priority:** 4 issues
- **Medium Priority:** 3 issues
- **Low Priority:** 2 issues

---

## CRITICAL ISSUES (Must Fix Before Production)

### 1. System Settings Don't Persist ⚠️ CRITICAL

**Location:** [Pages/Settings.jsx](../Pages/Settings.jsx)

**Problem:**
Users can modify system settings (stock thresholds, alert configurations, quality thresholds, procurement reminders) but changes are **NEVER saved to the backend**. All settings are lost on page refresh.

**Current Behavior:**
```javascript
// Lines 90-152: handleSave()
const handleSave = async () => {
  // Only saves profile settings (username, email, password)
  await userService.updateProfile(...);
  await userService.changePassword(...);

  // System settings are IGNORED - they stay in local state only
  toast.success("Settings saved successfully!"); // Misleading!
}
```

**Impact:**
- User changes "Default Minimum Threshold" from 40% to 50%
- Clicks "Save Changes" - sees success message ✅
- Refreshes page - setting reverts to 40% ❌
- **Settings are completely non-functional for system configuration**

**What's Missing:**
```javascript
// This code doesn't exist anywhere:
await settingsService.updateSystemSettings({
  defaultMinThreshold: settings.defaultMinThreshold,
  defaultPurchaseAllowance: settings.defaultPurchaseAllowance,
  // ... other settings
});
```

**Root Cause:**
- ✅ Database table exists: `system_settings`
- ✅ Model exists: `backend/src/models/SystemSetting.js`
- ✅ Seeder exists: Settings seeded with 6 default values
- ❌ **NO backend routes** for system settings
- ❌ **NO controller** to handle requests
- ❌ **NO service** with business logic
- ❌ **NO frontend service** to make API calls

---

### 2. Missing Backend Validators ⚠️ CRITICAL

**Problem:**
Only 3 route groups have input validation. **4 major resource types have NO validation at all**.

**Routes with Validation ✅:**
- Auth routes (`authValidator.js`) - username, email, password validated
- Item routes (`itemValidator.js`) - SKU, category, stock validated
- User routes (`userValidator.js`) - profile updates validated

**Routes WITHOUT Validation ❌:**

| Resource | Missing Validator | Risk |
|----------|------------------|------|
| **Suppliers** | `supplierValidator.js` | Invalid emails, phone numbers, missing required fields accepted |
| **Purchase Orders** | `purchaseOrderValidator.js` | Invalid quantities, dates, supplier IDs accepted |
| **Job Orders** | `jobOrderValidator.js` | Invalid item IDs, quantities accepted |
| **Stock Movements** | `stockMovementValidator.js` | Invalid movement types, quantities accepted |

**Impact:**
```javascript
// This will be accepted by backend:
POST /api/v1/suppliers
{
  "name": "",           // Empty name
  "email": "notanemail", // Invalid email
  "phone": "abc123"      // Invalid phone
}
// Either saved to DB with bad data OR crashes with SQL error
```

**Security Risk:**
Unvalidated inputs can lead to SQL injection, data corruption, or application crashes.

---

### 3. Redis Dependency - Silent Failure ⚠️ CRITICAL

**Location:** [backend/src/services/authService.js:224](../backend/src/services/authService.js#L224)

**Problem:**
Token blacklisting (logout) relies on Redis. If Redis is unavailable, tokens are NOT blacklisted but no error is shown.

```javascript
export const blacklistToken = async (token) => {
  try {
    // ... blacklist logic
  } catch (error) {
    // Just logs warning - doesn't throw error!
    console.warn('Failed to blacklist token (Redis unavailable):', error.message);
    return false; // Token NOT blacklisted
  }
};
```

**Security Impact:**
1. User clicks "Logout"
2. Redis is down
3. Token is NOT blacklisted (but no error shown)
4. User sees "Logout successful" ✅
5. **Old token is still valid** ❌
6. Logged-out user can still make authenticated requests

**Recommendation:**
Either make Redis required OR implement fallback blacklist mechanism (database table).

---

### 4. Missing System Settings Backend ⚠️ CRITICAL

**Required but Missing:**

**Backend Files to Create:**
```
backend/src/controllers/settingsController.js  - NEW
backend/src/routes/settings.js                 - NEW
backend/src/services/settingsService.js        - NEW
```

**Required API Endpoints:**
```
GET    /api/v1/settings           - Get all system settings
GET    /api/v1/settings/:key      - Get specific setting
PUT    /api/v1/settings/:key      - Update setting value
PUT    /api/v1/settings            - Batch update settings
```

**Frontend Service:**
```
src/services/settingsService.js   - NEW
```

---

## HIGH PRIORITY ISSUES

### 5. Debug Code in Production Files

**Locations:**

**[Pages/Items.jsx](../Pages/Items.jsx) Lines 33-42:**
```javascript
console.log('=== ITEMS PAGE DEBUG ===');
console.log('Total items loaded:', items.length);
console.log('Packaging items:', packagingItems.length);
items.forEach(item => {
  console.log('  - Has packaging_specs:', !!item.packaging_specs);
  console.log('  - packaging_specs type:', typeof item.packaging_specs);
  console.log('  - packaging_specs:', item.packaging_specs);
});
```

**[Components/items/ItemDetailsModal.jsx](../Components/items/ItemDetailsModal.jsx) Lines 58-65:**
```javascript
console.log('=== PACKAGING ITEM DEBUG ===');
console.log('Item:', item.name);
console.log('Category:', item.category);
console.log('Original packaging_specs type:', typeof item.packaging_specs);
console.log('Parsed packaging_specs type:', typeof packagingSpecs);
console.log('Parsed packaging_specs value:', packagingSpecs);
```

**[Components/items/ItemFormModal.jsx](../Components/items/ItemFormModal.jsx) Lines 51, 69:**
```javascript
console.error('Failed to parse packaging_specs:', e);
```

**Impact:**
- Debug information exposed in browser console
- Potential performance impact (logging on every render)
- Exposes internal data structures to users

**Fix:** Remove all console.log/console.error statements

---

### 6. Non-Functional Buttons

**6.1 Export Report Button**
**Location:** [Pages/Reports.jsx:182-185](../Pages/Reports.jsx#L182-L185)
```jsx
<Button variant="outline">
  <Download className="w-4 h-4 mr-2" />
  Export Report
</Button>
// NO onClick handler!
```

**Impact:** Button does nothing when clicked. Users cannot export reports to CSV/PDF/Excel.

---

**6.2 Add Storage Location Button**
**Location:** [Pages/Settings.jsx:549-551](../Pages/Settings.jsx#L549-L551)
```jsx
<Button variant="outline" className="mt-4 w-full">
  + Add Storage Location
</Button>
// NO onClick handler!
```

**Impact:** Button does nothing. Shows 5 hardcoded storage locations with no way to add/edit/delete.

---

### 7. Missing DELETE Operations

**Analysis:** Most resources cannot be deleted

| Resource | DELETE Endpoint | Status |
|----------|----------------|--------|
| Items | `DELETE /api/v1/items/:id` | ✅ Exists (admin only) |
| Suppliers | `DELETE /api/v1/suppliers/:id` | ❌ Missing |
| Purchase Orders | `DELETE /api/v1/purchase-orders/:id` | ❌ Missing |
| Job Orders | `DELETE /api/v1/job-orders/:id` | ❌ Missing |
| Stock Movements | `DELETE /api/v1/stock-movements/:id` | ❌ Missing |
| Users | `DELETE /api/v1/users/:id` | ❌ Missing (deactivate exists) |

**Impact:**
- Cannot remove suppliers who are no longer used
- Cannot cancel incorrect purchase orders
- Cannot delete erroneous stock movements
- No way to clean up test data

**Note:** For some resources, "soft delete" (set is_active=false) may be preferred over hard delete for audit trail purposes.

---

### 8. Missing UPDATE Operations

**Analysis:** Some resources can only be created and read, not updated

| Resource | UPDATE Endpoint | Status |
|----------|----------------|--------|
| Items | `PUT /api/v1/items/:id` | ✅ Exists |
| Suppliers | `PUT /api/v1/suppliers/:id` | ✅ Exists |
| Purchase Orders | `PUT /api/v1/purchase-orders/:id` | ❌ Missing |
| Job Orders | `PUT /api/v1/job-orders/:id` | ❌ Missing |
| Stock Movements | `PUT /api/v1/stock-movements/:id` | ❌ Missing |

**Impact:**
- Cannot modify purchase order before receiving it (fix quantity/cost errors)
- Cannot update job order details
- Cannot correct stock movement mistakes

**Available Alternatives:**
- Purchase Orders: Can "receive" (`POST /po/:id/receive`) but not edit before receiving
- Job Orders: Can "complete" (`POST /jo/:id/complete`) but not edit before completing

---

## MEDIUM PRIORITY ISSUES

### 9. Missing Frontend .env Configuration

**Problem:** No `.env.example` file in frontend root

**Current Code:**
[src/services/api.js:3](../src/services/api.js#L3)
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
```

**What's Missing:**
```env
# .env.example (frontend root)
VITE_API_URL=http://localhost:5000/api/v1
VITE_APP_NAME=SKU Inventory Manager
```

**Impact:** Developers don't know what environment variables to set

---

### 10. Complex ProductCreateWizard May Be Incomplete

**Location:** [Components/products/ProductCreateWizard.jsx](../Components/products/ProductCreateWizard.jsx)

**Analysis:** 12-step wizard includes:
- Basic Info, Recipe & Ingredients, Yield & Loss, Nutrition
- Allergens, Physical Properties, Shelf Life, Packaging
- Costing, Quality Control, Regulatory Compliance, Review

**Concern:** Many related models exist (ItemNutrition, ItemAllergen) but may not be fully integrated:
- Nutritional information fields may not save to backend
- Allergen tracking may be partial
- Regulatory compliance data may not persist

**Recommendation:** Test end-to-end to verify all wizard steps save correctly

---

### 11. Token Blacklisting Logging Concerns

**Location:** [backend/src/services/authService.js:224](../backend/src/services/authService.js#L224)

```javascript
console.warn('Failed to blacklist token (Redis unavailable):', error.message);
```

**Issues:**
- Silent failure - user thinks they're logged out but token still valid
- Just logs to console - no alerting, no fallback
- Security risk if Redis goes down in production

**Better Approach:**
```javascript
// Option 1: Make Redis required for logout
if (!isRedisConnected()) {
  throw new Error('Token blacklisting service unavailable');
}

// Option 2: Fallback to database blacklist table
if (!isRedisConnected()) {
  await TokenBlacklist.create({ token, expires_at: decoded.exp });
}
```

---

## LOW PRIORITY ISSUES

### 12. SQL Query Logging in Development

**Location:** [backend/src/config/database.js:14](../backend/src/config/database.js#L14)
```javascript
logging: process.env.NODE_ENV === 'development' ? console.log : false,
```

**Impact:** Verbose SQL output in development console
**Fix:** Consider using Winston logger or disabling for cleaner console

---

### 13. Hardcoded Storage Locations

**Location:** [Pages/Settings.jsx:543-548](../Pages/Settings.jsx#L543-L548)
```javascript
{['Main Warehouse', 'Production Floor', 'Shipping Area', 'Quality Control', 'Cold Storage'].map((location, idx) => (
  <div key={idx}>
    <span>{location}</span>
    <span className="text-emerald-600">Active</span>
  </div>
))}
```

**Issue:** Storage locations are hardcoded in frontend
**Better:** Should be database-driven with CRUD operations

---

## CRUD COMPLETENESS MATRIX

| Resource | Create | Read | Update | Delete | Notes |
|----------|--------|------|--------|--------|-------|
| Items | ✅ | ✅ | ✅ | ✅ | Full CRUD |
| Suppliers | ✅ | ✅ | ✅ | ❌ | No delete |
| Purchase Orders | ✅ | ✅ | ❌ | ❌ | Can receive, not edit |
| Job Orders | ✅ | ✅ | ❌ | ❌ | Can complete, not edit |
| Stock Movements | ✅ | ✅ | ❌ | ❌ | Cannot fix mistakes |
| Users | ✅ | ✅ | ✅ | ❌ | Can deactivate, not delete |
| **System Settings** | ❌ | ❌ | ❌ | ❌ | **Entire CRUD missing** |

---

## RECOMMENDED IMPLEMENTATION PRIORITY

### 🔴 Week 1 - Critical Backend Gaps (Must Have)

**Priority 1: System Settings Persistence**
1. Create `backend/src/services/settingsService.js`
   - `getAllSettings()` - Get all settings from DB
   - `getSettingByKey(key)` - Get specific setting
   - `updateSetting(key, value)` - Update single setting
   - `updateSettings(settingsObject)` - Batch update

2. Create `backend/src/controllers/settingsController.js`
   - `getSettings` - GET /settings
   - `getSetting` - GET /settings/:key
   - `updateSetting` - PUT /settings/:key
   - `updateSettings` - PUT /settings

3. Create `backend/src/routes/settings.js`
   - Wire up controller with auth middleware

4. Create `src/services/settingsService.js`
   - Frontend API client for settings

5. Update `Pages/Settings.jsx`
   - Fetch settings on mount
   - Send settings to backend on save

**Priority 2: Add Missing Validators**
1. Create `backend/src/validators/supplierValidator.js`
2. Create `backend/src/validators/purchaseOrderValidator.js`
3. Create `backend/src/validators/jobOrderValidator.js`
4. Create `backend/src/validators/stockMovementValidator.js`
5. Apply validators to all POST/PUT routes

**Priority 3: Fix Token Blacklisting**
- Either require Redis OR create database fallback
- Throw error if blacklisting fails (don't silent fail)

---

### 🟡 Week 2 - High Priority Features (Should Have)

**Priority 4: Remove Debug Code**
- Clean up all `console.log` in Items.jsx
- Remove debug logging from ItemDetailsModal.jsx
- Remove console.error from ItemFormModal.jsx

**Priority 5: Add Button Handlers**
- Export Report functionality (CSV/PDF export)
- Add Storage Location modal + backend

**Priority 6: Add Missing Routes**
- `PUT /purchase-orders/:id` - Update PO before receiving
- `PUT /job-orders/:id` - Update JO before completing
- `DELETE /suppliers/:id` - Soft delete suppliers
- `PUT /stock-movements/:id` - Fix movement errors

---

### 🟢 Week 3 - Medium Priority Polish (Nice to Have)

**Priority 7: Configuration & Docs**
- Add `.env.example` for frontend
- Document environment variables

**Priority 8: ProductCreateWizard Testing**
- Test all 12 steps end-to-end
- Verify nutritional info, allergens, regulatory data saves

**Priority 9: Code Quality**
- Replace console.warn with proper logging
- Add SQL logging via Winston
- Make storage locations database-driven

---

## FILES REQUIRING IMMEDIATE ATTENTION

### Backend Files to CREATE:
1. `backend/src/controllers/settingsController.js` - **NEW**
2. `backend/src/routes/settings.js` - **NEW**
3. `backend/src/services/settingsService.js` - **NEW**
4. `backend/src/validators/supplierValidator.js` - **NEW**
5. `backend/src/validators/purchaseOrderValidator.js` - **NEW**
6. `backend/src/validators/jobOrderValidator.js` - **NEW**
7. `backend/src/validators/stockMovementValidator.js` - **NEW**

### Frontend Files to CREATE:
1. `src/services/settingsService.js` - **NEW**
2. `.env.example` - **NEW**

### Files to MODIFY:
1. `Pages/Settings.jsx` - Add settings persistence (Lines 90-152)
2. `Pages/Settings.jsx` - Add storage location handler (Line 549)
3. `Pages/Reports.jsx` - Add export handler (Line 182)
4. `Pages/Items.jsx` - Remove debug code (Lines 33-42)
5. `Components/items/ItemDetailsModal.jsx` - Remove debug (Lines 58-65)
6. `Components/items/ItemFormModal.jsx` - Remove logging (Lines 51, 69)
7. `backend/src/routes/suppliers.js` - Add validators
8. `backend/src/routes/purchaseOrders.js` - Add validators
9. `backend/src/routes/jobOrders.js` - Add validators
10. `backend/src/routes/stockMovements.js` - Add validators
11. `backend/src/server.js` - Register settings routes
12. `backend/src/services/authService.js` - Better Redis handling

---

## TESTING CHECKLIST

Before production deployment:

**System Settings:**
- [ ] Change stock threshold → refresh page → verify persisted
- [ ] Change alert settings → refresh page → verify persisted
- [ ] Change quality threshold → refresh page → verify persisted

**Validation:**
- [ ] Try creating supplier with invalid email → expect error
- [ ] Try creating PO with negative quantity → expect error
- [ ] Try creating JO with non-existent item → expect error

**Token Blacklisting:**
- [ ] Logout → try reusing old token → expect 401
- [ ] Test logout when Redis is down → verify behavior

**Debug Code:**
- [ ] Open Items page → check console → no debug logs
- [ ] Open item details → check console → no debug logs

**Buttons:**
- [ ] Click "Export Report" → expect download
- [ ] Click "Add Storage Location" → expect modal

---

## CONCLUSION

The SKU Inventory Manager has a solid foundation with working:
- ✅ Authentication & authorization
- ✅ User profile management
- ✅ Items CRUD
- ✅ Suppliers CRUD (partial)
- ✅ Purchase orders & job orders (partial)
- ✅ Stock movements tracking
- ✅ Dashboard & reports

**Critical gaps before production:**
1. **System settings don't work at all** - must fix
2. **No input validation on 4 major resources** - security risk
3. **Token blacklisting fails silently** - security risk
4. **Debug code in production** - privacy/performance concern

**Estimated effort to reach production-ready:**
- Week 1 fixes: 16-24 hours
- Week 2 fixes: 12-16 hours
- Week 3 fixes: 8-12 hours
- **Total: 36-52 hours of development**

---

**Status: Analysis Complete** ✅
**Next Step: Implement Week 1 Critical Fixes**
