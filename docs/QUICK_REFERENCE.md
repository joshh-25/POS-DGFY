# SKU Inventory Manager - Quick Reference Guide

## Essential Commands (Monorepo)

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

# Kill stuck ports
lsof -ti:5173 | xargs kill -9  # Frontend
lsof -ti:5000 | xargs kill -9  # Backend
```

## Project Structure Quick Map (Monorepo)

| Path | Purpose |
|------|---------|
| `frontend/` | React frontend application |
| `frontend/Components/` | React components by feature |
| `frontend/Components/ui/` | Shadcn UI component library |
| `frontend/Entities/` | Frontend data models |
| `frontend/Pages/` | Page components (routed) |
| `frontend/src/services/` | API service layer |
| `backend/` | Node.js backend application |
| `backend/src/routes/` | Express API routes |
| `backend/src/controllers/` | Business logic |
| `backend/src/models/` | Sequelize database models |
| `backend/src/middleware/` | Authentication & validation |
| `docs/` | Documentation |
| `spec-kit/` | Full specifications |

## Component Locations (Frontend)

| Feature | Components | Location |
|---------|-----------|----------|
| Dashboard | AlertBanner, StatsCard, LowStockList, RecentMovements | `frontend/Components/dashboard/` |
| Items/SKU | ItemCard, ItemDetailsModal, ItemFormModal, FIFOBatchViewer | `frontend/Components/items/` |
| Purchase Orders | POCreateWizard, PODetailsModal, POReceiptModal | `frontend/Components/po/` |
| Job Orders | JOCreateModal, JODetailsModal | `frontend/Components/jo/` |
| Stock Movements | MovementCreateModal | `frontend/Components/movements/` |
| Products | ProductCreateWizard + 11 wizard steps | `frontend/Components/products/` |
| Suppliers | SupplierCard, SupplierDetailsModal, SupplierFormModal, ItemCoveragePanel, QuickAssignSupplierModal, AddSupplierChoiceDialog | `frontend/Components/suppliers/` |
| Users | UserManagement, UserFormModal | `frontend/Components/users/` |

## Backend API Routes

| Resource | Route File | Endpoints |
|----------|-----------|-----------|
| Authentication | `backend/src/routes/auth.js` | POST /auth/register, /auth/login |
| Items | `backend/src/routes/items.js` | GET/POST/PUT/DELETE /items, GET /items/supplier-coverage |
| Purchase Orders | `backend/src/routes/purchaseOrders.js` | GET/POST/PUT/DELETE /purchaseOrders |
| Job Orders | `backend/src/routes/jobOrders.js` | GET/POST/PUT/DELETE /jobOrders |
| Stock Movements | `backend/src/routes/stockMovements.js` | GET/POST /stockMovements |
| Suppliers | `backend/src/routes/suppliers.js` | GET/POST/PUT/DELETE /suppliers |
| Users | `backend/src/routes/users.js` | GET/POST/PUT/DELETE /users |
| Settings | `backend/src/routes/settings.js` | GET/PUT /settings |

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS in `backend/src/server.js` |
| Components not rendering | Check import paths: `@/Components/...` (frontend) |
| Backend won't start | Verify `.env` exists in `backend/` folder |
| Database connection error | Check MySQL is running, verify `.env` credentials |
| Redis connection error | Ensure Redis is running on port 6379 |
| npm run dev fails | Run `npm run install:all` first |
| Styling not applying | Verify TailwindCSS classes, check `frontend/tailwind.config.js` |
| FIFO calculations wrong | Review `frontend/Components/utils/fifoCalculations.js` |

## Critical Rules (Never Do This)

### Frontend:
- ❌ Don't create custom UI from scratch (use Shadcn components)
- ❌ Don't use inline styles or CSS modules (use TailwindCSS)
- ❌ Don't add Redux/Zustand (keep state local or use Zustand if needed)
- ❌ Don't hardcode API URLs (use `frontend/src/services/api.js`)

### Backend:
- ❌ Don't expose sensitive data in responses
- ❌ Don't skip authentication middleware on protected routes
- ❌ Don't use raw SQL queries (use Sequelize)
- ❌ Don't commit `.env` file

### Monorepo:
- ❌ Don't install dependencies in root (use `frontend/` or `backend/`)
- ❌ Don't modify entity structure without updating both frontend & backend
- ❌ Don't force push to main branch
- ❌ Don't commit without testing both frontend and backend

## Data Entity Quick Reference

### Item
- **Fields**: `sku_code`, `category`, `current_stock`, `min_threshold` (auto), `purchase_allowance` (auto), `deleted_at`, `deleted_by`, `nesting_level`
- **Critical**: `category` determines logic. `min_threshold` is 40% of `max_capacity`.

### FIFO Batch
- **Fields**: `batch_id`, `item_id`, `expiry_date`, `cost_per_unit`, `notes`
- **Critical**: `expiry_date` is mandatory if `fifo_enabled` is true. `notes` can store batch-specific details.

### Purchase Order (PO)
- **Fields**: `po_number`, `supplier_id`, `status` [pending, received, stock_updated], `archived_at`
- **Critical**: Cannot be edited after 'received'.

### Job Order (JO)
- **Fields**: `jo_number`, `product_id`, `status` [draft, in_progress, completed], `archived_at`, `notes`
- **Critical**: Consumes ingredients upon 'completion'. Notes propagate to finished goods batch.

### Stock Movement
- **Fields**: `movement_type`, `quantity`, `reference_id` (PO-xxx, JO-xxx), `user_responsible`
- **Critical**: IMMUTABLE audit log. Never delete rows.

---

## ⚠️ Common Issues & Fixes

### 1. "Product type is required"
**Cause**: Creating a 'product' category Item without specifying `product_type` (Work in Progress / Finished Goods).
**Fix**: Ensure `product_type` is selected in the wizard.

### 2. "Circular dependency detected"
**Cause**: Trying to nest Product A inside Product B, when Product B is already inside Product A.
**Fix**: Check your recipe hierarchy. The system prevents infinite loops (Level 1 → Level 2 → Level 3).

### 3. Port 5000/5173 Already in Use
**Fix**:
```bash
npx kill-port 5000
npx kill-port 5173
```

## Shadcn UI Components Available (Frontend)

```
badge, button, card, checkbox, dialog, dropdown-menu
input, label, progress, select, separator, slider
sonner (notifications), switch, tabs, textarea
```

**Import pattern:**
```jsx
import { Button } from "@/Components/ui/button"
```

## Environment Variables

### Frontend (.env in frontend/)
```
VITE_API_URL=http://localhost:5000/api/v1
```

### Backend (.env in backend/)
```
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=root
DB_PASSWORD=your_password
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=http://localhost:5173
```

## When to Reference Full Documentation

- **Database schema details** → `spec-kit/02_DATABASE_SCHEMA.md`
- **API endpoints** → `spec-kit/03_API_SPECIFICATION.md`
- **Backend integration** → `spec-kit/06_INTEGRATION_GUIDE.md`
- **System architecture** → `spec-kit/System Architecture Diagrams & Technical Documentation.md`
- **Development roadmap** → `spec-kit/Implementation Roadmap & Development Guide.md`
- **Admin setup** → `ADMIN_SETUP.md`
- **Redis setup** → `REDIS_SETUP.md`
- **Quick start** → `QUICK_START.md`

## Token Optimization Tips for Claude Code

1. Use this quick reference instead of full CLAUDE.md for common tasks
2. Specify frontend or backend when asking questions
3. Ask Claude to check specific folders (e.g., "Check frontend/Components/items/")
4. Reference entity models by name (e.g., "Update Item entity in backend")
5. Use session hooks to detect context automatically
6. Keep CLAUDE.md under 1,000 tokens for faster responses

## Workflow Examples

**Adding a new item (Full Stack):**
1. Backend: Add validation in `backend/src/validators/`
2. Backend: Update route in `backend/src/routes/items.js`
3. Frontend: Update `frontend/src/services/itemService.js`
4. Frontend: Update `frontend/Components/items/ItemFormModal.jsx`

**Creating a PO:**
Purchase Orders page → "Create PO" → POCreateWizard → Select supplier → Add items → Submit → API saves to DB

**Managing FIFO batches:**
Item details → FIFOBatchViewer → View batches by received date → Track consumption

**Recording stock movement:**
Stock Movements → "Log Movement" → Select item/type/quantity → Save to API → Updates database
