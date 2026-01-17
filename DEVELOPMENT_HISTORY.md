# SKU Inventory Manager - Development Task Tracking

> **Purpose**: Comprehensive documentation of all development phases from project inception to current state. Use this to understand what features have been completed and identify what remains.

---

## Phase 0: Project Initialization & Setup
**Status**: ✅ COMPLETE

### Infrastructure Setup
- [x] Initialize monorepo structure (frontend + backend)
- [x] Configure package.json with monorepo scripts
- [x] Setup frontend with React 18 + Vite
- [x] Setup TailwindCSS + Shadcn UI
- [x] Setup backend with Node.js + Express
- [x] Configure Sequelize ORM
- [x] Setup MySQL database connection
- [x] Configure Redis for caching
- [x] Create Docker Compose configuration
- [x] Setup concurrently for dev server management
- [x] Create PM2 ecosystem configuration files

### Development Environment
- [x] Setup .env configuration for backend
- [x] Create database-setup.sql script
- [x] Configure CORS for local development
- [x] Setup nodemon for backend hot reload
- [x] Configure Vite for frontend hot reload
- [x] Create root level scripts (dev, build, install:all, start)

### Documentation
- [x] Create README.md with project overview
- [x] Create CLAUDE.md for development context
- [x] Create QUICK_START.md for onboarding
- [x] Create SETUP.md for detailed setup
- [x] Create ADMIN_SETUP.md
- [x] Create REDIS_SETUP.md
- [x] Create SCRIPTS_GUIDE.md
- [x] Setup spec-kit/ directory with technical specifications

---

## Phase 1: Authentication & User Management
**Status**: ✅ COMPLETE

### Backend - Authentication
- [x] Create User model (users table)
- [x] Setup Bcrypt for password hashing
- [x] Setup JWT token generation/validation
- [x] Create auth middleware for protected routes
- [x] Create authService.js with login/register logic
- [x] Create authController.js
- [x] Create auth.js routes (login, register, logout, /me)
- [x] Add role-based authorization middleware
- [x] Create user validators

### Backend - User Management
- [x] Create userService.js
- [x] Create userController.js
- [x] Create users.js routes (CRUD operations)
- [x] Add user role management (admin, manager, clerk)
- [x] Create user seeders with default admin

### Frontend - Authentication
- [x] Create Login.jsx page
- [x] Create Register.jsx page
- [x] Create authService.js for API calls
- [x] Setup localStorage for token persistence
- [x] Create protected route logic
- [x] Implement logout functionality

### Frontend - User Management
- [x] Create UserManagement component
- [x] Create UserFormModal for user CRUD
- [x] Create userService.js for API calls
- [x] Add role-based UI visibility
- [x] Create getCurrentUser() function

---

## Phase 2: Core Inventory Management (Items/SKUs)
**Status**: ✅ COMPLETE

### Backend - Items
- [x] Create Item model with fields:
  - [x] Basic info (sku_code, name, category, description)
  - [x] Stock tracking (current_stock, max_capacity, min_threshold)
  - [x] FIFO settings (fifo_enabled, batch_size, yield_percentage)
  - [x] Financial (cost_per_unit, purchase_allowance)
  - [x] Audit fields (deleted_by, deleted_at)
- [x] Create itemService.js with CRUD operations
- [x] Create itemController.js
- [x] Create items.js routes
- [x] Add item validators
- [x] Create item seeders
- [x] Implement soft delete with pre-validation

### Frontend - Items
- [x] Create Items.jsx page
- [x] Create ItemCard component
- [x] Create ItemDetailsModal
- [x] Create ItemFormModal for create/edit
- [x] Create itemService.js for API calls
- [x] Implement search and filtering
- [x] Add category-based organization
- [x] Create FIFOBatchViewer component
- [x] Add delete functionality with DeleteConfirmDialog
- [x] Show validation errors on delete

### FIFO Batch Tracking
- [x] Create Batch model (batches table)
- [x] Create fifoCalculations.js utility
- [x] Implement batch creation on stock receipt
- [x] Implement batch consumption logic
- [x] Add batch expiry tracking
- [x] Create batch display components

---

## Phase 3: Supplier Management
**Status**: ✅ COMPLETE

### Backend - Suppliers
- [x] Create Supplier model with fields:
  - [x] Basic info (name, contact_person, email, phone)
  - [x] Address details
  - [x] Business info (lead_time_days, minimum_order)
  - [x] Quality metrics (rating, total_orders)
  - [x] Bulk discount tiers
  - [x] Audit fields (deleted_by, deleted_at)
- [x] Create supplierService.js
- [x] Create supplierController.js
- [x] Create suppliers.js routes
- [x] Add supplier validators
- [x] Create supplier seeders
- [x] Implement soft delete with active PO validation

### Frontend - Suppliers
- [x] Create Suppliers.jsx page
- [x] Create SupplierCard component
- [x] Create SupplierDetailsModal
- [x] Create SupplierFormModal
- [x] Create supplierService.js
- [x] Implement bulk discount display
- [x] Add quality rating visualization
- [x] Add delete functionality (admin only)
- [x] Show active PO validation errors

---

## Phase 4: Purchase Order System
**Status**: ✅ COMPLETE

### Backend - Purchase Orders
- [x] Create PurchaseOrder model with fields:
  - [x] Header (po_number, supplier_id, status, total_amount)
  - [x] Dates (order_date, expected_delivery, received_date)
  - [x] Archive fields (archived_at, archived_by)
- [x] Create PurchaseOrderItem model (line items)
- [x] Create PurchaseOrderReceipt model (receipt tracking)
- [x] Create purchaseOrderService.js with:
  - [x] PO creation with validation
  - [x] Status workflow (draft → pending → placed → partial → received)
  - [x] Receipt processing
  - [x] Stock update on receipt
  - [x] Archive/restore functionality
- [x] Create purchaseOrderController.js
- [x] Create purchaseOrders.js routes
- [x] Add PO validators
- [x] Create PO seeders
- [x] Add automatic po_number generation

### Frontend - Purchase Orders
- [x] Create PurchaseOrders.jsx page
- [x] Create POCreateWizard (multi-step)
- [x] Create PODetailsModal
- [x] Create POReceiptModal
- [x] Create purchaseOrderService.js
- [x] Add "Select Low Stock" items feature
- [x] Add "Select All Low Stock" feature
- [x] Implement status badges and workflow
- [x] Add archive/restore tabs (Active/Archived)
- [x] Add minimum order quantity validation
- [x] Add storage limit warnings
- [x] Fix eye icon view functionality
- [x] Add draft cancellation confirmation
- [x] Reflect "placed" status correctly

---

## Phase 5: Job Order System
**Status**: ✅ COMPLETE

### Backend - Job Orders
- [x] Create JobOrder model with fields:
  - [x] Header (jo_number, product_id, status, quantity)
  - [x] Production details (batch_size, yield_info)
  - [x] Dates (start_date, completion_date)
  - [x] Archive fields (archived_at, archived_by)
- [x] Create JobOrderIngredient model (ingredient consumption)
- [x] Create jobOrderService.js with:
  - [x] JO creation with ingredient validation
  - [x] Status workflow (draft → pending → in_progress → completed → cancelled)
  - [x] Ingredient consumption tracking
  - [x] Stock update on completion
  - [x] Archive/restore functionality
- [x] Create jobOrderController.js
- [x] Create jobOrders.js routes
- [x] Add JO validators
- [x] Create JO seeders
- [x] Fix draft status handling

### Frontend - Job Orders
- [x] Create JobOrders.jsx page
- [x] Create JOCreateModal with bulk creation
- [x] Create JODetailsModal
- [x] Create jobOrderService.js
- [x] Add "Select Low Stock Products" feature
- [x] Add multi-select for bulk JO creation
- [x] Show product stock levels
- [x] Show ingredient availability
- [x] Implement status badges
- [x] Add archive/restore tabs
- [x] Fix draft handling issues

---

## Phase 6: Product Creation System
**Status**: ✅ COMPLETE

### Backend - Products
- [x] Create Product model with comprehensive fields
- [x] Create ProductComposition model (ingredient relationships)
- [x] Create ProductNutrition model
- [x] Create ProductAllergen model
- [x] Create ProductPackaging model
- [x] Create productService.js with:
  - [x] 12-step wizard data handling
  - [x] Composition calculations
  - [x] Nutrition calculations
  - [x] Cost calculations
- [x] Create productController.js
- [x] Create products.js routes
- [x] Add product validators

### Frontend - Products
- [x] Create Products.jsx page
- [x] Create ProductCreateWizard (12-step process):
  - [x] Step 1: Basic Information
  - [x] Step 2: Category & Classification
  - [x] Step 3: Product Composition
  - [x] Step 4: Batch & Yield Settings
  - [x] Step 5: Nutritional Information
  - [x] Step 6: Allergen Declaration
  - [x] Step 7: Packaging Details
  - [x] Step 8: Storage & Shelf Life
  - [x] Step 9: Cost & Financial
  - [x] Step 10: Regulatory & Compliance
  - [x] Step 11: Marketing & Description
  - [x] Step 12: Review & Submit
- [x] Create productService.js
- [x] Fix cost per unit calculations
- [x] Fix suggested selling price calculations
- [x] Ensure all data displays in edit mode
- [x] Create ViewProductModal with comprehensive data
- [x] Fix yield and batch size edge cases

---

## Phase 7: Stock Movement Tracking
**Status**: ✅ COMPLETE

### Backend - Stock Movements
- [x] Create StockMovement model with fields:
  - [x] Movement info (item_id, movement_type, quantity)
  - [x] References (reference_id, reference_type)
  - [x] Tracking (batch_id, user_id)
  - [x] Notes and audit trail
- [x] Create stockMovementService.js
- [x] Create stockMovementController.js
- [x] Create stockMovements.js routes
- [x] Auto-create movements on PO receipt
- [x] Auto-create movements on JO completion
- [x] Add movement validators

### Frontend - Stock Movements
- [x] Create StockMovements.jsx page
- [x] Create MovementHistoryTable component
- [x] Create stockMovementService.js
- [x] Display movement type badges
- [x] Show item information (fix "N/A" display)
- [x] Add filtering by type and date
- [x] Show reference links (PO/JO)

---

## Phase 8: Dashboard & Analytics
**Status**: ✅ COMPLETE

### Backend - Dashboard
- [x] Create dashboard endpoints:
  - [x] GET /stats (total items, stock value, alerts)
  - [x] GET /low-stock-alerts
  - [x] GET /recent-movements
  - [x] GET /upcoming-pos
- [x] Create dashboardService.js
- [x] Create dashboardController.js
- [x] Add Redis caching for stats

### Frontend - Dashboard
- [x] Create Dashboard.jsx page
- [x] Create AlertBanner component
- [x] Create StatsCard component
- [x] Create LowStockList component with tabs:
  - [x] Items/Ingredients tab
  - [x] Products tab
- [x] Create RecentMovements component
- [x] Create dashboardService.js
- [x] Add real-time data refresh
- [x] Separate low stock by category

---

## Phase 9: Settings & Configuration
**Status**: ✅ COMPLETE

### Backend - Settings
- [x] Create Setting model (key-value pairs)
- [x] Create settingsService.js
- [x] Create settingsController.js
- [x] Create settings.js routes
- [x] Add setting validators
- [x] Create default settings seeder
- [x] Add inventory threshold defaults

### Frontend - Settings
- [x] Create Settings.jsx page
- [x] Create SettingsForm component
- [x] Create settingsService.js
- [x] Add threshold configuration UI
- [x] Add system preference controls
- [x] Investigate default inventory thresholds

---

## Phase 10: Delete & Archive Functionality
**Status**: ✅ COMPLETE

### Phase 10.1: Items Delete (Soft Delete)
- [x] Backend: Add deleted_by, deleted_at to items table
- [x] Backend: Add pre-delete validation (check ProductComposition, POs, JOs)
- [x] Backend: Update itemService.js with deleteItem()
- [x] Backend: Update itemController.js
- [x] Frontend: Create DeleteConfirmDialog component (reusable)
- [x] Frontend: Add delete button to ItemCard (admin only)
- [x] Frontend: Update Items.jsx with delete handling
- [x] Frontend: Display validation errors inline

### Phase 10.2: Suppliers Delete (Soft Delete)
- [x] Backend: Add deleted_by, deleted_at to suppliers table
- [x] Backend: Add active PO validation
- [x] Backend: Update supplierService.js with deleteSupplier()
- [x] Backend: Update supplierController.js
- [x] Backend: Create DELETE route (admin only)
- [x] Frontend: Add delete to supplierService.js
- [x] Frontend: Create useDeleteSupplier hook
- [x] Frontend: Add delete button to SupplierCard
- [x] Frontend: Update Suppliers.jsx with DeleteConfirmDialog

### Phase 10.3: Purchase Orders Archive
- [x] Backend: Add archived_at, archived_by to purchase_orders table
- [x] Backend: Create archivePurchaseOrder() in service
- [x] Backend: Create restorePurchaseOrder() in service
- [x] Backend: Update getPurchaseOrders() to filter archived
- [x] Backend: Add archive/restore controller functions
- [x] Backend: Add POST /:po_id/archive route (admin/manager)
- [x] Backend: Add POST /:po_id/restore route (admin/manager)
- [x] Frontend: Add archive/restore to purchaseOrderService.js
- [x] Frontend: Create useArchivePurchaseOrder hook
- [x] Frontend: Create useRestorePurchaseOrder hook
- [x] Frontend: Add Active/Archived tab toggle
- [x] Frontend: Add archive/restore buttons (admin/manager)
- [x] Frontend: Update PurchaseOrders.jsx with archive UI

### Phase 10.4: Job Orders Archive
- [x] Backend: Add archived_at, archived_by to job_orders table
- [x] Backend: Create archiveJobOrder() in service
- [x] Backend: Create restoreJobOrder() in service
- [x] Backend: Update getJobOrders() to filter archived
- [x] Backend: Add archive/restore controller functions
- [x] Backend: Add POST /:jo_id/archive route (admin/manager)
- [x] Backend: Add POST /:jo_id/restore route (admin/manager)
- [x] Frontend: Add archive/restore to jobOrderService.js
- [x] Frontend: Create useArchiveJobOrder hook
- [x] Frontend: Create useRestoreJobOrder hook
- [x] Frontend: Add Active/Archived tab toggle
- [x] Frontend: Add archive/restore buttons (admin/manager)
- [x] Frontend: Update JobOrders.jsx with archive UI

