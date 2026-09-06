import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
// Issue #282, Phase E: colocated with the library import instead of a
// blanket StorefrontApp.jsx-level import -- this file is now only reached
// via TrackingRouteMapLazy.jsx's dynamic import(), so the CSS loads only
// when a tracking map actually renders instead of on every storefront page.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ensureMapImage,
  ensureRouteLineLayer,
  setGeoJsonSourceData,
  setRouteLineData
} from '../discovery/model/discoveryMapLayers.js';
import { renderDeliveryPinSpriteSvg } from '../discovery/model/businessModePins.js';
import { applyMapLibreCanvasSizing, safeResizeMap } from '../../../../packages/web-core/src/components/maps/mapLibreShared.js';
import { useStoreRoute } from '../shared/hooks/useStoreRoute.js';
import { TRACKING_MAP_HEIGHT } from './trackingMapSizing.js';
import './TrackingRouteMap.css';
// Re-exported for back-compat with anything importing both the component
// and the helper from this path (see extractTrackingMapCoordinates.js for
// why production code should prefer importing the helper from there
// directly instead).
export { extractTrackingMapCoordinates } from './extractTrackingMapCoordinates.js';

const TRACKING_PIN_SOURCE_ID = 'dgfy-tracking-route-pins';
const TRACKING_PIN_LAYER_ID = 'dgfy-tracking-route-pin-symbols';

const hasCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude))
  && Number.isFinite(Number(point?.longitude))
);

export default function TrackingRouteMap({
  storePin = null,
  customerPin = null,
  styleUrl,
  transformRequest,
  mapHeight = TRACKING_MAP_HEIGHT
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  const hasStorePin = hasCoordinate(storePin);
  const hasCustomerPin = hasCoordinate(customerPin);
  const hasRoute = hasStorePin && hasCustomerPin;

  const { geometry: routeGeometry } = useStoreRoute({
    origin: storePin,
    destination: customerPin,
    enabled: hasRoute
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasStorePin || !styleUrl) return undefined;

    const center = hasCustomerPin
      ? [(storePin.longitude + customerPin.longitude) / 2, (storePin.latitude + customerPin.latitude) / 2]
      : [storePin.longitude, storePin.latitude];

    let map;
    try {
      map = hasCustomerPin
        ? new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          transformRequest,
          bounds: [
            [Math.min(storePin.longitude, customerPin.longitude), Math.min(storePin.latitude, customerPin.latitude)],
            [Math.max(storePin.longitude, customerPin.longitude), Math.max(storePin.latitude, customerPin.latitude)]
          ],
          fitBoundsOptions: { padding: 40 }
        })
        : new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          transformRequest,
          center,
          zoom: 14
        });
    } catch (error) {
      console.warn('[TrackingRouteMap] MapLibre init unavailable', error);
      setMapUnavailable(true);
      return undefined;
    }
    applyMapLibreCanvasSizing(map);
    map.on('error', (event) => console.error('[TrackingRouteMap] MapLibre error', event));
    mapRef.current = map;

    map.on('load', () => {
      if (hasCustomerPin) {
        ensureRouteLineLayer(map, { dashArray: [2, 2] });
        setRouteLineData(map, {
          type: 'LineString',
          coordinates: [
            [storePin.longitude, storePin.latitude],
            [customerPin.longitude, customerPin.latitude]
          ]
        });
      }

      map.addSource(TRACKING_PIN_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: TRACKING_PIN_LAYER_ID,
        type: 'symbol',
        source: TRACKING_PIN_SOURCE_ID,
        layout: {
          'icon-image': ['get', 'kind'],
          'icon-anchor': 'bottom',
          'icon-size': 1,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      const images = hasCustomerPin
        ? [ensureMapImage(map, 'store', renderDeliveryPinSpriteSvg('store')), ensureMapImage(map, 'customer', renderDeliveryPinSpriteSvg('customer'))]
        : [ensureMapImage(map, 'store', renderDeliveryPinSpriteSvg('store'))];

      Promise.all(images).then(() => {
        if (mapRef.current !== map) return;
        const features = [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [storePin.longitude, storePin.latitude] },
          properties: { kind: 'store' }
        }];
        if (hasCustomerPin) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [customerPin.longitude, customerPin.latitude] },
            properties: { kind: 'customer' }
          });
        }
        setGeoJsonSourceData(map, TRACKING_PIN_SOURCE_ID, { type: 'FeatureCollection', features });
      });

      setMapReady(true);
    });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(() => safeResizeMap(map, containerRef.current));
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // storePin/customerPin/styleUrl/transformRequest identity changes are rare
    // (a tracking session doesn't relocate); re-running only on hasStorePin/
    // hasCustomerPin avoids tearing the map down on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStorePin, hasCustomerPin, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasCustomerPin || !routeGeometry) return;
    setRouteLineData(map, routeGeometry);
  }, [routeGeometry, mapReady, hasCustomerPin]);

  const hasCustomHeight = typeof mapHeight === 'number'
    || (typeof mapHeight === 'string' && mapHeight.trim().length > 0 && mapHeight !== TRACKING_MAP_HEIGHT);
  const resolvedHeight = hasCustomHeight
    ? (typeof mapHeight === 'number' ? `${mapHeight}px` : String(mapHeight))
    : null;
  const mapFrameStyle = resolvedHeight ? { height: resolvedHeight } : {};

  if (!hasStorePin || mapUnavailable) {
    return (
      <div className="storefront-tracking-map-frame" style={{ ...mapFrameStyle, borderRadius: 20, border: '1px solid #dbe5ee', background: '#f8fafc', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
        Store map unavailable
      </div>
    );
  }

  return <div ref={containerRef} className="storefront-tracking-map-frame" style={{ ...mapFrameStyle, borderRadius: 20, overflow: 'hidden', border: '1px solid #dbe5ee' }} />;
}
