# Interactivity: markers, popups, controls, events

## Events

Bind to the map, or to a specific **layer id** to only fire for features in that layer.

```js
map.on('load', () => { /* safe to add sources/layers */ });
map.on('click', 'my-layer', (e) => {
  const feature = e.features[0];        // the clicked feature
  const props = feature.properties;     // its properties (values may be strings)
  const [lng, lat] = e.lngLat.toArray(); // where the click landed
});
map.on('moveend', () => { /* viewport settled — good for loading viewport data */ });
```

Common map events: `load`, `styledata`, `sourcedata`, `idle`, `move`/`moveend`, `zoom`/`zoomend`, `dragend`, `mouseenter`/`mouseleave`/`mousemove` (layer-scoped), `click`/`dblclick`/`contextmenu`. Remove handlers with `map.off(...)` in cleanup.

**Hover cursor affordance** (do this for every clickable layer):
```js
map.on('mouseenter', 'my-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'my-layer', () => { map.getCanvas().style.cursor = ''; });
```

## queryRenderedFeatures / querySourceFeatures

```js
// What's under this pixel (respects layer filters and current render)?
const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'unclustered-point'] });

// All features currently in a source (regardless of what's painted) — used for HTML-marker clusters
const feats = map.querySourceFeatures('points', { sourceLayer: 'my-layer' /* vector only */ });
```

`queryRenderedFeatures` only sees features in the current viewport that are actually drawn. Use it for clicks/hovers; use `querySourceFeatures` when you need the source's features directly.

## Markers (DOM pins)

Good for a small number of rich, interactive pins. Each is a DOM node — **don't** use for hundreds; use a `circle`/`symbol` layer instead (see SKILL.md decision guide).

```js
const marker = new maplibregl.Marker({ color: '#e11', draggable: false })
  .setLngLat([lng, lat])
  .addTo(map);

// Custom element
const el = document.createElement('div');
el.className = 'pin';
new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);

marker.remove(); // clean up
```

## Popups

```js
new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
  .setLngLat([lng, lat])
  .setHTML('<strong>Title</strong><p>Details</p>')
  .addTo(map);

// Attach a popup to a marker (toggles on marker click)
new maplibregl.Marker()
  .setLngLat([lng, lat])
  .setPopup(new maplibregl.Popup().setText('Hello'))
  .addTo(map);
```

When placing a popup from a click on a wrapped/zoomed-out map, normalize longitude so it appears over the copy the user clicked (see the `while (Math.abs(...) > 180)` snippet in `clustering.md`).

## Controls

```js
map.addControl(new maplibregl.NavigationControl(), 'top-right'); // zoom + compass
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
map.addControl(new maplibregl.FullscreenControl());
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true
}));
map.addControl(new maplibregl.AttributionControl({ compact: true }));
```

**Attribution is not optional** when using third-party tiles/styles — most providers require visible credit. Keep the `AttributionControl` (it's on by default) and set each source's `attribution`.

## Camera control

```js
map.flyTo({ center: [lng, lat], zoom: 12, speed: 1.2 });   // animated, curved
map.easeTo({ center: [lng, lat], zoom: 12 });              // animated, linear
map.jumpTo({ center: [lng, lat], zoom: 12 });              // instant
map.fitBounds([[west, south], [east, north]], { padding: 40 });
```

## RTL text

MapLibre doesn't reshape right-to-left scripts by default, so Arabic/Hebrew labels render reversed. Register the plugin **before** adding RTL data, once per page:

```js
maplibregl.setRTLTextPlugin(
  'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.4.0/dist/mapbox-gl-rtl-text.js',
  true // lazy-load
);
```

## Cleanup

In any app that unmounts the map (SPAs, framework components), call `map.remove()` to release the WebGL context, workers, and event listeners. See `frameworks.md`.
