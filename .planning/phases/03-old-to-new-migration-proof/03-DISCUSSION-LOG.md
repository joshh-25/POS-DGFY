# Phase 3: Old-to-New Migration Proof - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 3-Old-to-New Migration Proof
**Areas discussed:** Migration Rehearsal Scope, Deterministic ID Mapping Mechanism, Checkpoint Granularity, Conflict and Data-Quality Handling Policy
**Mode:** `--auto` — all areas auto-selected, recommended option chosen for each, no interactive prompts.

---

## Migration Rehearsal Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit operator-supplied target list per run | Mirrors Phase 2's `DGFY_BUSINESS_DB_NAMES` pattern — operator supplies which legacy account/tenant IDs are in scope for a given run | ✓ (recommended) |
| Auto-discover and migrate all legacy tenants | Runner queries legacy DB for all tenants and migrates everything in one pass | |

**User's choice:** Auto-selected recommended option (`--auto` mode).
**Notes:** Keeps blast radius operator-controlled, consistent with the Strangler Fig incremental posture and the project's small active-user base during migration.

---

## Deterministic ID Mapping Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Durable `legacy_id_map` table in metadata store | Persisted mapping table, auditable, supports retry lookup | ✓ (recommended) |
| Hash-derived deterministic IDs | New DGFY IDs computed algorithmically from legacy PK, no persisted map needed | |

**User's choice:** Auto-selected recommended option (`--auto` mode).
**Notes:** Consistent with the established pattern that database-backed metadata (not derived values) is the source of truth; the map itself becomes verification evidence.

---

## Checkpoint Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-entity-type-per-tenant checkpoint rows | Fine-grained resume point, e.g. "tenant X / accounts: done" | ✓ (recommended) |
| Whole-tenant-only checkpoint | Resume restarts the entire tenant's migration from scratch | |

**User's choice:** Auto-selected recommended option (`--auto` mode).
**Notes:** Mirrors Phase 1's `command_executions` per-command granularity; directly satisfies MIG-04's interrupt/retry requirement without redundant re-migration.

---

## Conflict and Data-Quality Handling Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Skip-and-report per-record | One bad record is logged and skipped; migration continues for clean records | ✓ (recommended) |
| Hard-fail entire run on any issue | Any data-quality issue aborts the whole migration run | |

**User's choice:** Auto-selected recommended option (`--auto` mode).
**Notes:** Still gated by the same `--confirm-destructive`-style explicit confirmation from Phase 1 (D-10) before any write occurs — this decision only concerns per-record failure handling within an already-confirmed apply run.

---

## Claude's Discretion

None beyond the four recommended defaults above — all gray areas were auto-resolved in `--auto` mode.

## Deferred Ideas

None — discussion stayed within phase scope. Product/POS/Storefront/fiscal domain migration, backend API implementation, and production cutover remain out of scope per PROJECT.md, tracked in Phases 4 through 7.
