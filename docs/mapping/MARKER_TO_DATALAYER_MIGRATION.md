---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-07-20
applies_to: storefront_discovery, delivery_tracking, checkout_delivery_pin, merchant_location_picker
topic: maplibre_marker_vs_datalayer
---

# MapLibre Pins: Marker vs. Data-Layer, and the 2026-07-20 Clipping Fix

## Summary

A report came in that storefront map pins were clipping / rendering at the wrong location, framed as "migrate `StoresMap.jsx` off React markers onto a data-layer approach." Investigation found the premise didn't match the code: the discovery map was already on the data-layer pattern. The real bugs were CSS/lifecycle issues in three other map surfaces that still used `maplibregl.Marker` (DOM markers). This doc records:

1. The two rendering approaches MapLibre supports for points, and when each is the right call.
2. What was actually broken, per surface.
3. What was changed to fix it.

## The two approaches

MapLibre GL JS gives you two fundamentally different ways to put a point on the map:

| | `maplibregl.Marker` (DOM) | GeoJSON source + `symbol`/`circle` layer (data-layer) |
|---|---|---|
| **How it renders** | A real DOM element positioned on top of the WebGL canvas via CSS `transform`, recalculated on every map move/zoom. | Drawn *inside* the WebGL canvas itself, via the map's projection matrix — no DOM node per point. |
| **Drag support** | Native — `draggable: true` plus `dragstart`/`dragend` events, GPU-smooth out of the box. | None built in — dragging means hand-rolling pointer-down/move/up, translating screen coordinates to `lngLat`, and calling `source.setData()` on every move frame. |
| **Clipping/positioning risk** | Vulnerable to a whole class of DOM bugs: a parent `overflow: hidden` can truncate a marker near the edge; a stray CSS `transform` on the marker element can fight with MapLibre's own positioning transform (the last write wins); if the canvas is resized *after* markers are positioned (e.g. a modal still animating open), markers can render against stale dimensions until something forces a re-layout. | None of the above — since the point is baked into the same canvas paint as the basemap, it can't be clipped by container CSS or fought over by a competing transform, and it repaints correctly on `map.resize()`/re-render with no separate DOM sync step. |
| **Scaling** | Fine for a handful of points. Degrades linearly — each marker is a live DOM node with its own event listeners and reflow cost. | GPU-rendered — scales to thousands of points at effectively flat cost. Supports built-in or custom clustering. |
| **Interaction richness** | Easy to embed arbitrary HTML (badges, hover previews, custom cursors) since it's just a `<div>`. | Interaction is limited to what `map.on('click'/'hover', layerId, ...)` + `queryRenderedFeatures` can express; rich popups still need a DOM overlay (`maplibregl.Popup`), which is normal and expected even in a fully data-layer map. |

