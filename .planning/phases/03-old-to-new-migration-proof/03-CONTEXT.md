# Phase 3: Old-to-New Migration Proof - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers old-to-new data migration scripts that transform legacy/current landlord and tenant data into the `dgfy_core`/`dgfy_business_*` schemas built in Phase 2. It extends the Phase 1 migration runner's `data dry-run` / `data apply` command surface with real transformation logic, dry-run reporting, checkpointed/retryable apply mode, deterministic legacy-to-DGFY ID mapping, and verification evidence comparing source and target state.

**In scope:** source-to-target mapping documentation for account, tenant/business, staff, branch/location, and terminal-like legacy records; dry-run reporting (planned inserts/updates/skips/conflicts/orphans/tenant coverage) without mutating `dgfy_*` data; apply mode with durable checkpoints and deterministic ID maps; interrupt/retry safety; data verification comparing source/target counts, relationships, and data-quality issues.

**Out of scope:** backend Accounts/Businesses/Tenancy APIs (Phase 4), any frontend/compatibility seam work (Phase 5), production cutover rehearsal/runbook (Phase 6/7), and any Product/POS/Storefront/fiscal domain data migration (deferred to post-foundation milestones per PROJECT.md).

</domain>

<decisions>
## Implementation Decisions

**[auto] mode — all gray areas auto-selected, recommended option chosen for each, no interactive prompts. Log below.**

### Migration Rehearsal Scope
- **D-01:** [auto] Migration Rehearsal Scope — Q: "Should a single migration run target all legacy tenants/businesses automatically, or an explicit operator-supplied list?" → Selected: "Explicit operator-supplied target list per run" (recommended default). This mirrors Phase 2's `DGFY_BUSINESS_DB_NAMES` explicit target-list pattern (D-02/D-03 in `02-CONTEXT.md`) — the runner never auto-discovers and migrates every legacy tenant on its own; the operator supplies which legacy account/tenant IDs are in scope for a given dry-run or apply invocation, keeping blast radius operator-controlled per the Strangler Fig incremental posture (fewer than 100 active users during migration, per PROJECT.md Business Context).

### Deterministic ID Mapping Mechanism
- **D-02:** [auto] ID Mapping Mechanism — Q: "Should legacy-to-DGFY ID mapping be a durable, queryable database table, or derived algorithmically (e.g., a deterministic hash of the legacy primary key)?" → Selected: "Durable `legacy_id_map` table in the runner's metadata store" (recommended default). Consistent with the established pattern that database-backed metadata is the source of truth (`dgfy_migration_meta.schema_migrations`, `dgfy_core.business_database_registry`) rather than derived/recomputed values — a persisted map (legacy_source, legacy_table, legacy_id, dgfy_table, dgfy_id, mapped_at) is itself auditable evidence for MIG-05 verification and lets retries look up existing mappings instead of recomputing or risking a second row.

### Checkpoint Granularity
- **D-03:** [auto] Checkpoint Granularity — Q: "Should checkpoints resume at the whole-tenant level, or at a finer per-entity-type-per-tenant level?" → Selected: "Per-entity-type-per-tenant checkpoint rows" (recommended default). Mirrors Phase 1's `command_executions` granularity (one row per command execution, not per whole run) — a checkpoint row per (tenant, entity type) pair (e.g., "tenant X / accounts: done", "tenant X / staff: in-progress") lets an interrupted migration resume at the exact entity type rather than restarting an entire tenant's migration from scratch, directly satisfying MIG-04's interrupt/retry requirement.

### Conflict and Data-Quality Handling Policy
- **D-04:** [auto] Conflict/Data-Quality Policy — Q: "Should apply mode hard-fail the entire run on any data-quality issue, or skip-and-report per-record while continuing?" → Selected: "Skip-and-report per-record, never silently drop" (recommended default). One bad legacy record (duplicate email, orphaned foreign key, missing required field) should not block migrating hundreds of otherwise-clean records — every skip/conflict is logged as a structured finding in the migration report (same JSON+summary report convention from Phase 1/2), and apply mode still requires the same `--confirm-destructive`-style explicit gate (D-10, Phase 1) before any DGFY-side write occurs at all.

### Claude's Discretion
No open implementation discretion beyond the recommended defaults above — all four gray areas were auto-resolved to their recommended option in `--auto` mode.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — database-first DGFY standalone refactor scope, active requirements, Phase 1/2 completion notes, and business context (fewer than 100 active users during migration window).
- `.planning/REQUIREMENTS.md` — MIG-01 through MIG-05 and milestone definition of done.
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria.
- `.planning/STATE.md` — current phase state and carried-forward concerns.

### Architecture Governance
- `docs/START_HERE.md` — canonical documentation lookup order; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend boundaries and architecture guardrails; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — ADR requirements, architecture proof, hardening contract; authoritative, last reviewed 2026-05-21.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — compatibility facade and Strangler Fig migration strategy.

