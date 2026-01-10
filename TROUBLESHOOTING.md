# SKU Inventory Manager - Troubleshooting Guide

This document covers common errors, their causes, and solutions for both **Local Development** and **Production/Hosting** environments.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Frontend Errors](#frontend-errors)
- [Backend Errors](#backend-errors)
- [Database Errors](#database-errors)
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

### 3. "Permission Denied" Errors on Server

**Symptoms:** Cannot read/write files, operations fail.

```bash
# Fix ownership
sudo chown -R www-data:www-data /var/www/skupervisor

# Or for PM2 user
sudo chown -R root:root /var/www/skupervisor
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
