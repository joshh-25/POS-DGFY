# Phase 6: Release Evidence and Rehearsal Gates - Research

**Researched:** 2026-07-12
**Domain:** Release-evidence gating tooling (Node.js CLI gates + migration-runner Commander commands, MySQL/Sequelize drift checks, manifest-driven seam smoke)
**Confidence:** HIGH (every claim grounded in direct reads of the real repo files named in CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend the existing legacy release-gate pattern, don't build a parallel one. DGFY-specific gates (architecture, migration verification, tenant drift, seam smoke checks) become new entries in the same `release_verdict.json` `gates[]` shape (`name`, `ok`, `detail`) already produced by `scripts/gate-release-local.js` / `scripts/build-release-candidate-evidence.js` and already validated by `scripts/verify-release-verdict.js`. One release-evidence system for the whole platform.
- **D-02:** Command-driven discovery + operator selection, not full auto-discovery and not a static pre-configured list. A new migration-runner flow discovers active tenants from `dgfy_core.business_database_registry`, then the operator explicitly picks which businesses this run's drift/migration-verification checks target. Deliberately filters out test-only businesses.
- **D-03:** Selection UX is an interactive terminal prompt (checklist-style), not a `--targets` flag with pre-known IDs. Operator sees a live list of active tenants (id/name/status) sourced from the registry and checks/unchecks which to include.
- **D-04:** Generic manifest-driven runner. Reads the `tests` field from every **active** entry in Phase 5's `compatibility-seams.json` and executes them, reporting pass/fail per seam by manifest `id`. Not hardcoded to `verifyContinuity` — new seams are picked up automatically with no code change.
- **D-05:** On-demand release-evidence gate, not wired into per-PR CI. Produced by a dedicated command/script before a release/cutover decision, feeding Phase 7's cutover gate. The existing per-PR checks in `ci.yml` are unaffected and continue running unchanged.

### Claude's Discretion
- Exact new command name(s) and CLI structure for the tenant-discovery/selection prompt (new Commander subcommand or a prompt step inside a new `release-evidence` command) — provided it (a) queries `business_database_registry` for the live tenant list and (b) presents an interactive checklist.
- Which interactive-prompt library to use (e.g., `inquirer`, `prompts`) if the runner doesn't already depend on one.
- Exact new gate-entry names/detail strings added to `release_verdict.json`'s `gates[]` — matching the existing `(name, ok, detail)` shape.
- Report format/location for migration-verification and tenant-drift reports — must be reviewable (JSON and/or markdown) and should fit alongside the existing `.tmp/release-gates/<sha>/` convention.
- Exact schema/lookup used to determine which manifest entries are "active" for the seam-smoke runner — using the `status` field Phase 5 defined.

### Deferred Ideas (OUT OF SCOPE)
- Auto-discovery/verification of every active tenant with no operator selection step (rejected in favor of D-02/D-03).
- Wiring release evidence into per-PR CI (rejected — D-05).
- Cutover rehearsal, backup/restore, abort thresholds (Phase 7 / CMP-05).
- Any new compatibility seam beyond the one Phase 5 registered — this phase builds only the generic runner.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMP-04 | Release evidence includes architecture checks, migration verification, tenant drift checks, and targeted smoke/contract checks for touched compatibility seams. | SC1 → reuse `npm run check:architecture` (Standard Stack). SC2 → new interactive migration-runner drift command reusing `verify.js`'s `checkContractSchema` (Architecture Patterns §Migration/Drift). SC3 → generic seam-smoke runner over `compatibility-seams.json` active entries (Architecture Patterns §Seam Smoke). All three surface as `gates[]` entries in a `release_verdict.json`-contract artifact under `.tmp/release-gates/<sha>/` (D-01). |
</phase_requirements>

## Summary

This is a governance/tooling phase, not a feature build. The platform already has a mature, battle-tested release-gate machinery: sibling gate orchestrator scripts (`scripts/gate-release-local.js`, `scripts/gate-release-no-staging.js`, `scripts/gate-release-observability.js`) that each accumulate `{name, ok, detail}` gate objects via an inline `addGate()` helper, write per-run JSON artifacts into `.tmp/release-gates/<sha>/`, and emit a `release_verdict.json` whose contract is enforced by `scripts/verify-release-verdict.js`. The migration runner (`apps/dgfy-migration-runner`) is a Commander-based ESM CLI whose `verify` command already performs exactly the drift check SC2 needs — per-tenant, per-table schema-contract comparison via `checkContractSchema()`/`checkTableAgainstContract()` against `dgfyBusinessContract`/`dgfyCoreContract`, plus migration-metadata/idempotency coverage. Phase 5 registered one compatibility seam (`db-continuity-legacy-backup`) in `docs/architecture/compatibility-seams.json`, whose `tests` field points at a **test file path**, not a shell command.

The three deliverables map cleanly onto existing assets: (1) the **architecture-checks gate** is a thin wrapper that runs `npm run check:architecture` (the ADR 0004 automation, which already covers `apps/dgfy-api` per ADR 0032) and records pass/fail — this is the identical command `gate-release-local.js` already invokes as its `architecture.guardrails` gate; (2) **migration verification + tenant drift** reuses `verify.js`'s existing contract-comparison engine, but replaces its static `DGFY_BUSINESS_DB_NAMES` env-driven target list with a live registry query + interactive checklist (the genuinely new code, per D-02/D-03); (3) the **seam-smoke runner** iterates `status:"active"` manifest entries and executes each entry's `tests`. All three feed a `release_verdict.json`-shaped artifact validated by the existing verifier (D-01), produced by a dedicated on-demand script (D-05).

**Primary recommendation:** Build a new on-demand orchestrator script `scripts/gate-release-dgfy-evidence.js` that mirrors the exact `addGate/ensureDir/verdict-payload` pattern of `gate-release-local.js`, runs the three DGFY evidence checks, and writes a `verify-release-verdict.js`-conformant verdict artifact into `.tmp/release-gates/<sha>/`. Add a new interactive `release-evidence` (or `select-tenants` + `verify-drift`) Commander subcommand to the migration runner using **`@inquirer/prompts`'s `checkbox`** for tenant selection, reusing `verify.js`'s `checkContractSchema` for the drift comparison. Add a generic seam-smoke module that reads `compatibility-seams.json`, filters `status:"active"`, and runs each seam's `tests` with the correct per-package test runner (and, critically, with integration env flags enabled so behavior-preservation is actually exercised — see Pitfall 1).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Architecture-boundary evidence (SC1) | Root gate script (`scripts/`) | ADR 0004 guardrail scripts in `backend/scripts/` | Guardrail automation already lives at root via `npm run check:architecture`; the gate only invokes it and records pass/fail. `[VERIFIED: package.json scripts]` |
| Tenant discovery + operator selection (D-02/D-03) | Migration runner CLI (`apps/dgfy-migration-runner`) | `dgfy_core.business_database_registry` (MySQL) | Registry lives in `dgfy_core`; the runner already owns the DB connection factories and env-validate-before-connect contract (RUN-03). `[VERIFIED: cli.js, activateTenant.js, env.js]` |
| Tenant drift comparison (SC2) | Migration runner (`verify.js` engine) | `dgfyBusinessContract`/`dgfyCoreContract` | `checkContractSchema()` already compares a live tenant DB against the authoritative contract. `[VERIFIED: verify.js]` |
| Migration-verification report (SC2) | Migration runner (`verify.js` sections) | `dgfy_migration_meta` (MySQL) | `migration_metadata`/`idempotency` sections already exist in `runVerify()`. `[VERIFIED: verify.js]` |
| Compatibility-seam smoke (SC3) | New generic runner module (root `scripts/` or runner) | `compatibility-seams.json` manifest + per-package test runners | Manifest is the source of truth; runner iterates active entries and shells out to the owning package's test runner. `[VERIFIED: compatibility-seams.json, check-compat-seams.js]` |
| Evidence aggregation → verdict (D-01) | New on-demand gate script (`scripts/`) | `verify-release-verdict.js` contract | Verdict shape + validator already exist; the new script produces a conformant artifact. `[VERIFIED: gate-release-local.js, verify-release-verdict.js]` |

## Standard Stack

### Core (already present — reuse, do not re-install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | ^15.0.0 (runner) | CLI command registration for the new interactive tenant-selection subcommand | Already the runner's CLI framework; new subcommand plugs into `buildProgram()`. `[VERIFIED: apps/dgfy-migration-runner/package.json]` |
| `sequelize` | ^6.37.8 (runner) | Registry query + per-tenant drift connections | Runner already uses it for all DB access via `config/db.js` factories. `[VERIFIED: package.json]` |
| `mysql2` | ^3.6.5 (runner, pinned) | MySQL driver | Pinned deliberately (latest flagged too-new in a prior package audit — see STATE.md). Do NOT bump. `[VERIFIED: package.json + STATE.md decision]` |
| `jest` | ^29.7.0 (runner) | Runs the runner-owned seam `tests` files | The one registered seam's test is a jest file in this package. `[VERIFIED: package.json, jest.config.cjs]` |
| Node built-ins (`fs`, `path`, `child_process` `spawnSync`) | Node ≥18 | Gate orchestration, artifact writing, shelling out to checks/tests | Exact pattern used by every existing `scripts/gate-release-*.js`. `[VERIFIED: gate-release-local.js]` |

### Supporting (new — interactive prompt for D-03)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@inquirer/prompts` | 8.5.2 (latest) | `checkbox` prompt for the tenant-selection checklist | Recommended: ESM-native (matches runner's `"type":"module"`), modular, actively maintained, native `checkbox` prompt is exactly the checklist UX D-03 wants. `[VERIFIED: npm registry]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@inquirer/prompts` | `prompts` (2.4.2) | Lighter, near-zero deps, CJS+ESM — but last published 2021, less actively maintained; its `multiselect` type is equivalent. Fine fallback if minimizing dependency surface matters more than maintenance recency. `[VERIFIED: npm registry]` |
| `@inquirer/prompts` | `@clack/prompts` (1.7.0) | Prettier output, but a newer/less-ubiquitous choice; no advantage for a terminal checklist over inquirer. `[VERIFIED: npm registry]` |
| New interactive subcommand | Reuse static `DGFY_BUSINESS_DB_NAMES` env list | Explicitly rejected by D-02/D-03 — the whole point is a live, human-in-the-loop selection that excludes test-only businesses. |

**Installation (runner package only):**
```bash
npm --prefix apps/dgfy-migration-runner install @inquirer/prompts@8
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@inquirer/prompts` | npm | since 2023-04 | very high (inquirer family) | github.com/SBoudrias/Inquirer.js | OK | Approved (recommended) |
| `prompts` | npm | since 2018-02 | very high | github.com/terkelg/prompts | OK | Approved (alternative) |
| `@clack/prompts` | npm | since 2023-02 | high | github.com/bombshell-dev/clack | OK | Approved (alternative) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: `@inquirer/prompts` was surfaced from training knowledge and version-verified via `npm view`. It is the canonical modern inquirer entrypoint (org `@inquirer`, repo `Inquirer.js`). The planner should keep the install gated behind normal review; no `checkpoint:human-verify` is strictly required for these three ubiquitous packages, but confirm the pinned major (`@8`) at plan time.*

## Architecture Patterns

### System Architecture Diagram

```
Operator (on-demand, D-05)
        │  runs: npm run gate:release:dgfy-evidence   (NEW orchestrator, scripts/)
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ scripts/gate-release-dgfy-evidence.js  (mirrors gate-release-local) │
│   gates = []                                                        │
│   addGate(gates, name, ok, detail)  ← same helper shape             │
│                                                                     │
│   ┌── GATE 1: architecture.dgfy ──────────────────────────────┐    │
│   │   IF backend/API/runner boundary changed (git diff):      │    │
│   │     runCommand(npm, ['run','check:architecture'])         │    │
│   │     (+ optionally check:compat-seams)                     │    │
│   └───────────────────────────────────────────────────────────┘    │
│   ┌── GATE 2: migration.verification + tenant.drift ──────────┐    │
│   │   spawn migration-runner interactive command:             │    │
│   │     1. SELECT registry rows (active) JOIN businesses      │    │
│   │     2. @inquirer checkbox → operator selection            │    │
│   │     3. per selected tenant: checkContractSchema()         │    │
│   │        (reuse verify.js engine) + migration_metadata      │    │
│   │     4. write migration_verification.json/.md,             │    │
│   │        tenant_drift.json/.md into evidence dir            │    │
│   │   addGate(ok = every selected tenant report ok)          │    │
│   └───────────────────────────────────────────────────────────┘    │
│   ┌── GATE 3: compat.seam.smoke ──────────────────────────────┐    │
│   │   read compatibility-seams.json                           │    │
│   │   for seam where status === 'active':                     │    │
│   │     for testPath in seam.tests:                           │    │
│   │       run owning package's test runner on testPath        │    │
│   │       (WITH integration env flags — Pitfall 1)           │    │
│   │   addGate per seam id → seam_smoke.json report            │    │
│   └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│   verdictPayload = { generated_at, target_sha, verdict,             │
│                      gate_count, failed_gate_count, gates[],        │
│                      artifact_paths{} }                             │
│   write .tmp/release-gates/<sha>/dgfy_release_evidence.json         │
│   (+ optionally release_verdict.json)                               │
└───────────────────────────────────────────────────────────────────┘
        ▼
scripts/verify-release-verdict.js --file <artifact> --sha <sha>   (existing contract gate)
        ▼
Phase 7 (CMP-05) cutover decision consumes this evidence
```

### Recommended Project Structure
```
scripts/
├── gate-release-dgfy-evidence.js     # NEW orchestrator (mirrors gate-release-local.js)
├── dgfy-seam-smoke.js                # NEW generic seam-smoke runner (or a lib/ module)
apps/dgfy-migration-runner/src/
├── cli.js                            # add new subcommand to buildProgram()
├── commands/
│   ├── verify.js                     # REUSE checkContractSchema (export if needed)
│   └── releaseEvidence.js            # NEW: registry discovery + inquirer checkbox + drift
docs/architecture/
└── compatibility-seams.json          # READ-ONLY source of truth (do not add seams)
.tmp/release-gates/<sha>/             # existing evidence dir convention
├── dgfy_release_evidence.json        # NEW verdict-shaped artifact
├── migration_verification.json/.md   # NEW reviewable reports
├── tenant_drift.json/.md             # NEW reviewable reports
└── seam_smoke.json                   # NEW per-seam pass/fail
```

### Pattern 1: The `addGate` accumulator + verdict payload (D-01 contract)
**What:** Every gate script builds an array of `{name, ok, detail}` and derives a verdict.
**When to use:** For the new `gate-release-dgfy-evidence.js`. Match this shape exactly.
**Example:**
```javascript
// Source: scripts/gate-release-local.js (VERIFIED, lines 35-39, 105-124)
function addGate(gates, name, ok, detail) {
  gates.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${detail}`);
}
function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }

const targetSha = (process.env.RELEASE_TARGET_SHA
  || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
ensureDir(evidenceDir);

const failed = gates.filter((g) => !g.ok);
const payload = {
  generated_at: new Date().toISOString(),
  target_sha: targetSha,
  verdict: failed.length === 0 ? 'pass' : 'fail',
  gate_count: gates.length,
  failed_gate_count: failed.length,
  gates,
  artifact_paths: { /* ... */ },
};
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
if (failed.length > 0) process.exit(2);
```

**`release_verdict.json` contract enforced by `verify-release-verdict.js` (VERIFIED, lines 55-75):**
- `generated_at` present (truthy)
- `target_sha` present and a string; must match `--sha` when supplied
- `verdict` ∈ `['pass', 'fail', 'bypassed']`
- `gates` is a **non-empty** array
- (optional) `--require-pass` rejects any verdict not in `['pass','bypassed']`

> The `addGate` helper is **duplicated inline** in each existing gate script (not shared). Follow the existing convention: either duplicate the ~5-line helper or extract a shared module — the codebase currently duplicates it, so duplication is the lower-risk, convention-matching choice.

### Pattern 2: Shelling out to checks/tests (spawnSync)
**What:** Gate scripts run npm subcommands and capture exit codes; a non-zero exit → `ok:false`.
**Example:**
```javascript
// Source: scripts/gate-release-local.js (VERIFIED, lines 10-22, 56)
function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit', shell: process.platform === 'win32', env: process.env,
  });
  return result.status === 0;
}
addGate(gates, 'architecture.dgfy',
  runCommand('npm', ['run', 'check:architecture']),
  'npm run check:architecture');
