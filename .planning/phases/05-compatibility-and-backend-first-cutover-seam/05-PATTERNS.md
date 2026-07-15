# Phase 5: Compatibility and Backend-First Cutover Seam - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 14 (7 new, 7 modified)
**Analogs found:** 14 / 14 (every file has an in-repo analog — this is a composition-and-wiring phase, not new machinery)

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `docs/architecture/compatibility-seams.json` (or `.yaml`) | new | config / source-of-truth manifest | transform (declarative data) | `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` (contract-as-data) + JSON manifest convention (`DGFY_MIGRATION_TARGET_MANIFEST`) | role-match |
| `scripts/check-compat-seams.js` | new | CI guardrail / validator | batch (git-diff scan + validate) | `scripts/check-compliance-impact.js` (declaration gate) + `backend/scripts/check-architecture-guardrails.js` (file-walk scan) | exact (two-analog composite) |
| `scripts/check-compat-seams.test.js` | new | test | request-response (assert) | any co-located `scripts/*.test.js` (e.g. `scripts/check-compliance-impact` sibling convention, run via `node --test`) | role-match |
| `scripts/generate-compat-inventory.js` | new | generator / utility | transform (manifest → markdown) | `scripts/lint-docs.js` (front-matter/registry reader) + `apps/dgfy-migration-runner/src/reports/reportWriter.js` (`writeReportFile`) | role-match |
| `backend/scripts/check-architecture-guardrails.js` | modified | CI guardrail (extend) | batch (file-walk + regex ban) | itself (add `entities/` scan + `COMPAT_IMPORT_PATTERN`) | exact (extend-in-place) |
| `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` | modified | config / allowlist | transform | itself (add compat-import allowlist export) | exact (extend-in-place) |
| `apps/dgfy-api/eslint.config.mjs` | modified | config / lint rule | request-response | itself, lines 20-35 (controllers→models ban) | exact (sibling block) |
| `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` | new | command / reference seam | file-I/O + DB read (non-destructive) | `apps/dgfy-migration-runner/src/commands/verify.js` | exact |
| `apps/dgfy-migration-runner/src/cli.js` | modified | route / CLI wiring | request-response | itself, lines 64-101 (subcommand `.action()` wiring) | exact (extend-in-place) |
| `apps/dgfy-migration-runner/tests/verifyContinuity.test.js` | new | test | request-response | existing runner command tests (env-flag-gated DB tests) | role-match |
| `docs/architecture/adr/00NN-compatibility-seam-governance.md` | new | governance doc | transform | `docs/architecture/adr/0004-architecture-compliance-automation.md` (ADR-0004 shape) | role-match |
| `.github/workflows/ci.yml` | modified | config / CI wiring | event-driven | itself, lines 165-171 & 258 (`check:architecture` / `check:compliance` steps) | exact (extend-in-place) |
| `.husky/pre-commit` | modified | config / hook wiring | event-driven | itself (staged-file grep → conditional `npm run check:*`) | exact (extend-in-place) |
| `package.json` (root) | modified | config / npm scripts | — | itself, `check:architecture` / `check:compliance` / `lint:docs` script entries | exact (extend-in-place) |
| `docs/_meta/document-registry.json` | modified (optional) | config / doc registry | — | itself, `governed_docs[]` entries (only if inventory doc is registered — see Pitfall) | exact (extend-in-place) |

## Pattern Assignments

### `scripts/check-compat-seams.js` (CI validator, batch scan)

This is the spine of the phase (D-03/D-05/D-06). It is a **composite of two proven root-`scripts/` analogs**. Keep it CJS, root-relative, zero-external-dep (JSON fallback recommended per RESEARCH D-04). It must do four things: (1) schema+status validate the manifest, (2) completeness gate (all governance fields non-empty), (3) code↔manifest reconcile, (4) feed the domain-layer import ban (delegated to the guardrail extension below).

**Analog A — `scripts/check-compliance-impact.js`** (the declaration-gate + git-diff + staged-mode pattern)

Header, args, root-chdir (lines 9-17):
```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const useStaged = args.has('--staged');

const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);
```

