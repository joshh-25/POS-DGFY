# Helper Scripts Guide

This guide explains how to use the helper scripts to manage your development environment.

---

## 📜 Available Scripts

### 1. `kill-port.sh` - Kill Process on Specific Port

Kills a process running on a specific port.

**Usage:**
```bash
./kill-port.sh <port-number>
```

**Examples:**
```bash
# Kill backend (port 5000)
./kill-port.sh 5000

# Kill frontend (port 5173)
./kill-port.sh 5173

# Kill Redis (port 6379)
./kill-port.sh 6379

# Kill MySQL (port 3306)
./kill-port.sh 3306
```

**What it does:**
1. Searches for the process using the specified port
2. Displays the Process ID (PID)
3. Kills the process
4. Confirms the port is now free

**Error Messages:**
- `❌ Error: No port number provided` - You forgot to specify a port
- `❌ Error: Port must be a number` - You provided a non-numeric value
- `✅ Port X is already free` - No process is using that port
- `❌ Failed to kill process` - May need administrator privileges

---

---

### 2. `deploy.sh` - Automated Production Deployment

Automates the entire deployment process on the production server.

**Usage:**
```bash
./deploy.sh
```

**What it does:**
1. Pulls latest code from git
2. Installs dependencies (root, backend, frontend)
3. Builds the frontend (`NODE_ENV=production`)
4. Runs database migrations (idempotent)
5. Runs maintenance scripts: `deploy_fix_precision.js`, `surgical_migrate.js`, `deploy_fix_precision_v2.js`, `sync-tenant-schemas.js`, `register_legacy_tenant.js`
6. **Auto-injects** `RATE_LIMIT_MAX_REQUESTS=500` into `backend/.env` if not already set
7. Reloads PM2 via `ecosystem.config.cjs` (zero-downtime reload; falls back to restart if not running)
8. Saves PM2 process list (`pm2 save`) so processes survive server reboots
9. Health-checks `http://localhost:5000/health` (10 retries, 30s timeout) — displays DB/Redis/tenant pool status
10. Runs billing verification
11. Fails safely if any step errors out (`set -e`)

---

### 3. `deploy-remote.sh` - Remote Deployment Trigger (Local)

Triggers the production deployment from your local development machine.

**Usage:**
```bash
# Run from your local root directory
bash scripts/deploy-remote.sh
```

**What it does:**
1. **Confirmation**: Asks for explicit confirmation to avoid accidental deployments.
2. **Uncommitted changes check**: Detects local changes and optionally commits them before deploying.
3. **Git sync**: Fetches remote, detects divergence, and runs `git pull --rebase` automatically if the remote has commits your local branch doesn't — prevents push rejection errors.
4. **Git Push**: Pushes local `master` to GitHub.
5. **Remote Execution**: SSHs into the production server and executes `./scripts/deploy.sh`.
6. **Streaming**: Streams the remote deployment logs directly to your local terminal.

**Pre-requisites:**
- SSH access to `192.53.116.33` on port `64428`.
- SSH Key or server password.

> **Note:** This script is meant to run on your **local machine**, not on the server. If you're already SSH'd into the server, run `bash scripts/deploy.sh` directly instead.

---

### 4. `kill-dev.sh` - Kill All Development Servers

Kills all common development ports at once (5000, 5173, 5174).

**Usage:**
```bash
./kill-dev.sh
```

**What it does:**
- Kills backend on port 5000
- Kills frontend on port 5173
- Kills alternative frontend on port 5174
- Shows summary of what was cleaned up

**When to use:**
- When you want to restart everything fresh
- When ports are stuck and you're not sure which ones
- Before running `npm run dev`

---

### 4. `onboard-production-tenant.js` - Production Multi-Tenancy Setup

Registers existing production data into the central Landlord database.

**Usage:**
```bash
node backend/scripts/onboard-production-tenant.js
```

**What it does:**
1. Checks the `tenants` table for an existing primary tenant.
2. If none exists, creates "SureBiz Corp" as the primary tenant.
3. Automatically maps all active users from the `users` table to this tenant.
4. Generates a unique `company_token` for the company.

**When to use:**
- One-time setup when upgrading a single-tenant database to the Multi-Tenant version.
- If you see 404 errors during the "Email Lookup" phase of login on production.

---

### 5. `register_legacy_tenant.js` - Legacy Tenant Upgrade

Upgrades the primary legacy tenant (SureBiz Corp) to Premium plan standards.

**Usage:**
```bash
node backend/scripts/register_legacy_tenant.js
```

**What it does:**
1. Connects to the database and looks for the tenant with `db_name = 'sku_inventory_manager'`.
2. Updates their plan to `premium`.
3. Sets `subscription_status` to `active`.
4. Ensures the user mapping exists for `admin@test.com`.

