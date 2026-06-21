---
status: reference
owner: engineering
last_reviewed: 2026-06-05
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

## Addendum (2026-06-05): Shared IMS Picker Raster Endpoint Hardening

The shared IMS `MapPinPicker` used by onboarding and Settings now uses an inline raster style backed by `https://tile.openstreetmap.org/{z}/{x}/{y}.png` in production and `/osm/{z}/{x}/{y}.png` through the Vite dev/preview proxy locally.

Reason:
1. `https://tiles.openfreemap.org/styles/liberty` remains valid for the Storefront vector-style maps.
2. `https://tiles.openfreemap.org/{z}/{x}/{y}.png` is not a valid raw raster tile endpoint and returns HTTP 403, which left the shared IMS picker blank.
3. The IMS picker only needs a simple location-pin basemap; it does not need OpenFreeMap glyphs, sprites, or vector style resources.

Runtime hardening:
1. `trackResize: false` is set on the shared picker MapLibre instance so MapLibre does not fire its own resize handler while onboarding modals or Settings panels are closing.
2. The component-owned `ResizeObserver` keeps guarded resize behavior and catches late MapLibre cleanup failures during unmount.
3. Storefront discovery maps continue to use their existing OpenFreeMap vector style contract; this addendum only changes the shared IMS picker.

## Addendum (2026-06-20): Shared IMS Picker Provider Removal

The 2026-06-05 OSM raster fallback is superseded for the shared IMS `MapPinPicker`.

Reason:
1. The IMS picker contract is MapLibre interaction first: merchants need a stable click/drag/geolocation pinning surface, not a third-party basemap dependency.
2. Browser-side or server-side Nominatim/OpenStreetMap dependencies are not part of the approved IMS picker provider contract.
3. The picker must open over Iloilo City, Philippines when no saved pin exists.

Runtime hardening:
1. The shared IMS picker now uses an internal MapLibre style with no external tile-provider URL.
2. Click, drag, and browser-geolocation selections continue to emit latitude/longitude through the existing location form contract.
3. Address autofill goes through the first-party reverse-geocode endpoint, which returns a local address label without browser-side third-party geocoding requests. Coordinates remain authoritative and saving valid coordinates must not be blocked by address-label availability.

## Addendum (2026-06-20): Shared IMS Picker Basemap Restoration

The internal-style-only IMS picker is superseded after production operators could not visually confirm street context while pinning a location.

Runtime hardening:
1. Onboarding and Settings continue to use the shared IMS `MapPinPicker`.
2. The picker reuses the Storefront MapLibre positron basemap style and existing `/openfreemap` development/preview proxy path, opening over Iloilo City, Philippines when no saved pin exists.
3. Click, marker drag, and browser-geolocation selections still emit latitude/longitude through the tenant-location form contract.
4. Address autofill remains first-party through `/api/v1/geo/reverse-geocode`; the IMS picker must not call browser-side Nominatim directly.

## Addendum (2026-06-20): IMS Merchant Pin Reliability Guard

The shared IMS picker and its onboarding/Settings form consumers now distinguish the default camera view from a saved merchant-store pin.

Runtime hardening:
1. Iloilo City, Philippines remains the initial camera center when no saved pin exists, but it is not persisted unless the merchant explicitly pins or enters usable coordinates.
2. Missing coordinate fields, `0,0`, and out-of-Philippines browser geolocation results are rejected before onboarding or Settings tenant-location saves.
3. `Adjust Pin` creates a first draggable draft marker at the current map center when no usable pin exists, so the merchant can place and drag the pin without relying on a pre-existing marker.
4. `Reset View` returns the camera to Iloilo City and clears invalid `0,0` selected state.
5. Reverse geocoding remains first-party and best-effort; lookup failure does not discard valid Philippines coordinates.

## Addendum (2026-06-21): Draft Marker Ownership Hotfix

The shared IMS picker now owns an immediate local draft pin after map click, browser-geolocation success, or `Adjust Pin`, then reconciles with parent latitude/longitude props. This prevents the moving-pin control state from appearing without a visible marker while preserving the parent form as the submitted coordinate source of truth.

Runtime hardening:
1. `Stop Moving Pin` must only render when the picker has a usable marker position.
2. Onboarding must not expose interactive map pin controls while searchable storefront visibility is off, because hidden storefront saves intentionally do not require a map pin.
3. Browser geolocation failure messages distinguish permission denial, unavailable position, timeout, unsupported browser, and out-of-Philippines coordinates.
