# Stack Research

**Domain:** DGFY standalone database-first Strangler Fig refactor
**Researched:** 2026-07-10
**Confidence:** MEDIUM for external library/tool guidance; HIGH for repository architecture constraints

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 in Docker, `>=18` package floor | Runtime for migration runner and backend tenancy foundation | Matches existing backend/DGFY API runtime and avoids introducing a second migration runtime. Use the production Docker baseline (`node:22-alpine`) for the runner image so scripts behave like deployed APIs. Confidence: HIGH from repo stack. |
| Sequelize | `^6.37.8` | Schema migration/query layer for MySQL landlord and tenant databases | Already used by `backend` and `apps/dgfy-api`; keeping it avoids a risky ORM/tooling split during the refactor. Use migrations/queryInterface for schema work, not model sync. Confidence: HIGH from repo stack, MEDIUM from Context7 docs. |
| Sequelize CLI | Current project dependency when added to runner/package scope | Simple DB-backed schema migration execution | Use for straightforward `db:migrate` execution where standard Sequelize migration tracking is enough. Configure `migrationStorage: "sequelize"` and an explicit table name per database family. Confidence: MEDIUM. |
| Umzug | latest compatible `umzug` v3 line | Programmatic runner for multi-command migration image | Use Umzug for commands that Sequelize CLI does not model cleanly: `schema:landlord`, `schema:tenant-template`, `data:migrate`, `data:verify`, `status`, `rollback:step`, and report generation. It supports `SequelizeStorage`, custom context, pending/executed migration inspection, and explicit `up/down`. Confidence: MEDIUM. |
| MySQL | 8.0+ | Landlord, legacy, and new `dgfy_*` databases | Existing platform is MySQL-backed. MySQL 8 supports online DDL controls, explicit charset/collation, and mature InnoDB behavior. Migrations must still plan around metadata locks. Confidence: MEDIUM external, HIGH local fit. |
| Docker Compose / Docker | Current Compose V2 semantics | One-shot migration runner deployment artifact | Model the runner as an explicit one-shot service/job, not as API startup behavior. Compose supports healthcheck-gated dependencies and `service_completed_successfully` for services that must wait for migration completion. Confidence: MEDIUM. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mysql2` | project `^3.6.5` unless upgraded deliberately | Sequelize MySQL driver | Use everywhere Sequelize connects to legacy, landlord, and `dgfy_*` schemas. Do not introduce a second driver for migration scripts unless a single script has a proven Sequelize limitation. |
| `dotenv` | existing project version | Local/dev env loading | Use only for local/dev convenience. Production runner should receive env from Compose/host secrets, not committed files. |
| `winston` or existing logger | existing backend convention | Structured migration logs | Use for JSON-ish per-step logs and operator evidence. Avoid ad hoc console-only scripts for production migration work. |
| `zod` or a small local env validator | add only if no existing validator fits | Fail-fast command env contract | Use to validate `DB_HOST`, legacy DB names, target DB prefix, destructive flags, dry-run flags, and command mode before any connection opens. Keep it runner-local if introduced. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm --prefix <runner-or-backend> run migrate:*` | Stable operator command surface | Expose named commands instead of expecting operators to remember raw Sequelize/Umzug flags. |
| `docker compose run --rm dgfy-migration-runner <command>` | Manual/rehearsal execution | Runner exits non-zero on failed validation, failed migration, detected drift, or verification mismatch. |
| `docker compose up --wait` with healthchecks | Local stack readiness | MySQL should be `service_healthy`; API services may depend on migration completion only in controlled stacks. |
| JSON report files under `tmp/` or mounted `/reports` | Evidence and rollback review | Every dry-run, apply, and verify command should emit counts, timings, source/target checksums where possible, skipped records, and warnings. |

## Installation

```bash
# In the runner package or backend package that owns migration tooling
npm install sequelize mysql2 umzug dotenv

# If using Sequelize CLI directly from this package
npm install -D sequelize-cli
```

Prefer a dedicated runner package or `apps/dgfy-api`-adjacent migration package over burying new production scripts in the legacy `backend/scripts` surface. If reuse from `backend` is unavoidable, keep the runner entrypoints isolated under a new clearly named directory and do not import legacy controllers/services.

## Prescriptive Operational Pattern

### Migration Runner Container

Build one migration image from the same Node and dependency baseline as `apps/dgfy-api`, with a single entrypoint that dispatches named commands:

```text
dgfy-migrate schema:landlord
dgfy-migrate schema:tenant-template
dgfy-migrate schema:tenant-all --dry-run
dgfy-migrate schema:tenant-all --apply
dgfy-migrate data:plan
dgfy-migrate data:migrate --checkpoint
dgfy-migrate data:verify
dgfy-migrate status
```

