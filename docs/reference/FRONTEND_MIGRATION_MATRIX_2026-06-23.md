---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-06-23
applies_to: frontend_pos_ims_storefront
topic: frontend_migration_matrix
---

# Frontend Migration Matrix

This document maps the current frontend ownership split across:

- `frontend/apps/*` app shells
- `frontend/src/features/*` shared feature code
- legacy shared folders such as `frontend/Pages` and `frontend/Components`

It is intended to answer one question clearly:

What can be migrated safely from the older frontend structure into the newer app-shell structure, and what still conflicts?

## Current Model

The repo is already partially migrated.

Current practical ownership:

- `frontend/apps/pos`
  - thin POS app shell
  - still owns a few POS shell components
- `frontend/apps/skupervisor`
  - thin IMS app shell
  - almost all real IMS behavior still comes from shared frontend folders
- `frontend/apps/store`
  - most self-contained app surface
  - already owns much more of its own page/router/component structure
- `frontend/src/features/*`
  - shared feature/domain layer
  - contains most live POS behavior
  - contains modern domain slices for onboarding, settings, inventory, services, F&B, hospitality, sales
- `frontend/Pages` and `frontend/Components`
  - legacy shared app layer
  - still heavily used by IMS

## Main Finding

The migration is not blocked by missing code.

The migration is blocked by mixed ownership.

The biggest problem is not “old UI missing in new frontend”.
The biggest problem is:

- some POS files live in `apps/pos`
- some POS files live in `src/features/pos`
- IMS still depends on legacy `Pages` and `Components`
- Storefront is already more app-local than IMS or POS

So a blind “move all past folder contents into new frontend” would create duplicate ownership and break imports.

## Surface Summary

### POS

Current state:

- app bootstrap already lives in `frontend/apps/pos/src/app/PosApp.jsx`
- live POS page logic already lives in `frontend/src/features/pos/pages/TerminalPage.jsx`
- most live POS behavior already lives in `frontend/src/features/pos/components/*`
- POS shell/layout components now live in `frontend/src/features/pos/components/*`
- `frontend/apps/pos/src/components/*` keeps only app-shell-specific files plus thin compatibility wrappers where needed during transition

Resolved ownership cleanup:

- `frontend/src/features/pos/components/TerminalPageLayout.jsx`
  - real feature owner
- `frontend/src/features/pos/components/TerminalLockDrawer.jsx`
  - real feature owner
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
  - real feature owner

This means the POS shell ownership split is no longer the active blocker.

### SKUpervisor IMS

Current state:

- `frontend/apps/skupervisor/src/main.jsx` is a shell entry
- `frontend/apps/skupervisor/src/README.md` explicitly says shared domain logic remains under `frontend/src`
- IMS still depends heavily on:
  - `frontend/Pages/*`
  - `frontend/Components/*`
  - `frontend/src/main.jsx`

This means IMS is still mostly legacy/shared in structure, not feature-isolated at the app-shell level.

### Storefront

Current state:

- `frontend/apps/store/src/*` already contains:
  - app router
  - storefront pages
  - storefront components
  - checkout/auth/tracking services
  - styling
- Storefront is the most app-local surface today

This means Storefront needs the least migration work.

## Migration Matrix