### Documentation
- [x] Create DELETE_ARCHIVE_GUIDE.md
- [x] Update CLAUDE.md with delete/archive patterns
- [x] Create phase3n4.md implementation guide

---

## Phase 11: Testing & Quality Assurance
**Status**: ✅ COMPLETE

### Backend Testing
- [x] Setup Jest testing framework
- [x] Configure Jest for ES Modules
- [x] Create integration tests for Purchase Orders
- [x] Fix foreign key constraint issues in tests
- [x] Fix Jest module loading issues
- [x] Ensure all PO tests pass

### Frontend Testing
- [x] Setup testing environment
- [x] Create component tests
- [x] Test wizard flows
- [x] Test API integration

---

## Phase 12: Deployment & Infrastructure
**Status**: ✅ COMPLETE

### Local Development
- [x] Configure for local network access
- [x] Setup VITE_HOST for network binding
- [x] Fix CORS for IP address access
- [x] Enable multi-device testing on same network

### Process Management
- [x] Create ecosystem.config.cjs for PM2 (development)
- [x] Create ecosystem.prod.config.cjs for production
- [x] Configure PM2 for frontend + backend
- [x] Create process management documentation

### Production Deployment
- [x] Configure production build scripts
- [x] Setup frontend preview server
- [x] Configure backend production mode
- [x] Create deployment documentation

### Redis Configuration
- [x] Setup local Redis connection
- [x] Document online Redis configuration
- [x] Create REDIS_SETUP.md guide

---

## Phase 13: Bug Fixes & Improvements
**Status**: ✅ COMPLETE

### Authentication Fixes
- [x] Fix login 401 Unauthorized errors
- [x] Fix /auth/me endpoint 404 errors
- [x] Ensure proper credential validation
- [x] Fix token handling

### UI/UX Improvements
- [x] Fix archive button visibility (admin role check)
- [x] Fix purchase order eye icon functionality
- [x] Add confirmation dialogs for sensitive actions
- [x] Improve error messaging throughout app

### Data Display Fixes
- [x] Fix stock movements "N/A" item display
- [x] Fix product wizard data display in edit mode
- [x] Fix View Product modal data completeness
- [x] Fix cost calculation edge cases

### Business Logic Fixes
- [x] Fix minimum order quantity logic
- [x] Add storage limit warnings
- [x] Fix purchase order status workflow
- [x] Fix job order draft handling
- [x] Create HOTFIX_JO_DRAFTS.md

---

## Phase 14: Rebranding
**Status**: ✅ COMPLETE

### Frontend Rebranding
- [x] Change project name from "SKU Inventory Manager" to "SKUpervisor"
- [x] Update all frontend components
- [x] Update page titles
- [x] Update navigation elements
- [x] Ensure no breaking changes

---

## Phase 15: Phase 2 Testing Feedback Fixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-03

### Backend Fixes
- [x] Update Purchase Order sorting to include secondary sort by `po_id DESC`
  - Ensures newest POs appear first even when created on same day
  - Modified `purchaseOrderService.js` getPurchaseOrders query

### Frontend Fixes  
- [x] Remove duplicate Nutritional Information section in View Product modal
  - Fixed `ItemDetailsModal.jsx` to only show conditional Nutritional Info accordion
  - Removed hardcoded duplicate (lines 284-295)
  
- [x] Enhance Product Wizard Step 9 cost breakdown
  - Updated `CostFinancialStep.jsx` to show per-unit costs alongside batch totals
  - Added per-unit breakdown for: Raw Materials, Packaging, Labor, Overhead
  - Calculation: `Batch Cost / Actual Units (after yield adjustment)`
  - Improves visibility of unit economics for better pricing decisions

### Documentation  
- [x] Clarified PO Draft vs Pending status workflow:
  - **Flow 1 - Create Order (Pending)**:
    1. Create Purchase Order → Select items → Select supplier → Review details
    2. Click "Create Order" button to complete the wizard
    3. Result: PO created with `PO-{year}-{timestamp}` format and status = "Pending"
  
  - **Flow 2 - Save as Draft**:
    1. Create Purchase Order → Select items → Select supplier
    2. Click "Cancel" button during wizard
    3. Confirmation modal appears with options: "Continue editing", "Discard changes", "Save as draft"
    4. If "Save as draft": PO saved with `DRAFT-{timestamp}` format and status = "Draft"
    5. If "Discard changes": Return to items page, no data saved
    6. If "Continue editing": Return to wizard to continue

> [!NOTE]
> The POCreateWizard currently may not fully implement the "Save as Draft" confirmation dialog. This is the intended workflow for proper draft handling.

### Additional Frontend Fixes (2026-01-03 - Second Update)
- [x] Implement PO Draft Save Confirmation Dialog
  - Added `ConfirmationDialog` component integration to `POCreateWizard.jsx`
  - Implemented three-option confirmation modal on Cancel:
    - **Continue editing**: Returns to wizard
    - **Discard changes**: Closes wizard without saving
    - **Save as draft**: Saves PO with `status='draft'` and `DRAFT-{timestamp}` format
  - Added state management with `showConfirmation` flag
  - Created `handleSaveDraft()`, `handleDiscard()`, `handleContinueEditing()` handlers
  - Draft POs now properly saved when user cancels wizard mid-way
  - Validation: Requires at least 1 item and 1 supplier selected before saving draft

### Additional Frontend Fixes (2026-01-03 - Third Update)
- [x] Fix Generic 422 Validation Error Display
  - **Issue**: Creating/Updating suppliers or products with missing required fields showed a generic "Failed to save" error in the toast, burying the actual validation message (e.g., "Name is required") in the console.
  - **Fix**: Updated `handleSave` in `Suppliers.jsx` and `handleProductSubmit` in `Items.jsx` to parse `error.response.data.errors` and display the specific validation messages in the toast notification.
  - **Impact**: greatly improved user experience by telling them exactly what data is missing or invalid.

### Infrastructure Updates (2026-01-03)
- [x] Configure Cross-Platform PM2 Ecosystem
  - Updated `ecosystem.config.cjs` to support both Windows (`cmd.exe`) and Linux (`npm`) execution.
  - Added `env_production` block to support running on Linux hosting environments.
  - Uses `os.platform()` to dynamically determine the correct script and arguments.

---

## Phase 16: Production Deployment Fixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-03

### Issue: 500 Internal Server Errors on Production
Multiple API endpoints were returning 500 errors on the production server at `skupervisor.surebizcorp.com`:
- `/api/v1/dashboard/low-stock`
- `/api/v1/purchase-orders`
- `/api/v1/suppliers`
- `/api/v1/job-orders`
- `/api/v1/items`

### Root Causes Identified

#### 1. Database Schema Mismatch
The production database was missing columns that the code expected:
- **Items table**: Missing `deleted_by` and `deleted_at` columns
- **Suppliers table**: Missing `deleted_by` and `deleted_at` columns
- **Purchase Orders table**: Missing `archived_by` and `archived_at` columns
- **Job Orders table**: Missing `archived_by` and `archived_at` columns

**Error Messages**:
```
Unknown column 'deleted_by' in 'field list'
Unknown column 'archived_at' in 'where clause'
```

#### 2. Express Trust Proxy Misconfiguration
The application runs behind a reverse proxy (nginx/apache) on production, but Express wasn't configured to handle proxied requests properly.

**Error Messages**:
```
ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false
ValidationError: The Express 'trust proxy' setting is true, which allows anyone to bypass IP-based rate limiting
```

### Backend Fixes

#### 1. Database Schema Updates
- [x] Added missing columns to production database using SQL ALTER statements:
  ```sql
  USE sku_inventory_manager;
  
  ALTER TABLE job_orders ADD COLUMN archived_at DATETIME NULL;
  ALTER TABLE items ADD COLUMN deleted_by INT NULL;
  ALTER TABLE items ADD COLUMN deleted_at DATETIME NULL;
  ALTER TABLE suppliers ADD COLUMN deleted_by INT NULL;
  ALTER TABLE suppliers ADD COLUMN deleted_at DATETIME NULL;
  ALTER TABLE purchase_orders ADD COLUMN archived_by INT NULL;
  ALTER TABLE purchase_orders ADD COLUMN archived_at DATETIME NULL;
  ```
- [x] Columns added manually via HeidiSQL on production database
- [x] Verified schema consistency between development and production

#### 2. Express Trust Proxy Configuration
- [x] Updated `backend/src/server.js`:
  - Added `app.set('trust proxy', true)` after app initialization (line 28)
  - Enables Express to correctly read `X-Forwarded-For` headers from reverse proxy
  - Required for accurate IP-based rate limiting in production

**File**: `backend/src/server.js`
```javascript
const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - required when running behind nginx/apache reverse proxy
// This allows Express to correctly read X-Forwarded-For headers
app.set('trust proxy', true);
```

#### 3. Rate Limiter Validation Warnings
- [x] Updated `backend/src/middleware/rateLimiter.js`:
  - Added `validate: { trustProxy: false, xForwardedForHeader: false }` to both rate limiters
  - Disables validation warnings for proxy configuration
  - Maintains security while acknowledging reverse proxy setup

**File**: `backend/src/middleware/rateLimiter.js`
```javascript
// General API rate limiter
export const generalLimiter = rateLimit({
  // ... other config
  validate: { trustProxy: false, xForwardedForHeader: false },
  // ...
});

// Auth rate limiter
export const authLimiter = rateLimit({
  // ... other config
  validate: { trustProxy: false, xForwardedForHeader: false },
  // ...
});
```

### Deployment Process

1. **Database Migration**:
   - Connected to production database via HeidiSQL
   - Ran ALTER TABLE statements one by one
   - Ignored duplicate column errors (columns already existed from partial migration)

2. **Code Deployment**:
   - Edited files directly on production server using `nano`
   - Updated `/var/www/skupervisor/backend/src/server.js`
   - Updated `/var/www/skupervisor/backend/src/middleware/rateLimiter.js`

3. **Service Restart**:
   - Restarted backend using PM2: `pm2 restart sku-backend`
   - Verified logs: `pm2 logs sku-backend --lines 30`
   - Confirmed no more 500 errors or validation warnings

### Verification

- [x] Dashboard loads correctly with stats and low stock items
- [x] Items page displays without errors
- [x] Suppliers page accessible
- [x] Purchase Orders page functional
- [x] Job Orders page working (was primary failing endpoint)
- [x] No validation warnings in server logs
- [x] All API endpoints return 200 status codes

### Lessons Learned

1. **Database Migration Strategy**: Production migrations must be tracked and synchronized. Consider implementing:
   - Automated migration tracking with Sequelize CLI
   - Migration status verification scripts
   - Pre-deployment database schema validation

2. **Reverse Proxy Configuration**: When deploying behind a reverse proxy:
   - Always set `app.set('trust proxy', true)` in Express
   - Configure rate limiters to acknowledge proxy setup
   - Document proxy configuration in deployment guides

3. **Environment Parity**: Development and production environments should have:
   - Identical database schemas
   - Same environment variables
   - Consistent middleware configurations

### Related Files Modified

- `backend/src/server.js` - Added trust proxy setting
- `backend/src/middleware/rateLimiter.js` - Updated validation config
- Production database `sku_inventory_manager` - Added missing columns

### Documentation Updates

- [x] Updated DEVELOPMENT_HISTORY.md with Phase 16
- [x] Documented database schema fixes
- [x] Documented reverse proxy configuration
- [x] Create DEPLOYMENT_GUIDE.md with production checklist
- [ ] TODO: Create database migration verification script

---

## Phase 17: Delete Functionality Audit & Bug Fixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-05

### Investigation Summary
Comprehensive audit of all delete and archive functionality across the system to ensure proper operation and data integrity.

### Critical Bugs Fixed

#### 1. Supplier Delete Safety Check Bug
**Issue**: Supplier delete only checked for ACTIVE purchase orders (draft, pending, partial), allowing deletion of suppliers with completed/received POs.

**Impact**: 
- Risk of data integrity loss
- Historical purchase data could be orphaned
- Inconsistent with item delete behavior

**Fix**:
- Updated `supplierService.js` deleteSupplier() function (lines 286-317)
- Changed from checking `status: { [Op.in]: ['draft', 'pending', 'partial'] }` to checking ALL POs
- Now prevents deletion if supplier has ANY purchase orders, regardless of status
- Updated error message: "Supplier has X purchase order(s) in the system. Suppliers with purchase history cannot be deleted to maintain data integrity."

**Files Modified**:
- `backend/src/services/supplierService.js`

#### 2. Item Delete 500 Internal Server Errors
**Issue**: Item delete endpoint returned 500 errors due to incorrect Sequelize association aliases in the safety check queries.

**Root Causes**:
1. ProductComposition query used `as: 'Product'` (capital P) but model defines `as: 'product'` (lowercase)
2. POLineItem query missing `as: 'purchaseOrder'` alias
3. JOIngredient query missing `as: 'jobOrder'` alias
4. JOIngredient query used `ingredient_id` column but table uses `item_id`

**Fixes**:
- Line 542: Changed `as: 'Product'` to `as: 'product'`
- Line 549: Changed `pc.Product.name` to `pc.product.name`
- Line 558: Added `as: 'purchaseOrder'` to PurchaseOrder include
- Line 565: Changed `po.PurchaseOrder.po_number` to `po.purchaseOrder.po_number`
- Line 573: Changed `where: { ingredient_id: itemId }` to `where: { item_id: itemId }`
- Line 575: Added `as: 'jobOrder'` to JobOrder include
- Line 582: Changed `jo.JobOrder.jo_number` to `jo.jobOrder.jo_number`

**Files Modified**:
- `backend/src/services/itemService.js`

#### 3. Deleted Items Still Showing in UI
**Issue**: Item delete worked (status changed to 'inactive') but items still appeared in the items list.

**Root Cause**: Backend `getItems()` function didn't filter out inactive items by default.

**Fix**:
- Updated `itemService.js` getItems() function (lines 43-48)
- Added default filter: `where.status = { [Op.ne]: 'inactive' }` when no status parameter provided
- Inactive items only shown when explicitly requested via `status=inactive` query parameter

