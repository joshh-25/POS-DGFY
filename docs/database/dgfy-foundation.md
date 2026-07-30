---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-07-15
applies_to: dgfy_database_foundation
topic: dgfy_database_foundation
---

# DGFY Database Foundation

This document is the authoritative schema contract for the new DGFY-owned
`dgfy_*` databases created in Phase 02 of the DGFY standalone refactor. It
covers the `dgfy_core` landlord foundation (Plan 02) and the per-business
`dgfy_business_*` tenant foundation and runner target-selection mechanism
(Plan 03), and records the boundaries verification evidence (Plan 04) must
respect.

It supersedes `docs/database/schema.md` as the canonical source for the new
DGFY-era schema. `docs/database/schema.md` remains the reference for the
current legacy/tenant schema (`sku_*` and legacy landlord tables); it is not
the new canonical DGFY schema.

## Governing Docs and ADRs

- `docs/START_HERE.md` — documentation lookup order (authoritative).
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend/API boundaries (authoritative).
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — ADR/evidence requirements (authoritative).
- `docs/architecture/adr/0001-modular-monolith-boundaries.md` — modular monolith boundary decision; future backend API code consuming this schema must go through module boundaries.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — beside-legacy migration strategy this foundation follows.
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md` — landlord discovery index projection/read-model contract this foundation's `storefront_discovery_index` follows.
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` — tenant-local-staff-first authentication model; DGFY account linkage is optional for staff and accepted-membership evidence is still required for DGFY linking.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — product/inventory/POS/Storefront operational ownership boundaries; explicitly out of scope here.
- `docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md` — terminal identity/policy is backend-authoritative later; this foundation stores only the identity/status/location-binding foundation.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — standalone DGFY API service boundary and `apps/*` convention.
- `docs/database/README.md` and `docs/database/schema.md` — legacy/current database reference (not canonical for DGFY-era schema).

**ADR impact:** Not needed. Plans 02 and 03 implement existing Phase 02
locked decisions (D-01 through D-15, D-21) and stay inside the boundaries
already accepted by ADR 0003, ADR 0010, and ADR 0029. No new architectural
decision is being introduced.

## Database Names and Layout (D-01, D-04, D-05)

- `dgfy_core` — the DGFY platform/landlord database. Created and migrated by
  `apps/dgfy-migration-runner` using `TARGET_DB_NAME=dgfy_core`.
- `dgfy_business_<stable_opaque_suffix>` — per-business operational databases
  (D-02). The naming pattern, tenant foundation contract, and runner target
  selection are implemented by Plan 03. `stable_opaque_suffix` is a stable
  opaque identifier and is never derived from a sanitized/normalized business
  display name (D-03), so business rebrands never rename a database or create
  a name mismatch. `dgfy_core.business_database_registry` (Plan 02) is the
  source of truth for the business-to-database mapping once registry rows
  exist; the runner's explicit `DGFY_BUSINESS_DB_NAMES` target list (below)
  is the accepted initial-verification mechanism before registry provisioning
  is wired up.
- `dgfy_migration_meta` — runner metadata (command executions, schema
  migration log). Kept separate from `dgfy_core` (D-04); no plan's migration
  writes runner audit/metadata tables into `dgfy_core` or any
  `dgfy_business_*` database.
- All tables inside `dgfy_core` and every `dgfy_business_*` database use
  plain names with no redundant `dgfy_` prefix (D-05) — e.g. `accounts` and
  `locations`, not `dgfy_accounts`/`dgfy_locations`. This intentionally
  diverges from the legacy landlord `dgfy_accounts`/
  `dgfy_account_tenant_memberships` naming.

## `dgfy_core` Core Responsibilities (D-06 through D-09)

Implemented by
`apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs`,
described by
`apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`:

