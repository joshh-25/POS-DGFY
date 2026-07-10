# Phase 02: dgfy-database-foundation - Research

**Researched:** 2026-07-10
**Domain:** Sequelize/Umzug/MySQL database foundation, migration-runner hardening, DGFY landlord/tenant schema contracts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Database Names and Layout
- **D-01:** Use `dgfy_core` as the DGFY platform/core database.
- **D-02:** Use per-business operational databases named `dgfy_business_<stable_opaque_suffix>`.
- **D-03:** Do not derive database names from sanitized business display names. Business rebrands must not rename databases or create name mismatches.
- **D-04:** Keep runner metadata separate in `dgfy_migration_meta`; do not fold runner audit/metadata tables into `dgfy_core`.
- **D-05:** Use plain table names inside DGFY-only databases. Do not add redundant `dgfy_` prefixes inside `dgfy_core` or `dgfy_business_*` by default.

### Core Database Responsibilities
- **D-06:** `dgfy_core` owns DGFY accounts, businesses, account-business memberships/ownership, business database registry/pointers, minimal audit, and public discovery/routing projection metadata where needed.
- **D-07:** Include a minimal `business_memberships` table now. Phase 2 behavior can enforce single-owner semantics initially, but the relationship model must support future manager/member roles without a disruptive schema rewrite.
- **D-08:** Use `business_database_registry` as the source of truth for business-to-database mapping. Store the actual `database_name`, stable opaque suffix, status, and verification timestamps there.
- **D-09:** Minimal audit tables should exist now for business creation, ownership/membership changes, business database pointer changes, and migration-sensitive admin actions. Full account/admin lifecycle audit can wait for API phases.

### Branches, Locations, and Discovery
- **D-10:** Canonical branches/locations live inside `dgfy_business_*` databases, not `dgfy_core`.
- **D-11:** `dgfy_core` may keep denormalized read/search/routing projections for public discovery, but these are not canonical branch/location truth.
- **D-12:** Use the explicit table name `storefront_discovery_index` for public Storefront discovery projection. Avoid a vague `discovery_index` name because future DGFY discovery surfaces may include products, services, food, jobs, events, or other marketplace concepts.
- **D-13:** Create a lightweight `storefront_discovery_index` foundation in Phase 2 if the database foundation includes discovery/search metadata. Keep it a projection table only; do not let it define operational branch, product, inventory, promo, or checkout truth.

### Per-Business Database Responsibilities
- **D-14:** The `dgfy_business_*` foundation should include staff/user authorization profiles, DGFY account-to-staff assignment/link metadata, role/permission basics needed for future tenant session checks, terminal identity, and tenant-local audit/ownership metadata.
- **D-15:** Defer products/items, promos, POS checkout, inventory, fiscal/compliance operations, and Storefront operational tables from Phase 2.

### Runner Hardening Before Real Migrations
- **D-16:** Start Phase 2 by hardening the Phase 1 migration runner paths that real schema migrations will rely on.
- **D-17:** Fix pending-only destructive migration detection so a historical destructive migration does not permanently require `--confirm-destructive` for unrelated future additive migrations.
- **D-18:** Ensure command failures reliably mark `command_executions` rows as `failed` rather than leaving them stuck at `running`.
- **D-19:** Ensure human-readable summaries report accurate command status instead of `status=unknown`.
- **D-20:** Set a container-safe report directory default so one-shot container reports persist to the intended mounted location.

### Verification Evidence
- **D-21:** Phase 2 verification must prove expected tables, columns, indexes, constraints, migration metadata records, and coverage for all targeted `dgfy_core` and `dgfy_business_*` schemas.
- **D-22:** Verification must prove migrations are additive and idempotent/re-runnable.
- **D-23:** Verification must include proof that legacy/current `sku_*` schemas were not mutated by Phase 2 schema migrations.
- **D-24:** Verification reports must be machine-readable and human-readable so CI/deploy tooling and operators can both consume the evidence.

### the agent's Discretion
No open implementation discretion was delegated beyond using the recommendations recorded above for discovery projection timing and one-active-operational-DB registry shape.

### Deferred Ideas (OUT OF SCOPE)
- Full account/admin lifecycle audit coverage waits for API phases.
- Products/items, promos, checkout, inventory, fiscal/compliance operations, and Storefront operational tables remain deferred from Phase 2.
- Storefront discovery projection can be lightweight in Phase 2; operational Storefront behavior and migration remain later-phase work.
</user_constraints>