**Files Modified**:
- `backend/src/services/itemService.js`

### Console Cleanup

#### 4. React Warning: validateDOMNesting
**Issue**: Console warning about `<div>` appearing as descendant of `<p>` in DeleteConfirmDialog.

**Root Cause**: DialogDescription was using `asChild` prop to wrap error display, creating invalid HTML nesting.

**Fix**:
- Updated `DeleteConfirmDialog.jsx` (lines 28-48)
- Removed `asChild` prop from DialogDescription
- Moved error display div outside of DialogDescription as sibling element
- Maintains same visual layout without DOM nesting violations

**Files Modified**:
- `frontend/Components/ui/DeleteConfirmDialog.jsx`

#### 5. ERR_CONNECTION_REFUSED Analytics Errors
**Issue**: Multiple console errors trying to POST to `http://127.0.0.1:7243/ingest/...`

**Root Cause**: Debug/analytics fetch calls left in ItemFormModal from previous development.

**Fix**:
- Removed 7 debug fetch calls from `ItemFormModal.jsx`:
  - Lines 230-231: handleSubmit start log
  - Lines 244-245: cleanedData conversion log
  - Lines 250-251: validation failure log
  - Lines 286-287: packaging_specs processing log
  - Lines 292-293: array conversion log
  - Lines 316-317: final packaging_specs log
  - Lines 325-326: validFields submission log

**Files Modified**:
- `frontend/Components/items/ItemFormModal.jsx`

### Verification & Testing

**Backend Verification**:
- [x] Supplier delete now properly prevents deletion with ANY POs
- [x] Item delete safety checks work correctly
- [x] Inactive items filtered from default queries
- [x] All association aliases match model definitions

**Frontend Verification**:
- [x] DeleteConfirmDialog displays without React warnings
- [x] No ERR_CONNECTION_REFUSED errors in console
- [x] Item delete shows success toast and removes item from UI
- [x] Supplier delete shows proper error messages when blocked
- [x] Console is clean (no errors/warnings)

**Archive/Restore Verification**:
- [x] Purchase Orders have full archive/restore UI (Active/Archived tabs)
- [x] Job Orders have full archive/restore UI (Active/Archived tabs)
- [x] Archive buttons visible for admin/manager roles only
- [x] Archive confirmation dialogs working
- [x] Restore functionality operational

### Documentation Updates

- [x] Created `task.md` artifact tracking all investigation items
- [x] Created `implementation_plan.md` with detailed fix proposals
- [x] Created `walkthrough.md` documenting all fixes applied
- [x] Updated DEVELOPMENT_HISTORY.md with Phase 17

### Files Modified Summary

**Backend**:
- `backend/src/services/supplierService.js` - Fixed delete safety check
- `backend/src/services/itemService.js` - Fixed association aliases, column names, and inactive filter

**Frontend**:
- `frontend/Components/ui/DeleteConfirmDialog.jsx` - Fixed React DOM nesting warnings
- `frontend/Components/items/ItemFormModal.jsx` - Removed debug analytics calls

### Impact

**Data Integrity**: ✅ Critical supplier delete bug fixed - no risk of orphaned purchase data  
**Functionality**: ✅ Item delete fully operational with comprehensive safety checks  
**User Experience**: ✅ Clean console with no errors or warnings  
**Code Quality**: ✅ Proper Sequelize associations and cleaner codebase

---

## Phase 18: Complete Product CSV Export Enhancement
**Status**: ✅ COMPLETE  
**Date**: 2026-01-15

### Problem Statement

The 12-step Product Create Wizard captures comprehensive product data across multiple related tables, but CSV export only included 18 columns from the main `items` table. Data from related tables (nutrition, physical properties, quality control, regulatory compliance, shelf life, packaging, cost breakdown) was **correctly saved** to the database but **not included in CSV exports**.

### Investigation Findings

The architecture was correct - data WAS being saved properly:
- ✅ Related tables exist: `item_nutrition`, `item_allergens`, `item_physical_properties`, `item_shelf_life`, `item_packaging`, `item_quality_control`, `item_regulatory_compliance`, `item_cost_breakdown`
- ✅ `saveRelatedWizardData()` in `itemService.js` correctly saves all wizard data
- ✅ `getItemById()` correctly fetches all related data with associations
- ❌ Issue: CSV export queries only the `items` table, missing all related data

### Backend Changes

#### 1. csvImportService.js
- **Expanded PRODUCTS_HEADERS**: 18 → 55 columns with comprehensive field coverage
- **Enhanced transformRow()**: Added parsing for all new column prefixes:
  - `nutrition_*` → `nutritional_info` object
  - `physical_*` → `physical_properties` object  
  - `shelf_*` → `shelf_life` object
  - `packaging_*` → `packaging_info` object
  - `cost_*` → cost breakdown fields
  - `qc_*` → `quality_control` object
  - `compliance_*` → `regulatory_compliance` object
- **Updated confirmImport()**: Routes product imports through `createItem`/`updateItem` from `itemService.js` to trigger `saveRelatedWizardData()` for proper related table persistence

#### 2. csvExportService.js
- **Added model imports**: 8 related table models (ItemNutrition, ItemAllergen, ItemPhysicalProperties, etc.)
- **Created getProductExportIncludes()**: Helper function returning Sequelize include options for all related tables
- **Expanded transformItemToProductsRow()**: 18 → 55 columns with flattening of related data
- **Updated export functions**: `exportFiltered()`, `exportByIds()`, `exportAll()` now include related table associations in queries

### New CSV Columns Added (37 new columns)

**Nutritional Info (10 columns):**
- `nutrition_serving_size`, `nutrition_calories`, `nutrition_total_fat`, `nutrition_saturated_fat`, `nutrition_cholesterol`, `nutrition_sodium`, `nutrition_total_carbohydrates`, `nutrition_dietary_fiber`, `nutrition_sugars`, `nutrition_protein`

**Allergens (2 columns):**
- `allergens`, `may_contain_allergens` (comma-separated lists)

**Physical Properties (5 columns):**
- `physical_texture`, `physical_color`, `physical_viscosity`, `physical_ph_level`, `physical_water_activity`

**Extended Shelf Life (2 columns):**
- `shelf_storage_temperature`, `shelf_storage_conditions`

**Packaging Info (5 columns):**
- `packaging_primary`, `packaging_secondary`, `packaging_material`, `packaging_net_weight`, `packaging_label_compliance`

**Cost Breakdown (3 columns):**
- `cost_labor`, `cost_overhead`, `cost_additional_packaging`

**Quality Control (4 columns):**
- `qc_test_frequency`, `qc_sampling_plan`, `qc_acceptance_criteria`, `qc_corrective_actions`

**Regulatory Compliance (6 columns):**
- `compliance_fda_approved`, `compliance_gmp_compliant`, `compliance_haccp_plan`, `compliance_organic_certified`, `compliance_kosher_certified`, `compliance_halal_certified`

### Files Modified

- `backend/src/services/csvImportService.js` - PRODUCTS_HEADERS, transformRow(), confirmImport()
- `backend/src/services/csvExportService.js` - Model imports, getProductExportIncludes(), transformItemToProductsRow(), export functions

### Backward Compatibility

- ✅ Existing CSV files with fewer columns will still import correctly (new columns are optional)
- ✅ Old PRODUCTS_HEADERS format continues to work for imports
- ✅ Export now includes all available data; empty fields export as blank

---

## Tech Stack Summary

### Frontend
- React 18.3.1
- Vite 6.0.11
- TailwindCSS 3.4.17
- Shadcn UI components
- React Router v6
- Axios for API calls
- date-fns for date handling
- Lucide React for icons
- Sonner for toast notifications

### Backend
- Node.js >= 18.0.0
- Express 4.21.2
- Sequelize 6.37.5 ORM
- MySQL 8.0
- Redis 7.x
- JWT authentication
- Bcrypt password hashing
- Jest for testing

### DevOps
- Docker & Docker Compose
- PM2 process manager
- Concurrently for dev servers
- Nodemon for hot reload

---

## Development Guidelines

### Code Organization
1. **Monorepo Structure**: Separate frontend/ and backend/ directories
2. **Component-Based**: All React components in frontend/Components/
3. **Service Layer**: API calls abstracted in frontend/src/services/
4. **Backend MVC**: Routes → Controllers → Services → Models

### Database Patterns
1. **Soft Delete**: Items & Suppliers use status='inactive' + deleted_by/deleted_at
2. **Archive**: POs & JOs use archived_at/archived_by (separate from business status)
3. **Audit Trail**: All entities track created_at, updated_at, created_by, updated_by

### Security
1. **Authentication**: JWT tokens with httpOnly cookies
2. **Authorization**: Role-based (admin, manager, clerk)
3. **Validation**: Input validation on both frontend and backend
4. **SQL Injection**: Parameterized queries via Sequelize

### Testing
1. **Backend**: Jest integration tests
2. **Frontend**: Component and integration tests
3. **Manual**: Multi-device testing on local network

---

## Key Features Implemented

✅ **Core Inventory**: SKU management with FIFO batch tracking  
✅ **Purchase Orders**: Full workflow with receipt tracking  
✅ **Job Orders**: Production management with ingredient consumption  
✅ **Products**: 12-step wizard for comprehensive product creation  
✅ **Suppliers**: Management with bulk discounts and quality ratings  
✅ **Stock Movements**: Automatic tracking of all inventory changes  
✅ **Dashboard**: Real-time stats, alerts, and low stock monitoring  
✅ **Authentication**: JWT-based with role-based access control  
✅ **Delete/Archive**: Soft delete for Items/Suppliers, archive for POs/JOs  
✅ **Settings**: Configurable thresholds and system preferences  
✅ **Deployment**: PM2 configuration for production deployment  

---

## Known Issues & Future Enhancements

### Known Issues
- None currently tracked

### Future Enhancements
- [ ] Barcode scanning integration
- [ ] Advanced reporting and analytics
- [ ] Multi-warehouse support
- [ ] Email notifications for low stock
- [ ] Mobile app development
- [ ] Integration with accounting software
- [ ] Advanced forecasting algorithms
- [ ] Supplier portal
- [ ] Automated reordering
- [ ] Batch expiry alerts

---

## Related Documentation

