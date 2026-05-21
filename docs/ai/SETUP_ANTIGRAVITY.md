# Antigravity Automation Setup Guide

This guide documents the optimal settings for Antigravity to ensure a smooth, automated development experience in this project.

## 1. Extension Settings (In VS Code)

To enable "zero-click" execution for tests and scripts, configure the following in your **Antigravity Settings** sidebar:

### Terminal Section
- **Terminal Command Auto Execution**: Set to **`Always Proceed`**.
  - *This removes the "Accept" prompt for all terminal commands.*

### Artifact Section
- **Review Policy**: Set to **`Agent Decides`**.
  - *This allows the agent to skip approvals for minor doc updates while still asking for review on major implementation plans.*

---

## 2. Project-Level Automation

The project is configured with "Turbo" workflows to support this automation.

### Available Slash Commands
You can run these by typing them in the chat:
- `/verify-ai`: Runs the full end-to-end Playwright verification suite.
- `/start-dev`: Starts the backend and frontend using PM2.
- `/sync`: Synchronizes all npm dependencies.
- `/health`: Checks PM2 status and server logs.
- `/fix`: Automatically runs linting and formatting fixes.

### Workflow Annotations
These are defined in `.agent/workflows/`.
- `// turbo-all`: Tells the agent that every command in the workflow is safe to auto-run.

---

## 3. Maintenance
If you encounter a command that should **never** be auto-run, add it to the **Deny List Terminal Commands** in the Antigravity Settings sidebar.
