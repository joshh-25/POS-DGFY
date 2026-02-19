# Production Transition Guide
**Date:** 2026-02-19
**Subject:** QR Receive Flow — Full End-to-End Fix (Phase 39)

This guide outlines the steps for a seamless transition from local development to the production server at `skupervisor.surebizcorp.com`.

## 1. Pre-Deployment Checklist
- [ ] **GitHub Push:** Ensure all Phase 39 changes are pushed to the `master` branch.
- [ ] **Changes included:**
  - `backend/src/services/receiveTokenService.js` — new `receiveViaToken` function + safe token serialization
  - `backend/src/controllers/receiveTokenController.js` — new `receiveViaToken` action, removed emergency file logging
  - `backend/src/routes/receiveTokens.js` — new `POST /:token/receive` public route
  - `frontend/Pages/MobileReceive.jsx` — uses new token-based receive, fixed countdown navigation, gated diagnostic panel
  - `frontend/src/services/receiveTokenService.js` — new `receiveViaToken` API call

## 2. Automated Deployment
Use the existing automation script which handles dependency updates, builds, and restarts in a single pass.

### Execution:
1. **SSH into the Server:**
   ```bash
   ssh root@hermes-cloud
   ```
2. **Run Deployment:**
   ```bash
   cd /var/www/skupervisor
   git pull origin master
   bash scripts/deploy.sh
   ```

### What the script covers:
- **Dependency Install:** Updates `node_modules` for both environments.
- **Frontend Build:** Generates the production assets for the UI.
- **Database Migration:** No new migrations required for Phase 39 — schema is unchanged.
- **Service Restart:** Reloads PM2 to activate the new code.

## 3. Post-Deployment Verification
1. Generate a fresh QR token for a pending PO from the Purchase Orders page
2. Open the QR link in a browser (no login required)
3. Confirm items and quantities appear correctly
4. Submit the receive — confirm PO status changes to `received` or `partial`
5. Repeat for a JO token

## 4. Troubleshooting
| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| "Invalid or expired token" on scan | Token was already used or expired | Generate a new QR token |
| PO status not updating | Backend not restarted after deploy | `pm2 restart backend` |
| 401 error on receive | Old frontend code still calling auth-gated endpoint | Hard-refresh browser / clear cache |
