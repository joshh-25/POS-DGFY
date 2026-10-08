---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-08
applies_to: deploy_operations
topic: tenant_schema_sync_residual_risk
---

# Tenant Schema Sync Residual Risk Tracker

## 2026-10-08 finding and fix: changeColumn ENUM widening never reached existing tenants (#2335)

Production error "Data truncated for column 'reference_type' at row 1" (#2321) recurred on
2026-10-08, one day after PR #2322 had merged to `main` and deployed what looked like the fix.
Empirically confirmed before this fix shipped: **all 52 production tenant databases** were still
running `stock_movements.reference_type` as `enum('PO','JO','MANUAL','RETURN','DO','POS')` — none
had `'POS_PARKED_SALE'` — despite the non-blocking `repair-apply` step reporting `status: "ok"` for
every one of them on every restart since the deploy.

### Root cause

PR #2322's migration (`20261007000001-add-pos-parked-sale-reference-type.cjs`) used
`queryInterface.changeColumn('stock_movements', 'reference_type', ...)` to widen the ENUM. Per
`apps/dgfy-migration-runner/README.md`, that package "only ever touches the **landlord**
database" — the migration never reaches a tenant's own physically separate schema. The *only*
mechanism that repairs an already-existing tenant's drift is
`apps/dgfy-api/scripts/sync-tenant-schemas.js`'s `REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS` registry,
applied automatically and non-blocking on every API container start/restart via
`infrastructure/docker/dgfy-api/entrypoint.sh`'s `repair-apply` step (ADR-level precedent: this is
the same path that already retrofitted `pos_transactions.payment_type`'s `'cheque'` widening onto
every pre-existing tenant). PR #2322 added `POS_PARKED_SALE` to the migration and the
`StockMovement` Sequelize model, but never added a corresponding entry to
`REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS` — so the one mechanism capable of reaching an
already-existing tenant never ran for this column at all. That's why the `repair-apply` report
showed `status: "ok"` for every tenant: the registry had nothing to check here, so there was
nothing to flag as drift.

A tenant provisioned *after* #2322 merged was unaffected, because new-tenant provisioning
(`tenantSchemaBootstrap.js`) builds the schema via `Sequelize.sync()`, which reads the model file
directly — and the model *was* correctly updated. The asymmetry (new tenants fine, every
pre-existing tenant still broken) is what produced the recurrence.

A second, independent gap let this ship with a clean CI run:
`apps/dgfy-api/scripts/check-tenant-schema-registry-coverage.js` (`check:tenant-schema-coverage`)
exists specifically to flag a migration that touches a tenant-scoped table with no matching
registry entry, but it only parsed `queryInterface.createTable(...)` and
`queryInterface.addColumn(...)` out of changed migration files — it had no detection for
`queryInterface.changeColumn(...)` at all, so an ENUM-widening migration was structurally
invisible to the one gate meant to catch exactly this.

### Fix

- `apps/dgfy-api/scripts/sync-tenant-schemas.js`: added the missing
  `stock_movements.reference_type` entry to `REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS`
  (`enumValues: ['PO','JO','MANUAL','RETURN','DO','POS','POS_PARKED_SALE']`), bumped
  `TENANT_SCHEMA_CAPABILITY_VERSION`. This is the actual production fix — the next container
  restart's existing `repair-apply` step propagates it to every active tenant automatically, no
  separate manual DB command needed.
- `apps/dgfy-api/scripts/check-tenant-schema-registry-coverage.js`: added `changeColumn(...)`
  detection (`extractMigrationSchemaOperations`, `checkRegistryCoverage`), checked against either
  `REQUIRED_TENANT_SCHEMA_COLUMNS` or `REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS` — so a future
  enum-widening (or any type-changing) migration with no registry entry now fails CI instead of
  shipping silently.
- Regression coverage: `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js` gained a case
  asserting the registry's `stock_movements.reference_type` enum values match every literal the
  app writes; `apps/dgfy-api/tests/tenantSchemaRegistryCoverageScript.unit.test.js` and
  `checkTenantSchemaRegistryCoverageScript.integration.test.js` gained unit/CLI coverage proving
  an unregistered `changeColumn` enum widening is now flagged, and a registered one passes.

