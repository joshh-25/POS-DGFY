# Phase 1: Architecture and Migration Runner Contract - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the migration runner **contract** — a dedicated one-shot artifact operators use to run database migration work, separate from the long-running backend/API containers. It defines: the command surface (schema migrate, data dry-run, data apply, verify, status/reporting, rollback-plan), environment/destructive-op validation before any DB connection, a DB-backed execution metadata store, and machine + human readable reports.

**Not in scope for this phase:** the actual `dgfy_*` landlord/tenant schema definitions (Phase 2), real old-to-new data migration scripts (Phase 3), and backend Accounts/Businesses/Tenancy APIs (Phase 4). This phase proves the harness works — command dispatch, validation, metadata, reporting — not the domain-specific migration logic that will run through it.

</domain>

<decisions>
## Implementation Decisions

### Runner Placement & CLI Design
- **D-01:** The runner lives at `apps/dgfy-migration-runner`, matching the existing `apps/dgfy-api` convention for standalone deployable surfaces — own `package.json`, own Dockerfile, isolated from `backend/` and `apps/dgfy-api/` dependency surfaces.
- **D-02:** Build a custom Node CLI (e.g. commander/yargs) on top of Sequelize's `QueryInterface`, not a wrapper around `sequelize-cli`. `sequelize-cli` only understands migrate/undo — it has no concept of data dry-run, verify, status, or rollback-plan, all of which RUN-02 requires from one image.
- **D-03:** Lock the full environment variable contract now: both `SOURCE_DB_*` (legacy) and `TARGET_DB_*` (dgfy_*) connection vars are defined in Phase 1, even though Phase 3 is where source-DB reads actually start. This avoids re-negotiating the runner's env contract in later phases (RUN-03 requires validation before any connection).
- **D-04:** Command selection uses subcommands (e.g. `node runner.js schema migrate`, `node runner.js data dry-run`, `node runner.js verify`) — explicit, discoverable via `--help`, and scriptable from CI/deploy steps.

### Metadata Bootstrap Sequencing
- **D-05:** The runner bootstraps and owns its own minimal metadata schema (working name `dgfy_migration_meta`), independent of whether the `dgfy_*` landlord schema exists yet. Phase 2's landlord schema build is tracked in this same metadata store, not blocked by it.
- **D-06:** Each command execution row records: command name, args/mode (dry-run vs. apply), start/end timestamps, exit status, migration-file/checksum reference, and actor (operator or CI job) — enough to reconstruct a full audit trail and detect partial/out-of-order runs.
- **D-07:** The metadata schema stays permanent and separate forever — it is operational/audit data, not landlord business data. It does **not** get folded into the `dgfy_*` landlord DB when Phase 2 creates it. This keeps the runner's core dependency (its own metadata store) independent of landlord schema stability.
- **D-08:** On first run the runner self-heals — auto-creates the metadata schema/tables if missing. On every subsequent run it validates the existing structure matches expectations and fails fast with a clear error on mismatch, rather than running silently against a corrupted metadata store.

### Environment Validation & Destructive-Op Gates
- **D-09:** "Destructive" = data migration apply mode (as opposed to dry-run), plus any schema migration that drops a column/table, alters a type lossily, or truncates data. Additive-only schema migrations and all dry-run/verify/status commands never require the destructive-op flag.
- **D-10:** Destructive operations require an explicit CLI flag, e.g. `--confirm-destructive`, passed on the command itself — visible in deploy logs/CI steps, not hidden in environment configuration.
- **D-11:** Runtime mode is a three-tier enum: `development` / `staging` / `production`. Production mode auto-tightens defaults (e.g. stricter destructive-op requirements, stricter DB-name pattern enforcement).
- **D-12:** The runner enforces a required DB-name allowlist/pattern check — e.g. `TARGET_DB_NAME` must match an expected pattern (must start with `dgfy_`) before connecting. Refuses to run schema/data commands against anything that doesn't match, closing off the most likely operator fat-finger mistake (accidentally targeting the legacy/production DB).