```

### Pattern 3: Reuse `verify.js`'s drift engine (SC2)
**What:** `checkContractSchema({ connection, databaseName, contract })` compares a live tenant DB against a schema contract (columns/indexes/unique constraints/FKs) and returns a per-table findings report. It **never throws** — a missing table/column is a reported finding.
**When to use:** For the tenant-drift check against each operator-selected tenant.
**Example:**
```javascript
// Source: apps/dgfy-migration-runner/src/commands/verify.js (VERIFIED, lines 107-137)
// For each selected tenant database name:
const businessSequelize = createBusinessTargetConnection(config, name);
const driftResult = await checkContractSchema({
  connection: businessSequelize,
  databaseName: name,
  contract: dgfyBusinessContract,   // authoritative tenant contract
});
// driftResult => { database, ok, tables:[{table,ok,missing_columns,...}], rejected_tables_present }
```
> `checkContractSchema` and its helpers are currently **module-private** in `verify.js` (not exported). The plan should export them (or factor them into a small shared module like `src/schema/driftCheck.js`) so the new command reuses them without duplication. This mirrors how `verify.js` already reuses `schema.js`'s `buildMigrationsForKind`.

### Pattern 4: Live tenant discovery query (D-02)
**What:** Query the registry for active tenants, joined to `businesses` for a human-readable label.
**Example:**
```sql
-- business_database_registry columns (VERIFIED: dgfyCoreContract.js lines 84-108):
--   id, business_id, stable_opaque_suffix, database_name, status, verified_at, created_at, updated_at
--   status enum: provisioning | active | migrating | deprecated  (STATE.md 04-06)
-- businesses columns (VERIFIED: dgfyCoreContract.js lines 52-66):
--   id, business_handle, legal_name, display_name, status, created_at, updated_at
SELECT r.business_id, r.database_name, r.status, r.verified_at,
       b.display_name, b.business_handle
