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

### Step 3: Start Frontend Server

Open **Terminal 2** (new terminal window):

```bash
cd apps/dgfy-web
npm run dev
```

**Expected Output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this terminal open** - the frontend server must stay running.

---

### Step 4: Access the Application

Once both servers are running:

1. **Frontend Application:**
   - Open browser: http://localhost:5173
   - The React application should load

2. **Backend API Health Check:**
   - Open browser: http://localhost:5000/health
   - Should return: `{"success":true,"message":"Server is running",...}`

3. **API Base URL:**
   - http://localhost:5000/api/v1

---

## Running in Development Mode (Summary)

You need **2 terminal windows** running simultaneously:

**Terminal 1 - Backend:**
```bash
cd apps/dgfy-api
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd apps/dgfy-web
npm run dev
```

**Both terminals must stay open** while you're developing.

---

## 🤖 Antigravity "Turbo" Shortcuts (Recommended)

If you are working with the Antigravity AI assistant, you can skip manual terminal management using these commands:

1. **`/sync`**: Run this first to ensure all dependencies are installed everywhere.
2. **`/start-dev`**: Replaces the "2 Terminals" manual setup. It starts both frontend and backend in the background using PM2 and streams the logs.
3. **`/health`**: Run this any time to verify services are running correctly.

---

## Optional: Frontend Environment Configuration

The frontend will work with default settings, but you can create a `.env` file in
`apps/dgfy-web/` for customization:

**Create `apps/dgfy-web/.env`:**
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
1. Vite will automatically try the next available port (5174, 5175, etc.)
2. Or stop the process using port 5173
3. Or specify a different port: `npm run dev -- --port 3000`

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

**Frontend:**
```bash
cd apps/dgfy-web
npm run build
npm run preview
```

---

**Last Updated:** 2024-12-23  
**Status:** Ready for Development





















