---
description: Deploy updates to production hosting server (skupervisor.surebizcorp.com)
---
// turbo-all

# Production Deployment Workflow

## Prerequisites
- SSH access to the hosting server (`root@hermes-cloud`)
- Git credentials for GitHub repository

## Deployment Steps

### 1. SSH into the Server
```bash
ssh root@hermes-cloud
cd /var/www/skupervisor
```

### 2. Auto-Deployment (Recommended)
This script handles git pull, installing dependencies, building frontend, migrating database, and restarting PM2.

```bash
# First time setup: ensure script is executable (if needed)
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

### 3. Manual Deployment (Fallback)
If the script fails, follow these steps manually:
1. `git pull origin master`
2. `cd backend && npm install && npx sequelize-cli db:migrate && cd ..`
3. `cd frontend && npm install && npm run build && cd ..`
4. `pm2 restart all`

### 7. Verify Deployment
```bash
# Check PM2 status
pm2 status

# Check backend logs for errors
pm2 logs sku-backend --lines 20

# Test API endpoint
curl http://localhost:5001/api/v1/items
```

### 8. Browser Verification
- Open the website URL
- Do a hard refresh (`Ctrl + Shift + R`)
- Test main features: Login, Items, Purchase Orders, Job Orders

---

## Troubleshooting

### 502 Bad Gateway
- Backend server crashed. Check logs: `pm2 logs sku-backend --lines 50`
- Usually caused by missing npm dependencies: `cd backend && npm install`
- Restart: `pm2 restart sku-backend`

### 404 on API Routes
- Backend not running or wrong port
- Check: `curl http://localhost:5001/api/v1/items`
- Verify PM2: `pm2 status`

### Migration Errors
- "Table already exists": Schema already applied, can skip
- "Duplicate key": Run repair script if needed
- Check migration status: `npx sequelize-cli db:migrate:status`

### Git Merge Conflicts
- For other files: `git stash && git pull && git stash pop`

---

## Quick Reference (Copy-Paste)

```bash
# Full deployment sequence
cd /var/www/skupervisor
git pull origin master
bash deploy.sh
pm2 restart all
pm2 logs sku-backend --lines 20
```