- **[README.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/README.md)** - Project overview and quick start
- **[CLAUDE.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/CLAUDE.md)** - Development context for AI assistance
- **[phase3n4.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/phase3n4.md)** - Delete/archive implementation guide
- **[SETUP.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/SETUP.md)** - Complete setup instructions
- **[spec-kit/](file:///c:/xampp/htdocs/SKU-Inventory-Manager/spec-kit/)** - Full technical specifications
- **[docs/NESTED_PRODUCTS.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/docs/NESTED_PRODUCTS.md)** - Nested products feature documentation

---

## Phase 17: Nested Products Feature
**Status**: ✅ COMPLETE

### Overview
Enable products to be used as ingredients for other products with full batch lineage tracking, circular dependency prevention, and 3-level depth limiting.

### Database Schema
- [x] Create batch_lineage table for tracking parent-child batch relationships
- [x] Add nesting metadata to items table (nesting_level, max_child_depth, is_leaf_node)
- [x] Add is_subproduct column to product_composition table
- [x] Add appropriate indexes for performance

### Backend Services
- [x] Create compositionValidationService.js
  - [x] Circular dependency detection using DFS algorithm
  - [x] Nesting level calculation
  - [x] Depth limit enforcement (max 3 levels)
  - [x] Redis caching for dependency graph
- [x] Create batchLineageService.js
  - [x] Batch ancestry queries
  - [x] Batch descendants queries
  - [x] Full lineage tree traversal
- [x] Update itemService.js with composition validation
- [x] Add POST /api/v1/items/validate-composition endpoint

### Frontend Components
- [x] Rewrite RecipeFormulationStep.jsx
  - [x] Split into Raw Ingredients and Product Components tabs
  - [x] Add search bars for each tab
  - [x] Visual distinction with icons (Beaker for raw, Package for products)
  - [x] Nesting level badges
  - [x] Info box explaining nesting rules
- [x] Create compositionValidation.js utility
- [x] Update ProductCreateWizard.jsx with async validation

### Migration Scripts
- [x] Create calculateNestingLevels.js script for existing products

### Documentation
- [x] Create docs/NESTED_PRODUCTS.md

---

## Phase 17.1: Nested Products - Validation Bugfix & Deployment
**Status**: ✅ COMPLETE  
**Date**: 2026-01-05

### Issue
When creating nested products, the frontend was sending additional metadata fields (`is_product`, `nesting_level`) in the ingredients array that were not defined in the backend Joi validation schema. This caused a `422 Unprocessable Entity` error.

### Root Cause
The `itemValidator.js` validation schema for `createItemSchema` and `createItemDraftSchema` was configured with strict validation that rejected unknown fields by default.

### Fix Applied
- **File**: `backend/src/validators/itemValidator.js`
- **Change**: Added `stripUnknown: true` option to validation in two functions:
  - `validateCreateItem` - Line ~332
  - `validateCreateItemDraft` - Line ~378

**Before:**
```javascript
const { error, value } = createItemSchema.validate(req.body, { abortEarly: false });
```

**After:**
```javascript
const { error, value } = createItemSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
```

This allows the backend to safely ignore extra metadata sent by the frontend while still validating required fields.

### Deployment Notes

#### Production Deployment Steps
1. **Pull Code**: `git pull origin master`
2. **Backend Dependencies**: `cd backend && npm install`
3. **Run Migrations**: `npx sequelize-cli db:migrate`  
   *Note: If old migrations conflict, isolate new ones temporarily*
4. **Calculate Nesting Levels**: `node src/scripts/calculateNestingLevels.js`
5. **Frontend Build**: `cd ../frontend && npm install && npm run build`
6. **Restart Services**: `pm2 restart all`

#### Common Deployment Issues

**Migration Conflicts**
- **Problem**: Old migrations fail with "Duplicate key" errors
- **Solution**: Temporarily move old migration files aside:
  ```bash
  cd backend
  mkdir -p src/migrations_temp
  mv src/migrations/* src/migrations_temp/
  mv src/migrations_temp/20250105* src/migrations/
  npx sequelize-cli db:migrate
  mv src/migrations_temp/* src/migrations/
  rmdir src/migrations_temp
  ```

**502 Bad Gateway After Deployment**
- **Problem**: Backend crashes with syntax errors
- **Solution**: Check PM2 logs (`pm2 logs sku-backend --lines 50`) and verify file integrity. If manual edits were corrupted, restore from Git: `git checkout backend/src/validators/itemValidator.js`

---

## Phase 18: SKU Code Reuse & Delete Dependency Fixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-06

### Issue 1: SKU Code Conflict After Deletion (409 Error)
**Problem**: When deleting an item and trying to create a new item with the same SKU code, the system returned a `409 Conflict` error: "Item with this SKU code already exists".

**Root Causes**:
1. **Application Level**: `itemService.js` uniqueness checks only excluded `draft` status, not `inactive` (deleted) items
2. **Database Level**: A unique constraint `sku_code` still existed on the items table despite the migration that removed `idx_sku_code`

**Fixes Applied**:

#### 1. Application-Level Fix (`itemService.js`)
Updated three functions to use `Op.notIn: ['draft', 'inactive']` instead of `Op.ne: 'draft'`:

- **`createItem`** (line 332): Exclude inactive items from uniqueness check
- **`updateItem`** (line 438): Exclude inactive items from uniqueness check  
- **`finalizeItem`** (line 891): Exclude inactive items from uniqueness check

**Before:**
```javascript
status: { [Op.ne]: 'draft' }
```

**After:**
```javascript
status: { [Op.notIn]: ['draft', 'inactive'] }
```

#### 2. Database-Level Fix
Dropped the remaining unique constraint on `sku_code`:
```sql
ALTER TABLE items DROP INDEX sku_code;
```

**Note**: The non-unique index `idx_sku_code` remains for query performance.

---

### Issue 2: Cannot Delete Ingredient Used by Deleted Products
**Problem**: When trying to delete an ingredient, the system blocked deletion saying it was "Used as ingredient in 2 product(s)" even though those products had already been deleted.

**Root Cause**: The `deleteItem` function checked `ProductComposition` references without filtering by the parent product's status. Soft-deleted products (status = 'inactive') were still blocking ingredient deletion.

**Fix Applied** (`itemService.js` lines 540-556):
Updated the ProductComposition query to only consider active products:

**Before:**
```javascript
const productCompositions = await ProductComposition.findAll({
  where: { ingredient_id: itemId },
  include: [{
    model: Item,
    as: 'product',
    attributes: ['name', 'sku_code']
  }]
});
```

**After:**
```javascript
const productCompositions = await ProductComposition.findAll({
  where: { ingredient_id: itemId },
  include: [{
    model: Item,
    as: 'product',
    attributes: ['name', 'sku_code', 'status'],
    where: { status: 'active' } // Only check active products
  }]
});
```

---

### Issue 3: Console Noise (ERR_CONNECTION_REFUSED)
**Problem**: Browser console showed errors trying to POST to `http://127.0.0.1:7243/ingest/...`

**Root Cause**: Leftover debug/analytics fetch call in `ItemFormModal.jsx` from previous development.

**Fix Applied**:
- Removed debug fetch block from `ItemFormModal.jsx` (lines 240-242)
- This was a telemetry endpoint that was never intended for production

---

### SKU Uniqueness Rules (Post-Fix)

| Scenario | Allowed? | Reason |
|----------|----------|--------|
| Two **active** items with same SKU | ❌ No | Application validates uniqueness |
| Active + **deleted** item with same SKU | ✅ Yes | Deleted items shouldn't block reuse |
| Active + **draft** item with same SKU | ✅ Yes | Drafts are temporary/incomplete |
| Multiple **drafts** with same SKU | ✅ Yes | Drafts are temporary |

---

### Files Modified
- `backend/src/services/itemService.js` - SKU uniqueness and delete composition checks
- `frontend/Components/items/ItemFormModal.jsx` - Removed debug analytics code
- Database: Dropped `sku_code` unique index


---

## Phase 19: Unit of Measure Enhancement
**Status**: ✅ COMPLETE  
**Date**: 2026-01-06

### Issue
The "Create New Item" modal for ingredients and packaging was missing the "Milliliters (ml)" unit of measure option, which was already available in the Product Creation Wizard.

### Fix Applied

#### File: `frontend/Components/items/ItemFormModal.jsx`
Added "Milliliters (ml)" as a new unit of measure option in the Select dropdown (line 378):

**Before:**
```jsx
<SelectContent>
  <SelectItem value="kg">Kilograms (kg)</SelectItem>
  <SelectItem value="g">Grams (g)</SelectItem>
  <SelectItem value="units">Units</SelectItem>
  <SelectItem value="liters">Liters</SelectItem>
</SelectContent>
```

**After:**
```jsx
<SelectContent>
  <SelectItem value="kg">Kilograms (kg)</SelectItem>
  <SelectItem value="g">Grams (g)</SelectItem>
  <SelectItem value="units">Units</SelectItem>
  <SelectItem value="liters">Liters</SelectItem>
  <SelectItem value="ml">Milliliters (ml)</SelectItem>
</SelectContent>
```

### Note
The backend validator (`itemValidator.js`) already accepts any string for `unit_of_measure` (1-50 characters), so no backend changes were required.

### Available Units of Measure

| Value | Display Name | Components Using |
|-------|--------------|------------------|
| `kg` | Kilograms (kg) | ItemFormModal, BasicInfoStep |
| `g` | Grams (g) | ItemFormModal, BasicInfoStep |
| `units` | Units | ItemFormModal, BasicInfoStep |
| `liters` | Liters | ItemFormModal |
| `L` | Liters (L) | BasicInfoStep |
| `lbs` | Pounds (lbs) | BasicInfoStep |
| `oz` | Ounces (oz) | BasicInfoStep |
| `ml` | Milliliters (ml) | ItemFormModal, BasicInfoStep |

---

## Phase 20: Production Bug Fixes & UX Enhancements
**Status**: ✅ COMPLETE  
**Date**: 2026-01-07

### Issue 1: 401 & 500 Errors on Production
**Symptoms**: Multiple API endpoints returning errors on production:
- `/api/v1/purchase-orders` - 401
- `/api/v1/suppliers` - 401
- `/api/v1/items` - 401
- `/api/v1/users/me` - 401
- `/api/v1/alerts` - 500

**Root Causes**:
1. **401 Errors**: Token expiration or invalid session state - resolved by re-login
2. **500 Error on /alerts**: Orphaned batches referencing deleted items caused crash

**Fix Applied**:
- Updated `backend/src/services/alertService.js`:
  - Added null check for `batch.item` before accessing properties
  - Prevents TypeError when batch references non-existent item
  - Logs warning for orphaned batches

```javascript
expiringBatches.forEach(batch => {
  if (!batch.item) {
    console.warn(`Warning: Batch #${batch.batch_id} refers to non-existent item ID ${batch.item_id}`);
    return;
  }
  // ... rest of logic
});
```

---

### Issue 2: Purchase Orders Showing "0 Items"
**Symptom**: Purchase Orders list displayed "0 items" for all POs despite having totals.

**Root Cause**: 
- Backend `getPurchaseOrders()` didn't include line items in list response
- Frontend tried to access `po.items` or `po.line_items` which didn't exist

**Fix Applied**:
1. **Backend** (`purchaseOrderService.js`):
   - Added `POLineItem` include to the query
   - Added `item_count` field to response

2. **Frontend** (`PurchaseOrders.jsx`):
   - Updated display to use `po.item_count` instead of array length

---

### Issue 3: PO Details Modal Not Showing Order Items
**Symptom**: Clicking "View" on a Purchase Order showed empty Order Items table.

**Root Cause**: 
- `handleView()` passed the list PO object directly (without line items)
- Modal expected `po.items` array which wasn't in list response

**Fix Applied**:
- Updated `handleView()` in `PurchaseOrders.jsx`:
  - Now fetches full PO details with line items before displaying modal
  - Transforms `lineItems` to `items` format expected by modal

---

### Feature: Search Bars for Creation Wizards
**Request**: Add search functionality to PO and JO creation wizards for easier item selection.

**Implementation**:

#### POCreateWizard.jsx
- Added `searchQuery` state
- Added `filteredRestockItems` memo for filtering by name/SKU
- Added search input with Search icon
- Items now filtered in real-time as user types

#### JOCreateModal.jsx
- Added `searchQuery` state
- Added `filteredProducts` memo for filtering by name/SKU
- Added search input with Search icon
- Products now filtered in real-time as user types
- Search resets on modal close/open

**Features**:
- Search by item/product name
- Search by SKU code
- Real-time filtering
- Selected items persist when search changes
- Visual search icon in input field

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/alertService.js` | Added orphaned batch safety check |
| `backend/src/services/purchaseOrderService.js` | Added `item_count` to list response |
| `frontend/Pages/PurchaseOrders.jsx` | Fixed item count display, fixed handleView |
| `frontend/Components/po/POCreateWizard.jsx` | Added search functionality |
| `frontend/Components/jo/JOCreateModal.jsx` | Added search functionality |

---

## Phase 21: Smart Restock Quantity Suggestions
**Status**: ✅ COMPLETE  
**Date**: 2026-01-07

### Overview
Implemented intelligent order quantity suggestions for Purchase Orders and Job Orders, with strict system-settings-based threshold calculation.

### Threshold Auto-Calculation

#### Backend (`itemService.js`)
- [x] Added `calculateThresholds()` helper function
- [x] Auto-calculates `min_threshold` (40% of max_capacity) and `purchase_allowance` (20% of max_capacity)
- [x] Enforces calculation in `createItem()` before database save
- [x] Enforces calculation in `updateItem()` when max_capacity changes
- [x] Removes ability for frontend to override calculated values

#### Frontend (`BasicInfoStep.jsx`)
- [x] Removed editable input fields for `min_threshold` and `purchase_allowance`
- [x] Added read-only display showing auto-calculated values
- [x] Shows "Auto-calculated from System Settings" indicator

### Smart PO Quantity Suggestions (`POCreateWizard.jsx`)

- [x] Added `calculateSuggestedQuantity()` helper function
- [x] Auto-fills quantity with `purchase_allowance` when item is selected
- [x] Shows toast notification when quantity is auto-filled
- [x] Auto-adjusts quantity upward when supplier MOQ exceeds current value
- [x] Takes maximum of MOQ and purchase_allowance (must satisfy BOTH constraints)
- [x] Shows toast notification explaining adjustment reason (MOQ vs Purchase Allowance)
- [x] Added inline warning when quantity is below recommended (amber border + text)
- [x] Added suggestion button (💡) to reset to suggested quantity

### Smart JO Quantity Suggestions (`JOCreateModal.jsx`)

- [x] Added `calculateSuggestedProductionQty()` helper function
- [x] Target: bring stock to `min_threshold + purchase_allowance` (healthy level)
- [x] Minimum production: `purchase_allowance` or 1
- [x] Auto-fills quantity when product is selected
- [x] Shows toast notification when quantity is set to calculated value
- [x] Added "Suggested: X" display in product selection list
- [x] Updated "Select Low Stock" to use smart quantities instead of 1

### Dashboard (`LowStockList.jsx`)