## Summary

Phase 02 should be planned as migration-runner-first hardening followed by additive schema migrations and verification, not as backend API implementation. The current runner already has `apps/dgfy-migration-runner/src/commands/schema.js`, custom `MetaSequelizeStorage`, `dgfy_migration_meta.command_executions`, and JSON/summary report writers; local tests pass with `npm --prefix apps/dgfy-migration-runner test -- --watchman=false`. [VERIFIED: codebase grep + local test run]

The new DGFY schema must not copy legacy table names blindly. Inside `dgfy_core`, use plain tables such as `accounts`, `businesses`, `business_memberships`, `business_database_registry`, `business_audit_logs`, and lightweight `storefront_discovery_index`; inside each `dgfy_business_*`, use tenant-local canonical `locations`, `staff_accounts`, `account_staff_assignments`, `role_permissions`, `terminal_identities`, and `tenant_ownership_metadata`. This follows locked D-05 plain-name guidance while preserving current legacy patterns only as reference inputs. [VERIFIED: 02-CONTEXT.md, backend models/migrations]

**Primary recommendation:** Plan Wave 1 to fix runner hardening and schema/verification test seams, then Wave 2 to add `dgfy_core` migrations, Wave 3 to add `dgfy_business_*` foundation migrations, and Wave 4 to add verification evidence proving idempotency, metadata, tenant coverage, and zero legacy `sku_*` mutation. [VERIFIED: 02-CONTEXT.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Migration runner command surface | API / Backend tooling | Database / Storage | Runner owns explicit migration commands, validation, metadata, and reports before touching MySQL schemas. [VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js] |
| DGFY landlord foundation | Database / Storage | API / Backend | `dgfy_core` owns platform accounts, businesses, memberships, DB registry, audit, and projection tables. [VERIFIED: 02-CONTEXT.md] |
| Per-business foundation | Database / Storage | API / Backend | `dgfy_business_*` owns canonical branch/location, staff, assignment, terminal identity, and tenant-local ownership metadata. [VERIFIED: 02-CONTEXT.md] |
| Storefront discovery branch signal | Database / Storage | API / Backend | Landlord `storefront_discovery_index` is a projection; tenant-local locations stay canonical. [VERIFIED: ADR 0010 + 02-CONTEXT.md] |
| Schema verification evidence | API / Backend tooling | Database / Storage | Runner should inspect schemas and write machine/human-readable reports. [VERIFIED: apps/dgfy-migration-runner/src/commands/verify.js] |
| Legacy non-mutation proof | Database / Storage | API / Backend tooling | Verification must compare pre/post legacy schema fingerprints or table/column/index metadata. [VERIFIED: 02-CONTEXT.md] |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DBF-01 | New DGFY landlord schema is created beside legacy/current databases without mutating legacy schemas by default. | Use `TARGET_DB_NAME=dgfy_core`, target guard, and legacy schema fingerprint proof before/after runner execution. [VERIFIED: .planning/REQUIREMENTS.md, apps/dgfy-migration-runner/src/safety/targetGuard.js] |
| DBF-02 | DGFY landlord schema contains Accounts, Businesses, Branches, Tenancy registry, tenant database pointers, and migration metadata needed by the first backend scope. | Landlord should contain accounts/businesses/memberships/registry/audit and branch discovery projection; canonical branches stay tenant-local per D-10. [VERIFIED: 02-CONTEXT.md] |
| DBF-03 | New DGFY tenant schema foundation contains Staff Accounts, Assignments, Terminal identity, and tenant-local ownership metadata needed by the first backend scope. | Tenant schema should prepare staff account and terminal identity tables aligned with later tenant-session and POS terminal policy checks. [VERIFIED: backend/src/services/dgfyTenantSessionService.js, backend/src/services/dgfyPosTerminalPolicyService.js] |
| DBF-04 | Schema migrations are additive, repeatable, and tracked by migration metadata with no reliance on `sync({ alter: true })` as the production migration strategy. | Use Sequelize QueryInterface migrations under Umzug custom storage; official Sequelize docs warn against `sync({ alter: true })` in production. [CITED: Context7 /sequelize/website] |
| DBF-05 | Schema verification proves expected tables, columns, indexes, constraints, migration records, and tenant coverage for all targeted `dgfy_*` schemas. | Extend `verify` to inspect `information_schema`/QueryInterface metadata, `dgfy_migration_meta.schema_migrations`, and `business_database_registry` coverage. [VERIFIED: apps/dgfy-migration-runner/src/commands/verify.js] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Read docs in order before planning: `docs/START_HERE.md`, `ARCHITECTURE_BOUNDARIES.md`, `ARCHITECTURE_GOVERNANCE.md`, relevant ADRs, then domain docs. [VERIFIED: AGENTS.md]
- Do not use `docs/archive/**` or deprecated docs as planning sources. [VERIFIED: AGENTS.md]
- Cross-boundary changes require ADR update or new ADR. [VERIFIED: AGENTS.md, ARCHITECTURE_GOVERNANCE.md]
- New backend/API behavior must follow `routes -> controllers -> usecases -> repositories -> models`; controllers must not import Sequelize models directly. [VERIFIED: ARCHITECTURE_BOUNDARIES.md]
- PRs must follow `docs/ai/PR.md`, Conventional Commits, `develop` base for non-`rc/*`, the repository forbidden-marker scan before staging, and logical domain commit batches. [VERIFIED: AGENTS.md]
- Use Context7 for current library/framework/API docs. [VERIFIED: AGENTS.md]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | installed `^6.37.8`, registry latest `6.37.8`, modified 2026-06-29 | QueryInterface migrations and MySQL metadata inspection | Existing backend and runner ORM; official docs support QueryInterface table/index/constraint migrations. [VERIFIED: package.json + npm registry + Context7] |
| `umzug` | installed `^3.8.3`, registry latest `3.8.3`, modified 2026-05-01 | Programmatic migration runner with custom metadata storage | Current runner already uses Umzug with `MetaSequelizeStorage`; official docs support `up()`, context, glob migrations, and storage. [VERIFIED: package.json + npm registry + Context7] |
| `mysql2` | installed `^3.6.5`, registry latest `3.22.6`, latest flagged SUS due too-new | MySQL driver and metadata DB bootstrap | Existing repo deliberately pinned this below latest after Phase 1 legitimacy review; do not upgrade in Phase 02 without a checkpoint. [VERIFIED: package.json + package-legitimacy seam] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | installed/latest `15.0.0`, modified 2026-05-29 | CLI command routing | Keep existing command surface; no new CLI framework needed. [VERIFIED: package.json + npm registry] |
| `dotenv` | installed `^16.6.1`, latest `17.4.2`, modified 2026-06-24 | Local env loading | Load only at process entrypoint; `env.js` should remain side-effect free. [VERIFIED: apps/dgfy-migration-runner/src/config/env.js] |
| `jest` | installed `^29.7.0`, latest `30.4.2`, modified 2026-05-09 | Runner tests | Existing tests pass; avoid upgrading test framework in this schema phase. [VERIFIED: local test run + npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| QueryInterface migrations | `sequelize.sync({ alter: true })` | Reject for production: official Sequelize docs say `sync({ force/alter })` can be destructive and recommend migrations for production. [CITED: Context7 /sequelize/website] |
| Existing runner + Umzug | Sequelize CLI from backend | Reject for Phase 02: requirements require dedicated one-shot runner metadata and reports, not hidden backend startup or backend CLI side effects. [VERIFIED: RUN-01..RUN-05, apps/dgfy-migration-runner] |
| Handwritten SQL-only runner | Existing QueryInterface + raw SQL only where needed | QueryInterface keeps table/index/constraint patterns consistent; raw SQL is still acceptable for MySQL-specific introspection or generated columns. [VERIFIED: backend/scripts/sync-tenant-schemas.js] |

**Installation:**
```bash
# No new external packages recommended for Phase 02.
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `sequelize` | npm | published 2026-03-07 | 2,755,670/wk | github.com/sequelize/sequelize | OK | Approved existing dependency. [VERIFIED: package-legitimacy seam] |
| `umzug` | npm | published 2026-05-01 | 1,954,104/wk | github.com/sequelize/umzug | OK | Approved existing dependency. [VERIFIED: package-legitimacy seam] |
| `mysql2` | npm | latest published 2026-07-07 | 11,954,593/wk | github.com/sidorares/node-mysql2 | SUS: too-new | Keep existing `^3.6.5`; planner must add checkpoint before upgrading. [VERIFIED: package-legitimacy seam] |
| `commander` | npm | published 2026-05-29 | 429,376,979/wk | github.com/tj/commander.js | OK | Approved existing dependency. [VERIFIED: package-legitimacy seam] |
| `dotenv` | npm | published 2026-04-12 | 141,721,663/wk | github.com/motdotla/dotenv | OK | Approved existing dependency. [VERIFIED: package-legitimacy seam] |
| `jest` | npm | published 2026-05-09 | 42,043,156/wk | github.com/jestjs/jest | OK | Approved existing dev dependency. [VERIFIED: package-legitimacy seam] |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `mysql2` latest only; existing pinned dependency remains in use.

## Architecture Patterns

### System Architecture Diagram

```text
operator / CI
  |
  v
dgfy-migration-runner CLI
  |
  +--> validate env, runtime mode, target DB name, destructive flags
  |
  +--> hardening gates
  |     +--> pending-only destructive detection
  |     +--> command_executions failure completion
  |     +--> report dir + summary status correctness
  |
  +--> schema migrate
  |     +--> dgfy_migration_meta.schema_migrations
  |     +--> target dgfy_core migrations
  |     +--> target dgfy_business_* migrations
  |
  +--> verify
        +--> information_schema / QueryInterface checks
        +--> migration metadata checks
        +--> business_database_registry tenant coverage
        +--> legacy sku_* non-mutation fingerprints
        +--> JSON report + summary.txt
```

### Recommended Project Structure

```text
apps/dgfy-migration-runner/
├── src/commands/              # schema/verify/status command hardening
├── src/migrations/schema/     # additive DGFY core + business schema migrations
├── src/metadata/              # dgfy_migration_meta bootstrap/storage
├── src/reports/               # machine/human-readable reports
└── tests/                     # runner command, migration, verification tests

docs/database/
└── dgfy-foundation.md         # recommended: authoritative schema contract after implementation
```

### Pattern 1: Idempotent QueryInterface Migration

**What:** Check table/column/index existence before additive DDL, then add explicit indexes/constraints. [VERIFIED: backend/migrations/20260330000003-create-tenant-locations.cjs]
**When to use:** Every Phase 02 migration, because DBF-04 requires repeatable reruns. [VERIFIED: .planning/REQUIREMENTS.md]
**Example:**
```js
// Source: backend/migrations/20260330000003-create-tenant-locations.cjs
const existingTables = await queryInterface.showAllTables();
const tableSet = new Set(existingTables.map((entry) =>
  typeof entry === 'string' ? entry.toLowerCase() : String(entry.tableName || entry).toLowerCase()
));

if (!tableSet.has('locations')) {
  await queryInterface.createTable('locations', { /* columns */ });
  await queryInterface.addIndex('locations', ['is_active'], { name: 'idx_locations_active' });
}
```

### Pattern 2: Umzug With QueryInterface Context

**What:** Configure Umzug migrations with a glob, `targetSequelize.getQueryInterface()` as context, and custom storage backed by `dgfy_migration_meta.schema_migrations`. [VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js]
**When to use:** For all Phase 02 schema migrations. [VERIFIED: apps/dgfy-migration-runner/src/metadata/storage.js]
**Example:**
```js
// Source: apps/dgfy-migration-runner/src/commands/schema.js + Context7 /sequelize/umzug
const umzug = new Umzug({
  migrations: { glob: join(MIGRATIONS_DIR, '*.cjs'), resolve },
  context: targetSequelize.getQueryInterface(),
  storage: new MetaSequelizeStorage({ sequelize: metaSequelize }),
  logger: undefined
});

const pendingMigrations = await umzug.pending();
const executed = await umzug.up();
```

### Pattern 3: Projection Not Canonical Branch Truth

**What:** Use tenant-local locations as canonical data and landlord `storefront_discovery_index` as a denormalized projection. [VERIFIED: 02-CONTEXT.md, ADR 0010]
**When to use:** For DBF-02 "Branches" success criteria: landlord gets discovery/routing projection fields, not an operational branch source of truth. [VERIFIED: 02-CONTEXT.md]

### Anti-Patterns to Avoid

- **Creating `dgfy_*`-prefixed table names inside `dgfy_core`:** locked D-05 says plain names inside DGFY-only DBs. [VERIFIED: 02-CONTEXT.md]
- **Deriving DB names from display names:** locked D-03 says business rebrands must not rename databases. [VERIFIED: 02-CONTEXT.md]
- **Using backend `sequelize-cli db:migrate` for new DGFY foundation:** this bypasses Phase 1 runner metadata/report contracts. [VERIFIED: .planning/REQUIREMENTS.md]
- **Leaving all-file destructive scan in place:** current `schema.js` documents all-file scan behavior, but Phase 02 D-17 requires pending-only destructive detection before real migrations. [VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js, 02-CONTEXT.md]
- **Putting product/POS/inventory/fiscal tables into Phase 02:** D-15 explicitly defers them. [VERIFIED: 02-CONTEXT.md]

## Concrete Planner Targets

| Area | Files / Functions | Planning Guidance |
|------|-------------------|-------------------|
| Runner hardening | `apps/dgfy-migration-runner/src/commands/schema.js`, `src/safety/destructiveGate.js`, `tests/schemaCommand.test.js` | Replace all-file destructive scan with pending-only logic that still preserves pre-target destructive safety ordering. [VERIFIED: codebase grep] |
| Failure status | `src/commands/status.js`, `src/commands/rollbackPlan.js`, `src/commands/data.js`, `src/commands/schema.js`, `src/commands/verify.js` | Current `status`/`rollbackPlan` now mark failures; planner should add regression tests for all commands. [VERIFIED: codebase grep] |
| Metadata completeness | `src/metadata/bootstrap.js`, `src/metadata/storage.js`, `src/metadata/checksum.js` | Consider wiring checksums into schema migration records because the table has a `checksum` column but `MetaSequelizeStorage.logMigration` currently inserts only name/time. [VERIFIED: codebase grep] |
| Schema migrations | `apps/dgfy-migration-runner/src/migrations/schema/*.cjs` | Add DGFY core and per-business foundation migrations here, not under `backend/migrations`. [VERIFIED: Phase 1 runner structure] |
| Verify command | `apps/dgfy-migration-runner/src/commands/verify.js` | Extend beyond reachability booleans into schema, metadata, tenant coverage, idempotency, and legacy non-mutation report sections. [VERIFIED: current verify.js] |
| Legacy reference models | `backend/src/models/Landlord/DgfyAccount.js`, `DgfyAccountTenantMembership.js`, `Tenant.js`, `DgfyAccountBusinessAuditLog.js` | Use as field references, but adapt names to plain DGFY tables (`accounts`, `business_memberships`, etc.). [VERIFIED: codebase grep + 02-CONTEXT.md] |
| Tenant location/discovery reference | `backend/src/models/TenantLocation.js`, `backend/migrations/20260330000003-create-tenant-locations.cjs`, `StorefrontDiscoveryIndex.js`, `20260331000009-create-storefront-discovery-index.cjs` | Preserve canonical tenant-local location + landlord projection pattern. [VERIFIED: codebase grep + ADR 0010] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration orchestration | Custom file walker that marks migrations manually | Umzug with `MetaSequelizeStorage` | Existing runner already has storage/report contracts and official Umzug supports pending migrations/custom storage. [VERIFIED: codebase + Context7 /sequelize/umzug] |
| Production schema drift | `sync({ alter: true })` | Explicit QueryInterface migrations | Sequelize docs warn `sync({ alter })` is not production migration strategy. [CITED: Context7 /sequelize/website] |
| Schema verification | Ad hoc console-only checks | Runner `verify` JSON + summary reports | DBF-05 and D-24 require machine/human-readable evidence. [VERIFIED: .planning/REQUIREMENTS.md, 02-CONTEXT.md] |
| Tenant coverage | Manual checklist | `business_database_registry` + verification query | D-08 makes the registry source of truth for business-to-database mapping. [VERIFIED: 02-CONTEXT.md] |
| Legacy non-mutation proof | "We did not call legacy migrations" assertion | Pre/post `information_schema` fingerprints for `sku_*` schemas | DBF-01/D-23 require observable proof, not intent. [VERIFIED: 02-CONTEXT.md] |

**Key insight:** The risky part is not creating tables; it is producing repeatable evidence that the runner created only DGFY schemas, tracked exactly what ran, covered every targeted business DB, and left legacy schema metadata unchanged. [VERIFIED: 02-CONTEXT.md]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing legacy landlord DB defaults to `sku_inventory_manager`; legacy tenant DB names are stored in legacy `tenants.db_name`; runner metadata lives in `dgfy_migration_meta`. [VERIFIED: docs/database/schema.md, apps/dgfy-migration-runner/src/metadata/bootstrap.js] | Do not mutate legacy records. Create DGFY `business_database_registry` separately and verify legacy `sku_*` schema fingerprints unchanged. |
| Live service config | No external UI-managed config was found in research for Phase 02; Docker/env configuration controls runner target/source/meta DBs. [VERIFIED: apps/dgfy-migration-runner/src/config/env.js] | Planner should require explicit env examples for `SOURCE_DB_*`, `TARGET_DB_*`, `REPORT_DIR`, `MIGRATION_ACTOR`, and business DB target list. |
| OS-registered state | None identified for Phase 02 schema creation. [VERIFIED: no project docs mention OS registrations for this phase] | No OS registration task needed. |
| Secrets/env vars | Runner requires `SOURCE_DB_HOST`, `SOURCE_DB_USER`, `SOURCE_DB_PASSWORD`, `SOURCE_DB_NAME`, `TARGET_DB_HOST`, `TARGET_DB_USER`, `TARGET_DB_PASSWORD`, `TARGET_DB_NAME`, and production `MIGRATION_ACTOR`. [VERIFIED: apps/dgfy-migration-runner/src/config/env.js] | Add validation/tests for any new multi-target business DB list env. Do not store DB credentials in `business_database_registry`; store names/pointers/status only. |
| Build artifacts | Migration runner Docker image uses `/reports`; current Dockerfile sets `ENV REPORT_DIR=/reports`. [VERIFIED: infrastructure/docker/dgfy-migration-runner/Dockerfile] | Keep report evidence bind-mountable and include container run proof if Docker verification is in plan. |

**Nothing found in category:** OS-registered state: none verified by repository docs/code search. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Branch Table Ambiguity
**What goes wrong:** Planner creates canonical landlord branch/location tables to satisfy DBF-02 wording. [VERIFIED: .planning/REQUIREMENTS.md]
**Why it happens:** DBF-02 says landlord "Branches", but D-10 says canonical branches/locations live tenant-local. [VERIFIED: 02-CONTEXT.md]
**How to avoid:** Treat landlord branch data as `storefront_discovery_index` projection/routing metadata only; create canonical `locations` in `dgfy_business_*`. [VERIFIED: 02-CONTEXT.md, ADR 0010]
**Warning signs:** Foreign keys from operational POS/inventory/product tables to landlord branch projection. [ASSUMED]

### Pitfall 2: Destructive Gate Trains Bad Operator Behavior
**What goes wrong:** A historical destructive migration forces `--confirm-destructive` forever, so operators pass the flag reflexively. [VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js]
**Why it happens:** Current scan reads every `.cjs` migration file before connecting to meta DB. [VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js]
**How to avoid:** Plan a pending-only destructive check that can read metadata safely before target mutation and tests historical destructive + unrelated additive pending cases. [VERIFIED: 02-CONTEXT.md]
**Warning signs:** Test names only cover "any destructive file" instead of "pending destructive migration". [VERIFIED: apps/dgfy-migration-runner/tests/schemaCommand.test.js]

### Pitfall 3: Verification Only Checks Connectivity
**What goes wrong:** `verify` passes while required tables/indexes/constraints are missing. [VERIFIED: current apps/dgfy-migration-runner/src/commands/verify.js]
**Why it happens:** Current verify summary only includes metadata schema reachable, target DB reachable, and target DB name. [VERIFIED: codebase grep]
**How to avoid:** Add structured expected-schema contracts and compare actual schema metadata for `dgfy_core` and each `dgfy_business_*`. [VERIFIED: DBF-05]
**Warning signs:** Report has booleans but no per-table/per-column/per-index findings. [VERIFIED: current verify.js]

### Pitfall 4: Legacy Compatibility Tables Sneak Into DGFY Foundation
**What goes wrong:** Phase 02 recreates legacy product, POS, inventory, promo, or fiscal tables in DGFY databases. [VERIFIED: 02-CONTEXT.md]
**Why it happens:** Existing backend migrations contain many mature legacy tables that are tempting to copy. [VERIFIED: backend/migrations grep]
**How to avoid:** Limit DGFY core and tenant foundation to DBF-02/03 and D-14; defer products/POS/inventory/fiscal. [VERIFIED: 02-CONTEXT.md]
**Warning signs:** New migration names mention `items`, `pos_transactions`, `stock_movements`, promos, fiscal, or checkout. [VERIFIED: 02-CONTEXT.md]

## Code Examples

### Verify Schema Contract Shape
```js
// Source: recommended Phase 02 pattern from current verify.js + QueryInterface metadata APIs.
const expectedTables = ['accounts', 'businesses', 'business_memberships', 'business_database_registry'];
const actualTables = new Set((await queryInterface.showAllTables()).map(String));

const missingTables = expectedTables.filter((table) => !actualTables.has(table));
const columns = await queryInterface.describeTable('business_database_registry');
const indexes = await queryInterface.showIndex('business_database_registry');

return {
  table: 'business_database_registry',
  ok: missingTables.length === 0 && Boolean(columns.database_name),
  indexes: indexes.map((index) => index.name)
};
```

### Pending-Only Destructive Gate Test Shape
```js
// Source: planner should add a regression around schema.js behavior.
// Arrange: meta storage reports historical-destructive.cjs as executed.
// Arrange: pending migration list contains only additive-new-table.cjs.
// Assert: runSchemaMigrate({ confirmDestructive: false }) does not throw.
// Assert: target migration still records success and summary status=success.
```

### Legacy Non-Mutation Fingerprint
```sql
-- Source: recommended MySQL information_schema proof.
SELECT table_schema, table_name, column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema LIKE 'sku\_%' OR table_schema = 'sku_inventory_manager'
ORDER BY table_schema, table_name, ordinal_position;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Backend startup/Sequelize CLI migrations for app schema | Dedicated one-shot `apps/dgfy-migration-runner` with explicit commands, metadata, and reports | Phase 1, 2026-07-10 | Phase 02 schema work belongs in runner, not backend startup. [VERIFIED: Phase 1 verification] |
| `dgfy_*` table names in legacy landlord DB | Plain table names inside `dgfy_core` and `dgfy_business_*` | Phase 02 context, 2026-07-10 | Planner must translate legacy model names like `dgfy_accounts` to new `accounts` table in DGFY-only DB. [VERIFIED: 02-CONTEXT.md] |
| Legacy `tenants.db_name` as company DB pointer | `business_database_registry` source of truth | Phase 02 context, 2026-07-10 | Backend APIs in later phases should read DGFY registry, not infer from legacy tenant rows. [VERIFIED: 02-CONTEXT.md] |
| Landlord discovery index backed by legacy tenants | DGFY `storefront_discovery_index` projection sourced from `dgfy_business_*` locations later | Phase 02 context + ADR 0010 | Phase 02 creates lightweight projection foundation only. [VERIFIED: 02-CONTEXT.md, ADR 0010] |

**Deprecated/outdated:**
- `sync({ alter: true })` as production migration strategy: official Sequelize docs recommend migrations instead. [CITED: Context7 /sequelize/website]
- Treating `apps/dgfy-api` as owner of tenant memberships: ADR 0032 says membership/POS/tenant session are out of scope for that standalone mobile auth slice except a compatibility proxy. [VERIFIED: docs/architecture/adr/0032-standalone-dgfy-api-service.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Operational POS/inventory/product foreign keys to landlord branch projection are warning signs. | Common Pitfalls | Low; locked decisions already prohibit operational branch truth in landlord. |

## Open Questions

1. **How will Phase 02 choose the initial `dgfy_business_<stable_opaque_suffix>` databases to create?**
   - What we know: D-02 locks the name pattern and D-08 locks the registry fields. [VERIFIED: 02-CONTEXT.md]
   - What's unclear: whether Phase 02 seeds one test business DB, creates all configured targets from env, or reads a fixture list. [ASSUMED]
   - Recommendation: planner should add an explicit target-list contract before migration implementation.

2. **Should Phase 02 create a new authoritative `docs/database/dgfy-foundation.md`?**
   - What we know: docs/database is the schema contract location and schema.md is legacy/reference-heavy. [VERIFIED: docs/database/README.md, docs/database/schema.md]
   - What's unclear: whether documentation updates are required in this phase or deferred until APIs. [ASSUMED]
   - Recommendation: create a focused DGFY foundation doc if implementation changes cross a governed database contract.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runner tests/CLI | yes | v24.14.0 | Project requires >=18; current is acceptable. [VERIFIED: local command] |
| npm | Package scripts | yes | 11.12.1 | none needed. [VERIFIED: local command] |
| Docker CLI | Container verification | yes | 29.4.2 | If daemon unavailable, run local CLI/tests and defer container proof. [VERIFIED: local command] |
| MySQL CLI | Manual SQL inspection | no | not found | Use Node `mysql2` scripts or Docker MySQL client if needed. [VERIFIED: local command] |
| Watchman | Jest discovery | problematic in sandbox | EPERM to `~/.local/state/watchman` | Use `npm --prefix apps/dgfy-migration-runner test -- --watchman=false`. [VERIFIED: local command] |

**Missing dependencies with no fallback:** none for planning; live DB availability still required for execution evidence. [VERIFIED: environment audit]

**Missing dependencies with fallback:**
- MySQL CLI missing; use Node/mysql2 or containerized MySQL client. [VERIFIED: environment audit]
- Watchman not usable in sandbox; disable Jest watchman. [VERIFIED: local command]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Account tables must store password hashes only and email/phone verification timestamps without treating deferred phone verification as verified. [VERIFIED: backend/src/models/Landlord/DgfyAccount.js] |
| V3 Session Management | no direct Phase 02 runtime sessions | Later APIs own tokens/sessions; Phase 02 only prepares persistence. [VERIFIED: 02-CONTEXT.md] |
| V4 Access Control | yes | `business_memberships`, tenant-local assignments, role/permission basics, and terminal identity tables must support later authorization checks. [VERIFIED: DBF-03, dgfyTenantSessionService.js] |
| V5 Input Validation | yes | Runner env validation and target DB name allowlist must reject legacy DB targets by default. [VERIFIED: apps/dgfy-migration-runner/src/config/env.js, targetGuard.js] |
| V6 Cryptography | yes | Do not store plaintext passwords, OTPs, tokens, or DB credentials in DGFY registry/audit tables. [VERIFIED: current DGFY models and docs/database/schema.md] |

### Known Threat Patterns for Sequelize/MySQL Migration Runner

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental legacy schema mutation | Tampering | Target guard, DGFY-only target names, pre/post legacy `information_schema` fingerprints. [VERIFIED: DBF-01, D-23] |
| Unsafe migration filename from metadata | Elevation of privilege | `rollbackPlan.js` now rejects non-basename migration names before `require()`. [VERIFIED: apps/dgfy-migration-runner/src/commands/rollbackPlan.js] |
| Operator loses report evidence | Repudiation | Container `REPORT_DIR=/reports`, JSON + summary reports, DB-backed `command_executions`. [VERIFIED: Dockerfile, reportWriter.js, bootstrap.js] |
| Registry leaks DB secrets | Information disclosure | Store database names/pointers/status only; credentials stay env/runtime-managed. [VERIFIED: 02-CONTEXT.md, docs/database/schema.md] |
| Incomplete failed-run audit | Repudiation | Regression-test every command marks `command_executions.exit_status='failed'` on post-start failures. [VERIFIED: Phase 1 review + current command paths] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-dgfy-database-foundation/02-CONTEXT.md` - locked Phase 02 decisions.
- `.planning/REQUIREMENTS.md` - DBF-01 through DBF-05.
- `.planning/ROADMAP.md` and `.planning/STATE.md` - phase goal, dependency, and carried context.
- `docs/START_HERE.md`, `ARCHITECTURE_BOUNDARIES.md`, `ARCHITECTURE_GOVERNANCE.md` - planning and architecture constraints.
- ADRs 0001, 0003, 0004, 0010, 0029, 0032 - modular boundaries, migration facade, automation, discovery projection, domain ownership, DGFY API duplication boundary.
- `apps/dgfy-migration-runner/**` - runner implementation and tests.
- `backend/src/models/**`, `backend/migrations/**`, `backend/src/services/dgfy*.js` - legacy reference models and tenant-session/terminal patterns.

### Secondary (MEDIUM confidence)
- Context7 `/sequelize/website` - QueryInterface migrations and production `sync({ alter })` warning.
- Context7 `/sequelize/umzug` - Umzug programmatic migration API and storage/context patterns.

### Tertiary (LOW confidence)
- Assumption A1 only; no WebSearch-only claims were used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing package manifests, npm registry checks, package-legitimacy seam, and Context7 docs.
- Architecture: HIGH - locked CONTEXT.md plus authoritative architecture docs and ADRs.
- Pitfalls: HIGH - mostly backed by current code and Phase 1 review/verification.
- Environment: HIGH - probed local commands; live DB availability not tested.

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 for local architecture findings; re-check npm registry and Context7 docs before dependency upgrades.