Git-diff runner + staged/CI dual mode (lines 187-236) — copy `runCommand`, `splitLines`, `resolveChangedFiles`. The `--staged` branch (line 217-223) is exactly the pre-commit mode the new check adopts:
```javascript
const runCommand = (command, { allowFail = false } = {}) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return '';
    throw error;
  }
};
// ...
if (useStaged) {
  return splitLines(runCommand('git diff --cached --name-only', { allowFail: true }));
}
```

Completeness/validation gate shape (lines 389-486, and the fail/exit block 496-513) — the new check's per-seam validation mirrors `validateDeclarationFile`'s "collect failures, exit(1) if any":
```javascript
const declarationFailures = declarationFiles.flatMap(validateDeclarationFile);
if (declarationFailures.length > 0) {
  console.error('[check:compliance] Declaration validation failed:');
  declarationFailures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log('[check:compliance] PASS');
```

For each manifest seam, assert all six D-03 governance fields (`rationale`, `tests`, `rollback`, `removal_criteria` non-empty; `id`, `type`, `status` valid enum) — same "push a human-readable failure string per missing field" idiom as `validateDeclarationFile`'s `REQUIRED_DECLARATION_FRONTMATTER_KEYS` loop (lines 409-413).

**Analog B — `backend/scripts/check-architecture-guardrails.js`** (the file-walk + regex-marker scan for code↔manifest reconciliation)

Recursive code-file walker (lines 24-44) — copy `collectCodeFiles` verbatim for scanning the designated compat location for seam markers, then reconcile discovered markers against manifest `id`s:
```javascript
const collectCodeFiles = (directoryPath, out = []) => {
    if (!fs.existsSync(directoryPath)) return out;
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) { collectCodeFiles(absolutePath, out); continue; }
        if (!entry.isFile()) continue;
        if (!absolutePath.endsWith('.js') && !absolutePath.endsWith('.mjs') && !absolutePath.endsWith('.cjs')) continue;
        out.push({ absolutePath, relativePath: toPosixPath(path.relative(REPO_ROOT, absolutePath)) });
    }
    return out;
};
```

`hasPattern` with lastIndex reset (lines 93-97) is the safe way to reuse a `/g` regex for a seam-marker scan.

**Security (V5 — RESEARCH Security Domain):** validate `tests` paths BEFORE `fs.existsSync`/execution — reject `..` and absolute paths (repo-relative only). Mirror the path-safety idiom `lint-docs.js` uses (`isPathLikeChecklistRef` / resolve-and-check within repo root). Reject unknown/missing manifest fields strictly.

---

### `backend/scripts/check-architecture-guardrails.js` (guardrail extension — D-05a/D-05b)

**Analog:** itself. Extend in place — do NOT fork a second checker (D-05 mandate; anti-pattern in RESEARCH). Two concrete additions:

1. **Add a compat-import ban pattern** mirroring the existing `MODEL_IMPORT_PATTERN` (line 9):
```javascript
const MODEL_IMPORT_PATTERN = /from\s+['"][^'"]*\/models(?:\/[^'"]*)?['"]/g;
// NEW sibling for D-05b (designated compat dir name is planner's choice, e.g. continuity|compat):
const COMPAT_IMPORT_PATTERN = /from\s+['"][^'"]*\/(continuity|compat)(?:\/[^'"]*)?['"]/g;
```

2. **Scan `entities/` too** — RESEARCH Pitfall 3: the current script scans only `usecases/` (lines 149-160) and `controllers/`, never `entities/`. D-05b names the domain layer as `entities|usecases`. Add an `entitiesDirectory` collect+scan block mirroring the usecase block:
```javascript
// EXISTING (lines 149-160) — the pattern to replicate for entities/ + compat imports:
const usecaseDirectory = path.join(moduleAbsolutePath, 'usecases');
const usecaseFiles = collectCodeFiles(usecaseDirectory);
usecaseFiles.forEach((file) => {
    const source = fs.readFileSync(file.absolutePath, 'utf8');
    if (hasPattern(MODEL_IMPORT_PATTERN, source)) {
        violations.usecaseLayerLeak.push(`${file.relativePath} imports models directly`);
    }
    // NEW: if (hasPattern(COMPAT_IMPORT_PATTERN, source)) violations.domainCompatLeak.push(...)
});
```

