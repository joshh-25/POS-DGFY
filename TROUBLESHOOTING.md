# Troubleshooting Guide

## Common Issues & Solutions

> **NOTE**: This document is a critical component of the **AI Debugging Protocol**. AI Assistants must consult this guide BEFORE proposing fixes.

### 1. 500 Internal Server Error on Reports
**Symptoms**:
- Failed to load "Snapshot" reports.
- Server logs show `ReferenceError: ReportSnapshot is not defined` or similar model errors.

**Cause**:
- In a multi-tenant environment, models must be retrieved dynamically for the current tenant's database connection. Hardcoding model imports (e.g., `import ReportSnapshot from '../models'`) fails because it targets the default/landlord database, not the tenant's.

**Solution**:
- Always use `dbStore` to get the model for the current request context.
- **Incorrect**: `ReportSnapshot.findAll(...)`
- **Correct**: `const ReportSnapshot = dbStore.get('ReportSnapshot'); await ReportSnapshot.findAll(...)`

### 2. "Create Folder" Not Appearing in UI
**Symptoms**:
- You ask AI to create a folder, it says "Success", but nothing appears in the Items grid.

**Cause**:
- A mismatch between the AI's database writes and the Frontend's read logic. The frontend was originally filtering folders based on *items that have a folder string*, meaning empty folders were invisible.

**Solution**:
- The system has been updated to fetch folders directly from the `item_folders` table.
- **Fix**: Check `Items.jsx` and ensure it uses the `useFolders` hook.
- **Verification**: Create an empty folder via UI. It should persist on refresh.

### 3. AI Tool Errors ("Invalid tool call")
**Symptoms**:
- AI tries to use a tool that doesn't exist or uses the wrong arguments.

**Solution**:
- Check `aiTools.js` for the exact definition.
- Ensure the AI System Prompt (`aiSystemPrompt.js`) is updated with the latest tool descriptions.
- **Inventory vs. Files**: The AI has separate tools for "Inventory Folders" (logical groups) and "File System Folders" (physical uploads). Ensure the prompt clarifies this distinction.

### 4. Database Migrations Not Applying to Tenants
**Symptoms**:
- New feature works on the main dashboard but fails for specific companies/tenants.

**Solution**:
- Standard `sequelize db:migrate` ONLY updates the `DB_NAME` specified in `.env`.
### 5. 500 Error on Registration / "Malformed input to a URL function"
**Symptoms**:
- User registration (`POST /api/v1/auth/register`) fails with a 500 error.
- Server logs (PM2) show `URIError: Malformed input to a URL function` inside Express router's `trim_prefix`.

**Cause**:
- The `trust proxy` setting in Express is enabled in an environment without a reverse proxy (like Nginx). Express then tries to parse proxy headers that are missing or malformed in local network requests, causing the routing logic to crash.

**Solution**:
- We have implemented a **Dynamic Proxy Configuration**.
- **Fix**: Check `server.js`. It now automatically disables `trust proxy` in development mode.
- **Production**: To enable it in production, ensure `NODE_ENV=production` is set in your environment or add `TRUST_PROXY=true` to your `.env` file.
- **Verification**: If you still see this error, ensure no other middleware is manually overriding `app.set('trust proxy', true)`.

### 6. Job Order Completion Fails with "Unable to fulfill FIFO batches"
**Symptoms**:
- Clicking "Complete Production" on a Job Order fails with 400 Bad Request
- Error message: `Unable to fulfill entire quantity from FIFO batches. Shortfall: X`
- Backend logs show the FIFO batch query returns empty results

**Cause**:
- The item has `current_stock > 0` but no corresponding FIFO batch records in the `fifo_batches` table
- This typically happens with legacy/migrated data that predates the FIFO tracking system
- FIFO batches are normally created when receiving Purchase Orders

