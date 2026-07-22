# Clustering points in MapLibre GL JS

Clustering groups nearby points into aggregate markers at low zoom and splits them apart as you zoom in. MapLibre does this **client-side** on a **GeoJSON source** using [Supercluster](https://github.com/mapbox/supercluster) running in a web worker — you don't add a library, you just set `cluster: true`. Vector-tile sources cannot be clustered this way (their aggregation happens when the tiles are generated).

Use clustering whenever many points would overlap into an unreadable clump — store locators, sensors, listings, incidents, etc.

## Table of contents
- [Cluster source options](#cluster-source-options)
- [Auto-generated properties](#auto-generated-properties)
- [The canonical three-layer pattern](#the-canonical-three-layer-pattern)
- [Interaction: click to zoom, popups, cursor](#interaction)
- [Aggregating custom values with clusterProperties](#clusterproperties)
- [Inspecting a cluster's contents](#inspecting-a-cluster)
- [HTML-marker clusters (donut charts etc.)](#html-marker-clusters)
- [Updating and tuning](#updating-and-tuning)

## Cluster source options

```js
map.addSource('points', {
  type: 'geojson',
  data: '/data/points.geojson', // a URL — avoid inlining large data
  cluster: true,
  clusterRadius: 50,     // px radius each cluster covers (default 50). Larger = fewer, bigger clusters
  clusterMaxZoom: 14,    // above this zoom, stop clustering and show individual points
  clusterMinPoints: 2,   // min points needed to form a cluster (default 2)
  // clusterProperties: {...}  // optional aggregations — see below
});
```

Tuning intuition: raise `clusterRadius` to reduce clutter on dense maps; lower `clusterMaxZoom` so points break apart sooner as the user zooms in.

## Auto-generated properties

When `cluster: true`, MapLibre adds these properties to **cluster** features:
- `cluster` — `true` on cluster features (individual points don't have it).
- `cluster_id` — the id you pass to the cluster helper methods.
- `point_count` — number of points in the cluster.
- `point_count_abbreviated` — a shortened label (e.g. `1.2k`) for display.

Filter layers on `['has', 'point_count']` (clusters) vs `['!', ['has', 'point_count']]` (individual points).

## The canonical three-layer pattern

One source feeds three layers: cluster circles, cluster count labels, and unclustered points. This is the standard, verified pattern.

```js
map.on('load', () => {
  map.addSource('points', {
    type: 'geojson',
    data: '/data/points.geojson',
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 14
  });

  // 1) Cluster circles — sized and colored by point_count via step expressions
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'points',
    filter: ['has', 'point_count'],
    paint: {
      // < 100 blue, 100–749 yellow, >= 750 pink
      'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
      'circle-radius': ['step', ['get', 'point_count'], 18, 100, 25, 750, 35]
    }
  });

  // 2) Count labels on the clusters
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'points',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'], // MUST exist in the style's glyphs (see gotcha #5)
      'text-size': 12
    }
  });

  // 3) Individual (unclustered) points
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'points',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#11b4da',
      'circle-radius': 6,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  });
});
```

## Interaction

Click a cluster to zoom to the level where it breaks apart, click a point for a popup, and show a pointer cursor on hover. **`getClusterExpansionZoom` is async in v5 — `await` it** (a common bug when copying old callback-style Mapbox code).

```js
// Zoom into a cluster on click
map.on('click', 'clusters', async (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
  const clusterId = features[0].properties.cluster_id;
  const source = map.getSource('points'); // in TS: as maplibregl.GeoJSONSource
  const zoom = await source.getClusterExpansionZoom(clusterId);
  map.easeTo({ center: features[0].geometry.coordinates, zoom });
});

// Popup for an individual point
map.on('click', 'unclustered-point', (e) => {
  const coordinates = e.features[0].geometry.coordinates.slice();
  const props = e.features[0].properties;
  // If zoomed out so copies of the world are visible, keep the popup over the clicked copy
  while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
  }
  new maplibregl.Popup()
    .setLngLat(coordinates)
    .setHTML(`<strong>${props.name ?? 'Point'}</strong>`)
    .addTo(map);
});

// Cursor affordance
for (const layer of ['clusters', 'unclustered-point']) {
  map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
}
```

## clusterProperties

`clusterProperties` computes aggregated values per cluster from its member points, so a cluster can carry sums, counts-by-category, maxes, etc. Each entry is `[operator, mapExpression]` where the operator reduces over points.

```js
map.addSource('earthquakes', {
  type: 'geojson',
  data: '/data/earthquakes.geojson',
  cluster: true,
  clusterRadius: 80,
  clusterProperties: {
    // total magnitude across the cluster
    sumMag: ['+', ['get', 'mag']],
    // count how many strong quakes (mag >= 5) — accumulate a boolean-as-number
    strongCount: ['+', ['case', ['>=', ['get', 'mag'], 5], 1, 0]],
    // highest magnitude in the cluster
    maxMag: ['max', ['get', 'mag']]
  }
});
```

Read the aggregated value back with `['get', 'sumMag']` in a paint/layout expression, or from `feature.properties.sumMag` in an event handler. This is what powers category-weighted cluster colors and donut/pie clusters.

## Inspecting a cluster

Two async helpers fetch the underlying points:

```js
const source = map.getSource('points');
// All original points in a cluster (pass point_count as the limit)
const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
// The immediate children on the next zoom level
const children = await source.getClusterChildren(clusterId);
```

Use `getClusterLeaves` to build a "what's in this cluster" list/preview without zooming.

## HTML-marker clusters

For custom cluster visuals (donut charts showing category breakdowns, badges, animated markers) you render **HTML `Marker`s** instead of a circle layer, and keep them in sync with the viewport. Pattern:

1. Add the clustered GeoJSON source (usually with `clusterProperties` for the category counts) but **don't** add a circle layer for clusters — add an invisible or minimal layer, or none, and drive markers from the source data.
2. On `render` (or `moveend`/`data`), call `map.querySourceFeatures('points')`, iterate features, and for each cluster build/update a DOM `Marker` (e.g. an SVG donut from the `clusterProperties`). Track markers by `cluster_id`, add new ones, and remove markers whose clusters left the viewport.
3. Individual points can still be a normal `circle`/`symbol` layer.

This is more code and more CPU than layer-based clusters (DOM nodes vs GPU), so use it only when the visual genuinely needs HTML. For plain "colored circle with a count," the three-layer pattern above is faster and simpler. The official example is "Display HTML clusters with custom properties."

## Updating and tuning

- **Change clustering at runtime:** `map.getSource('points').setClusterOptions({ cluster: true, clusterRadius: 80, clusterMaxZoom: 12 })` re-clusters without recreating the source.
- **Swap the data:** `source.setData(newGeoJSON)` replaces everything and re-clusters. For incremental changes to huge sources, prefer `updateData` with unique feature ids (see `performance.md`).
- **Performance:** clustering keeps point layers cheap because only cluster aggregates render at low zoom. Above `clusterMaxZoom`, individual points show; if that set is still very large, see `performance.md` (consider vector tiles or a heatmap). Load the GeoJSON from a URL rather than inlining it.
- **`fadeDuration: 0`** on the map constructor makes cluster circles and their count labels move together during zoom instead of the text lagging — a nice polish detail for cluster-heavy maps.