FROM business_database_registry r
JOIN businesses b ON b.id = r.business_id
WHERE r.status = 'active' AND r.verified_at IS NOT NULL
ORDER BY b.display_name;
```
The registry lives in `dgfy_core` (the primary `TARGET_DB_NAME`). Query it on `createTargetConnection(config)`, exactly as `activateTenant.js` and `verify.js`'s `checkTenantCoverage` already do. `[VERIFIED: activateTenant.js lines 64-67, verify.js lines 190-192]`

### Pattern 5: Interactive checkbox selection (D-03)
```javascript
// @inquirer/prompts checkbox — ESM import
import { checkbox } from '@inquirer/prompts';
const selected = await checkbox({
  message: 'Select tenants to include in this release-evidence run:',
  choices: activeTenants.map((t) => ({
    name: `${t.display_name} (${t.database_name}) [${t.status}]`,
    value: t.database_name,
  })),
});
```

### Anti-Patterns to Avoid
- **Building a second, parallel evidence artifact format.** D-01 is explicit: reuse the `release_verdict.json` `{name, ok, detail}` gate shape and the `verify-release-verdict.js` contract. Do not invent a new schema.
- **Modifying `.github/workflows/ci.yml` or the per-PR checks.** D-05 forbids touching the per-PR trigger. This phase adds an on-demand script only.
- **Hardcoding `verifyContinuity` into the seam-smoke runner.** D-04 requires iterating the manifest's active entries generically.
- **Reusing the static `DGFY_BUSINESS_DB_NAMES` env list for drift targets.** D-02/D-03 require live discovery + interactive selection.
- **Adding new seams to `compatibility-seams.json`.** Out of scope; only build the generic runner.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant schema drift comparison | A new column/index/FK diff engine | `verify.js`'s `checkContractSchema()`/`checkTableAgainstContract()` | Already handles columns, indexes, unique constraints, FKs via `information_schema`, never-throws findings model, dialect-normalized table sets. `[VERIFIED: verify.js]` |
| Verdict validation | A bespoke JSON schema check | `scripts/verify-release-verdict.js` | Existing contract gate; the whole point of D-01. `[VERIFIED]` |
| Architecture boundary enforcement | New guardrail logic | `npm run check:architecture` (ADR 0004 automation, covers `apps/dgfy-api` per ADR 0032) | Same command `gate-release-local.js` already runs. `[VERIFIED: package.json, ADR 0004/0032]` |
| Manifest parsing/validation | New JSON loader | `scripts/check-compat-seams.js`'s exported `loadManifest`/`validateManifestSchema` (module.exports) | Already validates version/schema/status enums; reuse its `loadManifest` for the smoke runner. `[VERIFIED: check-compat-seams.js lines 390-403]` |
| Interactive checklist | Raw `readline` TTY handling | `@inquirer/prompts` `checkbox` | TTY, arrow-key, multi-select, non-TTY detection all handled. `[VERIFIED: npm]` |
| Report file writing | New writer | `reports/reportWriter.js` `writeJsonReport` / `summaryWriter.js` `writeSummaryReport` | Runner already has JSON+summary writers used by every command. `[VERIFIED: verify.js, activateTenant.js imports]` |

**Key insight:** ~80% of this phase is orchestration and wiring of code that already exists. The genuinely new logic is: (a) the interactive registry-discovery/selection command, and (b) the generic seam-smoke test-dispatch loop. Everything else is reuse.

## Common Pitfalls

### Pitfall 1: Seam `tests` are test FILE PATHS, and the real behavior probe is integration-gated
**What goes wrong:** The manifest's `tests` field is `["apps/dgfy-migration-runner/tests/verifyContinuity.test.js"]` — a **test file path, not a shell command**. Worse, that test's actual legacy-DB integrity probe is gated behind `RUN_CONTINUITY_INTEGRATION=true` (default skip); only pure-logic unit assertions run otherwise. A naive smoke runner that just runs the file with no env flag will report PASS while proving **nothing** about live behavior preservation — directly violating SC3 ("prove any touched compatibility seams still preserve current behavior").
**Why it happens:** Phase 5 designed the seam test skip-safe because no MySQL is reachable in the sandbox. `[VERIFIED: verifyContinuity.test.js lines 23-35]`
**How to avoid:** The seam-smoke runner must (1) map each test path to its owning package's test runner (e.g. `apps/dgfy-migration-runner/tests/*.test.js` → `npm --prefix apps/dgfy-migration-runner test -- <file>` using jest), and (2) set the relevant integration env flag(s) so the behavior-preservation assertions actually execute. Consider a manifest-driven or convention-driven map of seam-id → required integration env var. If the required DB creds/env are absent, the gate should **fail-closed** (no evidence) rather than silently pass on skipped tests. Flag the env-flag mapping as an explicit plan decision.

### Pitfall 2: Generic test dispatch across heterogeneous runners
**What goes wrong:** Seam `tests` may live in different packages with different runners (migration-runner→jest, backend→jest, frontend→vitest, root scripts→node test runner). A single hardcoded `jest <path>` breaks for non-jest seams.
**Why it happens:** The manifest `tests` field is just a repo-relative path; it carries no runner metadata. `[VERIFIED: compatibility-seams.json, TESTING.md]`
**How to avoid:** Resolve each test path to the nearest owning package (walk up to the nearest `package.json`) and invoke that package's `test` script with the file as a filter, OR restrict this phase's runner to the currently-registered seam's package and document the extension point. Keep the dispatch table small and explicit; do not over-engineer for runners no active seam uses yet.

### Pitfall 3: MySQL is required but not always reachable
**What goes wrong:** SC2's drift/migration checks and SC3's seam integration probe all need a live MySQL (dgfy_* schemas + legacy SOURCE_DB). The dev sandbox has no MySQL (STATE.md: nearly every Phase 04/05 integration test is gated behind `RUN_*_INTEGRATION`). Running the evidence gate without DB access yields empty/failed evidence.
**How to avoid:** This is an **operator-run, on-demand** gate (D-05) executed in an environment WITH DB access — that's by design. Make DB-dependent gates **fail-closed** (a missing/unreachable DB means "not release-ready," not "skip"). Reuse the runner's env-validate-before-connect ordering (RUN-03) so a missing `SOURCE_DB_*`/`TARGET_DB_*` produces a clear `EnvValidationError`-style gate failure, not a crash. `[VERIFIED: env.js validateEnv, verifyContinuity.js]`

### Pitfall 4: Interactive prompt in a non-TTY context
**What goes wrong:** `@inquirer` `checkbox` requires a TTY; piping/CI stdin makes it hang or throw.
**How to avoid:** D-03 chose interactive deliberately (human-in-the-loop). Detect `process.stdin.isTTY`; if false, fail with a clear message ("release-evidence tenant selection requires an interactive terminal"). Do **not** silently fall back to "all tenants" — that reintroduces the auto-discovery model D-02 rejected.

### Pitfall 5: `verify-release-verdict.js` rejects an empty `gates[]`
**What goes wrong:** If a gate run short-circuits (e.g. architecture gate skipped because nothing changed), you could emit a verdict with zero gates → the verifier fails with "Missing or empty gates array." `[VERIFIED: verify-release-verdict.js line 67]`
**How to avoid:** Always record at least the `release.target_sha` gate (as `gate-release-local.js` does at line 52) plus an explicit "skipped" gate with `ok:true` and a reason detail, mirroring how `gate-release-local.js` records `release.verdict.contract` as a passed skip when the file is absent (lines 101-103).

### Pitfall 6: "Changed backend or API boundary" needs a concrete definition (SC1)
**What goes wrong:** SC1 says architecture checks run "for any changed backend or API boundary" — leaving "changed" undefined risks either always-run (wasteful) or never-run (no evidence).
**How to avoid:** Define it via `git diff --name-only <base>..<sha>` touching `apps/dgfy-api/**`, `apps/dgfy-migration-runner/**`, or `backend/src/modules/**`. ADR 0032 establishes `apps/dgfy-api` as the standalone API boundary. When any of those changed, the architecture gate is required (fail-closed on `check:architecture` non-zero); when none changed, record a passed "not applicable" gate. `[CITED: ADR 0032, ADR 0004]`

## Code Examples

### Registering the new subcommand in the runner CLI
```javascript
// Source pattern: apps/dgfy-migration-runner/src/cli.js (VERIFIED, lines 65-111)
import { runReleaseEvidence } from './commands/releaseEvidence.js';

program
  .command('release-evidence')
  .description('Interactively select active tenants and produce migration-verification + tenant-drift evidence')
  .option('--evidence-dir <dir>', 'Directory to write reviewable JSON/markdown reports')
  .action(async (options) => {
    await runReleaseEvidence({ evidenceDir: options.evidenceDir });
  });
```
> The runner already exports `buildProgram()` with an `isMainModule` guard so CLI dispatch is testable in-process (`cliContract.test.js`). Follow that pattern for the new command. `[VERIFIED: cli.js lines 23-139, STATE.md]`

### Reading + filtering active seams for the smoke runner
```javascript
// Source: scripts/check-compat-seams.js exports (VERIFIED, lines 390-403)
const { loadManifest } = require('./check-compat-seams.js');
const manifest = loadManifest(path.join('docs','architecture','compatibility-seams.json'));
const activeSeams = (manifest.seams || []).filter((s) => s.status === 'active');
// each seam: { id, type, status, rationale, tests:[...paths], rollback, removal_criteria }
for (const seam of activeSeams) {
  for (const testPath of seam.tests) {
    // resolve owning package + run its test runner on testPath (see Pitfall 1/2)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Release readiness = health checks alone | Evidence-backed gates (architecture + migration/drift + seam smoke) in `release_verdict.json` | This phase (CMP-04) | Health probe is one `gate:release:observability` gate among many; DGFY evidence joins the same verdict. `[VERIFIED: gate-release-observability.js]` |
| Static `DGFY_BUSINESS_DB_NAMES` env target list | Live registry discovery + interactive operator selection | This phase (D-02/D-03) | Test-only businesses excluded from migration evidence. |
| Seam knowledge hardcoded per-seam | Manifest-driven generic iteration over `status:"active"` | This phase (D-04) | Future seams auto-covered with no runner change. |

**Deprecated/outdated:** none relevant. Do not bump the runner's pinned `mysql2@^3.6.5` (STATE.md package-audit decision).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The new DGFY evidence artifact should be a **standalone** verdict file (`dgfy_release_evidence.json`) validated by `verify-release-verdict.js`, NOT folded into `build-release-candidate-evidence.js`'s `sku-release-evidence/v2` schema. | Summary / Pitfalls | If the user wants DGFY evidence bundled into the production candidate evidence, the candidate schema needs extending (bigger blast radius, touches production release flow). Confirm scope at plan time. |
| A2 | The seam-smoke runner should set integration env flags (e.g. `RUN_CONTINUITY_INTEGRATION=true`) so behavior-preservation is actually exercised, and fail-closed without DB. | Pitfall 1 | If the user accepts skip-safe unit runs as "smoke," the runner is trivial but SC3 is only weakly satisfied. Needs a plan decision. |
| A3 | "Active" for D-04 means `status === 'active'` only (not also `'accepted'`). The manifest's `COMPLETE_STATUSES` = {active, accepted}; the single seam is `active`. | Architecture Patterns | If `accepted` seams should also smoke-test, widen the filter. Low risk (no accepted seams exist yet). |
| A4 | `@inquirer/prompts` `checkbox` is the prompt library (vs `prompts`). | Standard Stack | Purely Claude's discretion per D-03; either works. Low risk. |
| A5 | The new orchestrator lives at `scripts/gate-release-dgfy-evidence.js` and is wired as a new `gate:release:dgfy-evidence` npm script; drift/discovery lives in the runner. | Structure | Command naming is Claude's discretion; risk is only cosmetic. |

**If any assumption is wrong, it only affects structure/scope, not the core reuse strategy.**

## Open Questions (RESOLVED)

1. **Bundle vs standalone evidence artifact (A1).**
   - What we know: D-01 names both `verify-release-verdict.js` (standalone verdict validator) and `build-release-candidate-evidence.js` (production candidate bundler) as canonical refs.
   - What's unclear: whether Phase 7 will consume a standalone `dgfy_release_evidence.json` or expect it inside the candidate evidence bundle.
   - Recommendation: produce the standalone verdict artifact now (lowest blast radius, satisfies D-01's contract). Leave candidate-bundler integration for Phase 7 if it needs it.
   - **RESOLVED:** Adopted by **06-03** — the orchestrator writes a standalone `dgfy_release_evidence.json` under `.tmp/release-gates/<sha>/`, self-validated by `verify-release-verdict.js`; candidate-bundler integration is left to Phase 7.

2. **Seam-test runner dispatch scope (Pitfall 2).**
   - What we know: only one seam exists today, owned by the jest-based migration-runner.
   - What's unclear: how much generality to build for runners no active seam uses yet (vitest, node test runner).
   - Recommendation: implement a small, explicit path→runner map covering the migration-runner (jest) case now, with a documented extension point; don't pre-build for unused runners.
   - **RESOLVED:** Adopted by **06-02** — the seam-smoke runner defines an explicit test-path → owning-package runner map (migration-runner → jest) with a documented default extension point, and fails closed on unmapped seams.

3. **Integration env-flag mapping for seams (Pitfall 1).**
   - Recommendation: a convention (seam-id → required env vars) or a small config, decided at plan time. The one seam needs `RUN_CONTINUITY_INTEGRATION=true` + `SOURCE_DB_*` creds.
   - **RESOLVED:** Adopted by **06-02** — a seam-id → required-integration-env map seeds `db-continuity-legacy-backup` → `RUN_CONTINUITY_INTEGRATION` (+ `SOURCE_DB_*`); a seam whose required env is absent fails closed rather than passing on skipped integration tests.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All tooling | ✓ | ≥18 local / 24 in CI | — |
| MySQL (dgfy_* + legacy SOURCE_DB) | SC2 drift/migration verify, SC3 seam integration probe | ✗ in dev sandbox | — | None — gate is operator-run where DB is reachable; fail-closed when absent (Pitfall 3) |
| `@inquirer/prompts` | D-03 checklist | ✗ (not yet installed) | 8.x to add | `prompts` 2.4.2 |
| jest (runner) | SC3 seam test execution | ✓ | ^29.7.0 | — |
| commander (runner) | new subcommand | ✓ | ^15.0.0 | — |

**Missing dependencies with no fallback:**
- Live MySQL for real evidence — by design this gate runs in a DB-reachable environment (D-05 on-demand). Design DB-dependent gates fail-closed.

**Missing dependencies with fallback:**
- `@inquirer/prompts` (install into the runner package) — fallback `prompts`.

## Project Constraints (from CLAUDE.md / codebase docs)

- **Runner CLI is ESM** (`"type":"module"`, `import`/`export`); root `scripts/*.js` gate scripts are **CommonJS** (`require`, `#!/usr/bin/env node`). Match each context. `[VERIFIED: package.json, cli.js, gate-release-local.js]`
- **Runner has no eslint** (its `lint` is a deferred no-op); backend/frontend do. New root scripts should follow existing `scripts/*.js` style (CJS, 2-space). `[VERIFIED: package.json]`
- **Test naming encodes proof type** (`.contract.test.js`, `.integration.test.js`, etc.); runner tests live in `apps/dgfy-migration-runner/tests/` (jest `roots: ['<rootDir>/tests']`). New runner tests go there. `[VERIFIED: TESTING.md, jest.config.cjs]`
- **Reports must be machine-readable JSON + human-readable summary** (RUN-05 platform convention); reuse `writeJsonReport`/`writeSummaryReport`. `[VERIFIED: verify.js]`
- **No credentials/secrets in reports** — reports carry only database names, business_id, migration names, table names, counts, booleans (established seam/activate-tenant convention). Apply the same to drift/migration reports. `[VERIFIED: verifyContinuity.js, activateTenant.js T-04-09-04]`
- **Do NOT touch `ci.yml` per-PR jobs, `backend/`, or `frontend/`** beyond what the on-demand gate needs (D-05 + Phase 5 scope-discipline precedents). `[VERIFIED: CONTEXT.md D-05]`
- **Do NOT bump `mysql2` past `^3.6.5`** in the runner. `[VERIFIED: STATE.md]`

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `scripts/gate-release-local.js`, `scripts/gate-release-no-staging.js`, `scripts/gate-release-observability.js`, `scripts/verify-release-verdict.js`, `scripts/build-release-candidate-evidence.js` — gate/verdict pattern + contract
- `apps/dgfy-migration-runner/src/cli.js`, `commands/verify.js`, `commands/verifyContinuity.js`, `commands/activateTenant.js`, `config/env.js`, `package.json`, `jest.config.cjs`, `tests/verifyContinuity.test.js`, `schemaContracts/dgfyCoreContract.js` — runner CLI, drift engine, registry shape
- `docs/architecture/compatibility-seams.json`, `docs/architecture/COMPATIBILITY_INVENTORY.md`, `scripts/check-compat-seams.js`, `scripts/generate-compat-inventory.js` — manifest schema + tooling
- `docs/architecture/adr/0004-*.md`, `docs/architecture/adr/0032-*.md`, `.github/workflows/ci.yml`, root `package.json` scripts — architecture checks + per-PR CI (do-not-touch)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/codebase/TESTING.md`, `.planning/codebase/CONVENTIONS.md`, `06-CONTEXT.md`

### Secondary (MEDIUM confidence — verified via npm)
- `npm view @inquirer/prompts | prompts | @clack/prompts` — versions/ages for prompt library recommendation

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core libs are already in-repo and version-verified; prompt lib npm-verified.
- Architecture / reuse strategy: HIGH — every reuse target read directly and quoted.
- Pitfalls: HIGH — Pitfall 1 (integration-gated seam test) and Pitfall 3 (no sandbox MySQL) confirmed from the actual test file and STATE.md history.

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (stable internal codebase; prompt-lib versions may bump but any 8.x/2.x is fine)
</content>
</invoke>