| Table | Purpose | Key fields |
|---|---|---|
| `accounts` | DGFY account identity (D-06) | `id`, `email` (unique), `phone` (unique), `password_hash`, `status`, `email_verified_at`, `phone_verified_at`, `last_login_at` |
| `businesses` | Stable public/business identity and lifecycle status (D-06) | `id`, `business_handle` (unique, opaque per D-03), `legal_name`, `display_name`, `status` |
| `business_memberships` | Account-business ownership/membership (D-07) | `account_id` → `accounts.id`, `business_id` → `businesses.id`, `role` (`owner`/`manager`/`member`), `status` (`active`/`invited`/`removed`), unique on `(business_id, account_id)` |
| `business_database_registry` | Source of truth for business-to-database mapping (D-08) | `business_id` → `businesses.id`, `stable_opaque_suffix` (unique), `database_name` (unique), `status`, `verified_at` |
| `business_audit_logs` | Minimal audit for business creation, ownership/membership changes, database pointer changes, and migration-sensitive admin actions (D-09) | `audit_log_id`, `business_id`, `account_id`, `action`, `before_snapshot`, `after_snapshot` |

`business_memberships.role`/`status` intentionally supports `manager`/`member`
now even though Phase 02 behavior enforces single-owner semantics, so no
disruptive schema rewrite is needed when those roles become active (D-07).

`business_database_registry` stores only the database name, opaque suffix,
lifecycle status, and verification timestamp — it never stores database
credentials (ASVS V6). Credentials remain env/runtime-managed by the runner
(`apps/dgfy-migration-runner/src/config/env.js`).

Full account/admin lifecycle audit coverage (beyond the minimal events above)
is deferred to the backend Accounts/Businesses/Tenancy API phases.

## Branches, Locations, and Discovery (D-10 through D-13)

- **Canonical branch/location data lives in `dgfy_business_*`, not
  `dgfy_core`.** This foundation does not create a landlord `branches` or
  `locations` table (D-10). This is a deliberate departure from a literal
  reading of "landlord Branches" — see Pitfall 1 in `02-RESEARCH.md`.
- `dgfy_core` keeps only a denormalized `storefront_discovery_index`
  projection for public Storefront discovery/routing metadata (D-11). It is
  explicitly marked `projectionOnly: true` in `dgfyCoreContract.js` and is
  **not** canonical branch/location truth — it will be populated by syncing
  from `dgfy_business_*` canonical operational tables in a later phase.
- The explicit name `storefront_discovery_index` (not a vague
  `discovery_index`) is used because future DGFY discovery surfaces may cover
  products, services, food, jobs, events, or other marketplace concepts
  (D-12).
- The Phase 02 `storefront_discovery_index` foundation is intentionally
  lightweight: `handle` (unique, for routing), `display_name`, `is_visible`,
  `location_snapshot` / `search_snapshot` (JSON read-model snapshots), and
  `last_synced_at` (D-13). It carries no `company_token`, credentials,
  internal product allocation data, or tenant secrets — public routing/search
  metadata only.

This preserves the existing established pattern where `tenant_locations` (see
`backend/src/models/TenantLocation.js`) is tenant-local canonical data and
`storefront_discovery_index` (see
`backend/src/models/Landlord/StorefrontDiscoveryIndex.js`) is a landlord
projection, per ADR 0010.

## Per-Business `dgfy_business_*` Tenant Foundation (D-02, D-03, D-10, D-14, Plan 03)

Implemented by
`apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs`,
described by
`apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`.
Every `dgfy_business_<stable_opaque_suffix>` database gets the same tenant
foundation tables:

