# Framework integration: React, Vue, Angular

The universal rules across every framework:

1. **Create the map after the container element exists**, using a ref/DOM node — never a hardcoded id in reusable components.
2. **Wait for `load`** before adding sources/layers.
3. **Call `map.remove()` on unmount/destroy** — otherwise you leak WebGL contexts and workers, and hot-reload creates duplicate maps.
4. **Don't put the map instance in reactive state** (React state, Vue `ref`) — it's a large mutable object and doesn't need to trigger re-renders. Hold it in a ref/instance field.

You can use the raw `maplibre-gl` library directly (full control) or a binding library (idiomatic components). For anything non-trivial, the bindings save boilerplate.

- React → **react-map-gl** (`import { Map } from 'react-map-gl/maplibre'`), or raw library in a `useEffect`.
- Vue 3 → **@indoorequal/vue-maplibre-gl**.
- Angular → **@maplibre/ngx-maplibre-gl**.

## React (raw library)

```jsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return; // guard against React 18 StrictMode double-invoke
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-74.5, 40],
      zoom: 9
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: '/data/places.geojson' });
      map.addLayer({ id: 'places', type: 'circle', source: 'places',
        paint: { 'circle-radius': 6, 'circle-color': '#11b4da' } });
    });

    return () => { map.remove(); mapRef.current = null; }; // cleanup
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

The `if (mapRef.current) return` guard matters: React 18 StrictMode runs effects twice in development, which otherwise creates two maps.

## React (react-map-gl)

```jsx
import { Map, Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapView() {
  return (
    <Map
      initialViewState={{ longitude: -74.5, latitude: 40, zoom: 9 }}
      mapStyle="https://demotiles.maplibre.org/style.json"
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" />
      <Source id="places" type="geojson" data="/data/places.geojson" cluster>
        <Layer id="clusters" type="circle" filter={['has', 'point_count']}
          paint={{ 'circle-color': '#51bbd6', 'circle-radius': 18 }} />
      </Source>
    </Map>
  );
}
```

`react-map-gl` manages the lifecycle and cleanup for you; declare sources/layers as children. Use `initialViewState` for uncontrolled camera; use `viewState` + `onMove` only if you need to control it from state.

## Vue 3 (raw library)

```vue
<script setup>
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const el = useTemplateRef('mapEl');
let map; // plain variable, NOT a ref

onMounted(() => {
  map = new maplibregl.Map({
    container: el.value,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [-74.5, 40],
    zoom: 9
  });
  map.on('load', () => { /* addSource / addLayer */ });
});

onUnmounted(() => { map?.remove(); });
</script>

<template>
  <div ref="mapEl" style="width: 100%; height: 100%;" />
</template>
```

Or use **vue-maplibre-gl**'s `<mgl-map>`, `<mgl-geo-json-source>`, `<mgl-navigation-control>` components, which wrap this lifecycle.

## Angular

```ts
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import maplibregl from 'maplibre-gl';

@Component({
  selector: 'app-map',
  template: `<div #mapEl style="width:100%;height:100%"></div>`
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  private map!: maplibregl.Map;

  ngAfterViewInit() {
    this.map = new maplibregl.Map({
      container: this.mapEl.nativeElement,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-74.5, 40],
      zoom: 9
    });
    this.map.on('load', () => { /* addSource / addLayer */ });
  }

  ngOnDestroy() { this.map?.remove(); }
}
```

Import the CSS globally (e.g. in `angular.json` styles or `styles.css`: `@import 'maplibre-gl/dist/maplibre-gl.css';`). Or use **ngx-maplibre-gl**'s `<mgl-map>` component. Create the map in `ngAfterViewInit` (the `@ViewChild` element doesn't exist earlier).

## Common framework pitfalls

- **Zero-height container → blank map.** The map fills its parent; if the parent has no height, you see nothing. Give the container an explicit height (`100%` only works if every ancestor up to a sized element also has height).
- **Resizing.** When a container resizes (sidebar toggle, tab switch), call `map.resize()`; the map doesn't always detect layout changes on its own.
- **Adding data before load.** In component code it's easy to call `addSource` too early — always gate on `map.on('load', ...)` or `map.isStyleLoaded()`.
- **SSR (Next.js/Nuxt).** MapLibre needs `window`/WebGL; render the map client-side only (dynamic import with `ssr: false`, or a mounted guard).
