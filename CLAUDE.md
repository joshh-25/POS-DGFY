# SKU Inventory Manager - Claude Code Specification

**Project Type**: Full-Stack Monorepo (React Frontend + Node.js Backend)
**Purpose**: Comprehensive inventory management system for SKU tracking, purchase orders, job orders, and stock movements
**Status**: Development Phase
**Last Updated**: December 2025

---

## 🎯 Project Overview (Critical Context)

This is a full-stack monorepo application with a React 18 + Vite frontend and Node.js/Express backend for managing SKU inventory with FIFO batch tracking, purchase orders, job orders, and real-time stock movements. The system handles ingredients, products, packaging, suppliers, and nutritional/allergen information.

**Tech Stack:**

**Frontend:**
- React 18 + Vite
- TailwindCSS + Shadcn UI components
- React Router v6
- Component-level state (no Redux/Zustand)
- date-fns, Lucide React, Sonner

**Backend:**
- Node.js + Express
- Sequelize ORM
- MySQL database
- Redis for caching
- JWT authentication
- Bcrypt for password hashing

**Key Features:**
- Dashboard with alerts, stats, and recent movements
- SKU/Item management with FIFO batch tracking
- Purchase Order (PO) workflow with receipt tracking
- Job Order (JO) management for production
- Stock movement logging
- Supplier management with bulk discounts
- Product creation wizard (12-step process)
- User authentication and role-based access
- Real-time notifications

---

## 🚨 Critical Rules (MUST FOLLOW)

### Frontend Rules:
1. **Component Structure**: All components in `frontend/Components/` folder, organized by feature
2. **UI Components**: Use Shadcn UI components from `frontend/Components/ui/` - DO NOT create custom UI from scratch
3. **Styling**: TailwindCSS only - NO inline styles or CSS modules
4. **State Management**: Keep state local to components - NO global state library
5. **Entities**: Reference entity models in `frontend/Entities/` folder for data structure
6. **FIFO Logic**: Use `frontend/Components/utils/fifoCalculations.js` for batch calculations
7. **Routing**: All pages in `frontend/Pages/` folder, routed through `Layout.jsx`

### Backend Rules:
1. **API Structure**: All routes in `backend/src/routes/`
2. **Controllers**: Business logic in `backend/src/controllers/`
3. **Models**: Sequelize models in `backend/src/models/`
4. **Middleware**: Authentication and validation in `backend/src/middleware/`
5. **Services**: Complex operations in `backend/src/services/`
6. **Security**: Always validate input, use parameterized queries, hash passwords

### Monorepo Rules:
1. **Working Directory**: Always specify whether working on `frontend/` or `backend/`
2. **Dependencies**: Install frontend deps in `frontend/`, backend deps in `backend/`
3. **Testing**: Run dev servers with `npm run dev:frontend` or `npm run dev:backend`
4. **Never**: Don't modify entity structure without updating both frontend and backend schemas

---

## 🚀 Quick Start Commands

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Start both frontend and backend concurrently
npm run dev

# Or start individually:
npm run dev:frontend    # Frontend only (http://localhost:5173)
npm run dev:backend     # Backend only (http://localhost:5000)

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
│   │   ├── suppliers/                    # Supplier management
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
├── spec-kit/                             # Full specifications
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

**Purchase Orders, Job Orders, Stock Movements, Suppliers, Users, Settings:**
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

> **Note**: `min_threshold` and `purchase_allowance` are automatically calculated from `max_capacity` based on system settings. They cannot be manually edited in creation forms.

### User
```javascript
{
  user_id, username, email, password_hash,
  full_name, role, is_active,
  last_login, created_at, updated_at
}
```

*See CLAUDE.md v1 or spec-kit for other entities (PO, JO, StockMovement, Supplier, etc.)*

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

**Spec Kit (Detailed Specifications):**
- `spec-kit/02_DATABASE_SCHEMA.md` - Complete table definitions
- `spec-kit/03_API_SPECIFICATION.md` - All endpoint details
- `spec-kit/06_INTEGRATION_GUIDE.md` - Frontend-backend integration
- `spec-kit/System Architecture Diagrams & Technical Documentation.md`

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
→ See `spec-kit/` directory

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