| Table | Purpose | Key fields |
|---|---|---|
| `locations` | Canonical tenant-local branches/locations (D-10) | `id`, `name`, `address_line`, `latitude`/`longitude`, `is_active`, `is_primary` |
| `staff_accounts` | Tenant-local staff authorization profile; login is tenant-local via `staff_credentials`, with optional DGFY account linkage through `account_staff_assignments` | `id`, `display_name`, `email` (unique), `phone`, `status`, `is_master_admin` |
| `staff_credentials` | Tenant-local staff credential record kept separate from staff profile serialization | `id` INTEGER PK autoincrement, `staff_account_id` INTEGER NOT NULL UNIQUE FK → `staff_accounts.id` ON DELETE CASCADE, `password_hash` STRING(255) NULL, `pos_approval_pin_hash` STRING(255) NULL, `credential_status` ENUM(`active`,`reset_required`,`disabled`) NOT NULL DEFAULT `active`, `password_updated_at`, `created_at`, `updated_at`; indexes `unique_staff_credentials_staff_account` and `idx_staff_credentials_status` |
| `account_staff_assignments` | Optional DGFY account-to-staff assignment/link metadata (D-14) | `dgfy_account_id` (opaque UUID, see below), `staff_account_id` → `staff_accounts.id`, `role` (`owner`/`manager`/`staff`), `status` (`invited`/`active`/`removed`), unique on `dgfy_account_id` |
| `roles` / `role_permissions` | Role/permission basics for future tenant session checks | `roles.name` (unique); `role_permissions` unique on `(role_id, permission_key)` |
| `terminal_identities` | Terminal identity/status/location-binding foundation (no checkout/payment behavior) | `terminal_code` (unique), `label`, `location_id` → `locations.id` (nullable), `status`, `last_seen_at` |
| `tenant_ownership_metadata` | Tenant-local owner/business linkage | `business_id` (opaque UUID, unique), `business_handle`, `stable_opaque_suffix`, `owner_dgfy_account_id` (opaque UUID) |
| `tenant_audit_logs` | Tenant-local audit trail for the tables above | `audit_log_id`, `actor_dgfy_account_id` (opaque UUID, nullable), `staff_account_id` → `staff_accounts.id` (nullable), `action`, `before_snapshot`/`after_snapshot` |
| `product_folders` | Flat product grouping used by POS/catalog and v2.1 product migration | `id`, `business_id`, `name`, `description`, `show_in_pos_filter`, `is_active`; unique `(business_id, name)` |
| `products` | DGFY product identity and migrated legacy item evidence | `id`, `business_id`, `folder_id` → `product_folders.id`, `name`, `category`, `inventory_mode`, `stock_count`, `base_price`, booking fields, `sku_code`, `description`, `unit_of_measure`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `attributes` JSON |
| `inventory_movements` | Append-only inventory ledger and migrated stock/opening-balance evidence | `id`, `business_id`, `product_id` → `products.id`, `movement_type`, `quantity`, `reference_type`, `reference_id`, actor fields, snapshots, `unique_inventory_movements_natural_key` |
| `product_embeddings` | Migrated AI vector evidence for products | `id`, `business_id`, `product_id` → `products.id`, `vector`, `legacy_embedding_id`; unique product row |
| `availments` | Checkout/sales header and migrated legacy POS transaction evidence | `id`, `business_id`, `branch_id` → `locations.id`, `shift_id` → `shifts.id`, `terminal_id` → `terminal_identities.id`, `cashier_account_id` → `staff_accounts.id`, `status`, `document_context`, money totals, `source_reference`, fulfillment cache columns, `source_system`, `legacy_snapshot`, `additional_fees` |
| `availment_items` | Checkout/sales line items and migrated legacy POS line evidence | `id`, `business_id`, `availment_id` → `availments.id`, `product_id` → `products.id`, `product_name`, quantity/price/tax/stock fields, `source_system`, `source_reference`, `legacy_snapshot`; unique `source_reference` |

**Cross-database references are opaque UUIDs, never foreign keys.**
`dgfy_account_id`, `owner_dgfy_account_id`, and `actor_dgfy_account_id` point
at `dgfy_core.accounts.id`, and `tenant_ownership_metadata.business_id`
points at `dgfy_core.businesses.id` — all four are plain UUID columns with no
`references` clause, because MySQL cannot enforce a foreign key constraint
across two separate databases. Every `foreignKeys` entry in
`dgfyBusinessContract.js` is a same-database (tenant-local) relationship
only (e.g. `account_staff_assignments.staff_account_id` →
`staff_accounts.id`, `terminal_identities.location_id` → `locations.id`).