**When to use:**
- If the main admin account is stuck on "Standard" plan after a deployment.
- If features like AI Chat or demand forecasting are locked for the Superadmin.

---

### 6. `deploy_fix_precision_v2.js` - Quantity Column Precision Migration

Upgrades all physical quantity columns to `DECIMAL(24, 12)` across every tenant database. Runs automatically via `deploy.sh` Step 5 on every deploy (idempotent — re-running is safe).

**Usage (manual):**
```bash
node backend/scripts/deploy_fix_precision_v2.js
```

**Tables & columns patched:**
| Table | Columns |
|-------|---------|
| `jo_ingredients` | `quantity_required`, `quantity_consumed`, `stock_before`, `stock_after` |
| `job_orders` | `quantity_to_produce`, `quantity_produced` |
| `po_line_items` | `quantity_ordered`, `quantity_received` |
| `stock_movements` | `quantity` |
| `fifo_batches` | `quantity`, `quantity_consumed` |
| `items` | `current_stock`, `max_capacity`, `min_threshold`, `purchase_allowance`, `batch_size` |

**When to use manually:**
- After adding a new tenant database to ensure their schema is immediately at full precision.
- If you see decimal truncation in JO ingredient quantities or stock levels.

---

### 7. `verify-qr-receiving-flow.js` - Service-Level Workflow Verification

Simulates the backend workflow for generating QR codes and receiving goods (PO/JO).

**Usage:**
```bash
node backend/tests/verify-qr-receiving-flow.js
```

**What it does:**
1.  **Creates a Test PO:** Order quantity 500.
2.  **Generates QR Token:** Simulates the backend API response for the "Generate QR" button.
3.  **Simulates Under-Receiving:** Attempts to receive 450/500 units. Verifies status becomes `partial`.
4.  **Simulates Over-Receiving:** Attempts to receive 550/500 units. Verifies status becomes `received` and inventory correctly updates.

**What it does not prove:**
- Real user engagement
- Frontend exposure or UX behavior
- Production traffic behavior
- Adoption or retention metrics

**When to use:**
- Immediately after a production deployment to verify the API and database are correctly synchronized.
- When troubleshooting "Unknown Column" or 500 errors in the Receive Token flow.

---

## 🎓 Tutorial: How to Use These Scripts

### Scenario 1: "Port 5000 is already in use" Error

**Problem:**
```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution:**
```bash
# Step 1: Kill the process on port 5000
./kill-port.sh 5000

# Step 2: Start your backend again
cd backend
npm run dev
```

**Output you'll see:**
```
🔍 Searching for process on port 5000...
📌 Found process with PID: 12345
🔪 Killing process 12345 on port 5000...
SUCCESS: The process with PID 12345 has been terminated.
✅ Successfully killed process on port 5000
🎉 Port 5000 is now free!
```

---

### Scenario 2: Multiple Ports Stuck

**Problem:**
Both frontend and backend won't start because ports are in use.

**Solution:**
```bash
# One command to kill all dev ports
./kill-dev.sh

# Then restart everything
npm run dev
```

**Output you'll see:**
```
🧹 Cleaning up development servers...
========================================

🔧 Backend (Port 5000):
✅ Successfully killed process on port 5000

⚛️  Frontend (Port 5173):
✅ Successfully killed process on port 5173

⚛️  Alternative Frontend (Port 5174):
✅ Port 5174 is already free

========================================
✅ All development servers cleaned up!

You can now run:
  npm run dev           # Start both
  npm run dev:backend   # Backend only
  npm run dev:frontend  # Frontend only
```

---

### Scenario 3: Forgot to Stop Server Before Closing Terminal

**Problem:**
You closed your terminal without stopping the dev server (Ctrl+C), and now it's still running in the background.

**Solution:**
```bash
# Kill the stuck port
./kill-port.sh 5000

# Or kill all dev ports
./kill-dev.sh
```

---

### Scenario 4: Custom Port Number

**Problem:**
You're running something on a custom port (e.g., 8080) and need to kill it.

**Solution:**
```bash
./kill-port.sh 8080
```

---

## 🔍 How to Find What Port a Process is Using

If you're not sure which port is in use:

```bash
# Show all listening ports
netstat -ano | grep "LISTENING"

# Show only specific port
netstat -ano | grep ":5000"
```

**Understanding the output:**
```
TCP    0.0.0.0:5000    LISTENING    12345
       ^^^^^^^^                      ^^^^^
       Port number                   PID (Process ID)
```

---

## 🛠️ Troubleshooting

### Script Won't Run

**Error:**
```
bash: ./kill-port.sh: Permission denied
```

**Fix:**
```bash
chmod +x kill-port.sh
chmod +x kill-dev.sh
```

---

### Script Not Found

**Error:**
```
bash: ./kill-port.sh: No such file or directory
```

**Fix:**
```bash
# Make sure you're in the project root
pwd
# Should show: /c/xampp/htdocs/SKU-Inventory-Manager