**Solution**:
- The system now auto-creates "legacy" FIFO batches when this scenario is detected
- If you're still seeing this error after the fix, ensure the backend was restarted to pick up code changes
- **Manual Fix** (if needed): Insert a FIFO batch record for the affected item:
```sql
INSERT INTO fifo_batches (item_id, quantity, cost_per_unit, received_date, po_number, notes)
SELECT item_id, current_stock, cost_per_unit, NOW(), 'LEGACY-STOCK', 'Manual fix for legacy data'
FROM items WHERE item_id = <affected_item_id>;
```
- **Verification**: Check that the item has batches: `SELECT * FROM fifo_batches WHERE item_id = <id>`

### 7. Job Order Completion Fails with Quantity Validation Error
**Symptoms**:
- Error: `Cannot produce X. Only Y remaining.`
- Happens when trying to complete more than the remaining quantity

**Cause**:
- The Job Order was partially completed before
- `quantity_produced` already has a value, reducing remaining quantity
- User is trying to produce the original `quantity_to_produce` instead of the remaining amount

**Solution**:
- Check the "Produced So Far" value shown in the completion dialog
- Only enter the remaining quantity (Total - Already Produced)
- Use the "Max" button to auto-fill the correct remaining quantity

### 8. Port Already in Use (EADDRINUSE)
**Symptoms**:
- Backend won't start
- Error: `listen EADDRINUSE: address already in use 0.0.0.0:5000`

**Cause**:
- Another process (previous backend instance, another app) is using port 5000

**Solution**:
- **Windows (PowerShell)**:
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force
```
- **Windows (Git Bash)**:
```bash
netstat -ano | grep 5000
taskkill //F //PID <pid_from_above>
```
- **Linux/Mac**:
```bash
lsof -ti:5000 | xargs kill -9
```
- Then restart the backend: `npm run dev`

### 9. PM2 Process Not Found
**Symptoms**:
- Running `pm2 restart sku-backend` returns `[PM2][ERROR] Process or Namespace sku-backend not found`.
- `pm2 list` is empty even though the server might be running manually.

**Cause**:
- The process was not started with PM2 (e.g., ran manually with `node src/server.js`).
- The PM2 daemon was killed or the machine restarted, and the process list wasn't saved/resurrected.

**Solution**:
- **Start the Development Ecosystem**: Use the workflow command `/start-dev` or run `pm2 start ecosystem.config.cjs`.
- **Check Status**: Always run `pm2 list` to see what is actually managed by PM2.
### 10. 404 Not Found on /auth/lookup (Production)
**Symptoms**:
- After deploying Multi-Tenancy to production, logging in fails with a 404 error on the `lookup` endpoint.
- Console says `Email not registered in any company`.

**Cause**:
- The Landlord (central) database is empty. Even though users exist in the main website database, they aren't "mapped" to a company in the new Multi-Tenant architecture.

**Solution**:
- Run the production onboarding script to register the default company and map existing users.
- **Run**: `node backend/scripts/onboard-production-tenant.js`
- **Verify**: The script should list "Mapped: [email]" for all your active users.

### 11. Backend Won't Start (Husky Error)
**Symptoms**:
- `npm install` fails with `sh: 1: husky: not found`.

**Cause**:
- `husky` is a devDependency but the environment is set to `production`, or git hooks are failing in a non-git environment.

**Solution**:
- We have added a bypass in `package.json`. If it still fails, run:
- `npm install --no-scripts`
- Or explicitly bypass: `STAGED_HINT=none npm install`
### 12. Backend Won't Start (Missing Production Credentials)
**Symptoms**:
- Backend service starts but immediately shows `❌ CRITICAL: Missing required production environment variables` in the logs.
- Status check shows `Success: false` and database services as `unknown`.

**Cause**:
- For security reasons, development-style defaults (like user `root` or empty passwords) have been removed. If `NODE_ENV=production` is set, the system requires explicit credentials.

**Solution**:
- Check your `backend/.env` file.
- Ensure `DB_HOST`, `DB_USER`, `DB_NAME`, and `JWT_SECRET` are all defined.
- Restart the service: `pm2 restart sku-backend`.
- **Verification**: Check logs with `pm2 logs sku-backend` to ensure the "CRITICAL" warning is gone.

### 13. "Permission denied" on Deployment Scripts
**Symptoms**:
- Running `./scripts/deploy.sh` fails with `-bash: ./scripts/deploy.sh: Permission denied`.

**Cause**:
- The script file lost its executable permission bit, often during transfer or git checkout on Windows.

**Solution**:
- Run the following command to make it executable:
  ```bash
  chmod +x scripts/deploy.sh
  ```
- Then run it again: `./scripts/deploy.sh`

### 14. 500 Internal Server Error on Login (New Company)
**Symptoms**:
- After approving a **new company**, logging in with the correct email/password returns `500 Internal Server Error`.
- Logs mention `Table 'sku_tenant_....users' doesn't exist` or generic unhandled rejection.

