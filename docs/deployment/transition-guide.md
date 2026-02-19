# Production Transition Guide
**Date:** 2026-02-19
**Subject:** QR Receive Flow — Full End-to-End Fix (Phase 39)
**Status:** ✅ DEPLOYED & VERIFIED

This guide outlines the steps for a seamless transition from local development to the production server at `skupervisor.surebizcorp.com`.

## 1. Pre-Deployment Checklist
- [x] **GitHub Push:** All Phase 39 changes pushed to the `master` branch.
- [x] **Changes included:**
  - `backend/src/services/receiveTokenService.js` — new `receiveViaToken` function + safe token serialization
  - `backend/src/controllers/receiveTokenController.js` — new `receiveViaToken` action, removed emergency file logging
  - `backend/src/routes/receiveTokens.js` — new `POST /:token/receive` public route
  - `frontend/Pages/MobileReceive.jsx` — uses new token-based receive, fixed countdown navigation, gated diagnostic panel
  - `frontend/src/services/receiveTokenService.js` — new `receiveViaToken` API call

## 2. Automated Deployment
Use the existing automation script which handles dependency updates, builds, and restarts in a single pass.

### Execution:
1. **Commit & push all local changes first** (critical — deploy.sh only deploys what's on GitHub):
   ```bash
   git add <changed files>
   git commit -m "feat: Phase 39 — QR Receive Flow end-to-end fix"
   git push origin master
   ```
2. **SSH into the Server:**
   ```bash
   ssh root@hermes-cloud
   ```
3. **Run Deployment:**
   ```bash
   cd /var/www/skupervisor
   bash scripts/deploy.sh
   ```

### What the script covers:
- **Dependency Install:** Updates `node_modules` for both environments.
- **Frontend Build:** Generates the production assets for the UI.
- **Database Migration:** No new migrations required for Phase 39 — schema is unchanged.
- **Service Restart:** Reloads PM2 to activate the new code.

> ⚠️ **Lesson learned (Phase 39 deployment):** Always verify `git log --oneline -3` on the server after `git pull` to confirm the expected commit is present before assuming the deploy picked up your changes. If the server shows `Already up to date` but you haven't pushed locally, the new code is not on the server.

## 3. Post-Deployment Verification
1. Generate a fresh QR token for a pending PO from the Purchase Orders page
2. Open the QR link in a browser (no login required)
3. Confirm items and quantities appear correctly
4. Submit the receive — confirm PO status changes to `received` or `partial`
5. Repeat for a JO token

## 4. Deployment Result (2026-02-19)
| Check | Result |
|-------|--------|
| Frontend build | ✅ 2263 modules, 16s |
| Database migrations | ✅ No-op (schema unchanged) |
| PM2 restart | ✅ Both `sku-backend` and `sku-frontend` online |
| Backend smoke test | ✅ HTTP 401 on `/items` (expected) |
| Billing verification | ✅ All 3 checks passed |
| PO QR receive (live) | ✅ Status updated correctly |
| JO QR receive (live) | ✅ Quantity produced updated correctly |

## 5. Troubleshooting
| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| "Invalid or expired token" on scan | Token was already used or expired | Generate a new QR token |
| PO status not updating | Backend not restarted after deploy | `pm2 restart backend` |
| 401 error on receive | Old frontend code still calling auth-gated endpoint | Hard-refresh browser / clear cache |
| URL shows `.com/undefined` | Changes not pushed to GitHub before deploy | `git push origin master` then redeploy |
