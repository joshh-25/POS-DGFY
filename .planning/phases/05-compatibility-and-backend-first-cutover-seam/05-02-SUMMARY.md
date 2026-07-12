---
phase: 05-compatibility-and-backend-first-cutover-seam
plan: 02
subsystem: infra
tags: [architecture-guardrail, eslint, ci-guardrail, husky, adr, governance]

# Dependency graph
requires:
  - "scripts/check-compat-seams.js and npm run check:compat-seams (Plan 01)"
provides:
  - "domainCompatLeak violation bucket + COMPAT_IMPORT_PATTERN in backend/scripts/check-architecture-guardrails.js"
  - "entities/ scan in the architecture guardrail (previously unscanned)"
  - "ARCHITECTURE_COMPAT_IMPORT_ALLOWLIST export in apps/dgfy-api's allowlist"
  - "eslint no-restricted-imports block banning continuity/compat imports in modules entities/usecases"
  - "npm run check:compat-seams wired into .github/workflows/ci.yml (test-backend job) and .husky/pre-commit (--staged, conditional)"
  - "docs/architecture/adr/0035-compatibility-seam-governance.md"
affects: [05-03-reference-seam, phase-06-cmp-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extended an existing file-walking guardrail in place (D-05) instead of forking a second checker — added a sibling regex constant, a new violations bucket, and mirrored the existing usecases collect+scan block for entities/"
    - "Belt-and-suspenders enforcement: the same import ban is enforced by both a Node guardrail script and a declarative ESLint no-restricted-imports rule, mirroring the existing controllers->models pattern"
    - "Acceptance-gate wiring trio: root npm script + CI step (working-directory: . override inside a job whose default cwd is a subpackage, mirroring the existing check:architecture:dgfy-api step) + conditional pre-commit hook block"

key-files:
  created:
    - backend/scripts/check-architecture-guardrails.compat.test.js
    - docs/architecture/adr/0035-compatibility-seam-governance.md
  modified:
    - backend/scripts/check-architecture-guardrails.js
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
    - apps/dgfy-api/eslint.config.mjs
    - .github/workflows/ci.yml
    - .husky/pre-commit
    - docs/architecture/ARCHITECTURE_GOVERNANCE.md

key-decisions:
  - "Refactored the existing usecaseLegacyServiceImports allowlist check from an early-return pattern to an inline && condition inside the usecases forEach loop, so the new compat-import check runs independently of whether the legacy-service-import check short-circuited on the same file (latent correctness fix, not a behavior change against the current empty allowlist)"
  - "Placed the new CI step inside the existing test-backend job (not a new job), using working-directory: . to override the job's ./backend default and invoke the root npm run check:compat-seams script, mirroring the exact pattern already used by test-dgfy-api's 'Enforce architecture guardrails' step"
  - "Pre-commit conditional trigger combines a file-path grep (manifest/check/generator scripts) with a content grep of the staged diff for the literal @compat-seam marker text, so a staged file introducing a new code marker anywhere in the repo (not just the three named surface files) also triggers the gate"

requirements-completed: [CMP-01, CMP-02, CMP-03]

coverage:
  - id: D1
    description: "The canonical dgfy-api domain layer (entities and usecases) cannot import compatibility/continuity code — enforced by both the guardrail script and an eslint no-restricted-imports rule"
    requirement: CMP-03
    verification:
      - kind: unit
        ref: "backend/scripts/check-architecture-guardrails.compat.test.js (3/3 passing: entities/ violation, usecases/ violation, clean tree)"
        status: pass
      - kind: other
        ref: "npm run check:architecture:dgfy-api (0 violations on real tree) && cd apps/dgfy-api && npx eslint src (0 errors, 10 pre-existing warnings)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The previously-unscanned entities/ layer is now scanned for forbidden imports, closing RESEARCH Pitfall 3"
    requirement: CMP-03
    verification:
      - kind: unit
        ref: "check-architecture-guardrails.compat.test.js#'flags a compat import inside an entities/ file (previously unscanned)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "CI and pre-commit both run check:compat-seams reading the same manifest, so a seam with an incomplete/missing manifest entry produces a red build"
    requirement: CMP-02
    verification:
      - kind: other
        ref: "npm run check:compat-seams && npm run check:compat-seams -- --staged (both PASS, exit 0)"
        status: pass
      - kind: other
        ref: "git diff .github/workflows/ci.yml .husky/pre-commit — additive-only, no existing step/hook removed or reordered; confirmed via js-yaml parse of ci.yml job step list"
        status: pass
    human_judgment: false
  - id: D4
    description: "A governance ADR records the manifest + acceptance gate + guardrail-extension decision, and the automated-guardrails list is updated"
    requirement: CMP-01
    verification:
      - kind: other
        ref: "npm run lint:docs (21 governed docs validated, ADR-0035 stays unregistered per ADR-0004 precedent)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-07-12
status: complete
---

# Phase 05 Plan 02: Compatibility Seam Guardrail Extension and CI Acceptance Gate Summary

**Extended the ADR-0004 architecture guardrail with a compat-import ban and an entities/ scan (closing the previously-unscanned domain-layer gap), mirrored it with an ESLint rule, wired the Plan 01 manifest validator into CI and pre-commit as the acceptance authority, and closed governance with ADR 0035**

## Performance

- **Duration:** ~11 min
- **Completed:** 2026-07-12
- **Tasks:** 3 completed
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Extended `backend/scripts/check-architecture-guardrails.js` **in place** (D-05, no forked checker): added `COMPAT_IMPORT_PATTERN` (a sibling to the existing `MODEL_IMPORT_PATTERN`), a new `domainCompatLeak` violations bucket that renders automatically through the existing `printViolations`, and an `entities/` collect+scan block mirroring the existing `usecases/` block — closing RESEARCH Pitfall 3 (the domain layer's `entities/` directory was previously never scanned for forbidden imports). The `usecases/` scan now also checks for compat imports.
- Extended `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` with a new `ARCHITECTURE_COMPAT_IMPORT_ALLOWLIST` export (empty by default — no domain-layer compat imports are permitted this phase), preserving the file's documented `../apps/dgfy-api/...` relative-path prefix convention (RESEARCH Pitfall 2).
- Added a sibling ESLint block to `apps/dgfy-api/eslint.config.mjs` (`no-restricted-imports` for `src/modules/**/entities/**` and `src/modules/**/usecases/**`), mirroring the existing controllers→models ban — the declarative, belt-and-suspenders half of D-05b.
- Added `backend/scripts/check-architecture-guardrails.compat.test.js` (`node:test`, 3 cases): builds throwaway fixture module trees in the OS temp dir, spawns the real guardrail script via `child_process.spawnSync` with `ARCH_GUARDRAIL_MODULES_ROOT` pointed at the fixture and `ARCH_GUARDRAIL_ALLOWLIST_PATH` pointed at the real `apps/dgfy-api` allowlist, and asserts non-zero exit for a compat import in `entities/`, non-zero exit for a compat import in `usecases/`, and zero exit for a clean tree.
- Wired `npm run check:compat-seams` into `.github/workflows/ci.yml`'s `test-backend` job as a new "Enforce compatibility-seam manifest gate" step (placed directly beside the existing "Enforce compliance impact declarations" step), and into `.husky/pre-commit` as a conditional block that runs `npm run check:compat-seams -- --staged` when staged files touch the compat-seam manifest/scripts or the staged diff contains an `@compat-seam` marker.
- Authored `docs/architecture/adr/0035-compatibility-seam-governance.md` mirroring ADR-0004's plain-markdown shape (no YAML front matter, left unregistered in `docs/_meta/document-registry.json` per RESEARCH Pitfall 4), recording the JSON-manifest decision (D-03/D-04), the mechanical CI/pre-commit acceptance gate (D-06), and the guardrail extension (D-05). Updated `ARCHITECTURE_GOVERNANCE.md`'s "Guardrails (Automated)" list and Exception Policy section with the new compat-import ban, `check-compat-seams.js`, and the `apps/dgfy-api` allowlist's compat exception list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the guardrail — compat-import ban + entities/ scan + eslint rule (D-05a/D-05b)** - `6bb932da` (feat)
2. **Task 2: Wire the acceptance gate into CI and pre-commit (D-05c/D-06)** - `0b2edaf8` (feat)
3. **Task 3: Governance closure — ADR 0035 + automated-guardrails list update** - `3ed66b28` (docs)

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified

- `backend/scripts/check-architecture-guardrails.js` - New `COMPAT_IMPORT_PATTERN`, `domainCompatLeak` violation bucket, `entities/` scan block, compat check added to the existing `usecases/` scan, `compatImport` allowlist wired into `readBoundaryAllowlist`
- `backend/scripts/check-architecture-guardrails.compat.test.js` - New `node:test` suite (3 cases) proving the guardrail flags compat imports in `entities/` and `usecases/`, and passes a clean tree
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - New (empty) `ARCHITECTURE_COMPAT_IMPORT_ALLOWLIST` export
- `apps/dgfy-api/eslint.config.mjs` - New sibling `no-restricted-imports` block for `src/modules/**/entities/**` and `src/modules/**/usecases/**`
- `.github/workflows/ci.yml` - New "Enforce compatibility-seam manifest gate" step in the `test-backend` job
- `.husky/pre-commit` - New conditional block running `check:compat-seams -- --staged` on compat-surface or marker-diff staged changes
- `docs/architecture/adr/0035-compatibility-seam-governance.md` - New governance ADR (unregistered, ADR-0004 shape)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` - Updated "Guardrails (Automated)" list and Exception Policy section

## Decisions Made

- Refactored the pre-existing `usecaseLegacyServiceImports` allowlist check from an early-`return` pattern inside the `usecases.forEach` callback to an inline `&&` condition. The original code did `if (hasPattern(...)) { if (allowlisted) return; violations.push(...) }` — the `return` would have silently skipped the new compat-import check on the same file iteration if a file both matched the legacy-service pattern and was allowlisted. Since the allowlist is currently empty (`ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST = []`), this had no observable effect on the current tree, but it closes a latent correctness gap for when that allowlist gains entries.
- Placed the new CI acceptance-gate step inside the existing `test-backend` job rather than a new job, using `working-directory: .` to override the job's `./backend` default and invoke the root-level `npm run check:compat-seams` — the exact same pattern the `test-dgfy-api` job already uses for its "Enforce architecture guardrails" step (`working-directory: .` + `npm run check:architecture:dgfy-api`). This avoided introducing an extra job (with its own checkout/setup-node/npm-install overhead) for a zero-dependency, Node-built-ins-only validator.
- The pre-commit conditional trigger combines a file-path grep (the three named compat surface files: manifest, validator, generator) with a content grep of `git diff --cached` for the literal `@compat-seam` marker text, so a staged change that introduces a marker in any other repo file (e.g. the future `verifyContinuity.js` reference seam in Plan 03) also triggers the gate, not just changes to the three named files.
- ADR 0035 was assigned the next free number (0034 confirmed as the highest existing ADR before assignment) and follows ADR-0004's plain-markdown, unregistered shape exactly, per RESEARCH's resolved Open Question 4.

## Deviations from Plan

None — plan executed exactly as written. The early-return-to-inline-condition refactor noted above is a defensive correctness fix within Task 1's own explicit scope (extending the same forEach block to add a new check), not a deviation from any plan constraint.

## Issues Encountered

None. All three tasks' automated verify commands passed on first execution. The full plan-level `<verification>` block (compat guardrail test, `check:architecture:dgfy-api`, dgfy-api eslint, `check:compat-seams` in both modes, `lint:docs`) was re-run after all three tasks completed and passed cleanly, including a `js-yaml`-based structural parse of `ci.yml` confirming step placement and that no existing step was removed or reordered.

## User Setup Required

None - all changes are local tooling (Node script extension, ESLint config, CI/hook wiring, and a markdown ADR). No external service configuration required.

## Next Phase Readiness

- Plan 03 (the DB-level reference seam, `verifyContinuity.js` in `apps/dgfy-migration-runner`) can now add its first `@compat-seam id=db-continuity-legacy-backup` marker and manifest entry; `check:compat-seams` will require it to be complete (rationale/tests/rollback/removal_criteria all non-empty, referenced test paths existing) before CI or pre-commit will pass.
- The domain-layer guardrail (script + ESLint) is live and will flag any future compat/continuity import placed in `apps/dgfy-api/src/modules/*/entities/` or `*/usecases/`, including ones introduced by Plan 03's own reference-seam work if it were ever mistakenly wired into `dgfy-api` rather than the migration runner (it should not be — the reference seam lives in `apps/dgfy-migration-runner`, outside any `dgfy-api` domain layer).
- ADR 0035 and the updated `ARCHITECTURE_GOVERNANCE.md` guardrails list close the governance requirement for this framework; Phase 6 (CMP-04) can reference ADR-0035 directly when consuming the manifest for release-evidence gates.
- No blockers identified.

---
*Phase: 05-compatibility-and-backend-first-cutover-seam*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 3 task commit hashes (`6bb932da`, `0b2edaf8`, `3ed66b28`) confirmed present in git history.
