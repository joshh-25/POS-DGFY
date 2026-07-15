# Phase 1: Architecture and Migration Runner Contract - Research

**Researched:** 2026-07-10  
**Domain:** Node.js one-shot migration runner, Sequelize/Umzug orchestration, Docker packaging  
**Confidence:** HIGH for repo-local architecture and Context7-backed library patterns; MEDIUM for package recency choices because `mysql2` latest was flagged by the GSD legitimacy gate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### the agent's Discretion
None — every gray area discussed had an explicit user selection (all recommended options were confirmed as-is).

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions came up during this session.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-01 | Operator can build and run a dedicated migration runner container separately from long-running backend/API containers. | Use `apps/dgfy-migration-runner` plus `infrastructure/docker/dgfy-migration-runner/Dockerfile`, mirroring the standalone `apps/dgfy-api` package and Docker surface. [VERIFIED: repo grep] |
| RUN-02 | Operator can execute explicit runner commands for schema migration, data migration dry-run, data migration apply, verification, status/reporting, and rollback-plan support. | Use Commander nested subcommands and Umzug-backed schema orchestration; data/verify/status/rollback-plan are runner commands, not `sequelize-cli` commands. [VERIFIED: Context7 `/tj/commander.js`; Context7 `/sequelize/umzug`] |
| RUN-03 | Runner validates required environment variables, target database names, runtime mode, and destructive-operation flags before connecting to any database. | Put env parsing in a pure config module and unit-test it without DB connections; require `--confirm-destructive` only for destructive operations. [VERIFIED: CONTEXT.md; repo `apps/dgfy-api/src/config/env.js`] |
| RUN-04 | Runner stores schema/data migration execution metadata in database-backed tables, not local files inside the container. | Bootstrap and validate `dgfy_migration_meta`; use Umzug DB-backed storage or a custom Umzug storage adapter plus command execution audit tables. [VERIFIED: Context7 `/sequelize/umzug`; CONTEXT.md] |
| RUN-05 | Runner produces machine-readable report files and concise human-readable summaries for every command. | Use `REPORT_DIR`, JSON report file, summary text file, and stdout summary, modeled after existing report-file scripts. [VERIFIED: repo `backend/scripts/sync-tenant-schemas.js`; CONTEXT.md] |
</phase_requirements>

## Summary

Phase 1 should build the runner harness only: a dedicated one-shot Node package, Docker image, CLI dispatch layer, pre-connection env/destructive-operation validation, metadata bootstrap/validation, and report generation. It must not build real `dgfy_*` landlord/tenant schema, real old-to-new data migration scripts, or backend APIs. [VERIFIED: CONTEXT.md]

Primary recommendation: implement `apps/dgfy-migration-runner` as a small ESM Node CLI using `commander`, `sequelize`, `mysql2`, and `umzug`, with pure modules for env validation, command dispatch, metadata bootstrap, report writing, and placeholder phase-safe command handlers. [VERIFIED: repo package patterns; Context7 `/tj/commander.js`; Context7 `/sequelize/umzug`]

## Project Constraints (from AGENTS.md)