## 2026-09-22 finding and fix: Eagle Spoon activated without full schema parity (#2027)

Production tenant "Eagle Spoon, Inc." (`sku_tenant_eaglespooninc_23c85b4c`) was created and
activated 2026-09-21, missing 2 generated columns + their unique indexes on
`pos_terminal_shifts`, 19 other indexes, and `pos_discount_rules` seed data. Caught only because
a promotion happened to trigger a manual `tenant-schema-report.yml` dispatch — nothing else would
have caught it. Full incident narrative, evidence, and the already-completed operational repair
(backup, scoped repair script, verified `46/46` production report via two independent checks) are
recorded on issue #2027 — not repeated here.

### Root cause

`provisionTenant` (`apps/dgfy-api/src/services/tenantProvisioningService.js`) ran a plain
`Sequelize.sync()` plus only the two Phase-157 bootstrap migrations
(`applyPostSyncTenantSchema`) — it never ran the general `REQUIRED_TENANT_SCHEMA_TABLES/COLUMNS/
INDEXES/SEEDS`/enum-contract registry that `apps/dgfy-api/scripts/sync-tenant-schemas.js`'s
report/repair-apply modes already check for *existing* tenants. That registry only ever reached a
tenant via `infrastructure/docker/dgfy-api/entrypoint.sh`'s non-blocking `repair-apply` step,
which only runs on container start/restart and only against `status='active'` tenants — so a
tenant provisioned between restarts could go live broken and stay that way indefinitely. The two
missing generated columns/indexes on `pos_terminal_shifts` were already registered in
`REQUIRED_TENANT_SCHEMA_COLUMNS`/`REQUIRED_TENANT_SCHEMA_INDEXES` at the time of the incident —
routing provisioning through the existing registry-driven repair, with no registry content
changes, was sufficient to prevent this specific incident.

A separate, previously-unnoticed bug in the repair engine compounded the risk: `repair-apply`
mode had no branch for "post-repair re-inspection still finds missing objects" — it silently fell
through to the generic success path and recorded `status:'ok'` even when real drift remained,
undermining the only automated non-blocking-startup signal that existed for this class of gap.

### Fix

- `apps/dgfy-api/scripts/sync-tenant-schemas.js`: extracted the five-pass inspect → repair →
  re-inspect reconciliation sequence into one exported `reconcileTenantSchema(connection,
  tenantDb, mode)`, reused by both the existing fleet CLI and tenant-provisioning — the single
  canonical path this incident's fix required. Fixed the `repair-apply` silent-success bug as
  part of the same refactor (reuses the existing `status:'failed'` value, no new status
  introduced, so `check-tenant-schema-sync-regressions.js`'s deploy-time regression gate and
  `tenantSchemaReadinessService.js` needed no changes). Added a `--tenant-db <db_name>` CLI flag
  so a single tenant can be reported on or repaired without an unscoped run across every active
  tenant.
- `apps/dgfy-api/src/services/tenantSchemaBootstrap.js`: `applyPostSyncTenantSchema` now calls
  `reconcileTenantSchema` in `repair-apply` mode and throws if any issue remains, before
  `provisionTenant` ever reaches the tenant's `status:'active'` update — a hard postcondition, not
  a warning. `provisionTenant`'s existing catch-block compensating transaction (reset landlord
  status, drop the zombie database) already covered this failure mode with no changes needed.
- `apps/dgfy-api/scripts/alert-on-tenant-schema-sync-failures.js` (new) +
  `infrastructure/docker/dgfy-api/entrypoint.sh`: the non-blocking startup repair step now also
  raises a Sentry event (via the app's own `initSentry()`, with an explicit fingerprint so
  repeated/identical drift collapses into one grouped issue rather than paging every restart)
  whenever any tenant is left unresolved, instead of only an ASCII stdout banner.
