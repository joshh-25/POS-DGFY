---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-04-02
applies_to: all_documentation_users
topic: docs_hub
---

# Documentation Hub

Start here for all planning and implementation work:

- `docs/START_HERE.md`

## High-Value Sections
- `docs/architecture`: architecture boundaries, governance, ADRs
- `docs/api`: API specs and integration guides
- `docs/compliance`: compliance guide, control matrix, preflight workflow, ops cadence
  - includes classification floor matrix (`docs/compliance/compliance-classification-matrix.md`)
- `docs/database`: schema contracts
- `docs/development`: environment setup and workflow docs
- `docs/features`: feature behavior docs
- `docs/setup`: operational setup steps
- `docs/testing`: verification and audit protocols
- `docs/reference`: supporting plans, checklists, and quick references

## Current Product Surfaces
- `frontend/apps/skupervisor`: tenant/admin IMS workflows
- `frontend/apps/pos`: POS terminal and operations
- `frontend/apps/store`: public storefront, quote, checkout, and tracking

## Repository Structure Snapshot
- `backend/`: Express + Sequelize modular-monolith backend
- `frontend/`: multi-surface Vite workspace (legacy and `apps/*` surfaces coexist during migration)
- `packages/`: shared/internal packages used by app surfaces
- `scripts/`: repo-level automation and governance scripts
- `dist-apps/`, `frontend/dist/`: generated build output (non-source)

## Documentation Scope
- Governed implementation and architecture docs live under `docs/`.
- Root-level operational docs (for example `SETUP.md`, `QUICK_START.md`, `TROUBLESHOOTING.md`) remain as supplemental reference while migration continues.
- `docs/archive/` is historical only and is non-authoritative for new planning.

## Rules
1. Use authoritative docs first.
2. Do not use deprecated docs for new design decisions.
3. Update docs in the same PR when code behavior changes.
