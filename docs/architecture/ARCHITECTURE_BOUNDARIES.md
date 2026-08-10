---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-03-06
applies_to: dgfy_api_layer
topic: architecture_boundaries
---

# Architecture Boundaries (Phase 1 Guardrails)

## Objective
Keep API behavior stable while migrating toward a modular monolith:

`routes -> controllers -> usecases -> repositories -> models`

Canonical planning entry is `docs/START_HERE.md`.

## Rules
1. Controllers are transport-only.
2. Controllers must not import Sequelize models directly.
3. Business logic belongs in use-cases.
4. Data access belongs in repositories.
5. Legacy `src/controllers` and `src/services` are compatibility facades during migration.

## Enforcement
1. ESLint rule blocks direct model imports in controllers (legacy allowlist excluded).
2. Script gate: `npm run check:controller-boundaries`.
3. Script gate: `npm run check:architecture-guardrails`.
4. CI must run:
- dgfy-api tests
- open handle diagnostics
- index audit
- architecture guardrail check
- controller boundary check
- frontend tests and build

## Temporary Allowlist
Current model-importing legacy controllers are tracked in:

- `apps/dgfy-api/src/config/controllerModelImportAllowlist.js`

Entries are temporary and must be reduced each migration phase.

Non-repository model-import exceptions inside modules are tracked in:

- `apps/dgfy-api/src/config/architectureModelImportAllowlist.js`

Temporary naming/usecase transition exceptions are tracked in:

- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`

Architecture process and review requirements are defined in:

- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