**Cause**:
- The tenant database was created but **tables were not generated** (empty database). This previously happened because the system relied on empty migration folders.

**Solution**:
- **Fixed in Code (Phase 24)**: The system now uses `sequelize.sync` to ensure tables are always created.
- **For Broken Tenants**:
  1. If you have a tenant stuck in this state, **Delete the tenant** from the Landlord DB (or ignore it).
  2. Register a new company. The fix ensures new companies are provisioned correctly.

### 15. CSV Import Fails with Large Files (413 or Timeout)
**Symptoms**:
- Importing a CSV with many items (200+) fails with `413 Payload Too Large` or times out.
- Preview works but "Confirm Import" fails.

**Cause**:
- Default Express body parser limit was 100KB.
- Sequential database processing caused timeouts for large imports.

**Solution**:
- **Fixed in Code (Phase 25)**: Body limit increased to 10MB, import uses batch processing.
- **Max Supported**: Up to 1,000 items per import.
- **If still failing**: Split your CSV into multiple files of ~500 items each.

### 16. Emails Not Sending (Connection Timeout)
**Symptoms**:
- Company approval and user invitation emails never arrive
- Backend logs show: `[TenantApproval] Failed to send approval email: Connection timeout`
- `isEmailConfigured()` returns true but emails still fail

**Cause**:
- VPS providers (DigitalOcean, Vultr, AWS Lightsail, etc.) block outbound SMTP ports **587** and **465** by default to prevent spam abuse
- Even with correct Gmail App Password, the server cannot connect to `smtp.gmail.com`

**Diagnosis**:
```bash
# Test if port 587 is blocked
timeout 5 bash -c 'cat < /dev/tcp/smtp.gmail.com/587' && echo "OPEN" || echo "BLOCKED"
# Test if port 465 is blocked
timeout 5 bash -c 'cat < /dev/tcp/smtp.gmail.com/465' && echo "OPEN" || echo "BLOCKED"
```

