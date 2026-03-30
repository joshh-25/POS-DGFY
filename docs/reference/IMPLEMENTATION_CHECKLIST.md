---
status: reference
authority_level: reference
owner: ai_platform
last_reviewed: 2026-03-30
applies_to: implementation_tracking
topic: implementation_checklist
---

# Implementation Checklist (Current)

This checklist replaces legacy session-by-session notes and tracks the current baseline expected for active development.

## 1) Architecture and Governance

1. Read `docs/START_HERE.md`, boundaries, governance, and relevant ADRs.
2. Keep flow: `routes -> controllers -> usecases -> repositories -> models`.
3. Run architecture checks before handoff:
- `npm run check:architecture`

## 2) POS + Inventory Current Baseline

1. Folder chips are toggle filters in Inventory and POS.
2. Folder POS visibility uses `show_in_pos_filter` (chip visibility only).
3. Item POS sellability uses item-level `pos_visible` policy:
- override row present => explicit `pos_visible`
- no override row =>
  - finished goods visible by default
  - non-finished categories hidden by default until enabled
4. POS override/image write actions require `items:edit`.
5. Terminal opening float defaults to configured petty cash when field is empty/zero-like and no shift is open.

## 3) Documentation Sync Required

1. Update `docs/api/specification.md` when endpoint contract/permission changes.
2. Update `docs/database/schema.md` when data behavior defaults change.
3. Update relevant feature docs (for example `docs/features/INVENTORY_FOLDERS.md`) for UX/behavior changes.
4. Run docs validation:
- `npm run lint:docs`

## 4) Verification Gates

1. Backend targeted tests for changed modules.
2. Frontend build:
- `npm --prefix frontend run build`
3. If architecture-sensitive files changed, include architecture check output.

## 5) Cleanup Rule

1. Remove deprecated duplicate files only when a superseding source exists.
2. Update `docs/_meta/document-registry.json` when governed doc paths are removed/renamed.
3. Do not delete historical records needed for audit trails.
