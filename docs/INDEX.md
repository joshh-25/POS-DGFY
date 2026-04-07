---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-04-02
applies_to: docs_navigation
topic: docs_index
---

# Documentation Index

Canonical planning entry:
- `docs/START_HERE.md`

## Sections
- `docs/architecture`
- `docs/api`
- `docs/compliance`
- `docs/database`
- `docs/development`
- `docs/deployment`
- `docs/features`
- `docs/generated`
- `docs/guides`
- `docs/images`
- `docs/ops`
- `docs/setup`
- `docs/reference`
- `docs/templates`
- `docs/testing`
- `docs/proposals`
- `docs/_meta`
- `docs/archive`

## Current Focus Areas
- Storefront and tenant-location rollout docs are primarily under `docs/api`, `docs/testing`, and `docs/reference`.
- POS hardening and terminal operations evidence are primarily under `docs/testing`.
- Compliance governance and PH regulatory mapping are under `docs/compliance`.
- Architecture and planning authority remain under `docs/architecture` and `docs/START_HERE.md`.

## Current Repository Notes
- Build artifacts are generated into `dist-apps/` and `frontend/dist/` and should be treated as disposable outputs.
- Deployment state metadata is kept in `.deploy-state/` and is used by `scripts/deploy.sh`.
- Historical/non-governed root docs are supplemental only; governed sources are under `docs/`.
