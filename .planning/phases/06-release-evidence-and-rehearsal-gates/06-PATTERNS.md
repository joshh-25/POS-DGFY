# Phase 6: Release Evidence and Rehearsal Gates - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 6 (4 new, 2 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/gate-release-dgfy-evidence.js` (new) | config/orchestrator script (CJS) | batch / request-response (spawnSync) | `scripts/gate-release-local.js` | exact |
| `apps/dgfy-migration-runner/src/commands/releaseEvidence.js` (new) | command (ESM) | CRUD / event-driven (interactive prompt) | `apps/dgfy-migration-runner/src/commands/verify.js` + `commands/activateTenant.js` | exact (composite) |
| `apps/dgfy-migration-runner/src/commands/verify.js` (modify — add `export`) | command / drift engine | CRUD (schema diff) | itself — export `checkContractSchema`/`checkTableAgainstContract` | n/a (in-place) |
| `apps/dgfy-migration-runner/src/cli.js` (modify — register subcommand) | route / CLI registration | request-response | `apps/dgfy-migration-runner/src/cli.js` (existing `.command()` blocks) | exact (self) |
| `scripts/dgfy-seam-smoke.js` (new — or `commands/seamSmoke.js`) | service / runner | batch / transform (iterate + dispatch) | `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` + `scripts/check-compat-seams.js` exports | role-match (composite) |
| `apps/dgfy-migration-runner/tests/releaseEvidence.*.test.js` (new) | test | n/a | `tests/verifyContinuity.test.js` (jest, `roots:['<rootDir>/tests']`) | role-match |

**Context note (CJS vs ESM):** Root `scripts/*.js` are **CommonJS** (`require`, `#!/usr/bin/env node`, `module.exports`). The migration runner (`apps/dgfy-migration-runner`) is **ESM** (`"type":"module"`, `import`/`export`). Match each file to its context — do not mix. `[VERIFIED: package.json both packages]`

---

## Pattern Assignments

### `scripts/gate-release-dgfy-evidence.js` (orchestrator, CJS, batch)

**Analog:** `scripts/gate-release-local.js` (127 lines, read in full)

