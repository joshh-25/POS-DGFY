# SKU Inventory Manager - Troubleshooting Guide

This document covers common errors, their causes, and solutions for both **Local Development** and **Production/Hosting** environments.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Frontend Errors](#frontend-errors)
- [Backend Errors](#backend-errors)
- [Database Errors](#database-errors)
- [Migration Errors](#migration-errors)
- [Authentication Errors](#authentication-errors)
- [Deployment Errors](#deployment-errors)
- [Performance Issues](#performance-issues)

---

## Quick Diagnostics

### Health Check Commands

| Environment | Command | Expected Result |
|-------------|---------|-----------------|
| **Local** | `curl http://localhost:5000/health` | JSON with database/Redis status |
| **Hosting** | `curl http://localhost:5001/health` | JSON with database/Redis status |

### Service Status Commands

**Local (Windows):**
```bash
# Check if ports are in use
netstat -ano | findstr :5000
netstat -ano | findstr :5173
```

**Hosting (Linux):**
```bash
# PM2 status
pm2 status

# Check PM2 logs (last 50 lines)
pm2 logs sku-backend --lines 50

# Restart all services
pm2 restart all

# Start with ecosystem config (first time or after delete)
pm2 start ecosystem.config.cjs --env production

# Check Nginx status
sudo systemctl status nginx

# Check MySQL status
sudo systemctl status mysql

# Check Redis status
sudo systemctl status redis
```

---

## Frontend Errors

### 1. Blank Page / White Screen

**Symptoms:** Page loads but shows nothing, or shows only white background.

| Cause | Solution |
|-------|----------|
| JavaScript error in console | Open DevTools (F12) → Console, fix the error |
| Build failed | Run `npm run build` and check for errors |
| Wrong API URL | Check `VITE_API_URL` in `frontend/.env` |
| Cached old version | Hard refresh: `Ctrl + Shift + R` |

**Local Fix:**
```bash
cd frontend
rm -rf node_modules/.vite
npm run dev
```

**Hosting Fix:**
```bash
cd /var/www/skupervisor/frontend
npm run build
# Hard refresh browser: Ctrl + Shift + R
```

---

### 2. "Network Error" / Cannot Connect to API

**Symptoms:** Login fails, data doesn't load, network errors in console.

| Cause | Solution |
|-------|----------|
| Backend not running | Start backend server |
| Wrong API URL | Check `VITE_API_URL` matches backend |
| CORS blocked | Check `CORS_ORIGIN` in backend `.env` |
| Firewall blocking | Allow ports 5000/5001 |

**Diagnosis:**
```bash
# Test API directly
curl http://localhost:5000/api/v1/items

# Check CORS header in response
curl -I http://localhost:5000/api/v1/items
```

**Local `.env` fix:**
```env
# frontend/.env
VITE_API_URL=http://localhost:5000/api/v1

# backend/.env
CORS_ORIGIN=http://localhost:5173
```

---

### 3. "404 Not Found" on Page Refresh

**Symptoms:** Direct URL navigation or page refresh returns 404.

| Environment | Cause | Solution |
|-------------|-------|----------|
| **Local** | Normal for dev server | Should work automatically with Vite |
| **Hosting** | Nginx not configured for SPA | Add `try_files` rule |

**Nginx Fix:**
```nginx
location / {
    root /var/www/skupervisor/frontend/dist;
    try_files $uri $uri/ /index.html;  # ← This line is required
}
```

---

### 4. Styles Not Loading / Broken Layout

**Symptoms:** Page loads but looks unstyled or broken.

| Cause | Solution |
|-------|----------|
| Tailwind not compiling | Check `tailwind.config.js` content paths |
| CSS file not found | Run `npm run build` again |
| Cache issues | Clear browser cache, hard refresh |

---

## Backend Errors

### 1. "502 Bad Gateway"

**Symptoms:** Browser shows 502 error, API calls fail.

| Cause | Solution |
|-------|----------|
| Backend crashed | Restart PM2: `pm2 restart sku-backend` |
| Port mismatch | Verify backend PORT matches Nginx proxy |
| Missing dependencies | Run `npm install` in backend |

**Diagnosis (Hosting):**
```bash
# Check if backend is running
pm2 status

# Check error logs
pm2 logs sku-backend --lines 50

# Look for the actual error
cat /var/www/skupervisor/backend/logs/error.log
```

**Common Fixes:**
```bash
cd /var/www/skupervisor/backend
npm install
pm2 restart sku-backend
```

---

### 2. "404 Not Found" on API Routes

**Symptoms:** Specific API endpoints return 404.

| Cause | Solution |
|-------|----------|
| Route not registered | Check route file is imported in `server.js` |
| Backend not restarted | Restart after adding new routes |
| Wrong HTTP method | Verify GET/POST/PUT/DELETE matches |

**Example:** After adding new routes:
```bash
# Local
# Stop and restart: Ctrl+C, then npm run dev

# Hosting
pm2 restart sku-backend
```

---

### 3. "EADDRINUSE: Port Already in Use"

**Symptoms:** Backend fails to start, port conflict error.

**Local (Windows):**
```bash
# Find process using port
netstat -ano | findstr :5000

# Kill by PID
taskkill /PID <PID> /F

# Or use npx
npx kill-port 5000
```

**Hosting (Linux):**
```bash
# Find process
lsof -i :5001

# Kill process
kill -9 <PID>

# Or use PM2 (safer)
pm2 delete sku-backend
pm2 start ecosystem.config.cjs --env production
```

---

### 4. "Cannot find module" Error

**Symptoms:** Backend crashes with module not found error.

| Cause | Solution |
|-------|----------|
| Missing dependency | Run `npm install` |
| Wrong import path | Check file path casing (Linux is case-sensitive) |
| Deleted file | Restore file or remove import |

```bash
cd backend
rm -rf node_modules
npm install
```

---

## Database Errors

### 1. "ECONNREFUSED" / Cannot Connect to Database

**Symptoms:** Backend fails to start, database connection error.

| Cause | Solution |
|-------|----------|
| MySQL not running | Start MySQL service |
| Wrong credentials | Check `.env` DB_USER, DB_PASSWORD |
| Wrong host/port | Check `.env` DB_HOST, DB_PORT |
| Database doesn't exist | Create the database |

**Local (XAMPP):**
1. Open XAMPP Control Panel
2. Click "Start" next to MySQL
3. Verify: `mysql -u root -p`

**Hosting:**
```bash
sudo systemctl status mysql
sudo systemctl start mysql
```

---

### 2. "Table doesn't exist" Error

**Symptoms:** API returns 500 error, missing table in logs.

**Solution: Run migrations**
```bash
cd backend
npx sequelize-cli db:migrate

# Check migration status
npx sequelize-cli db:migrate:status
```

---

### 3. "Duplicate key" / "Column already exists" Migration Error

**Symptoms:** Migrations fail with duplicate errors.

| Cause | Solution |
|-------|----------|
| Migration already ran | Skip it, already applied |
| Schema out of sync | Make migration idempotent |

**Quick Fix:**
```bash
# Check what's applied
npx sequelize-cli db:migrate:status

# If migration is marked as pending but schema exists:
# Manually mark as done in SequelizeMeta table
mysql -u root -p -e "USE sku_inventory_manager; INSERT INTO SequelizeMeta (name) VALUES ('20240115-migration-name.js');"
```

**Long-term Fix:** Make migrations idempotent:
```javascript
// In migration file
await queryInterface.sequelize.query(`
  ALTER TABLE items ADD COLUMN IF NOT EXISTS new_column VARCHAR(255);
`);
```

---

### 4. "Setting 'X' not found" Error

**Symptoms:** Specific feature fails, setting not found in logs.

**Solution:** Add missing setting to database:
```sql
INSERT INTO settings (key, value, description, created_at, updated_at)
VALUES ('missing_setting_key', 'default_value', 'Description', NOW(), NOW());
```

Or update seeder and run:
```bash
npm run seed
```

---

### 5. Foreign Key Constraint Errors

**Symptoms:** Cannot delete or update records.

| Error | Cause | Solution |
|-------|-------|----------|
| Cannot delete parent | Child records exist | Delete children first or use CASCADE |
| Cannot add child | Parent doesn't exist | Create parent first |

---

## Migration Errors

### 1. "module is not defined in ES module scope" Error

**Symptoms:** Migration fails with error about `module.exports` not being defined.

**Root Cause:** Project has `"type": "module"` in `package.json`, but migration file uses CommonJS syntax (`module.exports = {}`).

**Solution:** Rename migration file from `.js` to `.cjs`:
```bash
mv migrations/migration-name.js migrations/migration-name.cjs
```

Or convert to ES module syntax:
```javascript
// Before (CommonJS)
module.exports = {
  async up(queryInterface, Sequelize) { ... }
};

// After (ES Module)
export default {
  async up(queryInterface, Sequelize) { ... }
};
```

---

### 2. Migrations in Wrong Folder

**Symptoms:** Migrations exist but `db:migrate` doesn't run them.

**Root Cause:** Sequelize CLI looks in the folder specified by `.sequelizerc`. If migrations are placed elsewhere, they won't be detected.

**Diagnosis:**
```bash
# Check configured path
cat backend/.sequelizerc

# Our project uses: backend/src/migrations/
# But some migrations may be in: backend/migrations/
```

**Solution Options:**

1. **Run from specific folder:**
   ```bash
   cd backend
   npx sequelize-cli db:migrate --migrations-path migrations
   ```

2. **Move migrations to correct folder:**
   ```bash
   mv backend/migrations/*.cjs backend/src/migrations/
   ```

---

### 3. "Unknown column" After Deployment (500 Errors)

**Symptoms:** API returns 500 errors, logs show `Unknown column 'X' in 'field list'`.

**Root Cause:** Code references database columns that migrations haven't created yet.

**Solution:**
```bash
cd /var/www/skupervisor/backend

# Run standard migrations
npx sequelize-cli db:migrate

# If migrations exist in alternate folder
npx sequelize-cli db:migrate --migrations-path migrations

pm2 restart sku-backend
```

**Common Missing Columns:**
| Column | Table | Migration |
|--------|-------|----------|
| `archived_at`, `archived_by` | purchase_orders | `add-archive-fields-to-purchase-orders.cjs` |
| `archived_at`, `archived_by` | job_orders | `add-archive-fields-to-job-orders.cjs` |
| `received_by` | purchase_orders | `add-received-by-to-purchase-orders.js` |
| `completed_by` | job_orders | `add-completed-by-to-job-orders.js` |

---

### 4. "Unable to resolve sequelize package" Error

**Symptoms:** `npx sequelize-cli db:migrate` fails with package resolution error.

**Root Cause:** Running Sequelize CLI from wrong directory.

**Solution:** Always run from the `backend` directory:
```bash
cd /var/www/skupervisor/backend
npx sequelize-cli db:migrate
```

Not from:
```bash
# WRONG - missing sequelize dependency
cd /var/www/skupervisor
npx sequelize-cli db:migrate
```

---

### 5. "Duplicate column" During Migration (Safe to Ignore)

**Symptoms:** Migration reports `ERROR: Duplicate column name 'X'`

**Cause:** Column already exists in database (possibly added manually or by previous run).

**Action:** This error can be safely ignored if the column already exists. The database is already in the correct state.

**Prevention:** Make migrations idempotent by checking if column exists:
```javascript
async up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable('tablename');
  if (!tableInfo.column_name) {
    await queryInterface.addColumn('tablename', 'column_name', {
      type: Sequelize.STRING
    });
  }
}
```

---

## Authentication Errors

### 1. "401 Unauthorized" / "Invalid Token"

**Symptoms:** User gets logged out, API rejects requests.

| Cause | Solution |
|-------|----------|
| Token expired | Re-login |
| Different JWT secrets | Ensure backend `.env` JWT_SECRET unchanged |
| Server restarted | Tokens still valid if secret unchanged |

**Clear local storage and re-login:**
```javascript
// In browser console
localStorage.clear();
location.reload();
```

---

### 2. "403 Forbidden" / Access Denied

**Symptoms:** User can login but cannot access certain features.

| Cause | Solution |
|-------|----------|
| Insufficient role | User needs higher role (Staff → Manager → Admin) |
| Route requires admin | Only admin can access |

**Check user role:**
```sql
SELECT username, role FROM users WHERE username = 'problematic_user';
```

**Promote user (as admin via UI or SQL):**
```sql
UPDATE users SET role = 'admin' WHERE username = 'username';
```

---

### 3. "Refresh Token" Issues

**Symptoms:** User stays logged in briefly then gets kicked out.

| Cause | Solution |
|-------|----------|
| Refresh token expired | Re-login (tokens expire after 7 days default) |
| Redis down | Restart Redis or app works without it |
| Token blacklisted | User was logged out, re-login |

---

## Deployment Errors

### 1. Git Merge Conflicts on Deploy

**Symptoms:** `git pull` fails with conflict errors.

**Common Conflicts:**
```bash
# Build artifacts (safe to discard)
git checkout -- frontend/dist/index.html
git checkout -- frontend/dist/

# package-lock.json (accept theirs or regenerate)
git checkout --theirs package-lock.json
npm install

# Then pull again
git pull origin master
```

---

### 2. Changes Not Visible After Deploy

**Symptoms:** Deployed but old version still showing.

| Component | Solution |
|-----------|----------|
| Frontend | Rebuild: `cd frontend && npm run build` |
| Backend | Restart: `pm2 restart sku-backend` |
| Browser | Hard refresh: `Ctrl + Shift + R` |
| CDN | Wait for cache to expire or purge |

**Complete refresh sequence:**
```bash
cd /var/www/skupervisor
git pull origin master
cd frontend && npm install && npm run build && cd ..
cd backend && npm install && cd ..
pm2 restart all
```

---

### 3. Complete Deployment Checklist

**Use this checklist EVERY time you deploy:**

```bash
# 1. SSH and navigate
ssh root@hermes-cloud
cd /var/www/skupervisor

# 2. Handle build artifacts (prevents merge conflicts)
git checkout -- frontend/dist/index.html

# 3. Pull latest code
git pull origin master

# 4. Install backend dependencies (REQUIRED if new packages added)
cd backend && npm install && cd ..

# 5. Run database migrations (REQUIRED if schema changed)
cd backend && npx sequelize-cli db:migrate && cd ..

# 6. Check for additional migrations folder
cd backend && npx sequelize-cli db:migrate --migrations-path migrations && cd ..

# 7. Rebuild frontend (REQUIRED for UI changes to appear)
cd frontend && npm install && npm run build && cd ..

# 8. Restart services
pm2 restart all

# 9. Verify deployment
pm2 logs sku-backend --lines 20

# 10. Test in browser with hard refresh (Ctrl + Shift + R)
```

> [!IMPORTANT]
> **Frontend changes won't appear** until you run `npm run build` in the frontend folder. The production server serves pre-built static files from `frontend/dist/`, not the development server.

---

### 4. "Permission Denied" Errors on Server

**Symptoms:** Cannot read/write files, operations fail.

```bash
# Fix ownership
sudo chown -R www-data:www-data /var/www/skupervisor

# Or for PM2 user
sudo chown -R root:root /var/www/skupervisor
```

---

## CSV/ZIP Export Issues

### 1. Exported Files Have Wrong Extension (`.zip_` or `.csv_`)

**Symptoms:** Downloaded files have extensions like `.zip_` or `.csv_` instead of `.zip` or `.csv`. Files contain valid data but won't open properly.

**Root Causes:**
1. CORS not exposing `Content-Disposition` header
2. Frontend regex failing to parse filename

**Multi-Part Fix:**

**Step 1: Backend CORS (server.js)**
Ensure `exposedHeaders` includes `Content-Disposition`:
```javascript
const corsOptions = {
  origin: ...,
  credentials: true,
  optionsSuccessStatus: 200,
  exposedHeaders: ['Content-Disposition', 'Content-Length']
};
```

**Step 2: Rebuild Frontend**
```bash
cd /var/www/skupervisor/frontend
npm run build
pm2 restart all
```

**Step 3: Hard Refresh Browser**
Press `Ctrl + Shift + R` to clear cached JavaScript.

**Diagnosis:**
```bash
# Check if CORS fix is deployed
grep -n "exposedHeaders" /var/www/skupervisor/backend/src/server.js

# Check response headers directly
curl -I https://your-domain.com/api/v1/items/export
# Should show: content-disposition: attachment; filename="..."
```

---

### 2. ZIP File Won't Extract / CSV Won't Open

**Symptoms:** File downloads with correct extension but content is corrupted.

| Cause | Solution |
|-------|----------|
| Response not received as blob | Check `responseType: 'blob'` in axios call |
| Network timeout | Try smaller exports (filtered, not "Export All") |
| Server memory issue | Check PM2 logs for memory errors |

**Verify File Content:**
```bash
# Check first bytes of downloaded file
head -c 50 downloaded_file.zip
# ZIP files should start with "PK"

head -c 100 downloaded_file.csv
# CSV files should show column headers
```

---

## Performance Issues

### 1. Slow API Responses

| Cause | Solution |
|-------|----------|
| No database indexes | Add indexes to frequently queried columns |
| N+1 query problem | Use eager loading (include) in Sequelize |
| Redis not working | Enable and configure Redis caching |
| Too much data | Implement pagination |

**Check slow queries:**
```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
```

---

### 2. High Memory Usage

| Cause | Solution |
|-------|----------|
| Memory leak | Restart PM2: `pm2 restart all` |
| Too many PM2 instances | Reduce instances: `pm2 scale sku-backend 1` |
| Large log files | Rotate logs: `pm2 flush` |

---

### 3. Frontend Loading Slowly

| Cause | Solution |
|-------|----------|
| Large bundle size | Code splitting, lazy loading |
| Not gzipped | Enable Nginx gzip compression |
| Too many API calls | Batch requests, caching |

**Nginx gzip config:**
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;
```

---

## Error Logging

### Where to Find Logs

| Environment | Log Location |
|-------------|--------------|
| **Local Backend** | `backend/logs/combined.log`, `backend/logs/error.log` |
| **Local Frontend** | Browser DevTools → Console |
| **Hosting Backend** | `pm2 logs sku-backend` or `/var/www/skupervisor/backend/logs/` |
| **Hosting Nginx** | `/var/log/nginx/error.log` |
| **Hosting MySQL** | `/var/log/mysql/error.log` |

### View Logs in Real-time

```bash
# PM2 logs (hosting)
pm2 logs sku-backend --lines 100

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# All logs combined
pm2 logs --lines 50
```

---

## Getting Help

If you can't resolve an issue:

1. **Check logs** - Always start with error logs
2. **Search this document** - Use `Ctrl+F` to find keywords
3. **Check DEVELOPMENT_HISTORY.md** - Previous issues may be documented
4. **Reproduce locally** - Test the exact scenario on local first
5. **Isolate the problem** - Is it frontend, backend, database, or network?

---

## Related Documentation

- [PREREQUISITES.md](PREREQUISITES.md) - Environment setup requirements
- [SETUP.md](SETUP.md) - Initial installation guide
- [.agent/workflows/deploy.md](.agent/workflows/deploy.md) - Deployment procedures
- [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) - Development changelog

---

*Last updated: January 10, 2026*