**Pitfall 2 (RESEARCH):** `relativePath = path.relative(backendRoot, absolutePath)` — `backendRoot` is hard-coded to the script's `../` (line 7) even when re-pointed at `apps/dgfy-api` via `ARCH_GUARDRAIL_MODULES_ROOT`. Any new compat allowlist entries must keep the `../apps/dgfy-api/...` prefix convention (confirmed in the existing allowlist header). Add a new `violations.domainCompatLeak` bucket to the `violations` object (lines 105-110) so `printViolations` renders it automatically.

---

### `apps/dgfy-api/eslint.config.mjs` (declarative import ban — D-05b)

**Analog:** itself, lines 20-35 (controllers→models ban). Add a sibling block covering the domain layer. This is the belt-and-suspenders half of the guardrail (RESEARCH Pitfall 3):

```javascript
// EXISTING block to mirror (lines 20-35):
{
    files: ["src/controllers/**/*.js", "src/modules/**/controllers/**/*.js"],
    rules: {
        "no-restricted-imports": ["error", { patterns: [
            { group: ["**/models", "**/models/**"],
              message: "Controllers must not import models directly. Use module repositories/use-cases." }
        ]}]
    }
}
// NEW sibling block (from RESEARCH Pattern 4):
{
    files: ["src/modules/**/entities/**/*.js", "src/modules/**/usecases/**/*.js"],
    rules: {
        "no-restricted-imports": ["error", { patterns: [
            { group: ["**/continuity", "**/continuity/**", "**/compat", "**/compat/**"],
              message: "Domain layer (entities/usecases) must not import compatibility/continuity code (CMP-03)." }
        ]}]
    }
}
```

---

### `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` (reference seam — D-02, non-destructive DB read)

**Analog:** `apps/dgfy-migration-runner/src/commands/verify.js` (the closest existing command; same never-throws, findings-report posture).

**Import + env-validate-before-connect ordering** (verify.js lines 4-13, 321-329; env.js `validateEnv` is side-effect-free per RUN-03):
```javascript
import { validateEnv } from '../config/env.js';
import { createSourceConnection } from '../config/db.js';       // SOURCE_DB (legacy backup) only
import { writeJsonReport } from '../reports/reportWriter.js';
import { EnvValidationError } from '../utils/errors.js';

export async function runVerifyContinuity({} = {}) {
  const { valid, errors, config } = validateEnv();   // NO DB touch (env.js lines 94-180)
  if (!valid) throw new EnvValidationError(errors.join('; '));
  const legacy = createSourceConnection(config);      // connects only now (db.js lines 28-38)
  // ... NON-DESTRUCTIVE read-only probes: SHOW TABLES / COUNT / integrity checks ...
}
```

**Non-destructive posture (CMP-01, RESEARCH anti-pattern + Security Domain):** read-only only. Any future write MUST route through the runner's `assertDestructiveAllowed()` gate — never bypass. Parameterize all queries (no manifest/domain string interpolation into SQL). Note `createSourceConnection` (db.js lines 28-38) reuses the validated `config.sourceDb` object — never `process.env` directly, never `backend/`'s `TenantConnector.js`.

**Findings report shape + JSON write** (verify.js lines 485-525, reportWriter.js lines 28-33):
```javascript
const report = {
  generated_at: new Date().toISOString(),
  command: 'verify-continuity',
  findings: [...],
  summary: { ok: findings.every(f => f.ok), source_db_name: config.sourceDb.name }
};
const reportPath = await writeJsonReport(config.reportDir, 'verify-continuity', report);
```
`writeJsonReport(reportDir, command, payload)` timestamps + names the file `{iso}-verify-continuity.json` and mkdir-p's `config.reportDir` (reportWriter.js lines 19-33). Keep report payloads free of raw DB rows (Security Domain — Information Disclosure).

