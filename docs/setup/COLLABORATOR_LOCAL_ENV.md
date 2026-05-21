---
status: reference
authority_level: reference
owner: setup
last_reviewed: 2026-05-04
applies_to: local_development
topic: collaborator_environment_setup
---

# Collaborator Local Environment

Use this file to help a GitHub collaborator run the project locally.

Production/live credentials are intentionally not included. The local and test/sandbox values below are enough for normal development setup.

## Required Software

- Git
- Node.js 18+
- npm 9+
- MySQL 8.0+
- Redis 7.0+ recommended. Shared-hosting profile work can run without Redis when configured intentionally.
- Docker optional

## Install Dependencies

From the repository root:

```bash
npm run install:all
```

## Quick Start Guide

Use this order for a clean first-time setup.

### 1. Clone The Repository

```bash
git clone <repo-url>
cd SKU-Inventory-Manager
```

### 2. Install Dependencies

```bash
npm run install:all
```

This installs dependencies for:

- Repository root
- `backend`
- `frontend`

### 3. Create Environment Files

Backend:

```bash
cd backend
cp .env.example .env
```

Frontend:

```bash
cd ../frontend
cp .env.example .env
```

Then copy the environment values from the sections below into those files.

### 4. Start MySQL

If using XAMPP, start MySQL from the XAMPP control panel.

If using local MySQL, make sure it is running on:

```text
localhost:3306
```

If using Docker only for MySQL and Redis:

```bash
docker compose up -d mysql redis
```

### 5. Create The Database

From the repository root:

```bash
mysql -u root -p < backend/database-setup.sql
```

For a default XAMPP MySQL install with no root password, this may work:

```bash
mysql -u root < backend/database-setup.sql
```

### 6. Run Migrations

```bash
cd backend
npm run migrate
npm run doctor:runtime
```

The runtime doctor should report a healthy schema before starting the app.

### 7. Start Redis

If Redis is installed locally:

```bash
redis-cli ping
```

Expected:

```text
PONG
```

If Redis is not installed locally, use Docker:

```bash
docker run -d --name sku-redis -p 6379:6379 redis:7-alpine
```

### 8. Start The App

From the repository root:

```bash
npm run dev
```

This starts backend and frontend together.

For separate terminals:

```bash
npm run dev:backend
npm run dev:skupervisor
npm run dev:pos
npm run dev:store
```

### 9. Open The Local Apps

- Skupervisor: `http://localhost:5173/`
- POS: `http://localhost:5174/`
- Storefront discovery: `http://localhost:5175/tenant-store`
- Backend health: `http://localhost:5000/health`

### 10. Verify Login/API Readiness

Run:

```bash
npm run doctor:runtime
```

Then check:

```text
GET http://localhost:5000/health
GET http://localhost:5000/api/v1/auth/validate-token/token-original
```

For local tenant login tests, use:

```text
x-company-token: token-original
email: admin@test.com
password: Admin123!
```

If login data is missing, ask the project owner for a database dump or seed path for the local development account.

## Backend Environment

Create `backend/.env` from the backend folder:

```bash
cp .env.example .env
```

Use this local development configuration:

