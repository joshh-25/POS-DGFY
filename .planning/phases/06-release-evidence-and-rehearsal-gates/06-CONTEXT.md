# Phase 6: Release Evidence and Rehearsal Gates - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **release-evidence gating**: an on-demand, pre-cutover mechanism that proves release readiness through architecture, migration, tenant-drift, and compatibility-seam evidence — replacing "health checks alone" as the release signal. It is a governance/tooling phase, not a feature build.

Requirement in scope: **CMP-04** (release evidence includes architecture checks, migration verification, tenant drift checks, and targeted smoke/contract checks for touched compatibility seams).

**In scope:**
- Extending the existing legacy release-gate system (`release_verdict.json` + `gates[]`, produced by `scripts/gate-release-local.js` and friends) with new DGFY-specific gates covering: architecture checks for changed backend/API boundaries, migration verification + tenant drift reports for `dgfy_*` schemas, and compatibility-seam smoke/contract checks.
- A new interactive tenant-discovery-and-selection flow in the migration runner: list active tenants from `business_database_registry`, let the operator pick (checklist) which businesses this release-evidence run targets — deliberately filtering out test-only businesses rather than blindly checking every registry row.
- A generic, manifest-driven compatibility-seam smoke-check runner that reads the `tests` field from every **active** entry in `compatibility-seams.yaml`/`.json` (Phase 5's manifest) and executes them, reporting pass/fail per seam — so it automatically covers seams added after this phase too.
- Wiring all of the above into the existing gate pattern so `release_verdict.json` carries these as first-class gates, validated by the existing `scripts/verify-release-verdict.js` contract.

**Out of scope (belongs to other phases / milestones):**
- Cutover rehearsal, backup/restore proof, abort thresholds, reopen-on-legacy steps (CMP-05, Phase 7 — this phase's evidence is an *input* to Phase 7's cutover decision, not the cutover itself).
- Changing how the existing **per-PR** CI checks run (`check:architecture:dgfy-api`, `check:compat-seams`, etc. in `.github/workflows/ci.yml`) — those stay exactly as they are today. This phase adds a *separate*, on-demand release-evidence gate; it does not replace or restructure per-PR CI.
- Product/POS/payments/fiscal domain work — unrelated to this phase.
- Any new compatibility seam beyond the one Phase 5 already registered (`verifyContinuity` / DB-continuity) — this phase only builds the generic runner that will pick up future seams automatically.

</domain>

<decisions>
## Implementation Decisions

### Evidence Bundle Integration

- **D-01:** **Extend the existing legacy release-gate pattern, don't build a parallel one.** DGFY-specific gates (architecture, migration verification, tenant drift, seam smoke checks) become new entries in the same `release_verdict.json` `gates[]` shape (`name`, `ok`, `detail`) already produced by `scripts/gate-release-local.js` / `scripts/build-release-candidate-evidence.js` and already validated by `scripts/verify-release-verdict.js`. One release-evidence system for the whole platform, not a second bespoke one for DGFY. (Chosen over a separate DGFY-only evidence artifact.)

### Tenant Drift Scope

- **D-02:** **Command-driven discovery + operator selection, not full auto-discovery and not a static pre-configured list.** A new migration-runner flow discovers active tenants from `dgfy_core.business_database_registry`, then the operator explicitly picks which businesses this run's drift/migration-verification checks target. This is intentional: it lets the operator safely stage which tenants move to the new system and filters out test-only businesses that shouldn't count as migration-evidence targets. (Chosen over "verify every active registry row automatically" and over "keep today's static env-configured target list.")

- **D-03:** **Selection UX is an interactive terminal prompt** (checklist-style), not a `--targets` flag with pre-known IDs. The operator runs a command, sees a list of active tenants (id/name/status) sourced live from the registry, and checks/unchecks which ones to include before drift/verification checks run against the selection. (Chosen over a scriptable flag-only interface — the user wants an in-the-moment human decision point here, not a purely automatable one.)

### Compatibility Seam Smoke Checks

- **D-04:** **Generic manifest-driven runner.** The smoke-check mechanism reads the `tests` field from every **active** entry in Phase 5's `compatibility-seams.yaml`/`.json` and executes them, reporting pass/fail per seam by manifest `id`. It is not hardcoded to `verifyContinuity` — new seams registered in later phases are picked up automatically with no code change to this runner. (Chosen over a check specific to the one existing seam.)

### Trigger Point

- **D-05:** **On-demand release-evidence gate, not wired into per-PR CI.** This phase's evidence bundle (architecture + migration/drift + seam-smoke gates) is produced by a dedicated command/script run before a release/cutover decision — matching CMP-04's "release evidence" framing and feeding Phase 7's cutover gate. The existing per-PR checks in `ci.yml` (architecture guardrails, compat-seam manifest gate) are unaffected and continue running on every PR as today; this phase does not touch that trigger. (Chosen over wiring into per-PR CI, and over a hybrid — user picked the on-demand-only option.)

### Claude's Discretion

- Exact new command name(s) and CLI structure for the tenant-discovery/selection prompt (e.g., a new Commander subcommand or a prompt step inside a new `release-evidence` command) — planner's call, provided it (a) queries `business_database_registry` for the live tenant list and (b) presents an interactive checklist, per D-03.
- Which interactive-prompt library to use (e.g., `inquirer`, `prompts`) if the migration runner doesn't already depend on one — researcher/planner's call.
- Exact new gate-entry names/detail strings added to `release_verdict.json`'s `gates[]` — planner's call, matching the existing `(name, ok, detail)` shape used elsewhere in `gate-release-local.js`.
- Report format/location for the migration-verification and tenant-drift reports — planner's call, but must be reviewable (JSON and/or markdown) and should fit alongside the existing `.tmp/release-gates/<sha>/` evidence-directory convention rather than inventing a new location.
- Exact schema/lookup Claude uses to determine which manifest entries are "active" for the seam-smoke runner (D-04) — planner's call, using the `status` field Phase 5 already defined in the manifest.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria (SC1–SC3), and dependency on Phase 5.
- `.planning/REQUIREMENTS.md` — CMP-04 (this phase); CMP-05 (Phase 7) shows what the next phase will consume from this phase's evidence.
- `.planning/PROJECT.md` — standalone refactor scope, milestone definition of done, Phase 5 completion note.
- `.planning/STATE.md` — session history and any carried-forward concerns.

### Compatibility Seam Manifest (consumed by this phase)
- `.planning/phases/05-compatibility-and-backend-first-cutover-seam/05-CONTEXT.md` — the manifest schema (D-03/D-04), the one registered reference seam (D-02: DB-level continuity), and the "Phase 6 consumes the manifest directly" hand-off note.
- `docs/architecture/compatibility-seams.yaml` (or `.json` per Phase 5's fallback) — source-of-truth manifest; this phase's seam-smoke runner reads its `tests` field per active entry.
- `docs/architecture/COMPATIBILITY_INVENTORY.md` — generated human-readable inventory doc.
- `docs/architecture/adr/0004-architecture-compliance-automation.md` — the architecture-compliance automation Phase 5 extended; this phase's "architecture checks" gate reuses that same automation's output.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — establishes `apps/dgfy-api` as self-contained; grounds what "changed backend or API boundary" means for SC1.

### Existing Release-Gate Pattern (this phase extends it — D-01)
- `scripts/gate-release-local.js` — the gates[] accumulator pattern (`addGate`, `ensureDir`, JSON output to `.tmp/release-gates/<sha>/`) this phase's new gates plug into.
- `scripts/gate-release-no-staging.js`, `scripts/gate-release-observability.js` — sibling gate scripts showing the established pattern's variations.
- `scripts/build-release-candidate-evidence.js` — how gate outputs get bundled into candidate evidence for promotion/production phases.
- `scripts/verify-release-verdict.js` — the contract validator for `release_verdict.json` (`generated_at`, `target_sha`, `verdict`, `gates[]`) that any new gate output must remain compatible with.
- `.github/workflows/ci.yml` — shows which checks already run per-PR (`check:architecture:dgfy-api`, `check:compat-seams`, `check:architecture-guardrails`, etc.) — these are NOT touched by this phase (D-05).

### Migration Runner (evidence source for this phase)
- `apps/dgfy-migration-runner/src/commands/verify.js` — existing schema-contract verification machinery (per-target, per-table checks; target-list-vs-registry coverage cross-check) that the new tenant-selection flow builds on rather than replacing.
- `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` — the one existing registered compatibility seam; first entry the generic seam-smoke runner (D-04) must pick up.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`, `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — authoritative schema contracts drift checks compare live tenant DBs against.

### Prior Phase Evidence
- `.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-CONTEXT.md` — `business_database_registry` shape and the `activate-tenant` CLI; the registry this phase's tenant-discovery flow reads from.
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` — migration runner env-var contracts and CLI conventions the new tenant-selection command follows.

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md` — general conventions any new runner command/script must follow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/gate-release-local.js`'s gates[] pattern** (`addGate(gates, name, ok, detail)`, JSON output under `.tmp/release-gates/<sha>/`) — this phase's new architecture/migration/drift/seam gates extend this rather than inventing a new evidence format (D-01).
- **`apps/dgfy-migration-runner/src/commands/verify.js`** — already does per-target, per-table schema-contract checks and a target-list-vs-registry coverage cross-check; the base the new interactive tenant-selection + drift-check flow builds on.
- **`apps/dgfy-migration-runner/src/commands/verifyContinuity.js`** and the Phase 5 manifest's `tests` field — the first real input to the generic seam-smoke runner (D-04).
- **`business_database_registry`** (in `dgfy_core`) — source of truth for the tenant-discovery step (D-02/D-03).
- **Migration runner's Commander-based CLI structure** — where the new interactive-selection command is added.

### Established Patterns
- **Manifest-as-source-of-truth + CI-as-enforcement-authority** (Phase 4/5) — this phase's seam-smoke runner continues that philosophy by reading the manifest rather than hardcoding seam knowledge.
- **`release_verdict.json` gate contract** (`generated_at`, `target_sha`, `verdict`, `gates[]`) already validated by `scripts/verify-release-verdict.js` — any new gate output must conform to this existing contract.

### Integration Points
- New DGFY gates plug into the same `release_verdict.json`/`gates[]` the legacy pipeline already produces and `scripts/verify-release-verdict.js` already validates (D-01).
- Phase 7 (CMP-05, cutover rehearsal) consumes this phase's release evidence as a pre-cutover input.
- The interactive tenant-selection flow reads `business_database_registry`, the same table Phase 4's `activate-tenant` CLI writes to.

</code_context>

<specifics>
## Specific Ideas

- Tenant selection must be an interactive terminal checklist (not just a scriptable flag) — the user explicitly wants a human-in-the-loop decision point to pick which businesses count as migration-ready, since some registry entries are test-only businesses that should never be treated as real migration targets.
- The seam-smoke runner must generalize to "every active manifest entry," not just today's single seam — future seams should require zero changes to this runner.
- This phase's evidence gate is deliberately separate from per-PR CI — it's a pre-release/pre-cutover artifact, not a merge blocker.

</specifics>

<deferred>
## Deferred Ideas

- **Auto-discovery/verification of every active tenant with no operator selection step** — considered and explicitly rejected in favor of D-02/D-03's interactive selection model; not deferred to a later phase, just not the chosen design.
- **Wiring release evidence into per-PR CI** — considered and explicitly rejected (D-05); the on-demand gate is separate from PR checks. If a future need arises to run lightweight versions per-PR, that would be a new decision in a later phase, not an extension of this one.
- **Cutover rehearsal, backup/restore, abort thresholds** — belongs to Phase 7 (CMP-05); this phase only produces the evidence Phase 7 consumes.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 6-Release Evidence and Rehearsal Gates*
*Context gathered: 2026-07-12*
