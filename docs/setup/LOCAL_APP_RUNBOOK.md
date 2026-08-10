# Local App Runbook

This runbook documents the required local services, startup order, commands, and
ports for running SKU Inventory Manager with IMS/SKUpervisor, POS, Storefront,
backend API, and the POS device bridge.

## Prerequisites

- Node.js 18+ and npm 9+
- MySQL 8.0+ running locally, or XAMPP MySQL on Windows
- Redis 7.0+ recommended for cache/session paths
- Git
- Project dependencies installed:

```bash
npm run install:all
```

- Backend environment file:

```bash
cd apps/dgfy-api
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env`.

Minimum backend `.env` values for local development:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sku_inventory_manager
DB_USER=root
DB_PASSWORD=
JWT_SECRET=replace-with-at-least-32-characters
REFRESH_TOKEN_SECRET=replace-with-at-least-32-characters
REDIS_URL=redis://localhost:6379
DB_AUTO_SYNC=false
PAYMENTS_ENABLED=false
```

Minimum frontend `.env` values from repo root or `apps/dgfy-web/.env`:

```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_PROXY_TARGET=http://127.0.0.1:5000
VITE_API_BASE_URL=http://127.0.0.1:5000
VITE_PAYMENTS_ENABLED=false
VITE_SUBSCRIPTIONS_ENABLED=false
VITE_STORE_BASE_PATH=/
```

## First-Time Database Setup

Start MySQL first, then run:

```bash
cd apps/dgfy-migration-runner
npm run migrate
npm run seed
cd ../..
npm run doctor:runtime
```

Expected runtime doctor result: healthy schema with no missing migrations or
columns. Keep `DB_AUTO_SYNC=false`; use migrations for schema changes.

## Local Startup Commands

For the complete local POS stack from repo root:

```bash
npm run dev:local-pos-stack
```

This starts:

- backend API
- POS device bridge
- IMS/SKUpervisor app
- POS app
- Storefront app

For the lighter default stack:

```bash
npm run dev
```

This starts backend API, POS device bridge, and the default frontend dev server.

To run each service manually from repo root:

```bash
npm run dev:backend
npm run dev:device-bridge
npm run dev:skupervisor
npm run dev:pos
npm run dev:store
```

## Local Port Map

| Service | Default Port | URL / Host | Command |
|---|---:|---|---|
| Backend API | 5000 | http://localhost:5000 | `npm run dev:backend` |
| Backend API base path | 5000 | http://localhost:5000/api/v1 | `npm run dev:backend` |
| Backend health | 5000 | http://localhost:5000/health | `npm run dev:backend` |
| POS device bridge | 5101 | http://127.0.0.1:5101/health | `npm run dev:device-bridge` |
| IMS/SKUpervisor frontend | 5173 | http://localhost:5173 | `npm run dev:skupervisor` |
| POS frontend | 5174 | http://localhost:5174 | `npm run dev:pos` |
| Storefront frontend | 5175 | http://localhost:5175/map-dgfy | `npm run dev:store` |
| Tenant storefront page | 5175 | http://localhost:5175/<slug> | `npm run dev:store` |
| MySQL | 3306 | localhost:3306 | XAMPP/MySQL service |
| Redis | 6379 | redis://localhost:6379 | Redis service |
| phpMyAdmin with XAMPP | 80 | http://localhost/phpmyadmin | Apache + MySQL in XAMPP |

If a Vite port is already busy, stop the existing process instead of accepting
an auto-incremented port when testing cross-surface behavior. The backend CORS
and frontend API defaults assume ports `5173`, `5174`, and `5175`.

## Startup Verification

Run these checks after startup:

```bash
curl http://localhost:5000/health
curl http://127.0.0.1:5101/health
```

Open these browser URLs:

- IMS/SKUpervisor: `http://localhost:5173`
- POS: `http://localhost:5174`
- Storefront discovery: `http://localhost:5175/map-dgfy`

Then run backend runtime checks (from repo root):

```bash
npm run doctor:runtime
npm run smoke:pos-local
```

## Troubleshooting

- Port in use: run `netstat -ano | findstr :<port>` on Windows, then stop the
  owning process if it is stale.
- Backend cannot connect to MySQL: start XAMPP MySQL and verify `DB_*` values.
- Frontend cannot reach API: verify backend health and `VITE_PROXY_TARGET`.
- POS device bridge unavailable: verify port `5101`, `DEVICE_BRIDGE_BASE_URL`,
  and optional `DEVICE_BRIDGE_API_KEY` alignment. The bridge is optional
  (ADR 0053) — `GET /pos/device/status` returns `200` when
  `DEVICE_BRIDGE_ENABLED` is unset/`false`, and only returns `503` when the
  bridge is enabled but unreachable. Set `DEVICE_BRIDGE_ENABLED=true` (and
  optionally `POS_DEVICE_DRIVER=lan_escpos_bridge` to force it) once the
  bridge process is actually running.
- Storefront images or uploads fail: ensure Vite proxies both `/api` and
  `/uploads` to `http://127.0.0.1:5000`.
- Testing a POS/hardware change on a real iMin device before merging: build a
  `dev` or `staging`-flavored APK off your branch via the **Build Android
  Release (manual)** GitHub Actions workflow (or
  `bash scripts/build-android-release.sh dev`), which installs alongside the
  production app without overwriting it. See
  `apps/dgfy-android-bridge/imin-wrapper/README.md` for the full flavor table and rollback
  steps.