This is the same canonical-tenant-local / landlord-projection split described
in "Branches, Locations, and Discovery" above: `locations` here is the
canonical source of truth ADR 0010 expects `storefront_discovery_index` to
eventually project from.

`staff_credentials` is intentionally separate from `staff_accounts` so staff
profile serializers and list endpoints can never leak password or POS approval
PIN hashes by returning a staff profile row. Real legacy bcrypt values are
copied byte-for-byte during migration, never re-hashed, and never logged.
Placeholder or pending credential values are represented as
`credential_status='reset_required'` for the reset/reinvite flow. The
credential status values are active/reset_required/disabled.
`account_staff_assignments` remains useful for linked DGFY identities and
company switching, but it is not the only staff access path.

## Runner Target Selection for `dgfy_business_*` Databases (D-02, D-08, Plan 03 Task 2)

`apps/dgfy-migration-runner` migrates `dgfy_business_*` databases through an
explicit, validated target list rather than inferring targets from legacy
`tenants.db_name`:

- The optional `DGFY_BUSINESS_DB_NAMES` env var accepts a comma-separated
  list of `dgfy_business_<stable_opaque_suffix>` names (validated by
  `BUSINESS_DB_NAME_PATTERN` in `apps/dgfy-migration-runner/src/config/env.js`).
  Empty entries, legacy database names, `dgfy_core`-style names, and
  display-name-derived entries all fail `validateEnv()` — before any
  connection is opened — rather than being silently dropped.
- When set, `schema migrate` first migrates the primary `TARGET_DB_NAME`
  target (unchanged single-target behavior), then migrates every configured
  business database in the declared order, using the same target host/user/
  password credentials via `createBusinessTargetConnection()` (one Sequelize
  connection per business database).
- Each schema migration file declares which target kind it applies to via
  `meta.targetKind` (`'core'`, the default when a migration omits the field,
  or `'business'`). The schema command filters migrations by this field
  before considering them pending for a given target, so the `dgfy_core`
  foundation migration structurally cannot run against a `dgfy_business_*`
  database, and the business foundation migration structurally cannot run
  against `dgfy_core` — even though both files live in the same
  `src/migrations/schema` directory.
- Migration metadata (`dgfy_migration_meta.schema_migrations`) is
  target-scoped: `target_database` joins `name` in a composite key, so the
  same migration filename is tracked independently per `dgfy_core` and each
  `dgfy_business_*` database. One business database's executed migrations
  can never hide or satisfy another business database's pending state.
- The command report lists `target_database` (the primary target) and
  `business_targets` (an array of `{ database, migrations_executed }` for
  every processed business database) — database names only, never
  credentials.
- Once `dgfy_core.business_database_registry` rows exist (Plan 02), the
  registry is the intended source of truth per D-08; the explicit
  `DGFY_BUSINESS_DB_NAMES` target list is the accepted mechanism for initial
  verification before registry-driven target resolution is wired up.

## Explicit Out-of-Scope Domains and v2.1 Additions (D-15, ADR 0029)

The original Phase 02 foundation deliberately excluded product, inventory,
POS, fiscal, promo, and Storefront operational tables. Later accepted
commerce and v2.1 migration phases added DGFY-owned target tables for product,
inventory, shifts, availments, payments, fulfillment events, and sales-history
provenance. The current rule is therefore table-name specific:
`dgfyBusinessContract.js` rejects legacy/source table names such as
`items`, `stock_movements`, `pos_transactions`, and
`pos_transaction_lines`, while allowing the DGFY-owned targets
`products`, `inventory_movements`, `availments`, and `availment_items`.

The following legacy/source or still-deferred domains must not appear as new
canonical tables in `dgfy_core` or `dgfy_business_*`:

- Legacy/source product table names: `items`, SKUs, product variants, and
  categories. The DGFY target is `products`.
- Purchase orders, job orders, legacy `stock_movements`,
  `item_location_stocks`, FIFO batches, suppliers/supplier-items
  (Inventory/Catalog ownership per ADR 0029). The DGFY target ledger is
  `inventory_movements`.
