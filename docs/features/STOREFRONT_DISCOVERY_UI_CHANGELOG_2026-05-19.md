---
status: reference
owner: storefront
last_reviewed: 2026-05-19
topic: storefront_discovery_ui_changes
---

# Storefront Discovery UI Change Log (2026-05-19)

## Timestamp
- Logged at: `2026-05-19 17:48:58 +08:00` (Asia/Manila)

## Scope
- Frontend storefront discovery map and results UI refinements.
- No backend file changes are currently staged/modified.

## Current Modified Files (Frontend)
1. `frontend/apps/store/src/StorefrontApp.jsx`
- Main discovery UI behavior updates.
- Mobile/desktop layout refinements for map + results stage.
- Filter controls, list/grid rendering, and map popup lifecycle adjustments.
- iOS search input behavior updates tied to sticky positioning.

2. `frontend/apps/store/src/index.css`
- Discovery UI styling updates (mobile/tablet/desktop).
- Responsive spacing, card sizing, dropdown behavior, and map-stage visuals.
- Mobile safe-area and sticky/focus support for iOS search interactions.

3. `frontend/apps/store/src/Components/store/DiscoveryResponsiveLayout.jsx` (new)
- New responsive layout component module for discovery header/hero/search/map/results wrappers.

4. `frontend/apps/store/src/storefrontMarkerPreview.js`
- Marker preview card interaction updates.
- Added close callback support and guarded action handling to reduce duplicate trigger behavior.

5. `frontend/apps/store/src/discoveryPresentation.js`
- Pin selection behavior updated so matched tenants can show active branch pins in discovery map results.

6. `frontend/apps/store/src/businessModePins.js`
- Business-mode pin palette and visual adjustments updated.
- Selected/non-selected pin rendering behavior refined.

7. `frontend/apps/store/src/fnbStorefrontViewModel.js`
- Accent color alignment updates.

8. `frontend/apps/store/src/servicesStorefrontViewModel.js`
- Accent color alignment updates.

9. `frontend/index.html`
- Viewport meta updated to include `viewport-fit=cover` for iOS safe-area handling.

## Untracked Local Files
1. `temp_edits.json`
- Local temporary artifact; not part of storefront source.
- Recommended: exclude from commit unless intentionally required.

## Diff Size Snapshot
- Tracked files changed: `8`
- Insertions: `3076`
- Deletions: `515`