- Regression coverage: `apps/dgfy-api/tests/tenantSchemaBootstrap.integration.test.js` gained a
  real-MySQL test provisioning a fresh tenant and independently re-verifying zero missing tables,
  columns, indexes, seeds, and enum values via the registry's own inspector functions.
  `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js` gained unit coverage for the
  `repair-apply` bug fix directly.

## 2026-08-15 finding and fix: unrepairable F&B modifier gap (#539)

Found during a local dry-run of #482's schema migration against a restored production snapshot
(`docker --context=ch`, `do-not-commit/local-test/`) — not caused by that migration, but a restart
is what surfaced it, and any future migration's deploy restart would surface it identically wherever
it exists. Fixed and verified locally in the same session; **not yet applied to dev/staging/prod.**

### Root cause

`fnb_modifier_groups`, `fnb_modifier_options`, and `fnb_item_modifier_groups` (created by
`20260505000002-create-fnb-restaurant-mode-tables.cjs`) had no `CREATE TABLE` fallback in
`apps/dgfy-api/scripts/sync-tenant-schemas.js`'s `REQUIRED_TENANT_SCHEMA_TABLES`, even though later
columns/indexes on those same tables (`visible_in_pos`, `group_kind`, `is_sold_out`, `is_excluded`,
`idx_fnb_modifier_groups_parent_option`, ...) were already registered in
`REQUIRED_TENANT_SCHEMA_COLUMNS`/`REQUIRED_TENANT_SCHEMA_INDEXES`. A tenant missing all three base
tables entirely — provisioned before that migration and never otherwise migrated forward — has no
repair path: `repair-apply` fails on the first statement touching them (observed as `Failed to open
the referenced table 'fnb_modifier_groups'`, from a downstream child table's FK).

That failure is fatal, not cosmetic. `apps/dgfy-api/src/server.js`'s tenant preflight is
unconditional under `NODE_ENV=production` (`tenantSchemaPreflightRequired = true`, `server.js:106`)
and all-or-nothing across every `status='active'` tenant (`server.js:889-894`, query at
`sync-tenant-schemas.js:1510`) — **one tenant with this gap crash-loops the entire shared API for
every tenant**, not just the affected one, on every subsequent boot, forever, until manually
repaired. This is the same failure shape already fixed once before in this file for
`storefront_catalog_overrides` (see that entry's own comment) — this is the same class of gap,
different tables.

Confirmed against a restored snapshot: 3 of 44 active tenants had zero `fnb_modifier*` tables and
were ~40-50 objects behind a healthy tenant. Ruled out subscription lapse/dormancy as the general
predictor — another tenant in the same snapshot with an identical dormant profile
(`subscription_status: inactive`, similarly old `updated_at`) repaired cleanly, so this reads as an
isolated provisioning-time gap on specific tenants, not a universal drift pattern tied to age or
subscription state.

### Fix

Added `fnb_modifier_groups`, `fnb_modifier_options`, `fnb_item_modifier_groups` as proper
`CREATE TABLE` entries to `REQUIRED_TENANT_SCHEMA_TABLES`, declared first (dependency order — the
three existing location-availability/folder tables already in that registry FK-reference these).
`fnb_modifier_groups`'s base DDL deliberately omits `parent_modifier_option_id` and its FK to
`fnb_modifier_options` (a genuine circular dependency: `fnb_modifier_options` doesn't exist yet at
that point in the repair sequence) — the pre-existing `REQUIRED_TENANT_SCHEMA_COLUMNS`/`_INDEXES`
entries for that column add it, its FK, and its index afterward, once both tables exist, exactly as
they did historically. See PR for the exact `CREATE TABLE` DDL (copied verbatim from
`SHOW CREATE TABLE` against a healthy tenant, per this file's own stated convention).

Verified locally: rebuilt `dgfy-api` from the fixed source, ran `repair-apply` against the same
restored snapshot — `completed total=44 ok=44 failed=0`, including all 3 previously-broken tenants.
`dgfy-api` came up `healthy` with `restarts=0` (previously crash-looping indefinitely).
`TENANT_SCHEMA_CAPABILITY_VERSION` bumped to `2026-08-15.1` alongside the registry change.

### Before applying to dev/staging/prod

1. Run `node apps/dgfy-api/scripts/sync-tenant-schemas.js --mode report` (read-only, no
   `TENANT_SCHEMA_MUTATION_APPROVED` needed) against each environment **before** deploying this fix
   or any other migration that would restart `dgfy-api` there, to get an honest census of whether
   any real tenant has this exact gap (or a different one) ahead of a restart discovering it as an
   outage.
2. If any tenant reports `fnb_modifier_groups`-shaped drift, this fix's `repair-apply` path should
   resolve it the same way it did locally — but confirm on the `--mode report` output first rather
   than assuming.
3. Whether `status='active'` tenants with a lapsed `subscription_status` should be excluded from the
   mandatory preflight query at all (`sync-tenant-schemas.js:1510`) is a related, separate policy
   question this surfaced — flagged here, not decided or implemented.

## Ticket
1. Ticket ID: `OPS-TSYNC-001`
2. Title: Eliminate active tenant schema sync drift and keep zero-failure mode.
3. Owner: Engineering + Ops
4. Priority: P1-techdebt
5. Status: Reopened (2026-06-15)

## Current Risk
1. Baseline signatures remain intentionally empty in `backend/config/deploy/tenant-schema-sync-failure-baseline.json` (`failures=[]`).
2. Deploy should enforce strict closure defaults:
- `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`
- `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`
3. June 15, 2026 production verification found four older/test-like active tenant databases with foreign-key drift during tenant schema `alter` mode. Space Bar was remediated separately, but the four remaining tenants must not be normalized into the empty baseline without an accepted-risk decision.

## Latest Audit Snapshot (Production Closure 2026-04-18)
1. Initial strict-gate deploy audit (blocked release):
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032545.tenant_index_headroom.json`
- Result: `status=warning`, `redundant_groups=133`.
2. Remediation execution:
- `/var/www/skupervisor/logs/deploy/tenant-index-remediation-after-strict-gate.json`
- Result: `dropped_count=203`.
3. Post-remediation strict audit:
- `/var/www/skupervisor/logs/deploy/tenant-index-headroom-after-strict-remediation.json`
- Result: `status=healthy`, `redundant_groups_total=0`.
4. Final strict deploy evidence:
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_schema_sync.json` (`failed=0`)
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_index_headroom.json` (`status=healthy`).

## Execution Checklist
0. Classify each currently failing tenant:
- real/customer tenant -> repair FK/schema drift with tenant-specific idempotent remediation
- abandoned/test tenant -> deactivate or archive deliberately before excluding it from active-tenant sync
1. Run root-cause audit:
- `npm run audit:tenant-index-headroom`
2. Generate remediation plan:
- `npm run remediate:tenant-redundant-indexes -- --report-file ../logs/deploy/tenant_index_remediation.json --sql-file ../logs/deploy/tenant_index_remediation.sql`
3. Apply remediation in controlled waves:
- `npm run remediate:tenant-redundant-indexes -- --apply --yes --tenant-db <tenant_db>`
4. Validate post-change:
- `node backend/scripts/sync-tenant-schemas.js --mode alter --report-file <path>`
- `node backend/scripts/check-tenant-schema-sync-regressions.js --report-file <path> --baseline-file backend/config/deploy/tenant-schema-sync-failure-baseline.json`
5. Close debt:
- keep baseline empty unless a new approved exception is explicitly documented
- keep strict deploy defaults enabled and fail-closed on new schema/index drift

## Exit Criteria
1. Baseline failure list is empty.
2. Every active tenant succeeds in `node backend/scripts/sync-tenant-schemas.js --mode alter --report-file <path>`, or every excluded tenant has a documented inactive/archive decision.
3. Tenant schema sync regression gate passes with `--require-zero`.
4. Deploy runs with `DEPLOY_TENANT_SCHEMA_SYNC_MODE=report`, no unresolved tenant schema failures, and clean headroom audit.
