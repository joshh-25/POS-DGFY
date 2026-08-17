---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-15
applies_to: deploy_operations
topic: tenant_schema_sync_residual_risk
---

# Tenant Schema Sync Residual Risk Tracker

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
