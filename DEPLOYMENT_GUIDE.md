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

## Deployment Steps

### 1. Update Codebase
Navigate to your project directory and pull the latest changes.

```bash
cd /var/www/skupervisor
git checkout -- frontend/dist/index.html # Reset build artifacts if conflicts exist
git pull origin master
```

### 2. Backend Setup
Install dependencies and run migrations.

```bash
cd backend
npm install
npx sequelize-cli db:migrate
# If you have a secondary migrations folder:
# npx sequelize-cli db:migrate --migrations-path migrations
cd ..
```

### 3. Frontend Build (CRITICAL)
The frontend is a static site build. **You must rebuild it whenever frontend code changes.**

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Restart Services
Restart the application processes to apply changes.

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
```

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