```env
# Application Environment
NODE_ENV=development
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=root
DB_PASSWORD=
DB_DIALECT=mysql
DB_AUTO_SYNC=false

# JWT Configuration
JWT_SECRET=CHANGE_THIS_TO_A_STRONG_SECRET_AT_LEAST_32_CHARACTERS_LONG
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=CHANGE_THIS_TO_A_DIFFERENT_STRONG_SECRET_AT_LEAST_32_CHARACTERS_LONG
REFRESH_TOKEN_EXPIRY=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Optional local auth/rate-limit behavior
# TRUST_PROXY=false
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100
# RATE_LIMIT_AUTH_WINDOW_MS=900000
# RATE_LIMIT_AUTH_MAX_REQUESTS=5
# DISABLE_RATE_LIMIT=false

# Email Configuration for test invitations and notifications
# Gmail requires an App Password here; a normal Gmail password will fail.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=SKUpervisor

# Production delivery currently depends on resolving Brevo SMTP connectivity
# or adding Brevo HTTPS API delivery. Local invites can still be validated with
# manual-link delivery when SMTP is unavailable.

# Application URL used for email links
APP_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Storefront defaults for newly activated tenants
STOREFRONT_DEFAULT_LOCATION_NAME=Main Branch
STOREFRONT_DEFAULT_LOCATION_ADDRESS=Iloilo City
STOREFRONT_DEFAULT_LATITUDE=10.699817
STOREFRONT_DEFAULT_LONGITUDE=122.559893
STOREFRONT_DEFAULT_DELIVERY_RADIUS_KM=5
STOREFRONT_DEFAULT_WAIT_MINUTES=15

# Payments are off by default for local development
PAYMENTS_ENABLED=false

# Tenant registration defaults to auto-standard activation; set manual only for admin-review rollback tests.
TENANT_REGISTRATION_APPROVAL_MODE=auto_standard

# Customer Access Mode runtime enforcement is on by default.
# Set this to false only for explicit rollback testing.
CUSTOMER_ACCESS_MODES_ENABLED=true
CUSTOMER_ACCESS_MODES_ENABLED_TENANTS=

# PayMongo test/sandbox values from the local development env
PAYMONGO_MODE=test
PAYMONGO_PUBLIC_KEY=pk_test_your_public_key_here
PAYMONGO_SECRET_KEY=sk_test_your_secret_key_here
PAYMONGO_WEBHOOK_SECRET=whsk_your_webhook_secret_here
PAYMONGO_STANDARD_PLAN_ID=source_xxx_standard
PAYMONGO_PREMIUM_PLAN_ID=source_xxx_premium
PAYMONGO_TEST_PUBLIC_KEY=pk_test_your_public_key_here
PAYMONGO_TEST_SECRET_KEY=sk_test_your_secret_key_here
```

Generate stronger local JWT secrets if preferred:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Frontend Environment

Create `frontend/.env` from the frontend folder:

```bash
cp .env.example .env
```

Use this local development configuration:

```env
VITE_API_URL=/api/v1

# Optional explicit backend origin for store runtime and assets
VITE_API_BASE_URL=http://127.0.0.1:5000
VITE_PROXY_TARGET=http://127.0.0.1:5000

# Payments/subscriptions are off for normal local development
VITE_PAYMENTS_ENABLED=false
VITE_SUBSCRIPTIONS_ENABLED=false

# Store app base path. Keep "/" locally.
# VITE_STORE_BASE_PATH=/
```

`frontend/.env.development` currently only needs:

```env
VITE_API_URL=/api/v1
```

## Omitted Production/Live Credentials

These values exist in local files but must not be shared in this document:

- `PAYMONGO_LIVE_PUBLIC_KEY`
- `PAYMONGO_LIVE_SECRET_KEY`
- `VITE_PAYPAL_CLIENT_ID_LIVE`
- `VITE_PAYPAL_STANDARD_PLAN_ID_LIVE`
- `VITE_PAYPAL_PREMIUM_PLAN_ID_LIVE`
- `VITE_PAYPAL_PLAN_ID_LIVE`
- Production SSH host/user/port values from `.env.qa.local`
- Any real production database username/password

If the collaborator needs live or production access, send those credentials through a password manager or another secure channel, not through GitHub.

## Database Setup

The database name is:

```text
sku_inventory_manager
```

Create it with:

```bash
mysql -u root -p < backend/database-setup.sql
```

The SQL file contains:

```sql
CREATE DATABASE IF NOT EXISTS sku_inventory_manager
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

SHOW DATABASES LIKE 'sku_inventory_manager';
```

Then run migrations:

```bash
cd backend
npm run migrate
npm run doctor:runtime
```

The project includes seeders under `backend/src/seeders`, including the local admin account and starter settings. Run seeders only after migrations are healthy:

```bash
cd backend
npm run seed
```

## Redis

Redis is used for caching and token blacklist behavior.

Local Redis URL:

```env
REDIS_URL=redis://localhost:6379
```

Docker Redis option:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Check Redis:

```bash
redis-cli ping
```

Expected:

```text
PONG
```

## Run The App

From the repository root:

```bash
npm run dev
```

Or run services separately:

```bash
npm run dev:backend
npm run dev:skupervisor
npm run dev:pos
npm run dev:store
```

Local URLs:

- Backend health: `http://localhost:5000/health`
- Backend API: `http://localhost:5000/api/v1`
- Skupervisor app: `http://localhost:5173/`
- POS app: `http://localhost:5174/`
- Storefront discovery: `http://localhost:5175/tenant-store`
- Tenant storefront page: `http://localhost:5175/tenant-store/<slug>`

## Current Feature Flags And Rollout Defaults

Use production-safe defaults for local setup unless a test specifically needs different behavior:

