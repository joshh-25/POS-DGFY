# DGFY Platform - Claude Code Specification

**Project Type**: Full-Stack Monorepo (React Frontend + Node.js Backend)
**Purpose**: Multi-vertical, multi-tenant commerce/operations platform — POS,
inventory, storefront, bookings, and hospitality across capability-driven
workflow modes (retail, F&B, services, hospitality, food manufacturing,
MSME, and more), not a single-vertical SKU tool.
**Status**: Active development
# CLAUDE.md - DGFY Platform Context
> **Last reviewed:** 2026-08-09 (targeted identity/navigation refresh; the
> rest of this file predates the multi-vertical/workflow-mode architecture
> below and is not fully current — verify anything load-bearing against the
> docs in "Mandatory Lookup Order" and `docs/ai/CLAUDE.md`'s own later
> sections before relying on it.)

## Mandatory Lookup Order

This file (`docs/ai/CLAUDE.md`) is a working-context supplement, not the
top of the documentation hierarchy. Before implementing anything
non-trivial, follow the same lookup order every other doc in this repo
points to:

1. `docs/START_HERE.md` — canonical entry point and folder usage guide.
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` and
   `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
3. The relevant ADR(s) under `docs/architecture/adr/` — check
   `docs/architecture/adr/INDEX.md` first.
4. Feature-specific playbooks/handoff docs, e.g.
   `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md` (adding/extending a
   workflow mode) and `docs/development/STORE_TEMPLATES_HANDOFF.md`
   (Store Templates & Capability Modules — how "industry types" are
   actually composed today; read this before assuming a new vertical
   needs a hard-coded mode).

# 🎯 Project Overview (Critical Context)
**DGFY** is a multi-tenant, multi-vertical full-stack web application for
managing inventory, POS, storefront, purchase orders (PO), job orders (JO),
service bookings, hospitality stays, and stock movements using a
distributed database-per-tenant architecture. It features FIFO batch
tracking, nested product recipes, smart restock logic, and a
capability-driven workflow-mode system (see "Mandatory Lookup Order"
above) that composes what a tenant can do from a fixed vocabulary of
Capability Modules rather than hard-coding one behavior set per industry.

