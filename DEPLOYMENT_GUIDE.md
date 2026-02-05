# Deployment Guide - SKU Inventory Manager

## Overview
This guide covers the deployment process for the SKU Inventory Manager (SKUpervisor) application. The system consists of:
- **Frontend**: React + Vite (Port 5173/80)
- **Backend**: Node.js + Express (Port 5001)
- **Database**: MySQL
- **Process Manager**: PM2

## Prerequisites
- **Node.js**: v18+ installed
- **MySQL**: v8.0+ installed and running
- **PM2**: Installed globally (`npm install -g pm2`)
- **Git**: For pulling updates

---

## 🤖 Automated Deployment (Antigravity Only)

If you are using the Antigravity AI assistant, you can automate this entire guide using a single command:

```bash
/deploy
```

This will autonomously handle SSH, git pulling, dependency installation, database migrations, frontend building, and PM2 restarts.

---

## Deployment Steps
### 1. Auto-Deployment (Recommended)
We have implemented an automated script `deploy.sh` that handles the entire process safely (pulling code, installing dependencies, building frontend, migrating DB, and restarting services). This script defaults to `NODE_ENV=production`.

Run this on your server:

```bash
cd /var/www/skupervisor

# First time setup (if permission denied):
chmod +x scripts/deploy.sh

# Deploy
./scripts/deploy.sh
```

---

### 2. Multi-Tenancy Onboarding (One-time)
When upgrading an existing production database to Multi-Tenancy for the first time, you **must** run the onboarding script to register your company and map your users:

```bash
node backend/scripts/onboard-production-tenant.js
```
This script will:
- Create a primary tenant record in the central Landlord DB.
- Map all current active users to this tenant so they can log in.
- Generate your `x-company-token`.

---

### 2. Manual Deployment (Fallback)
If the auto-deployment script fails, you can fall back to manual steps:

#### Step 1: Update Code
```bash
cd /var/www/skupervisor
git pull origin master
```

#### Step 2: Backend Setup
```bash
cd backend
npm install
npx sequelize-cli db:migrate
cd ..
```

#### Step 3: Frontend Build (CRITICAL)
The frontend is a static site build. **You must rebuild it whenever frontend code changes.**

```bash
cd frontend
npm install
npm run build
cd ..
```

#### Step 4: Restart Services
```bash
pm2 restart all
```

## Environment Configuration

### Backend (.env)
Located in `backend/.env`:
```env
PORT=5001
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=sku_inventory_manager
JWT_SECRET=your_jwt_secret
NODE_ENV=production
TRUST_PROXY=true # Set to true if behind Nginx/Apache
OPENAI_API_KEY=your_openai_key # Optional: AI features will be disabled if missing
FRONTEND_URL=https://skupervisor.surebizcorp.com
```

> [!IMPORTANT]
> **Production Safety Checks**: The backend will perform a critical check on startup when `NODE_ENV=production`. If `DB_HOST`, `DB_USER`, `DB_NAME`, or `JWT_SECRET` are missing, a CRITICAL error will be logged. Unlike development mode, there are **no fallbacks** (like `root` or empty passwords) for security reasons.

### Frontend
Frontend environment variables are baked into the build. To change them, modify `frontend/.env` and **rebuild the frontend**.

## Troubleshooting

### Changes Not Showing?
If you updated the frontend but don't see changes:
1. **Rebuild**: Ensure you ran `npm run build` in the `frontend` directory.
2. **Hard Refresh**: Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac) in your browser.
3. **Cache**: Clear Cloudflare or Nginx cache if applicable.

### 502 Bad Gateway
Usually means the backend crashed. Check logs:
```bash
pm2 logs sku-backend --lines 50
```

### Database Connection Errors
Check your `.env` credentials and ensure MySQL is running:
```bash
systemctl status mysql
```