**Imports + helper pattern** (`gate-release-local.js` lines 1-43): copy verbatim — this is the established gate-script shape. The `runCommand`, `captureStdout`, `addGate`, `ensureDir` helpers are **duplicated inline in every gate script** (not shared); follow that convention and duplicate them.
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit', shell: process.platform === 'win32', env: process.env,
  });
  if (result.error) { /* log + return false */ return false; }
  return result.status === 0;
}
function addGate(gates, name, ok, detail) {
  gates.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${detail}`);
}
function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
```

**Target SHA + evidence dir** (lines 46-49): reuse the exact `.tmp/release-gates/<sha>/` convention.
```javascript
const targetSha = (process.env.RELEASE_TARGET_SHA
  || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
ensureDir(evidenceDir);
const outputFile = path.join(evidenceDir, 'dgfy_release_evidence.json'); // NEW filename
const gates = [];
```

**Gate accumulation** (lines 52-90): each new DGFY gate is one `addGate(...)` call wrapping a `runCommand(...)` boolean. Note the existing architecture gate at line 56 is the SAME command SC1 reuses:
```javascript
addGate(gates, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`); // Pitfall 5: always record ≥1 gate
addGate(gates, 'architecture.guardrails', runCommand('npm', ['run', 'check:architecture']), 'npm run check:architecture'); // SC1 — identical to line 56
// GATE 2: shell out to the runner's new release-evidence subcommand (drift + migration verification)
// GATE 3: shell out to the seam-smoke runner
```
> **Pitfall 6 (SC1 "changed boundary"):** gate `architecture.dgfy` should be conditional on `git diff --name-only <base>..<sha>` touching `apps/dgfy-api/**`, `apps/dgfy-migration-runner/**`, or `backend/src/modules/**`. When nothing changed, record a passed `ok:true` "not applicable" gate — do not skip (Pitfall 5).

**Verdict payload + write + exit** (lines 105-124): copy the payload shape EXACTLY — it is the `verify-release-verdict.js` contract.
```javascript
const failed = gates.filter((g) => !g.ok);
const payload = {
  generated_at: new Date().toISOString(),
  target_sha: targetSha,
  verdict: failed.length === 0 ? 'pass' : 'fail',
  gate_count: gates.length,
  failed_gate_count: failed.length,
  gates,
  artifact_paths: { /* migration_verification, tenant_drift, seam_smoke files */ },
};
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
if (failed.length > 0) process.exit(2);
```

**Contract self-validation (optional, mirrors lines 92-103):** after writing, invoke the existing verifier as a final gate:
```javascript
runCommand('node', ['scripts/verify-release-verdict.js', '--file', outputFile, '--sha', targetSha]);
```

**Wiring:** add `"gate:release:dgfy-evidence": "node scripts/gate-release-dgfy-evidence.js"` to root `package.json` scripts, alongside the existing `gate:release:*` entries (VERIFIED present: `gate:release:local`, `gate:release:observability`, `gate:release:no-staging`).

---

### `apps/dgfy-migration-runner/src/commands/releaseEvidence.js` (command, ESM, CRUD + interactive)

**Analogs:** `commands/verify.js` (drift engine + report shape) and `commands/activateTenant.js` (registry query + validate→connect→report lifecycle).

**Imports pattern** (from `verify.js` lines 1-17 / `activateTenant.js` lines 1-12): ESM, path-relative, reuse existing infra — do NOT re-implement DB/report/env.
```javascript
import { checkbox } from '@inquirer/prompts';                 // NEW dep (D-03) — install into runner pkg
import { validateEnv } from '../config/env.js';
import { createTargetConnection, createBusinessTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
import { dgfyBusinessContract } from '../schemaContracts/dgfyBusinessContract.js';
import { checkContractSchema } from './verify.js';            // REUSE — export it (see verify.js below)
```

**Env-validate-before-connect ordering** (RUN-03, from `verify.js` lines 322-330 / `activateTenant.js` lines 30-46) — copy exactly; fail-closed on env errors (Pitfall 3):
```javascript
const { valid, errors, config } = validateEnv();
if (!valid) throw new EnvValidationError(errors.join('; '));
assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
const targetSequelize = createTargetConnection(config);       // registry lives in dgfy_core (primary target)
```

**Live tenant discovery query (D-02)** — the registry query pattern is proven in `activateTenant.js` lines 64-67 and `verify.js` lines 190-192 (`SELECT ... FROM business_database_registry`). Extend with the `businesses` JOIN + `status='active'` filter (Research Pattern 4):
```javascript
const [rows] = await targetSequelize.query(
  `SELECT r.business_id, r.database_name, r.status, r.verified_at, b.display_name, b.business_handle
   FROM business_database_registry r JOIN businesses b ON b.id = r.business_id
   WHERE r.status = 'active' AND r.verified_at IS NOT NULL ORDER BY b.display_name`
);
```
> Registry `status` enum: `provisioning | active | migrating | deprecated`. Columns VERIFIED in `dgfyCoreContract.js`.

**Interactive checkbox selection (D-03)** — new code, Research Pattern 5. Guard the TTY first (Pitfall 4 — fail, never fall back to "all"):
```javascript
if (!process.stdin.isTTY) throw new Error('release-evidence tenant selection requires an interactive terminal');
const selected = await checkbox({
  message: 'Select tenants to include in this release-evidence run:',
  choices: rows.map((t) => ({ name: `${t.display_name} (${t.database_name}) [${t.status}]`, value: t.database_name })),
});
```

**Per-tenant drift check (SC2)** — reuse `checkContractSchema` exactly as `verify.js` lines 365-378 does for `businessSchemas`:
```javascript
for (const name of selected) {
  const businessSequelize = createBusinessTargetConnection(config, name);
  const driftResult = await checkContractSchema({ connection: businessSequelize, databaseName: name, contract: dgfyBusinessContract });
  // driftResult => { database, ok, tables:[{table,ok,missing_columns,missing_indexes,...}], rejected_tables_present }
}
```

**Report writing** — reuse `writeJsonReport`/`writeSummaryReport` (`verify.js` lines 519-520). No secrets in reports: database names, business_id, table names, counts, booleans only (`activateTenant.js` T-04-09-04, lines 140-148). Write reviewable `migration_verification.json/.md` + `tenant_drift.json/.md` under the evidence dir passed from the gate script.

---

### `apps/dgfy-migration-runner/src/commands/verify.js` (MODIFY — export drift engine)

**Change:** add `export` to the two currently module-private functions so `releaseEvidence.js` reuses them with zero duplication (Research Pattern 3 / Don't-Hand-Roll). This mirrors how `verify.js` already reuses `schema.js`'s `buildMigrationsForKind`.

- `checkContractSchema({ connection, databaseName, contract })` — lines 107-137. Returns `{ database, ok, tables[], rejected_tables_present }`. Never throws.
- `checkTableAgainstContract({...})` — lines 46-99 (helper; export if the new command needs table-granular reuse, otherwise `checkContractSchema` alone suffices).

Change `async function checkContractSchema` → `export async function checkContractSchema` (line 107) and same for line 46. No behavior change; existing internal call sites (lines 353, 370) keep working.

**Alternative (cleaner):** factor both into a new `src/schema/driftCheck.js` and import from both `verify.js` and `releaseEvidence.js`. Either is acceptable; exporting in place is lower blast radius.

---

### `apps/dgfy-migration-runner/src/cli.js` (MODIFY — register subcommand)

**Analog:** the existing `.command()` blocks in the same file (lines 65-111). Follow the exact `import handler` → `program.command().description().option().action()` shape.

**Import** (top, alongside lines 6-12):
```javascript
import { runReleaseEvidence } from './commands/releaseEvidence.js';
```

**Registration inside `buildProgram()`** (mirror the `verify` block lines 65-70 and `activate-tenant`'s `.option()` usage lines 96-111):
```javascript
program
  .command('release-evidence')
  .description('Interactively select active tenants and produce migration-verification + tenant-drift evidence')
  .option('--evidence-dir <dir>', 'Directory to write reviewable JSON/markdown reports')
  .action(async (options) => { await runReleaseEvidence({ evidenceDir: options.evidenceDir }); });
```
> `buildProgram()` is exported and self-invocation is guarded by `isMainModule` (lines 133-138) so `cliContract.test.js` can dispatch in-process. Keep that pattern intact.

---

### `scripts/dgfy-seam-smoke.js` (new generic runner, CJS, batch/transform)

**Analogs:** `scripts/check-compat-seams.js` (manifest loading exports) + `commands/verifyContinuity.js` (the one active seam's shape) + `gate-release-local.js` (spawnSync dispatch).

**Manifest load + active filter (D-04)** — reuse the exported `loadManifest` from `check-compat-seams.js` (VERIFIED `module.exports` lines 390-403, definition lines 93-103). Do NOT write a new JSON loader.
```javascript
const { loadManifest } = require('./check-compat-seams.js');
const manifest = loadManifest(path.join('docs', 'architecture', 'compatibility-seams.json'));
const activeSeams = (manifest.seams || []).filter((s) => s.status === 'active');
// each seam: { id, type, status, rationale, tests:[...repo-relative paths], rollback, removal_criteria }
```
> Manifest shape VERIFIED (`compatibility-seams.json`): the one seam `db-continuity-legacy-backup` has `tests: ["apps/dgfy-migration-runner/tests/verifyContinuity.test.js"]`. "Active" = `status === 'active'` (Assumption A3).

**Test dispatch (Pitfall 1 + 2)** — `tests[]` entries are **file paths, not shell commands**. Map each path to its owning package's runner and shell out via `spawnSync` (same helper shape as `gate-release-local.js` lines 10-22). For the migration-runner (jest) case:
```javascript
// apps/dgfy-migration-runner/tests/*.test.js  →
runCommand('npm', ['--prefix', 'apps/dgfy-migration-runner', 'test', '--', testPath]);
```
> **Pitfall 1 (critical for SC3):** `verifyContinuity.test.js`'s real behavior probe is gated behind `RUN_CONTINUITY_INTEGRATION=true` (default skip). The runner MUST set the required integration env flag(s) so behavior-preservation actually executes, and **fail-closed** (no DB / creds absent → gate fails) rather than pass on skipped tests. Use a small seam-id → required-env map (plan decision, Open Question 3): `db-continuity-legacy-backup` needs `RUN_CONTINUITY_INTEGRATION=true` + `SOURCE_DB_*` creds.

**Output:** emit per-seam `{ id, ok, detail }` results into `seam_smoke.json` under the evidence dir; the gate script converts these to `addGate` entries (one per seam id).

---

## Shared Patterns

### Gate accumulator + verdict contract (D-01)
**Source:** `scripts/gate-release-local.js` lines 35-39 (`addGate`), 105-124 (payload).
**Contract enforced by:** `scripts/verify-release-verdict.js` lines 55-75.
**Apply to:** `gate-release-dgfy-evidence.js`.
Verdict payload MUST satisfy: `generated_at` truthy; `target_sha` a string (matches `--sha` when supplied); `verdict ∈ {pass,fail,bypassed}`; `gates` a **non-empty** array (Pitfall 5). Optional `--require-pass` rejects non-`pass/bypassed`.

### spawnSync shell-out
**Source:** `scripts/gate-release-local.js` lines 10-22, 56.
**Apply to:** both new root scripts (`gate-release-dgfy-evidence.js`, `dgfy-seam-smoke.js`). Non-zero exit → `ok:false`.

### Env-validate-before-connect (RUN-03) + fail-closed
**Source:** `commands/verify.js` lines 322-330; `commands/verifyContinuity.js` lines 136-142; `commands/activateTenant.js` lines 30-46.
**Apply to:** `releaseEvidence.js`. `validateEnv()` (no DB touch) → `assertTargetDbNameAllowed()` → open connection. A missing `SOURCE_DB_*`/`TARGET_DB_*` yields a clear `EnvValidationError`, not a crash (Pitfall 3).

### Report writing (RUN-05, no secrets)
**Source:** `commands/verify.js` lines 519-520; `reports/reportWriter.js` `writeJsonReport` (lines 28-33) + `writeSummaryReport`.
**Apply to:** `releaseEvidence.js`. Machine-readable JSON + human summary. Reports carry only database names, business_id, table names, migration names, counts, booleans — never host/user/password/DSN/tokens (`activateTenant.js` T-04-09-04).

### Registry query (dgfy_core, primary target connection)
**Source:** `commands/activateTenant.js` lines 64-67; `commands/verify.js` `checkTenantCoverage` lines 187-192.
**Apply to:** `releaseEvidence.js` tenant discovery. Query on `createTargetConnection(config)` — the registry lives in `dgfy_core`.

### Manifest loading (source of truth)
**Source:** `scripts/check-compat-seams.js` exported `loadManifest` (lines 93-103, 390-403).
**Apply to:** `dgfy-seam-smoke.js`. Do not re-parse; reuse the exported loader.

---

## No Analog Found

None. Every deliverable has a direct or composite in-repo analog. The only genuinely-new mechanics are (a) the `@inquirer/prompts` `checkbox` interactive selection (new dep, no in-repo precedent — Research Pattern 5) and (b) the generic seam test-dispatch loop (composed from existing manifest-loader + spawnSync patterns).

## New Dependency

| Package | Version | Install target | Fallback |
|---------|---------|----------------|----------|
| `@inquirer/prompts` | ^8 (8.5.2 latest) | runner only: `npm --prefix apps/dgfy-migration-runner install @inquirer/prompts@8` | `prompts` 2.4.2 (`multiselect`) |

ESM-native, matches runner's `"type":"module"`. Runner currently has NO prompt dep (VERIFIED `package.json`).

## Metadata

**Analog search scope:** `scripts/` (root gate + verdict + compat-seams tooling), `apps/dgfy-migration-runner/src/commands/`, `apps/dgfy-migration-runner/src/reports/`, `apps/dgfy-migration-runner/src/cli.js`, `docs/architecture/compatibility-seams.json`, root `package.json` scripts.
**Files scanned (read in full or targeted):** `gate-release-local.js`, `verify-release-verdict.js`, `commands/verify.js`, `commands/verifyContinuity.js`, `commands/activateTenant.js`, `cli.js`, `reports/reportWriter.js`, `check-compat-seams.js` (targeted), `compatibility-seams.json`, both `package.json`.
**Do-not-touch (VERIFIED constraints):** `.github/workflows/ci.yml` per-PR jobs (D-05); `backend/`, `frontend/` beyond gate needs; `compatibility-seams.json` (read-only, no new seams); `mysql2` pin `^3.6.5`.
**Pattern extraction date:** 2026-07-12
