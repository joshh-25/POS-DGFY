# Production Deployment Checklist

Use this guide to ensure a safe and successful deployment to the production server.

## 1. Pre-Deployment Checks (Local)
- [ ] **Code Status**: All changes committed and pushed to `main`.
- [ ] **Build Check**: storage
    ```bash
    cd frontend
    npm run build
    # Verify 'dist' folder is created without errors
    ```
- [ ] **Environment Variables**:
    - Check `.env.production` in backend (if used, or ensure pm2 env is set).
    - Ensure `VITE_API_URL` in frontend points to the production domain.

## 2. Server Access
- [ ] SSH into the server.
- [ ] Navigate to project root: `cd /path/to/project`.

## 3. Database Backup (Critical)
Before applying any changes, backup the database.
```bash
# Example for MySQL
mysqldump -u [user] -p [database_name] > backup_$(date +%F_%H-%M).sql
```

## 4. Pull Latest Code
```bash
git pull origin main
```

## 5. Install Dependencies
If `package.json` changed:
```bash
# Backend
npm install

# Frontend
cd frontend
npm install
```

## 6. Rebuild Frontend
```bash
cd frontend
npm run build
```

## 7. Migration (If applicable)
If database schema changed:
```bash
cd backend
npm run migrate # or equivalent command
```

## 8. Restart Services
Use PM2 to zero-downtime reload or restart.
```bash
pm2 restart ecosystem.config.cjs --env production
```

## 9. Verification
- [ ] **Health Check**: Load the website in incognito.
- [ ] **API Check**: Login and verify data loads.
- [ ] **Logs**: Check for startup errors.
    ```bash
    pm2 logs
    ```

## 10. Rollback (If needed)
If major issues occur:
1. Revert code: `git reset --hard HEAD^`
2. Rebuild: `npm run build`
3. Restart: `pm2 restart all`
