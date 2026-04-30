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

### 16. Emails Not Sending (SMTP Auth Failure Or Connection Timeout)
**Symptoms**:
- Company approval and user invitation emails never arrive
- Backend logs show `EAUTH`, `535 BadCredentials`, or `Connection timeout`
- `isEmailConfigured()` returns true but emails still fail

**Current verified state (2026-04-30)**:
- Local Gmail SMTP is configured but rejects the saved credential with `EAUTH 535 BadCredentials`. Use a valid Gmail App Password, not the normal account password.
- Production is configured for Brevo SMTP, but outbound SMTP to `smtp-relay.brevo.com` times out on ports `587`, `2525`, and `465`.
- Production firewall was checked: `ufw` inactive and `iptables OUTPUT ACCEPT`; this points to an upstream VPS/network SMTP block or provider policy rather than an application bug.
- HTTPS to Brevo works from production, but no valid Brevo API key is currently configured.

**Diagnosis**:
```bash
# Test common SMTP ports from the production host
timeout 5 bash -c 'cat < /dev/tcp/smtp.gmail.com/587' && echo "OPEN" || echo "BLOCKED"
timeout 5 bash -c 'cat < /dev/tcp/smtp.gmail.com/465' && echo "OPEN" || echo "BLOCKED"
timeout 5 bash -c 'cat < /dev/tcp/smtp-relay.brevo.com/587' && echo "OPEN" || echo "BLOCKED"
timeout 5 bash -c 'cat < /dev/tcp/smtp-relay.brevo.com/2525' && echo "OPEN" || echo "BLOCKED"
timeout 5 bash -c 'cat < /dev/tcp/smtp-relay.brevo.com/465' && echo "OPEN" || echo "BLOCKED"
```

**Solution**:
- **Local/testing**: Use Gmail SMTP with a Gmail App Password. The normal Gmail account password is expected to fail. Keep `EMAIL_FROM` aligned with `SMTP_USER`.
- **Production preferred**: Keep Brevo for production delivery, but first confirm the VPS/provider allows outbound SMTP to Brevo on `587`, `2525`, or `465`. If the provider blocks SMTP, request an outbound SMTP unblock or use a host/provider that permits SMTP relay.
- **Production alternative**: Add Brevo HTTPS API delivery with a valid Brevo API key. HTTPS already works from production, so this avoids outbound SMTP port restrictions.
- **Operational fallback**: Until real SMTP delivery is verified, invitation workflows remain usable through the manual-link delivery state in User Management.



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
- SSH returns `Permission denied (password)` during non-interactive deploy runs

**Cause**:
- SSH alias (e.g., `skupervisor-prod`) is not configured in `~/.ssh/config`
- Server uses a non-standard SSH port (not 22)
- Firewall or network restrictions
- Local machine has no deploy key configured
- Server SSHD may have `PubkeyAuthentication no`

