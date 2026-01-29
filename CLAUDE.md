# SKU Inventory Manager - Claude Code Specification

**Project Type**: Full-Stack Monorepo (React Frontend + Node.js Backend)
**Purpose**: Comprehensive inventory management system for SKU tracking, purchase orders, job orders, and stock movements
**Status**: Development Phase
# CLAUDE.md - SKU Inventory Manager Context
> **Last Updated:** Jan 28, 2026
> **Version:** 1.8.0

# 🎯 Project Overview (Critical Context)
**SKU Inventory Manager** is a full-stack web application for managing inventory, purchase orders (PO), job orders (JO), and stock movements. It features FIFO batch tracking, nested product recipes, and smart restock logic.

**Tech Stack:**
**Frontend:**
- React 18 + Vite
- TailwindCSS + Shadcn UI components
- Zustand (State Management)
- Axios (API)
- Lucide React (Icons)
- Recharts (Dashboards)

**Backend:**
- Node.js + Express
- Sequelize ORM (MySQL 8.0)
- Redis (Caching - Optional)

## 🔑 Key Features
1.  **Inventory Management**: CRUD for items, categories (Raw/Packaging/Product), and units.
2.  **FIFO Batch Tracking**: First-In-First-Out logic for cost tracking and lot traceability. Works with or without expiry dates (non-perishable items supported).
3.  **Nested Products**: Products can be ingredients for other products (Level 1-3).
4.  **Smart Restock Logic**: Auto-calculation of thresholds (40%) and purchase allowances (20%).
5.  **Soft Delete & Archiving**: Items are soft-deleted; POs and JOs can be archived.
6.  **Job Orders**: Production tracking with ingredient reservation and finished goods encoding.
7.  **Unit of Measure**: Flexible string-based units (supports 'ml', 'kg', 'pcs', etc.).
8.  **Stock Movements**: Centralized audit trail with void/reversal capability.
9.  **Multi-Supplier PO Creation**: Create separate POs for multiple suppliers in one wizard flow.
10. **Item-Supplier Coverage**: Track which items have suppliers assigned; quick-assign suppliers to items.

# 🏗️ Core Data Entities
| Entity | Key Fields | Notes |
| :--- | :--- | :--- |
| **Item** | `sku_code`, `category`, `current_stock`, `deleted_by`, `deleted_at`, `nesting_level` | `category` determines logic. Soft deletes via `status='inactive'`. |
| **FIFOBatch** | `batch_id`, `item_id`, `expiry_date`, `cost_per_unit`, `notes` | Tracks specific stock instances. `expiry_date` is optional (null for non-perishables). |
| **PurchaseOrder** | `po_number`, `supplier_id`, `status`, `archived_at` | Status: `pending` -> `received` -> `stock_updated`. |
| **JobOrder** | `jo_number`, `product_id`, `status`, `archived_at` | Status: `draft` -> `in_progress` -> `completed`. |
| **Supplier** | `name`, `quality_rating`, `lead_time` | Linked to items via `SupplierItems`. |
| **StockMovement** | `movement_type`, `quantity`, `reference_id` | Audit trail for ALL stock changes. |

# 🚨 Critical Rules (MUST FOLLOW)
### Frontend Rules:
1.  **Component Structure**: All components in `frontend/Components/` folder, organized by feature (e.g., `items/`, `products/`).
2.  **UI Components**: Use Shadcn UI components from `frontend/Components/ui/` - DO NOT create custom UI from scratch.
3.  **State Management**: Use local state (`useState`) for forms, `Zustand` for global user/settings data.
4.  **Styling**: detailed TailwindCSS classes. No custom CSS files unless absolutely necessary.
5.  **API Calls**: Use `frontend/src/services/` for ALL API requests. No `axios` calls in components.
6.  **Validation**: Use `Joi` or manual validation before sending data.

### Backend Rules:
1.  **Controller-Service Pattern**: Controllers handle HTTP; Services handle business logic and DB ops.
2.  **Validation**: Middleware validators (`src/validators/`) MUST be used for all specific routes.
3.  **Transactions**: Use Sequelize transactions for multi-table updates (e.g., PO Receive, JO Complete).
4.  **Soft Deletes**: NEVER `DELETE` from `items`. Use `status='inactive'`, set `deleted_at`.
5.  **Smart Restock**: `itemService` auto-calculates `min_threshold` if `max_capacity` changes.
6.  **Error Handling**: Use the central error handler. Throw normal Errors with `statusCode` property.