**Reconcile against schema contracts (A3 — Claude's discretion):** the "expected legacy domain set" is defined against the legacy backup's own tables and `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` / `dgfyBusinessContract.js`. See verify.js's `checkContractSchema` (lines 107-137) for the contract-comparison idiom, but strip it to a read-only integrity probe (no `queryInterface` mutation).

---

### `apps/dgfy-migration-runner/src/cli.js` (wire the new subcommand)

**Analog:** itself, lines 64-101 (single-verb subcommand `.action()` wiring). Add one command mirroring the `verify` command (lines 64-69) and import the handler alongside the others (lines 6-11):
```javascript
import { runVerifyContinuity } from './commands/verifyContinuity.js';
// ...
program
  .command('verify-continuity')
  .description('Non-destructively verify legacy backup domain tables remain intact (compat reference seam)')
  .action(async () => { await runVerifyContinuity({}); });
```
`buildProgram()` is exported for `cliContract.test.js` — keep the new command inside it (lines 22-104), not inline in `main()`.

---

### `docs/architecture/compatibility-seams.json` (manifest — source of truth, D-03/D-04)

**Analog:** JSON-manifest-as-data convention already used by the runner (`DGFY_MIGRATION_TARGET_MANIFEST` is JSON; reports are JSON via `writeJsonReport`) and the contract-as-data shape of `schemaContracts/dgfyCoreContract.js`. RESEARCH recommends **JSON fallback** (zero-dep — root `node_modules` has NO `js-yaml`; it exists only transitively). First entry MUST be the DB-continuity reference seam (D-02). Shape (from RESEARCH Code Examples):
```json
{
  "version": 1,
  "seams": [
    {
      "id": "db-continuity-legacy-backup",
      "type": "db-level",
      "status": "active",
      "rationale": "Non-destructively verifies the legacy backup's domain tables remain intact during/after the database-first cutover (CMP-01).",
      "tests": ["apps/dgfy-migration-runner/tests/verifyContinuity.test.js"],
      "rollback": "Seam is read-only; disabling it has no data effect. Revert by removing the command and its manifest entry.",
      "removal_criteria": "Legacy backup decommissioned (future milestone, CUT-02)."
    }
  ]
}
```
Suggested enums (planner discretion, A2): `type ∈ {db-level, api-boundary, build-time, data-migration}`; `status ∈ {active, accepted, pending, removed}`. `tests` = array of repo-relative paths.

---

### `scripts/generate-compat-inventory.js` (manifest → COMPATIBILITY_INVENTORY.md)

**Analog:** `scripts/lint-docs.js` (registry/front-matter reader living in root `scripts/`, CJS) for the read+parse half; `apps/dgfy-migration-runner/src/reports/reportWriter.js`'s `writeReportFile` (lines 10-13) for the deterministic mkdir-p + write half. Deterministic render only (no timestamps in body, or a drift check `git diff --exit-code` breaks — RESEARCH Pitfall 4 recommendation 3). Add a drift check: regenerate → assert no diff.

---

### `docs/architecture/adr/00NN-compatibility-seam-governance.md` (governance ADR)

**Analog:** `docs/architecture/adr/0004-architecture-compliance-automation.md` (this phase extends ADR-0004's harness; the new ADR records the manifest+gate+guardrail-extension decision). `ARCHITECTURE_GOVERNANCE.md` requires an ADR for cross-boundary/guardrail changes. Also update the "Guardrails (Automated)" list in `docs/architecture/ARCHITECTURE_GOVERNANCE.md`. Next free ADR number: sequence continues past `0032` (confirm highest before assigning).

## Shared Patterns

### Git-diff / staged-file detection (CI + pre-commit dual mode)
**Source:** `scripts/check-compliance-impact.js` lines 187-236 (`runCommand`, `resolveChangedFiles`, `--staged` branch)
**Apply to:** `scripts/check-compat-seams.js` (code↔manifest reconciliation must run in both CI and `.husky/pre-commit --staged` mode).

### Recursive code-file walk + regex marker scan
**Source:** `backend/scripts/check-architecture-guardrails.js` lines 24-44 (`collectCodeFiles`) + lines 93-97 (`hasPattern` with `lastIndex` reset)
**Apply to:** `scripts/check-compat-seams.js` (scan designated compat dir for seam markers) AND the guardrail extension (scan `entities/` for compat imports).

### Collect-failures-then-exit(1) validator idiom
**Source:** `scripts/check-compliance-impact.js` lines 389-513 (`validateDeclarationFile` returns failure-string array; caller `flatMap`s + `process.exit(1)`)
**Apply to:** `scripts/check-compat-seams.js` per-seam completeness gate (all six D-03 fields non-empty + referenced tests exist).

### Path-safety before filesystem/exec (V5 input validation)
**Source:** `scripts/lint-docs.js` path-safety idiom (resolve within repo root, reject `..`/absolute); `apps/dgfy-migration-runner/src/config/db.js` lines 104-125 (`createLegacyTenantSourceConnection` rejects blank/`dgfy_`-named DB before constructing)
**Apply to:** `scripts/check-compat-seams.js` (manifest `tests` paths) and `verifyContinuity.js` (DB/domain names → parameterized queries).

### Env-validate-before-connect (side-effect-free contract, RUN-03)
**Source:** `apps/dgfy-migration-runner/src/config/env.js` `validateEnv` (lines 94-180, no DB touch) → `src/config/db.js` lazy factories (lines 28-38)
**Apply to:** `verifyContinuity.js` — validate, then `createSourceConnection`, then read-only probe.

### Timestamped JSON report writer
**Source:** `apps/dgfy-migration-runner/src/reports/reportWriter.js` lines 19-33 (`buildReportFileName` + `writeJsonReport`)
**Apply to:** `verifyContinuity.js` report output; reuse `writeReportFile` for the doc generator's write half.

### npm-script + CI-step + pre-commit-hook wiring trio
**Source:** root `package.json` (`check:architecture`, `check:compliance` script entries) + `.github/workflows/ci.yml` lines 165-171, 258 (each `check:*` as its own `run:` step) + `.husky/pre-commit` (staged-file grep → conditional `npm run check:*`)
**Apply to:** wire `check:compat-seams` identically — add root npm script, a CI `run:` step in the architecture/compliance job, and a `.husky/pre-commit` conditional block gated on `docs/architecture/compatibility-seams.*` or compat-dir changes.

## No Analog Found

None. Every file maps to an existing in-repo analog. Two are **role-match rather than exact** and warrant a note for the planner:

| File | Role | Data Flow | Note |
|------|------|-----------|------|
| `scripts/generate-compat-inventory.js` | generator | transform | No single "manifest→markdown generator" exists; compose `lint-docs.js` (read) + `reportWriter.writeReportFile` (write). Add a regenerate-drift check. |
| `docs/architecture/compatibility-seams.json` | manifest/config | transform | No existing compat manifest; JSON-as-data convention (`DGFY_MIGRATION_TARGET_MANIFEST`, `schemaContracts/*`) is the closest precedent. YAML deferred to JSON fallback (no direct `js-yaml` dep in repo). |

## Metadata

**Analog search scope:** `scripts/`, `backend/scripts/`, `apps/dgfy-api/`, `apps/dgfy-migration-runner/src/`, `docs/architecture/`, `.github/workflows/`, `.husky/`, root `package.json`
**Files scanned/read:** 8 full analogs (`check-compliance-impact.js`, `check-architecture-guardrails.js`, `eslint.config.mjs`, `env.js`, `db.js`, `reportWriter.js`, `cli.js`, `verify.js`) + targeted greps (CI wiring, husky, doc-registry frontmatter, dgfy-api allowlist)
**Key cross-cutting facts verified:** root `node_modules` has no `js-yaml` (JSON fallback); `entities/` currently unscanned by the guardrail; `backendRoot` relative-path base is hard-coded; CI `check:*` steps at ci.yml 165-171/258; husky staged-grep pattern.
**Pattern extraction date:** 2026-07-12
