# Troubleshooting Guide

## Common Issues & Solutions

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
- **Workflow**: Avoid mixing manual `node` runs with PM2 commands to prevent port conflicts and confusion.
