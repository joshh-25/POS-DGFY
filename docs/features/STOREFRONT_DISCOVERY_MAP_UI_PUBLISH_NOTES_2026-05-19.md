---
status: reference
owner: storefront
last_reviewed: 2026-05-19
topic: storefront_discovery_map_publish_notes
---

# Storefront Discovery Map UI Publish Notes (2026-05-19)

## Purpose
This note explains what changed in the storefront discovery UI so other developers can quickly understand the publish scope before review or rollback.

## Branch
- Source branch: `codex/storefront-merged-pilot`
- Target remote branch: `origin/codex/storefront-merged-pilot`

## What Changed

### 1) Discovery layout and responsiveness
- Introduced a dedicated responsive layout module:
  - `frontend/apps/store/src/Components/store/DiscoveryResponsiveLayout.jsx`
- Refined discovery header/search/category/map/results composition across mobile, tablet, and desktop:
  - `frontend/apps/store/src/StorefrontApp.jsx`
  - `frontend/apps/store/src/index.css`

### 2) Mobile map/results behavior
- Improved mobile map + results stage behavior:
  - full-bleed map behavior when results are visible
  - controlled rounded/container behavior for hidden results state
  - mobile toggle visibility and spacing improvements
- Updated iOS safe-area handling for search interactions:
  - `viewport-fit=cover` meta and safe-area-aware sticky/focus offsets
  - `frontend/index.html`
  - `frontend/apps/store/src/index.css`
  - `frontend/apps/store/src/StorefrontApp.jsx`

### 3) Discovery filters and card presentation
- Updated filter control behavior and visual state for active selections.
- Continued list/grid card adjustments for hierarchy, spacing, and action placement.
- Kept styles aligned with DGFY blue branding where applied.

### 4) Map marker and popup lifecycle improvements
- Updated marker preview component behavior:
  - close callback support
  - guarded action trigger to reduce duplicate action firing
  - `frontend/apps/store/src/storefrontMarkerPreview.js`
- Adjusted discovery pin selection behavior to keep matched tenant branches visible:
  - `frontend/apps/store/src/discoveryPresentation.js`

### 5) Business mode and view model color alignment
- Updated mode pin colors and rendering treatment:
  - `frontend/apps/store/src/businessModePins.js`
- Aligned accents in storefront mode view models:
  - `frontend/apps/store/src/fnbStorefrontViewModel.js`
  - `frontend/apps/store/src/servicesStorefrontViewModel.js`

## Files Included In Publish Scope
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/index.css`
- `frontend/apps/store/src/Components/store/DiscoveryResponsiveLayout.jsx` (new)
- `frontend/apps/store/src/storefrontMarkerPreview.js`
- `frontend/apps/store/src/discoveryPresentation.js`
- `frontend/apps/store/src/businessModePins.js`
- `frontend/apps/store/src/fnbStorefrontViewModel.js`
- `frontend/apps/store/src/servicesStorefrontViewModel.js`
- `frontend/index.html`
- `docs/features/STOREFRONT_DISCOVERY_UI_CHANGELOG_2026-05-19.md`
- `docs/features/STOREFRONT_DISCOVERY_MAP_UI_PUBLISH_NOTES_2026-05-19.md`

## Explicitly Excluded
- `temp_edits.json` (local temp artifact; not part of publish scope)

## Validation For This Publish
- `npm run build` (frontend)
- `npm run lint:docs`

## Reviewer Focus Checklist
1. iPhone search focus should not push search bar under status bar.
2. Mobile discovery map/results transitions should not clip toggle button.
3. Desktop/tablet layout should remain stable after mobile-only CSS changes.
4. Map marker popups should not duplicate from lifecycle/reopen loops.
5. Discovery pin coverage should include expected matched branch pins.