```env
TENANT_REGISTRATION_APPROVAL_MODE=auto_standard
CUSTOMER_ACCESS_MODES_ENABLED=true
CUSTOMER_ACCESS_MODES_ENABLED_TENANTS=
PAYMENTS_ENABLED=false
```

Customer Access Mode and Inventory Display settings are enforced by default for public Storefront behavior. Set `CUSTOMER_ACCESS_MODES_ENABLED=false` only for rollback testing; when rollback is active, `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` can re-enable selected tenants.

Services Mode is a first-class workflow mode. It uses normal migrations and does not require a separate setup script, but collaborators should run `npm run doctor:runtime` after migration so service booking, waitlist, reminder, and discovery-index tables are verified.

## Hosting Profile Env Examples

Use the profile-specific examples when testing deployment behavior:

- `backend/.env.shared.example` for shared hosting without Redis.
- `backend/.env.vps.example` for Redis-capable VPS deployments.
- `frontend/.env.shared.example` and `frontend/.env.vps.example` for matching frontend builds.

Shared hosting intentionally omits Redis and uses fail-open blacklist behavior. VPS mode expects Redis and fail-closed blacklist behavior.

## Docker Option

From the repository root:

```bash
docker-compose up -d
```

The current Docker compose file starts:

- MySQL 8.0 on `localhost:3306`
- Redis 7 on `localhost:6379`
- Backend on `localhost:5000`
- Frontend on `localhost:80`

Docker database credentials:

```env
DB_HOST=mysql
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=root
DB_PASSWORD=rootpassword
REDIS_URL=redis://redis:6379
```

## Smoke Checks

After setup:

```bash
npm run doctor:runtime
```

Expected result:

```text
status=healthy missing_migrations=0 missing_columns=0
```

Then check:

- `GET http://localhost:5000/health`
- `GET http://localhost:5000/api/v1/auth/validate-token/token-original`

Optional POS smoke test:

```bash
npm run smoke:pos-local
```

## Important Notes

- Keep `DB_AUTO_SYNC=false` for shared/local development.
- Use migrations for schema changes.
- Do not commit `backend/.env`, `frontend/.env`, `.env.qa.local`, or `.env.prod.local`.
- `backend/uploads` is runtime-generated. Only `backend/uploads/.gitkeep` is source-controlled.
- Vite must proxy both `/api` and `/uploads` to the backend for uploaded images to render in local frontend surfaces.

## First-Run Troubleshooting Guide

### Backend Cannot Connect To MySQL

Check:

- MySQL is running.
- `DB_HOST=localhost`.
- `DB_PORT=3306`.
- `DB_NAME=sku_inventory_manager`.
- `DB_USER` and `DB_PASSWORD` match the local MySQL account.

For XAMPP defaults, this is usually:

```env
DB_USER=root
DB_PASSWORD=
```

### Database Exists But Tables Are Missing

Run:

```bash
cd backend
npm run migrate
npm run doctor:runtime
```

Do not fix this by setting `DB_AUTO_SYNC=true`. Keep schema changes migration-driven.

### Redis Connection Warning

For local development, Redis can usually be started with:

```bash
docker run -d --name sku-redis -p 6379:6379 redis:7-alpine
```

If the container already exists:

```bash
docker start sku-redis
```

### Frontend Cannot Reach API

Check:

- Backend is running on `http://localhost:5000`.
- `frontend/.env` has `VITE_API_URL=/api/v1`.
- `VITE_PROXY_TARGET=http://127.0.0.1:5000` is set if proxy behavior is needed.
- Restart the frontend after changing `.env`.

### Uploaded Images Do Not Render

The frontend must proxy `/uploads` to the backend.

Check:

- Backend is running.
- Uploaded files exist under `backend/uploads`.
- Frontend dev server has been restarted after env/config changes.
- Browser cache has been hard-refreshed.

### Port Already In Use

Common ports:

- Backend: `5000`
- Skupervisor: `5173`
- POS: `5174`
- Storefront: `5175`
- MySQL: `3306`
- Redis: `6379`

On Windows, find the process:

```powershell
netstat -ano | findstr :5000
```

Then stop it:

```powershell
taskkill /PID <PID> /F
```

### Migrations Fail

Check:

- The database exists.
- MySQL credentials are correct.
- The MySQL user can create and alter tables.
- `backend/.env` is present.

Then retry:

```bash
cd backend
npm run migrate
```

### Clean Local Reset

Only use this for local development when data loss is acceptable:

```bash
cd backend
npm run reset:db
npm run doctor:runtime
```

If prompted, confirm only when you are sure the local database can be recreated.
