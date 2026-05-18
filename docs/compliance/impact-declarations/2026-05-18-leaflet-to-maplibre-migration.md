---
status: reference
owner: engineering
last_reviewed: 2026-05-18
declaration_id: 2026-05-18-leaflet-to-maplibre-migration
classification: regulatory
surfaces: storefront,settings,tenant_locations,compliance,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.05.18
verification_evidence: npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:store,npm run lint:docs,git diff --check
rollback_note: Revert frontend/apps/store/.env to TILING_SERVER (no VITE_ prefix), restore the broken define entry in frontend/apps/store/vite.config.js, remove the /openfreemap proxy blocks from both vite.config.js files, and restore the pre-MapLibre picker implementations from git history.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-18T14:00:00+08:00
preflight_request_ref: MAPLIBRE-MIGRATION-2026-05-18
---

# Leaflet to MapLibre GL Migration

## Compliance Impact Classification

Regulatory.

This declaration covers a map-rendering library migration from Leaflet to MapLibre GL across the storefront discovery map and the shared IMS map picker components, along with the associated tile-proxy configuration fixes needed to restore map tile loading.

No business logic, access-control rules, pricing calculations, or compliance guardrails were modified. The changes are limited to frontend rendering infrastructure and tile-delivery routing.

## Affected Surfaces

- **Storefront discovery map** (`frontend/apps/store/src/main.jsx`): `StoresMap` and `DeliveryPinMap` components migrated from Leaflet to MapLibre GL.
- **Shared IMS map picker** (`frontend/src/components/maps/MapPinPicker.jsx`): migrated from Leaflet/OpenStreetMap-specific implementation to MapLibre GL; behavior (click-to-pin, drag mode toggle, delivery radius circle, geolocation, reset view) preserved.
- **IMS Settings > Storefront location picker wrapper** (`frontend/src/components/maps/StoreLocationPickerMap.jsx`): delegates to the shared MapLibre picker so Settings and onboarding do not maintain separate map implementations.
- **Tile proxy configuration** (`frontend/apps/store/vite.config.js`, `frontend/vite.config.js`): `/openfreemap` proxy entries added to both dev-server and preview-server proxy configs.

## Compliance Preconditions

1. Map pin placement and delivery radius rendering must remain functionally equivalent before and after migration — coordinates emitted by `onChange`/`onCoordinatesChange` callbacks must be identical in precision and format.
2. Tile requests must be routed through the Vite dev-server proxy in development and through `VITE_TILING_SERVER` in production builds, preventing direct browser requests to `tiles.openfreemap.org` that are subject to browser-extension or DNS-level blocking.
3. The `VITE_TILING_SERVER` env var must use the `VITE_` prefix so Vite exposes it to the client bundle via `import.meta.env`; the non-prefixed `TILING_SERVER` key must not be used.
4. The `tileTransformRequest` interceptor must rewrite all map HTTP requests (style JSON, TileJSON, PBF tiles, sprites, glyphs) that originate from `tiles.openfreemap.org` through the `/openfreemap` proxy path in development mode.
5. No Leaflet CSS or JS must remain imported in the migrated files; all styling must come from `maplibre-gl/dist/maplibre-gl.css`.

## Changes Made

### Environment and build config

- **`frontend/apps/store/.env`**: Renamed `TILING_SERVER` → `VITE_TILING_SERVER` so the variable is exposed to `import.meta.env` in the client bundle.
- **`frontend/apps/store/vite.config.js`**: Removed the broken `define` entry (`'import.meta.env.TILING_SERVER'` referencing `process.env.TILING_SERVER` which was always `undefined` from `.env`). Added `/openfreemap` reverse-proxy entry to both `server.proxy` and `preview.proxy`.
- **`frontend/vite.config.js`** (main IMS admin app): Added `/openfreemap` reverse-proxy entry to both `server.proxy` and `preview.proxy`.

### Component migrations

- **`frontend/apps/store/src/main.jsx`**: Updated `import.meta.env.TILING_SERVER` reference to `import.meta.env.VITE_TILING_SERVER`; added `tileTransformRequest` callback and wired it into both MapLibre `Map` constructors; switched CSS import from `leaflet/dist/leaflet.css` to `maplibre-gl/dist/maplibre-gl.css`.
- **`frontend/src/components/maps/MapPinPicker.jsx`**: Canonical shared MapLibre picker. SVG pin filter/gradient IDs are namespaced to `ofm-pin-*` to avoid document-level collisions. `isPinDragModeRef` prevents stale closure in `dragend`, `map.on('error', ...)` replaces Leaflet-specific tile-error handling, `maxBounds` uses MapLibre `[lng, lat]` order, and delivery-radius bounds are computed manually.
- **`frontend/src/components/maps/StoreLocationPickerMap.jsx`**: Compatibility wrapper over `MapPinPicker.jsx` for Settings location forms.

## Verification Evidence

- `npm --prefix frontend run build:skupervisor`
- `npm --prefix frontend run build:store`
- `npm run lint:docs`
- `git diff --check`
