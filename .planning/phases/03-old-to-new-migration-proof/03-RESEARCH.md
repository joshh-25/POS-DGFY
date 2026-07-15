# Phase 03: old-to-new-migration-proof - Research

**Researched:** 2026-07-11
**Domain:** Legacy-to-DGFY MySQL data migration, migration-runner metadata, retry/idempotency proof
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### the agent's Discretion
No open implementation discretion beyond the recommended defaults above — all four gray areas were auto-resolved to their recommended option in `--auto` mode.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Product/POS/Storefront/fiscal domain migration, backend API implementation, and production cutover remain out of scope per PROJECT.md and are tracked in later phases (4 through 7).
</user_constraints>

## Summary

Phase 03 should extend the existing `apps/dgfy-migration-runner` `data dry-run` and `data apply` stubs, not add a second migration tool or backend startup path. The runner already validates env before connection, gates destructive apply before opening target connections, writes `command_executions`, produces JSON and summary reports, and uses `dgfy_migration_meta` as durable metadata. [VERIFIED: apps/dgfy-migration-runner/src/commands/data.js, apps/dgfy-migration-runner/src/metadata/bootstrap.js, 01-VERIFICATION.md]

The target mapping is constrained by Phase 02's real schema: `dgfy_core` owns `accounts`, `businesses`, `business_memberships`, `business_database_registry`, `business_audit_logs`, and `storefront_discovery_index`; each `dgfy_business_*` owns `locations`, `staff_accounts`, `account_staff_assignments`, `roles`, `role_permissions`, `terminal_identities`, `tenant_ownership_metadata`, and `tenant_audit_logs`. Legacy source shape comes from landlord `tenants`, legacy landlord `dgfy_accounts` / `dgfy_account_tenant_memberships`, and tenant-local `users`, `tenant_locations`, `system_settings.pos_terminal_registry`, and related grant data. [VERIFIED: docs/database/dgfy-foundation.md, dgfyCoreContract.js, dgfyBusinessContract.js, backend models/migrations]

