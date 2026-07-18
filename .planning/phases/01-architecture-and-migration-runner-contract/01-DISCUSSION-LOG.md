# Phase 1: Architecture and Migration Runner Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 1-Architecture and Migration Runner Contract
**Areas discussed:** Runner placement & CLI design, Metadata bootstrap sequencing, Env validation & destructive-op gates, Report output & rollback-plan scope

---

## Runner Placement & CLI Design

| Option | Description | Selected |
|--------|-------------|----------|
| apps/dgfy-migration-runner | Matches the existing apps/dgfy-api convention for standalone deployable surfaces | ✓ |
| Top-level migration-runner/ | Sibling to backend/, frontend/, apps/; breaks from apps/ convention | |
| Inside backend/ | Reuses backend's node_modules/Sequelize models directly, couples runner to API dependency surface | |

**User's choice:** apps/dgfy-migration-runner
**Notes:** Matches apps/dgfy-api precedent for standalone deployable surfaces.

| Option | Description | Selected |
|--------|-------------|----------|
| Custom Node CLI | sequelize-cli has no concept of data dry-run/verify/status/rollback-plan; custom CLI on QueryInterface gives full control | ✓ |
| Hybrid | sequelize-cli for schema, custom for the rest | |
| Wrap sequelize-cli entirely | Shell out to sequelize-cli for everything, script the rest around it | |

**User's choice:** Custom Node CLI
**Notes:** Needed because sequelize-cli doesn't support the full RUN-02 command surface.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both now | Lock full SOURCE_DB_*/TARGET_DB_* env contract in Phase 1 | ✓ |
| Target dgfy_* only for now | Add legacy/source vars later when Phase 3 needs them | |

**User's choice:** Yes, both now
**Notes:** Avoids re-negotiating the env contract across phases; RUN-03 wants validation before any connection.

| Option | Description | Selected |
|--------|-------------|----------|
| Subcommands | e.g. `node runner.js schema migrate` | ✓ |
| Env var command selection | e.g. MIGRATION_COMMAND=schema-migrate | |
| Both supported | Subcommand takes precedence, env var fallback | |

**User's choice:** Subcommands
**Notes:** Explicit, discoverable, scriptable.

---

## Metadata Bootstrap Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Runner bootstraps its own tiny metadata schema | dgfy_migration_meta, independent of landlord schema existing | ✓ |
| Metadata tables live inside the future dgfy_* landlord DB | Defer real persistence until Phase 2 | |
| Metadata tables live in the legacy/current landlord DB | Temporary home, migrate later | |

**User's choice:** Runner bootstraps its own tiny metadata schema
**Notes:** Phase 2's landlord schema build becomes just another tracked migration set.

| Option | Description | Selected |
|--------|-------------|----------|
| Command, status, timing, checksum, actor | Full audit trail fields | ✓ |
| Minimal: just applied schema migrations | sequelize-style SequelizeMeta only | |

**User's choice:** Command, status, timing, checksum, actor
**Notes:** Enough to reconstruct a full audit trail and detect partial/out-of-order runs.

| Option | Description | Selected |
|--------|-------------|----------|
| Stays permanent/separate | Operational/audit data, not landlord business data | ✓ |
| Migrates into dgfy_* landlord DB in Phase 2 | One DB to back up and reason about | |

**User's choice:** Stays permanent/separate
**Notes:** Runner never depends on landlord schema existing or being stable.

| Option | Description | Selected |
|--------|-------------|----------|
| Self-heal on first run, then validate | Auto-create if missing, validate structure thereafter, fail fast on mismatch | ✓ |
| Fail if missing, require explicit init command | More explicit, less magic | |

**User's choice:** Self-heal on first run, then validate
**Notes:** Avoids silent corruption while staying low-friction for first use.

---

## Env Validation & Destructive-Op Gates

| Option | Description | Selected |
|--------|-------------|----------|
| Apply-mode writes + any DROP/ALTER-destructive DDL | Additive migrations and dry-runs never require the flag | ✓ |
| Everything except status/verify | Broader, forces the flag on routine additive migrations too | |

**User's choice:** Apply-mode writes + any DROP/ALTER-destructive DDL
**Notes:** Keeps routine additive schema work low-friction.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit CLI flag, e.g. --confirm-destructive | Visible in invoking script/CI step, easy to audit | ✓ |
| Env var, e.g. ALLOW_DESTRUCTIVE=true | Less visible, easier to leave on accidentally | |
| Both required together | Defense in depth, more ceremony | |

**User's choice:** Explicit CLI flag, e.g. --confirm-destructive
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| development / staging / production | Three-tier; production auto-tightens defaults | ✓ |
| development / production only | Two-tier, staging treated as production-strict | |

**User's choice:** development / staging / production
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Required DB name allowlist/pattern check | TARGET_DB_NAME must match expected pattern (e.g. dgfy_ prefix) | ✓ |
| No automated guard | Rely on operator diligence + explicit env vars | |

**User's choice:** Required DB name allowlist/pattern check
**Notes:** Closes off the most likely fat-finger mistake (targeting legacy/prod DB by accident).

---

## Report Output & Rollback-Plan Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Mounted volume path + stdout | REPORT_DIR persists reports, human summary also to stdout | ✓ |
| Stdout only | Simplest, no volume-mount requirement | |
| DB-backed only | Treat metadata table as canonical report, skip files | |

**User's choice:** Mounted volume path + stdout
**Notes:** Covers both automated pipelines and interactive operators.

| Option | Description | Selected |
|--------|-------------|----------|
| Generate a rollback plan artifact, not execute it | Operator-reviewed report of what an undo would touch | ✓ |
| Full automated rollback execution | Actually runs down-migrations against target DB | |

**User's choice:** Generate a rollback plan artifact, not execute it
**Notes:** Avoids building risky automated rollback execution into the contract-defining phase.

| Option | Description | Selected |
|--------|-------------|----------|
| JSON | Universal, easy to parse in CI/dashboards | ✓ |
| JSON + also mirror into the metadata DB row | Same JSON convention, also stored in metadata row | |

**User's choice:** JSON
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Separate files | {timestamp}-{command}.json and .summary.txt | ✓ |
| Single JSON file with a 'summary' field | Fewer files, but consumers must parse JSON for the summary | |

**User's choice:** Separate files
**Notes:** CI grabs just the JSON, operators read just the summary.

---

## Claude's Discretion

None — every question had an explicit user selection.

## Deferred Ideas

None — discussion stayed within phase scope.