**Solution**:
- **Use Brevo (free tier, 300 emails/day)**:
  1. Sign up at [brevo.com](https://www.brevo.com/)
  2. Go to Settings → SMTP & API → Generate SMTP Key
  3. Update `.env`:
  ```env
  SMTP_HOST=smtp-relay.brevo.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=your-brevo-account-email
  SMTP_PASS=your-brevo-smtp-key
  EMAIL_FROM=skupervisor@gmail.com
  ```
  4. Restart: `pm2 restart sku-backend`

- **Alternative**: Contact your VPS provider to unblock SMTP ports


### 17. Purchase Order "Mark All Received" sets quantity to 0
**Symptoms**:
- Clicking "Mark All Received" for items with decimal quantities (e.g., 0.50) sets them to 0.00.
- "Ordered" badge shows 0.00 even though a quantity was ordered.

**Cause**:
- The frontend was using `parseInt()` to parse quantity values from strings. `parseInt("0.50")` returns `0`, truncating decimal values.

**Solution**:
- **Fixed in Code (Phase 32)**: Replaced `parseInt()` with `parseFloat()` in `POReceiptModal.jsx`. 
- **Verification**: Refresh the page and try again. The ordered quantity should now display correctly (e.g., 0.50), and "Mark All Received" will work as expected.

### 18. New Purchase Orders show "Ordered: 0.00" or have no items
**Symptoms**:
- After successfully creating a PO in the wizard, the PO appears in the list but shows "0 items" or clicking "View" shows items with 0.00 quantity.

**Cause**:
- A key mismatch in the `POCreateWizard.jsx`. Selected items were being mapped to a supplier using a key that combined `supplier_id` and `id`, but the submission logic was only checking against `id`. This caused the item list to be empty during the actual API call.

**Solution**:
- **Fixed in Code (Phase 32)**: Standardized the supplier lookup key throughout the wizard. 
- **For Broken POs**: Existing POs with 0 quantity cannot be "fixed" via the UI. You should archive them and create a new PO, which will now be created correctly with the fix.

### 19. AI Chat Image Upload Returns 500 Error
**Symptoms**:
- Uploading an image to the AI Chat fails with 500 Internal Server Error
- Error message: `string violation: title cannot be an array or an object`
- Loading the AI Chat page after a failed image upload also returns 500 errors

**Cause**:
- When images are uploaded, message content is stored as an array (with text and image_url parts)
- The `generateConversationTitle()` function assumed content was always a string
- Trying to set the conversation title with an array caused a Sequelize validation error

**Solution**:
- **Fixed in Code (Phase 33)**: Updated `aiController.js` to handle array message content
- The fix extracts the text portion from array content and handles edge cases
- **If still seeing errors**: Restart the backend to pick up the code changes


### 20. SSH Connection Timeout During Remote Deployment
**Symptoms**:
- Running `./scripts/deploy-remote.sh` fails with `ssh: connect to host ... port 22: Connection timed out`
- Cannot SSH into server from local machine

**Cause**:
- SSH alias (e.g., `hermes-cloud`) is not configured in `~/.ssh/config`
- Server uses a non-standard SSH port (not 22)
- Firewall or network restrictions

**Solution**:
- **Option 1**: Add SSH config to `~/.ssh/config`:
  ```
  Host hermes-cloud
      HostName 192.53.116.33
      Port 64428
      User root
  ```
- **Option 2**: Use explicit port in command: `ssh -p 64428 root@192.53.116.33`
- **Fallback**: Push to GitHub, then manually SSH and run `./scripts/deploy.sh`

### 21. Git Pull Fails with "Password Authentication Not Supported"
**Symptoms**:
- Running `git pull` on server prompts for password
- Error: `remote: Invalid username or token. Password authentication is not supported for Git operations.`

**Cause**:
- GitHub deprecated password authentication in 2021
- The server is using HTTPS remote with no stored credentials

**Solution**:
- **Configure Git Credential Helper with PAT**:
  ```bash
  # On the server
  git config --global credential.helper store
  echo "https://YOUR_USERNAME:YOUR_GITHUB_PAT@github.com" > ~/.git-credentials
  ```
- **Alternative**: Switch to SSH remote:
  ```bash
  git remote set-url origin git@github.com:USERNAME/REPO.git
  ```
- **Verification**: Run `git pull origin master` - it should work without prompting

### 22. PM2 "--env production" Fails Without ecosystem.config.js
**Symptoms**:
- `pm2 restart all --env production` fails with:
  `[PM2][ERROR] Using --env [env] without passing the ecosystem.config.js does not work`

**Cause**:
- The `--env` flag requires an ecosystem config file that defines environment-specific variables

**Solution**:
- Use the ecosystem file: `pm2 startOrRestart ecosystem.config.js --env production`
- Or restart without env flag: `pm2 restart all --update-env`
- **Verification**: Check `ecosystem.config.js` exists in project root with `env_production` block

