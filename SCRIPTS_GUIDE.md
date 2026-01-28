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

### 2. `kill-dev.sh` - Kill All Development Servers

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
