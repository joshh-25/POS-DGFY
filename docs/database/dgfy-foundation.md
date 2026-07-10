---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-07-10
applies_to: dgfy_database_foundation
topic: dgfy_database_foundation
---

# DGFY Database Foundation

This document is the authoritative schema contract for the new DGFY-owned
`dgfy_*` databases created in Phase 02 of the DGFY standalone refactor. It
covers the `dgfy_core` landlord foundation delivered by this plan and records
the boundaries the per-business `dgfy_business_*` foundation (Plan 03) and
verification evidence (Plan 04) must respect.

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
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — product/inventory/POS/Storefront operational ownership boundaries; explicitly out of scope here.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — standalone DGFY API service boundary and `apps/*` convention.
- `docs/database/README.md` and `docs/database/schema.md` — legacy/current database reference (not canonical for DGFY-era schema).

**ADR impact:** Not needed. This plan implements existing Phase 02 locked
decisions (D-01 through D-13) and stays inside the boundaries already accepted
by ADR 0003, ADR 0010, and ADR 0029. No new architectural decision is being
introduced.

## Database Names and Layout (D-01, D-04, D-05)

- `dgfy_core` — the DGFY platform/landlord database. Created and migrated by
  `apps/dgfy-migration-runner` using `TARGET_DB_NAME=dgfy_core`.
- `dgfy_business_<stable_opaque_suffix>` — per-business operational databases
  (D-02). Not created by this plan; the naming pattern and registry contract
  are established here so Plan 03 can provision them. `stable_opaque_suffix`
  is never derived from a sanitized business display name (D-03), so business
  rebrands never rename a database or create a name mismatch.
- `dgfy_migration_meta` — runner metadata (command executions, schema
  migration log). Kept separate from `dgfy_core` (D-04); this plan's migration
  never writes runner audit/metadata tables into `dgfy_core`.
- All tables inside `dgfy_core` (and future `dgfy_business_*` databases) use
  plain names with no redundant `dgfy_` prefix (D-05) — e.g. `accounts`, not
  `dgfy_accounts`. This intentionally diverges from the legacy landlord
  `dgfy_accounts`/`dgfy_account_tenant_memberships` naming.

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

## Explicit Out-of-Scope Domains (D-15, ADR 0029)

The following domains are **not** part of the `dgfy_core` landlord foundation
and must never appear as tables in `dgfy_core`. `dgfyCoreContract.js` encodes
this as an explicit `rejectedTables` list used by this plan's own schema tests
and by Plan 04's verification scope guard:

- Products/items, SKUs, product variants, categories.
- Purchase orders, job orders, stock movements, item/location stock,
  FIFO batches, suppliers/supplier-items (Inventory/Catalog ownership per
  ADR 0029).
- POS transactions/lines, shifts, cashier sessions, terminal sessions
  (POS ownership per ADR 0029).
- Discounts, promos, promotions.
- Fiscal receipts and fiscal compliance logs.
- Checkout sessions, Storefront pages, Storefront orders/carts (Storefront
  operational ownership per ADR 0029).
- Canonical `branches`/`locations` (see D-10 above — these belong in
  `dgfy_business_*`, not `dgfy_core`).

These domains are deferred to later milestones once Accounts, Businesses, and
Tenancy are stable (see `.planning/PROJECT.md` Out of Scope).

## Migration and Verification Contract (DBF-04, D-21 through D-24)

- The foundation migration
  (`20260710020000-create-dgfy-core-foundation.cjs`) uses Sequelize
  `QueryInterface` with existence guards (`showAllTables`/`showIndex` checks
  before every `createTable`/`addIndex`) — never
  `sequelize.sync({ alter: true })`. Re-running it against an already-migrated
  `dgfy_core` is a no-op.
- Migration metadata (which migrations ran, when, and their command
  execution outcome) is tracked in `dgfy_migration_meta`, not `dgfy_core`,
  via the runner's existing `MetaSequelizeStorage` and `command_executions`
  audit trail (Phase 01).
- `dgfyCoreContract.js` is the single source of truth both the migration and
  Plan 04's `verify` command inspect against — one schema contract drives
  both migration and verification expectations.
- Plan 04 verification is responsible for proving: expected tables/columns/
  indexes/constraints exist, migration metadata records are present,
  `business_database_registry` tenant coverage is complete, migrations are
  idempotent/re-runnable, and legacy `sku_*` schemas are provably unmutated
  (pre/post `information_schema` fingerprints).

## Threat Model Summary

See `02-02-PLAN.md`'s `<threat_model>` for the full STRIDE register. Summary
of mitigations implemented by this plan:

- **Spoofing (accounts):** unique indexes on `email`/`phone`, explicit
  `status` field for later auth checks.
- **Tampering (`business_database_registry`):** unique constraints on
  `stable_opaque_suffix` and `database_name`, `status`/`verified_at` fields,
  and `business_audit_logs` linkage for pointer changes.
- **Information disclosure (`storefront_discovery_index`):** projection-only
  fields, no credentials or tenant secrets.
- **Elevation of privilege (`business_memberships`):** role/status/uniqueness
  constraints structured for owner/manager/member semantics.
- **Tampering (legacy schemas):** the runner's target DB name guard
  (`apps/dgfy-migration-runner/src/safety/targetGuard.js`) rejects legacy DB
  names by default; Plan 04 fingerprints prove no legacy `sku_*` schema
  mutation.
