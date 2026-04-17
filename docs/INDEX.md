---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-04-13
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
- POS/storefront source separation contract is maintained in `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md` with validation evidence in `docs/testing/pos-readiness-status.md`.
- MSME workflow-mode and simplification behavior are governed by ADR 0008 and current feature/testing docs.
- Compliance governance, classification floors, and PH regulatory mapping are under `docs/compliance`.
- Compliance evidence and submission packet are under `docs/compliance/evidence/` and `docs/compliance/submission/`.
- Compliance Final Review documentary requirements are tenant self-serve in Settings > Compliance (backend stores tenant records; submission docs remain internal reference).
- Compliance activation readiness browser E2E and startup regression guardrails are under `docs/testing/README.md`.
- Historical compliance remediation packets are archived under `docs/archive/compliance/2026-04-07`.
- Historical exploratory testing packets are archived under `docs/archive/testing/`.
- Historical SKU expansion/storefront planning snapshots are archived under `docs/archive/reference/2026-03/`.
- Architecture and planning authority remain under `docs/architecture` and `docs/START_HERE.md`.

## Current Repository Notes
- Build artifacts are generated into `dist-apps/` and `frontend/dist/` and should be treated as disposable outputs.
- Deployment state metadata is kept in `.deploy-state/` and is used by `scripts/deploy.sh`.
- Historical/non-governed root docs are supplemental only; governed sources are under `docs/`.