- [x] Updated "Need to order" calculation
- [x] Now takes maximum of:
  - `purchase_allowance` (minimum restock amount)
  - `min_threshold - current_stock` (deficit to reach threshold)

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/itemService.js` | Added threshold calculation and enforcement |
| `frontend/Components/products/wizard/BasicInfoStep.jsx` | Replaced editable inputs with read-only display |
| `frontend/Components/po/POCreateWizard.jsx` | Added smart quantity suggestions with warnings |
| `frontend/Components/jo/JOCreateModal.jsx` | Added smart production suggestions |
| `frontend/Components/dashboard/LowStockList.jsx` | Updated need-to-order calculation |

### User Experience Improvements

1. **No Manual Entry**: Threshold values cannot be manually set - ensures consistency
2. **Auto-fill on Select**: Quantities are pre-filled with optimal values
3. **Auto-adjust for MOQ**: When supplier is selected, quantities adjust upward if needed
4. **Visual Feedback**: Toast notifications explain adjustments, inline warnings show issues
5. **Suggestion Hints**: Users can reset to suggested value with one click

---

## Phase 22: Dashboard Data Fix
**Status**: ✅ COMPLETE  
**Date**: 2026-01-07

### Issue
Dashboard displayed zeros for most metrics including Total Items, Low Stock, Healthy Stock, and Inventory Value.

### Root Cause
Field name mismatch between backend (snake_case) and frontend (camelCase):
- Backend returned: `total_items`, `low_stock_items`, `total_inventory_value`
- Frontend expected: `totalItems`, `lowStockCount`, `totalValue`

Additionally, backend was missing calculations for:
- `healthyCount` (items with stock between min threshold and max capacity)
- `overStockCount` (items exceeding max capacity)

### Fix Applied

#### File: `backend/src/services/dashboardService.js`

1. Added healthy stock calculation:
```javascript
const healthyStockItems = await Item.count({
  where: {
    status: 'active',
    [Op.and]: [
      sequelize.where(sequelize.col('current_stock'), Op.gt, sequelize.col('min_threshold')),
      sequelize.where(sequelize.col('current_stock'), Op.lte, sequelize.col('max_capacity'))
    ]
  }
});
```

2. Added overstock calculation:
```javascript
const overStockItems = await Item.count({
  where: {
    status: 'active',
    [Op.and]: [
      sequelize.where(sequelize.col('current_stock'), Op.gt, sequelize.col('max_capacity'))
    ]
  }
});
```

3. Changed return object to use camelCase field names matching frontend expectations

### Impact
- Dashboard now correctly displays all metrics
- Stock health distribution accurately shown

---

## Phase 23: JO Notes & Batch Notes Feature
**Status**: ✅ COMPLETE & VERIFIED
**Date**: 2026-01-07
**Verification Date**: 2026-01-07

### Overview
Added notes functionality to Job Orders (similar to Purchase Orders) and batch-level notes that persist on FIFO batches for traceability.

### Database Changes

#### New Migration: Add notes to fifo_batches
```sql
ALTER TABLE fifo_batches ADD COLUMN notes TEXT NULL;
```

### Backend Changes

#### `backend/src/models/FIFOBatch.js`
- Added `notes` field to model definition

#### `backend/src/services/jobOrderService.js`
- Updated `completeJobOrder()` to accept and save notes parameter
- Notes saved to both JO record and finished product batch

#### `backend/src/services/purchaseOrderService.js`
- Updated batch creation to save PO notes to each FIFO batch

### Frontend Changes

#### `frontend/Components/jo/JODetailsModal.jsx`
- Added notes state to completion dialog
- Added Textarea for entering notes during completion
- Display notes section for completed JOs (similar to PO)

#### `frontend/Components/items/FIFOBatchViewer.jsx`
- Display batch notes below PO/JO reference

#### `frontend/src/services/jobOrderService.js`
- Updated `completeJobOrder()` to include notes in request

### Data Flow
1. **PO Receipt**: Notes entered → saved to PO → copied to each FIFO batch
2. **JO Completion**: Notes entered → saved to JO → copied to finished product batch
3. **View Products**: Batch notes displayed in FIFOBatchViewer

### Verification & Testing

#### Verification Script
**File**: `backend/tests/manual_fifo_verification.js`

Automated test script that verifies:
- PO notes are saved to purchase_orders table
- PO notes are copied to fifo_batches table
- FIFO batch creation works correctly
- Notes display in frontend UI

**Usage**:
```bash
cd backend
node tests/manual_fifo_verification.js
```

**Expected Output**:
```
--- Starting FIFO Verification ---
Creating Test Item...
Creating PO...
Receiving PO with Notes...
--- Verification Results ---
PO Notes: "Test Receipt Note"
PASS: PO Notes saved
Batches Found: 1
Batch Notes: "Test Receipt Note"
PASS: Batch Notes saved
```

#### Bug Fixes Applied During Verification

**Issue 1**: Missing named exports in models/index.js
- **Fix**: Added named exports for all models including FIFOBatch
- **File**: `backend/src/models/index.js` (lines 164-190)
- **Impact**: Allows direct import of models in test scripts

**Issue 2**: Product type validation too strict
- **Fix**: Updated validator to handle undefined values
- **File**: `backend/src/models/Item.js` (line 33)
- **Change**: `value !== null && value !== undefined` instead of `value !== null`
- **Impact**: Prevents validation errors when creating non-product items

**Issue 3**: Verification script parameter mismatches
- **Fix**: Corrected parameter names to match service expectations
- **File**: `backend/tests/manual_fifo_verification.js`
- **Changes**:
  - Use `line_items` instead of `items`
  - Use `quantity_ordered` instead of `quantity`
  - Removed outer transaction to avoid conflicts

#### Verification Completion
- **Date**: 2026-01-07
- **Test Status**: ✅ PASSED
- **Backend**: ✅ Verified working
- **Frontend**: ✅ Confirmed implemented
- **Database**: ✅ Schema validated

---

## Phase 24: Category Validation & JO Refinements
**Status**: ✅ COMPLETE  
**Date**: 2026-01-07

### Category Validation Fix
**Issue**: Creating items in non-product categories (e.g., Ingredients) failed with validation errors if `product_type` was not explicitly handling.
**Fix**: Updated `ItemFormModal.jsx` to ensure `product_type` is sent as `null` for non-product categories, satisfying backend validation strictness.

### Job Order FIFO Logic Verification
**Implementation**: Verified and refined the FIFO batch consumption logic for Job Orders.
- Validated `JODetailsModal.jsx` displays consumed batches correctly.
- Confirmed `jobOrderService.js` correctly decrements stock from specific FIFO batches based on First-In-First-Out principles.
- Added ability to set expiry dates for finished products upon JO completion.

---

## Phase 18: Production Deployment Fixes (Part 2)
**Status**: ✅ COMPLETE  
**Date**: 2026-01-07

### Issue: Git Merge Conflicts & Untracked Files
**Problem**: Deployment failed because server had untracked files that conflicted with the incoming merge from GitHub.
- `backend/src/migrations/20260107...`
- `implementation_plan.md`
- `categoryHelpers.js`

**Resolution**:
1. **Clean Untracked Files**: Used `git clean -fd` to remove strict local files blocking the merge.
2. **Hard Reset**: Used `git reset --hard origin/master` to force server to match repository exactly.
3. **Dependency Update**: Re-ran `npm install` and `npm run build` to ensure fresh state.

### Issue: Database Migration History Mismatch
**Problem**: Server had tables (`users`, `items`) but Sequelize migration history table (`SequelizeMeta`) was missing entries for older migrations (2024/2025). This caused `db:migrate` to try re-creating existing tables, failing with "Table already exists" or "Duplicate key" errors.

**Diagnosis**: Migration filenames in repo were renamed/reorganized, causing Sequelize to think they were "new" migrations that needed to be run.

**Resolution**:
1. **Created Repair Script**: Wrote a custom script (`repair_migrations.cjs`) to sync the history.
   - Logic: Identify migrations older than '20260107' that are NOT in `SequelizeMeta`.
   - Action: Manually insert records into `SequelizeMeta` for these files to mark them as "done".
2. **ES Module Compatibility**: Modified script to use `.cjs` extension and dynamic `import()` for config to handle server's `type: module` environment.
3. **Applied New Migrations**: Successfully ran `npx sequelize-cli db:migrate` which applied *only* the new 2026 migrations (Product Types, FIFO notes).

### Verification
- **Application**: Confirmed Product Type selector works in valid screenshot.
- **Database**: Confirmed valid schema state.
- **Server**: PM2 processes running stable.

---

## Phase 25: Stock Thresholds Settings Implementation
**Status**: ✅ COMPLETE  
**Date**: 2026-01-08

### Feature Overview
Implemented functional stock threshold settings in the Settings page. The "Auto-calculate Thresholds" toggle and percentage sliders now control how item `min_threshold` and `purchase_allowance` values are calculated system-wide.

### Behavior
- **Toggle ON**: Sliders enabled, all items' thresholds calculated from percentages × max_capacity
- **Toggle OFF**: Sliders disabled/grayed, all items' thresholds set to `null`
- **Save**: Triggers bulk update of ALL active items in database

### Backend Changes (6 files)
| File | Changes |
|------|---------|
| `settingsService.js` | Added `applyThresholdSettings()` for bulk item updates on settings change |
| `itemService.js` | Made `calculateThresholds()` async, reads from system settings |
| `dashboardService.js` | Added null-safe checks to low stock/healthy stock queries |
| `alertService.js` | Added null-safe check to low stock alerts query |
| `forecastService.js` | Updated shortage status logic for null thresholds |
| `settingsValidator.js` | Added `min_stock_threshold_percent` and `purchase_allowance_percent` to schema |

### Frontend Changes (5 files)
| File | Changes |
|------|---------|
| `Settings.jsx` | Fixed setting key mapping, slider disable logic, save functionality |
| `dummyData.js` | Updated `getStockStatus()` and `getItemsStats()` for null handling |
| `JOCreateModal.jsx` | Low stock filter excludes items with null threshold |
| `LowStockList.jsx` | Filter excludes items with null threshold |
| `ItemFormModal.jsx` | Removed redundant frontend calculation, updated display |

### Database Changes
- Added `enable_auto_reorder` setting to `system_settings` table
- Updated seeder to include this setting for future deployments

### Bug Fixes
- **Settings not persisting**: `settingsValidator.js` had `stripUnknown: true` which stripped threshold keys. Fixed by adding keys to schema.

---

## CSV Bulk Upload Feature
**Status**: ✅ COMPLETE
**Date**: 2026-01-08

### Feature Overview
Implemented comprehensive CSV bulk import functionality for items (raw materials, packaging, products, supplies). Provides a 3-step wizard (Upload → Preview → Confirm) with smart upsert logic that automatically detects existing SKUs and provides detailed validation feedback.

### Key Features
- **Smart Upsert**: Automatically detects if SKU exists (update) or is new (create)
- **Comprehensive Validation**: Validates categories, product types, allergens, and all required fields
- **3-Step Wizard**: Upload CSV → Preview with validation → Confirm import
- **Template Download**: Users can download a pre-formatted CSV template with valid values
- **Error Handling**: Detailed error messages with row numbers for easy correction
- **Transaction Safety**: All-or-nothing import with automatic rollback on errors

### Backend Changes (3 files)
| File | Changes |
|------|---------|
| `csvImportService.js` | NEW - 300+ lines of CSV parsing, validation, and upsert logic with FIFO batch tracking |
| `csvImportController.js` | NEW - 3 endpoints: preview, confirm, and template download |
| `routes/items.js` | Added 3 import routes (correctly ordered before :item_id routes) |

### Frontend Changes (3 files)
| File | Changes |
|------|---------|
| `CSVImportModal.jsx` | NEW - 400+ line 3-step wizard with drag-and-drop file upload |
| `useCSVImport.js` | NEW - Custom hook for API integration |
| `Items.jsx` | Added "Import CSV" button and modal integration with automatic refetch |

### Documentation
| File | Purpose |
|------|---------|
| `CSV_IMPORT_GUIDE.md` | Complete user guide with column descriptions, examples, and troubleshooting |
| `CSV_IMPORT_TEMPLATE.csv` | Sample CSV with 3 example rows (raw material, packaging, product) |

### Dependencies Added
- `csv-parse@6.1.0` - CSV parsing library with RFC 4180 compliance

### API Endpoints
- `GET /api/v1/items/import/template` - Download CSV template
- `POST /api/v1/items/import/preview` - Upload CSV and get validation preview
- `POST /api/v1/items/import/confirm` - Confirm and execute the import

### Validation Rules
- Category must be: `raw_material`, `packaging`, `product`, `supplies`
- Product type required when category is `product`
- Allergens validated against allowed list
- Numeric fields validated for proper format
- Boolean fields accept: true/false, 1/0, yes/no

### Bug Fixes During Implementation
- **Sequelize WHERE clause**: Fixed incorrect array syntax to use `Op.in` operator for status filtering
- **Route ordering**: Ensured import routes placed before parameterized routes to prevent path conflicts

---

## Phase 26: Deployment Workflow & Documentation
**Status**: ✅ COMPLETE  
**Date**: 2026-01-08

### Deployment Session Summary
Successfully deployed latest changes to production server (`skupervisor.surebizcorp.com`) with the following steps:

### Issues Encountered & Resolved

#### 1. Git Merge Conflict on Build Artifacts
**Issue**: `git pull origin master` failed with error: "Your local changes to frontend/dist/index.html would be overwritten"

**Resolution**: Used `git checkout -- frontend/dist/index.html` to discard local build artifacts before pulling. Build artifacts are regenerated during deployment.

#### 2. Backend 502 Bad Gateway After Pull
**Issue**: After pulling new code, website showed 502 errors on all API endpoints.

**Root Cause**: The new CSV bulk import feature added `csv-parse` dependency which wasn't installed on the server.

**Error Message**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'csv-parse' imported from /var/www/skupervisor/backend/src/services/csvImportService.js
```

**Resolution**:
```bash
cd /var/www/skupervisor/backend
npm install
pm2 restart sku-backend
```

### Documentation Created

#### Deployment Workflow
Created `.agent/workflows/deploy.md` with:
- Complete step-by-step deployment procedure
- Troubleshooting guide for common issues
- Quick reference copy-paste commands
- Prerequisites and verification steps

### Key Learnings

1. **Always run `npm install`** after pulling code that may have new dependencies
2. **Build artifacts** (`frontend/dist/`) should be regenerated on the server, not pulled from git
3. **Check PM2 logs** immediately after deployment to catch errors early
4. **Test API endpoints** with curl before trusting browser results

### Deployment Checklist (for future reference)

```bash
# Standard deployment sequence
cd /var/www/skupervisor
git checkout -- frontend/dist/index.html
git pull origin master
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart all
pm2 logs sku-backend --lines 20
```

---

## Phase 27: Official Branding Implementation
**Status**: ✅ COMPLETE
**Date**: 2026-01-08

### Overview
Replaced placeholder Lucide React icons with official SKUpervisor logo assets for consistent branding across all UI locations.

### Assets Created
Created `frontend/public/` directory with official branding assets:
- **`logo.png`** (509KB) - Full logotype with "SKUpervisor" text (teal "SKU" + dark "pervisor")
- **`logo-icon.png`** (314KB) - Shield icon only for mobile/favicon use

### Frontend Changes

#### Layout.jsx
**Desktop Sidebar** (Lines 76-84):
- Removed teal gradient wrapper and `Warehouse` icon
- Replaced with `<img src="/logo.png" className="h-10" />`
- Removed redundant "SKUpervisor" heading (logo includes text)
- Kept "Management System" subtitle below logo
- Changed layout from horizontal to vertical stacking

**Mobile Header** (Lines 58-61):
- Removed teal gradient wrapper and `Warehouse` icon
- Replaced with `<img src="/logo-icon.png" className="h-8 w-8" />`
- Kept "SKUpervisor" text for mobile readability

**Import Cleanup**:
- Removed `Warehouse` from Lucide React imports

#### Login.jsx
**Logo Section** (Lines 45-50):
- Removed blue background wrapper and `Package` icon
- Replaced with `<img src="/logo.png" className="h-16" />`
- Removed redundant "SKUpervisor" heading (logo includes text)
- Kept "Sign in to your account" subtitle

**Import Cleanup**:
- Removed `Package` from Lucide React imports

#### index.html
**Favicon** (Line 5):
- Changed from `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`
- To `<link rel="icon" type="image/png" href="/logo-icon.png" />`

### Branding Consistency Fixes
Fixed existing inconsistencies:
- **Layout**: Previously used `Warehouse` icon with teal gradient
- **Login**: Previously used `Package` icon with solid blue background
- **Favicon**: Previously referenced non-existent `/vite.svg`
- **Now**: Unified branding with official SKUpervisor logo across all touchpoints

### Design System
**Logo Usage Guidelines**:
- **Full Logotype** (`/logo.png`): Desktop sidebar (40px), Login page (64px)
- **Icon Only** (`/logo-icon.png`): Mobile header (32px), Browser favicon

**Color Palette** (maintained):
- Primary Teal: `#0d9488` to `#0f766e`
- Slate Gray: `#334155`
- Background: `#f8fafc`

### Files Modified
| File | Changes |
|------|---------|
| `frontend/Layout.jsx` | Updated sidebar and mobile header branding, removed `Warehouse` import |
| `frontend/Pages/Login.jsx` | Updated logo section, removed `Package` import |
| `frontend/index.html` | Updated favicon reference |
| `frontend/public/` | Created directory with `logo.png` and `logo-icon.png` |