- Legacy/source POS table names: `pos_transactions`,
  `pos_transaction_lines`, cashier sessions, and terminal sessions. The DGFY
  sales-history targets are `availments` and `availment_items`; live shift
  behavior uses the DGFY `shifts` table.
- Discounts, promos, promotions.
- Fiscal receipts and fiscal compliance logs.
- Checkout sessions, Storefront pages, Storefront orders/carts (Storefront
  operational ownership per ADR 0029).
- Canonical `branches`/`locations` inside `dgfy_core` (see D-10 above — these
  belong in `dgfy_business_*`, not `dgfy_core`).

Remaining excluded domains are deferred to later milestones or compatibility
seams as documented in `.planning/PROJECT.md` Out of Scope.

## Phase 14 Sales-History Schema Contract

Phase 14 adds the final sales-history migration surface to the tenant schema
without changing live checkout write behavior:

| Table | Column/index | Shape | Notes |
|---|---|---|---|
| `availments` | `source_system` | `STRING(32) NULL` | `legacy_migration` for migrated headers; null for existing/live rows. |
| `availments` | `legacy_snapshot` | `JSON NULL` | Explicitly allowlisted legacy header evidence: unresolvable FK-shaped fields, void metadata, payment-processing detail, F&B/fiscal/customer/order snapshots. |
| `availments` | `additional_fees` | `JSON NULL` | Flat `{ service_fee_amount, delivery_fee }` migrated from the actual legacy `service_fee_amount` and `delivery_fee` fields; no live POS fee write path is added. |
| `availment_items` | `source_system` | `STRING(32) NULL` | Line-level provenance mirroring `availments.source_system`. |
| `availment_items` | `source_reference` | `STRING(64) NULL` | Namespaced `legacy_pos_line:<line_id>` reference. |
| `availment_items` | `legacy_snapshot` | `JSON NULL` | Explicitly allowlisted legacy line evidence: raw parent/item IDs, unit/cost/stock-exempt/override/F&B snapshots. |
| `availment_items` | `unique_availment_items_source_reference` | unique index on `source_reference` | Retry/crash idempotency for migrated lines. MySQL permits multiple nulls, so this is additive for existing live rows. |

`availments.source_reference` and `unique_availments_source_reference`
already exist and are reused for migrated headers. The Phase 14 contract is
implemented by
`apps/dgfy-migration-runner/src/migrations/schema/20260718000000-extend-schema-for-sales-history-migration.cjs`
and mirrored in `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`.
ADR impact is not needed because ADR 0029's accepted 2026-07 amendment already
authorizes additive historical migration, and no live write path or ownership
boundary changes.

## Migration and Verification Contract (DBF-04, D-21 through D-24)

- Both foundation migrations
  (`20260710020000-create-dgfy-core-foundation.cjs` and
  `20260710021000-create-dgfy-business-foundation.cjs`) use Sequelize
  `QueryInterface` with existence guards (`showAllTables`/`showIndex` checks
  before every `createTable`/`addIndex`) — never
  `sequelize.sync({ alter: true })`. Re-running either against an
  already-migrated database is a no-op.
- Migration metadata (which migrations ran, when, for which target database,
  and their command execution outcome) is tracked in `dgfy_migration_meta`,
  not `dgfy_core` or any `dgfy_business_*` database, via the runner's
  `MetaSequelizeStorage` (target-scoped by `target_database`, Plan 03) and
  `command_executions` audit trail (Phase 01).
- `dgfyCoreContract.js` and `dgfyBusinessContract.js` are each the single
  source of truth both their respective migration and Plan 04's `verify`
  command inspect against — one schema contract drives both migration and
  verification expectations per database kind.
- Plan 04 verification is responsible for proving: expected tables/columns/
  indexes/constraints exist for every targeted `dgfy_core` and
  `dgfy_business_*` database, migration metadata records are present and
  correctly target-scoped, `business_database_registry` tenant coverage is
  complete, migrations are idempotent/re-runnable, and legacy `sku_*`
  schemas are provably unmutated (pre/post `information_schema`
  fingerprints).