# 📂 Project Structure
```text
/
├── backend/
│   ├── src/
│   │   ├── config/         # DB & Env config
│   │   ├── controllers/    # Request handlers
│   │   ├── models/         # Sequelize definitions
│   │   ├── routes/         # Express routes (v1)
│   │   ├── services/       # Business logic (Heavy lifting)
│   │   └── validators/     # Joi validation schemas
│   └── tests/
├── frontend/
│   ├── Components/
│   │   ├── items/          # Item forms, lists
│   │   ├── products/       # Recipe wizard, product views
│   │   ├── ui/             # Shadcn UI (Buttons, Inputs, etc.)
│   │   └── wizard/         # Shared wizard logic
│   ├── Pages/              # Main route views
│   └── src/
│       ├── lib/            # Utils (formatting, classes)
│       └── services/       # API wrappers
├── docs/                   # Detailed documentation
└── CLAUDE.md               # Context file
```

# 🛠️ Common Commands
- **Install All**: `npm run install:all`
- **Dev Mode**: `npm run dev` (Runs both servers)
- **Backend Only**: `cd backend && npm run dev`
- **Frontend Only**: `cd frontend && npm run dev`
- **DB Migrate**: `cd backend && npm run db:migrate`

# 🔗 Documentation Links
- [Detailed API Spec](docs/api/specification.md)
- [Deployment Guide](SETUP.md)
- [Nested Products Guide](docs/NESTED_PRODUCTS.md)
- [Quick Reference](docs/QUICK_REFERENCE.md)
# Build for production
npm run build

# Run with Docker
docker-compose up -d
```

---

## 📂 Project Structure at a Glance

```
SKU-Inventory-Manager/                    # Monorepo root
├── frontend/                             # React frontend application
│   ├── Components/                       # React components by feature
│   │   ├── dashboard/                    # Dashboard widgets
│   │   ├── items/                        # Item/SKU management
│   │   ├── po/                           # Purchase Orders
│   │   ├── jo/                           # Job Orders
│   │   ├── movements/                    # Stock movements
│   │   ├── products/                     # Product creation wizard
│   │   ├── suppliers/                    # Supplier management + Item Coverage
│   │   ├── users/                        # User management
│   │   ├── ui/                           # Shadcn UI components
│   │   ├── data/                         # dummyData.js (dev only)
│   │   └── utils/                        # fifoCalculations.js
│   ├── Entities/                         # Frontend data models
│   ├── Pages/                            # Page components (routed)
│   │   ├── Dashboard.jsx
│   │   ├── Items.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   └── Settings.jsx
│   ├── src/
│   │   ├── main.jsx                      # Vite entry point
│   │   ├── services/                     # API service layer
│   │   │   ├── api.js                    # Axios instance
│   │   │   ├── itemService.js
│   │   │   ├── userService.js
│   │   │   └── settingsService.js
│   │   └── store/                        # Zustand stores
│   ├── Layout.jsx                        # Main layout wrapper
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── index.html
│
├── backend/                              # Node.js backend application
│   ├── src/
│   │   ├── routes/                       # Express routes
│   │   │   ├── auth.js
│   │   │   ├── items.js
│   │   │   ├── users.js
│   │   │   ├── purchaseOrders.js
│   │   │   ├── jobOrders.js
│   │   │   ├── stockMovements.js
│   │   │   ├── suppliers.js
│   │   │   └── settings.js
│   │   ├── controllers/                  # Business logic
│   │   │   ├── authController.js
│   │   │   ├── userController.js
│   │   │   └── settingsController.js
│   │   ├── models/                       # Sequelize models
│   │   │   ├── Item.js
│   │   │   ├── User.js
│   │   │   ├── PurchaseOrder.js
│   │   │   └── ...
│   │   ├── middleware/
│   │   │   ├── auth.js                   # JWT authentication
│   │   │   └── errorHandler.js
│   │   ├── services/                     # Complex operations
│   │   │   ├── authService.js
│   │   │   ├── userService.js
│   │   │   └── settingsService.js
│   │   ├── validators/                   # Input validation
│   │   ├── seeders/                      # Database seeders
│   │   └── server.js                     # Express app entry
│   ├── .env                              # Environment variables
│   ├── package.json
│   └── database-setup.sql
│
├── docs/                                 # Documentation
│   └── QUICK_REFERENCE.md