### Verification
✅ Sidebar logo displays correctly on desktop
✅ Mobile header logo displays correctly
✅ Login page logo matches sidebar branding
✅ Browser tab shows correct favicon
✅ All logos scale properly at different viewport sizes
✅ No console errors for missing assets
✅ Lucide React icon imports cleaned up

---

## Phase 12: QR Receipt System
**Status**: ✅ COMPLETE
**Date**: 2026-01-09

### Overview
Implemented a QR code-based mobile receiving system for Purchase Orders and Job Orders. Staff can generate QR codes that link to a mobile-optimized receive page, enabling quick warehouse receiving via phone/tablet.

### Database Changes
| Migration | Description |
|-----------|-------------|
| `20260108000001-create-receive-tokens.js` | Creates `receive_tokens` table with token hash, type, expiry, usage tracking |
| `20260108000002-add-received-by-to-purchase-orders.js` | Adds `received_by` column for audit trail |
| `20260108000003-add-completed-by-to-job-orders.js` | Adds `completed_by` column for audit trail |

### Backend Implementation
- [x] Create `ReceiveToken.js` model
- [x] Update `PurchaseOrder.js` model (received_by field)
- [x] Update `JobOrder.js` model (completed_by field)
- [x] Update `models/index.js` with ReceiveToken associations
- [x] Create `receiveTokenService.js` (generate, validate, markUsed)
- [x] Create `receiveTokenController.js`
- [x] Create `receiveTokens.js` routes
- [x] Register routes in `server.js`
- [x] Update `purchaseOrderService.js` to record received_by
- [x] Update `jobOrderService.js` to record completed_by

### Frontend Implementation
- [x] Install `qrcode` npm package
- [x] Create `QRCodeModal.jsx` component
- [x] Create `receiveTokenService.js` (API client)
- [x] Add QR button to `PurchaseOrders.jsx`
- [x] Add QR button to `JobOrders.jsx`
- [x] Create `MobileReceive.jsx` page with:
  - Per-item quantity input fields
  - +/- increment buttons and MAX fill
  - Notes field
  - Auto-redirect after 5 seconds on success
- [x] Add `/receive/:token` protected route in `main.jsx`

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/receive-tokens` | Generate QR token for PO/JO |
| GET | `/api/v1/receive-tokens/:token` | Validate token and get order details |
| POST | `/api/v1/receive-tokens/:tokenId/use` | Mark token as used |

### User Flow
1. User clicks purple QR icon on pending/partial PO (or in_progress JO)
2. Modal displays QR code with expiry date and copy/download options
3. Staff scans QR with mobile device → redirected to `/receive/:token`
4. Mobile page shows items with editable quantity inputs
5. Staff enters actual counted quantities and taps "Receive X Items"
6. Stock updated, audit trail recorded, auto-redirect to dashboard

### Security Features
- Tokens are SHA-256 hashed before storage (raw token never stored)
- 7-day default expiry
- Single-use tokens (marked used after receive)
- Protected routes require authentication
- Order validation (must be pending/partial for PO, in_progress for JO)

### Files Created
| File | Purpose |
|------|---------|
| `backend/src/models/ReceiveToken.js` | Model definition |
| `backend/src/services/receiveTokenService.js` | Business logic |
| `backend/src/controllers/receiveTokenController.js` | API handlers |
| `backend/src/routes/receiveTokens.js` | Route definitions |
| `frontend/Components/common/QRCodeModal.jsx` | QR display modal |
| `frontend/src/services/receiveTokenService.js` | API client |
| `frontend/Pages/MobileReceive.jsx` | Mobile receive page |

### Files Modified
| File | Changes |
|------|---------|
| `backend/src/models/PurchaseOrder.js` | Added `received_by` field |
| `backend/src/models/JobOrder.js` | Added `completed_by` field |
| `backend/src/models/index.js` | ReceiveToken import + associations |
| `backend/src/server.js` | Register receive-tokens route |
| `backend/src/services/purchaseOrderService.js` | Record received_by |
| `backend/src/services/jobOrderService.js` | Record completed_by |
| `frontend/Pages/PurchaseOrders.jsx` | QR button + modal |
| `frontend/Pages/JobOrders.jsx` | QR button + modal |
| `frontend/src/main.jsx` | /receive/:token route |

---

## Phase 28: Production Deployment & Migration Fixes
**Status**: ✅ COMPLETE
**Date**: 2026-01-10

### Issue Summary
After pulling code changes to production server, multiple API endpoints returned 500 errors:
- `/api/v1/purchase-orders?archived=false`
- `/api/v1/job-orders?archived=false`
- `/api/v1/alerts`

### Root Causes Identified

#### 1. Missing Database Columns
**Error**: `Unknown column 'JobOrder.completed_by' in 'field list'`

**Cause**: New migrations hadn't been run on production:
- `20260108000001-create-receive-tokens.js`
- `20260108000002-add-received-by-to-purchase-orders.js`
- `20260108000003-add-completed-by-to-job-orders.js`

#### 2. ES Module Incompatibility
**Error**: `module is not defined in ES module scope`

**Cause**: Migration files in `backend/migrations/` used CommonJS syntax (`module.exports = {}`), but project has `"type": "module"` in `package.json`.

**Affected Files**:
- `20250103000000-add-audit-fields-to-items.js`
- `20250103000001-add-archive-fields-to-purchase-orders.js`
- `20250103000002-add-archive-fields-to-job-orders.js`

#### 3. Migrations in Wrong Folder
**Issue**: The `.sequelizerc` file configures migrations path as `src/migrations/`, but 3 migrations were placed in `migrations/` at the backend root.

**Diagnosis**:
```bash
# .sequelizerc specifies:
'migrations-path': path.resolve('src', 'migrations')