### Report Output & Rollback-Plan Scope
- **D-13:** Reports are written to a configurable mounted volume path (`REPORT_DIR`) so they survive the one-shot container's exit, and the human-readable summary is also printed to stdout for immediate visibility in deploy logs.
- **D-14:** "Rollback-plan support" (RUN-02) means generating a rollback plan **artifact** — a report describing what an undo would touch (tables/columns affected, estimated risk) for operator review — not automated rollback execution. Automated rollback execution is out of scope for this phase; it carries too much risk to bundle into the contract-defining phase.
- **D-15:** Machine-readable reports use JSON format.
- **D-16:** The JSON report and the human-readable summary are separate files per command run (e.g. `{timestamp}-{command}.json` and `{timestamp}-{command}.summary.txt`), so CI can consume just the JSON and operators can read just the summary without parsing JSON.

### Claude's Discretion
None — every gray area discussed had an explicit user selection (all recommended options were confirmed as-is).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture Governance
- `docs/START_HERE.md` — documentation discovery entry point.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — requires `routes -> controllers -> usecases -> repositories -> models`; applies to any backend-adjacent code the runner introduces.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — change classification, ADR requirements, hardening obligations relevant to migration/account/tenant work.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepts phased migration through compatibility facades; the runner's beside-legacy, no-mutation-by-default posture follows this ADR.

### Project Strategy Docs
- `refactor/DGFY_Project_Status_and_Proposal.md` — overall refactor proposal and rationale for the database-first path.
- `refactor/DGFY_Implementation_Phases.md` — phase sequencing context.
- `refactor/DGFY_Migration_Cutover_Strategy.md` — cutover strategy this runner's rollback-plan and verification evidence will eventually feed into (Phase 6/7).
- `refactor/DGFY_Infrastructure_Deployment.md` — deployment conventions for existing Docker-based surfaces; the runner's one-shot container packaging should follow established patterns where applicable.

No requirement-defining SPEC.md exists for this phase — requirements are captured from ROADMAP.md (RUN-01 through RUN-05) and REQUIREMENTS.md directly.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/config/sequelize.config.cjs`: existing per-environment (development/test/production) Sequelize connection config pattern — the runner's env-driven DB config should follow a similar per-environment shape, extended with `SOURCE_DB_*`/`TARGET_DB_*` naming and the new `staging` tier.
- `backend/migrations/` and `backend/src/migrations/`: existing Sequelize migration file conventions (timestamped `.cjs` files) — useful reference for how schema migrations are currently authored, even though the new runner will drive them through custom QueryInterface code rather than `sequelize-cli`.

### Established Patterns
- Sequelize + `mysql2` is the existing MySQL access pattern (`backend/src/config/database.js`, `apps/dgfy-api/src/config/db.js`) — the new runner should reuse `sequelize`/`mysql2` as its DB client rather than introducing a second DB driver.
- `apps/dgfy-api` already establishes the precedent for a standalone deployable Node service with its own `package.json`, Dockerfile (`infrastructure/docker/dgfy-api/Dockerfile`), and independent env/config loading (`apps/dgfy-api/src/config/env.js`) — the migration runner should follow the same isolation pattern.
- Docker images in this repo are built per-surface under `infrastructure/docker/<surface>/Dockerfile` — the runner's Dockerfile should live at `infrastructure/docker/dgfy-migration-runner/Dockerfile` for consistency.

### Integration Points
- No existing runtime code depends on the new runner yet (greenfield within this phase). The main integration point is deployment tooling: root `package.json` scripts and `.github/workflows/` will eventually need a build/run step for the new image, though wiring that into CI/CD is not required to satisfy this phase's success criteria.

</code_context>

<specifics>
## Specific Ideas

- Runner package name: `apps/dgfy-migration-runner`.
- Metadata schema working name: `dgfy_migration_meta`.
- Destructive-op confirmation flag: `--confirm-destructive`.
- Report file naming: `{timestamp}-{command}.json` / `{timestamp}-{command}.summary.txt`.
- DB name guard pattern: target database name must start with `dgfy_`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions came up during this session.

</deferred>

---

*Phase: 1-Architecture and Migration Runner Contract*
*Context gathered: 2026-07-10*