- Read and honor `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and relevant ADRs before planning. [VERIFIED: AGENTS.md]
- Do not use `docs/archive/**` or deprecated docs as planning sources. [VERIFIED: AGENTS.md]
- Cross-boundary changes require an ADR update or new ADR. [VERIFIED: AGENTS.md]
- Architecture-sensitive changes must confirm boundary checks, documentation freshness, and no unresolved allowlist dependency. [VERIFIED: AGENTS.md]
- Before PR creation/update/description, read `docs/ai/PR.md`; commits must follow Conventional Commits and PR bodies require Summary, Motivation, and Testing. [VERIFIED: AGENTS.md]
- Before staging/committing, scan changed files for the repository's forbidden commit marker phrase. [VERIFIED: AGENTS.md]
- Use Context7 MCP for current docs for libraries, frameworks, SDKs, APIs, CLIs, and cloud services. [VERIFIED: AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| CLI command contract | One-shot Node app | Docker runtime | Commands enter through the runner process and must be scriptable from CI/deploy steps. [VERIFIED: CONTEXT.md] |
| Env validation and destructive gates | One-shot Node app | Docker runtime | Validation must happen before any DB connection, so it belongs before Sequelize initialization. [VERIFIED: CONTEXT.md] |
| Schema migration orchestration | One-shot Node app | Database | Umzug drives migration ordering/status while Sequelize QueryInterface performs DDL against the target database. [VERIFIED: Context7 `/sequelize/umzug`; Context7 `/sequelize/website`] |
| Migration metadata | Database / Storage | One-shot Node app | Execution metadata must survive container exit and is explicitly DB-backed. [VERIFIED: CONTEXT.md] |
| Report output | One-shot Node app | Mounted volume / stdout | Runner writes durable files to `REPORT_DIR` and prints concise summaries to logs. [VERIFIED: CONTEXT.md] |
| Backend APIs | Out of scope | — | Phase 1 must not add Accounts/Businesses/Tenancy APIs. [VERIFIED: CONTEXT.md] |

## Technical Approach

Use a custom Node CLI rather than `sequelize-cli`. Commander supports subcommands, options, choices, action handlers, and generated help output, which matches the locked subcommand contract. [VERIFIED: Context7 `/tj/commander.js`]

Use Sequelize v6 QueryInterface as the DDL API. Sequelize migration files conventionally export `up` and `down` functions receiving `queryInterface` and `Sequelize` data types; QueryInterface covers table, column, index, and constraint operations. [VERIFIED: Context7 `/sequelize/website`]

Use Umzug v3 for migration orchestration where schema migrations are involved. Umzug can be configured with `context: sequelize.getQueryInterface()`, a migration glob, a resolver that calls existing `up(queryInterface, Sequelize)`/`down(...)` signatures, and `pending()`, `executed()`, `up()`, and `down()` style programmatic operations. [VERIFIED: Context7 `/sequelize/umzug`]

Use DB-backed metadata for two related concerns: Umzug migration execution state and runner command execution audit. Umzug's `SequelizeStorage` creates and reads a SQL metadata table, and Umzug also supports custom storage classes with `logMigration`, `unlogMigration`, and `executed` methods. Phase 1 should prefer custom storage if the audit fields need to live in `dgfy_migration_meta` rather than a default `SequelizeMeta` table. [VERIFIED: Context7 `/sequelize/umzug`; CONTEXT.md]

Bootstrap `dgfy_migration_meta` before any domain migration command runs. The bootstrap should connect only after pure env validation passes, create the metadata database/schema and tables if missing, validate table/column/index contracts on later runs, and fail fast on mismatch. [VERIFIED: CONTEXT.md]

Command contract to plan:

| Command | Phase 1 Behavior | Destructive Gate |
|---------|------------------|------------------|
| `schema migrate` | Validates env, bootstraps metadata, runs placeholder/no-op schema migration set through Umzug, records command execution, writes reports. [VERIFIED: CONTEXT.md; Context7 `/sequelize/umzug`] | Required only when migration manifest declares destructive DDL. [VERIFIED: CONTEXT.md] |
| `data dry-run` | Validates both source/target env contract, does not mutate target domain data, records command execution, writes reports. [VERIFIED: CONTEXT.md] | No. [VERIFIED: CONTEXT.md] |
| `data apply` | Validates both source/target env contract and explicit `--confirm-destructive`, records command execution, writes reports; Phase 1 handler should be a stub that proves gating/reporting only. [VERIFIED: CONTEXT.md] | Yes. [VERIFIED: CONTEXT.md] |
| `verify` | Runs contract checks/status probes only; no domain verification logic yet. [VERIFIED: CONTEXT.md] | No. [VERIFIED: CONTEXT.md] |
| `status` or `report` | Reads metadata and report inventory, prints concise operator summary, writes JSON and summary files. [VERIFIED: CONTEXT.md] | No. [VERIFIED: CONTEXT.md] |
| `rollback-plan` | Generates a rollback plan artifact for operator review; never executes rollback in Phase 1. [VERIFIED: CONTEXT.md] | No execution gate because it is report-only. [VERIFIED: CONTEXT.md] |

## Existing Patterns

- `apps/dgfy-api` is the closest standalone app analog: own `package.json`, ESM modules, `src/config/env.js`, `src/config/db.js`, Jest config, and root scripts such as `dev:dgfy-api`. [VERIFIED: repo grep]
- `infrastructure/docker/dgfy-api/Dockerfile` is the closest Docker analog: build context is repo root, dependency stage copies app `package*.json`, runtime stage uses `node:22-alpine`, `tini`, `su-exec`, non-root `app`, and an entrypoint. [VERIFIED: repo grep]
- `infrastructure/docker/docker-compose.yml` currently runs long-lived services with healthcheck-gated dependencies; the runner should be added as a one-shot/manual service or separate compose invocation, not as a backend startup migration step. [VERIFIED: repo grep]
- `backend/src/config/sequelize.config.cjs` provides the existing per-environment MySQL config pattern; the runner needs a stricter variant with `development`/`staging`/`production` and `SOURCE_DB_*`/`TARGET_DB_*`. [VERIFIED: repo grep; CONTEXT.md]
- `backend/scripts/sync-tenant-schemas.js` is a strong script/report analog: it parses mode flags, builds structured JSON reports, creates report directories recursively, normalizes error signatures, uses stable fingerprints, sets process exit codes, and is covered by contract tests. [VERIFIED: repo grep]
- `backend/entrypoint.sh` currently runs backend migrations on app startup. Phase 1 should not copy that behavior into the backend; it should move future DGFY migration execution into the dedicated one-shot runner. [VERIFIED: repo grep; CONTEXT.md]

## Recommended File/Package Structure

```text
apps/dgfy-migration-runner/
  package.json
  jest.config.cjs
  src/
    cli.js
    config/
      env.js
      db.js
    commands/
      schema.js
      data.js
      verify.js
      status.js
      rollbackPlan.js
    migrations/
      schema/
        00000000000000-runner-contract-placeholder.cjs
    metadata/
      bootstrap.js
      storage.js
      checksum.js
    reports/
      reportWriter.js
      summaryWriter.js
    safety/
      destructiveGate.js
      targetGuard.js
    utils/
      errors.js
  tests/
    env.test.js
    destructiveGate.test.js
    cliContract.test.js
    metadataBootstrap.test.js
    reportWriter.test.js
    umzugConfig.test.js
infrastructure/docker/dgfy-migration-runner/
  Dockerfile
  entrypoint.sh
```

Recommended `package.json` dependency surface:

| Package | Version / Range | Purpose | Provenance |
|---------|-----------------|---------|------------|
| `commander` | `^15.0.0` | Nested CLI commands/options/help. | [VERIFIED: Context7 `/tj/commander.js`; npm registry] |
| `sequelize` | `^6.37.8` | QueryInterface and MySQL connection layer. | [VERIFIED: Context7 `/sequelize/website`; npm registry; existing repo dependency] |
| `umzug` | `^3.8.3` | Migration ordering/status/storage orchestration. | [VERIFIED: Context7 `/sequelize/umzug`; npm registry] |
| `mysql2` | Keep repo-aligned `^3.6.5` unless upgrading platform-wide. | Sequelize MySQL dialect driver. | [VERIFIED: existing repo dependency; npm registry] |
| `dotenv` | Keep repo-aligned `^16.6.1` if `.env` loading is needed. | Local env loading. | [VERIFIED: existing repo dependency] |
| `jest` | Keep repo-aligned `^29.7.0` dev dependency. | Contract/unit tests. | [VERIFIED: existing repo dependency] |

Package legitimacy audit:

| Package | Registry | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------|-------------|---------|-------------|
| `commander` | npm | 429,376,979/wk | `github.com/tj/commander.js` | OK | Approved. [VERIFIED: GSD package-legitimacy; npm registry] |
| `umzug` | npm | 1,954,104/wk | `github.com/sequelize/umzug` | OK | Approved. [VERIFIED: GSD package-legitimacy; npm registry] |
| `sequelize` | npm | 2,755,670/wk | `github.com/sequelize/sequelize` | OK | Approved. [VERIFIED: GSD package-legitimacy; npm registry] |
| `mysql2` latest `3.22.6` | npm | 11,954,593/wk | `github.com/sidorares/node-mysql2` | SUS: too-new | Use existing repo range `^3.6.5` for Phase 1 unless a dependency upgrade checkpoint is added. [VERIFIED: GSD package-legitimacy; npm registry] |

## External Docs Notes

- Commander docs show subcommands with descriptions/options, action handlers receiving parsed options, choices in help output, and auto-generated `--help`. Use this for `schema migrate`, `data dry-run`, `data apply --confirm-destructive`, `verify`, `status`, and `rollback-plan`. [VERIFIED: Context7 `/tj/commander.js`]
- Sequelize v6 docs show migration modules exporting `up`/`down`, with `queryInterface` and Sequelize data types passed to migration functions. Use that signature for schema migration files so repo engineers can reuse known migration authoring conventions. [VERIFIED: Context7 `/sequelize/website`]
- Umzug docs show Sequelize integration using `context: sequelize.getQueryInterface()`, `SequelizeStorage`, and a resolver for sequelize-cli-style migrations that call `migration.up(context, Sequelize)`. Use this resolver shape rather than shelling out to `sequelize-cli`. [VERIFIED: Context7 `/sequelize/umzug`]
- Umzug docs list DB, JSON, memory, MongoDB, and custom storages. JSON/memory storage are not acceptable for Phase 1 because RUN-04 requires DB-backed metadata; custom storage is appropriate if the default `SequelizeMeta` shape is too small for command execution audit. [VERIFIED: Context7 `/sequelize/umzug`; REQUIREMENTS.md]

## Validation Architecture

`.planning/config.json` has `workflow.nyquist_validation: false`, so no Nyquist validation section is required. [VERIFIED: `.planning/config.json`]

Phase 1 still needs implementation tests because RUN-01 through RUN-05 are contract requirements:

| Requirement | Test Target | Minimum Test |
|-------------|-------------|--------------|
| RUN-01 | Package/Docker contract | Assert `apps/dgfy-migration-runner/package.json` scripts exist and Dockerfile uses app-local package files plus runner entrypoint. [VERIFIED: REQUIREMENTS.md] |
| RUN-02 | CLI contract | Snapshot/help or parser tests for `schema migrate`, `data dry-run`, `data apply`, `verify`, `status/report`, and `rollback-plan`. [VERIFIED: REQUIREMENTS.md] |
| RUN-03 | Env/gate contract | Unit tests prove missing env, bad runtime mode, bad `TARGET_DB_NAME`, and missing `--confirm-destructive` fail before DB factory is called. [VERIFIED: REQUIREMENTS.md; CONTEXT.md] |
| RUN-04 | Metadata bootstrap | Unit/integration-style tests with a mocked Sequelize/QueryInterface prove first-run create and mismatch fail-fast paths. [VERIFIED: REQUIREMENTS.md; CONTEXT.md] |
| RUN-05 | Reports | Unit tests prove JSON and summary files are written to `REPORT_DIR`, stdout summary is emitted, and error reports include stable machine-readable status. [VERIFIED: REQUIREMENTS.md; repo `sync-tenant-schemas.js`] |

Suggested commands:

```bash
npm --prefix apps/dgfy-migration-runner test
npm --prefix apps/dgfy-migration-runner run lint
docker build -f infrastructure/docker/dgfy-migration-runner/Dockerfile .
node apps/dgfy-migration-runner/src/cli.js --help
```

Environment availability:

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runner development/tests | Yes | v24.14.0 local; Docker baseline should remain `node:22-alpine` to match repo images. [VERIFIED: local command; repo Dockerfile] | Use Docker image runtime. |
| npm | Package scripts | Yes | 11.12.1. [VERIFIED: local command] | None needed. |
| Docker | Image build | Yes | 29.4.2. [VERIFIED: local command] | Local Node tests if Docker unavailable. |
| Docker Compose | One-shot service wiring | Yes | 5.1.3. [VERIFIED: local command] | Direct `docker run` command. |

## Security Domain

Security enforcement is enabled in `.planning/config.json`; this phase touches database migration controls and must include safety tests. [VERIFIED: `.planning/config.json`]

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Limited | Actor must be recorded from `MIGRATION_ACTOR`/CI metadata, but Phase 1 does not add user auth. [VERIFIED: CONTEXT.md] |
| V3 Session Management | No | One-shot CLI has no sessions. [VERIFIED: CONTEXT.md] |
| V4 Access Control | Yes | Destructive operations require explicit command flag and production mode tightens guards. [VERIFIED: CONTEXT.md] |
| V5 Input Validation | Yes | Validate env vars, runtime enum, DB-name allowlist, command options, and report path before DB work. [VERIFIED: CONTEXT.md] |
| V6 Cryptography | Limited | Use checksums for migration file identity; do not design custom crypto beyond standard Node hashing. [VERIFIED: CONTEXT.md; repo `sync-tenant-schemas.js`] |

Known threat patterns:

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Wrong database target | Tampering | `TARGET_DB_NAME` must match `dgfy_*` and production mode should be strict before connecting. [VERIFIED: CONTEXT.md] |
| Accidental destructive run | Tampering / Repudiation | Require visible `--confirm-destructive`, record actor/args/status/timestamps, and write immutable-style reports. [VERIFIED: CONTEXT.md] |
| Metadata corruption | Tampering | Validate `dgfy_migration_meta` table contract every run and fail fast on mismatch. [VERIFIED: CONTEXT.md] |
| Lost evidence after container exit | Repudiation | Write JSON and summary files to mounted `REPORT_DIR` and store execution rows in DB. [VERIFIED: CONTEXT.md] |

## Risks

1. `mysql2` latest is flagged `SUS` by the GSD legitimacy gate only because the newest publish is recent; the repo already uses `mysql2`, so Phase 1 should avoid an unrelated latest-version upgrade unless the planner adds a human dependency checkpoint. [VERIFIED: GSD package-legitimacy; repo package files]
2. If Umzug `SequelizeStorage` is used unmodified, it only tracks executed migration names and will not satisfy the full command audit fields in D-06 by itself. Add a separate execution table or custom storage. [VERIFIED: Context7 `/sequelize/umzug`; CONTEXT.md]
3. Running any migration from backend entrypoint would contradict the dedicated one-shot artifact goal. Backend startup migration behavior exists today but should be treated as legacy precedent to move away from for DGFY migration work. [VERIFIED: repo Docker entrypoint; CONTEXT.md]
4. Phase 1 stubs can accidentally grow into Phase 2/3 logic. Keep schema migration placeholders and data handlers explicit no-ops that prove dispatch, gating, metadata, and reports only. [VERIFIED: CONTEXT.md]
5. Report path handling can create host permission problems in one-shot containers. Follow the existing `tini`/`su-exec`/bind-mount ownership pattern from the app Dockerfiles. [VERIFIED: repo Dockerfiles]

## Open Questions

1. Should the command be named `status`, `report`, or both with one aliasing the other?
   - What we know: RUN-02 says status/reporting; D-16 requires report files per command. [VERIFIED: REQUIREMENTS.md; CONTEXT.md]
   - Recommendation: implement `status` as the canonical CLI command and allow `report` as an alias only if Commander makes this low-risk. [ASSUMED]

2. Should `dgfy_migration_meta` be a separate MySQL database/schema or a set of tables inside the target server connection?
   - What we know: D-05/D-07 say separate permanent metadata schema and independent of landlord business data. [VERIFIED: CONTEXT.md]
   - Recommendation: use a distinct database named exactly `dgfy_migration_meta` on the target MySQL server unless deployment constraints require a prefix. [ASSUMED]

3. What exact production DB-name pattern beyond `dgfy_` is required?
   - What we know: D-12 requires at least `TARGET_DB_NAME` starts with `dgfy_`. [VERIFIED: CONTEXT.md]
   - Recommendation: Phase 1 implement `^dgfy_[a-z0-9_]+$`; production can optionally require an allowlist env such as `TARGET_DB_ALLOWLIST`. [ASSUMED]

## Don't Build in Phase 1

- Do not build real `dgfy_*` landlord or tenant schema definitions; Phase 2 owns that. [VERIFIED: CONTEXT.md]
- Do not build real old-to-new data migrations; Phase 3 owns that. [VERIFIED: CONTEXT.md]
- Do not add backend Accounts, Businesses, or Tenancy APIs; Phase 4 owns that. [VERIFIED: CONTEXT.md]
- Do not implement automated rollback execution; Phase 1 only produces rollback-plan artifacts. [VERIFIED: CONTEXT.md]
- Do not wrap `sequelize-cli` as the command surface; it cannot satisfy the custom dry-run/verify/status/rollback-plan contract. [VERIFIED: CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Implement `status` as canonical and optionally `report` as an alias. | Open Questions | Operator docs/scripts may prefer a different command name. |
| A2 | Use a distinct database named `dgfy_migration_meta`. | Open Questions | Deployment may require a different schema naming convention. |
| A3 | Use `^dgfy_[a-z0-9_]+$` as the default target DB-name pattern. | Open Questions | Production naming may need stricter environment-specific allowlists. |

## Sources

### Primary
- `docs/START_HERE.md` — authoritative documentation lookup order, last reviewed 2026-03-06. [VERIFIED: repo]
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend/API boundary guardrails, last reviewed 2026-03-06. [VERIFIED: repo]
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — architecture-sensitive process and migration/model hardening obligations, last reviewed 2026-05-21. [VERIFIED: repo]
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepted migration facade strategy. [VERIFIED: repo]
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` — locked Phase 1 decisions. [VERIFIED: repo]
- `.planning/REQUIREMENTS.md` — RUN-01 through RUN-05 requirement text. [VERIFIED: repo]

### Codebase
- `apps/dgfy-api/package.json`, `apps/dgfy-api/src/config/env.js`, `apps/dgfy-api/src/config/db.js`, `apps/dgfy-api/jest.config.cjs` — standalone app package/config/test analogs. [VERIFIED: repo]
- `backend/src/config/sequelize.config.cjs` — existing Sequelize environment config pattern. [VERIFIED: repo]
- `backend/scripts/sync-tenant-schemas.js`, `backend/tests/tenantSchemaSyncScripts.test.js` — script mode/report/error contract analog. [VERIFIED: repo]
- `infrastructure/docker/dgfy-api/Dockerfile`, `infrastructure/docker/backend/Dockerfile`, `infrastructure/docker/docker-compose.yml` — Docker image, entrypoint, healthcheck, and compose patterns. [VERIFIED: repo]
- `refactor/DGFY_Infrastructure_Deployment.md`, `refactor/DGFY_Migration_Cutover_Strategy.md` — strategy references for one-image-per-surface and migration/cutover evidence. [VERIFIED: repo]

### External Docs
- Context7 `/tj/commander.js` from `github.com/tj/commander.js` — subcommands, options, action handlers, generated help. [VERIFIED: Context7]
- Context7 `/sequelize/website` from Sequelize v6 migration docs — `up`/`down`, QueryInterface, data types. [VERIFIED: Context7]
- Context7 `/sequelize/umzug` from `github.com/sequelize/umzug` — Sequelize integration, `SequelizeStorage`, custom storage, resolver. [VERIFIED: Context7]
- npm registry checks: `commander@15.0.0`, `umzug@3.8.3`, `sequelize@6.37.8`, `mysql2@3.22.6` latest, `mysql2@3.6.5` existing repo-aligned version. [VERIFIED: npm registry]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for `commander`, `sequelize`, `umzug`; MEDIUM for `mysql2` version choice because latest was flagged too-new by package legitimacy but existing repo version is established.
- Architecture: HIGH because locked decisions, authoritative architecture docs, and repo analogs align.
- Pitfalls: HIGH for scope, metadata, and report pitfalls based on locked decisions and existing script patterns.

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 for stack/patterns; recheck npm versions and package legitimacy before implementation.
