# Performance with large datasets

MapLibre renders on the GPU and can handle a lot, but large GeoJSON, too many sources, and frequent updates are the usual causes of slow maps. Apply these in roughly the order of impact.

## 1. Don't render more than you need

- **Use layers, not DOM markers, for many points.** A `circle`/`symbol` layer renders tens of thousands of points on the GPU smoothly; hundreds of `Marker` DOM nodes will not. This is the single biggest win for point-heavy maps.
- **Cluster** point data that overlaps, or use a **heatmap** for density. Above ~50k individual points, rendering GeoJSON directly gets slow (>1s); cluster, heatmap, or move to vector tiles. See `clustering.md`.
- **For millions of points or hexbin aggregation**, layer **deck.gl** over MapLibre, or aggregate server-side and send only the current viewport's data (fetch on `moveend`).

## 2. Shrink the data before it reaches the browser

- **Load GeoJSON from a URL, not inline.** Inlining large GeoJSON in your JS bloats the bundle and client memory.
- **Cut coordinate precision to ~6 decimals** (~10 cm). GeoJSON often defaults to 15–17 decimals (atomic scale) — pure waste. This alone can shrink files substantially.
- **Simplify geometry** for lines/polygons with Mapshaper or Turf.js `simplify` — fewer vertices, smaller files, faster rendering.
- **Minify and gzip/Brotli** the GeoJSON over the wire.

## 3. Convert big data to vector tiles

Beyond tens of thousands of features, stop shipping one giant file and switch to tiles so the client downloads only the current viewport/zoom:

- **Tippecanoe**: GeoJSON → MBTiles, thinning features at low zoom so you never exceed per-tile limits.
- **Martin**: serves MVT directly from PostGIS on the fly (handles multi-GB databases).
- **PMTiles**: package tiles as one static file, no server (see `data-sources.md`).

## 4. Update efficiently

- **`updateData` (GeoJSONSourceDiff) instead of `setData`** for incremental changes to a big source. `setData` re-parses everything; `updateData` applies targeted add/remove/update and only re-renders affected tiles. It **requires unique feature ids** — set them on features or via `promoteId` on the source. Order of operations is removeAll → remove → add → update.
- **Debounce rapid updates.** If you update a source on drag/typing, throttle it — each `setData` re-tiles the whole source in a worker.
- **Minimize source count.** Each source has rendering overhead; prefer one source with a `FeatureCollection` plus filtered layers over many small sources.

## 5. Reduce per-frame work

- **Symbol collision detection is expensive.** MapLibre checks whether icons/labels overlap every frame. If you're fine with overlap, set `icon-overlap: 'always'` / `text-overlap: 'always'` (and `icon-allow-overlap: true` / `text-allow-overlap: true`) to skip collision work — a big win on dense symbol layers.
- **Constrain zoom ranges.** Give layers/sources `minzoom`/`maxzoom` so detail only loads where it's needed.
- **Simplify the style.** Fewer layers, fewer symbols, simpler symbology renders faster. Static-camera apps benefit from raster basemaps + minimal local symbol layers.
- **Reuse the map instance.** Don't destroy and recreate maps; update sources/layers on the existing one.

## Quick reference: what to reach for

| Situation | Approach |
|---|---|
| < ~10k points | GeoJSON source + circle/symbol layer |
| Overlapping/cluttered points | `cluster: true` (clustering.md) |
| Density matters, not individual points | heatmap layer |
| 50k–millions of points | vector tiles (Tippecanoe/Martin) or PMTiles |
| Millions + aggregation | deck.gl over MapLibre, or server-side viewport queries |
| Frequent partial edits to a big source | `updateData` with unique ids |
| Dense labels/icons, overlap OK | `*-overlap: 'always'` to skip collision checks |