### Prior Phase Evidence (locked decisions this phase builds on)
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` — D-03 locked both `SOURCE_DB_*` (legacy) and `TARGET_DB_*` (dgfy_*) env var contracts in Phase 1 specifically so Phase 3 would not need to renegotiate them; D-09 defines "destructive" (includes data migration apply mode) and D-10 the `--confirm-destructive` gate this phase's apply mode must use.
- `.planning/phases/02-dgfy-database-foundation/02-CONTEXT.md` — D-01/D-02 database naming (`dgfy_core`, `dgfy_business_<stable_opaque_suffix>`); D-06 through D-15 define exactly which landlord/tenant tables exist as migration targets (accounts, businesses, business_memberships, business_database_registry, business_audit_logs, storefront_discovery_index; locations, staff_accounts, account_staff_assignments, roles/role_permissions, terminal_identities, tenant_ownership_metadata, tenant_audit_logs).
- `.planning/phases/02-dgfy-database-foundation/02-VERIFICATION.md` and `02-SECURITY.md` — confirms the target schema contracts, migration metadata, and legacy non-mutation proof this phase's migrations must not violate.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` and `dgfyBusinessContract.js` — the authoritative target-schema contracts (table/column/index/constraint shape) this phase's transformation logic writes into.

### Legacy Source System
- `.planning/codebase/ARCHITECTURE.md` — legacy landlord/tenant architecture: `backend/src/models/Landlord/*` (landlord-scoped models), `backend/src/utils/TenantConnector.js` (per-tenant Sequelize connection cache), `backend/src/middleware/tenantHandler.js` (tenant resolution).
- `.planning/codebase/INTEGRATIONS.md` — legacy database connection convention (`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`, Sequelize + `mysql2`, `sequelize-cli` migration tooling under `backend/src/config/sequelize.config.cjs`).
- `docs/architecture/adr/0028-*` (DGFY membership authorization) — referenced by `ARCHITECTURE.md`'s "Tenant Access From Contact Matches" anti-pattern: legacy account-to-tenant linkage must not be inferred from email/phone matches during migration; use the same explicit `DgfyAccountTenantMembership`-equivalent linkage this phase produces.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dgfy-migration-runner/src/commands/data.js` — Phase 1's `data dry-run`/`data apply` command scaffold; this phase extends its (currently placeholder) transformation logic rather than introducing a new command surface.
- `apps/dgfy-migration-runner/src/config/db.js` — existing `createSourceConnection`/`createTargetConnection`/`createMetaConnection` factory functions; a legacy-tenant-scoped source connection factory (parallel to `createBusinessTargetConnection` from Plan 02-03) will likely be needed for reading per-tenant legacy databases.
- `apps/dgfy-migration-runner/src/metadata/storage.js` and `bootstrap.js` — existing `dgfy_migration_meta` metadata patterns (target-scoped storage, self-healing schema) to extend with the new `legacy_id_map` and per-entity-type checkpoint tables.
- `backend/src/models/Landlord/*` — legacy landlord Sequelize models (accounts/companies/memberships) this phase reads from as migration source.
- `backend/src/utils/TenantConnector.js` — existing per-tenant connection cache pattern; informs (but is not directly reused by) the migration runner's own legacy-tenant read-side connection handling, since the runner is intentionally isolated from `backend/`'s dependency surface (Phase 1 D-01).

### Established Patterns
- Database-backed metadata as source of truth (`dgfy_migration_meta.schema_migrations`, `dgfy_core.business_database_registry`) — extend this pattern for `legacy_id_map` and checkpoint state rather than using in-memory or file-based tracking.
- Explicit target-list env vars validated before any connection (`TARGET_DB_NAME`, `DGFY_BUSINESS_DB_NAMES`) — extend this pattern for legacy tenant/account target selection in this phase.
- JSON + human-readable summary report pairing for every runner command — dry-run and apply reports should follow the same convention.
- Fail-closed destructive-op gating (`assertDestructiveAllowed`, `--confirm-destructive`) — apply mode is destructive per D-09 (Phase 1) and must reuse this exact gate, not introduce a parallel confirmation mechanism.

### Integration Points
- Phase 2's schema contracts (`dgfyCoreContract.js`, `dgfyBusinessContract.js`) are the write-side contract this phase's transformation logic targets.
- Legacy `backend/src/models/Landlord/*` and per-tenant models (via `TenantConnector`-equivalent read access) are the read-side source.
- This phase's verification output and ID map become the audit trail Phase 4's backend APIs and Phase 6's release evidence will reference.

</code_context>

<specifics>
## Specific Ideas

- ID mapping table name: `legacy_id_map` (working name — planner may refine).
- Checkpoint granularity: per (tenant, entity type) pair.
- Migration target selection: explicit operator-supplied list (mirrors `DGFY_BUSINESS_DB_NAMES`), not auto-discovery of all legacy tenants.
- Apply-mode failure handling: skip-and-report per-record, never silent drop; still gated by `--confirm-destructive`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Product/POS/Storefront/fiscal domain migration, backend API implementation, and production cutover remain out of scope per PROJECT.md and are tracked in later phases (4 through 7).

</deferred>

---

*Phase: 3-Old-to-New Migration Proof*
*Context gathered: 2026-07-11*
