---
phase: 05-compatibility-and-backend-first-cutover-seam
plan: 01
subsystem: infra
tags: [ci-guardrail, governance, node-test, json-manifest, cjs]

# Dependency graph
requires: []
provides:
  - "docs/architecture/compatibility-seams.json manifest (version=1, empty seams scaffold)"
  - "scripts/check-compat-seams.js CI validator (schema + completeness + path-safety + bidirectional reconciliation, --staged mode)"
  - "scripts/generate-compat-inventory.js deterministic manifest-to-markdown generator"
  - "npm run check:compat-seams and npm run generate:compat-inventory root scripts"
  - "@compat-seam id=<id> code marker convention"
affects: [05-02-ci-acceptance-gate, 05-03-reference-seam, phase-06-cmp-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-dependency CJS validator composing two proven root-scripts/ analogs (check-compliance-impact.js git-diff/staged dual-mode + check-architecture-guardrails.js recursive file-walk/regex-marker scan)"
    - "Marker token built from string parts (never a single literal substring) so a self-scanning validator never matches its own source or test file"
    - "Options-object pure functions (runCheck(options, logger)) directly importable by node:test, mirroring check-regression-risk.js's testable-function convention"

key-files:
  created:
    - docs/architecture/compatibility-seams.json
    - scripts/check-compat-seams.js
    - scripts/check-compat-seams.test.js
    - scripts/generate-compat-inventory.js
    - docs/architecture/COMPATIBILITY_INVENTORY.md
  modified:
    - package.json

key-decisions:
  - "Added a COMPAT_SEAMS_REPO_ROOT env override (mirroring the plan-mandated COMPAT_SEAMS_MANIFEST_PATH) so the code-marker scan and tests[] path-safety resolution root are also test-isolatable, not just the manifest path"
  - "Marker token (@compat-seam id=) is built from joined string-array parts in both check-compat-seams.js and its test file, not a single literal substring, so a full-repo npm run check:compat-seams run never self-matches its own validator or test source"
  - "Orphan-entry check (active/accepted manifest seam with no matching code marker) is skipped in --staged mode since only a partial (staged) file set is visible; runs fully in default CI mode"

patterns-established:
  - "Collect-failures-then-return validator idiom: pure functions push human-readable failure strings into an array; runCheck() aggregates and the CLI main() only calls process.exit(1) at the top level"

requirements-completed: [CMP-02]

coverage:
  - id: D1
    description: "Machine-readable compatibility-seams.json manifest exists as the single source of truth with a validated schema (six D-03 governance fields + id/type/status enums)"
    requirement: CMP-02
    verification:
      - kind: unit
        ref: "scripts/check-compat-seams.test.js#rejects an unknown type or status enum value"
        status: pass
      - kind: unit
        ref: "node -e manifest scaffold parse check (Task 1 verify command)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI-runnable validator rejects any seam whose governance fields are empty or whose test paths are missing/unsafe, and enforces bidirectional code<->manifest reconciliation"
    requirement: CMP-02
    verification:
      - kind: unit
        ref: "scripts/check-compat-seams.test.js (12/12 passing, covers all 8 plan behavior cases)"
        status: pass
      - kind: other
        ref: "npm run check:compat-seams (exits 0 against empty scaffold)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generator deterministically renders the manifest into a human-readable inventory doc; drift check proves the doc matches the manifest"
    requirement: CMP-02
    verification:
      - kind: other
        ref: "node scripts/generate-compat-inventory.js && git diff --exit-code docs/architecture/COMPATIBILITY_INVENTORY.md"
        status: pass
      - kind: other
        ref: "npm run lint:docs"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-12
status: complete
---

# Phase 05 Plan 01: Compatibility Seam Manifest and Validator Summary

**Zero-dependency JSON manifest + CJS validator (schema, completeness, path-safety, bidirectional code<->manifest reconciliation) + deterministic markdown generator for CMP-02 compatibility-seam governance**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-12T03:59:41Z (approx, per STATE.md session start)
- **Completed:** 2026-07-12T04:07:48Z
- **Tasks:** 3 completed (Task 2 followed full TDD RED->GREEN)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- Created `docs/architecture/compatibility-seams.json` as the hand-authored source of truth: `version: 1`, empty `seams: []` scaffold ready for Plan 03's reference-seam entry.
- Built `scripts/check-compat-seams.js`, a zero-dependency CJS validator that (1) strictly schema-validates the manifest (unknown-key rejection, kebab-case unique `id`, `type`/`status` enums), (2) gates completeness for `active`/`accepted` seams (non-empty `rationale`/`rollback`/`removal_criteria`, non-empty `tests` array), (3) rejects path-traversal/absolute `tests` paths *before* any filesystem access and then checks existence, and (4) bidirectionally reconciles `@compat-seam id=<id>` code markers against manifest entries — both "marker without complete entry" and "active/accepted entry without marker" (orphan) fail the build. Supports `--staged` (pre-commit, `git diff --cached --name-only`) and default full-tree CI mode.
- Wrote `scripts/check-compat-seams.test.js` with 12 `node:test` cases covering all 8 behavior cases from the plan (empty-manifest pass, per-field completeness failures, `..`/absolute path rejection, missing test-file rejection, unknown enums, marker-without-entry, entry-without-marker, pending/removed exemption, `--staged` scope restriction). All 12 pass.
- Built `scripts/generate-compat-inventory.js`, a deterministic manifest-to-markdown generator producing `docs/architecture/COMPATIBILITY_INVENTORY.md` (a GENERATED-file banner, then a table or a `_(none registered yet)_` placeholder when empty). Regenerate -> `git diff --exit-code` proves zero drift. The doc is intentionally left unregistered in `docs/_meta/document-registry.json` so `lint:docs` stays green without a new front-matter requirement.
- Wired `check:compat-seams` and `generate:compat-inventory` into root `package.json`. No new npm dependency was introduced (confirmed no `js-yaml` or other package added).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the compatibility-seams JSON manifest scaffold** - `b01a5d9a` (feat)
2. **Task 2 (RED): Add failing tests for the validator** - `859a170e` (test)
2. **Task 2 (GREEN): Implement check-compat-seams.js validator, wire npm scripts** - `ed521545` (feat)
3. **Task 3: Add generate-compat-inventory.js and generated inventory doc** - `a7402570` (feat)

_Task 2 followed the full TDD RED -> GREEN cycle: the implementation file was moved aside, the test suite was run and confirmed to fail with `MODULE_NOT_FOUND` (RED, commit `859a170e`), then the implementation was restored and all 12 tests passed unmodified on the first run (GREEN, commit `ed521545`). No REFACTOR commit was needed._

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified
- `docs/architecture/compatibility-seams.json` - Hand-authored manifest source of truth (`version: 1`, `seams: []`)
- `scripts/check-compat-seams.js` - CI validator: schema, completeness, path-safety, bidirectional reconciliation, `--staged` mode
- `scripts/check-compat-seams.test.js` - 12-case `node:test` suite covering every plan behavior case
- `scripts/generate-compat-inventory.js` - Deterministic manifest -> `COMPATIBILITY_INVENTORY.md` generator
- `docs/architecture/COMPATIBILITY_INVENTORY.md` - Generated inventory doc (currently `_(none registered yet)_`)
- `package.json` - Added `check:compat-seams` and `generate:compat-inventory` scripts

## Decisions Made
- Added a `COMPAT_SEAMS_REPO_ROOT` env override (not explicitly named in the plan, which only mandated `COMPAT_SEAMS_MANIFEST_PATH`) so both the code-marker scan root and the `tests[]` path-safety resolution root can be redirected to a temp fixture directory in tests, symmetric with the manifest override. Without it, unit tests for reconciliation and path-safety would have had to mutate the real repository tree.
- The `@compat-seam id=` marker token is constructed from joined string-array parts (`['@compat', '-seam'].join('')` etc.) in both `check-compat-seams.js` and `check-compat-seams.test.js`, rather than appearing as a single literal substring anywhere in either file. This was required per the plan's explicit warning: a literal marker string in the production script or its test file would cause the real, full-repo `npm run check:compat-seams` run to self-match its own source as a phantom orphan marker.
- Orphan-entry reconciliation (an `active`/`accepted` manifest seam with no matching code marker anywhere) only runs in default (full-tree) mode; it is skipped under `--staged`, since a staged-files-only view cannot prove a marker's absence across the whole repository. Marker-to-entry validation (a marker with no complete manifest entry) still runs fully in both modes.
- Kept `scripts/generate-compat-inventory.js` synchronous/CJS (`fs.readFileSync`/`writeFileSync`) rather than mirroring `reportWriter.js`'s async `fs/promises` API, since this generator is a one-shot CLI script with no concurrent I/O to overlap — matches the sync style of its closer analog, `lint-docs.js`.

## Deviations from Plan

None — plan executed exactly as written. The `COMPAT_SEAMS_REPO_ROOT` env override noted above is an additive testability mechanism within Task 2's own scope (the plan mandated `COMPAT_SEAMS_MANIFEST_PATH` for the same purpose), not a deviation from any stated constraint.

## Issues Encountered

None. All three tasks' automated verify commands passed on first execution once the implementation was written; the RED phase of Task 2 was intentionally engineered (implementation temporarily moved aside) to prove the TDD gate honestly rather than skipped.

## User Setup Required

None - no external service configuration required. This plan is entirely local tooling (Node scripts, no new dependency, no network/service integration).

## Next Phase Readiness

- Plan 02 (CI acceptance gate) and Plan 03 (reference seam) can now invoke `npm run check:compat-seams` and `npm run generate:compat-inventory` directly — the exact same validator and generator built here, with no forking.
- The manifest schema (`id`/`type`/`status` enums, six D-03 governance fields) is stable and machine-parseable; Phase 6 (CMP-04) can consume it as-is.
- The manifest is still an empty scaffold — Plan 03 is responsible for adding the first (reference, `db-continuity-legacy-backup`) seam entry per D-02, at which point `check:compat-seams` will require a matching `@compat-seam id=db-continuity-legacy-backup` code marker to pass.
- No blockers identified.

---
*Phase: 05-compatibility-and-backend-first-cutover-seam*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 6 created/output files confirmed present on disk; all 4 task commit hashes (`b01a5d9a`, `859a170e`, `ed521545`, `a7402570`) confirmed present in git history.
