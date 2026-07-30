---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-12
last_reviewed: 2026-07-12
review_by: 2027-01-12
applies_to: architecture_decision
topic: compatibility_seam_governance
---

# ADR 0035: Compatibility-Seam Governance

## Status
Accepted (2026-07-12)

## Context
Phase 5 (compatibility-and-backend-first-cutover-seam) requires that every legacy touch made
while the new `dgfy_*` foundation runs beside legacy `backend/` be documented with rationale,
tests, rollback notes, and removal criteria before it is accepted (CMP-02), that acceptance be
mechanical rather than reviewer-discretionary (CMP-02/D-06), and that compatibility/continuity
code never enter the canonical DGFY domain contracts (CMP-03). ADR-0004 already established an
architecture-compliance automation baseline (guardrail script + CI + pre-commit + allowlist), but
it neither tracked compatibility seams as a governed inventory nor scanned the `entities/` layer
for forbidden imports.

A YAML manifest was the CONTEXT-locked default (D-04), but no package in the repo declares a YAML
parser as a direct dependency — `js-yaml` exists only transitively in `backend/`, `apps/dgfy-api/`,
and `apps/dgfy-migration-runner/` node_modules, and is entirely absent from the repo-root
`node_modules` where the new validator needed to run without a supply-chain checkpoint. The
CONTEXT-sanctioned JSON fallback avoided adding any new dependency.

## Decision

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

1. **JSON manifest as the single source of truth (D-03/D-04).** `docs/architecture/compatibility-seams.json`
   holds `version` + a `seams[]` array; each seam carries `id`, `type`, `status`, `rationale`,
   `tests`, `rollback`, and `removal_criteria`. The JSON fallback was adopted over YAML because no
   package in the repo declares a YAML parser as a direct dependency (only transitive copies exist
   in `backend/`, `apps/dgfy-api/`, and `apps/dgfy-migration-runner/`), and JSON requires zero new
   dependencies while matching the runner's existing JSON manifest/report conventions
   (`scripts/check-compat-seams.js`, `scripts/generate-compat-inventory.js`). `[binding]`
2. **Mechanical CI acceptance gate (D-06).** `scripts/check-compat-seams.js` validates manifest
   schema, gates completeness for `active`/`accepted` seams, checks `tests` path-safety, and
   bidirectionally reconciles in-code `@compat-seam id=<id>` markers against manifest entries. The
   same script runs in both CI (`.github/workflows/ci.yml`, `test-backend` job, "Enforce
   compatibility-seam manifest gate" step) and `.husky/pre-commit` (`--staged` mode) — one
   validator, one manifest, no drift between local and CI enforcement. A code-level seam with no
   complete, matching manifest entry fails the build; an `active`/`accepted` manifest entry with no
   matching code marker also fails the build (in full-tree/CI mode). `[binding]`
3. **Guardrail extension confining compatibility/continuity code out of the domain layer (D-05).**
   `backend/scripts/check-architecture-guardrails.js` was extended in place — not forked — with a
   `COMPAT_IMPORT_PATTERN` and a new `domainCompatLeak` violation bucket. The guardrail previously
   scanned only `usecases/` for forbidden imports; a compat/continuity import placed in `entities/`
   would have passed undetected. The extension adds an `entities/` scan alongside the existing
   `usecases/` scan, so both domain-layer directories are covered. A sibling ESLint
   `no-restricted-imports` block in `apps/dgfy-api/eslint.config.mjs` bans the same import groups
   declaratively, mirroring the existing controllers→models ban. `[binding]`

## Consequences
1. Every compatibility/continuity seam has a single, machine-validated governance record; Phase 6
   (CMP-04) can consume the manifest directly for release-evidence gates without a new schema.
2. Acceptance is enforced identically in CI and pre-commit — a developer cannot land a code-level
   seam without a complete manifest entry, and cannot leave a stale manifest entry with no
   corresponding code.
3. The dgfy-api domain layer (`entities/` and `usecases/`) is guarded against compat/continuity
   imports by two independent mechanisms (guardrail script + ESLint), closing the previously-open
   `entities/` scanning gap.
4. No new npm dependency was introduced; the manifest, validator, and inventory generator are all
   zero-dependency Node built-ins.
5. Sibling artifacts this decision governs: `docs/architecture/compatibility-seams.json` (manifest),
   `scripts/check-compat-seams.js` (validator), `scripts/generate-compat-inventory.js` (generated
   inventory doc), and `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` (the reference
   DB-continuity seam, D-02) once landed.