## Verification Evidence (DBF-01 through DBF-05, D-21 through D-24, Plan 04)

Phase 02 completion is proven by running the migration runner's `verify`
command and inspecting its JSON report, not by intent or code review alone.
`apps/dgfy-migration-runner/src/commands/verify.js` produces the following
report sections, each with a matching `summary.<section>_ok` boolean:

| Report section | Proves | Requirement |
|---|---|---|
| `core_schema` | Every `dgfyCoreContract.js` table/column/index/unique-constraint/foreign-key exists in the targeted `dgfy_core` database, and no out-of-scope `rejectedTables` entry is present. | DBF-02, DBF-05, D-21 |
| `business_schemas` | The same, per configured `dgfy_business_*` target, against `dgfyBusinessContract.js`. | DBF-03, DBF-05, D-21 |
| `migration_metadata` | `dgfy_migration_meta.schema_migrations` has a target-scoped record for every Phase 02 migration file expected for that target's kind (`core`/`business`) — missing records are reported per target database, not only by filename. | DBF-04, DBF-05, D-21 |
| `tenant_coverage` | Every explicitly targeted `dgfy_business_*` database has its expected tenant schema, cross-checked against `dgfy_core.business_database_registry` when that table is reachable. A registry gap (no row yet for an explicit target) is flagged in `registry_gaps` but does not fail `ok` — Phase 02 does not seed registry rows; the explicit `DGFY_BUSINESS_DB_NAMES` target list is the accepted initial-verification input (D-08). | DBF-05, D-21 |
| `idempotency` | Zero pending Phase 02 migrations remain for `dgfy_core` and every `dgfy_business_*` target (derived from the same target-scoped migration metadata `migration_metadata` computes) — proof that a rerun of `schema migrate` against an already-migrated target is a pure no-op. | DBF-04, D-22 |
| `legacy_non_mutation` | The legacy/current `sku_*` schema (`SOURCE_DB_NAME`) is unchanged: a durable pre-migration `information_schema` fingerprint (tables/columns/indexes/constraints) is captured once by `schema migrate` (`ensureLegacyFingerprintBaseline()`, written to `<REPORT_DIR>/legacy-fingerprint-baseline.json` and referenced by `legacy_fingerprint_baseline_path` in the `schema:migrate` report) and compared against a freshly computed fingerprint of the same schema during `verify`. | DBF-01, D-23 |

**Legacy non-mutation requires the baseline artifact to exist first.**
`verify` fails closed (`legacy_non_mutation.ok: false`,
`legacy_non_mutation.baseline_found: false`) if `schema migrate` has never
run and no baseline artifact is present — D-23 requires observable
non-mutation proof, not an assumption that migrations never touched legacy
schemas. Running `schema migrate` at least once before `verify` is
therefore a precondition for legacy non-mutation evidence, not an optional
step.

`verify()` never throws: every check above is wrapped so a connection or
introspection failure becomes an `ok: false` finding (with an `error`
field) rather than an uncaught exception, per D-24's requirement that
verification always emits machine-readable JSON and a human-readable
summary, even when checks fail.

### Local Evidence Commands

Run these in order from `apps/dgfy-migration-runner/` (or via
`npm --prefix apps/dgfy-migration-runner ...` from the repo root):