The runner must be a one-shot process: start, validate env, acquire a migration lock, run exactly one command, write a report, exit. Do not run migrations inside the long-running API container startup path. This keeps deploy behavior explicit and prevents a restarted API replica from unexpectedly changing schema.

### Migration Tracking

Use DB-backed tracking only:

| Database family | Tracking table | Recommendation |
|-----------------|----------------|----------------|
| `dgfy_landlord` | `dgfy_schema_migrations` or `SequelizeMeta` with explicit config | Prefer explicit table name for readability; preserve Sequelize/Umzug DB-backed storage. |
| Tenant schemas | same table name in each tenant DB | Track tenant schema migration state per tenant database, not globally only. |
| Data migration | `dgfy_data_migration_runs`, `dgfy_data_migration_checkpoints`, `dgfy_legacy_id_map` | Keep data-migration state separate from schema migration state. Schema applied does not mean legacy data transformed. |

Use Sequelize CLI for plain schema migrations when possible. Use Umzug for the runner orchestration because it can inspect pending/executed migrations, share a QueryInterface context, and run custom command workflows without shelling out to CLI commands.

### MySQL Safety Defaults

Use InnoDB and explicit `utf8mb4` charset/collation for every new `dgfy_*` database and table. Add indexes deliberately before high-volume verification queries. For ALTERs, prefer additive migrations and specify online DDL intent where MySQL supports it, such as `ALGORITHM=INPLACE` or `ALGORITHM=INSTANT` with `LOCK=NONE`, while still treating metadata lock waits as a real deployment risk.

For cutover rehearsals, run with production-like data volume and long-running-read detection. The report should include duration by table, rows read/written/skipped, warnings, lock wait failures, and the abort threshold result.

### Old-to-New Data Migration

Data migration scripts should be transformation jobs, not table copies. For the first database-first milestone:

- Read legacy SKUpervisor/current schemas as source of truth.
- Write only to new `dgfy_*` databases unless an approved compatibility seam says otherwise.
- Migrate Accounts, Businesses, Branches, Staff Accounts, Assignments, Terminals, and tenant registry first.
- For product/catalog migration later, scope `Item` rows to `category = 'product'`; skip raw materials, packaging, supplies, FIFO, and batch-costing.
- Maintain legacy-to-new ID maps so jobs are idempotent and re-runnable.
- Implement dry-run first, then apply, then verify; do not combine these into one opaque command.

### Verification Commands

Verification is a first-class runner mode, not an afterthought. Required commands:

| Command | Purpose | Failure Condition |
|---------|---------|-------------------|
| `status` | Show pending/executed schema migrations per landlord and tenant DB | Any unreachable DB or inconsistent metadata. |
| `schema:verify` | Confirm required tables/columns/indexes exist in every target `dgfy_*` DB | Any missing object or unexpected drift. |
| `data:verify` | Compare source-to-target counts, required mappings, uniqueness, and referential integrity | Missing required rows, duplicate mappings, orphan references, or mismatch over approved tolerance. |
| `cutover:preflight` | Validate env, backups, lock ability, target DB emptiness/expected state, and abort threshold config | Any missing prerequisite. |
| `cutover:report` | Produce human-readable and machine-readable migration evidence | Missing report artifact. |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Sequelize + Umzug runner | Sequelize CLI only | Use CLI only for simple schema-only phases. It is weaker for multi-command data migration, verification, and checkpoint orchestration. |
| Existing MySQL 8 + new `dgfy_*` schemas | PostgreSQL or another new database | Only consider after the Strangler milestone. Switching databases now adds operational and ORM risk without solving the immediate legacy extraction problem. |
| One migration image with named commands | Separate images for schema, data, verify | Separate images make version skew likely. One image ensures schema/data/verify logic uses the same code, dependencies, and commit. |
| Full-stop maintenance window for final cutover | Rolling dual-write migration | Rolling dual-write is for higher-scale systems that cannot stop. Current user volume makes full-stop safer because it avoids split-brain and reconciliation complexity. |
| DB-backed migration/checkpoint tables | Filesystem JSON migration state | Containers are ephemeral and multi-host deployment makes file state unsafe. Keep migration truth in MySQL. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| API startup migrations | Restarts and scaling events can mutate schema unexpectedly; failure mode is mixed app/migration state. | One-shot runner container with explicit command and exit status. |
| `sequelize.sync({ alter: true })` for production migrations | Existing repo concerns already show tenant drift and lock-prone alter behavior. It is too broad and hard to review. | Explicit Sequelize/Umzug migrations plus verification. |
| JSON or `none` migration storage | Not durable or auditable for containerized production migration state. | `migrationStorage: "sequelize"` / `SequelizeStorage`. |
| Raw legacy table copy | Carries SKUpervisor coupling into DGFY and preserves wrong boundaries. | Transform legacy rows into DGFY-owned schemas with ID maps. |
| Touching legacy backend/frontend outside approved seams | Violates the Strangler Fig safety boundary and increases regression risk for live users. | New `dgfy_*` DBs and new runner/backend foundation beside legacy; use documented compatibility facades only. |
| Cross-tenant live queries for Storefront/search | Breaks tenant isolation and does not scale with tenant count. | Landlord-owned materialized discovery/read model populated by jobs. |
| Introducing Prisma/Knex/Flyway/Liquibase now | They are credible tools, but adding a second migration stack in a brownfield Sequelize codebase creates duplicate conventions and review overhead. | Stay on Sequelize migrations; add Umzug only as orchestration around the same QueryInterface/storage model. |