> **⚠️ Source of truth: `apps/dgfy-api/`.** The old `backend/` directory has been
> removed. `apps/dgfy-api/` *is* the backend, refactored into `apps/`; the Sequelize
> migration domain lives separately in `apps/dgfy-migration-runner/`. Path references
> below that still say `backend/` in prose are historical. `frontend/` and `android/`
> were relocated the same way — `android/` to `apps/dgfy-android-bridge/`, and `frontend/`
> first to a single `apps/dgfy-web/` package
> ([ADR 0059](../architecture/adr/0059-frontend-relocation-to-apps-dgfy-web.md)), which has
> since been split into three independent frontend apps — `apps/dgfy-ims/`,
> `apps/dgfy-pos/`, `apps/dgfy-storefront/` — plus the shared `packages/web-core/` trunk
> ([ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md)).
> `apps/dgfy-web/` no longer exists on disk. For
> the full path map and how local run/deploy commands changed, read
> [docs/architecture/apps-layout-migration.md](../architecture/apps-layout-migration.md).
> If `develop` receives `backend/`/`frontend/`/`android/` changes during the transition
> window, absorb them via the documented method in
> [docs/architecture/backend-absorption.md](../architecture/backend-absorption.md).

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
1.  **Multi-Tenancy**: Distributed database architecture with unique subdomains and tokens for each company.
2.  **Inventory Management**: CRUD for items, categories (Raw/Packaging/Product), and units.
2.  **FIFO Batch Tracking**: First-In-First-Out logic for cost tracking and lot traceability. Works with or without expiry dates (non-perishable items supported).
3.  **Nested Products**: Products can be ingredients for other products (Level 1-3).
4.  **Smart Restock Logic**: Auto-calculation of thresholds (40%) and purchase allowances (20%).
5.  **Soft Delete & Archiving**: Items are soft-deleted; POs and JOs can be archived.
6.  **Job Orders**: Production tracking with ingredient reservation and finished goods encoding.
7.  **Unit of Measure**: Flexible string-based units (supports 'ml', 'kg', 'pcs', etc.).
8.  **Stock Movements**: Centralized audit trail with void/reversal capability.
9.  **Multi-Supplier PO Creation**: Create separate POs for multiple suppliers in one wizard flow.
10. **Item-Supplier Coverage**: Track which items have suppliers assigned; quick-assign suppliers to items.
11. **AI Assistant (SKUpervisor)**: Natural language interface powered by OpenAI GPT-4o with **52 tools** for querying, creating, and managing inventory data. Fully tenant-isolated with database-per-tenant persistence. Supports bulk folder creation/deletion via single confirmation.
12. **Email Notifications**: Automated emails for user invitations, company approval/rejection, **subscription expiry warnings, and payment failure alerts**. Uses Nodemailer SMTP only (the Brevo HTTPS API fallback was removed in issue #279; a send failure now throws with no fallback and is recorded in `email_delivery_logs`) with manual-link recovery for invitations. Local/testing can use Gmail SMTP with an App Password; production uses Namecheap Private Email SMTP on `dgfy.ph` (see #135).

## 🤖 AI Assistant Features
The SKUpervisor AI Assistant provides natural language interaction with the inventory system:

**Capabilities:**
- Query dashboard stats, items, suppliers, POs, JOs, stock movements
- Create items, purchase orders, job orders (with confirmation workflow)
- Analyze production feasibility for nested products
- Search project documentation (RAG)
- Export data to CSV (display or download)
- Import CSV data with validation preview
- **Vision & File Processing**: Analyze images, PDFs, and Word docs
- **User Management (Admin)**: Invite users, update roles/permissions, export/import users CSV

**Key Technical Details:**
- Write operations require confirmation (5-minute expiry)
- Conversations retained for 30 days
- Role-based permissions (Staff: read-only, Manager+: write access)
- 52 AI tools mapped to existing backend services (includes bulk folder creation/deletion)
- **Multi-Tenant Isolation**: Uses `dbStore.get()` for tenant-aware database writes
- **Markdown Rendering**: AI responses rendered with full markdown support (tables, bold, code, lists)
- **Diagnostics Endpoint**: `GET /api/v1/ai/diagnostics` — on-demand capability gap report (no DB writes)

**Frontend Components** (shared trunk — `packages/web-core/`):
- `packages/web-core/Components/ai/MarkdownRenderer.jsx` - Markdown rendering with Tailwind styling
- `packages/web-core/Components/ai/ActionResultCard.jsx` - Structured result display
- `packages/web-core/Components/ai/ConfirmActionDialog.jsx` - Write operation confirmation
- `packages/web-core/Components/ai/AiDiagnosticsPanel.jsx` - AI capability & knowledge gap checker panel

The AI Chat route itself is IMS-only: `apps/dgfy-ims/Pages/AiChat.jsx`.

**Files**: See `docs/ai/AI_GUIDELINES.md` for full documentation.

# 🏗️ Core Data Entities
| Entity | Key Fields | Notes |
| :--- | :--- | :--- |
| **Item** | `sku_code`, `category`, `current_stock`, `deleted_by`, `deleted_at`, `nesting_level` | `category` determines logic. Soft deletes via `status='inactive'`. |
| **FIFOBatch** | `batch_id`, `item_id`, `expiry_date`, `cost_per_unit`, `notes` | Tracks specific stock instances. `expiry_date` is optional (null for non-perishables). Legacy batches (auto-created for items without batches) have `po_number='LEGACY-STOCK'`. |
| **PurchaseOrder** | `po_number`, `supplier_id`, `status`, `archived_at` | Status: `pending` -> `received` -> `stock_updated`. |
| **JobOrder** | `jo_number`, `product_id`, `status`, `archived_at` | Status: `draft` -> `in_progress` -> `partial` -> `completed`. Partial completion supported. |
| **Supplier** | `name`, `quality_rating`, `lead_time` | Linked to items via `SupplierItems`. |
| **StockMovement** | `movement_type`, `quantity`, `reference_id` | Audit trail for ALL stock changes. |

# 🚨 Debugging Protocol (MANDATORY)
Before attempting ANY bug fix, the following steps MUST be taken:
1. **Check Documentation First**:
   - Consult `TROUBLESHOOTING.md` for known issues and solutions.
   - Check `DEVELOPMENT_HISTORY.md` for similar past bugs.
2. **Reproduce & Isolate**:
   - Create a reproduction script (e.g., `apps/dgfy-api/scripts/reproduce_issue.js`) if complex.
   - Verify if the issue is a "known quirk" documented in `CLAUDE.md` or `AI_GUIDELINES.md`.
3. **Verify Environment**:
   - Ensure `NODE_ENV` matches the context (dev vs prod).
   - Check if the issue is related to multi-tenancy context (Tenant ID missing?).

# 🚨 Critical Rules (MUST FOLLOW)
### Frontend Rules:
There are three frontend apps — `apps/dgfy-ims/` (SKUpervisor/IMS, dev port 5173),
`apps/dgfy-pos/` (dev port 5174), `apps/dgfy-storefront/` (dev port 5175) — plus the
shared `packages/web-core/` package (`@sieitzz/web-core`), which has no build step, no
`node_modules`, and no lockfile of its own. Each app declares
`"@sieitzz/web-core": "file:../../packages/web-core"` in its `package.json`, and its
`vite.config.js` aliases `@/components`, `@/src`, `@/services`, `@/hooks`, and `@/lib`
into `packages/web-core` while a bare `@/…` resolves to that app's own root. Put shared
code in `packages/web-core/`, app-specific code in that app. Always say which app you are
working on.

1.  **Component Structure**: Shared components live in `packages/web-core/Components/`, organized by feature (e.g., `items/`, `products/`). App-only components live under that app's own `src/`.
2.  **UI Components**: Use Shadcn UI components from `packages/web-core/Components/ui/` - DO NOT create custom UI from scratch.
3.  **State Management**: Use local state (`useState`) for forms, `Zustand` for global user/settings data.
4.  **Styling**: detailed TailwindCSS classes. No custom CSS files unless absolutely necessary.
5.  **API Calls**: Use `packages/web-core/src/services/` for ALL API requests. No `axios` calls in components.
6.  **Validation**: Use `Joi` or manual validation before sending data.

### Backend Rules:
1.  **Controller-Service Pattern**: Controllers handle HTTP; Services handle business logic and DB ops.
2.  **Validation**: Middleware validators (`src/validators/`) MUST be used for all specific routes.
3.  **Transactions**: Use Sequelize transactions for multi-table updates (e.g., PO Receive, JO Complete).
4.  **Soft Deletes**: NEVER `DELETE` from `items`. Use `status='inactive'`, set `deleted_at`.
5.  **Smart Restock**: `itemService` auto-calculates `min_threshold` if `max_capacity` changes.
6.  **Error Handling**: Use the central error handler. Throw normal Errors with `statusCode` property.
7.  **CSV Imports**: NEVER trust client-supplied validation flags in `confirmImport`. Always re-validate and sanitize row data on the backend before persistence.
8.  **CSV Exports**: ALWAYS use the `escapeCSVCell` logic (or equivalent prefixing for `=`, `+`, `-`, `@`) when exporting text to CSV to prevent spreadsheet formula injection. Favor export-side sanitization over import-side mutation.

### Secrets Rules (production, `Sieitzz/dgfy-secrets`, `/opt/dgfy-platform`)
See ADR 0060 and `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` for the full
design. Once the cutover in that runbook has executed:
1.  **SOPS-encrypted `secrets/*.env` files are safe to read.** Ciphertext
    only — `KEY=ENC[...]` lines. Reading, listing, or grepping them is fine
    and expected.
2.  **Never run `sops decrypt` (or equivalent) to a file, and never `source
    <(sops decrypt ...)`** — the latter executes decrypted output as shell
    script and corrupts any value containing a literal `$` (e.g. a bcrypt
    hash). If a deploy script needs decrypted values, it reads them with a
    `read -r key value` + `export` loop, per the runbook.
3.  **Never paste a decrypted value into a commit, PR, issue, doc, or chat
    message** — this is the exact failure mode that produced #239.
4.  **Do not migrate an existing real secret value out of a live server's
    plaintext `.env` into SOPS, even via a command whose output is never
    displayed.** The execution environment has full read access in that
    moment regardless of what a transcript shows, and a failed/interrupted
    command risks the plaintext landing in the transcript itself — worse
    than the status quo. That one-time migration is a human-operator step.
    Helping **rotate** a secret to a brand-new value (not extracting an
    existing one) is fine.
5.  This repo (`dgfy-platform`) does not hold ciphertext for production
    secrets — that lives in the separate `Sieitzz/dgfy-secrets` repo. Only
    `.sops.yaml` (public recipient keys) and deploy tooling live here.

# 📂 Project Structure
```text
/
├── apps/
│   ├── dgfy-api/               # The app (source of truth; formerly backend/)
│   │   ├── src/
│   │   │   ├── config/         # DB & Env config + AI tools/prompts
│   │   │   ├── controllers/    # Request handlers (incl. aiController)
│   │   │   ├── models/         # Sequelize definitions (incl. AI models)
│   │   │   ├── routes/         # Express routes (v1) (incl. ai.js)
│   │   │   ├── services/       # Business logic (incl. AI services)
│   │   │   └── validators/     # Joi validation schemas
│   │   └── tests/
│   ├── dgfy-migration-runner/  # Sequelize migration domain (one-shot container)
│   ├── dgfy-android-bridge/    # Android hosts for POS hardware (formerly android/)
│   │   └── imin-wrapper/       # iMin WebView wrapper + native printer/drawer bridge
│   ├── dgfy-ims/               # React/Vite IMS (SKUpervisor) app — dev port 5173
│   │   ├── Pages/              # IMS route views (incl. AiChat.jsx, admin/)
│   │   ├── src/main.jsx        # Vite entry point
│   │   └── vite.config.js
│   ├── dgfy-pos/               # React/Vite POS app — dev port 5174
│   │   ├── desktop/pos-electron/  # Electron shell for the POS
│   │   └── src/main.jsx        # Entry point; POS features live in web-core/src/features/pos/
│   └── dgfy-storefront/        # React/Vite customer storefront — dev port 5175
│       └── src/modes/          # Per-workflow-mode storefront surfaces
├── packages/
│   ├── web-core/               # @sieitzz/web-core — shared frontend trunk (no build step)
│   │   ├── Components/
│   │   │   ├── ai/             # AI chat components
│   │   │   ├── items/          # Item forms, lists
│   │   │   ├── products/       # Recipe wizard, product views
│   │   │   └── ui/             # Shadcn UI (Buttons, Inputs, etc.)
│   │   ├── Pages/              # DGFY auth pages only (DgfyAuthPage, RegisterCompany, …)
│   │   ├── src/
│   │   │   ├── lib/            # Utils (formatting, classes)
│   │   │   └── services/       # API wrappers (incl. aiService)
│   │   └── vite/               # Shared Vite helpers (sentryViteConfig, runtime deps)
│   ├── shared-constants/       # Cross-app constant vocabulary
│   └── pos-receipt/            # Receipt rendering shared by POS surfaces
├── docs/                   # Detailed documentation (incl. ai/AI_GUIDELINES.md)
└── CLAUDE.md               # Context file
```

# 🛠️ Common Commands

## Production (PM2 - Recommended)
The project uses PM2 for process management in production:

```bash
# Restart all services (backend + frontend)
pm2 restart all

# View running processes
pm2 list

# View logs
pm2 logs

# Full deployment (pulls code, installs deps, builds, migrates, restarts)
./scripts/deploy.sh

# Remote Deployment Trigger (from local machine)
bash scripts/deploy-remote.sh
```

## Staging (PM2 - Manual)
`staging.dgfy.ph` runs the IMS (SKUpervisor) app against a separate backend.
Staging is **not** deployed by `deploy.sh` — manage it manually.

```bash
# Start staging processes (first time or after ecosystem.config.cjs changes)
pm2 start ecosystem.config.cjs --only sku-staging-backend,sku-staging-frontend --env staging
pm2 save

# Restart staging only
pm2 restart sku-staging-backend sku-staging-frontend

# Verify staging health
curl -fsS http://127.0.0.1:5002/health
curl -fsS http://127.0.0.1:5183
```

Port map: staging backend → `5002`, staging IMS frontend → `5183`.
See `docs/ops/DEPLOYMENT_GUIDE.md` § Staging Environment for full setup runbook.

## Development (Local testing only)
> ⚠️ These commands are for local development only. Use PM2 commands for production.

```bash
# Install dependencies (one-time setup — root + all three frontend apps + api + migration runner)
npm run install:all

# Start dev servers (NOT for production) — API + device bridge + IMS only
npm run dev

# Per-frontend-app dev servers (ports 5173 / 5174 / 5175)
npm run dev:skupervisor    # apps/dgfy-ims   — or: cd apps/dgfy-ims && npm run dev
npm run dev:pos            # apps/dgfy-pos   — or: cd apps/dgfy-pos && npm run dev
npm run dev:store          # apps/dgfy-storefront — or: cd apps/dgfy-storefront && npm run dev

# Builds — there is no `build:all`; build only the app(s) actually affected
npm run build:skupervisor  # → apps/dgfy-ims/dist/
npm run build:pos          # → apps/dgfy-pos/dist/
npm run build:store        # → apps/dgfy-storefront/dist/

# Frontend tests (IMS suite; also runs packages/web-core's own tests)
npm run test:frontend      # or: cd apps/dgfy-ims && npm test
```

`packages/web-core` has no build of its own — it is compiled into each app's build.

## Database
```bash
# Migrations (handled automatically by deploy.sh)
cd apps/dgfy-migration-runner && npx sequelize-cli db:migrate

# Sync tenant schemas (handled automatically by deploy.sh)
node apps/dgfy-api/scripts/sync-tenant-schemas.js
```

# 🔗 Documentation Links
- [Detailed API Spec](docs/api/specification.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Nested Products Guide](docs/features/NESTED_PRODUCTS.md)
- [Quick Reference](docs/reference/QUICK_REFERENCE.md)
- [Store Templates & Profiles (system reference)](docs/features/STORE_TEMPLATES_AND_PROFILES.md)
- [Store Templates Developer Handoff (how to extend)](docs/development/STORE_TEMPLATES_HANDOFF.md)
- [Mode Development Playbook](docs/development/MODE_DEVELOPMENT_PLAYBOOK.md)
```

---

## 📂 Project Structure at a Glance

```
SKU-Inventory-Manager/                    # Monorepo root
├── packages/web-core/                     # @sieitzz/web-core — shared frontend trunk
│   ├── Components/                       # React components by feature (shared by all 3 apps)
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
│   ├── Pages/                            # DGFY auth pages only (the rest moved to dgfy-ims)
│   │   ├── DgfyAuthPage.jsx
│   │   ├── DgfyCompanySelect.jsx
│   │   ├── RegisterCompany.jsx
│   │   └── CompanyRegistrationStatus.jsx
│   ├── src/
│   │   ├── features/                     # Feature modules (pos/, sales/, inventory/, …)
│   │   ├── services/                     # API service layer
│   │   │   ├── api.js                    # Axios instance
│   │   │   ├── itemService.js
│   │   │   ├── userService.js
│   │   │   └── settingsService.js
│   │   └── store/                        # Zustand stores
│   ├── vite/                             # sentryViteConfig.js, webCoreRuntimeDeps.js
│   └── package.json                      # No build step, no node_modules, no lockfile
│
├── apps/dgfy-ims/                         # IMS (SKUpervisor) app — dev port 5173, image dgfy-ims
│   ├── Pages/                            # Page components (routed)
│   │   ├── Dashboard.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Settings.jsx
│   │   └── admin/FeedbackDashboard.jsx   # Admin feedback dashboard
│   ├── src/main.jsx                      # Vite entry point
│   ├── Layout.jsx                        # Main layout wrapper
│   ├── package.json
│   ├── package-lock.json                 # Per-app lockfile
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── index.html
│
├── apps/dgfy-pos/                         # POS app — dev port 5174, image dgfy-pos
│   ├── desktop/pos-electron/             # Electron shell
│   ├── src/main.jsx
│   ├── package.json / package-lock.json
│   ├── vite.config.js
│   └── index.html
│
├── apps/dgfy-storefront/                  # Customer storefront — dev port 5175, image dgfy-storefront
│   ├── src/
│   │   ├── StorefrontApp.jsx
│   │   ├── modes/                        # retail, fnb, services, hospitality, simple
│   │   └── checkout/
│   ├── package.json / package-lock.json
│   ├── vite.config.js
│   └── index.html
│
├── apps/dgfy-api/                         # The app (source of truth; formerly backend/)
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
│   │   │   ├── adminAuthController.js     # Developer portal auth
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
│   │   └── server.js                     # Express app entry
│   ├── .env                              # Environment variables
│   └── package.json
│
├── apps/dgfy-migration-runner/            # Migration domain: migrations/, seeders/, database-setup.sql
│
├── apps/dgfy-android-bridge/              # Android hosts (formerly android/)
│   └── imin-wrapper/                      # iMin WebView wrapper; built via scripts/build-android-release.sh
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
- UserManagement, UserFormModal, PermissionMatrix (granular permission editor)

### Backend API Endpoints

**Authentication:**
- POST `/api/v1/auth/register` - Register new user
- POST `/api/v1/auth/login` - User login
- POST `/api/v1/auth/logout` - User logout
- POST `/api/v1/admin/login` - Developer portal login (hardcoded)
- GET `/api/v1/admin/feedback` - Retrieve user feedback logs

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
> - Validation fix applied in `apps/dgfy-api/src/models/Item.js` line 33

### User
```javascript
{
  user_id, username, email, password_hash,
  full_name, role, permissions, is_master_admin, is_active,
  invitation_token, invitation_expires_at, invited_by, invitation_status,
  deleted_at, deleted_by,  // Soft delete fields for "Remove from Company"
  last_login, created_at, updated_at
}
```

> **User Management Notes**:
> - `role` is a quick preset: `admin`, `manager`, or `staff`
> - `permissions` is a JSON array of granular permission strings (e.g., `["items:view", "items:create"]`)
> - `is_master_admin` grants full system access, bypassing all permission checks
> - **Role Change Auto-Applies Permissions**: When a user's role is changed, their `permissions` array is automatically reset to that role's default permission set
> - Custom permission edits made AFTER a role change will persist until the next role change
> - See `apps/dgfy-api/src/config/permissions.js` for `DEFAULT_ROLE_PERMISSIONS` mapping
>
> **Remove from Company (Soft Delete)**:
> - `deleted_at` marks when a user was removed from the company
> - `deleted_by` tracks who performed the removal (audit trail)
> - Removed users are excluded from user lists and cannot log in
> - Hierarchical access control: Admin > Manager > Staff (can only remove lower roles)
> - Master Admin is always protected and cannot be removed
> - Removed users can be re-invited (creates a new user record)

*See docs/database/schema.md for other entities (PO, JO, StockMovement, Supplier, etc.)*

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5173 in use | IMS dev server — `lsof -ti:5173 \| xargs kill -9` or change the vite port |
| Port 5174 / 5175 in use | POS / storefront dev servers — same fix, `lsof -ti:<port> \| xargs kill -9` |
| Port 5000 in use | `lsof -ti:5000 \| xargs kill -9` |
| Port 5002 or 5183 in use | Staging port conflict — `lsof -ti:5002 \| xargs kill -9` |
| Frontend can't reach backend | Check CORS settings in `apps/dgfy-api/src/server.js` |
| `staging.dgfy.ph` blocked by Vite | Add `staging.dgfy.ph` to `allowedHosts` in `apps/dgfy-ims/vite.config.js` |
| Components not rendering | Check import paths - use `@/components/...` (lowercase; it resolves into `packages/web-core/Components/`) |
| API won't start | Check `.env` file exists in `apps/dgfy-api/` folder |
| Database connection error | Verify MySQL is running, check credentials in `.env` |
| Redis connection error | Ensure Redis is running on port 6379 |

---

## 📖 Documentation References

**Quick Reference:**
- `docs/reference/QUICK_REFERENCE.md` - Common commands and troubleshooting

**Backend Documentation:**
- `apps/dgfy-api/CREDENTIALS.md` - Default admin credentials
- `apps/dgfy-migration-runner/database-setup.sql` - Database setup script
- `apps/dgfy-api/README.md` - Backend-specific documentation

**Root Documentation:**
- `docs/setup/ADMIN_SETUP.md` - Admin user setup guide
- `docs/setup/REDIS_SETUP.md` - Redis installation and configuration
- `docs/setup/QUICK_START.md` - Quick start guide
- `docs/setup/SETUP.md` - Complete setup instructions

**Detailed Specifications (in /docs):**
- `docs/database/schema.md` - Complete table definitions
- `docs/api/specification.md` - All endpoint details
- `docs/api/integration-guide.md` - Frontend-backend integration
- `docs/architecture/system-architecture.md` - System architecture diagrams
- `docs/AI_GUIDELINES.md` - AI Assistant capabilities, limitations, and workflows

---

## 🔗 When You Need More Context

**Working on Frontend Components?**
→ Check `packages/web-core/Components/` (shared by all three apps); app-only surfaces live
under `apps/dgfy-ims/Pages/`, `apps/dgfy-pos/src/`, or `apps/dgfy-storefront/src/`

**Working on Backend API?**
→ Check `apps/dgfy-api/src/routes/` and `apps/dgfy-api/src/controllers/`

**Working on Database Models?**
→ Check `apps/dgfy-api/src/models/` (Sequelize); the frontend has no separate model layer —
normalization lives alongside the callers in `packages/web-core/src/`

**Working on Authentication?**
→ Check `apps/dgfy-api/src/middleware/auth.js` and `apps/dgfy-api/src/services/authService.js`

**Need API Integration?**
→ Check `packages/web-core/src/services/` for the API service layer

**Need Full Specs?**
→ See `docs/` directory

---

## 📝 Notes for Claude Code

- This is a **monorepo**: three frontend apps (`apps/dgfy-ims/`, `apps/dgfy-pos/`, `apps/dgfy-storefront/`) over the shared `packages/web-core/` trunk, plus `apps/dgfy-api/` (the app; formerly `backend/`)
- Always specify which app you're working on (IMS vs POS vs storefront vs web-core vs API)
- Frontend uses alias imports (`@/components/...` → `packages/web-core/Components/`)
- The API (`apps/dgfy-api`) is served on port `5100` (via nginx same-origin `/api`)
- API calls from frontend go to the same-origin `/api/v1` path
- This file is optimized for Claude Code context efficiency
- Detailed specs are linked, not embedded
- Keep context under 1,000 tokens for optimal performance

---

## 📖 How to Navigate Documentation Efficiently

### For Large Files (300+ lines)
1. **Read the Table of Contents first** — Do NOT load the entire file
2. **Use anchor links** to jump to specific sections
3. **Only load what's relevant** to the current task

### Documentation Hierarchy

| Need | Start Here | Then Check |
|------|------------|------------|
| Project context | `CLAUDE.md` | — |
| What was already built | `DEVELOPMENT_HISTORY.md` (TOC) | Specific phase |
| How to run the project | `QUICK_START.md` | `TROUBLESHOOTING.md` |
| API details | `docs/api/specification.md` (TOC) | Specific endpoint |
| Database schema | `docs/database/schema.md` (TOC) | Specific table |
| System architecture | `docs/architecture/system-architecture.md` (TOC) | Specific diagram |
| Frontend integration | `docs/api/integration-guide.md` (TOC) | Specific service |

### Avoiding Duplicate Work

Before implementing a feature, search `DEVELOPMENT_HISTORY.md` for:
- Similar past implementations
- Bug fixes that might be relevant
- Design decisions that were already made

### Files with Table of Contents

These files have TOCs for efficient navigation:
- `DEVELOPMENT_HISTORY.md` — Project phases and history
- `docs/api/specification.md` — API endpoints
- `docs/api/integration-guide.md` — Frontend-backend integration
- `docs/database/schema.md` — Database tables
- `docs/architecture/system-architecture.md` — System diagrams
- `TROUBLESHOOTING.md` — Error solutions