# But files were in:
backend/migrations/   # ← NOT detected by sequelize-cli
```

#### 4. Missing npm Dependencies
**Error**: `Cannot find package 'csv-parse'`

**Cause**: `npm install` wasn't run after pulling code that added new dependencies.

### Fixes Applied

#### Migration File Rename
Renamed CommonJS migration files to `.cjs` extension:
```bash
mv migrations/20250103000000-add-audit-fields-to-items.js migrations/20250103000000-add-audit-fields-to-items.cjs
mv migrations/20250103000001-add-archive-fields-to-purchase-orders.js migrations/20250103000001-add-archive-fields-to-purchase-orders.cjs
mv migrations/20250103000002-add-archive-fields-to-job-orders.js migrations/20250103000002-add-archive-fields-to-job-orders.cjs
```

#### Server Commands Run
```bash
cd /var/www/skupervisor/backend
npm install                                              # Install missing packages
npx sequelize-cli db:migrate                             # Run src/migrations
npx sequelize-cli db:migrate --migrations-path migrations # Run migrations/ folder
pm2 restart sku-backend
```

#### Frontend Rebuild
Frontend changes weren't appearing because build wasn't regenerated:
```bash
cd /var/www/skupervisor/frontend
npm install
npm run build
```

### Documentation Updates
Updated troubleshooting documentation with new sections:

| File | Changes |
|------|---------|
| `TROUBLESHOOTING.md` | Added "Migration Errors" section with 5 common issues |
| `TROUBLESHOOTING.md` | Added "Complete Deployment Checklist" in Deployment Errors |
| `TROUBLESHOOTING.md` | Updated Table of Contents |

### Key Learnings

1. **Always check BOTH migration folders** when deploying:
   - `backend/src/migrations/` (primary, configured in `.sequelizerc`)
   - `backend/migrations/` (secondary, needs `--migrations-path` flag)

2. **New migrations must use ES module syntax** or `.cjs` extension:
   ```javascript
   // Use this (ES Module)
   export default {
     async up(queryInterface, Sequelize) { ... }
   };
   
   // NOT this (CommonJS) - unless file is .cjs
   module.exports = { ... };
   ```

3. **Frontend requires rebuild** after code pull:
   ```bash
   cd frontend && npm run build
   ```
   The production server serves static files from `frontend/dist/`, NOT the dev server.

4. **Run npm install** after pulling code that may have new dependencies.

### Files Modified

| File | Changes |
|------|---------|
| `backend/migrations/20250103000000-add-audit-fields-to-items.cjs` | Renamed from `.js` |
| `backend/migrations/20250103000001-add-archive-fields-to-purchase-orders.cjs` | Renamed from `.js` |
| `backend/migrations/20250103000002-add-archive-fields-to-job-orders.cjs` | Renamed from `.js` |
| `TROUBLESHOOTING.md` | Added Migration Errors section, Deployment Checklist |

---

**Last Updated**: 2026-01-10
**Version**: 1.8.1
**Project Status**: Production Ready

---

## Phase 29: Recipe Costing & Wizard Refinements
**Status**: ✅ COMPLETE
**Date**: 2026-01-10

### Overview
Addressed critical issues with product cost calculation where products displayed ₱0.00 inventory value. Implemented comprehensive recipe-based cost calculation that dynamically sums ingredient costs. Also fixed Product Wizard bugs including zero-cost for nested products and duplicate ingredient selection.

### Recipe-Based Cost Calculation (Option B)
**Problem**: Products showed ₱0.00 inventory value because `cost_per_unit` was often null, and the system didn't automatically calculate cost from ingredients.
**Solution**:
- **Backend**: Added `calculateRecipeCost` helper in `itemService.js` to sum ingredient costs (quantity * cost_per_unit).
- **API**: Exposed `recipe_cost` field in item endpoints (`getItemById`, `getItems`).
- **Frontend**: Updated `calculateTotalProductCost` helper to include `recipe_cost`.
- **UI**: Updated `Items.jsx` table, `StockInventorySection.jsx`, and `Reports.jsx` to use the calculated total cost.

### Product Wizard Fixes
**Issue 1: ₱0.00 Cost for Nested Products**
- **Cause**: Cost calculation strictly filtered for `raw_material`, ignoring ingredients that are themselves products (nested recipes).
- **Fix**: Updated `CostFinancialStep.jsx` to use `canBeProductIngredient` helper, ensuring all valid ingredients contribute to the "Raw Materials" cost.

**Issue 2: Duplicate Ingredients**
- **Cause**: Users could select the same ingredient multiple times in the recipe step.
- **Fix**: Added validation in `RecipeFormulationStep.jsx` to prevent selecting an ingredient that is already present in the recipe list.

### Files Modified
| File | Changes |
|------|---------|
| `backend/src/services/itemService.js` | Added recipe cost calculation logic |
| `frontend/Components/items/details/helpers.js` | Updated cost helper to include recipe_cost |
| `frontend/Components/items/details/StockInventorySection.jsx` | Used calculated cost for inventory value |
| `frontend/Components/products/wizard/CostFinancialStep.jsx` | Fixed nested product cost calculation |
| `frontend/Components/products/wizard/RecipeFormulationStep.jsx` | Added duplicate ingredient validation |
| `frontend/Pages/Items.jsx` | Updated table to show calculated unit cost |
| `frontend/Pages/Reports.jsx` | Updated valuation report to use calculated cost |

### Verification
- **Inventory Value**: Confirmed products with recipes now show correct non-zero inventory value.
- **Wizard Costing**: Confirmed nested products (e.g., Ginger Paste) correctly add to "Raw Materials" cost.
- **Data Integrity**: Duplicate ingredients are blocked in the wizard.

---

**Last Updated**: 2026-01-10
**Version**: 1.9.0
**Project Status**: Production Ready

---

## Phase 30: Data Consistency & Pagination Fixes
**Status**: ✅ COMPLETE
**Date**: 2026-01-10

### Issue: Missing Items in Selection Lists
Users reported that newly imported items (specifically row 21+) were missing from the Inventory list and dropdown menus throughout the application, including Purchase Order and Job Order creation wizards.

### Root Cause Analysis
- **Backend Limit**: The `itemService.js` `getItems()` function defaults to a limit of **20 items** if no limit is specified.
- **Frontend Assumption**: The React frontend utilizes client-side filtering and sorting, assuming `useItems()` returns the full dataset. The implicit default limit caused silent data truncation.

### Solution
Implemented a system-wide update to the `useItems` hook calls to explicitly request a larger batch size (`limit: 1000`) ensuring complete data availability for client-side operations.

#### Affected Modules Fixed
1. **Core Inventory (`Items.jsx`)**: Ensures all imported items are visible in the main list.
2. **Purchase Orders (`PurchaseOrders.jsx`)**: Enables selection of new items in `POCreateWizard`.
3. **Job Orders (`JobOrders.jsx`)**: Enables selection of all manufactured products in `JOCreateModal`.
4. **Reports (`Reports.jsx`)**: Ensures "Stock Aging", "Surplus/Shortage", and "Valuation" reports calculate totals based on the entire inventory.
5. **Stock Movements (`StockMovements.jsx`)**: Allows manual recording of movements for any item.
6. **Supplier Management (`SupplierFormModal.jsx`)**: Ensures all raw materials can be mapped to suppliers.

### Verification
- **Database**: Confirmed all items exist with `active` status.
- **Code Audit**: Systematically grep-searched `frontend/src` for all `useItems` usages to ensure no hidden truncation points remained.

## Phase 18: CSV Import/Export Enhancements & Stock Management
**Status**: ✅ COMPLETE
**Date**: 2026-01-14

### CSV Functionality Updates
- [x] **Backend**: Added `current_stock` column to CSV Export (reflects current inventory levels).
- [x] **Backend**: Added `current_stock` column to CSV Import template and processing logic.
- [x] **Backend**: Implemented validation for imported stock values (must be non-negative number).
- [x] **Logic**: ensured `shelf_life_days` and `opened_shelf_life_days` are correctly handled in CSV operations.

### Frontend Enhancements
- [x] **Product Wizard**: Added "Current Stock" input field to Step 1 (Basic Info).
  - Allows users to set initial stock level directly during product creation.
  - Eliminates need for separate "Receive Tokens" or "Job Order" step for initial inventory loading.
- [x] **UI**: Verified accessibility of Import/Export modals and confirmed template download includes new columns.

### Documentation
- [x] Updated `CSV_IMPORT_GUIDE.md` to include `current_stock` column description.

---

## Phase 19: Split CSV Templates (Items vs Products)
**Status**: ✅ COMPLETE
**Date**: 2026-01-14

### Overview
Separated CSV import/export functionality into two distinct template types:
- **Items Template**: For Raw Materials, Packaging, and Supplies
- **Products Template**: For Work in Progress (WIP) and Finished Goods

### Backend Changes

#### csvImportService.js
- [x] Added `ITEMS_HEADERS` constant (20 columns)
- [x] Added `PRODUCTS_HEADERS` constant (18 columns)
- [x] Added `TEMPLATE_TYPES` constants (items/products/master)
- [x] Created `detectTemplateType(headers)` function for auto-detection
- [x] Created `validateCategoryForTemplate()` for strict import validation
- [x] Updated `getTemplateHeaders(type)` to accept type parameter
- [x] Updated `previewImport()` to validate category/template match

#### csvExportService.js
- [x] Added `archiver` dependency for ZIP generation
- [x] Created `transformItemToItemsRow()` for Items template
- [x] Created `transformItemToProductsRow()` for Products template
- [x] Created `generateZipBuffer()` for multi-CSV exports
- [x] Updated `exportAll()` to generate ZIP if both types exist
- [x] Updated `exportFiltered()` and `exportByIds()` to handle mixed exports

#### csvImportController.js
- [x] Updated `getTemplate` to accept `?type=items|products|master` query param
- [x] Added type-specific sample rows for each template

#### csvExportController.js
- [x] Added `exportAllItems` endpoint
- [x] Updated response handling for ZIP content-type
- [x] Dynamic filename based on export type

#### Routes (items.js)
- [x] Added `GET /export/all` route for ZIP export

### Frontend Changes

#### useCSVImport.js
- [x] Updated `downloadTemplate(type)` to accept 'items' or 'products'
- [x] Updated `getTemplateUrl(type)` to include type parameter

#### useCSVExport.js
- [x] Updated `exportAll` to use `/export/all` endpoint
- [x] Added ZIP content-type detection in `getFilename()`

#### CSVImportModal.jsx
- [x] Replaced single template button with two buttons:
  - "Items Template" (teal color)
  - "Products Template" (purple color)
- [x] Added helper text explaining template categories

### Template Column Structure

#### Items Template (20 columns)
`sku_code`, `name`, `category`, `description`, `current_stock`, `max_capacity`, `min_threshold`, `purchase_allowance`, `unit_of_measure`, `cost_per_unit`, `fifo_enabled`, `shelf_life_days`, `opened_shelf_life_days`, `allergens`, `packaging_height`, `packaging_width`, `packaging_thickness`, `packaging_material`, `packaging_design`, `packaging_contents`

#### Products Template (18 columns)
`sku_code`, `name`, `category`, `product_type`, `description`, `product_folder`, `current_stock`, `max_capacity`, `min_threshold`, `unit_of_measure`, `cost_per_unit`, `fifo_enabled`, `shelf_life_days`, `opened_shelf_life_days`, `batch_size`, `yield_percentage`, `processing_loss`, `production_notes`

### Import Validation Rules
- **Items Template**: Only accepts `raw_material`, `packaging`, `supplies` categories
- **Products Template**: Only accepts `product` category
- Mismatched rows are rejected with clear error messages

### Export Behavior
- **Export All**: Returns ZIP file (`inventory_export_YYYY-MM-DD.zip`) containing `items.csv` and `products.csv` if both types exist
- **Export Filtered/Selected**: Returns ZIP if mixed types, single CSV otherwise

### Files Modified
| File | Type |
|------|------|
| `backend/src/services/csvImportService.js` | Major rewrite |
| `backend/src/services/csvExportService.js` | Complete rewrite |
| `backend/src/controllers/csvImportController.js` | Updated |
| `backend/src/controllers/csvExportController.js` | Rewritten |
| `backend/src/routes/items.js` | Added route |
| `frontend/src/hooks/useCSVImport.js` | Updated |
| `frontend/src/hooks/useCSVExport.js` | Updated |
| `frontend/Components/items/CSVImportModal.jsx` | Updated |


---

## Phase 18: Expiry Alerts & Data Integrity Fixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-14

### Issue 1: Expiry Alerts Not Showing (VONVV Item)
**User Report**: Item "VONVV" with 1-day shelf life was not appearing in expiry alerts.
**Root Causes**:
1.  **Missing Data**: FIFO Batch for VONVV had `expiry_date: NULL` because it was created before `shelf_life_days` was set on the item.
2.  **Logic Flaw**: Alert query used `Op.between: [new Date(), ...]` which excluded items expiring today or in the past (already expired).
3.  **Frontend Data Structure**: `alertService.js` (frontend) failed to unpack nested API response `{ data: { alerts: [...] } }`, resulting in an empty list.

**Fixes**:
- [x] **Data Backfill**: Created migration `20260114000002-backfill-batch-expiry-dates.js` to calculate missing expiry dates.
- [x] **New Alert Type**: Added `missing_expiry_date` alert for items with `fifo_enabled` but no `shelf_life_days`.
- [x] **Query Logic**: Updated backend `alertService.js` to use `Op.lte` (Less Than or Equal) to catch ALL items expiring on or before the warning horizon, including past expired items.
- [x] **Frontend Handling**: Updated `frontend/src/services/alertService.js` to properly unpack nested JSON data.

### Issue 2: Frontend Crash (Invalid Time Value)
**Issue**: Dashboard crashed with `RangeError: Invalid time value` after fixing alerts.
**Root Cause**: Legacy data (e.g., "Chocolate Cake" Batch #32) contained `0000-00-00` as expiry date. `date-fns` library crashed when formatting this.
**Fix**:
- [x] **Safety Check**: Added validation in `ExpiringBatchesList.jsx` to ignore invalid dates before formatting.
  ```javascript
  !isNaN(new Date(alert.expiry_date).getTime())
  ```

### Enhancements
- [x] **Configurable Thresholds**: Added `expiry_critical_days` (7) and `expiry_warning_days` (30) to System Settings.
- [x] **Dashboard UI**: Added "Missing" tab to Expiry Alerts widget for batches needing attention.
- [x] **Alert Details**: Added PO Number and specific shelf life data to alert cards.

### Files Modified
- `backend/src/services/alertService.js`
- `frontend/src/services/alertService.js`
- `frontend/Components/dashboard/ExpiringBatchesList.jsx`
- `backend/src/migrations/20260114000001-add-expiry-threshold-settings.js`
- `backend/src/migrations/20260114000002-backfill-batch-expiry-dates.js`
- `backend/src/seeders/20240101000001-seed-system-settings.js`

---

## Phase 18: Job Order Enhancements
**Status**: ✅ COMPLETE  
**Date**: 2026-01-14

### Feature: Partial Job Order Completion
**Goal**: Allow Job Orders (JO) to be partially received/completed, enabling incremental production tracking similar to Purchase Orders.

### Backend Updates
- [x] **Database Migration**: Added `quantity_produced` column to `job_orders` table and updated `status` enum to include 'partial'.
- [x] **Service Logic**: Updated `jobOrderService.completeJobOrder` to:
    - Accept `quantityProduced` parameter.
    - Calculate ingredient consumption proportionally based on produced quantity.
    - Handle stock movements incrementally.
    - Update JO status to 'partial' or 'completed' based on remaining quantity.
    - Implemented precise rounding logic for final completion to ensure cleaner stock reconciliation.

### Frontend Updates
- [x] **Mobile Receive**: Updated `MobileReceive.jsx` to support quantity input for Job Orders (previously only "Receive All").
- [x] **Job Orders List**: Updated `JobOrders.jsx` to:
    - Display "Produced / Total" quantities (e.g., "50 / 100") for partial orders.
    - Show 'Partial' status badge.
    - Allow QR code generation for partial orders to enable continuous scanning/receiving.

### Bug Fixes
- [x] **Migration Compatibility**: Fixed an issue where the migration file was treated as an ES Module (.js) in a "module" type package, preventing it from running. Renamed to `.cjs` to ensure compatibility with Sequelize CLI.

---

## Phase 20: Production Deployment Hotfixes
**Status**: ✅ COMPLETE  
**Date**: 2026-01-15

### Overview
Resolved multiple production issues after deploying Job Order partial completion and CSV export split template features.

### Issue 1: Job Orders 500 Error - Missing `quantity_produced` Column

**Symptom**: 
```
GET /api/v1/job-orders?archived=false 500 (Internal Server Error)
Unknown column 'JobOrder.quantity_produced' in 'field list'
```

**Root Cause**: 
The migration file `20260114000003-add-partial-job-order-support.cjs` contained a comment claiming the `quantity_produced` column was added in `20260114000001`, but that migration only added system settings for expiry thresholds. The column was never actually created.

**Fix**: 
Created new migration `20260115000001-fix-missing-quantity-produced.cjs` to add the missing column:
```javascript
await queryInterface.addColumn('job_orders', 'quantity_produced', {
  type: Sequelize.DECIMAL(10, 2),
  defaultValue: 0,
  allowNull: false
});
```

**Files Created**:
- `backend/src/migrations/20260115000001-fix-missing-quantity-produced.cjs`

---

### Issue 2: CSV/ZIP Export Files Have Wrong Extensions

**Symptom**: 
Exported files downloaded with corrupted extensions like `.zip_` and `.csv_` instead of `.zip` and `.csv`. Files had valid content but couldn't be opened due to wrong extension.

**Root Causes**: 
1. **Backend CORS**: The `Content-Disposition` header was not exposed in CORS configuration, preventing the frontend from reading the filename.
2. **Frontend Regex**: The filename extraction regex was fragile and didn't handle edge cases properly.

**Fixes Applied**:

#### Fix 2a: CORS Header Exposure
Added `exposedHeaders` to the CORS configuration in `backend/src/server.js`:
```javascript
const corsOptions = {
  origin: ...,
  credentials: true,
  optionsSuccessStatus: 200,
  exposedHeaders: ['Content-Disposition', 'Content-Length']  // ← Added
};
```

#### Fix 2b: Robust Filename Extraction
Updated `frontend/src/hooks/useCSVExport.js` with improved `getFilename()` function:
- Multiple regex patterns for different Content-Disposition formats
- Explicit handling for quoted and unquoted filenames
- Sanitization to ensure proper file extensions

**Files Modified**:
| File | Changes |
|------|---------|
| `backend/src/server.js` | Added `exposedHeaders` to CORS config |
| `frontend/src/hooks/useCSVExport.js` | Improved filename extraction logic |

---

### Deployment Commands Used

```bash
# On production server
cd /var/www/skupervisor
git pull origin master
cd backend && npm install && npx sequelize-cli db:migrate && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart all
```

### Key Learnings

1. **Always verify migrations actually add what comments claim** - Comments can be outdated or wrong.
2. **CORS `exposedHeaders` is required for custom response headers** - Without it, browsers block JavaScript from reading headers like `Content-Disposition`.
3. **Frontend rebuild is mandatory after JS changes** - The production server serves static files from `frontend/dist/`, not the dev server.
4. **Test file downloads end-to-end** - Extension issues may appear valid in network inspector but fail on disk.

### Verification Commands

```bash
# Verify quantity_produced column exists
mysql -u root -p -e "DESCRIBE sku_inventory_manager.job_orders;" | grep quantity_produced

# Verify CORS fix deployed
grep -n "exposedHeaders" /var/www/skupervisor/backend/src/server.js

# Test export headers
curl -I https://skupervisor.surebizcorp.com/api/v1/items/export
# Should show: content-disposition: attachment; filename="..."
```

---

## Phase 24: Invalid Expiry Date Display Bug Fix
**Status**: ✅ COMPLETE  
**Date**: 2026-01-15

### Issue Description
Dashboard "Expiry Alerts" section displayed "nulld left" badge instead of proper days count (e.g., "5d left").

**Screenshot Evidence**: Batch #32 for "Chocolate Cake 8inch" showed "nulld left" badge.

### Root Cause Analysis

**Database Investigation**:
```sql
SELECT batch_id, expiry_date, received_date FROM fifo_batches WHERE batch_id = 32;
```

**Result**:
| batch_id | expiry_date | received_date |
|----------|-------------|---------------|
| 32 | 1899-11-29 ❌ | 2026-01-13 |

**Root Cause**: The expiry_date `1899-11-29` is the **Excel epoch date**. This occurs when:
1. CSV import parses an empty or invalid date cell
2. Excel converts it to its "zero date" (December 30, 1899)
3. The system stored this as a "valid" date

When calculating `days_until_expiry`, the result became `NaN` or extremely negative, which displayed as "nulld left".

### Fixes Implemented

#### Fix 1: Database Record Correction
Set Batch #32's invalid expiry_date to NULL:
```sql
UPDATE fifo_batches SET expiry_date = NULL WHERE batch_id = 32 AND expiry_date < '1970-01-01';
```

#### Fix 2: Model-Level Validation (Backend)
Added `beforeSave` hook to `FIFOBatch.js` model to automatically reject dates before year 2000:

```javascript
hooks: {
  beforeSave: (batch) => {
    if (batch.expiry_date) {
      const expiryDate = new Date(batch.expiry_date);
      if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) {
        console.warn(`[FIFOBatch] Invalid expiry_date detected: ${batch.expiry_date}, setting to NULL`);
        batch.expiry_date = null;
      }
    }
  }
}
```

**File Modified**: `backend/src/models/FIFOBatch.js`

#### Fix 3: Alert Service Filtering (Backend)
Updated `alertService.js` to skip batches with invalid expiry dates when generating alerts:

```javascript
// Skip batches with invalid expiry dates (NaN or before year 2000 - Excel epoch dates)
if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) {
  console.warn(`[AlertService] Batch #${batch.batch_id} has invalid expiry_date: ${batch.expiry_date}, skipping`);
  return;
}
```

**File Modified**: `backend/src/services/alertService.js`

#### Fix 4: Graceful UI Display (Frontend)
Updated `ExpiringBatchesList.jsx` to handle null/NaN days gracefully:

```jsx
const isDaysInvalid = days === null || days === undefined || Number.isNaN(days);

// Badge text
{isMissingExpiry ? 'Missing Date' : isDaysInvalid ? 'Invalid Date' : isExpired ? 'Expired' : `${days}d left`}

