# SKU Inventory Manager - Project Context

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
- Backend: `/backend/src/`
- Frontend Components: `/apps/dgfy-web/Components/`
- Frontend Pages: `/apps/dgfy-web/Pages/`
- Documentation: `/docs/` and root `.md` files
- System Audit: `/System_Audit/`

## Development Commands
- Full Stack: `npm run dev` (Concurrent Backend + Frontend)
- Backend Only: `npm run dev:backend` (Port 5000 in dev, 5001 in prod)
- Frontend Only: `npm run dev:frontend` (Port 5173)
- Database: `cd backend && npx sequelize-cli db:migrate`

## Notes
- Last updated: 2026-02-20
- Use `CLAUDE.md` and `.claude/hooks/session-start.sh` for session-specific context.
