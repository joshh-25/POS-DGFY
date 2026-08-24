# Quick Start Guide - Running the Project

This guide will help you run the SKU Inventory Manager project locally.

For the complete local port map and multi-surface startup runbook, see
`docs/setup/LOCAL_APP_RUNBOOK.md`.

## Prerequisites Check

Before starting, ensure:
- ✅ **XAMPP MySQL is running** (Start MySQL from XAMPP Control Panel)
- ✅ **Database is created** (Already done - `sku_inventory_manager`)
- ✅ **Migrations are run** (Already done - all tables created)
- ✅ **Backend dependencies installed** (Already done)
- ✅ **Frontend dependencies installed** (Already done)
- ✅ **Backend .env file exists** (Already created)

---

## Step-by-Step: Running the Project

### Step 1: Start MySQL (XAMPP)

1. Open **XAMPP Control Panel**
2. Click **Start** button next to **MySQL**
3. Wait until MySQL status shows as **Running** (green)

**Verify MySQL is running:**
- Status should show "Running" in XAMPP Control Panel
- Or check: http://localhost/phpmyadmin (should load)

---

### Step 2: Start Backend Server

Open **Terminal 1** (Command Prompt, Git Bash, or VS Code Terminal):

```bash
cd apps/dgfy-api
npm run dev
```

**Expected Output:**
```
✅ Database connection established successfully.
🚀 Server running on port 5000
📝 Environment: development
🌐 API Base URL: http://localhost:5000/api/v1
```

**Keep this terminal open** - the backend server must stay running.

**If you see database connection errors:**
- Verify MySQL is running in XAMPP
- Check `apps/dgfy-api/.env` has correct credentials (see `apps/dgfy-api/CREDENTIALS.md`)

---

### Step 3: Start a Frontend Server

There are three separate frontend apps. Start the one you need in its own
terminal:

| App | Directory | Port | From repo root |
|---|---|---:|---|
| IMS/SKUpervisor | `apps/dgfy-ims` | 5173 | `npm run dev:skupervisor` |
| POS | `apps/dgfy-pos` | 5174 | `npm run dev:pos` |
| Storefront | `apps/dgfy-storefront` | 5175 | `npm run dev:store` |

Open **Terminal 2** (new terminal window) — IMS/SKUpervisor shown here:

```bash
cd apps/dgfy-ims
npm run dev
```

**Expected Output:**
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this terminal open** - the frontend server must stay running.

All three apps share `packages/web-core` (`@sieitzz/web-core`) as source; it has
no build or dev server of its own, so edits there are picked up by whichever
app's dev server is running.

---

### Step 4: Access the Application

Once both servers are running:

1. **Frontend Application:**
   - IMS/SKUpervisor: http://localhost:5173
   - POS: http://localhost:5174
   - Storefront: http://localhost:5175/map-dgfy
   - The React application should load

2. **Backend API Health Check:**
   - Open browser: http://localhost:5000/health
   - Should return: `{"success":true,"message":"Server is running",...}`

3. **API Base URL:**
   - http://localhost:5000/api/v1

---

## Running in Development Mode (Summary)

You need at least **2 terminal windows** running simultaneously — one for the
backend, one per frontend app you're working on:

**Terminal 1 - Backend:**
```bash
cd apps/dgfy-api
npm run dev
```