**Primary recommendation:** Plan Phase 03 as five waves: metadata/data-run contract hardening, source-target mapping docs plus fixtures, dry-run transformations, checkpointed apply with legacy ID maps, and verification/retry evidence. [VERIFIED: .planning/REQUIREMENTS.md, 03-CONTEXT.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Data migration command orchestration | API / Backend tooling | Database / Storage | The one-shot runner owns CLI dispatch, validation, metadata, reports, and command evidence; it is intentionally separate from long-running backend/API containers. [VERIFIED: 01-VERIFICATION.md, apps/dgfy-migration-runner/src/cli.js] |
| Legacy source reads | API / Backend tooling | Database / Storage | Runner reads legacy landlord and selected tenant DBs through explicit source connections; backend services/models are reference shape, not runtime dependencies. [VERIFIED: apps/dgfy-migration-runner/src/config/db.js, 03-CONTEXT.md] |
| DGFY target writes | Database / Storage | API / Backend tooling | `dgfy_core` and selected `dgfy_business_*` schemas are the write targets created in Phase 02. [VERIFIED: docs/database/dgfy-foundation.md] |
| ID map and checkpoints | Database / Storage | API / Backend tooling | Durable `legacy_id_map` and per-entity checkpoints belong in `dgfy_migration_meta`, separate from canonical business data. [VERIFIED: 03-CONTEXT.md, apps/dgfy-migration-runner/src/metadata/bootstrap.js] |
| Data quality decisions | API / Backend tooling | Database / Storage | The runner must classify skip/conflict/orphan findings, then reports drive operator decisions. [VERIFIED: 03-CONTEXT.md] |
| Backend account/business APIs | API / Backend | Database / Storage | Out of scope until Phase 04; Phase 03 only prepares data/evidence. [VERIFIED: ROADMAP.md, REQUIREMENTS.md] |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-01 | Source-to-target mapping documentation defines how legacy/current account, tenant, staff, branch/location, and terminal-like records map into DGFY-owned schemas. | Use the mapping table in this research and write an implementation-owned mapping artifact before transformation code. [VERIFIED: REQUIREMENTS.md, backend source models, Phase 02 contracts] |
| MIG-02 | Data migration dry-run reports planned inserts, updates, skips, conflicts, orphan records, and tenant coverage without mutating `dgfy_*` data. | Implement dry-run as read-only source/target inspection plus report generation; keep current dry-run non-destructive behavior. [VERIFIED: apps/dgfy-migration-runner/src/commands/data.js] |
| MIG-03 | Data migration apply mode writes transformed data into `dgfy_*` schemas using durable checkpoints and deterministic legacy-to-DGFY ID maps. | Add `legacy_id_map` and `data_checkpoints` to `dgfy_migration_meta`; apply writes target rows and map rows transactionally per entity/tenant. [VERIFIED: 03-CONTEXT.md, Sequelize docs via Context7] |
| MIG-04 | Data migration can be interrupted and safely retried without duplicate records, inconsistent references, or manual cleanup. | Use per-entity-per-tenant checkpoints, unique target constraints, and ID-map lookups before inserts; include kill/retry tests. [VERIFIED: 03-CONTEXT.md, Phase 02 schema constraints] |
| MIG-05 | Data verification reports compare source and target counts, required relationships, skipped/conflict records, and unresolved data-quality issues. | Extend `verify` or add data verification sections that reconcile source counts, maps, target rows, checkpoints, and findings. [VERIFIED: REQUIREMENTS.md, apps/dgfy-migration-runner/src/commands/verify.js] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Read planning docs in order: `docs/START_HERE.md`, architecture boundaries, governance, relevant ADRs, then domain docs. [VERIFIED: AGENTS.md]
- Do not use `docs/archive/**` or deprecated docs as planning sources. [VERIFIED: AGENTS.md]
- Cross-boundary changes require an ADR update or new ADR. [VERIFIED: AGENTS.md, ARCHITECTURE_GOVERNANCE.md]
- Backend/API code must respect `routes -> controllers -> usecases -> repositories -> models`; this phase should avoid backend controllers entirely. [VERIFIED: ARCHITECTURE_BOUNDARIES.md]
- PRs must follow `docs/ai/PR.md`, Conventional Commits, target `develop` for non-`rc/*`, scan changed files for the repository's forbidden commit marker, and batch commits by domain. [VERIFIED: AGENTS.md]
- Use Context7 for current library/framework/API docs. [VERIFIED: AGENTS.md]
- Architecture proof should include `npm run check:architecture` when architecture-sensitive files change. [VERIFIED: ARCHITECTURE_GOVERNANCE.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | installed `^6.37.8`; registry latest `6.37.8`; modified 2026-06-29 | Target/source SQL, QueryInterface, transactions | Existing runner/backend ORM; official docs cover transactions, raw replacements, and upsert semantics. [VERIFIED: package.json + npm registry + Context7 /sequelize/website] |
| `umzug` | installed/latest `^3.8.3`; registry latest `3.8.3`; modified 2026-05-01 | Schema migration orchestration only | Existing runner uses custom storage; official docs support custom storage and `pending()`. [VERIFIED: package.json + npm registry + Context7 /sequelize/umzug] |
| `mysql2` | installed `^3.6.5`; registry latest `3.22.6`; modified 2026-07-10 | MySQL driver and raw metadata bootstrap | Existing dependency; latest is flagged too-new, so keep pinned range unless a human approves upgrade. [VERIFIED: package.json + package-legitimacy seam + npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | installed/latest `^15.0.0`; registry latest `15.0.0` | Existing CLI command surface | Keep `data dry-run` / `data apply` under current CLI. [VERIFIED: package.json + npm registry] |
| `dotenv` | installed `^16.6.1`; registry latest not required for Phase 03 | Local env loading at CLI entry only | Keep env module side-effect free; `cli.js` owns `dotenv.config()`. [VERIFIED: cli.js, env.js] |
| `jest` | installed `^29.7.0`; registry latest `30.4.2` | Runner unit/integration tests | Keep current ESM/Jest setup; no framework upgrade in migration phase. [VERIFIED: package.json + npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing runner data commands | New standalone script under `backend/scripts` | Reject: bypasses Phase 1 command/report/metadata contract and mixes migration with backend runtime. [VERIFIED: 01-VERIFICATION.md, RUN-01..RUN-05] |
| Durable ID map table | Hash-only deterministic IDs | Reject: durable table is a locked Phase 3 decision and produces auditable retry evidence. [VERIFIED: 03-CONTEXT.md] |
| Hard-fail whole run on bad record | Skip-and-report per record | Reject hard-fail as default: Phase 3 locked skip-and-report, while still surfacing every issue in reports. [VERIFIED: 03-CONTEXT.md] |
| Raw schema copy | Transform into DGFY contracts | Reject: raw-copying legacy schemas is explicitly out of scope. [VERIFIED: REQUIREMENTS.md] |

**Installation:**
```bash
# No new external packages recommended for Phase 03.
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

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: package-legitimacy seam]
**Packages flagged as suspicious [SUS]:** `mysql2` latest only; existing installed range remains in use. [VERIFIED: package-legitimacy seam]

## Architecture Patterns

### System Architecture Diagram

```text
operator / CI
  |
  v
dgfy-migration-runner data dry-run/apply
  |
  +--> validate env + explicit target list before connecting
  |     +--> legacy landlord DB SOURCE_DB_NAME
  |     +--> selected legacy tenant IDs / DB names
  |     +--> TARGET_DB_NAME=dgfy_core
  |     +--> DGFY_BUSINESS_DB_NAMES=selected dgfy_business_* targets
  |
  +--> bootstrap dgfy_migration_meta
  |     +--> command_executions
  |     +--> legacy_id_map
  |     +--> data_checkpoints
  |     +--> data_quality_findings
  |
  +--> dry-run path
  |     +--> read source + target + maps
  |     +--> classify inserts/updates/skips/conflicts/orphans
  |     +--> JSON report + summary only
  |
  +--> apply path (--confirm-destructive required)
  |     +--> entity order: accounts -> businesses/registry -> locations -> staff -> assignments -> terminals -> audit/projection
  |     +--> per entity/tenant transaction where possible
  |     +--> write target rows + legacy_id_map + checkpoint
  |
  +--> verify
        +--> source/target counts
        +--> map completeness
        +--> required relationships
        +--> unresolved findings
        +--> retry/idempotency evidence
```

### Recommended Project Structure

```text
apps/dgfy-migration-runner/src/
├── commands/data.js                 # keep CLI entry; delegate to migration orchestration
├── data/
│   ├── legacySource.js              # source selectors and explicit target-list resolution
│   ├── mappings.js                  # source-to-target transform functions
│   ├── dryRun.js                    # read-only classification/report assembly
│   ├── apply.js                     # gated writes, checkpoints, id maps
│   └── verifyData.js                # MIG-05 reconciliation sections
├── metadata/
│   ├── bootstrap.js                 # extend with data metadata tables
│   └── dataState.js                 # ID map/checkpoint/finding helpers
└── tests/
    ├── dataMigrationMapping.test.js
    ├── dataMigrationDryRun.test.js
    ├── dataMigrationApply.test.js
    └── dataMigrationRetry.test.js

docs/database/
└── dgfy-data-migration-map.md       # source-to-target mapping evidence for MIG-01
```

### Pattern 1: Extend Metadata Bootstrap, Then Fail Fast On Drift

**What:** Add `legacy_id_map`, `data_checkpoints`, and `data_quality_findings` to `EXPECTED_TABLE_COLUMNS` in `metadata/bootstrap.js`; create missing tables on first run and throw `MetadataSchemaError` for later structural mismatches. [VERIFIED: apps/dgfy-migration-runner/src/metadata/bootstrap.js]
**When to use:** Before dry-run/apply/verify need durable migration state. [VERIFIED: 03-CONTEXT.md]
**Example:**
```js
// Source pattern: apps/dgfy-migration-runner/src/metadata/bootstrap.js
const LEGACY_ID_MAP_COLUMNS = {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  run_scope: { type: DataTypes.STRING(120), allowNull: false },
  legacy_source: { type: DataTypes.STRING(120), allowNull: false },
  legacy_table: { type: DataTypes.STRING(120), allowNull: false },
  legacy_id: { type: DataTypes.STRING(120), allowNull: false },
  dgfy_database: { type: DataTypes.STRING(128), allowNull: false },
  dgfy_table: { type: DataTypes.STRING(120), allowNull: false },
  dgfy_id: { type: DataTypes.STRING(120), allowNull: false },
  mapped_at: { type: DataTypes.DATE, allowNull: false }
};
```

### Pattern 2: Transactional Entity Slice With ID Map Lookup

**What:** For apply, first query `legacy_id_map`; if found, update/verify the target row; if absent, insert target row and map row in the same transaction for that target connection and metadata connection when possible. Sequelize docs support manual transactions and raw replacements. [CITED: Context7 /sequelize/website]
**When to use:** Accounts, businesses, locations, staff, assignments, and terminal identities. [VERIFIED: Phase 02 target constraints]
**Example:**
```js
// Source: Context7 /sequelize/website transaction pattern, adapted to runner shape.
const transaction = await targetSequelize.transaction();
try {
  const [existingMap] = await metaSequelize.query(
    'SELECT dgfy_id FROM legacy_id_map WHERE legacy_source = ? AND legacy_table = ? AND legacy_id = ? LIMIT 1',
    { replacements: [legacySource, legacyTable, String(legacyId)] }
  );

  if (!existingMap.length) {
    await targetSequelize.getQueryInterface().bulkInsert(targetTable, [targetRow], { transaction });
    await metaSequelize.getQueryInterface().bulkInsert('legacy_id_map', [mapRow]);
  }

  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Pattern 3: Dry-Run Uses Same Transform Functions As Apply

**What:** Dry-run should call the same `mapLegacyTenantToBusiness`, `mapLegacyUserToStaffAccount`, and similar pure mappers as apply, but stop before target mutation. [VERIFIED: MIG-02, MIG-03]
**When to use:** Prevent dry-run/apply drift; tests can prove the same input yields the same target keys and conflict classifications. [VERIFIED: REQUIREMENTS.md]

### Pattern 4: Report Findings, Do Not Hide Them

**What:** Every skipped/conflicting/orphaned record becomes a structured `data_quality_findings` row and report entry with `severity`, `entity_type`, `legacy_table`, `legacy_id`, `reason_code`, `message`, and `remediation`. [VERIFIED: 03-CONTEXT.md]
**When to use:** Duplicate emails/phones, inactive/deleted users, missing tenant DB, missing DGFY account link, invalid terminal code, terminal location that cannot map to a migrated location. [VERIFIED: backend models/services]

### Anti-Patterns to Avoid

- **Auto-discovering all tenants and migrating them:** locked D-01 requires explicit operator-supplied targets. [VERIFIED: 03-CONTEXT.md]
- **Inferring company access from email or phone:** ADR 0028 says switch/access requires explicit accepted membership; email/phone matching is not authorization. [VERIFIED: ADR 0028]
- **Copying legacy `company_token` into public DGFY reports:** ADR 0028 forbids exposing `company_token` in switcher/list payloads; migration reports should not leak secrets or tenant tokens. [VERIFIED: ADR 0028]
- **Migrating POS transactions, products, payments, inventory, fiscal tables:** explicitly out of scope for Phase 03/v1 foundation. [VERIFIED: REQUIREMENTS.md, ADR 0029 catalog/POS boundaries]
- **Treating `system_settings.pos_terminal_registry` as checkout/POS history:** use it only as terminal identity source for `terminal_identities`; leave shifts/transactions/fiscal records out of scope. [VERIFIED: dgfyBusinessContract.js, dgfyPosTerminalPolicyService.js]
- **Reporting idempotency clean when metadata checks error:** Phase 02 verification found `verify.js` can derive `idempotency.ok=true` from error fallback `missing_migrations: []`; fix or account for this before data verification relies on the same pattern. [VERIFIED: 02-VERIFICATION.md, verify.js]

## Source-To-Target Mapping

| Entity | Legacy Source | DGFY Target | Mapping Guidance |
|--------|---------------|-------------|------------------|
| DGFY account | `backend/src/models/Landlord/DgfyAccount.js` / `dgfy_accounts` | `dgfy_core.accounts` | Map UUID `id`, names, lowercased email, phone, password hash, active/deleted state to `status`, verification timestamps, last login. `middle_name`, username, provisioning flags, and admin lifecycle fields have no Phase 02 target column; document as deferred or skip fields, not silent loss. [VERIFIED: DgfyAccount.js, dgfyCoreContract.js] |
| Business | `tenants` landlord table/model | `dgfy_core.businesses` | Map tenant `id` to business UUID only if accepted by ID-map strategy; `name` to `legal_name`/`display_name`; derive `business_handle` from safe stable identifier, not display-name DB naming. Status maps active/pending/inactive/archived into target enum. [VERIFIED: Tenant.js, dgfyCoreContract.js, docs/database/dgfy-foundation.md] |
| Business DB registry | `tenants.db_name`, explicit target `DGFY_BUSINESS_DB_NAMES` | `dgfy_core.business_database_registry` | Store target `dgfy_business_*` name, stable opaque suffix, status, verified timestamp; never store credentials. Requires explicit source tenant to target DB pairing in run config/report. [VERIFIED: Tenant.js, dgfyCoreContract.js, docs/database/dgfy-foundation.md] |
| Business membership | `dgfy_account_tenant_memberships`, `tenants.owner_dgfy_account_id`, tenant-local master admin | `dgfy_core.business_memberships` | Accepted founder/admin membership becomes active owner/member as appropriate; pending/declined/removed map to invited/removed or skip with finding. Do not create membership from email/phone alone. [VERIFIED: DgfyAccountTenantMembership.js, ADR 0028] |
| Tenant ownership metadata | `tenants.owner_dgfy_account_id`, target business ID/suffix | `dgfy_business_*.tenant_ownership_metadata` | Write exactly one row per migrated business with `business_id`, `business_handle`, `stable_opaque_suffix`, owner account ID. Missing owner account is a conflict unless an accepted migration policy handles ownerless platform-admin tenants. [VERIFIED: Tenant.js, dgfyBusinessContract.js, ADR 0028] |
| Staff profile | tenant-local `users` | `dgfy_business_*.staff_accounts` | Map `user_id` via `legacy_id_map`, display name from username/email, email, phone, active/deleted to status, `is_master_admin`. Unique email conflicts must skip/report or reconcile through explicit policy. [VERIFIED: User.js, dgfyBusinessContract.js] |
| Account-staff assignment | `dgfy_account_tenant_memberships.tenant_user_id` + tenant-local `users` | `dgfy_business_*.account_staff_assignments` | Only create assignment when accepted membership links a DGFY account to the tenant user. Role maps owner/admin to owner/manager/staff as specified by mapping doc. Missing accepted membership is unresolved, not inferred. [VERIFIED: DgfyTenantSessionService.js, ADR 0028] |
| Roles/permissions | tenant-local `users.role`, `permissions`, `DEFAULT_ROLE_PERMISSIONS` | `roles`, `role_permissions`, assignment `role` | Seed standard role rows and permissions once per business DB; map staff assignment role to Phase 02 enum (`owner`, `manager`, `staff`). [VERIFIED: User.js, dgfyBusinessContract.js, dgfyTenantSessionService.js] |
| Location/branch | tenant-local `tenant_locations` | `dgfy_business_*.locations` | Map `location_id`, name, address, nullable coordinates, active flag, primary storefront flag to `is_primary`; report duplicate/missing required name/address. [VERIFIED: TenantLocation.js, dgfyBusinessContract.js] |
| Terminal identity | tenant-local `system_settings.setting_key='pos_terminal_registry'` JSON | `dgfy_business_*.terminal_identities` | Normalize terminal ID to uppercase code, label, active status, and mapped `location_id`. Do not migrate terminal passwords, pairing secrets, shifts, drawers, transactions, or fiscal terminal registrations. [VERIFIED: posTerminalRegistrySecrets.js, dgfyPosTerminalPolicyService.js, dgfyBusinessContract.js] |
| Storefront discovery projection | legacy `StorefrontDiscoveryIndex` / tenant visibility settings / migrated location snapshot | `dgfy_core.storefront_discovery_index` | Optional lightweight projection only; not canonical branch truth. Ensure no `company_token` or credentials in snapshot. [VERIFIED: docs/database/dgfy-foundation.md, ADR 0010 reference in doc] |
| Audit evidence | migration action context | `business_audit_logs`, `tenant_audit_logs`, runner reports | Write migration-sensitive admin/audit rows without secrets where meaningful, but runner metadata remains the primary Phase 03 evidence. [VERIFIED: dgfyCoreContract.js, dgfyBusinessContract.js, metadata/bootstrap.js] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration command framework | New bespoke CLI | Existing Commander `data` commands | RUN-02 already standardized command surface and tests. [VERIFIED: cli.js, 01-VERIFICATION.md] |
| Schema migration state | File-based migration logs | `dgfy_migration_meta` metadata tables | RUN-04 requires DB-backed metadata; Phase 02 already uses target-scoped storage. [VERIFIED: metadata/storage.js] |
| ID reconciliation | In-memory maps or hash-only IDs | Durable `legacy_id_map` | Locked decision and required for audit/retry evidence. [VERIFIED: 03-CONTEXT.md] |
| Retry state | Whole-run boolean | Per-entity-per-tenant checkpoints | Locked decision; needed to resume partial tenant migrations. [VERIFIED: 03-CONTEXT.md] |
| SQL interpolation | String-concatenated SQL | Sequelize replacements / mysql2 placeholders | Official docs show replacements/placeholders for parameter binding. [CITED: Context7 /sequelize/website, /websites/sidorares_github_io_node-mysql2] |
| Access authorization | Email/phone match | Explicit accepted membership rows | ADR 0028 fails closed without membership. [VERIFIED: ADR 0028] |

**Key insight:** The dangerous part of Phase 03 is not row insertion; it is proving that every migrated reference is backed by a deterministic map, every skipped record is visible, and every retry uses prior durable state instead of re-creating rows. [VERIFIED: MIG-03, MIG-04, MIG-05]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Legacy landlord DB stores `tenants`, `dgfy_accounts`, `dgfy_account_tenant_memberships`; each tenant DB stores `users`, `tenant_locations`, `system_settings`, `user_location_grants`, POS tables. [VERIFIED: docs/database/schema.md, backend models/migrations] | Add read-only source selectors and explicit source/target pairing; never mutate legacy source. |
| Live service config | No UI-managed external service config is needed for Phase 03. Runner uses env vars and selected MySQL DBs. [VERIFIED: env.js, 03-CONTEXT.md] | Add explicit legacy tenant target list config; reject blanks/duplicates/unknown targets before connection. |
| OS-registered state | None found for this phase; runner is one-shot CLI/container, not a system service. [VERIFIED: 01-VERIFICATION.md] | No OS registration migration needed. |
| Secrets/env vars | Existing env includes `SOURCE_DB_*`, `TARGET_DB_*`, `TARGET_DB_NAME`, `DGFY_BUSINESS_DB_NAMES`, `MIGRATION_ACTOR`, `REPORT_DIR`; target DB registry must never store credentials. [VERIFIED: env.js, docs/database/dgfy-foundation.md] | Add source tenant selection env/option without exposing passwords in reports. |
| Build artifacts | Existing runner `node_modules`, package lock, Docker image contract, reports directory. [VERIFIED: package.json, 01-VERIFICATION.md] | Keep reports under `REPORT_DIR`; no global install or generated runtime artifact should become source of truth. |

## Common Pitfalls

### Pitfall 1: Email Match Becomes Authorization
**What goes wrong:** Migration links a DGFY account to a tenant user because email or phone matches. [VERIFIED: ADR 0028]
**Why it happens:** Legacy login tolerated tenant-local identities, but DGFY switching requires accepted membership. [VERIFIED: ADR 0028]
**How to avoid:** Only create account/business memberships and account-staff assignments from existing accepted membership rows or an explicit migration repair policy. [VERIFIED: DgfyTenantSessionService.js]
**Warning signs:** Report says "matched by email" without a membership ID. [VERIFIED: ADR 0028]

### Pitfall 2: Dry-Run And Apply Drift
**What goes wrong:** Dry-run reports one count, apply writes different rows. [VERIFIED: MIG-02, MIG-03]
**Why it happens:** Separate transform logic or target conflict checks. [VERIFIED: codebase data.js stub]
**How to avoid:** Share pure mapper/classifier functions between dry-run and apply; tests should assert both paths use same output. [VERIFIED: REQUIREMENTS.md]
**Warning signs:** Dry-run has report-only mapping code not imported by apply. [VERIFIED: apps/dgfy-migration-runner/src/commands/data.js]

### Pitfall 3: Retry Duplicates Target Rows
**What goes wrong:** Interrupted apply inserts second accounts/businesses/staff rows on rerun. [VERIFIED: MIG-04]
**Why it happens:** Apply does not consult `legacy_id_map` and target unique constraints before insert. [VERIFIED: 03-CONTEXT.md]
**How to avoid:** Lookup map first, use unique constraints, checkpoint after durable writes, and verify row identity on rerun. [VERIFIED: Phase 02 schema constraints]
**Warning signs:** Tests only cover clean first apply, not apply-after-partial-failure. [VERIFIED: current tests lack Phase 03 files]

### Pitfall 4: Terminal Registry Scope Creep
**What goes wrong:** Migration pulls POS shifts, fiscal registrations, transactions, or passwords into `terminal_identities`. [VERIFIED: ADR 0029 catalog/POS boundaries, dgfyBusinessContract.js]
**Why it happens:** Several legacy POS tables contain `terminal_id`, but Phase 02 target table is identity/status/location only. [VERIFIED: backend migrations search]
**How to avoid:** Source terminal identities only from sanitized `pos_terminal_registry` entries; exclude secrets and history. [VERIFIED: posTerminalRegistrySecrets.js, dgfyPosTerminalPolicyService.js]
**Warning signs:** Migration references `pos_terminal_shifts`, `pos_transactions`, or fiscal tables as write sources. [VERIFIED: backend migrations]

### Pitfall 5: Verification False-Clean Signals
**What goes wrong:** Verification reports idempotency clean despite metadata errors. [VERIFIED: 02-VERIFICATION.md]
**Why it happens:** Current `verify.js` catch paths set `missing_migrations: []`; derived `idempotency.ok` treats empty as success. [VERIFIED: apps/dgfy-migration-runner/src/commands/verify.js]
**How to avoid:** Fix sentinel to `null`/unknown or keep data verification independent from that derived field. [VERIFIED: 02-VERIFICATION.md]
**Warning signs:** Report has `migration_metadata.ok=false` but `idempotency.ok=true` for same target. [VERIFIED: 02-VERIFICATION.md]

## Code Examples

### Data Apply Gate Is Already Correct
```js
// Source: apps/dgfy-migration-runner/src/commands/data.js
assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
assertDestructiveAllowed({ isDestructive: true, confirmDestructive, runtimeMode: config.runtimeMode });

let metaSequelize;
let executionId;

try {
  createTargetConnection(config);
  metaSequelize = createMetaConnection(config);
  await ensureMetadataSchema(metaSequelize);
  // Phase 03 transformation writes start after this point.
}
```

### Source Connection Factory Is Lazy
```js
// Source: apps/dgfy-migration-runner/src/config/db.js
export function createSourceConnection(config) {
  const { host, port, user, password, name } = config.sourceDb;
  return new Sequelize(name, user, password, {
    host,
    port,
    dialect: 'mysql',
    logging: false
  });
}
```

### Terminal Registry Normalization
```js
// Source: backend/src/modules/settings/usecases/posTerminalRegistrySecrets.js
const normalizeRegistryEntry = (entry = {}) => ({
  terminal_id: sanitizeTerminalId(entry.terminal_id),
  label: String(entry.label || '').trim(),
  location_id: parsePositiveInt(entry.location_id),
  cashier_email: String(entry.cashier_email || '').trim().toLowerCase(),
  is_active: entry.is_active !== false
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Backend or sequelize-cli migrations as operational side effects | Dedicated one-shot `apps/dgfy-migration-runner` with explicit commands | Phase 01, 2026-07-10 | Phase 03 must extend runner commands, not backend startup. [VERIFIED: 01-VERIFICATION.md] |
| Legacy `sku_*` tenant DB as canonical future shape | New `dgfy_core` and `dgfy_business_*` foundations beside legacy | Phase 02, 2026-07-11 | Phase 03 transforms into DGFY contracts; no raw schema copy. [VERIFIED: docs/database/dgfy-foundation.md] |
| Company access inferred from tenant-local login/email | Explicit DGFY account membership contract | ADR 0028, reviewed 2026-07-02 | Migration must create/use explicit membership evidence. [VERIFIED: ADR 0028] |
| Terminal identity as settings JSON and POS shift history | `terminal_identities` identity/status/location foundation | Phase 02 | Migrate registry identity only, not POS operational history. [VERIFIED: dgfyBusinessContract.js] |

**Deprecated/outdated:**
- Using `sequelize.sync({ alter: true })` for production migration strategy is not suitable; use explicit migrations/runner contracts. [CITED: Context7 /sequelize/website]
- Treating `docs/database/schema.md` as the DGFY-era target schema is outdated; `docs/database/dgfy-foundation.md` is authoritative for new `dgfy_*` schemas. [VERIFIED: docs/database/dgfy-foundation.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions (RESOLVED FOR PLANNING)

1. **How should source tenant IDs map to target `dgfy_business_*` names per run?**
   - What we know: Phase 3 requires explicit operator-supplied target list, and Phase 2 already has `DGFY_BUSINESS_DB_NAMES`. [VERIFIED: 03-CONTEXT.md, env.js]
   - Resolution: Planner should require a structured JSON target manifest, with an env/file path such as `DGFY_MIGRATION_TARGET_MANIFEST`, that pairs legacy tenant ID, legacy tenant DB name, target business DB name, and expected target business/account IDs. The runner must validate this manifest before opening source or target connections. [VERIFIED: RUN-03 pattern]

2. **What is the authoritative owner rule for legacy tenants with missing accepted DGFY membership?**
   - What we know: ADR 0028 forbids authorization by email/phone inference and says ownerless platform-admin tenants exist. [VERIFIED: ADR 0028]
   - Resolution: For Phase 03, dry-run and apply should treat missing accepted membership/owner evidence as a structured conflict and skip writes for the affected membership/assignment/ownership rows. Do not create ownerless/suspended DGFY target records unless a later explicit repair policy is planned. [VERIFIED: 03-CONTEXT.md]

3. **Should storefront discovery projection be populated in Phase 03?**
   - What we know: `storefront_discovery_index` is projection-only and canonical locations live in `dgfy_business_*`. [VERIFIED: docs/database/dgfy-foundation.md]
   - Resolution: Keep storefront discovery projection out of the critical MIG-01 through MIG-05 path. The required Phase 03 branch/location migration target is `dgfy_business_*.locations`; `dgfy_core.storefront_discovery_index` may be read or reported as optional projection evidence only and must not block migration completion. [VERIFIED: docs/database/dgfy-foundation.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runner tests and CLI | ✓ | v24.14.0 | None needed. [VERIFIED: local command] |
| npm | Package scripts | ✓ | 11.12.1 | None needed. [VERIFIED: local command] |
| MySQL CLI | Manual DB inspection | ✗ | — | Use Sequelize/mysql2 integration tests or CI DB credentials. [VERIFIED: local command] |
| MySQL server/admin credentials | Live end-to-end migration rehearsal | Not verified locally | — | Keep `RUN_PHASE02_INTEGRATION=true` style opt-in and add Phase 03 equivalent. [VERIFIED: 02-VERIFICATION.md] |
| Docker | Runner image verification | Previously verified in Phase 01 | — | Use local npm tests when image build is out of scope. [VERIFIED: 01-VERIFICATION.md] |

**Missing dependencies with no fallback:**
- None for planning/unit-test design. [VERIFIED: local environment + package scripts]

**Missing dependencies with fallback:**
- MySQL CLI is missing; use Node/mysql2/Sequelize tests and CI/live MySQL integration gates. [VERIFIED: local command, phase02Integration.test.js]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Preserve password hashes only; never log passwords, tokens, OTPs, terminal passwords, or `company_token`. [VERIFIED: DgfyAccount.js, ADR 0028] |
| V3 Session Management | no | Phase 03 does not issue sessions; Phase 04 owns API/session behavior. [VERIFIED: ROADMAP.md] |
| V4 Access Control | yes | Create business/account/staff links only from explicit accepted membership or approved migration policy. [VERIFIED: ADR 0028] |
| V5 Input Validation | yes | Validate explicit target list, DB names, terminal codes, emails/phones, and JSON settings before DB writes. [VERIFIED: env.js, dgfyPosTerminalPolicyService.js] |
| V6 Cryptography | yes | Do not transform password hashes or terminal password hashes; do not store DB credentials in `business_database_registry` or reports. [VERIFIED: docs/database/dgfy-foundation.md, posTerminalRegistrySecrets.js] |
| V7 Error Handling and Logging | yes | Structured findings and reports without secrets; failed command rows must be completed as failed. [VERIFIED: metadata/bootstrap.js, 01-VERIFICATION.md] |
| V10 Malicious Code | yes | No new packages; use existing audited dependencies and avoid dynamic untrusted code execution. [VERIFIED: package audit] |

### Known Threat Patterns for Migration Runner

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Target-list tampering migrates unintended tenant | Tampering | Explicit manifest validation, no auto-discovery, reject unknown/duplicate targets before connection. [VERIFIED: 03-CONTEXT.md, env.js pattern] |
| SQL injection through IDs or DB names | Tampering | Validate DB names by regex; use Sequelize replacements/mysql2 placeholders for values. [VERIFIED: env.js, Context7 Sequelize/mysql2 docs] |
| Secret leakage in reports | Information Disclosure | Report IDs/counts/findings only; never output DB passwords, `company_token`, password hashes, terminal password hashes, OTPs. [VERIFIED: ADR 0028, docs/database/dgfy-foundation.md] |
| Privilege escalation through email-based membership | Elevation of Privilege | Require explicit accepted membership linkage; fail closed otherwise. [VERIFIED: ADR 0028] |
| Replay/retry creates duplicates | Tampering | Durable ID map, unique constraints, checkpoints, retry tests. [VERIFIED: 03-CONTEXT.md, Phase 02 schema contracts] |
| Repudiation of migration actions | Repudiation | `command_executions`, `legacy_id_map`, checkpoints, findings, JSON reports, and audit rows. [VERIFIED: metadata/bootstrap.js, 03-CONTEXT.md] |

## Concrete Planner Targets

| Area | Files | Planning Guidance |
|------|-------|-------------------|
| Data command entry | `apps/dgfy-migration-runner/src/commands/data.js` | Replace stub body with orchestration but keep validation, target guard, destructive gate ordering, command start/complete, and reports. [VERIFIED: data.js] |
| Env/source target list | `src/config/env.js` | Add explicit legacy migration target manifest/list validation; reject duplicates and mismatches before DB connections. [VERIFIED: env.js, 03-CONTEXT.md] |
| DB factories | `src/config/db.js` | Add legacy tenant source connection factory parallel to `createBusinessTargetConnection`; do not import backend `TenantConnector`. [VERIFIED: db.js, 03-CONTEXT.md] |
| Metadata | `src/metadata/bootstrap.js`, new `src/metadata/dataState.js` | Add ID map, checkpoints, findings; keep self-heal then fail-fast drift policy. [VERIFIED: bootstrap.js] |
| Mapping docs | `docs/database/dgfy-data-migration-map.md` | Required for MIG-01; cite source/target fields and unresolved policies. [VERIFIED: MIG-01] |
| Verify | `src/commands/verify.js` or `src/data/verifyData.js` | Add data verification sections; fix/avoid Phase 02 false-clean idempotency warning. [VERIFIED: verify.js, 02-VERIFICATION.md] |
| Tests | `apps/dgfy-migration-runner/tests/*.test.js` | Add unit fixtures and gated live MySQL integration for dry-run/apply/retry/verify. [VERIFIED: existing tests] |

## Sources

### Primary (HIGH confidence)
- `AGENTS.md` - repository planning, docs, PR, Context7, and architecture rules. [VERIFIED: file read]
- `docs/START_HERE.md`, `ARCHITECTURE_BOUNDARIES.md`, `ARCHITECTURE_GOVERNANCE.md` - authoritative planning and architecture guardrails. [VERIFIED: file read]
- `docs/architecture/adr/0003-migration-facade-strategy.md` - Strangler Fig/compatibility facade strategy. [VERIFIED: file read]
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` - explicit membership authorization contract. [VERIFIED: file read]
- `docs/database/dgfy-foundation.md` - authoritative DGFY schema foundation. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `03-CONTEXT.md` - Phase 03 scope and locked decisions. [VERIFIED: file read]
- `apps/dgfy-migration-runner/src/**` and tests - runner command, metadata, schema contract, verification implementation. [VERIFIED: codebase grep/read]
- `backend/src/models/**`, `backend/migrations/**`, selected services - legacy source shape and access semantics. [VERIFIED: codebase grep/read]

### Secondary (MEDIUM confidence)
- Context7 `/sequelize/website` - Sequelize v6 transactions, raw queries, upsert, QueryInterface docs. [CITED: Context7]
- Context7 `/sequelize/umzug` - Umzug v3 custom storage, `pending()`, `up()`, context docs. [CITED: Context7]
- Context7 `/websites/sidorares_github_io_node-mysql2` - mysql2 promise placeholders/prepared execute docs. [CITED: Context7]

### Tertiary (LOW confidence)
- None. [VERIFIED: research process]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing dependencies verified in package.json, npm registry, package-legitimacy seam, and Context7 docs. [VERIFIED: package audit + Context7]
- Architecture: HIGH - Governed docs, ADRs, Phase 1/2 artifacts, and code all align on runner-owned migration beside legacy. [VERIFIED: docs + code]
- Mappings: HIGH for source/target fields found; MEDIUM for unresolved ownerless tenant and target manifest policy because implementation does not exist yet. [VERIFIED: codebase + Open Questions]
- Pitfalls: HIGH - Derived from locked Phase 3 decisions, ADR 0028, Phase 2 verification warning, and current code. [VERIFIED: docs + code]

**Research date:** 2026-07-11
**Valid until:** 2026-08-10