# If not, navigate to the project root
cd /c/xampp/htdocs/SKU-Inventory-Manager

# Then run the script
./kill-port.sh 5000
```

---

### Access Denied

**Error:**
```
❌ Failed to kill process. You may need administrator privileges.
```

**Fix:**
```bash
# Run your terminal as Administrator
# Right-click Git Bash -> Run as Administrator
```

---

## 📋 Quick Reference Commands

```bash
# Kill specific port
./kill-port.sh 5000           # Backend
./kill-port.sh 5173           # Frontend
./kill-port.sh 6379           # Redis
./kill-port.sh 3306           # MySQL

# Kill all dev servers
./kill-dev.sh

# Check if port is in use
netstat -ano | grep ":5000"

# Start development
npm run dev                   # Both frontend + backend
npm run dev:backend           # Backend only
npm run dev:frontend          # Frontend only
```

---

## 💡 Pro Tips

1. **Create an alias** (optional):
   Add to your `.bashrc` or `.bash_profile`:
   ```bash
   alias kp='./kill-port.sh'
   alias kd='./kill-dev.sh'
   ```

   Then use:
   ```bash
   kp 5000    # Instead of ./kill-port.sh 5000
   kd         # Instead of ./kill-dev.sh
   ```

2. **Add to package.json scripts**:
   ```json
   {
     "scripts": {
       "kill:port": "bash kill-port.sh",
       "kill:dev": "bash kill-dev.sh",
       "dev:clean": "bash kill-dev.sh && npm run dev"
     }
   }
   ```

   Then use:
   ```bash
   npm run kill:dev
   npm run dev:clean    # Kill all + start fresh
   ```

3. **Before starting development**:
   ```bash
   # Good practice - clean slate
   ./kill-dev.sh && npm run dev
   ```

---

## 🎯 Common Workflows

### Daily Development Workflow

```bash
# Morning - Start fresh
./kill-dev.sh
npm run dev

# Afternoon - Restart everything
./kill-dev.sh
npm run dev

# End of day - Clean up
./kill-dev.sh
```

### Debugging Workflow

```bash
# Something's wrong, let's start fresh
./kill-dev.sh
docker restart sku-redis
npm run dev
```

### Port Conflict Workflow

```bash
# Check what's using the port
netstat -ano | grep ":5000"

# Kill it
./kill-port.sh 5000

# Start your server
npm run dev:backend
```

---

## 📝 Notes

- These scripts only work in **Git Bash** or **WSL** on Windows
- They won't work in **CMD** or **PowerShell** (use `taskkill` directly instead)
- The scripts use `taskkill` which requires no admin privileges for most processes
- Scripts are safe to run multiple times - they'll just say "port is free" if nothing is running

---

## 🆘 Need More Help?

If you encounter issues:

1. Check if you're in the project root: `pwd`
2. Check if scripts are executable: `ls -la *.sh`
3. Try running manually: `bash kill-port.sh 5000`
4. Check Git Bash is up to date

For other issues, refer to the main [README.md](README.md) or [QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md).

### 9. `test_invitation_email.js` - Email Service Diagnostic

Tests the SMTP connection and invitation email flow.

**Usage:**
```bash
# Run from backend directory
node src/scripts/test_invitation_email.js --email=your@email.com
```

**What it does:**
1.  Verifies the SMTP connection defined in `.env`.
2.  Triggers a real invitation email to the specified address.
3.  Logs the outcome (Success/Failure) to the terminal.

**When to use:**
- After changing SMTP credentials.
- If users report they are not receiving invitations.
- To verify Gmail App Password configuration.

---

## 🤖 Workflow Automation (Antigravity/Turbo)

The project includes specialized workflows for the AI Agent (Antigravity) to automate complex tasks.

### Slash Commands
Use these commands in your chat with the agent to trigger predefined workflows:

| Command | Description | What it does |
| :--- | :--- | :--- |
| `/deploy` | **Deploy to Production** | Full cycle: Build frontend → Migrate DB → Restart PM2 → Verify health |
| `/sync` | **Sync Dependencies** | Runs `npm install` in root, backend, and frontend |
| `/health` | **System Health Check** | Checks PM2 status and scans error logs for last 100 lines |
| `/fix` | **Auto-Fix Code** | Runs `npm audit fix` and linting/formatting scripts |
| `/start-dev` | **Start Development** | Configures and starts the dev environment via PM2 |

### Turbo Mode
These workflows use the `// turbo-all` annotation, which empowers the agent to:
- **Auto-execute terminal commands** without asking for permission for every step.
- **Auto-accept** standard prompts when safe to do so.

*Note: You can review these workflow definitions in `.agent/workflows/`.*
