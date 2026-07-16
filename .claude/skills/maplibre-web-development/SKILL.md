---
name: maplibre-web-development
description: Implement interactive web maps with MapLibre GL JS, the open-source WebGL vector map library. Use this whenever the user wants to build, embed, or debug a web map — showing points or markers, clustering large point datasets, styling layers with data-driven expressions, adding popups, controls, or events, loading GeoJSON / vector tiles / PMTiles / raster sources, optimizing map performance, or integrating a map into React, Vue, or Angular. Trigger for any request involving MapLibre, "a map" on a website, store locators, geospatial or location visualization, marker clustering, or heatmaps — even if MapLibre is not named explicitly.
---

# MapLibre GL JS for Web Development

MapLibre GL JS is a TypeScript/WebGL library that renders interactive vector maps in the browser. It is the community-led open-source fork of Mapbox GL JS v1 (forked Dec 2020, BSD-3 licensed) and requires no access token or vendor account.

Use this skill to write correct, current, production-quality MapLibre code. The body below is the always-loaded core: the mental model, a working quickstart, a decision guide, and the gotchas that cause most bugs. **Load a reference file from `references/` only when the task calls for it** — pointers are given throughout.

## Version and install (verify before pinning)

The stable line is **5.x** (`maplibre-gl@^5`). Version 6 is in pre-release as of mid-2026 — it drops WebGL1 and is ESM-only; do **not** use it for production unless the user asks. Versions move fast, so confirm the current stable release on npm rather than trusting a memorized number, then pin a caret range.

```bash
npm install maplibre-gl
```

```js
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css'; // REQUIRED — see gotchas
```

CDN alternative (prototypes only): load `maplibre-gl.js` and `maplibre-gl.css` from `https://unpkg.com/maplibre-gl@<version>/dist/...`. Prefer a specific version over `@latest` so a future release can't silently break the page.

## Mental model — learn this first

A MapLibre map is driven by a **style** (a JSON document, inline or a URL) governed by the [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/). The style has three moving parts:

- **Sources** — *where data comes from* (a GeoJSON URL, a vector/raster tile endpoint, a PMTiles archive). A source holds data, not appearance.
- **Layers** — *how to draw a source*, in draw order. One source can feed many layers. Layer types: `circle`, `symbol` (icons + text), `line`, `fill`, `fill-extrusion` (3D), `heatmap`, `raster`, `background`.
- **glyphs + sprite** — fonts and icons the style can reference.

A style does **not** embed tile data; it *points* to it. You can mix any number of sources of any types in one map (e.g. a raster satellite basemap + a GeoJSON overlay). This source/layer split is the single most important concept: you add data once as a source, then style it with one or more layers and expressions.

For choosing and configuring sources (GeoJSON vs vector tiles vs PMTiles vs raster, self-hosted vs hosted, schemas, TileJSON) → read `references/data-sources.md`.

## Quickstart — a working map

```html
<div id="map" style="width: 100%; height: 100%;"></div>
```

```js
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json', // free demo basemap, no key
  center: [-74.5, 40], // [longitude, latitude] — NOT [lat, lng]
  zoom: 9
});

map.addControl(new maplibregl.NavigationControl());

map.on('load', () => {
  // Add sources and layers HERE — see gotchas for why
});
```

The demo style is fine for development. For real basemaps, use a provider style URL (MapTiler, Stadia, Jawg — these need a key) or self-host tiles. See `references/data-sources.md`.

## Decision guide — pick the right approach

**How should I display many points?**
- A handful of fixed points with rich HTML/interaction → `maplibregl.Marker` (DOM elements). Simple, but each is a DOM node; do not use for hundreds+.
- Tens of thousands of points → a **GeoJSON source + `circle` or `symbol` layer**. The GPU renders these as part of the map; DOM markers can't scale here.
- Many overlapping points that clutter at low zoom → **clustering** (`cluster: true` on a GeoJSON source). This is the most common "lots of pins" request → read `references/clustering.md`.
- Density/intensity rather than individual points → a `heatmap` layer.
- Millions of points, or heavy aggregation (hexbins) → offload to **deck.gl** layered over MapLibre, or aggregate server-side and send only the current viewport.

**How should I load my data?**
- Small/medium GeoJSON (roughly < 50k features) → GeoJSON source from a **URL** (not inlined).
- Large or frequently-panned datasets → pre-generate **vector tiles** (Tippecanoe → MBTiles/PMTiles, or Martin from PostGIS). → `references/data-sources.md` and `references/performance.md`.
- Static hosting with no tile server → **PMTiles** (single file on S3/R2/GitHub Pages).