| Area | Current Owner | Current State | Safe To Move Now | Target Owner | Conflict |
| --- | --- | --- | --- | --- | --- |
| POS app bootstrap | `frontend/apps/pos/src/app/PosApp.jsx` | Already correct | No move needed | Keep in `apps/pos` | None |
| POS route-not-found and POS-only app boot helpers | `frontend/apps/pos/src/components/*` | Shell-specific | Keep | `apps/pos` | None |
| POS live page logic | `frontend/src/features/pos/pages/TerminalPage.jsx` | Already shared/live | No move needed | Keep in `src/features/pos` | None |
| POS checkout/history/reports/workspace logic | `frontend/src/features/pos/components/*` | Already shared/live | No move needed | Keep in `src/features/pos` | None |
| POS shell layout components | `frontend/src/features/pos/components/TerminalPageLayout.jsx`, `TerminalLockDrawer.jsx`, `TerminalWorkspaceSidebar.jsx` | Feature-owned | Completed | Keep in `src/features/pos/components` | None |
| POS compatibility wrappers | `frontend/apps/pos/src/components/TerminalPageLayout.jsx`, `TerminalLockDrawer.jsx`, `TerminalWorkspaceSidebar.jsx` | Thin wrappers back to feature owner | Transitional | Remove when wrapper compatibility is no longer needed | Minor indirection only |
| IMS shell entry | `frontend/apps/skupervisor/src/main.jsx` | Thin shell only | No direct move needed | Keep in `apps/skupervisor` | None |
| IMS route/page modules | `frontend/src/main.jsx`, `frontend/Pages/*` | Still largely legacy | Not as one bulk move | Gradually move into `src/features/*` and `apps/skupervisor` composition | High import churn |
| Shared admin pages | `frontend/Pages/admin/*` | Legacy/global | Not bulk-safe | Classify per domain first | Admin flows cross multiple surfaces |
| Shared UI components | `frontend/Components/*` | Legacy/global | Not bulk-safe | Keep shared until classified | Used by IMS and shared shell |
| Storefront router/pages/components | `frontend/apps/store/src/*` | Already app-local | No broad move needed | Keep in `apps/store` | Low conflict |
| Shared onboarding | `frontend/src/features/onboarding/*` | Shared and current | No move needed | Keep in `src/features/onboarding` | Used by IMS and POS |
| Shared settings/workflow mode | `frontend/src/features/settings/*` | Shared and current | No move needed | Keep in `src/features/settings` | Used across shells |

## Exact POS Conflict

The current POS conflict is the clearest one.

Today:

- `apps/pos` shell imports shared POS behavior from `src/features/pos`
- but some live shell components still remain inside `apps/pos/src/components`
- and `src/features/pos/components/*` sometimes only re-export those app-owned files

This is the wrong long-term ownership boundary.

Recommended fix:

1. Move these files into `frontend/src/features/pos/components/`:
   - `TerminalPageLayout.jsx`
   - `TerminalLockDrawer.jsx`
   - `TerminalWorkspaceSidebar.jsx`
2. Update imports so `TerminalPage.jsx` and tests point to the real shared feature files directly.
3. Delete the re-export wrappers after import cleanup.
4. Leave only shell-only boot files in `frontend/apps/pos/src`.

## Recommended Target Ownership

### Keep In App Shells

- app bootstrap
- app router composition
- app manifest/public assets
- app-only fallback pages

### Keep In Shared Feature Layer

- domain logic
- reusable feature components
- feature tests
- service integrations
- workflow/state logic

### Keep Legacy Shared Folders Only Until Classified

- `frontend/Pages`
- `frontend/Components`

Do not bulk-move these folders.

Each module must first be classified as:

- POS-only
- IMS-only
- Storefront-only
- truly shared

## Recommended Migration Order

### Phase 1: Finish POS Ownership Cleanup

Status: completed for the three POS shell/layout files.

1. Move remaining POS shell components from `apps/pos/src/components` into `src/features/pos/components`
2. Remove re-export indirection
3. Update POS tests to point to the new real owner paths

### Phase 2: Stabilize IMS Composition

1. Keep `apps/skupervisor` as shell only
2. Identify the highest-traffic IMS domains currently still in `Pages`
3. Move those domain pages gradually into `src/features/*/pages`
4. Keep shared layout/admin wrappers only where reuse is real

### Phase 3: Leave Storefront Mostly As-Is

1. Keep `apps/store/src` app-local
2. Only extract code out if it becomes genuinely shared with another surface

## What Should Not Be Done

Do not:

- copy all old folders into `apps/*`
- move all of `frontend/Pages`
- move all of `frontend/Components`
- duplicate shared logic between app shells and `src/features`
- keep permanent re-export ownership hacks for live POS shell files

## Recommended Next Action

The safest next migration task is:

`Finish the POS shell ownership cleanup first.`

That gives the best value with the lowest risk because:

- the POS split is already obvious
- the files are already actively used
- the migration boundary is small and testable
- it reduces confusion for future POS work immediately

## Suggested Execution Packet

If implemented next, the concrete migration slice should cover:

1. `frontend/apps/pos/src/components/TerminalPageLayout.jsx`
2. `frontend/apps/pos/src/components/TerminalLockDrawer.jsx`
3. `frontend/apps/pos/src/components/TerminalWorkspaceSidebar.jsx`
4. `frontend/src/features/pos/components/TerminalPageLayout.jsx`
5. `frontend/src/features/pos/components/TerminalLockDrawer.jsx`
6. `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
7. affected POS tests that currently reference `apps/pos/src/components/*`

That is the cleanest first migration step before touching IMS legacy folders.
