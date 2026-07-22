# Data sources in MapLibre GL JS

A **source** declares where data comes from; **layers** decide how to draw it. Choosing the right source type is the biggest performance and architecture decision in a MapLibre app. Base it on geographic scale, detail, update frequency, and infrastructure — not on assumptions.

## Table of contents
- [Vector vs raster tiles](#vector-vs-raster)
- [GeoJSON source](#geojson-source)
- [Vector tile source](#vector-tile-source)
- [PMTiles (serverless tiles)](#pmtiles)
- [Raster and raster-dem sources](#raster-sources)
- [Choosing a hosting strategy](#hosting-strategies)
- [Schemas, TileJSON, and style URLs](#schemas-tilejson)

## Vector vs raster tiles {#vector-vs-raster}

- **Vector tiles** encode geometry as compact binary data, styled client-side. Smaller, queryable, restylable without regenerating. Most MapLibre workflows use these.
- **Raster tiles** are pre-rendered images. Larger, not queryable, but simple and ideal for satellite/aerial imagery or WMS layers.

Mixing is normal and supported: a style can hold any number of sources of any type at once (e.g. raster satellite basemap + vector labels + a GeoJSON overlay). Layers from different sources composite in draw order.

## GeoJSON source {#geojson-source}

Best for your own point/line/polygon data at small-to-medium scale (roughly under ~50k features).

```js
map.addSource('places', {
  type: 'geojson',
  data: '/data/places.geojson', // URL preferred over an inline object for large data
  promoteId: 'id'               // use a feature property as the feature id (enables updateData & feature-state)
});
```

Update it:
```js
const src = map.getSource('places'); // TS: as maplibregl.GeoJSONSource
src.setData(newGeoJSON);             // replace everything, re-render
// For big sources changed incrementally, updateData with unique ids is far faster — see performance.md
```

Set `cluster: true` to cluster points → see `clustering.md`. For large GeoJSON, see the optimization steps in `performance.md`, and consider converting to vector tiles.

## Vector tile source {#vector-tile-source}

Best for large datasets and basemaps: the client downloads only the tiles for the current viewport and zoom.

```js
map.addSource('basemap', {
  type: 'vector',
  url: 'https://example.com/tiles.json'      // a TileJSON endpoint (preferred)
  // or: tiles: ['https://example.com/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14
});

map.addLayer({
  id: 'roads',
  type: 'line',
  source: 'basemap',
  'source-layer': 'transportation', // REQUIRED for vector sources — must match the tile schema
  paint: { 'line-color': '#888' }
});
```

`source-layer` names come from the tileset's **schema** (see below). Getting this wrong = nothing draws.

Generate vector tiles with **Tippecanoe** (GeoJSON → MBTiles), **Planetiler** (OSM planet → MBTiles/PMTiles), or **Martin** (serve MVT directly from PostGIS on the fly — comfortably handles multi-GB databases).

## PMTiles (serverless tiles) {#pmtiles}

A single `.pmtiles` archive containing a whole tile pyramid, hosted on static storage (S3, Cloudflare R2, GitHub Pages). MapLibre requests byte ranges over HTTP — **no tile server**. Ideal for static datasets and offline/air-gapped use.

MapLibre doesn't speak PMTiles natively; register the protocol:

```js
import { Protocol } from 'pmtiles';
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

map.addSource('data', {
  type: 'vector', // or 'raster' / 'raster-dem'
  url: 'pmtiles://https://example.com/data.pmtiles'
});
```

Host requirements: the server must send `Access-Control-Allow-Origin` and allow the `Range` header (CORS), and should set a long `Cache-Control` for the immutable file. Convert existing MBTiles with `pmtiles convert in.mbtiles out.pmtiles`; inspect with `pmtiles show <file>`.

## Raster and raster-dem sources {#raster-sources}

```js
// Satellite / aerial / any XYZ raster
map.addSource('satellite', {
  type: 'raster',
  tiles: ['https://example.com/{z}/{x}/{y}.jpg'],
  tileSize: 256,
  attribution: '© Provider'
});
map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite' });

// Terrain elevation (Terrarium/Mapzen-encoded), for 3D terrain and hillshade
map.addSource('terrain', { type: 'raster-dem', url: 'https://example.com/terrain.json' });
map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
```

## Choosing a hosting strategy {#hosting-strategies}

- **Hosted tile service** (MapTiler, Stadia, Jawg, etc.): a provider style URL or tile endpoint. No infrastructure, CDN-backed. Trade-offs: API keys, usage limits, attribution requirements, and schema lock-in for custom styling.
- **Serverless (PMTiles):** one file on static storage. Minimal cost, offline-capable. Updates require regenerating the file. Best for static datasets.
- **Self-hosted** (Martin, tileserver-gl, TiTiler): full control, no per-request cost at scale, supports live updates and air-gapped deployment. Requires running infrastructure, CORS config, and supplying your own glyphs and sprite.

See "Map/Tile Providers" and "Tile Servers" in [awesome-maplibre](https://github.com/maplibre/awesome-maplibre).

## Schemas, TileJSON, and style URLs {#schemas-tilejson}

- A **style** is the JSON passed to the `Map` — it lists sources, an ordered list of layers, and points to glyphs + sprite. A **pre-built style URL** from a provider comes with sources/layers/glyphs/sprite ready to use and already matches its own tile schema.
- When you write custom layers against a vector source, your `source-layer` values must match the tileset's **schema**. Common schemas: **OpenMapTiles** and **Shortbread**. Provider style URLs already match their provider's schema.
- **TileJSON** is the standard descriptor for a tileset (tile URL template, zoom range, bounds, attribution, and available source-layers). Point a source at it with `url: 'https://.../tiles.json'` and MapLibre reads the rest, rather than hardcoding a `tiles` template.
- **MLT (MapLibre Tile)** is MapLibre's modern open successor to MVT with better compression and 3D/elevation support, usable in GL JS and Native. Standard MVT remains the default in most pipelines today.