```bash
# 1. Runner unit tests (schema contracts, hardening gates, report sections)
npm test -- --watchman=false

# 2. Gated real MySQL-backed integration evidence (skips cleanly without a
#    real MySQL server + explicit opt-in; never fails unrelated environments)
RUN_PHASE02_INTEGRATION=true \
PHASE02_IT_DB_HOST=<host> PHASE02_IT_DB_USER=<user> PHASE02_IT_DB_PASSWORD=<password> \
npm test -- phase02Integration.test.js --watchman=false

# 3. Real schema migration against dgfy_core, then one or more
#    dgfy_business_* targets (TARGET_DB_NAME / DGFY_BUSINESS_DB_NAMES env)
TARGET_DB_NAME=dgfy_core node src/cli.js schema migrate
TARGET_DB_NAME=dgfy_core DGFY_BUSINESS_DB_NAMES=dgfy_business_<suffix> node src/cli.js schema migrate

# 4. Rerun the same command(s) — proves additive/idempotent behavior
#    (summary.total_pending and summary.executed must both be 0)
TARGET_DB_NAME=dgfy_core DGFY_BUSINESS_DB_NAMES=dgfy_business_<suffix> node src/cli.js schema migrate

# 5. Verify — inspect the JSON report's core_schema/business_schemas/
#    migration_metadata/tenant_coverage/idempotency/legacy_non_mutation
#    sections and summary.*_ok booleans
TARGET_DB_NAME=dgfy_core DGFY_BUSINESS_DB_NAMES=dgfy_business_<suffix> node src/cli.js verify

# 6. Documentation and architecture gates (final, repo-root commands)
npm run lint:docs
npm run check:architecture
```

Production use requires an operator to supply real `SOURCE_DB_*`/
`TARGET_DB_*` credentials, `DGFY_BUSINESS_DB_NAMES`, and `MIGRATION_ACTOR`
via the runner's environment/deployment configuration — no external
dashboard or additional service setup is required beyond what
`apps/dgfy-migration-runner`'s existing Docker packaging (Phase 01) already
provides.

### Rollback Considerations

- Every Phase 02 migration is additive only (existence-guarded
  `createTable`/`addIndex`, never `sequelize.sync({ alter: true })`); there
  is no automated destructive rollback path.
- `rollback-plan` (Phase 01) generates a report-only artifact describing
  what a manual rollback would need to reverse — it never executes a
  migration's `down()`.
- For an irreversible incident, recovery is a database backup/restore
  operation performed by an operator, not a runner command.
- If `verify`'s `legacy_non_mutation` section ever reports `ok: false`,
  stop Phase 02 schema migration work immediately and preserve the JSON/
  summary reports and the fingerprint baseline artifact before attempting
  any further migration — per this document's own threat model, legacy
  mutation is a high-severity Tampering finding, not a warning to route
  around.

## Threat Model Summary

See `02-02-PLAN.md`'s and `02-03-PLAN.md`'s `<threat_model>` sections for the
full STRIDE registers. Summary of mitigations implemented by these plans:

- **Spoofing (accounts):** unique indexes on `email`/`phone`, explicit
  `status` field for later auth checks.
- **Tampering (`business_database_registry`):** unique constraints on
  `stable_opaque_suffix` and `database_name`, `status`/`verified_at` fields,
  and `business_audit_logs` linkage for pointer changes.
- **Information disclosure (`storefront_discovery_index`, command reports):**
  projection-only fields with no credentials or tenant secrets;
  `schema migrate`'s report lists only `target_database` and
  `business_targets` database names, never connection credentials.
- **Elevation of privilege (`business_memberships`, `account_staff_assignments`,
  `roles`/`role_permissions`):** role/status/uniqueness constraints
  structured for owner/manager/member (landlord) and owner/manager/staff
  (tenant) semantics, ready for later landlord+tenant authorization checks.
- **Spoofing (business database target parser):** `BUSINESS_DB_NAME_PATTERN`
  rejects every `DGFY_BUSINESS_DB_NAMES` entry outside
  `dgfy_business_<stable_opaque_suffix>` — including empty entries, legacy
  names, and display-name-derived entries — before any connection is opened.
- **Repudiation (target-scoped migration metadata):**
  `dgfy_migration_meta.schema_migrations` records each migration by
  `target_database` plus `name`, so each `dgfy_core`/`dgfy_business_*`
  database has independent, non-overlapping migration evidence.
- **Tampering (`terminal_identities`):** identity/status/location-binding
  metadata foundation only — no checkout/payment behavior.
- **Tampering (legacy schemas):** the runner's target DB name guard
  (`apps/dgfy-migration-runner/src/safety/targetGuard.js`) rejects legacy DB
  names by default; Plan 04 fingerprints prove no legacy `sku_*` schema
  mutation.
