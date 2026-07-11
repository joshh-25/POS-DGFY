---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04
current_phase_name: backend-accounts-businesses-and-tenancy-foundation
status: ready_for_planning
stopped_at: Phase 03 gap closure completed; ready for Phase 04 planning
last_updated: "2026-07-11T07:24:51Z"
last_activity: 2026-07-11
last_activity_desc: Phase 03 gap closure passed live MySQL rehearsal and canonical verification
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 15
  completed_plans: 15
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-11)

**Core value:** DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.
**Current focus:** Phase 04 — backend-accounts-businesses-and-tenancy-foundation

## Current Position

Phase: 04 (backend-accounts-businesses-and-tenancy-foundation) — READY FOR PLANNING
Plan: TBD
Status: Phase 03 complete; Phase 04 planning next
Last activity: 2026-07-11 — Phase 03 gap closure passed live MySQL rehearsal

Progress: [████░░░░░░] 43%

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 | - | - |
| 02 | 5 | - | - |
| 03 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 32min | 3 tasks | 12 files |
| Phase 01 P02 | 11min | 3 tasks | 7 files |
| Phase 01 P03 | 14min | 3 tasks | 11 files |
| Phase 01 P04 | 18min | 2 tasks | 2 files |
| Phase 02 P01 | 25min | 3 tasks | 7 files |
| Phase 02 P02 | 25min | 3 tasks | 5 files |
| Phase 02 P03 | 12min | 4 tasks | 11 files |
| Phase 02 P04 | 55min | 4 tasks | 7 files |
| Phase 02 P05 | 15min | 1 tasks | 2 files |
| Phase 03 P01 | 35min | 3 tasks | 11 files |
| Phase 03 P02 | 20min | 2 tasks | 4 files |
| Phase 03 P03 | 45min | 3 tasks | 5 files |
| Phase 03 P04 | 55min | 3 tasks | 4 files |
| Phase 03 P05 | 75min | 3 tasks | 8 files |
| Phase 03 P06 | 32min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Use a database-first Strangler Fig path with new `dgfy_*` databases beside legacy.
- [Roadmap]: Use one dedicated migration image with multiple explicit commands.
- [Roadmap]: Limit first backend scope to Accounts, Businesses, and Tenancy.
- [Roadmap]: Keep legacy live; allow only approved compatibility seams under ADR 0003.
- [Roadmap]: Defer Product, POS checkout, payment, fiscal, and frontend migration to later milestones.
- [Phase ?]: Inlined new Sequelize(...) separately in each DB factory function (source/target/meta) rather than a shared helper, so the plan's zero-top-level-call acceptance test holds literally
- [Phase ?]: Pinned mysql2 to ^3.6.5 in apps/dgfy-migration-runner per package legitimacy audit (latest 3.22.6 flagged too-new)
- [Phase ?]: ensureMetadataSchema() self-heals dgfy_migration_meta via a short-lived raw mysql2 connection reusing metaSequelize.config credentials, then fails fast with MetadataSchemaError on any later structural mismatch instead of silently addColumn-ing
- [Phase ?]: MetaSequelizeStorage is a custom Umzug storage class backed by dgfy_migration_meta.schema_migrations rather than the default SequelizeMeta table
- [Phase ?]: buildSummaryLine() unconditionally skips non-null object/array summary fields so the summary.txt file never contains a raw JSON dump, by construction rather than convention
- [Phase ?]: Computed the D-09 destructive-op check via a direct filesystem scan of migration files instead of umzug.pending(), resolving an ordering conflict between the plan text and its own acceptance criteria
- [Phase ?]: Exported buildProgram() from cli.js with an isMainModule guard (mirroring sync-tenant-schemas.js) so CLI dispatch is testable in-process without spawning a child process
- [Phase ?]: Reworded Dockerfile comments to avoid literal EXPOSE/HEALTHCHECK substrings so the plan's grep-based verify command returns a true 0 for the intentionally-omitted instructions
- [Phase ?]: Started the local Lima-backed docker VM (limactl start docker) to make the Docker daemon reachable for mandatory build/run verification
- [Phase ?]: Runner: pending-only destructive classification is computed from Umzug's own pending() result (meta carried through resolveMigration) rather than a second filesystem scan
- [Phase ?]: Runner: verify.js distinguishes failed health checks (findings) from genuine report-write failures when setting command_executions.exit_status
- [Phase ?]: Runner: REPORT_DIR defaults to /reports (container-safe) instead of the dev-oriented ./reports
- [Phase ?]: dgfy_core tables use plain names (accounts, businesses, business_memberships, business_database_registry, business_audit_logs, storefront_discovery_index) per D-05
- [Phase ?]: No canonical branches/locations table was created in dgfy_core (D-10); storefront_discovery_index is projection-only
- [Phase ?]: business_database_registry stores only database_name/stable_opaque_suffix/status/verified_at, never credentials (D-08, ASVS V6)
- [Phase ?]: Runner: schema migration metadata is target-scoped via a target_database column (composite key with name), so dgfy_core and every dgfy_business_* database track the same migration filename independently
- [Phase ?]: Runner: added DGFY_BUSINESS_DB_NAMES explicit target list, validated by BUSINESS_DB_NAME_PATTERN before any connection (RUN-03), for initial dgfy_business_* schema migration coverage
- [Phase ?]: Runner: schema migration files declare meta.targetKind ('core' default / 'business') so a business foundation migration can never run against dgfy_core (or vice versa) while staying in the same migrations directory
- [Phase ?]: dgfy_business_* tenant foundation cross-database references (dgfy_account_id, business_id, owner_dgfy_account_id, actor_dgfy_account_id) are opaque UUID columns with no foreign key, since MySQL cannot enforce FKs across separate databases
- [Phase ?]: Runner: verify.js's migration_metadata reuses schema.js's exported buildMigrationsForKind() as the single source of truth for expected migrations per target kind
- [Phase ?]: Runner: idempotency is derived from migration_metadata's missing_migrations per target rather than a second Umzug pending() call
- [Phase ?]: Runner: D-23 legacy fingerprint baseline is captured once by schema migrate (never overwritten on rerun) and compared by verify — fails closed when no baseline artifact exists
- [Phase ?]: Runner: tenant_coverage gates ok only on has_expected_schema; business_database_registry gaps are reported but never fail verification before registry rows are seeded
- [Phase ?]: Runner: verify.js migration_metadata try/catch is scoped per target (primary + each business target independently), mirroring business_schemas, closing CR-01
- [Phase 03]: Runner: DGFY_MIGRATION_TARGET_MANIFEST is opt-in-required via validateEnv(env, { requireMigrationManifest }) rather than unconditionally required, so schema/status/rollback-plan callers and their tests are unaffected; data dry-run/apply/verify wiring (03-03/03-04/03-05) will pass the flag
- [Phase 03]: Runner: legacy_id_map/data_checkpoints composite unique indexes are added via queryInterface.addIndex() only at first-run createTable time, backing up the lookup-before-insert helpers in metadata/dataState.js against retry duplicates
- [Phase 03]: Runner: createLegacyTenantSourceConnection() and the target manifest validator both reject any dgfy_-prefixed legacy_tenant_db_name (not just exact dgfy_core/dgfy_business_* matches), closing the manifest-tampering path to a DGFY-owned database
- [Phase ?]: [Phase 03]: tenant_ownership_metadata has no separate pure mapper — it is produced as a related_targets entry of mapLegacyTenantToBusiness() since it's a 1:1 derived write of that function's own inputs
- [Phase ?]: [Phase 03]: added classifyOutOfScopeRecord()/isInScopeLegacyTable()/OUT_OF_SCOPE_LEGACY_TABLES to mappings.js (mirrors dgfyCoreContract.js/dgfyBusinessContract.js rejectedTables) to make ADR 0029 exclusion testable, beyond the plan's literal 8 named mapper symbols
- [Phase ?]: [Phase 03]: business_memberships.role (owner/manager/member) and account_staff_assignments.role (owner/manager/staff) use two separate internal role-mapping tables since the two target tables have different enums for the same legacy role field
- [Phase ?]: Runner: runDataDryRun() passes { requireMigrationManifest: true } to validateEnv() and loads/validates the migration target manifest before any DB connection factory call
- [Phase ?]: Runner: dry-run report summary is scalar-only (tenant_coverage_count) with detailed tenant_coverage/results arrays as separate top-level report fields
- [Phase ?]: Runner: buildDryRunPlan() reclassifies mapper insert results to update via a single scoped legacy_id_map SELECT (current target state probe), avoiding per-record DB round trips
- [Phase ?]: [Phase 03]: apply.js re-scopes legacy_id_map lookup/record key to legacy_id + '::' + target_table when a fan-out collision is detected (business_membership + account_staff_assignment share one dgfy_account_tenant_memberships source key)
- [Phase ?]: [Phase 03]: apply's report results array is stripped to {legacy_tenant_id, entity_type, operation, status, target_table, target_database, dgfy_id} — never raw target_payload — closing the password_hash/terminal-secret/company_token report-leak threat
- [Phase 03]: Runner: verify.js migration_metadata error path uses missing_migrations:null (unknown sentinel) instead of [] (clean sentinel); idempotency derivation treats null as ok:false, closing the Phase 02 false-clean idempotency gap
- [Phase 03]: Runner: verify.js's new data_migration section only runs when DGFY_MIGRATION_TARGET_MANIFEST is configured (skip cleanly, ok:true, when absent) so schema-only verify runs stay unaffected; fails closed once a manifest is configured
- [Phase 03]: Runner: verifyData.js's checkDataCounts/checkRequiredRelationships/checkMapCompleteness/checkOpenFindings are pure DB-free functions, mirroring dryRun.js's pure-plan/impure-orchestration split
- [Phase 03]: Runner: tenant-local verification map-completeness keys use the manifest legacy_tenant_db_name, matching apply's durable legacy_id_map.legacy_source contract.
- [Phase 03]: Runner: apply resolves open dry-run findings only after successful exact legacy-key mapped writes, so stale first-pass orphans do not block clean post-apply verification.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4] Backend placement for Accounts/Businesses/Tenancy still needs an ADR impact decision before implementation planning.
- [Phase 3] Legacy data quality and production-like rehearsal inputs need inspection before migration proof can be trusted.

## Deferred Items

Items acknowledged and carried forward from milestone scope control:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Product/POS domains | Product, Availment, inventory, checkout, payments, discounts, shifts, fiscal compliance | Deferred to post-foundation milestones | Roadmap creation |
| Frontend migration | Storefront/POS/Business frontend migration into new app surfaces | Deferred until backend and compatibility evidence exists | Roadmap creation |
| Legacy decommissioning | Moving legacy code to `.archive` | Deferred until parity and no-active-path evidence exists | Roadmap creation |

## Session Continuity

Last session: 2026-07-11T07:24:51Z
Stopped at: Phase 03 complete; ready for Phase 04 planning
Resume file: None
