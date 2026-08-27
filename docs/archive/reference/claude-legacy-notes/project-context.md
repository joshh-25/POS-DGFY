# SKU Inventory Manager - Project Context

> **Archived (#365, 2026-08-26).** Moved out of `.claude/` — a one-off historical status report, not a live agent instruction; the product-name/architecture framing in this document may be stale. `AGENTS.md` is the current, canonical source of truth.

## Project Overview
This is a multi-tenant SKU Inventory Manager system with React frontend and Node.js/Express backend, using MySQL database and Redis for caching. It supports distributed database-per-tenant architecture and AI-assisted inventory management.

## Technology Stack
- **Frontend**: React 18 + Vite, Tailwind CSS + Shadcn UI
- **Backend**: Node.js, Express, Sequelize ORM (MySQL 8.0)
- **Database**: MySQL (via XAMPP or separate instance)
- **Cache**: Redis (Docker or Memurai on port 6379)
- **Platform**: Multi-platform (Primary development on Windows/XAMPP)

## Key Decisions & Preferences
- Multi-tenant isolation is critical: always use `dbStore.get()` or `tenantHandler` context.
- UI components should follow Shadcn UI patterns.
- Backend logic resides in Services; Controllers only handle HTTP.

## Known Issues & Current Work
- Void/Reversal logic for stock movements (Current focus).
- AI cost control and token usage tracking.

## Important File Locations
- Backend: `/apps/dgfy-api/src/`
- Frontend shared trunk (Components/Pages/services, since issue #322's split): `/packages/web-core/`
- Frontend apps: `/apps/dgfy-ims/` (IMS), `/apps/dgfy-pos/` (POS), `/apps/dgfy-storefront/` (Storefront)
- Documentation: `/docs/` and root `.md` files
- System Audit: `/System_Audit/`

## Development Commands
- Full Stack: `npm run dev` (Concurrent Backend + Frontend)
- Backend Only: `npm run dev:backend` (Port 5000 in dev, 5001 in prod)
- Frontend Only: `npm run dev:skupervisor` (IMS, port 5173) / `npm run dev:pos` (port 5174) / `npm run dev:store` (port 5175)
- Database: `cd apps/dgfy-migration-runner && npx sequelize-cli db:migrate`

## Notes
- Last updated: 2026-08-15
- Use `CLAUDE.md` and `.claude/hooks/session-start.sh` for session-specific context.
