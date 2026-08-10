# SKU Inventory Manager

SKU Inventory Manager is a monorepo for a multi-surface product:

- `skupervisor`: inventory, purchasing, production, reports, and admin workflows
- `pos`: cashier and terminal operations
- `store`: public storefront, guest checkout, tracking, and location-aware ordering

The current architecture direction is a modular monolith on the backend with guarded boundaries:

`routes -> controllers -> usecases -> repositories -> models`

Authoritative planning entry: [docs/START_HERE.md](docs/START_HERE.md)

## Monorepo Layout

```text
SKU-Inventory-Manager/
|- apps/
|  |- dgfy-api/              # Express + Sequelize API
|  |- dgfy-migration-runner/ # Sequelize migrations, seeders, DB bootstrap
|  |- dgfy-web/               # Vite apps: skupervisor, pos, store
|  \- dgfy-android-bridge/    # imin-wrapper Android app
|- docs/                # Architecture, API, database, testing, reference
|- scripts/             # Repo-level helpers and docs tooling
|- packages/            # Shared/internal packages
\- package.json         # Root scripts
```

> There is no `backend/`, `frontend/`, or `android/` at the repo root — they were
> relocated under `apps/`. See
> [docs/architecture/apps-layout-migration.md](docs/architecture/apps-layout-migration.md)
> for the full path map and before/after local-run commands.

## Current App Surfaces

- `apps/dgfy-web/apps/skupervisor`: primary tenant/admin app
- `apps/dgfy-web/apps/pos`: POS terminal app
- `apps/dgfy-web/apps/store`: public storefront app

## Quick Start

Prerequisites:

- Node.js 18+
- npm 9+
- MySQL 8+
- Redis 7+ (recommended)

Install everything:

```bash
npm run install:all
```

Start the full stack:

```bash
npm run dev
```

Or run individual surfaces:

```bash
npm run dev:backend
npm run dev:skupervisor
npm run dev:pos
npm run dev:store
```

## Useful Scripts

```bash
npm run build
npm run build:skupervisor
npm run build:pos
npm run build:store
npm run test
npm run audit:dependencies:prod
npm run audit:dependencies
npm run audit:storefront-public-visibility
npm run lint:docs
npm run doctor:runtime
npm run smoke:pos-local
npm run check:architecture
npm run check:frontend-budgets
npm run check:compliance
```

## Key Capabilities

- Inventory, suppliers, purchase orders, and receiving
- Job orders and nested product production flows
- FIFO-aware stock movement and reconciliation checks
- POS checkout, discounts, service fees, terminal shifts, and Z-reading
- Unified sales read model
- Tenant locations and storefront discovery
- DGFY account-led company registration with auto-activation, tenant-session handoff, and first-login onboarding for brand assets, opt-in public map/page visibility, primary location, and starter items
- Public store catalog, quote, checkout, booking, waitlist, and order tracking
- Customer Access Mode, Inventory Display, and public Storefront visibility controls for rollout-gated customer behavior
- Services Mode with item-backed service catalog rows, bookings, resources/providers, reminders, intake forms, and stock-exempt POS service sales
- Food & Beverage Mode with menu modifiers, dining areas/tables, checks, kitchen tickets, reservations, and restaurant service-charge snapshots
- AI-assisted workflows and generated AI docs

## Documentation

Start here:

- [docs/START_HERE.md](docs/START_HERE.md)

High-value docs:

- [docs/architecture/apps-layout-migration.md](docs/architecture/apps-layout-migration.md)
- [docs/architecture/ARCHITECTURE_BOUNDARIES.md](docs/architecture/ARCHITECTURE_BOUNDARIES.md)
- [docs/architecture/ARCHITECTURE_GOVERNANCE.md](docs/architecture/ARCHITECTURE_GOVERNANCE.md)
- [docs/api/specification.md](docs/api/specification.md)
- [docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md](docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md)
- [docs/database/schema.md](docs/database/schema.md)
- [docs/development/environment-setup.md](docs/development/environment-setup.md)
- [docs/testing/README.md](docs/testing/README.md)
- [System_Audit/README.md](System_Audit/README.md)

## Notes

- Frontend build outputs are generated into `dist-apps/` and should not be treated as source.
- `System_Audit/` contains the current strict audit package; prior audit material is archived under `docs/archive/`.
- Historical implementation planning artifacts are archived under `docs/archive/reference/`.
- Governed/active documentation lives under `docs/`.
