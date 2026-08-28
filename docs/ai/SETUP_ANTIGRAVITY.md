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
- `/verify-ai`: Runs the AI-assistant QA verification script (`apps/dgfy-api`'s `npm run verify:ai`)
  — not Playwright, despite the older description here; it's a scripted tool-call/tenant-data check.
- `/sync`: Synchronizes npm dependencies for root, `apps/dgfy-api`, `apps/dgfy-migration-runner`, and
  the three frontend apps.
- `/fix`: Automatically runs linting and formatting fixes.
- `/audit`: Runs frontend + backend lint checks plus an endpoint smoke test against local dev.

`/start-dev` and `/health` were removed (#365) — both were 100% PM2-based
(`pm2 start ecosystem.config.cjs`, `pm2 status`), and PM2 governs neither local dev (`npm run dev`,
via `concurrently`) nor production (`docker compose`) today. Use `npm run dev` directly for local
dev, and see `AGENTS.md`'s `verifier` role / `.github/workflows/verify-deployment.yml` for checking
a deployed environment's health.

### Workflow Annotations
These are defined in `.agent/workflows/`.
- `// turbo-all`: Tells the agent that every command in the workflow is safe to auto-run.

---

## 3. Maintenance
If you encounter a command that should **never** be auto-run, add it to the **Deny List Terminal Commands** in the Antigravity Settings sidebar.
