# SKU Inventory Manager - Setup Guide

This guide will help you set up and run the SKU Inventory Manager project locally.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MySQL** 8.0+ ([Download](https://dev.mysql.com/downloads/mysql/))
- **npm** (comes with Node.js) or **yarn**
- **Git** (for cloning the repository)

## Quick Start (Option 1: Using Docker)

If you have Docker installed, this is the easiest way to run the entire stack:

The compose file lives in `infrastructure/docker/`:

```bash
cd infrastructure/docker

# Start all services (MySQL, Redis, migration runner, API,
# dgfy-ims, dgfy-pos, dgfy-storefront, nginx)
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

The three frontend surfaces are three separate images
(`ghcr.io/sieitzz/dgfy-platform/dgfy-ims`, `.../dgfy-pos`,
`.../dgfy-storefront`, built from `infrastructure/docker/<app>/Dockerfile`),
listening on `8081`, `8082`, and `8083` respectively inside the compose network
and reached through the bundled `nginx` service on `80`/`443`.

> There is no `backend/`, `frontend/`, or `android/` directory at the repo root — the
> project moved to an `apps/` layout (`apps/dgfy-api`, `apps/dgfy-migration-runner`,
> `apps/dgfy-android-bridge`, plus the three frontend apps `apps/dgfy-ims`,
> `apps/dgfy-pos`, `apps/dgfy-storefront`). See
> [docs/architecture/apps-layout-migration.md](../architecture/apps-layout-migration.md)
> for the full path map, and
> [ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md) for the
> frontend split that replaced the single `apps/dgfy-web` package.
> `npm run install:all` from the repo root installs all of them.

## Manual Setup (Option 2: Local Development)

### Step 1: Backend Setup

1. **Navigate to the API directory**
   ```bash
   cd apps/dgfy-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your configuration:
   - Update `DB_PASSWORD` with your MySQL password
   - Update `JWT_SECRET` and `REFRESH_TOKEN_SECRET` with secure random strings
   - Adjust other settings as needed
   
   **Required Environment Variables:**
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database configuration
   - `JWT_SECRET`, `REFRESH_TOKEN_SECRET` - JWT token secrets (use strong random strings)
   - `CORS_ORIGIN` - Frontend URL for CORS
   
   **Optional Environment Variables:**
   - `REDIS_URL` - Redis connection URL (for caching, optional)
   - `RATE_LIMIT_*` - Rate limiting configuration
   - `LOG_LEVEL` - Logging level (info, debug, error, etc.)

4. **Start MySQL Server**
   - Make sure MySQL is running on your system
   - Default port: 3306

5. **Initialize Database**

   Migrations and seeders live in the separate `apps/dgfy-migration-runner` package, not
   `apps/dgfy-api`:
   ```bash
   # Create database manually
   mysql -u root -p
   CREATE DATABASE sku_inventory_manager;

   # From the repo root, run migrations
   cd apps/dgfy-migration-runner
   npm run migrate

   # Run seeders (optional)
   npm run seed
   ```

6. **Start the backend server**
   ```bash
   cd apps/dgfy-api
   npm run dev
   ```
   The backend will start on `http://localhost:5000`

### Step 3: Frontend Setup

There are three frontend apps, each an independent npm package with its own
lockfile:

| App | Directory | Dev port | Root dev script | Root build script |
|---|---|---:|---|---|
| IMS/SKUpervisor | `apps/dgfy-ims` | 5173 | `npm run dev:skupervisor` | `npm run build:skupervisor` |
| POS | `apps/dgfy-pos` | 5174 | `npm run dev:pos` | `npm run build:pos` |
| Storefront | `apps/dgfy-storefront` | 5175 | `npm run dev:store` | `npm run build:store` |

All three consume shared source from `packages/web-core` (`@sieitzz/web-core`)
via `file:../../packages/web-core` plus a `@sieitzz/web-core/*` Vite alias. That
package has no build step, no `node_modules`, and no lockfile of its own — there
is nothing to install for it.

1. **Navigate to the app you're working on**
   ```bash
   cd apps/dgfy-ims          # or apps/dgfy-pos, apps/dgfy-storefront
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables (Optional)**

   IMS ships a committed example; POS and Storefront use a local-only
   `.env.local`:
   ```bash
   cp .env.example .env      # apps/dgfy-ims only
   ```

   Edit the env file if needed (defaults work for local development):
   ```env
   VITE_API_URL=http://localhost:5000/api/v1
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   IMS starts on `http://localhost:5173`, POS on `5174`, Storefront on `5175`.

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd apps/dgfy-api
npm run dev
```

**Terminal 2 - Frontend (one terminal per app you need):**
```bash
cd apps/dgfy-ims          # or apps/dgfy-pos, apps/dgfy-storefront
npm run dev
```

Or, from the repo root, run the backend, device bridge, and IMS together:
```bash
npm run dev
```

Or the full stack including POS and Storefront:
```bash
npm run dev:local-pos-stack
```

### Production Mode

**Backend:**
```bash
cd apps/dgfy-api
npm start
```

**Frontend** — build each app separately; there is no `build:all` script:
```bash
cd apps/dgfy-ims && npm run build && npm run preview
cd apps/dgfy-pos && npm run build && npm run preview
cd apps/dgfy-storefront && npm run build && npm run preview
```

Each app builds into its own `apps/<app>/dist/`. Build only the apps a change
actually affects; a change under `packages/web-core` affects all three.

## Accessing the Application

Once both servers are running:

- **IMS/SKUpervisor**: http://localhost:5173
- **POS**: http://localhost:5174
- **Storefront**: http://localhost:5175
- **Backend API**: http://localhost:5000/api/v1
- **Health Check**: http://localhost:5000/health (includes database and Redis status)

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout

### Items
- `GET /api/v1/items` - Get all items
- `GET /api/v1/items/:item_id` - Get item by ID
- `POST /api/v1/items` - Create new item
- `PUT /api/v1/items/:item_id` - Update item
- `DELETE /api/v1/items/:item_id` - Delete item

### Other Endpoints
See `docs/api/specification.md` for complete API documentation.

## Troubleshooting

### Backend Issues

**Database Connection Error:**
- Verify MySQL is running: `mysql -u root -p`
- Check database credentials in `apps/dgfy-api/.env`
- Ensure database exists: `CREATE DATABASE sku_inventory_manager;`

**Port Already in Use:**
- Change `PORT` in `apps/dgfy-api/.env`
- Or stop the process using port 5000

**Migration Errors:**
- Ensure the database exists, then run migrations from `apps/dgfy-migration-runner` (see
  "Manual Database Operations" below)
- Use `npm run migrate:undo` (from `apps/dgfy-migration-runner`) to rollback the last
  migration
- Check MySQL user has CREATE TABLE permissions
- Verify database credentials in `apps/dgfy-api/.env`

### Frontend Issues

**API Connection Error:**
- Verify backend is running on port 5000
- Check `VITE_API_URL` in the affected app's env file (`apps/dgfy-ims/.env`,
  `apps/dgfy-pos/.env.local`, or `apps/dgfy-storefront/.env.local`) matches the
  backend URL
- Check browser console for CORS errors

**Build Errors:**
- From inside the affected app directory, delete `node_modules` and reinstall:
  `rm -rf node_modules && npm install` (never delete the app's
  `package-lock.json` — each app has its own, and regenerating it pulls in
  unrelated version drift)
- Clear Vite cache: `rm -rf node_modules/.vite`
- Unresolved `@sieitzz/web-core/...` imports usually mean the `file:` dependency
  is not linked — rerun `npm install` in that app

## Database Management

Migrations, seeders, and the raw SQL bootstrap file live in `apps/dgfy-migration-runner`,
not `apps/dgfy-api` — the API package deliberately has no migration CLI. There is no
automated `setup:db`/`reset:db` script; use the manual steps below.

**Run Migrations**
```bash
cd apps/dgfy-migration-runner
npm run migrate
```

**Rollback Last Migration**
```bash
cd apps/dgfy-migration-runner
npm run migrate:undo
```

**Create New Migration**
```bash
cd apps/dgfy-migration-runner
npm run migrate:create -- --name migration_name
```

**Run Seeders**
```bash
cd apps/dgfy-migration-runner
npm run seed
```

### Viewing Logs
```bash
cd apps/dgfy-api

# View combined logs (real-time)
npm run logs:view

# Or manually view log files
cat logs/combined.log
cat logs/error.log
```

## Project Structure

```
SKU-Inventory-Manager/
├── apps/
│   ├── dgfy-api/                 # Backend API (Node.js/Express)
│   │   ├── src/
│   │   │   ├── config/           # Database & app configuration
│   │   │   ├── models/           # Sequelize models
│   │   │   ├── routes/           # API routes
│   │   │   ├── controllers/      # Request handlers
│   │   │   ├── services/         # Business logic
│   │   │   └── server.js         # Entry point
│   │   └── package.json
│   ├── dgfy-migration-runner/    # Sequelize migrations, seeders, DB bootstrap
│   │   ├── migrations/
│   │   ├── src/seeders/
│   │   └── package.json
│   ├── dgfy-ims/                 # IMS/SKUpervisor frontend (React/Vite)
│   │   ├── src/main.jsx          # Entry point
│   │   ├── Pages/                # IMS-only pages
│   │   └── package.json
│   ├── dgfy-pos/                 # POS frontend (React/Vite)
│   │   ├── src/main.jsx          # Entry point
│   │   ├── desktop/pos-electron/ # Electron shell
│   │   └── package.json
│   └── dgfy-storefront/          # Public storefront frontend (React/Vite)
│       ├── src/main.jsx          # Entry point
│       └── package.json
├── packages/
│   └── web-core/                 # @sieitzz/web-core - shared, source-only
│       ├── src/
│       │   ├── services/         # API service layer
│       │   ├── hooks/            # React hooks
│       │   └── store/            # State management (Zustand)
│       ├── Components/           # Shared components
│       ├── Pages/                # DGFY-auth pages shared by all three apps
│       └── vite/                 # Shared Vite config helpers
└── package.json
```

## Next Steps

1. **Create your first user** via the registration endpoint
2. **Explore the API** using the health check endpoint
3. **Read the documentation** in `/docs` folder
4. **Check the API specification** at `docs/api/specification.md`

## Need Help?

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common errors
- See [PREREQUISITES.md](PREREQUISITES.md) for local vs hosting setup
- Check the documentation in `/docs`
- Review the API specification at `docs/api/specification.md`
- Check the database schema at `docs/database/schema.md`
