# SKU Inventory Manager - Quick Reference Guide

## Essential Commands

### Production (PM2 - Primary)
```bash
# Restart all services (backend + frontend)
pm2 restart all

# View running processes
pm2 list

# View logs (real-time)
pm2 logs

# View logs for specific service
pm2 logs backend
pm2 logs frontend

# Full deployment (git pull, install, build, migrate, restart)
./scripts/deploy.sh
```

### Development (Local testing only)
> ⚠️ **Note**: `npm run dev` is for local development only. Use PM2 commands for production.

```bash
# Install all dependencies (one-time setup)
npm run install:all

# Start dev servers (NOT for production)
npm run dev

# Or individually:
npm run dev:frontend    # http://localhost:5173
npm run dev:backend     # http://localhost:5000
```

### Database
```bash
# Run migrations (handled automatically by deploy.sh)
cd backend && npx sequelize-cli db:migrate

# Verify required DB index contract (fails on missing indexes)
cd backend && npm run audit:indexes

# Sync all tenant schemas (handled automatically by deploy.sh)
node backend/scripts/sync-tenant-schemas.js
```

### PayPal Sandbox Canary (Scheduled)
```bash
# Run canary locally (will auto-skip if sandbox env vars are missing)
cd backend
npm test -- paypalSandboxCanary.e2e.test.js
```
GitHub Actions workflow:
- `.github/workflows/paypal-sandbox-canary.yml`
- Runs nightly (`cron: 17 2 * * *`) and on manual dispatch.
- Verifies live sandbox subscription checks and `/api/v1/payments/upgrade` path.

### Troubleshooting
```bash
# Kill stuck ports (if needed)
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
| Services not responding | `pm2 restart all` |
| Code changes not applied | `pm2 restart all` or run `./scripts/deploy.sh` |
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS in `backend/src/server.js` |
| Components not rendering | Check import paths: `@/Components/...` (frontend) |
| Backend won't start | Verify `.env` exists in `backend/` folder |
| Database connection error | Check MySQL is running, verify `.env` credentials |
| Redis connection error | Ensure Redis is running on port 6379 |
| New DB columns not syncing | Run `node backend/scripts/sync-tenant-schemas.js` |
| Too many keys (64 limit) error | Run `node backend/scripts/cleanup-duplicate-indexes.js` then sync |
| Styling not applying | Verify TailwindCSS classes, check `frontend/tailwind.config.js` |
| FIFO calculations wrong | Review `frontend/Components/utils/fifoCalculations.js` |
| Sidebar only shows Dashboard after login | Fixed via auth events - see Permission Loading section below |
| Login fails with 401 after switching companies | Clear localStorage: `localStorage.removeItem('companyToken')` then retry |
| Approval email not sent | Check SMTP config in `.env`, verify Gmail App Password |
| PayPal canary skipped locally | Missing sandbox env vars (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PLAN_ID`, `PAYPAL_WEBHOOK_ID`) |

## Permission Loading (Authentication Flow)

The application uses an event-based system to ensure permissions load correctly after login:

1. **authService** dispatches `auth:login` event after successful login/register
2. **PermissionContext** listens for this event and reloads user permissions
3. **Layout.jsx** shows all menu items during loading, then filters based on permissions

**Key files:**
- `frontend/src/services/authService.js` - Dispatches auth events
- `frontend/src/store/PermissionContext.jsx` - Listens for auth events, manages permissions
- `frontend/Layout.jsx` - Uses `loading` state to prevent flash of limited menu

**Events:**
- `auth:login` - Fired after login/register, triggers permission reload
- `auth:logout` - Fired after logout, clears permissions

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

### Soft Delete Contract
- `items`, `suppliers`, and `users` use manual soft delete (`deleted_at`, `deleted_by`).
- Default resource behavior for soft-deleted records is `404`.
- Use `buildVisibleWhere(...)` from `backend/src/utils/softDeletePolicy.js` for service queries.

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
SCHEMA_INDEX_AUDIT_ENABLED=true
SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES=360
SCHEMA_INDEX_AUDIT_TIMEOUT_MS=5000

# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=SKU Inventory Manager
APP_URL=http://localhost:5173
```

## Email Configuration (Gmail SMTP)

### Quick Setup
1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password (16 characters)
4. Add credentials to `backend/.env`

### Email Types
| Type | Trigger | Notes |
|------|---------|-------|
| User Invitation | AI or admin creates invitation | Sends invite link with token |
| Company Approved | Admin approves pending registration | Sends login credentials + company token |
| Company Rejected | Admin rejects registration | Sends reason (optional) + re-register link |

### Troubleshooting Email
| Issue | Fix |
|-------|-----|
| Emails not sending | Verify SMTP credentials in `backend/.env` |
| App Password not available | Enable 2FA first on Google account |
| Sender rejected | Ensure `EMAIL_FROM` matches `SMTP_USER` |
| Email fails silently | Check PM2 logs: `pm2 logs backend` |

### Graceful Degradation
Email failures **never block** primary operations. API responses include `email_sent: boolean` to indicate success/failure.

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