## Stack Patterns by Variant

**If implementing schema migrations only:**
- Use Sequelize migration files and DB-backed metadata.
- Run them through the one-shot runner; Sequelize CLI is acceptable if it emits the required report.
- Because this aligns with existing repo conventions and keeps the first phase small.

**If implementing data migration/checkpointing:**
- Use a programmatic Umzug/Node command layer plus explicit checkpoint and legacy-ID-map tables.
- Because data transformation needs dry-run/apply/verify/report behavior that plain schema migration tools do not provide.

**If migrating tenant schemas:**
- Execute per-tenant migrations with bounded concurrency, per-tenant reports, and per-tenant migration metadata.
- Because existing tenant drift is a known risk and global landlord migration success does not prove tenant schema coverage.

**If preparing production cutover:**
- Use full-stop maintenance with backup, preflight, dry-run evidence, abort threshold, apply, verify, and reopen/rollback decision points.
- Because current scale makes a rehearsed stop-the-world migration safer than dual-write.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Sequelize `^6.37.8` | `mysql2 ^3.6.5` | Existing backend and DGFY API baseline. Keep until a dedicated dependency upgrade phase. |
| Umzug v3 | Sequelize v6 | Context7/official docs show `SequelizeStorage` tested with Sequelize v6. |
| Sequelize CLI | Sequelize v6 migrations | Use the project config file and explicit `migrationStorage` settings. |
| Node 22 Docker runtime | Existing Node `>=18` package floor | Runner should use Node 22 to match production images while not breaking package engine constraints. |
| MySQL 8.0+ | Sequelize MySQL dialect | Use explicit charset/collation and additive migrations; online DDL still needs lock-aware deployment planning. |

## Architecture Constraints Applied

| Constraint | Stack Implication | Confidence |
|------------|-------------------|------------|
| `routes -> controllers -> usecases -> repositories -> models` | Backend Accounts/Businesses/Tenancy APIs must put direct Sequelize access in repositories, not controllers/use cases. | HIGH |
| ADR 0003 compatibility facades | Legacy APIs may call new module use cases during migration, but legacy code is not the new source of truth. | HIGH |
| No legacy edits except seams | Runner and `dgfy_*` schemas are new artifacts beside legacy; POS API base URL/adapter work needs explicit seam approval. | HIGH |
| Tenant schema drift known risk | Tenant migration coverage and verification must be release gates, not manual optional scripts. | HIGH |
| Hardening contract for account/tenant provisioning | Accounts, registration, invitations, and tenant provisioning need replay/lifecycle/duplicate/failure tests before done. | HIGH |

## Sources

- `/sequelize/cli` via Context7 — verified `db:migrate`, DB-backed `SequelizeMeta`, `migrationStorage`, and storage-table customization. Confidence: MEDIUM.
- `/sequelize/umzug` via Context7 — verified `Umzug`, `SequelizeStorage`, custom context, and `up/down` runner behavior. Confidence: MEDIUM.
- `/docker/compose` via Context7 — verified healthcheck dependencies and `service_completed_successfully` one-shot job semantics. Confidence: MEDIUM.
- `/websites/dev_mysql_doc_refman_8_0_en` via Context7 — verified MySQL 8 metadata lock and online DDL guidance plus charset/collation syntax. Confidence: MEDIUM.
- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, `docs/architecture/adr/0003-migration-facade-strategy.md` — authoritative repo architecture and governance rules. Confidence: HIGH.
- `.planning/PROJECT.md`, `.planning/codebase/STACK.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `refactor/DGFY_Implementation_Phases.md`, `refactor/DGFY_Migration_Cutover_Strategy.md`, `refactor/DGFY_Developer_Technical_Reference.md` — project-specific stack, risk, and refactor context. Confidence: HIGH for repo facts; MEDIUM for future design details.

---
*Stack research for: DGFY standalone database-first refactor*
*Researched: 2026-07-10*