**Rule of thumb** (also documented in this repo's `maplibre-web-development` skill): use `Marker` for a handful of points that need rich interaction, especially dragging. Use a data-layer for anything with many points, or any point that's purely for display with no interaction — because a data layer removes the entire DOM-positioning bug class "for free," not just as a performance optimization.

### Pros / cons, applied to this codebase

**Keeping `Marker` (chosen for `MapPinPicker.jsx` and `DeliveryPinMap`):**
- ✅ Matches MapLibre's own guidance for small point counts (1 point each).
- ✅ Keeps native drag (`dragstart`/`dragend`) for free — both of these are "drag a pin to set your location" pickers (merchant storefront location; customer delivery drop-off in checkout).
- ✅ Smaller, lower-risk change: the bug in both was CSS/lifecycle (canvas sizing timing), not the choice of Marker vs. layer, so fixing the root cause meant reusing already-correct shared code, not rearchitecting.
- ❌ Still carries the inherent DOM-marker risk class (container `overflow`, competing transforms, stale-canvas-size races) — mitigated here by consolidating onto shared, tested helpers rather than ad hoc per-component logic.

**Converting to a data-layer (chosen for `DeliveryTrackingView.jsx`):**
- ✅ Eliminates the bug class entirely rather than patching around it — no DOM node for a parent `overflow: hidden` to clip, no transform to conflict.
- ✅ No interaction was lost — its two markers (store, customer) were never draggable; they're pure display.
- ✅ Sets up cleanly for a live rider-location feature (currently absent — "Delivery rider" is static placeholder UI): a data layer scales to a live-updating point via `source.setData()` far better than Marker DOM churn on every location ping.
- ✅ Reuses the sprite-icon convention already built for the discovery map, instead of a third bespoke marker-icon implementation.
- ❌ Slightly more code than a CSS-only patch (source + layer + image registration where there was none) — but it's one-time setup on a map instance that already had almost no plumbing.
- ❌ Would be the wrong call if this view ever needs the customer or store pin to be *draggable* — it doesn't today, and there's no product signal that it will.

## What was actually broken

### 1. `StoresMap.jsx` (discovery map) — already correct, just had dead code

`frontend/apps/store/src/discovery/components/StoresMap.jsx` and its backing module `frontend/apps/store/src/discoveryMapLayers.js` were **already** on the data-layer pattern: store pins are a GeoJSON source (`DISCOVERY_PIN_SOURCE_ID`) rendered through a `symbol` layer (`DISCOVERY_PIN_LAYER_ID`) with SVG icons rasterized via `map.addImage()`; the user-location dot is a `circle` layer (`DISCOVERY_USER_LAYER_ID`). The `markersRef`/`userMarkerRef` refs still present in the file were leftovers from before that migration — never populated, so purely cosmetic clutter, not a source of clipping.

### 2. `DeliveryTrackingView.jsx` (order tracking map) — real clipping bug, not draggable

`frontend/apps/store/src/features/tracking/components/DeliveryTrackingView.jsx` rendered its store/customer pins as `maplibregl.Marker` DOM elements. Its container set `height: 320, overflow: 'hidden', borderRadius: 20` with **no explicit width** and **no `ResizeObserver`** — if the container wasn't at its final layout size when the map was constructed (e.g. still settling inside a grid/flex parent), the canvas and its markers could end up positioned against stale/zero dimensions, then get visually truncated by `overflow: hidden`. Neither marker was draggable — confirmed no `draggable` option was set (defaults to `false`) — so there was nothing to lose by moving off `Marker` entirely.

A byte-for-byte duplicate of this file also existed at `frontend/apps/store/src/Components/DeliveryTrackingView.jsx`, unimported anywhere in the repo and already missing a later fix (`ed28102b fix(storefront): fix delivery map overlap and prioritize full display lines for tracking`) that the live file had received.

### 3. `DeliveryPinMap` in `StorefrontApp.jsx` (checkout delivery-pin picker) — draggable, needed root-cause CSS/lifecycle fix

`DeliveryPinMap` (used 4× in the checkout/delivery-address flow) is draggable, so it correctly stayed a `Marker`. But it reimplemented canvas sizing and resize scheduling from scratch instead of using the already-correct shared helpers: manual `canvasContainer.style`/`canvas.style` writes duplicated in three places, plus a bespoke `scheduleMapResize` using `requestAnimationFrame` + three staggered `setTimeout`s (40/60/220ms) — exactly the kind of magic-number timing guesswork that produces intermittent "pin renders in the wrong place until something nudges it" symptoms inside modals/drawers that animate open. Its `ResizeObserver` also watched the outer `overflow: hidden` wrapper (`frameRef`) rather than the actual map root (`ref`).

Separately, the marker element it used (`makeUserLocationElement()` in `frontend/apps/store/src/features/discovery/utils/discoveryMapMarkers.js`) set `transform: translateY(-4px)` via inline `cssText`. MapLibre's internal marker positioning fully overwrites `el.style.transform` on every position update, so this nudge was dead code — a symptom of hand-rolled marker positioning fighting MapLibre's own transform management, even though in this specific case it just silently did nothing rather than causing visible misplacement.

`MapPinPicker.jsx` (`frontend/src/components/maps/MapPinPicker.jsx`, the shared merchant-location picker used by Settings/POS/onboarding) was already correct — it called `applyMapLibreCanvasSizing(map)` immediately after map creation, bound `ResizeObserver` directly to the map root via `safeResizeMap`, and its marker element never touched `transform` directly. It was the reference implementation the other two were brought in line with.

## What we changed

| File | Change |
|---|---|
| `frontend/apps/store/src/Components/DeliveryTrackingView.jsx` | **Deleted.** Stale, unimported duplicate. |
| `frontend/apps/store/src/businessModePins.js` | Added `DELIVERY_PIN_META` (store: blue `#1a4586`/Home icon, customer: orange `#f97316`/MapPin icon) and `renderDeliveryPinSpriteSvg(kind, selected)`, following the exact 38×48 frame / bottom-anchor-tail convention as `renderBusinessModePinSpriteSvg`. |
| `frontend/apps/store/src/features/tracking/components/DeliveryTrackingView.jsx` | Replaced the two `maplibregl.Marker` instances with a GeoJSON source (`dgfy-tracking-pins`) + `symbol` layer (`dgfy-tracking-pin-symbols`), using `ensureMapImage`/`setGeoJsonSourceData` from `discoveryMapLayers.js` — the same helpers the discovery map already uses. Added `applyMapLibreCanvasSizing(map)` on creation and a `ResizeObserver` on the actual container. Added explicit `width: '100%'` to the container style. |
| `frontend/apps/store/src/StorefrontApp.jsx` (`DeliveryPinMap`) | Deleted the hand-rolled `scheduleMapResize` (rAF + 3 staggered timers + duplicated inline style writes). Replaced with `applyMapLibreCanvasSizing(map)` once on creation, plus `safeResizeMap` wired to a `ResizeObserver` on the map root (`ref`, not the outer `frameRef` wrapper) and to the existing `resize`/`orientationchange`/`visualViewport` listeners. Kept `Marker` (dragging is a real feature here). |
| `frontend/apps/store/src/features/discovery/utils/discoveryMapMarkers.js` | Removed the dead `transform: translateY(-4px)` from `makeUserLocationElement()`. |
| `frontend/apps/store/src/discovery/components/StoresMap.jsx` | Removed the vestigial `markersRef`/`userMarkerRef` and their cleanup branches (never populated since the pre-existing data-layer migration). |

Net diff: 5 files changed, 1 file deleted, +102/-110 lines — a reduction in total code despite adding the new data-layer plumbing, because the ad hoc resize choreography it replaced was larger than the code that replaced it.

## Verification

- `eslint` on all touched files: 0 errors, 0 new warnings (all pre-existing warnings are unrelated, confined to other parts of the large `StorefrontApp.jsx` file).
- Manual verification still to do (no existing automated tests cover Marker/pin positioning for these two surfaces):
  - Open the storefront checkout flow, trigger the `DeliveryPinMap` delivery-address step inside its real modal/drawer, confirm the pin renders at the exact clicked/dragged location immediately with no clipped edges or offset on first paint.
  - Open `DeliveryTrackingView` for an active order, confirm both pins render fully visible via the new symbol layer at various viewport widths.
  - Open the discovery `StoresMap`, confirm pins/clusters still render and click/hover correctly (regression check on the already-working data-layer path).
- Automated regression suite: `discoveryMapLayers.test.js`, `discoveryMapDom.test.js`, `storefrontMarkerPreview.test.js`, `discoveryFlow.integration.test.jsx`, `storefrontStoresMapSource.contract.test.js`, `MapPinPicker.maplibre.test.jsx`.

## Related

- `docs/ai/CLAUDE.md` — pointer to canonical project instructions.
- `.claude/skills/maplibre-web-development/` — the MapLibre skill this decision followed (decision guide for Marker vs. data-layer, framework lifecycle rules, gotchas).
