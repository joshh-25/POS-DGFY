# dgfy-migration-runner

Standalone Sequelize migration/seed runner for the landlord database, extracted from
`apps/dgfy-api`'s migration domain as part of the `apps/` layout restructure — see
[`docs/architecture/apps-layout-migration.md`](../../docs/architecture/apps-layout-migration.md)
for why this package exists separately from the API.

This package only ever touches the **landlord** database (`DB_NAME`). Per-tenant schema sync is a
separate, non-blocking concern handled by `apps/dgfy-api`'s own entrypoint at boot — see that
package's README.

## Setup

1. Install dependencies:
```bash
npm install
```

2. (Optional) Create `.env` from `.env.example` if your local MySQL isn't on the defaults:
```bash
cp .env.example .env
```

`.env` is read from wherever you invoke `npm run migrate`/`npm run seed` (it's a plain,
CWD-relative `dotenv.config()` call in `src/config/sequelize.config.cjs`) — so run these commands
from inside this directory, or place `.env` here specifically.

3. Run migrations:
```bash
npm run migrate
```

4. (Optional) Seed sample data:
```bash
npm run seed
```

## Scripts

- `npm run migrate` - Run all pending migrations
- `npm run migrate:undo` - Rollback the last migration
- `npm run migrate:create -- --name migration_name` - Scaffold a new migration
- `npm run seed` - Run all seeders
- `npm run seed:undo` - Undo all seeders

## Environment variables

Read by `src/config/sequelize.config.cjs`. All have working local-dev defaults; **production
requires `DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_HOST` to be set explicitly** (no fallback in that
environment). `DB_DIALECT` is hardcoded to `mysql` in code, not read from env.

| Var | Default (development) | Notes |
|---|---|---|
| `DB_HOST` | `localhost` | Must match `apps/dgfy-api`'s `.env` |
| `DB_PORT` | `3306` | |
| `DB_NAME` | `sku_inventory_manager` | Landlord DB only — never a tenant DB |
| `DB_USER` | `root` | |
| `DB_PASSWORD` | `''` | |
| `SEQUELIZE_LOG_SQL` | unset (off) | Set `true` to log SQL to console |

See `.env.example` for the full annotated template, including the containerized-path note.

## Directory layout

```
apps/dgfy-migration-runner/
├── .sequelizerc          # resolves config/migrations/seeders paths
├── database-setup.sql    # initial DB/user creation (run manually, once, before first migrate)
├── migrations/            # 232+ migration files
├── src/
│   ├── config/sequelize.config.cjs
│   └── seeders/           # sample/seed data
└── package.json
```

## Docker

Containerized via `infrastructure/docker/dgfy-migration-runner/Dockerfile` — a one-shot CLI image
(`restart: "no"` in compose) that runs `db:migrate` to completion and exits.
`infrastructure/docker/docker-compose.yml`'s `dgfy-api` service depends on this one with
`condition: service_completed_successfully`, so migrations always run before the API starts.

In this path, `DB_HOST`/`DB_PORT`/`DB_DIALECT` are fixed by the compose file (always the
in-network `mysql` service) and `DB_NAME`/`DB_USER`/`DB_PASSWORD` come from
`infrastructure/docker/.env` — this package's own `.env`/`.env.example` above is irrelevant to the
containerized path and only matters when running `npm run migrate`/`npm run seed` directly on
your host.