**Framework?** React / Vue / Angular each have lifecycle rules (create on mount, `remove()` on unmount, wait for `load`). → `references/frameworks.md`.

## Data-driven styling in one breath

Layer paint/layout values can be **expressions** — arrays that compute a value from feature properties and zoom. The two you will use constantly:

```js
// step: pick a value from thresholds (great for cluster sizes/colors)
'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40]

// interpolate: smooth ramp (great for zoom-based sizing or value ramps)
'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 15, 10]
```

`['get', 'name']` reads a feature property; `['zoom']` reads current zoom; `case`, `match`, and comparison operators (`<`, `>=`, `all`, `has`) let you branch. Full layer-type and expression reference → `references/styling-and-expressions.md`.

## Interactivity in one breath

Bind events to **layer ids**: `map.on('click', 'my-layer', handler)`. Inside the handler, `e.features[0].properties` gives the clicked feature. `map.queryRenderedFeatures(point, { layers })` inspects what's under a pixel. Add UI with `Popup`, `Marker`, and controls (`NavigationControl`, `GeolocateControl`, `ScaleControl`, `FullscreenControl`). Full patterns (hover, cursor affordance, popups, controls, RTL text) → `references/interactivity.md`.

## Gotchas that cause most MapLibre bugs

These are the failures that come up again and again. Check them first when something is broken.

1. **Coordinates are `[longitude, latitude]`.** Not `[lat, lng]`. A map that lands in the ocean or the wrong hemisphere is almost always swapped coordinates. This trips up everyone coming from Leaflet/Google Maps.
2. **The CSS file is required.** Without `maplibre-gl.css`, popups, markers, and controls render broken or invisible. Import it once.
3. **Add sources/layers only after `load`.** Calling `addSource`/`addLayer` before the style finishes loading throws "style is not done loading." Wrap them in `map.on('load', ...)`. To add data later, guard with `if (map.isStyleLoaded())` or listen for `styledata`.
4. **Cluster helpers are async in v5.** `getClusterExpansionZoom`, `getClusterLeaves`, and `getClusterChildren` return **Promises** — `await` them. Old Mapbox tutorials use callbacks; that code will silently misbehave. → `references/clustering.md`.
5. **`text-font` must exist in the style's glyphs.** A symbol layer referencing a font the style doesn't provide renders no text. With the demo style, use `['Noto Sans Regular']`. Provider styles differ.
6. **Clean up the map.** In SPA/framework code, call `map.remove()` on unmount or you leak WebGL contexts and workers. → `references/frameworks.md`.
7. **Cast `getSource` in TypeScript.** `map.getSource('id')` returns a generic `Source`; cast to `GeoJSONSource` before calling `setData`/`getClusterExpansionZoom`.
8. **Strict CSP needs blob workers.** MapLibre uses web workers: allow `worker-src blob:; child-src blob:; img-src data: blob:`, or use the separate `maplibre-gl-csp` bundle and set the worker URL manually.
9. **RTL text needs a plugin.** Arabic/Hebrew labels render reversed unless you call `maplibregl.setRTLTextPlugin(...)` before adding RTL data. → `references/interactivity.md`.
10. **Migrating from Mapbox?** Swap the package, replace the `mapboxgl` namespace with `maplibregl`, delete the access token, and replace any `mapbox://` style/source with a MapLibre-compatible one. The rest of the API is ~95% identical.

## Reference files

Read the one that matches the task — don't preload them all.

- `references/clustering.md` — Full point-clustering implementation: options, the three-layer pattern, click-to-zoom, `clusterProperties` aggregation, HTML-marker clusters, and tuning. **Read this for any "cluster my points / group nearby pins" request.**
- `references/data-sources.md` — Choosing and configuring sources: GeoJSON, vector tiles, PMTiles, raster/raster-dem, hosted vs self-hosted, schemas, TileJSON.
- `references/styling-and-expressions.md` — Layer types and the expression language for data-driven styling.
- `references/interactivity.md` — Markers, popups, controls, events, `queryRenderedFeatures`, hover, RTL text.
- `references/performance.md` — Making large datasets fast: precision, simplification, vector tiles, overlap modes, partial updates, memory.
- `references/frameworks.md` — React, Vue, and Angular integration with correct lifecycle and cleanup.
