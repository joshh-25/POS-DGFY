# Storefront build-size baseline — issue #282, pre-fix

Captured via `npm run build:store` (Docker, `node:22-alpine`) on branch
`perf/storefront-load-282` before any Phase B–G changes, against `develop` @ `274d3efd`.

| Asset | Size | Gzip |
|---|---:|---:|
| `index-BVf1i4k7.js` (main app — all modes, all pages, statically bundled) | 1,878.54 kB | 472.33 kB |
| `vendor-maplibre-CsmbOaRP.js` | 1,055.20 kB | 285.09 kB |
| `vendor-maplibre-*.css` | 69.94 kB | 10.06 kB |
| `index-2LbfyV82.js` (react/router/sentry graph, default chunk) | 585.86 kB | 191.96 kB |
| `module-zjl4aPXW.js` | 230.65 kB | 75.96 kB |
| `index-*.css` | 166.95 kB | 26.91 kB |
| `vendor-icons-*.js` | 55.29 kB | 12.83 kB |
| `vendor-qrcode-*.js` | 25.40 kB | 9.97 kB |

**Cold-load JS total (gzip): ~1,038 kB**, of which MapLibre alone is **285 kB (27%)** —
despite none of its 4 consumer components (`DeliveryPinMap`, `DeliveryTrackingView`,
`StoresMap`, `TrackingRouteMap`) rendering on the default storefront path. This
confirms the correction posted to #282: MapLibre is not lazy-loaded, and lazy-loading
it is the single largest, cheapest bundle win — bigger than all 25k lines of mode code
targeted by item 6, for a fraction of the effort.

Re-run the same build after each phase and diff against this table.

## Post-Phase-E delta

After lazy-loading the 4 maplibre-gl consumers (`DeliveryPinMap`, `StoresMap`,
`TrackingRouteMap`, plus leaving the already-dead-code `DeliveryTrackingView`
untouched) behind `React.lazy` wrappers with self-contained `Suspense`
boundaries, and moving the `maplibre-gl.css` import out of `StorefrontApp.jsx`
into each of the three real implementation files:

| Asset | Before | After |
|---|---:|---:|
| Main app bundle (`index-*.js`) | 1,878.54 kB / 472.33 kB gzip | 1,847.24 kB / 462.28 kB gzip |
| `vendor-maplibre-*.js` | 1,055.20 kB / 285.09 kB gzip | **same size, but no longer eagerly loaded** |
| `vendor-maplibre-*.css` | 69.94 kB / 10.06 kB gzip | **same size, but no longer eagerly loaded** |
| New: `DeliveryPinMap-*.js` | -- | 5.71 kB / 2.43 kB gzip |
| New: `StoresMap-*.js` | -- | 16.57 kB / 5.88 kB gzip |
| New: `TrackingRouteMap-*.js` | -- | 2.93 kB / 1.39 kB gzip |
| New: `discoveryMapLayers-*.js` | -- | 8.45 kB / 3.00 kB gzip |

Verified via `dist-apps/store/index.html`: `vendor-maplibre-*.js` and its CSS
no longer appear in the `<link rel="modulepreload">` / `<link rel="stylesheet">`
list at all -- only `vendor-icons` and `vendor-qrcode` remain eager. Each of
the three new lazy chunks statically imports `vendor-maplibre-*.js` from
*within* its own dynamically-`import()`ed module, confirmed by inspecting
the built chunk output directly.

**Net effect on a cold storefront-page load with no map ever rendering**
(the common case — home/catalog browsing, most checkout flows): **285 kB
gzip of JS and 10 kB gzip of CSS removed from the critical path**, a ~28%
cut to the ~1,038 kB gzip JS total measured in the pre-fix baseline above.
Stores with hero map data (`StoresMap` in the contact-location components)
still pay this cost, but only once the map actually mounts, and it no
longer blocks anything else on the page.
