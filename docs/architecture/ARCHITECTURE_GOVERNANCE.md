---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-03-06
applies_to: implementation_process
topic: architecture_governance
---

# Architecture Governance Playbook

## Goal
Keep every implementation aligned with the modular architecture and make drift fail fast in CI.

Target flow:

`routes -> controllers -> usecases -> repositories -> models`

## Ownership Model
1. Feature author owns design, implementation, and migration plan.
2. Reviewer enforces architecture checklist and evidence quality.
3. Tech lead approves any exception or temporary allowlist entry.

## Mandatory Process For Every Change
1. Classify the change:
- `no-architecture-impact`
- `within-existing-boundary`
- `cross-boundary`
2. Read planning docs in mandatory order:
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- relevant ADRs
3. If `cross-boundary`, create or update an ADR in `docs/architecture/adr/`.
4. Implement with module boundaries first; use legacy facades only for compatibility.
5. Provide proof in PR:
- `npm run check:architecture` output
- `npm run lint:docs` output (if docs changed)
- tests for changed behavior
- rollback notes for risky changes
6. Merge only when CI architecture gates pass.

## Guardrails (Automated)
1. `backend/scripts/check-architecture-guardrails.js`
- validates module structure (`index.js`, `README.md`)
- blocks non-repository model imports, except explicit allowlist entries
- blocks use-case imports from legacy services
- enforces module controller naming (`*Handlers.js`)
2. `backend/scripts/check-controller-boundaries.js`
- blocks direct model import in controllers
3. `.github/workflows/ci.yml`
- executes architecture checks before backend test suite
4. `.husky/pre-commit`
- runs architecture checks when architecture-sensitive files are staged
5. `scripts/lint-docs.js`
- validates governed docs metadata, authority conflicts, and internal links
6. `AGENTS.md`
- enforces mandatory documentation lookup order for AI agents

## Exception Policy
1. Add temporary exception in:
- `backend/src/config/architectureModelImportAllowlist.js`, or
- `backend/src/config/controllerModelImportAllowlist.js`
- `backend/src/config/architectureGuardrailsAllowlist.js`
2. Every exception must include:
- linked task ID
- planned removal phase/date
3. Exception without ADR + removal plan is non-compliant.

## Release Readiness Gates
1. Architecture gates pass in CI.
2. No new untracked exception entries.
3. Telemetry and logging updated for new user-facing behavior.
4. Rollback path documented for irreversible migrations.

## Audit Cadence
1. Per-PR: architecture checklist in PR template.
2. Weekly: remove stale allowlist entries.
3. Monthly: sample architecture integrity audit against production branch.
