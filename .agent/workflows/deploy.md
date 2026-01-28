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

### 2. Pull Latest Code
```bash
# Check for uncommitted changes first
git status

# If there are conflicts with build artifacts, reset them:
git checkout -- frontend/dist/index.html

# Pull the latest code
git pull origin master
```

### 3. Install Backend Dependencies
```bash
cd backend
npm install
cd ..
```

// turbo
### 4. Rebuild Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### 5. Run Database Migrations (if any)
```bash
cd backend
# Primary migrations folder (src/migrations/)
npx sequelize-cli db:migrate

# Secondary migrations folder (migrations/) - if it exists
npx sequelize-cli db:migrate --migrations-path migrations
cd ..
```

### 6. Restart PM2 Services
```bash
# If services are already running
pm2 restart all

# If this is first deployment, start with ecosystem config
pm2 start ecosystem.config.cjs --env production
pm2 save
```

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
- For build artifacts: `git checkout -- frontend/dist/`
- For other files: `git stash && git pull && git stash pop`

---

## Quick Reference (Copy-Paste)

```bash
# Full deployment sequence
cd /var/www/skupervisor
git checkout -- frontend/dist/index.html
git pull origin master
cd backend && npm install && npx sequelize-cli db:migrate && npx sequelize-cli db:migrate --migrations-path migrations && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart all
pm2 logs sku-backend --lines 20
```
