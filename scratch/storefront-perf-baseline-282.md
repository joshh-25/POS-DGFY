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

## Post-Phase-G delta (per-mode hero code splitting)

Lazy-wrapped the 5 mutually-exclusive hero components dispatched from
`app/pages/StorefrontHeroBandContainer.jsx` (`ServicesHero`, `FnbHero`,
`SimpleHero`, `DefaultStorefrontHero`, `HospitalityBookingPanel`) — exactly
one renders per page load, yet all five were statically imported and
shipped to every visitor regardless of mode.

| Asset | Before (post-E) | After |
|---|---:|---:|
| Main app bundle (`index-*.js`) | 1,848.65 kB / 462.61 kB gzip | 1,711.00 kB / 434.16 kB gzip |
| New: `ServicesHero-*.js` | -- | 29.83 kB / 7.02 kB gzip |
| New: `SimpleHero-*.js` | -- | 25.05 kB / 6.64 kB gzip |
| New: `FnbHero-*.js` + `FnbHeroMobileOverview-*.js` | -- | 6.57 + 31.19 kB / 2.28 + 7.94 kB gzip |
| New: `DefaultStorefrontHero-*.js` | -- | 6.51 kB / 2.28 kB gzip |
| New: `HospitalityBookingPanel-*.js` | -- | 16.38 kB / 4.77 kB gzip |
| New: `useStorefrontAccountBranches-*.js` | -- | 23.25 kB / 7.17 kB gzip |

**~28 kB gzip further removed from the critical path** on top of Phase E's
285 kB — a visitor to an fnb-mode store now loads only `FnbHero` +
`FnbHeroMobileOverview` (~10 kB gzip) instead of all five modes' hero code.
`DefaultStorefrontHero` (used by retail and any other non-fnb/services/
simple mode) reuses `FnbHero`'s sub-components internally, so retail
visitors still pull in a subset of fnb-labeled code — but only the small
piece `DefaultStorefrontHero` actually uses, and only on demand, not the
full `FnbHero`/`FnbHeroMobileOverview` chunks.

This is a first, low-risk increment of the full "per-mode code splitting"
item, not the complete architectural project — see the plan file for the
remaining blockers (mode hooks/utils cross-imported outside components,
`checkout/buildFnbCheckoutPayload.js`/`tracking/fnbAdapter.js` barrels
pulling fnb in unconditionally) that a full split would still need to
address.

Full apps/store test suite: 344/349 passing, same 5 pre-existing failures
as every prior phase. One test assertion updated
(`profileLauncher.integration.test.jsx`: `getAllByRole` → `findAllByRole`,
since the "Profile" button now lives inside a lazy-loaded hero).