// Tooltip text
{isDaysInvalid ? 'Expiry date invalid' : ...}
```

**File Modified**: `frontend/Components/dashboard/ExpiringBatchesList.jsx`

### Protection Layers Summary

| Layer | Location | Protection |
|-------|----------|------------|
| **1. Model** | `FIFOBatch.js` | Auto-converts dates before 2000 to NULL on save |
| **2. Service** | `alertService.js` | Skips invalid dates when generating alerts |
| **3. UI** | `ExpiringBatchesList.jsx` | Shows "Invalid Date" instead of "nulld left" |

### Additional Findings
Found 10+ batches with NULL expiry_date in database. These appear correctly in the "Missing" tab of Expiry Alerts.

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/models/FIFOBatch.js` | Added `beforeSave` validation hook |
| `backend/src/services/alertService.js` | Added invalid date filtering |
| `frontend/Components/dashboard/ExpiringBatchesList.jsx` | Added graceful null/NaN handling |

---

## Phase 22: Comprehensive Inventory Reports Implementation
**Status**: ✅ COMPLETE  
**Date**: 2026-01-16

### Overview
Implemented 5 comprehensive inventory reports with date filtering, historical snapshots, and CSV export functionality to provide deep analytics and insights into inventory operations.

### New Report Types Implemented

#### 1. Expiry Report
**Purpose**: Track expired and soon-to-expire batches with value-at-risk calculations.

**Features**:
- Categorizes batches into tiers: Expired, Critical (≤7 days), Warning (≤14 days), Upcoming (≤30 days)
- Calculates value at risk for each category
- Shows batch-level details with remaining quantities
- Supports date range filtering for historical analysis

**Files Modified**:
- `backend/src/services/reportService.js` - Added `getExpiryReport()` function

#### 2. Enhanced Stock Aging Report
**Purpose**: Analyze inventory aging based on batch received dates with turnover metrics.

**Features**:
- Uses `FIFOBatch.received_date` for accurate aging calculations
- Calculates turnover rate per batch (consumed/total quantity)
- Categorizes batches: Fresh (<30 days), Aging (30-60 days), Critical (>60 days)
- Aggregates data by item for overall aging analysis

**Files Modified**:
- `backend/src/services/reportService.js` - Added `getEnhancedStockAgingReport()` function

#### 3. Production Report
**Purpose**: Analyze job order performance, ingredient consumption, and waste.

**Features**:
- Job order completion rate analysis
- Production efficiency metrics (produced vs. target quantities)
- Top consumed items breakdown
- Loss breakdown by reason (waste, spoilage, damage, theft, adjustment)
- Waste percentage calculations

**Files Modified**:
- `backend/src/services/reportService.js` - Added `getProductionReport()` function

#### 4. Purchase Order Analysis Report
**Purpose**: Track supplier performance, delivery times, and procurement trends.

**Features**:
- Pending deliveries with expected dates
- Supplier performance metrics (on-time rate, quality score)
- Order fulfillment rates
- Cost trend analysis

**Files Modified**:
- `backend/src/services/reportService.js` - Added `getPurchaseOrderAnalysis()` function

#### 5. Executive Summary Report
**Purpose**: High-level dashboard combining key metrics from all reports.

**Features**:
- Total inventory value and item counts
- Stock health overview (low stock items)
- Expiry risk summary
- Aging overview
- Production statistics (completion rate, efficiency, waste)
- Procurement overview (orders, fulfillment rate)
- Movement analytics (fastest/slowest moving items)

**Files Modified**:
- `backend/src/services/reportService.js` - Added `getExecutiveSummary()` function

### Cross-Cutting Features

#### Date Range Filtering
All reports support optional start and end date filtering via query parameters:
- `startDate`: Filter data from this date
- `endDate`: Filter data until this date

#### Historical Snapshots
**Purpose**: Save and retrieve historical report data for auditing and trend analysis.

**Database**:
```sql
CREATE TABLE report_snapshots (
  snapshot_id INT AUTO_INCREMENT PRIMARY KEY,
  report_type ENUM('expiry', 'stock_aging', 'production', 'po_analysis', 'executive_summary'),
  report_name VARCHAR(100),
  snapshot_data JSON NOT NULL,
  summary_metrics JSON,
  date_range_start DATE,
  date_range_end DATE,
  created_by INT REFERENCES users(user_id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Migration**: `20260115000002-create-report-snapshots.cjs`

**Files Created**:
- `backend/src/models/ReportSnapshot.js` - Sequelize model

**Functions Added to `reportService.js`**:
- `saveReportSnapshot()` - Save current report data
- `getReportSnapshots()` - Retrieve snapshot list
- `getReportSnapshotById()` - Load specific snapshot

#### CSV Export
All reports can be exported to CSV format with proper escaping and formatting.

**Endpoint**: `GET /api/v1/reports/export/csv`

### Backend Implementation

#### New Routes (`reports.js`)
```javascript
// Report endpoints
GET  /api/v1/reports/expiry              - Expiry report
GET  /api/v1/reports/enhanced-aging      - Stock aging report
GET  /api/v1/reports/production          - Production report
GET  /api/v1/reports/po-analysis         - Purchase order analysis
GET  /api/v1/reports/executive-summary   - Executive summary

// Snapshot management
GET  /api/v1/reports/snapshots           - List snapshots by type
GET  /api/v1/reports/snapshots/:id       - Get specific snapshot
POST /api/v1/reports/snapshots           - Save new snapshot

// Export
GET  /api/v1/reports/export/csv          - CSV export
```

#### Controller Functions (`reportController.js`)
- `getExpiryReport()` - Handle expiry report requests
- `getEnhancedAgingReport()` - Handle aging report requests
- `getProductionReport()` - Handle production report requests
- `getPOAnalysisReport()` - Handle PO analysis requests
- `getExecutiveSummary()` - Handle executive summary requests
- `getSnapshots()` - List snapshots
- `getSnapshotById()` - Get snapshot details
- `saveSnapshot()` - Create new snapshot
- `exportCSV()` - Generate CSV export

### Frontend Implementation

#### Custom Hook (`useReports.js`)
New React hook for managing report data:

```javascript
const {
  expiryData, agingData, productionData, poAnalysisData, executiveSummaryData,
  loading, error,
  dateRange, setDateRange,
  fetchExpiryReport, fetchAgingReport, fetchProductionReport,
  fetchPOAnalysisReport, fetchExecutiveSummary,
  snapshots, fetchSnapshots, saveSnapshot, loadSnapshot,
  exportCSV
} = useReports();
```

**Location**: `frontend/src/hooks/useReports.js`

#### Reports Page (`Reports.jsx`)
Complete rewrite with 5 tabbed report views:

**Tabs**:
1. **Expiry & Expired** - Shows expiry batches by category
2. **Stock Aging** - Displays batch aging with turnover rates
3. **Production** - Job order and consumption analytics
4. **Procurement** - Pending deliveries and supplier performance
5. **Executive Summary** - High-level metrics dashboard

**Features**:
- Date range picker for filtering
- History dropdown for snapshot management
- Save/Load snapshot functionality
- CSV export button

**Location**: `frontend/Pages/Reports.jsx`

### Bug Fixes During Implementation

#### 1. Executive Summary 500 Error
**Issue**: Executive Summary endpoint returned 500 Internal Server Error.

**Root Cause**: `getFinancialSummary()` function used incorrect column name `is_active: true` but Item model uses `status: 'active'`.

**Fix**:
```diff
// backend/src/services/reportService.js
export const getFinancialSummary = async () => {
  const items = await Item.findAll({
-    where: { is_active: true },
+    where: { status: 'active' },
    attributes: ['current_stock', 'cost_per_unit']
  });
```

**File Modified**: `backend/src/services/reportService.js` (line 796)

#### 2. POLineItem Association Error
**Issue**: Purchase Order Analysis failed due to missing `items` alias.

**Fix**: Added alias to `models/index.js`:
```javascript
PurchaseOrder.hasMany(POLineItem, { 
  foreignKey: 'po_id', 
  as: 'items'  // Added alias
});
```

**File Modified**: `backend/src/models/index.js`

#### 3. Migration Blocked
**Issue**: Migration for `report_snapshots` table was blocked by a prior migration trying to add an already-existing column.

**Fix**: Manually marked `20260115000001-fix-missing-quantity-produced.cjs` as complete in SequelizeMeta table:
```sql
INSERT INTO SequelizeMeta (name) VALUES ('20260115000001-fix-missing-quantity-produced.cjs');
```

Then ran remaining migrations successfully.

### Files Created

| File | Description |
|------|-------------|
| `backend/src/models/ReportSnapshot.js` | Sequelize model for snapshot storage |
| `backend/src/migrations/20260115000002-create-report-snapshots.cjs` | Database migration |
| `frontend/src/hooks/useReports.js` | React hook for report data management |

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/reportService.js` | Added 9 new report functions (600+ lines) |
| `backend/src/controllers/reportController.js` | Added 9 controller methods |
| `backend/src/routes/reports.js` | Added 9 new routes |
| `backend/src/models/index.js` | Added ReportSnapshot model, added `items` alias to PO association |
| `frontend/Pages/Reports.jsx` | Complete rewrite with 5 tabs |

### Verification Results

All 5 report tabs verified working in browser:

| Report | Status | Metrics Shown |
|--------|--------|---------------|
| Expiry & Expired | ✅ Working | Expired/Critical/Warning/Upcoming batches with values |
| Stock Aging | ✅ Working | Fresh/Aging/Critical batches with turnover rates |
| Production | ✅ Working | Job orders, completion rate, efficiency, waste % |
| Procurement | ✅ Working | Pending deliveries, supplier performance |
| Executive Summary | ✅ Working | ₱10B+ inventory value, 39 items, all KPIs |

**Additional Features Verified**:
- ✅ Date range filtering
- ✅ Save snapshot (History → Save Current as Snapshot)
- ✅ Load snapshot (History → Previous Snapshots)
- ✅ CSV export (Export CSV button)

### API Documentation

#### Example: Expiry Report
```bash
GET /api/v1/reports/expiry?startDate=2026-01-01&endDate=2026-01-31

Response:
{
  "success": true,
  "data": {
    "summary": {
      "total_expired_batches": 0,
      "total_expired_value": 0,
      "total_critical_batches": 1,
      "total_critical_value": 10.00,
      "total_warning_batches": 0,
      "total_upcoming_batches": 0,
      "total_value_at_risk": 10.00
    },
    "expired": [],
    "critical": [{ "batch_id": 33, "item_name": "VONVV", ... }],
    "warning": [],
    "upcoming": []
  }
}
```

#### Example: Save Snapshot
```bash
POST /api/v1/reports/snapshots
Content-Type: application/json

{
  "reportType": "expiry",
  "reportName": "January 2026 Expiry Check",
  "snapshotData": { ... },
  "summaryMetrics": { "total_value_at_risk": 10.00 },
  "dateRangeStart": "2026-01-01",
  "dateRangeEnd": "2026-01-31"
}
```

---

**Last Updated**: 2026-01-16
**Version**: 1.10.0
**Project Status**: Production Ready

---

## Phase 23: Stock Movements Enhancements & Verification
**Status**: ✅ COMPLETE
**Date**: 2026-01-16

### Core Stock Movements Features
- [x] **Void Functionality**: 
  - Backend: Implemented `voidMovement` using `reference_type='MANUAL'` (fixed ENUM issue).
  - Frontend: Added "Void Movement" button with reason prompt.
  - Verification: Confirmed reverses stock quantities correctly.
- [x] **Export to CSV**:
  - Implemented `/api/v1/stock-movements/export` endpoint.
  - Implemented frontend export button.
  - **Enhancement**: Standardized CSV generation to use robust `escapeCSV` logic (RFC 4180 compliant) instead of basic JSON stringification.
- [x] **Dynamic Locations**:
  - Frontend: Added `useLocations` hook to fetch warehouse locations dynamically.
  - Updated `MovementCreateModal` to use dynamic dropdowns.
- [x] **Stock Impact Preview**:
  - Added visual "Current -> Change -> Projected" stock level preview in Create Modal.

### Verification Results
- [x] **CSV Exports**: Verified accurate formatting for both Reports and Stock Movements.
- [x] **Voiding**: Fixed 500 error by correcting ENUM usage.
- [x] **UI Polish**: Added badges to item dropdowns.

---

**Last Updated**: 2026-01-16
**Version**: 1.11.0
**Project Status**: Production Ready


---

## Phase 18: Item Folder & Organizing System
**Status**: ✅ COMPLETE
**Date**: 2026-01-17

### Feature Summary
Implemented a comprehensive folder organization system for the Inventory Items, allowing users to move items into folders for better categorization and management.

### Backend Updates
- Folder names are stored directly on the `items` table in the `product_folder` column.
- No new tables were required; folders are derived dynamically from unique values in this column.

### Frontend Features

#### 1. Folder Structure & Navigation
- **Architecture**: Folders are virtual, derived from item data.
- **UI Components**:
    - `FolderCard.jsx`: Displays folder icon, name, and item count.
    - `CreateFolderCard.jsx`: Specialized card to creating new folders.
- **Navigation**: Implemented deep linking and breadcrumbs (Root > FolderName).
- **Persistence**: Added `transientFolders` state to ensure newly created empty folders persist in the UI until populated.

#### 2. Item Assignment
- **Edit Modal**: Updated `ItemFormModal` to include a dynamic "Folder" assignment dropdown.
- **Creation**: Users can assign folders during item creation.

#### 3. Selection & Bulk Operations
- **Multi-select**: Implemented Ctrl+Click / Shift+Click selection logic in `useItemSelection` hook.
- **Bulk Actions Bar**: Floating action bar appears when items are selected.
- **Move Modal**: `MoveToFolderModal` allows moving single or multiple items to any existing folder or back to root.

#### 4. Drag-and-Drop
- **Library**: Integrated `@dnd-kit/core` for robust interaction.
- **Interactions**:
    - **Single Drag**: Move individual items by dragging them onto a folder.
    - **Multi-Drag**: Dragging one selected item moves ALL selected items to the target folder.
- **Visuals**:
    - Item drag preview (semi-transparent, tilted).
    - Folder highlight on hover (scale up, color change).

### Bug Fixes & Refinements
- **Empty Folders**: Fixed issue where empty folders would disappear by tracking them in local state.
- **Missing Imports**: Fixed `ReferenceError` in `FolderCard` by restoring missing imports.
- **Multi-select Move**: Debugged and verified bulk move functionality via browser simulation.

---
