# DGFY System Mapping Baseline Proposal

## Metadata

- title: DGFY system mapping baseline proposal
- status: draft
- owner: Collaborators
- created: 2026-07-16
- last updated: 2026-07-21
- related code areas: `backend/`, `apps/`, `frontend/`, `packages/`, `scripts/`
- related docs or dependencies: `docs/START_HERE.md`, `docs/README.md`,
  `docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`,
  `docs/architecture/adr/0001-modular-monolith-boundaries.md`

## Purpose and Authority

This is a source-backed orientation map for evaluating the proposed planning
workspace. It is not canonical and must not replace `docs/START_HERE.md`, the
authoritative architecture documents, accepted ADRs, or governed domain docs.

## Repository Shape

DGFY is a JavaScript/Node multi-application platform, not a Laravel/Inertia
application. Its principal source boundaries are:

- `backend/` — Express and Sequelize modular-monolith backend
- `backend/src/modules/<domain>/` — preferred home for domain modules
- `backend/src/controllers/` and `backend/src/services/` — legacy compatibility
  facades during migration
- `apps/dgfy-api/` — standalone DGFY API service with architecture guardrails
- `apps/` — standalone services, runners, and application-owned boundaries
- `frontend/` — Vite/React workspace
- `frontend/apps/skupervisor/` — tenant and administrative workflows
- `frontend/apps/pos/` — POS terminal and operations
- `frontend/apps/store/` — public storefront and customer workflows
- `packages/` — shared internal packages
- `scripts/` — repository automation and governance checks

Generated build output is not source and must not be used to infer ownership.

## Backend Boundary

The authoritative target flow is:

`routes -> controllers -> usecases -> repositories -> models`

Controllers are transport-only, use cases own business behavior, repositories
own persistence access, and direct controller-to-model imports are blocked
except for tracked legacy allowances. New backend code belongs in the relevant
module unless an accepted ADR defines another application boundary.

## Documentation Boundary

Use the existing governed locations:

- `docs/architecture/` — architecture rules and ADRs
- `docs/api/` — API contracts
- `docs/database/` — schema and data contracts
- `docs/features/` — implemented feature behavior
- `docs/compliance/` — compliance controls and evidence requirements
- `docs/ops/` — operational and release workflows
- `docs/testing/` — verification protocols
- `docs/reference/` — supporting operational references
- `docs/proposals/` — proposal and narrative material
- `docs/archive/` — historical, non-authoritative material
- `docs/_meta/` — governed-document registry and lint metadata

Documents in `docs/Radney Suggestions/` remain proposal material unless adopted
through architecture governance and registered appropriately.

## Planning Lookup Order

Before implementation planning, read:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. relevant ADRs under `docs/architecture/adr/`
5. applicable domain docs

Classify architecture impact and create or update an ADR for cross-boundary
changes. Do not rely on deprecated or archived documents for new decisions.

## Validation Surfaces

Validation is package- and change-specific. At minimum, planning should identify
the affected tests and the applicable repository gates, including:

- `npm run check:architecture` for architecture-sensitive changes
- `npm run lint:docs` when governed documentation changes
- affected backend, frontend, application, or package tests
- builds for every affected product surface
- compliance, security, release, or rendered-UI proof when required by the
  authoritative governance and domain contracts

This baseline must be refreshed whenever repository ownership or authoritative
architecture changes. Source observation alone must not override an accepted
ADR or authoritative document without documenting and resolving the conflict.
