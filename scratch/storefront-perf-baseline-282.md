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
