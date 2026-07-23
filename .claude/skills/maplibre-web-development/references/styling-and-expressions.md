# Layers, styling, and expressions

Layers turn a source into pixels. Their appearance is controlled by **paint** and **layout** properties, and most of those can be **expressions** — small arrays that compute a value from feature properties, zoom, or state. This is what makes MapLibre maps data-driven.

## Layer types

- **circle** — points as scalable dots. Cheap, GPU-rendered; the go-to for lots of points. Key paint: `circle-radius`, `circle-color`, `circle-stroke-width`, `circle-stroke-color`, `circle-opacity`.
- **symbol** — icons and/or text labels. Key layout: `icon-image`, `text-field`, `text-font`, `text-size`, `text-anchor`, `text-offset`, `*-allow-overlap`/`*-overlap`. Text needs a font present in the style's glyphs.
- **line** — strokes for roads, routes, boundaries. Key paint: `line-color`, `line-width`, `line-dasharray`; layout `line-cap`, `line-join`.
- **fill** — filled polygons. Paint: `fill-color`, `fill-opacity`, `fill-outline-color`.
- **fill-extrusion** — 3D extruded polygons (buildings). Paint: `fill-extrusion-height`, `fill-extrusion-base`, `fill-extrusion-color`.
- **heatmap** — density surface from points. Paint: `heatmap-weight`, `heatmap-intensity`, `heatmap-color`, `heatmap-radius`.
- **raster** — image tiles. **background** — a solid/pattern fill behind everything.

Add, order, and manage layers:
```js
map.addLayer(layerObject, beforeId);   // beforeId inserts beneath an existing layer (controls draw order)
map.moveLayer('roads', 'labels');      // reorder
map.setPaintProperty('roads', 'line-color', '#f00');
map.setLayoutProperty('labels', 'visibility', 'none'); // toggle a layer
map.setFilter('roads', ['==', ['get', 'class'], 'motorway']);
```

## Expressions — the essentials

An expression is a JSON array `[operator, ...args]`. It's evaluated per feature (and re-evaluated as zoom changes). The ones you'll use most:

**Read data**
```js
['get', 'population']        // a feature property
['has', 'point_count']       // property exists?
['zoom']                     // current map zoom
['id']                       // feature id
```

**step** — pick a value from ascending thresholds. Ideal for discrete buckets (cluster sizes, choropleth-ish coloring).
```js
'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40]
// < 100 → 20, [100,750) → 30, >= 750 → 40
```

**interpolate** — smooth ramp between stops. Ideal for zoom-based sizing and continuous value ramps.
```js
// grow dots as you zoom in
'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 15, 12]
// color ramp by a numeric property
'fill-color': ['interpolate', ['linear'], ['get', 'density'],
  0, '#f7fbff', 500, '#6baed6', 2000, '#08306b']
```

**case** — if/else branching.
```js
'circle-color': ['case',
  ['>=', ['get', 'mag'], 5], '#e31a1c',
  ['>=', ['get', 'mag'], 3], '#fd8d3c',
  '#fed976'] // default (required last)
```

**match** — switch on a value.
```js
'icon-image': ['match', ['get', 'type'],
  'park', 'tree-icon',
  'cafe', 'coffee-icon',
  'default-icon'] // fallback (required last)
```

**Combining conditions:** `['all', condA, condB]`, `['any', ...]`, `['!', cond]`, comparisons `['==','!=','<','<=','>','>=']`. String helpers like `concat`, and math operators `+ - * /`, are available too.

## Feature-state (interactive styling without re-adding data)

For hover/selection highlights, use **feature-state** rather than mutating the source. Requires feature ids (set `promoteId` on the source if your ids live in properties).

```js
map.setFeatureState({ source: 'places', id: hoveredId }, { hover: true });

// in the layer paint:
'circle-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#ff0', '#088']
```

Clear it with `map.removeFeatureState({ source: 'places', id: hoveredId })`. This is far cheaper than calling `setData` on every hover.

## Tips

- Prefer expressions over JS loops that rewrite data — the GPU evaluates expressions efficiently and they respond to zoom automatically.
- `step` for buckets, `interpolate` for smooth ramps — reaching for the wrong one is a common source of ugly or janky styling.
- Every `case`/`match` needs a final default/fallback argument or it errors.
- Keep `text-font` values consistent with the style's glyph set (see the gotcha in SKILL.md).
