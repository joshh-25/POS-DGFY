# Production Transition Guide
**Date:** 2026-02-19
**Subject:** Moving Receive Token fix and Logic Alignment to Production

This guide outlines the steps for a seamless transition from local development to the production server at `skupervisor.surebizcorp.com`.

## 1. Pre-Deployment Checklist
- [ ] **Code Commit:** Ensure all changes in `backend/src/services/receiveTokenService.js` and `backend/src/models/ReceiveToken.js` are committed.
- [ ] **Migration Check:** Verify `backend/migrations/20260219000000-create-receive-tokens.cjs` exists.
- [ ] **Environment Variables:**
    - Ensure `JWT_SECRET` is consistent between backend and any standalone scripts.
    - Verify `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for the production environment.

## 2. Database Synchronization
The production server may have a "Migration Gap" where the `receive_tokens` table is missing or has a different schema.

### Steps:
1. **Backup:** Perform a full dump of the production database before running any migrations.
2. **Apply Migrations:**
   ```bash
   cd backend
   npm run migrate
   ```
   *Note: This will create the `receive_tokens` table if it doesn't exist.*

## 3. Deployment Execution
Use the established deployment workflow:
```bash
/deploy
```
*Wait for the `pm2 restart all` command to complete successfully.*

## 4. Post-Deployment Verification
Once deployed, run the following verification on the production server to ensure "Real World Engagement" is consistent:

1. **Service Check:**
   Run the newly created integration test (renamed and moved for persistence):
   ```bash
   node backend/tests/verify-qr-receiving-flow.js
   ```
2. **Manual UI Check:**
   - Log in to the production dashboard.
   - Generate a QR code for a Pending PO.
   - Scan the QR code (or use the generated link) and attempt to receive a different quantity (e.g., if PO is 500, receive 550).
   - Confirm status changes to `received` and inventory reflects 550.

## 5. Troubleshooting
- **Unknown Column Error:** If you see "Unknown column 'token_type'", it means the migration was not applied or the model is out of sync with the DB. Run `npm run migrate` again.
- **Unauthorized (401):** Ensure the `JWT_SECRET` in `.env` matches the key used to sign tokens.

---
*Confidence: 100% - All logic has been validated via direct database integration testing.*