**Terminal 2 - Frontend (pick the app you're working on):**
```bash
cd apps/dgfy-ims          # or apps/dgfy-pos, apps/dgfy-storefront
npm run dev
```

**All of these terminals must stay open** while you're developing.

To run the backend, device bridge, and all three frontend apps at once, use the
repo-root script instead:

```bash
npm run dev:local-pos-stack
```

---

## 🤖 Antigravity "Turbo" Shortcuts (Recommended)

If you are working with the Antigravity AI assistant, you can skip manual terminal management using these commands:

1. **`/sync`**: Run this first to ensure all dependencies are installed everywhere.
2. **`/start-dev`**: Replaces the "2 Terminals" manual setup. It starts both frontend and backend in the background using PM2 and streams the logs.
3. **`/health`**: Run this any time to verify services are running correctly.

---

## Optional: Frontend Environment Configuration

The frontend apps work with default settings, but each one can take its own env
file for customization:

- `apps/dgfy-ims/.env` (copy from the committed `apps/dgfy-ims/.env.example`)
- `apps/dgfy-pos/.env.local`
- `apps/dgfy-storefront/.env.local`

```env
VITE_API_URL=http://localhost:5000/api/v1
```

This is optional - the frontend already defaults to `http://localhost:5000/api/v1` if not specified.

---

## Troubleshooting

### Backend Won't Start

**Problem:** Database connection error
```
❌ Unable to connect to the database
```

**Solutions:**
1. Verify MySQL is running in XAMPP Control Panel
2. Check `apps/dgfy-api/.env` file exists and has correct credentials
3. Verify database exists: Open phpMyAdmin → Check if `sku_inventory_manager` database exists
4. Test connection manually: Try accessing http://localhost/phpmyadmin

**Problem:** Port 5000 already in use
```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solutions:**
1. Find and stop the process using port 5000:
   ```bash
   # Windows
   netstat -ano | findstr :5000
   taskkill /PID <PID> /F
   ```
2. Or change port in `apps/dgfy-api/.env`: `PORT=5001` (then update frontend API URL)

---

### Frontend Won't Start

**Problem:** Port 5173 already in use

**Solutions:**
1. Stop the process using port 5173. Do **not** let Vite auto-increment onto
   5174/5175 — those belong to the POS and Storefront apps, and the backend
   CORS defaults assume the fixed 5173/5174/5175 assignment.
2. Or specify a different, unused port: `npm run dev -- --port 3000`

**Problem:** Cannot connect to backend API

**Solutions:**
1. Verify backend is running (check Terminal 1)
2. Test backend health: http://localhost:5000/health
3. Check browser console for CORS errors
4. Verify `VITE_API_URL` in frontend `.env` matches backend URL

---

### Database Issues

**Problem:** Tables don't exist

**Solution:** Run migrations:
```bash
cd apps/dgfy-migration-runner
npm run migrate
```

**Problem:** System settings missing

**Solution:** Run seeders:
```bash
cd apps/dgfy-migration-runner
npm run seed
```

---

## Stopping the Application

To stop the application:

1. **Stop Frontend:** In Terminal 2, press `Ctrl + C`
2. **Stop Backend:** In Terminal 1, press `Ctrl + C`
3. **Stop MySQL (Optional):** In XAMPP Control Panel, click **Stop** next to MySQL

---

## Quick Reference

| Service | Port | URL | Status Check |
|---------|------|-----|--------------|
| IMS/SKUpervisor Frontend | 5173 | http://localhost:5173 | Open in browser |
| POS Frontend | 5174 | http://localhost:5174 | Open in browser |
| Storefront Frontend | 5175 | http://localhost:5175/map-dgfy | Open in browser |
| Backend API | 5000 | http://localhost:5000/api/v1 | http://localhost:5000/health |
| POS Device Bridge | 5101 | http://127.0.0.1:5101 | http://127.0.0.1:5101/health |
| MySQL | 3306 | localhost:3306 | XAMPP Control Panel |
| Redis | 6379 | redis://localhost:6379 | Redis CLI/service status |
| phpMyAdmin | 80 | http://localhost/phpmyadmin | Open in browser |

The POS Device Bridge is optional (ADR 0053). POS checkout, receipt preview,
and the iMin native printer path all work without it. Set
`DEVICE_BRIDGE_ENABLED=true` in `apps/dgfy-api/.env` to have the backend dispatch
print/drawer actions to it; leave it unset/`false` (the default) to run
without any LAN-attached printer. See `POS_DEVICE_DRIVER` in
`apps/dgfy-api/device-bridge/README.md` for the full driver override options.

---

## Next Steps After Starting

1. **Register a User:**
   - Use the registration endpoint or UI
   - `POST /api/v1/auth/register`

2. **Login:**
   - Use the login endpoint or UI
   - `POST /api/v1/auth/login`

3. **Explore the Application:**
   - Dashboard
   - Items Management
   - Suppliers
   - Purchase Orders
   - Job Orders
   - Reports

---

## Production Build (Optional)

To build for production:

**Backend:**
```bash
cd apps/dgfy-api
npm start
```

**Frontend** — build each app separately; there is no `build:all`:
```bash
cd apps/dgfy-ims && npm run build && npm run preview
cd apps/dgfy-pos && npm run build && npm run preview
cd apps/dgfy-storefront && npm run build && npm run preview
```

Equivalent root scripts: `npm run build:skupervisor`, `npm run build:pos`,
`npm run build:store`. Build only the apps you actually changed; a change under
`packages/web-core` affects all three. Output lands in each app's own `dist/`.

---

**Last Updated:** 2026-08-14  
**Status:** Ready for Development





