**Solution**:
- **Option 1 (recommended)**: Configure key-based auth and alias:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/skupervisor_deploy_ed25519 -C "skupervisor-deploy"
  cat ~/.ssh/skupervisor_deploy_ed25519.pub | ssh -p 64428 root@192.53.116.33 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
  ```
  Add to `~/.ssh/config`:
  ```sshconfig
  Host skupervisor-prod
      HostName 192.53.116.33
      Port 64428
      User root
      IdentityFile ~/.ssh/skupervisor_deploy_ed25519
      IdentitiesOnly yes
  ```
  Verify:
  ```bash
  ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
  ```
- **Option 2**: Use explicit port in command: `ssh -p 64428 root@192.53.116.33`
- **If key auth is still ignored** (server-side):
  ```bash
  sshd -T | grep pubkeyauthentication
  ```
  Expected output:
  ```text
  pubkeyauthentication yes
  ```
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

### 22. AI-Created Purchase Orders Show $NaN Total Cost
**Symptoms**:
- Creating a Purchase Order via AI chat results in `$NaN` for "Total Cost" in the result card
- The PO is created in the database but with `NaN` for `total_amount`

**Cause**:
- Field name mismatch between `aiToolExecutor.js` and `purchaseOrderService.js`
- The AI executor sent `quantity` but the PO service expected `quantity_ordered`
- `parseFloat(undefined)` → `NaN`, which propagated through all calculations

**Solution**:
- Fixed in `aiToolExecutor.js` line 822: changed `quantity: item.quantity` to `quantity_ordered: item.quantity`
- Added `!isNaN()` guard in `aiService.js` `formatResultForUI` as defensive fallback
- **Verification**: Create a PO via AI → result card should show correct dollar amount

### 23. PM2 "--env production" Fails Without ecosystem.config.js
**Symptoms**:
- `pm2 restart all --env production` fails with:
  `[PM2][ERROR] Using --env [env] without passing the ecosystem.config.js does not work`

**Cause**:
- The `--env` flag requires an ecosystem config file that defines environment-specific variables

**Solution**:
- Use the ecosystem file: `pm2 startOrRestart ecosystem.config.js --env production`
- Or restart without env flag: `pm2 restart all --update-env`
- Or restart without env flag: `pm2 restart all --update-env`
- **Verification**: Check `ecosystem.config.js` exists in project root with `env_production` block

### 24. Recurring 401 Unauthorized on First Login
**Symptoms**:
- Admin logs in successfully, but immediate subsequent requests (e.g., dashboard, user profile) fail with `401 Unauthorized`.
- Reloading the page sometimes temporarily fixes it, but the issue returns on the next login.
- Console logs show multiple 401 errors for `/api/v1/users/me` or `/api/v1/dashboard/*`.

**Cause**:
- The **Refresh Token** mechanism in the frontend (`api.js`) was attempting to refresh the session but failed to send the **Company Token** (`x-company-token`) header.
- In a multi-tenant system, the backend requires the Company Token to know which database to check the refresh token against. Without it, the refresh request fails, leading to a loop of 401s.

**Solution**:
- **Fixed in Code (Phase 34)**: Updated `frontend/src/services/api.js` to explicitly attach `x-company-token` from `localStorage` during the refresh flow.
- **Verification**:
  1. Open Console.
  2. Log in as Admin.
  3. Observe logs: `🔄 [Auth] Refreshing token... { companyToken: '...' }`.
  4. Ensure no red 401 errors appear in the network tab.

### 25. Recovering a Lost Tenant (Manual Provisioning)
**Symptoms**:
- A user paid successfully (e.g., via PayPal) but their tenant account was not created due to a race condition or server error.
- The user's email is not mapped to any company.

**Solution**:
- **Fixed in Code (Phase 35)**: The "Add Tenant" button in the Admin Portal is now fully functional and connected to the backend provisioning service.
- **Diagnosis**:
  To verify if a tenant is truly missing from the database, you can run:
  ```bash
  node backend/scripts/check_tenant.js
  ```
- **Manual Recovery Steps**:
  1. Log in to the **Admin Portal** (`/admin`).
  2. Click **"+ Add Tenant"**.
  3. Fill in the details:
     - **Company Name**: Use a safe name (e.g., from their PayPal transaction).
     - **Admin Email**: The user's email address.
     - **Admin Password**: Set a temporary password (share this with the user).
     - **Plan**: Select "Premium" (if they paid).
     - **Subscription ID**: Enter the PayPal Subscription ID if available (optional but recommended for linking).
  4. Click **"Create Tenant"**.
- The system will provision the database, seed the initial user, and link the email. The user can then log in immediately.

### 26. Sidebar Navigation Only Shows "Dashboard" (Permission Parsing)
**Symptoms**:
- User has Admin role with full permissions but sidebar only shows "Dashboard".
- Navigating directly to `/items` or `/suppliers` via URL works correctly.
- Console may show `PermissionContext: Setting empty permissions` despite user having permissions.

**Cause**:
- MariaDB returns JSON columns as **strings** (`"[\"items:view\",...]"`) instead of parsed arrays.
- `PermissionContext.jsx` checked `Array.isArray(user.permissions)` which returned `false` for string values.
- This resulted in an empty permission set, hiding all permission-gated navigation items.

**Solution**:
- **Fixed in Code (Phase 32)**: Added `typeof` check and `JSON.parse()` in `PermissionContext.jsx` before the array check.
- **Verification**: Log in and check the sidebar — all permitted nav items should be visible.

### 27. Dashboard Forecast Widget Shows "Upgrade" for Premium Users
**Symptoms**:
- User has a **Premium** plan but the Dashboard "AI Demand Forecasting" widget shows "Upgrade to Premium".
- The AI Chat page correctly recognizes the user as Premium (no gating).
- Refreshing the page doesn't fix the issue.

**Cause**:
- `Dashboard.jsx` read `currentUser?.company?.plan` from the global Zustand store.
- `Layout.jsx` fetched user data but stored it only in local React state, never syncing to the global store.
- The global `currentUser` remained `null`, causing the plan check to always fail.

**Solution**:
- **Fixed in Code (Phase 32)**: `Dashboard.jsx` now uses `tenantPlan` from `usePermission()` hook instead of the global store. `Layout.jsx` also syncs user data to the global store for consistency.
- **Verification**: Log in as Premium user → Dashboard should show the forecast chart, not the upgrade prompt.

### 28. PayPal Registration Redirect Fails (Timeout)
**Symptoms**:
- After completing PayPal payment (or clicking Mock Button), the screen stays on the registration form with a loading spinner for a long time.
- Redirection to Dashboard takes more than 15-20 seconds.

**Cause**:
- **Database Provisioning Latency**: Creating a new tenant involves creating a physical MySQL database, running all migrations (~40 tables), and seeding initial data. This is a heavy operation.
- **Concurrent DB Locks**: If the server is low on resources or handling multiple provisioning requests, MySQL may lock during `CREATE DATABASE`.

**Solution**:
- **Patience**: Redirection is designed to happen ONLY after the database is 100% ready. It typically takes 10-15 seconds in dev.
- **Check Backend Logs**:
  ```bash
  # Check for migration or provisioning errors
  tail -f backend/logs/app.log 
  ```
- **Force Check**: If stuck more than 60 seconds, check the **Admin Portal** to see if the tenant exists and is "Active". If active, you can manually log in via the Login page.
- **Dev Speedup**: Avoid running heavy migrations or DB scans while registering new tenants.

### 30. Zombie Database Left After Failed Provisioning
**Symptoms**:
- A `sku_tenant_*` database exists in MySQL but the tenant's status is `'failed'` in the landlord DB.
- Re-registering the same company name fails with a unique constraint error on `db_name`.
- Storage grows over time with orphaned databases from transient provisioning failures.

**Cause**:
- `provisionTenant` creates the database with `CREATE DATABASE` (a non-transactional DDL) before the steps that can fail: schema sync, admin seeding, and status update.
- Prior to Phase 35, the catch block only set `status: 'failed'` — it never dropped the partially-created database.

**Solution**:
- **Fixed in Phase 35**: The catch block in `tenantProvisioningService.js` now calls `deleteTenantDatabase(dbName)` as a compensating step immediately after marking the tenant as failed.
- The fix is protected by a `dbName.startsWith('sku_tenant_')` guard before calling, plus `deleteTenantDatabase`'s own prefix validation — production databases cannot be accidentally dropped.

**If zombie DBs already exist** (before the fix was deployed):
```sql
-- List candidate zombie databases
SHOW DATABASES LIKE 'sku_tenant_%';

-- Cross-reference against landlord tenants table to find orphans
SELECT db_name FROM tenants WHERE status = 'failed';

-- Drop confirmed orphans (verify name matches a failed tenant first)
DROP DATABASE IF EXISTS `sku_tenant_example_abc12345`;
```

### 29. Tenant Connection Pool Overflow Under Load
**Symptoms**:
- Under high concurrent traffic with many different tenants, database connections grow beyond `MAX_CACHED_CONNECTIONS` (20).
- MySQL shows excessive open connections or `Too many connections` errors.
- Idle tenant connections are never cleaned up.

**Cause**:
- The original `TenantConnector.evictOldestConnection()` only removed one connection at a time.
- Concurrent async calls to `getConnection()` could all pass the size check before any eviction completed (race condition).
- `IDLE_TIMEOUT_MS` was defined but never used — no periodic cleanup existed.

**Solution**:
- **Fixed in Phase 34**: `TenantConnector.js` was rewritten with:
  - `pendingConnections` Set to guard against race conditions
  - `evictConnections(count)` for batch eviction
  - Periodic idle cleanup every 60s (connections idle >10min are closed)
  - Sequelize pool `idle` reduced to 5s, `evict: 1000` added
- **Monitoring**: Check `/health` endpoint — `tenantPool` section shows active connections, capacity, and utilization percentage.
- **Verification**: Run `node --experimental-vm-modules backend/scripts/verify-pool-eviction.js` to stress-test the pool.

### 31. All API Requests Return 500 — `SequelizeAssociationError: alias used in two separate associations`
**Symptoms**:
- Every authenticated API call returns 500 immediately after the first request succeeds.
- Backend logs show: `SequelizeAssociationError: You have used the alias auditLogs in two separate associations. Aliased associations must have unique aliases.`
- Stack trace points to `getTenantModels` in `tenantModelFactory.js` called from `tenantHandler.js`.

**Cause**:
- `getTenantModels()` guarded model *class* re-definition (`if (sequelize.models[name])`) but ran the **associations block unconditionally** on every call.
- Since `TenantConnector` caches Sequelize instances per tenant, the same instance is reused across requests. Sequelize associations are class-level metadata — registering them a second time on the same model class throws.
- The `_tenantModelsInitialized` flag was set at the *bottom* of the function but never *checked* at the top of the associations section.

**Solution**:
- **Fixed in Phase 37**: Added `if (sequelize._tenantModelsInitialized) { return models; }` at the start of the associations block in `backend/src/utils/tenantModelFactory.js`.
- Associations are now defined exactly once per cached Sequelize instance and skipped on all subsequent requests for the same tenant connection.

### 32. All Authenticated Requests Return 500 When Redis Is Configured But Down
**Symptoms**:
- Every request requiring authentication returns 500.
- Backend error log shows: `Error: Redis is not connected (Fail-Closed)` from `cacheService.getCritical` → `isTokenBlacklisted` → `authenticate`.
- Redis is configured in `.env` (`REDIS_URL` is set) but the Redis process is not running.

**Cause**:
- `isTokenBlacklisted()` in `authService.js` had a fail-open guard for `REDIS_URL` **not configured** (returns `false`), but called `cacheService.getCritical()` when `REDIS_URL` was set — even if Redis was currently unreachable.
- `getCritical()` intentionally throws when the Redis connection is down (fail-closed by design for sensitive cache reads). Using it for token blacklist checking was incorrect since a disconnected Redis should not lock all users out.

**Solution**:
- **Fixed in Phase 37**: Added `if (!cacheService.isAvailable()) { return false; }` check in `isTokenBlacklisted()` before calling `getCritical`. When Redis is configured but currently unreachable, the blacklist check is skipped (fail-open) rather than throwing a 500.
- **Workaround if fix not yet deployed**: Start Redis (`redis-server` or via the service manager). The app will resume normal operation once Redis reconnects.

### 33. FIFOBatch Hook Fires Twice — Expiry Date Nulled on Valid Dates (Audit 2.6 footgun)
**Symptoms**:
- After any change to `tenantModelFactory.js` hook cloning logic, `FIFOBatch` records are unexpectedly nullified on valid expiry dates, or the `beforeSave` console warning appears for valid dates.
- Duplicate log entries: `[FIFOBatch] Invalid expiry_date detected` printed twice per save.

**Cause**:
- Sequelize expands proxy hooks at define-time. `{ beforeSave: fn }` in `FIFOBatch.js` becomes `options.hooks = { beforeSave: [fn], beforeCreate: [fn], beforeUpdate: [fn] }` after the initial `sequelize.define()`.
- If tenant model cloning iterates all three keys and calls `addHook` for each, `addHook('beforeSave', fn)` fans out internally to `beforeCreate` + `beforeUpdate` again — resulting in 2 registrations on those two hook points. The hook fires twice on every create/update.

**Solution**:
- **Fixed in Audit 2.6**: The hook re-application loop filters to canonical hook names only, skipping proxy targets (`beforeCreate`, `beforeUpdate`, `afterCreate`, `afterUpdate`). Only `beforeSave` (or equivalent canonical name) is passed to `addHook`; Sequelize handles the fan-out exactly once.
- If this regression surfaces again, inspect `m.FIFOBatch.options.hooks.beforeCreate.length` on a fresh tenant instance — it should be `1`, matching the source model.

### 34. PM2 Frontend Process Enters "errored" State After Deploy (Wrong Vite Mode)
**Symptoms**:
- `pm2 list` shows `sku-frontend` with status `errored` immediately after `deploy.sh` runs.
- `pm2 logs sku-frontend` shows Vite attempting to serve source files or failing because no entry point exists.
- The frontend site is unreachable (connection refused on port 5173).

**Cause**:
- `ecosystem.config.cjs` was configured to run the Vite **dev server** (`vite --host`) instead of the **preview server** (`vite preview`). The dev server is not suitable for production — it processes unbundled source files and requires full dev dependencies.
- If `script: 'npm'` + `args: 'run preview'` was used as an intermediate fix, npm intercepts `--host` as an npm config flag (not a vite flag), causing the wrong mode to run and a `npm warn Unknown cli config "--host"` warning.

**Solution**:
- Correct `ecosystem.config.cjs` to call the vite binary directly:
  ```javascript
  {
      name: 'sku-frontend',
      script: './node_modules/.bin/vite',
      args: 'preview --host --port 5173',
      cwd: './frontend',
      env: { NODE_ENV: 'production' },
      env_production: { NODE_ENV: 'production' },
  }
  ```
- **One-time server step**: PM2's `startOrReload` does NOT update the `script` property from cache. After changing the script path you must manually re-register the process:
  ```bash
  pm2 delete sku-frontend
  pm2 start ecosystem.config.cjs --only sku-frontend --env production
  pm2 save
  ```
- **Verification**: `pm2 list` should show `sku-frontend` as `online`. `curl http://localhost:5173/` should return `HTTP 200`.

### 35. Backend Health Check Returns 404 in deploy.sh (Port Mismatch)
**Symptoms**:
- deploy.sh Step 7 prints `Attempt X/10: HTTP 404. Waiting...` for all 10 retries.
- The backend is actually running and the API works fine — only the health check fails.
- `pm2 logs sku-backend` shows the server started successfully on a port other than 5000.

**Cause**:
- `deploy.sh` was hardcoded to ping `http://localhost:5000/health`.
- If `backend/.env` has `PORT=5001` (or any other port), the health check URL is wrong.
- Additionally, the `/health` route was registered in `server.js` **after** `app.use(tenantHandler)`. Any middleware error during startup could intercept the request before it reached the health route.

**Solution**:
- **Fixed in Phase 54**: `deploy.sh` now reads `PORT` dynamically from `backend/.env`:
  ```bash
  BACKEND_PORT=$(grep -E '^PORT=' "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2 | tr -d '[:space:]')
  BACKEND_PORT="${BACKEND_PORT:-5000}"
  API_HEALTH_URL="http://localhost:${BACKEND_PORT}/health"
  ```
- **Fixed in Phase 54**: `app.get('/health', ...)` in `server.js` is now registered **before** `app.use(tenantHandler)` so it is an unconditional fast path through no business middleware.
- **Manual check**: `curl -v http://localhost:<PORT>/health` — should return HTTP 200 JSON if server is running.

### 36. ERR_ERL_PERMISSIVE_TRUST_PROXY Spam in Production Error Logs
**Symptoms**:
- Error logs are flooded with `ERR_ERL_PERMISSIVE_TRUST_PROXY` on every request.
- The message reads: `express-rate-limit: "validate.trustProxy" ... The Express "trust proxy" setting is permissive`.
- Rate limiting still functions, but every request generates an error-level log entry.

**Cause**:
- `express-rate-limit`'s `validate: { trustProxy: true }` option means **"throw an error if the Express trust proxy setting is permissive"** — it is a *validation enforcement* flag, not a proxy enablement flag.
- When `app.set('trust proxy', true)` is set (required for Nginx in production) the library considers this permissive and raises the error to force developers to acknowledge the risk.

**Solution**:
- **Fixed in Phase 54**: Changed `validate: { trustProxy: true }` → `validate: { trustProxy: false }` on all four rate limiters in `backend/src/middleware/rateLimiter.js`.
- `trustProxy: false` opts out of the validation check entirely. The actual proxy header reading (`X-Forwarded-For`) is controlled by `app.set('trust proxy', true)` in `server.js`, which is unaffected.
- **Verification**: Restart the backend and tail logs — no `ERR_ERL_PERMISSIVE_TRUST_PROXY` lines should appear.

### 37. deploy.sh Changes (from git pull) Don't Take Effect on the Same Run
**Symptoms**:
- You edit `deploy.sh`, push to GitHub, and run `./scripts/deploy.sh`.
- The new steps/fixes you added are not executed — the old behavior persists.
- On the *next* deploy the new code runs correctly.

**Cause**:
- Bash reads the entire script file into memory before executing the first line.
- When `git pull` updates `deploy.sh` mid-execution, the old in-memory version continues running. The file on disk has been updated, but the process is still executing the old bytes.

**Solution**:
- **Fixed in Phase 54**: `deploy.sh` now re-executes itself immediately after `git pull` using `exec`:
  ```bash
  SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  if [ "${DEPLOY_REEXECED:-0}" != "1" ]; then
      export DEPLOY_REEXECED=1
      exec bash "$SCRIPT_PATH" "$@"
  fi
  ```
  `exec` replaces the current shell process with the freshly-pulled script. The `DEPLOY_REEXECED` guard prevents infinite re-execution.

### 38. Reports / Forecast Page Stalls or Times Out
**Symptoms**:
- The Reports page (Forecast section) takes 10-30s to load or times out entirely.
- PM2 logs show hundreds of identical `SELECT ... FROM stock_movements WHERE item_id = X` queries firing in rapid succession.
- Stalling is proportional to the number of active items (1,000 items = ~1,000 queries).

**Cause**:
`forecastService.js` originally looped over each active item and fired a separate `StockMovement.findAll()` per item — a classic N+1 query problem. With 1,000 items, this was ~1,000 sequential DB round-trips per page load.

**Solution**:
- **Fixed in Phase 55**: Replaced the loop with a single batch query using `Op.in` for all item IDs at once, then grouped results by `item_id` in a JS `Map`. Result: ~1,000 queries → 2 queries total.
- Ensure the `idx_stock_movements_item_id` index exists (created by migration `20260301000000-add-performance-indexes.cjs`).
- **Verification**: `pm2 logs sku-backend --lines 50` after loading Reports should show exactly 2 SQL queries for the forecast endpoint.

### 39. Sequelize `addIndex` with `ifNotExists: true` Has No Effect on MySQL
**Symptoms**:
- Migration using `queryInterface.addIndex(table, fields, { ifNotExists: true })` still throws `ER_DUP_KEYNAME: Duplicate key name` when re-run on MySQL.
- The option appears to be supported but silently does nothing for the MySQL dialect.

**Cause**:
Sequelize's MySQL dialect does not pass `IF NOT EXISTS` to the generated `CREATE INDEX` DDL. The option is accepted without error but ignored.

**Solution**:
Wrap `addIndex` in a try/catch and check the error message:
```js
try {
  await queryInterface.addIndex(table, fields, { name });
} catch (e) {
  if (!e.message?.includes('Duplicate key name') && !e.message?.includes('already exists')) {
    throw e;
  }
  // Index already exists — skip silently
}
```
This is the pattern used in `backend/migrations/20260301000000-add-performance-indexes.cjs`.
- After this fix, any change to `deploy.sh` takes effect on the same deploy run that pulled it.

### 40. Dispatch Order Void Shows Wrong Movement Type ("adjustment" Instead of "return")
**Symptoms**:
- Voiding a `goods_issue` stock movement creates a counter-entry with `movement_type = 'adjustment'` instead of `movement_type = 'return'`.
- The audit trail in Stock Movements shows incorrect types for DO reversals.

**Cause**:
- `voidMovement()` in `stockMovementService.js` had `if/else if` branches for mapping each movement type to its reversal type, but `goods_issue` was missing — it fell through to the `else` default of `'adjustment'`.

**Solution**:
- **Fixed in Phase 56**: Added explicit case in `voidMovement()`:
  ```javascript
  else if (movement_type === 'goods_issue') reverseType = 'return';
  ```
- **Verification**: Void a `goods_issue` movement via Stock Movements page → the new counter-entry should have `movement_type = 'return'`.

### 41. Dispatch Order Lines Show Incorrect qty_dispatched After Void
**Symptoms**:
- After voiding a `goods_issue` stock movement, the Dispatch Order line still shows the original `qty_dispatched` value (e.g., still shows "50 dispatched" even though the movement was reversed).
- DO status does not revert from `completed` or `partial` after voiding.

**Cause**:
- `reference_id` on `goods_issue` movements stores the `DispatchOrderLine.line_id` (an integer), not the `do_number` string. If this value is incorrect or missing, the void hook cannot find the DO line to decrement.
- The void hook in `voidMovement()` only runs when `reference_type === 'DO'` — if the movement was somehow created with `reference_type = null`, the hook is skipped.

**Solution**:
- Verify the `goods_issue` movement has `reference_type = 'DO'` and `reference_id = <line_id>` in the `stock_movements` table.
- If a movement has incorrect metadata, manually update the DO line in the database:
  ```sql
  UPDATE dispatch_order_lines
  SET qty_dispatched = qty_dispatched - <voided_qty>,
      qty_voided = qty_voided + <voided_qty>
  WHERE line_id = <line_id>;
  ```
- Then run a status recalculation by re-fetching the DO — the status is computed from line quantities.

### 42. "Item Not Available for Dispatch" — Finished Goods Not Appearing in DOCreateModal
**Symptoms**:
- When creating a Dispatch Order, the item picker shows fewer items than expected, or specific finished goods are missing.
- Items that exist in the system and have stock are not selectable in the Dispatch Order create form.

**Cause**:
- `DOCreateModal.jsx` filters items using `canBeDispatched(item)` from `categoryHelpers.js`, which returns `true` **only** for items with `category = 'product'` AND `product_type = 'finished_goods'`.
- Items categorized as `raw_material`, `packaging`, or products with `product_type = 'wip'` (work-in-progress) are deliberately excluded from dispatch.

**Solution**:
- Check the item's category and product_type in the Items page → Edit → ensure `Category = Product` and `Product Type = Finished Goods`.
- This restriction is intentional: you dispatch finished goods, not raw materials or packaging. If the item is a finished product that's incorrectly categorized, update it.
- **Verification**: After updating the item's product_type to `finished_goods`, the item should appear in the DO item picker immediately (no cache to clear).

### 43. Dispatch Order Status Stuck on "Partial" After Full Dispatch
**Symptoms**:
- All DO lines show `qty_dispatched >= qty_ordered` but the DO header status remains `partial` instead of updating to `completed`.
- Refreshing the page does not change the status.

**Cause**:
- Status recalculation in `dispatchOrderService.js` requires ALL lines to meet `qty_dispatched >= qty_ordered`.
- If any line has `qty_ordered = 0` (zero-quantity line), or a floating-point precision mismatch (e.g., `qty_ordered = 1.0` vs `qty_dispatched = 0.9999999`), the check fails.

**Solution**:
- Check all DO lines for any zero-quantity lines and delete them before re-dispatching.
- For floating-point mismatches, the `qty_ordered` and `qty_dispatched` fields use `DECIMAL(24,12)` — verify no precision corruption occurred at input.
- **Workaround**: If the DO is functionally complete, you can trigger a re-dispatch of `qty = 0` (handled gracefully by skipping zero-qty lines) which re-triggers the status recalculation.

### 44. New DispatchOrder / DispatchOrderLine Models Return "Model Not Found" for Tenants
**Symptoms**:
- GET `/api/v1/dispatch-orders` returns 500.
- Error log: `Model 'DispatchOrder' not registered for tenant`.
- Dispatch Orders work on the landlord/main database but not for company tenants.

**Cause**:
- `DispatchOrder` and `DispatchOrderLine` were not added to the `modelNames` array in `backend/src/utils/tenantModelFactory.js`.
- This array controls which models are re-bound to each tenant's Sequelize instance. Models not in the list are invisible to tenant requests.

**Solution**:
- **Fixed in Phase 56**: Both model names are included in `modelNames`.
- If re-creating the tenant model factory from scratch, ensure both are present:
  ```javascript
  const modelNames = [
    // ...existing models...
    'DispatchOrder',
    'DispatchOrderLine',
  ];
  ```
- After adding, restart the backend and run `node backend/scripts/sync-tenant-schemas.js` to create the tables in all tenant databases.

### 45. `deploy.sh` Fails With "Another deployment appears to be running" But No Deploy Is Active
**Symptoms**:
- Deploy exits early with:
  `Another deployment appears to be running (lock: /tmp/skupervisor_deploy.lock)`
- `ps aux | grep deploy.sh` shows no active deploy process.
- The shell prompt appears between the "Re-executing deploy.sh" line and the lock error, e.g.:
  ```
  [INFO] Re-executing deploy.sh to ensure the latest script version is active...
  root@hermes-cloud:/var/www/skupervisor# [ERROR] Another deployment appears to be running
  ```

**Cause**:
- `deploy.sh` uses a lock handshake: it opens fd 9 (`flock -n 9`) and exports `DEPLOY_LOCK_ACQUIRED=1`, which the re-exec'd child is expected to inherit.
- If `deploy.sh` itself was **changed in the same `git pull`** (i.e., the old version re-executed the new version), a version mismatch in the lock handshake can cause the re-exec'd process to see a stale lock and fail.
- Also triggered by SSH disconnects or any other interruption that killed the holding process before `exec` completed, leaving the lock file on disk.
- The lock file is at `/tmp/skupervisor_deploy.lock`. Unlike PID files, the flock is released automatically when the holding process exits — but if the process was killed mid-exec, the file can persist without a holder.

**Solution**:
```bash
# 1. Confirm no deployment is actually running
ps aux | grep deploy.sh

# 2. If nothing is running, clear the stale lock and re-run
rm -f /tmp/skupervisor_deploy.lock
bash scripts/deploy.sh
```

> **Note**: The `git pull` already succeeded before the lock error. Re-running `bash scripts/deploy.sh` is safe and idempotent — it will re-pull (no-op if already up-to-date), then proceed with `npm ci`, build, migrations, and PM2 restart.

**Prevention**:
- This cannot be fully prevented when `deploy.sh` changes in the same pull (inherent to the self-re-exec design).
- If this recurs frequently, consider pinning the lock acquisition to a wrapper script that never changes.

### 46. Billing-Funnel Audit Degraded Because of `test_webhook_*` Rows
**Symptoms**:
- `npm run audit:billing-funnel` returns degraded
- Issue includes:
  `type=webhook_without_telemetry event_type=PAYMENT.SALE.COMPLETED correlation_id=test_webhook_...`

**Cause**:
- Synthetic webhook test rows were written to `webhook_logs` with handled PayPal event types.
- Strict telemetry audit treats them as real webhook records and expects matching telemetry events.

**Solution**:
```bash
mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
cd backend
npm run audit:billing-funnel
```

**Prevention**:
- Keep synthetic verification events out of handled production webhook event types.
