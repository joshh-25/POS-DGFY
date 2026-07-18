# Phase 5: Compatibility and Backend-First Cutover Seam - Research

**Researched:** 2026-07-12
**Domain:** Governance tooling — compatibility-seam manifest, CI-enforced acceptance/removal gates, architecture-compliance guardrail extension, and one DB-level reference seam on the existing migration runner
**Confidence:** HIGH (all findings verified directly against the codebase; near-zero external-library surface)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Ship the **full governance framework + one concrete reference seam** (not framework-only, not a non-wired scaffold).
- **D-02:** The reference seam is the **DB-level domain-continuity script**, NOT a request-time API adapter. `apps/dgfy-api` is self-contained (ADR 0032); no live old-client→new-backend path exists. This seam gets the **first** inventory entry; `removal_criteria` = "legacy backup decommissioned". No runtime API adapter is built.
- **D-03:** **Manifest as source of truth + generated doc.** Each entry carries `id`, `type`, `rationale`, `tests`, `rollback`, `removal_criteria`, `status`. A check script validates schema + status. Phase 6 (CMP-04) consumes the manifest directly.
- **D-04:** **YAML** at `docs/architecture/compatibility-seams.yaml`; generated doc `docs/architecture/COMPATIBILITY_INVENTORY.md`. **YAML parser availability is UNCONFIRMED — a key research question (answered below).** If a YAML dep is undesirable, **JSON at the same path/schema is the accepted fallback.**
- **D-05:** **EXTEND the existing ADR-0004 architecture-compliance automation** (reuse Phase 4's lint/CI harness — do NOT build a new checker). Enforce: (a) compat/continuity code confined to a designated location and NOT in `apps/dgfy-api/src/modules/*/entities|usecases`; (b) domain layer imports **zero** compat code; (c) CI **fails if a code-level seam has no matching active manifest entry**.
- **D-06:** **Manifest-gated in CI — CI is the acceptance authority.** "Accepted" = complete entry (all of `rationale`, `tests`, `rollback`, `removal_criteria` non-empty) AND referenced tests pass. Same CI check as D-05 reading the same manifest.

### Claude's Discretion
- Concrete internals of the DB-level continuity script(s) — which domains they reconcile and how — defined against the Phase 1–3 migration runner and the `dgfy_*` schema contracts. Only fixed: this script is the reference seam and MUST be the first inventory entry with complete governance fields.
- Exact manifest field schema details (enum values for `type`/`status`; whether `tests` is a list of file paths or test ids), provided the six D-03 fields are present and machine-validated.
- Exact designated location/path for compat code (D-05a), provided it is outside the canonical domain layer and enforced by the extended compliance check.

### Deferred Ideas (OUT OF SCOPE)
- Product / POS / payments / fiscal domain APIs in `dgfy-api`.
- Frontend migration into `apps/*` (e.g. `apps/dgfy-pos`).
- Wholesale transaction cutover to the new API.
- Runtime request-time API adapters (no live cross-path exists to justify one).
- Release-evidence gates and rehearsal (Phase 6/7, CMP-04/CMP-05) — this phase produces the manifest Phase 6 *consumes*.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CMP-01** | Existing POS and Storefront behavior remains available while the new foundation runs beside legacy. | Under the ADR-0032 self-contained-API reframe, "stays available" is satisfied structurally: legacy `backend/` is untouched and self-serving; `apps/dgfy-api` has zero runtime coupling to it (verified: `backend/src` has no `dgfy-api` references). The reference DB-continuity seam is **non-destructive on `SOURCE_DB`** (legacy backup), proving legacy domains remain intact. CMP-01 evidence = the manifest's reference-seam entry + its passing (non-destructive/read-only) tests. |
| **CMP-02** | Every legacy touch has documented rationale, tests, rollback notes, removal criteria before acceptance. | The manifest schema (D-03) encodes exactly these fields; the CI acceptance gate (D-06) fails the build if any is empty or tests fail. Pattern mirrors the existing `check-compliance-impact.js` declaration-file gate and the ADR-0004 allowlist "linked task ID + planned removal" contract. |
| **CMP-03** | Compatibility translates at boundaries; never defines canonical DGFY domain contracts. | Enforced by extending `check-architecture-guardrails.js` (D-05): compat code confined to a designated dir; `apps/dgfy-api/src/modules/*/entities|usecases` (the canonical domain layer — confirmed both dirs exist) import zero compat code. Backed by an `eslint no-restricted-imports` rule mirroring the existing controllers→models ban. |
</phase_requirements>

## Summary

This is a **governance-and-tooling phase with an almost-zero external-dependency footprint**. Every mechanism it needs already exists in the repo and is proven in CI: a file-walking architecture guardrail (`backend/scripts/check-architecture-guardrails.js`), a controller-boundary check, an `eslint no-restricted-imports` layering rule, a root-level "declaration required when sensitive files change" gate (`scripts/check-compliance-impact.js`), a doc-governance linter driven by a JSON registry (`scripts/lint-docs.js`), and a mature migration runner (`apps/dgfy-migration-runner`) with a side-effect-free env contract, lazy Sequelize connection factories, and a JSON report writer. Phase 5 composes these, it does not invent new machinery.

The one genuinely open technical decision is **manifest format (D-04)**. Finding: **no package in the repo declares a YAML parser as a direct dependency.** `js-yaml` exists only *transitively* in `backend/` (v4.3.0), `apps/dgfy-api/` (v4.3.0), and `apps/dgfy-migration-runner/` (v3.15.0) node_modules — and is **entirely absent from the repo-root `node_modules`**, where the `scripts/*.js` guardrails run. Relying on a transitive dep is brittle (the migration-runner's transitive copy is a major version behind and could vanish on any lockfile change). So the real choice is: (a) add `js-yaml` as an *explicit direct dependency* to whichever package hosts the new check, or (b) take the sanctioned **JSON fallback** (`JSON.parse`, zero dependency, works from any context including repo-root CJS scripts).

**Primary recommendation:** Use the **JSON fallback** for the manifest (`docs/architecture/compatibility-seams.json`), OR — if YAML's comment-friendliness is judged worth it — add `js-yaml@^4.1.0` as an explicit direct dependency to the exact package that runs the validator and host the check there. Do **not** rely on transitive `js-yaml`. Host the new manifest+reconciliation check where its dependencies resolve deterministically and wire it into `.github/workflows/ci.yml` as a new step/job plus `.husky/pre-commit`, exactly as ADR-0004's guardrails are wired. Build the reference seam as a new **non-destructive** command/script in `apps/dgfy-migration-runner` reusing `validateEnv()`, the `createSourceConnection()` factory, and `writeJsonReport()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compatibility-seam manifest (source of truth) | Repo governance / `docs/architecture/` | — | It is documentation-adjacent config consumed by CI and Phase 6; not app runtime code. |
| Manifest schema + status validation | CI tooling (`scripts/` or `backend/scripts/`) | pre-commit | Same class as existing `check-*` guardrails; must run in Node, no DB. |
| Code↔manifest reconciliation | CI tooling | pre-commit | Static scan of source tree for seam markers vs manifest entries — file-walk pattern already in `check-architecture-guardrails.js`. |
| Domain-layer "imports zero compat code" guardrail | CI tooling + ESLint | pre-commit | Extends the existing `no-restricted-imports` + guardrail-script duo. |
| Generated human-readable inventory doc | CI tooling (generator) | `docs/` | Deterministic render of the manifest; mirrors `generate-ai-docs.js` generator pattern. |
| Reference DB-continuity seam | `apps/dgfy-migration-runner` (Node CLI, DB tier) | — | Operates on `SOURCE_DB`/`TARGET_DB` via the runner's own connection factories; belongs with the migration machinery, not `dgfy-api`. |
| Legacy POS/Storefront availability | Legacy `backend/` (untouched) | — | Self-serving; no compat code enters it. Availability is preserved by *not touching* it, verified by the guardrail. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`fs`, `path`, `child_process`) | Node 24 (CI) | File walking, git-diff detection, report/doc writing | Every existing repo guardrail (`check-compliance-impact.js`, `check-architecture-guardrails.js`, `lint-docs.js`) uses only these. `[VERIFIED: .github/workflows/ci.yml node-version '24']` |
| `JSON.parse` / `JSON.stringify` (built-in) | — | Manifest parse/serialize **if JSON fallback chosen** | Zero dependency; works from repo-root CJS scripts where `js-yaml` is absent. `[VERIFIED: repo node_modules inspection]` |
| ESLint `no-restricted-imports` | eslint `^10.0.0` (already in `apps/dgfy-api`) | Enforce "domain layer imports zero compat code" | Exact mechanism already bans controllers→models in `apps/dgfy-api/eslint.config.mjs`. `[VERIFIED: apps/dgfy-api/eslint.config.mjs lines 20-35]` |
| `sequelize` + `mysql2` | `^6.37.8` / `^3.6.5` | Reference DB-continuity seam DB access | Already the runner's pinned stack. `[VERIFIED: apps/dgfy-migration-runner/package.json]` |
| `commander` | `^15.0.0` | CLI subcommand wiring for the reference seam | Runner's existing CLI framework (`src/cli.js`). `[VERIFIED: apps/dgfy-migration-runner/package.json]` |

### Supporting (only if YAML is chosen over the JSON fallback)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `js-yaml` | `^4.1.0` (pin to match backend's 4.3.0 line) | Parse `compatibility-seams.yaml` | ONLY if D-04 YAML is kept. **Must be added as an explicit direct dependency** to the host package — do not rely on the transitive copies. `[VERIFIED: present transitively @4.3.0 backend / @3.15.0 runner; ABSENT at repo root]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| YAML manifest (`js-yaml`) | JSON manifest (`JSON.parse`) | JSON = zero-dep, runs from any context incl. root `scripts/`, and is what the runner's own reports/manifests already use (`writeJsonReport`, `DGFY_MIGRATION_TARGET_MANIFEST` is JSON). Loses YAML comments. **This is the CONTEXT-sanctioned fallback (D-04).** |
| New standalone checker | Extend `check-architecture-guardrails.js` | D-05 mandates extension. A new checker duplicates file-walking + allowlist logic and a second CI wiring surface. |
| Hosting check in root `scripts/` (YAML) | Hosting in `backend/scripts/` or runner | Root `node_modules` has no `js-yaml`; root scripts are CJS. JSON at root works; YAML at root would need a new root dep. |

**Installation (only if YAML kept):**
```bash
# Add to the SPECIFIC package that runs the validator (example: backend, which already has js-yaml@4.3.0 transitively):
npm --prefix backend install js-yaml@^4.1.0   # promotes it to an explicit direct dependency
```
**If JSON fallback (recommended): no install required.**

**Version verification:** `js-yaml` confirmed installed at `backend/node_modules/js-yaml@4.3.0` and `apps/dgfy-migration-runner/node_modules/js-yaml@3.15.0` via direct `require(...).version`. `[VERIFIED: local node_modules]`

## Package Legitimacy Audit

> This phase adds **no new package** if the JSON fallback is taken. Only `js-yaml` is in question, and only if YAML is kept.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `js-yaml` | npm | ~13 yrs (est.) | ~90M/wk (est.) | github.com/nodeca/js-yaml | OK (widely used, already vendored transitively at v4.3.0 in `backend`) | Approved **only if YAML chosen**; add as explicit dep, do not rely on transitive. `[ASSUMED]` age/downloads — not re-verified against live registry this session; presence and version verified locally. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Recommendation stands: prefer JSON fallback and add zero packages. If YAML is kept, the planner should gate the `js-yaml` promotion behind a `checkpoint:human-verify` since its downloads/age were not re-verified against the live registry in this session.*

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────────┐
                         │   docs/architecture/compatibility-seams.{yaml│json}   │  ◄── SOURCE OF TRUTH (D-03/D-04)
                         │   entries: id,type,rationale,tests,rollback,  │
                         │            removal_criteria,status            │
                         └───────────────┬──────────────────────────────┘
                                         │ read by
        ┌────────────────────────────────┼───────────────────────────────────┐
        │                                │                                    │
        ▼                                ▼                                    ▼
┌───────────────────┐      ┌─────────────────────────────┐       ┌────────────────────────┐
│ generate-inventory│      │  check-compat-seams (NEW)   │       │  Phase 6 (CMP-04)      │
│ (NEW generator)   │      │  1. schema+status validate  │       │  consumes manifest for │
│  emits            │      │  2. completeness gate (D-06)│       │  release evidence      │
│ COMPATIBILITY_    │      │  3. code↔manifest reconcile │       │  (downstream, not this │
│ INVENTORY.md      │      │  4. domain-layer import ban │       │   phase)               │
└───────────────────┘      │     (extends ADR-0004 guard)│       └────────────────────────┘
                           └──────────────┬──────────────┘
                                          │ scans
                                          ▼
                   ┌───────────────────────────────────────────────┐
                   │  code seams (designated compat location)      │
                   │  ── reference seam: DB-continuity script ──►  │
                   │     apps/dgfy-migration-runner/src/...         │
                   │     validateEnv() → createSourceConnection()   │
                   │     → NON-DESTRUCTIVE read/verify of SOURCE_DB │
                   │     (legacy backup) → writeJsonReport()        │
                   └───────────────────────────────────────────────┘

        Wired into: .github/workflows/ci.yml (new step/job)  +  .husky/pre-commit  (mirrors ADR-0004)
```

### Recommended Project Structure (additions only)
```
docs/architecture/
├── compatibility-seams.json        # (or .yaml) manifest — SOURCE OF TRUTH
├── COMPATIBILITY_INVENTORY.md       # GENERATED from the manifest (do not hand-edit)
└── adr/00NN-compatibility-seam-governance.md   # cross-boundary ADR for this framework (governance requires it)

scripts/  (or backend/scripts/ if YAML+js-yaml)
├── check-compat-seams.js            # validate schema+status+completeness + code↔manifest reconcile
├── check-compat-seams.test.js       # unit tests (repo convention: co-located *.test.js run via node --test)
└── generate-compat-inventory.js     # deterministic manifest → COMPATIBILITY_INVENTORY.md

apps/dgfy-migration-runner/src/
├── commands/verifyContinuity.js     # (or continuity.js) NEW non-destructive reference seam command
└── continuity/…                     # (designated compat location, OUTSIDE any dgfy-api domain layer)
```

### Pattern 1: File-walking guardrail with allowlist (extend, don't rewrite)
**What:** Recursively collect `.js`/`.mjs`/`.cjs` files under a configurable root, regex-scan each for forbidden import patterns, exempt via an allowlist module, exit(1) on violations.
**When to use:** For D-05a (confine compat code) and D-05b (domain-layer imports zero compat code).
**Example:**
```javascript
// Source: backend/scripts/check-architecture-guardrails.js (lines 9, 149-160) — VERIFIED
const MODEL_IMPORT_PATTERN = /from\s+['"][^'"]*\/models(?:\/[^'"]*)?['"]/g;
// A new COMPAT_IMPORT_PATTERN would match imports of the designated compat dir:
// e.g. /from\s+['"][^'"]*\/(continuity|compat)(?:\/[^'"]*)?['"]/g
usecaseFiles.forEach((file) => {
  const source = fs.readFileSync(file.absolutePath, 'utf8');
  if (hasPattern(MODEL_IMPORT_PATTERN, source)) {
    violations.usecaseLayerLeak.push(`${file.relativePath} imports models directly`);
  }
});
```
> **Note the `entities` gap:** the current script scans `controllers` (naming) and `usecases` (model/service imports) but does **NOT** scan `entities/`. D-05b names `entities|usecases` as the domain layer. The extension must add an `entities/` scan for the compat-import ban. `[VERIFIED: check-architecture-guardrails.js — no 'entities' reference]`

### Pattern 2: "Declaration required when sensitive files change" CI gate (analog for code↔manifest reconciliation)
**What:** Detect changed/added files (git diff, `--staged` in pre-commit), map them to a required declaration, fail if the declaration is missing/incomplete.
**When to use:** For D-05c/D-06 — a code-level seam present without a complete active manifest entry = red build.
**Example:**
```javascript
// Source: scripts/check-compliance-impact.js (lines 9-31) — VERIFIED
const { execSync } = require('child_process');
const args = new Set(process.argv.slice(2));
const useStaged = args.has('--staged');       // same dual CI / pre-commit mode the new check should adopt
process.chdir(path.resolve(__dirname, '..')); // root-relative, CJS, zero external deps
```

### Pattern 3: Side-effect-free env contract + lazy connection factory (reference seam foundation)
**What:** `validateEnv()` purely validates `SOURCE_DB_*`/`TARGET_DB_*` and returns a config object with **no** DB connection; connection factories are called only after validation succeeds.
**When to use:** The DB-continuity reference seam must follow this ordering (RUN-03 contract).
**Example:**
```javascript
// Source: apps/dgfy-migration-runner/src/config/env.js + config/db.js — VERIFIED
import { validateEnv } from '../config/env.js';
import { createSourceConnection } from '../config/db.js';
import { writeJsonReport } from '../reports/reportWriter.js';

const { valid, errors, config } = validateEnv(process.env); // SOURCE_DB_*/TARGET_DB_* validated, NO connection
if (!valid) { /* print errors, exit non-zero */ }
const legacy = createSourceConnection(config);              // connects to SOURCE_DB (legacy backup) only now
// ... NON-DESTRUCTIVE queries only (SHOW TABLES / COUNT / integrity probes) ...
await writeJsonReport(config.reportDir, 'verify-continuity', payload);
```

### Pattern 4: ESLint layering ban (declarative half of D-05b)
```javascript
// Source: apps/dgfy-api/eslint.config.mjs (lines 20-35) — VERIFIED. Add a sibling block:
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

### Anti-Patterns to Avoid
- **Building a second checker instead of extending the guardrail** — violates D-05; duplicates file-walk + allowlist + CI wiring.
- **Relying on transitive `js-yaml`** — the runner's is v3.15.0 and can disappear on any dependency change; root has none.
- **Making the reference seam destructive on `SOURCE_DB`** — it must prove legacy domains stay *intact* (CMP-01). Read-only/verify posture; if any write is ever needed it must route through the runner's `assertDestructiveAllowed()` gate.
- **Hand-editing `COMPATIBILITY_INVENTORY.md`** — it is generated; a drift check should confirm it matches the manifest.
- **Registering the generated doc in `document-registry.json` naively** — `lint-docs.js` then requires 6 front-matter keys + valid links on it; the generator must emit those, or the doc stays unregistered (see Open Questions).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML/JSON parsing | A custom parser | `JSON.parse` (fallback) or explicit-dep `js-yaml` | Correctness/edge cases; JSON is built-in and already the runner's manifest format. |
| Source-tree file walking | New recursive walker | Copy/extend `collectCodeFiles()` from `check-architecture-guardrails.js` | Handles `.js/.mjs/.cjs`, posix-path normalization, dir recursion — already proven. |
| Changed-file / staged detection | New git plumbing | `check-compliance-impact.js`'s `git diff` + `--staged` pattern | Dual CI/pre-commit mode already solved. |
| Layering import bans | Bespoke AST analysis | `eslint no-restricted-imports` + guardrail regex | The repo enforces controllers→models this exact way today. |
| DB env validation / connections for the seam | New config loader | `validateEnv()` + `createSourceConnection()` | RUN-03 side-effect-free contract already guarantees "validate before connect". |
| Report writing | New file writer | `writeJsonReport()` / `writeReportFile()` | Timestamped JSON report convention already exists. |
| Doc governance / link checking | New linter | `scripts/lint-docs.js` + `document-registry.json` | Registry-driven front-matter + link validation already runs in CI. |

**Key insight:** Phase 5's value is *composition and wiring*, not new algorithms. Nearly every primitive exists; the risk is re-implementing one of them slightly differently and creating a second, drifting enforcement surface.

## Runtime State Inventory

> This phase creates governance tooling and one new non-destructive script. It is **not** a rename/refactor/migration of existing runtime state. The one adjacent concern:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None created/renamed. The reference seam **reads** `SOURCE_DB` (legacy backup) non-destructively. | None — read-only verification. |
| Live service config | CI (`.github/workflows/ci.yml`), `.husky/pre-commit`, and `docs/_meta/document-registry.json` gain new entries. These live in git. | Add new CI step/job + pre-commit hook + (optionally) a registry entry. |
| OS-registered state | None. | None — verified: no scheduler/pm2/systemd surface touched. |
| Secrets/env vars | Reference seam reuses existing `SOURCE_DB_*`/`TARGET_DB_*` (`apps/dgfy-migration-runner/.env`). No new secret. | None — reuse validated env contract. |
| Build artifacts | If `js-yaml` is promoted to a direct dep, the host package's lockfile changes. | Run `npm --prefix <pkg> install` and commit the lockfile (JSON fallback avoids this). |

## Common Pitfalls

### Pitfall 1: Root `node_modules` has no YAML parser
**What goes wrong:** A manifest validator placed in `scripts/` (root, CJS) `require('js-yaml')` and crashes in CI — root `node_modules` contains only `axios/bcrypt/jsonwebtoken/concurrently/husky`.
**Why it happens:** `js-yaml` is only a *transitive* dep of `backend`/`apps/*` tooling; the root package never installs it.
**How to avoid:** Use JSON (recommended) so any context works; or host the check in a package that has `js-yaml` as an **explicit** dep. Never depend on transitive resolution.
**Warning signs:** `Cannot find module 'js-yaml'` only in the root-scripts CI job, passing locally where a sibling install leaked it.

### Pitfall 2: `check-architecture-guardrails.js` computes paths relative to `backend/` regardless of target root
**What goes wrong:** Allowlist entries and violation paths for `apps/dgfy-api` are expressed as `../apps/dgfy-api/...` because `relativePath = path.relative(backendRoot, absolutePath)` where `backendRoot` is hard-coded to the script's `../`.
**Why it happens:** The script was written for `backend/` and re-pointed at `apps/dgfy-api` via `ARCH_GUARDRAIL_MODULES_ROOT`, but the relative-path base never moved.
**How to avoid:** When extending the guardrail for compat rules, keep the same `../apps/...` prefix convention in any new allowlist, or refactor `backendRoot` to derive from the modules root. Document whichever you choose.
**Warning signs:** Allowlist entries silently not matching; violations reported with unexpected `../` prefixes. `[VERIFIED: architectureGuardrailsAllowlist.js header comment]`

### Pitfall 3: The `entities/` layer is currently unscanned
**What goes wrong:** D-05b says the domain layer is `entities|usecases`, but the guardrail only scans `usecases/` for imports. A compat import inside `entities/` passes today.
**Why it happens:** Phase 4's guardrail predates the `entities/` convention being load-bearing.
**How to avoid:** Add an explicit `entities/` scan (guardrail script) AND an ESLint `no-restricted-imports` block covering `src/modules/**/entities/**`. Belt-and-suspenders matches the repo's existing dual guardrail+eslint approach.
**Warning signs:** A test seam importable from an entity file with a green build. `[VERIFIED: entities dirs exist in accounts/ and businesses/ modules]`

### Pitfall 4: Generated inventory doc vs `lint-docs` governance
**What goes wrong:** If `COMPATIBILITY_INVENTORY.md` is added to `document-registry.json`, `lint-docs.js` demands `status/authority_level/owner/last_reviewed/applies_to/topic` front matter and valid links on every regeneration — a generated file now fails CI on a missing key.
**Why it happens:** `lint-docs.js` governs only registry-listed docs, with strict front-matter rules.
**How to avoid:** Either (a) have the generator emit the full front matter deterministically and register it, or (b) leave it unregistered (manifest remains the governed source of truth; the `.md` is a convenience render). Decide explicitly.
**Warning signs:** `[docs-lint] FAILED ... missing front matter key` after regeneration. `[VERIFIED: lint-docs.js lines 165-234, document-registry.json required_frontmatter]`

### Pitfall 5: `git status` shows `refactor-do-not-commit/` — do not include it
**What goes wrong:** Accidentally staging the untracked `refactor-do-not-commit/` scratch dir.
**How to avoid:** Scope commits to the specific new/edited files. `[VERIFIED: git status]`

## Code Examples

### Manifest entry shape (JSON fallback; YAML identical schema)
```json
// docs/architecture/compatibility-seams.json  — SOURCE OF TRUTH (D-03)
{
  "version": 1,
  "seams": [
    {
      "id": "db-continuity-legacy-backup",
      "type": "db-level",
      "status": "active",
      "rationale": "Non-destructively verifies the legacy backup's domain tables remain intact during/after the database-first cutover, proving CMP-01 while dgfy-api runs beside legacy.",
      "tests": ["apps/dgfy-migration-runner/tests/verifyContinuity.test.js"],
      "rollback": "Seam is read-only; disabling it has no data effect. Revert by removing the command and its manifest entry.",
      "removal_criteria": "Legacy backup decommissioned (future milestone, CUT-02)."
    }
  ]
}
```
> Suggested enums (planner discretion): `type ∈ {db-level, api-boundary, build-time, data-migration}`; `status ∈ {active, accepted, pending, removed}`. `tests` = array of repo-relative paths (so the CI gate can assert existence + run them).

### Reference seam skeleton (non-destructive, reuses runner primitives)
```javascript
// apps/dgfy-migration-runner/src/commands/verifyContinuity.js  (illustrative)
// Sources VERIFIED: config/env.js, config/db.js, reports/reportWriter.js
import { validateEnv } from '../config/env.js';
import { createSourceConnection } from '../config/db.js';
import { writeJsonReport } from '../reports/reportWriter.js';

export async function runVerifyContinuity(env = process.env) {
  const { valid, errors, config } = validateEnv(env);          // no DB touch
  if (!valid) return { ok: false, errors };
  const legacy = createSourceConnection(config);               // SOURCE_DB only
  try {
    const [tables] = await legacy.query('SHOW TABLES');        // read-only integrity probe
    const findings = /* compare against expected legacy domain set */ [];
    const payload = { generated_at: new Date().toISOString(), ok: findings.length === 0, findings };
    await writeJsonReport(config.reportDir, 'verify-continuity', payload);
    return payload;
  } finally { await legacy.close(); }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ADR-0003 request-time compatibility *facades* (legacy controllers call new use-cases) | Self-contained `apps/dgfy-api` with **no** runtime legacy coupling; continuity is **data-level only** | ADR 0032 (2026-07-06) + Phase 5 CONTEXT reframe | The only real "legacy touch" is the DB-continuity seam; no runtime adapter is built. ADR-0003's "facade" language predates this and applies to the legacy `backend/`, not `dgfy-api`. |
| Architecture compliance = manual review | Automated guardrail scripts + CI + pre-commit + allowlist-with-removal-plan | ADR 0004 (2026-03-06) | Phase 5 extends this proven harness rather than adding review ceremony. |

**Deprecated/outdated:**
- Reading the roadmap's "legacy stays live / adapter" language literally — superseded by the D-01/D-02 self-contained-API reframe. Treat "adapters, when needed" (SC3) as literal: none needed now.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `js-yaml` npm age/download figures (~13yr / ~90M wk) | Package Legitimacy Audit | Low — presence + version verified locally; figures are illustrative and gated behind human-verify if YAML is chosen. |
| A2 | Suggested `type`/`status` enum values and `tests`=path-array | Code Examples | Low — explicitly planner discretion per D-03; must only keep the six fields machine-validated. |
| A3 | The "legacy domain set" the reference seam verifies = the legacy backup's own tables (not `dgfy_*`) | Code Examples / CMP-01 | Medium — the exact domains/tables to reconcile are Claude's-discretion; planner must define them against the legacy backup contents and `dgfy_*` contracts. Getting the target wrong weakens CMP-01 evidence. |
| A4 | Phase 6 (CMP-04) consumes the manifest as machine-readable input (schema stability matters now) | Downstream | Low — stated in CONTEXT integration points and CMP-04 wording; confirmed directionally, not by reading a Phase 6 plan (none exists yet). |

## Open Questions (RESOLVED)

> All four resolved during planning (Phase 5 plans 05-01/05-02/05-03, commit 692446de) and uniformly adopted. Recorded here so the research artifact matches the decisions baked into the plans.

1. **Manifest format: JSON vs YAML (D-04).**
   - What we know: no direct YAML dep anywhere; `js-yaml` only transitive (root has none); the runner's existing manifests/reports are JSON.
   - What's unclear: whether YAML comment-friendliness outweighs adding/pinning a dependency.
   - Recommendation: **JSON fallback** (zero-dep, sanctioned by D-04). If YAML is kept, add `js-yaml@^4.1.0` as an explicit dep to the host package and gate that install behind human-verify.
   - **RESOLVED:** JSON fallback adopted — `docs/architecture/compatibility-seams.json`. No `js-yaml` added (no supply-chain checkpoint needed). All three plans use JSON.

2. **Where does the check live — root `scripts/` vs `backend/scripts/` vs the runner?**
   - What we know: root `scripts/*.js` are CJS with zero external deps (JSON-safe). `backend/scripts/*` are ESM with `js-yaml` available. `check:architecture` already orchestrates from root and delegates into `backend/scripts/`.
   - Recommendation: If JSON → put it in root `scripts/` (consistent with `check-compliance-impact.js`) and add a `check:compat-seams` root npm script + CI step. If YAML → host in `backend/scripts/` and invoke from root like `check:architecture:dgfy-api` does.
   - **RESOLVED:** Root `scripts/check-compat-seams.js` (CJS, zero-dep) + a `check:compat-seams` root npm script wired into CI and husky — consistent with `check-compliance-impact.js`.

3. **Is `COMPATIBILITY_INVENTORY.md` a governed doc?**
   - What we know: `lint-docs.js` only governs registry-listed docs, with strict front matter.
   - Recommendation: Leave it **unregistered** (manifest is the governed truth) OR make the generator emit full front matter. Add a drift check (regenerate → `git diff --exit-code`) so the doc can't rot.
   - **RESOLVED:** Left **unregistered** in `document-registry.json` (manifest is the governed source of truth) + a regenerate-drift check so the generated doc can't rot. Keeps `lint:docs` green (Pitfall 4).

4. **Does this framework need its own ADR?**
   - What we know: `ARCHITECTURE_GOVERNANCE.md` requires an ADR for any `cross-boundary` change, and lists automated guardrails explicitly.
   - Recommendation: Add a short ADR (e.g. `00NN-compatibility-seam-governance.md`) recording the manifest+gate+guardrail-extension decision and update `ARCHITECTURE_GOVERNANCE.md`'s "Guardrails (Automated)" list. Low cost, satisfies governance closure item 10.
   - **RESOLVED:** ADR **0035** (next free after 0034) assigned for the compatibility-seam governance decision, authored in plan 05-02.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All tooling | ✓ (CI pins) | 24 (CI), local per machine | — |
| `git` | Changed-file detection in the reconciliation gate | ✓ | repo present | — |
| ESLint | Domain-layer import ban (`apps/dgfy-api`) | ✓ | `^10.0.0` | Guardrail regex covers the same rule |
| `js-yaml` (direct) | Only if YAML manifest | ✗ (transitive only; root has none) | 4.3.0 (backend) / 3.15.0 (runner) | **JSON fallback (recommended)** |
| MySQL | Running the reference seam's DB tests against real `SOURCE_DB` | ✗ in this sandbox | — | Gate DB-touching tests behind a `RUN_*_INTEGRATION` env flag (established Phase 1–4 precedent — see STATE.md) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:**
- YAML parser → JSON fallback (zero-dep).
- Live MySQL → env-flag-gated integration tests (matches Phase 4 Wave 5 precedent; unit-test the pure/non-DB logic unconditionally).

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` (from `.planning/config.json`). Included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase adds no auth surface. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | Tooling/CI only. |
| V5 Input Validation | yes | The manifest and any `tests`-path references are parsed and used by CI. Validate schema strictly (reject unknown/missing fields); treat `tests` paths as repo-relative and **reject path traversal** (`..`, absolute paths) before `fs.existsSync`/execution — mirror `lint-docs.js`'s `isPathLikeChecklistRef`/resolve-and-check pattern. |
| V6 Cryptography | no | No secrets/crypto introduced. |
| V12 Files/Resources | yes | Reference seam reads DB and writes JSON reports; keep report writes within `config.reportDir`; never interpolate manifest-supplied strings into SQL. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Manifest `tests` path traversal / arbitrary-file execution by CI | Tampering / Elevation | Whitelist path shape (repo-relative, no `..`, no absolute), resolve within repo root, assert existence before use — reuse `lint-docs.js` path-safety pattern. |
| SQL injection via manifest/domain names in the reference seam | Tampering | Parameterize all queries; the runner already rejects `dgfy_`-prefixed/blank names in `createLegacyTenantSourceConnection` — follow the same defensive validation. |
| Destructive write to `SOURCE_DB` (legacy backup corrupted) | Tampering / DoS | Reference seam is **read-only**; any future write must pass `assertDestructiveAllowed()` (`--confirm-destructive`) — never bypass it. |
| Manifest secrets leakage into generated `.md` or reports | Information Disclosure | Manifest carries governance metadata only (no credentials); report payloads exclude raw DB rows (mirror Phase 3's report-field allowlisting in STATE.md). |
| Guardrail bypass by placing compat code in an unscanned dir (e.g. `entities/`) | Elevation | Scan `entities/` AND `usecases/`; belt-and-suspenders with ESLint `no-restricted-imports`. |

## Sources

### Primary (HIGH confidence — verified in-repo this session)
- `docs/architecture/adr/0004-architecture-compliance-automation.md`, `0003-migration-facade-strategy.md`, `0032-standalone-dgfy-api-service.md`
- `backend/scripts/check-architecture-guardrails.js`, `backend/scripts/check-controller-boundaries.js`
- `apps/dgfy-api/eslint.config.mjs`, `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`, dgfy-api module tree (`entities/`, `usecases/` confirmed)
- `.github/workflows/ci.yml` (test-backend + test-dgfy-api jobs, Node 24), `.husky/pre-commit`, `pr-dgfy-api-build-checks.yml`
- root `package.json` (`check:architecture`, `check:architecture:dgfy-api`, `check:compliance`, `lint:docs` scripts + minimal root deps)
- `scripts/check-compliance-impact.js`, `scripts/lint-docs.js`, `docs/_meta/document-registry.json`
- `apps/dgfy-migration-runner/`: `package.json`, `src/config/env.js`, `src/config/db.js`, `src/reports/reportWriter.js`, `src/safety/destructiveGate.js`, `src/schemaContracts/dgfyCoreContract.js`, `src/data/mappings.js`, source tree
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `js-yaml` version confirmation via direct `require(...).version` (backend 4.3.0, runner 3.15.0); root `node_modules` inspection
- `.planning/config.json` (nyquist_validation:false; security_enforcement:true, ASVS L1)

### Secondary (MEDIUM confidence)
- STATE.md Phase 1–4 decision log (integration-test env-flag gating precedent; report-field allowlisting)

### Tertiary (LOW confidence)
- `js-yaml` registry age/download figures — [ASSUMED], not re-verified against live npm this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nearly all built-in/already-present; verified by file inspection.
- Architecture: HIGH — extension points, CI wiring, and reference-seam primitives read directly.
- Pitfalls: HIGH — each derived from a verified code fact (root deps, backendRoot path base, unscanned `entities/`, lint-docs governance).
- Manifest-format decision: HIGH on the facts (dep availability), decision is planner/user's per D-04.

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (stable internal tooling; re-verify only if lockfiles or CI workflows change)