├── .claude/                              # Claude Code config
│   └── hooks/
│       └── session-start.sh
├── package.json                          # Root monorepo config
├── docker-compose.yml
└── CLAUDE.md                             # This file
```

---

## 🔑 Key Components Reference

### Frontend Components

**Dashboard Components:**
- AlertBanner, StatsCard, LowStockList, RecentMovements

**Item Management:**
- ItemCard, ItemDetailsModal, ItemFormModal, FIFOBatchViewer

**Purchase Orders:**
- POCreateWizard, PODetailsModal, POReceiptModal

**Job Orders:**
- JOCreateModal, JODetailsModal

**Products:**
- ProductCreateWizard + 11 wizard steps

**Suppliers:**
- SupplierCard, SupplierDetailsModal, SupplierFormModal
- ItemCoveragePanel (tracks items with/without suppliers)
- AddSupplierChoiceDialog, QuickAssignSupplierModal

**Users:**
- UserManagement, UserFormModal

### Backend API Endpoints

**Authentication:**
- POST `/api/v1/auth/register` - Register new user
- POST `/api/v1/auth/login` - User login
- POST `/api/v1/auth/logout` - User logout

**Items:**
- GET `/api/v1/items` - List items
- POST `/api/v1/items` - Create item
- GET `/api/v1/items/:id` - Get item details
- PUT `/api/v1/items/:id` - Update item
- GET `/api/v1/items/supplier-coverage` - Get items grouped by supplier assignment status

**Suppliers:**
- GET `/api/v1/suppliers` - List suppliers
- POST `/api/v1/suppliers` - Create supplier
- POST `/api/v1/suppliers/:id/items` - Add item to supplier (quick assign)

**Purchase Orders, Job Orders, Stock Movements, Users, Settings:**
- Similar CRUD endpoints for each resource

---

## 📊 Core Data Entities

### Item (SKU Master)
```javascript
{
  item_id, sku_code, name, category, description,
  current_stock, max_capacity,
  min_threshold,        // AUTO-CALCULATED: max_capacity × 40%
  purchase_allowance,   // AUTO-CALCULATED: max_capacity × 20%
  unit_of_measure, cost_per_unit, fifo_enabled,
  batch_size, yield_percentage, processing_loss, production_notes,
  is_active, created_at, updated_at
}
```

> **Important Notes**:
> - `min_threshold` and `purchase_allowance` are AUTO-CALCULATED from `max_capacity`
>   - `min_threshold` = `max_capacity × 40%` (from system settings)
>   - `purchase_allowance` = `max_capacity × 20%` (from system settings)
> - These fields cannot be manually edited in creation forms
> - `product_type` is required only when `category = 'product'`
> - `product_type` must be null/undefined for non-product categories
> - Validation fix applied in `backend/src/models/Item.js` line 33

### User
```javascript
{
  user_id, username, email, password_hash,
  full_name, role, is_active,
  last_login, created_at, updated_at
}
```

*See docs/database/schema.md for other entities (PO, JO, StockMovement, Supplier, etc.)*

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` or change vite port |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS settings in `backend/src/server.js` |
| Components not rendering | Check import paths - use `@/Components/...` |
| Backend won't start | Check `.env` file exists in `backend/` folder |
| Database connection error | Verify MySQL is running, check credentials in `.env` |
| Redis connection error | Ensure Redis is running on port 6379 |

---

## 📖 Documentation References

**Quick Reference:**
- `docs/QUICK_REFERENCE.md` - Common commands and troubleshooting

**Backend Documentation:**
- `backend/CREDENTIALS.md` - Default admin credentials
- `backend/database-setup.sql` - Database setup script
- `backend/README.md` - Backend-specific documentation

**Root Documentation:**
- `ADMIN_SETUP.md` - Admin user setup guide
- `REDIS_SETUP.md` - Redis installation and configuration
- `QUICK_START.md` - Quick start guide
- `SETUP.md` - Complete setup instructions

**Detailed Specifications (in /docs):**
- `docs/database/schema.md` - Complete table definitions
- `docs/api/specification.md` - All endpoint details
- `docs/api/integration-guide.md` - Frontend-backend integration
- `docs/architecture/system-architecture.md` - System architecture diagrams
- `docs/AI_GUIDELINES.md` - AI Assistant capabilities, limitations, and workflows

---

## 🔗 When You Need More Context

**Working on Frontend Components?**
→ Check `frontend/Components/` folder structure

**Working on Backend API?**
→ Check `backend/src/routes/` and `backend/src/controllers/`

**Working on Database Models?**
→ Check `backend/src/models/` (Sequelize) and `frontend/Entities/` (frontend models)

**Working on Authentication?**
→ Check `backend/src/middleware/auth.js` and `backend/src/services/authService.js`

**Need API Integration?**
→ Check `frontend/src/services/` for API service layer

**Need Full Specs?**
→ See `docs/` directory

---

## 📝 Notes for Claude Code

- This is a **monorepo** structure with `frontend/` and `backend/` folders
- Always specify which part you're working on (frontend vs backend)
- Frontend uses relative imports (`@/Components/...`)
- Backend uses CommonJS (`require()`)
- API calls from frontend go to `http://localhost:5000/api/v1`
- This file is optimized for Claude Code context efficiency
- Detailed specs are linked, not embedded
- Keep context under 1,000 tokens for optimal performance
