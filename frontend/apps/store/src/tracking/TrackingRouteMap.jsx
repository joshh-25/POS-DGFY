import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude))
  && Number.isFinite(Number(point?.longitude))
);

const buildMarkerElement = (color, label = '') => {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'grid';
  wrapper.style.gap = '6px';
  wrapper.style.justifyItems = 'center';
  wrapper.style.transform = 'translateY(-6px)';

  const marker = document.createElement('div');
  marker.style.width = '16px';
  marker.style.height = '16px';
  marker.style.borderRadius = '999px';
  marker.style.background = color;
  marker.style.border = '2px solid #ffffff';
  marker.style.boxShadow = '0 4px 10px rgba(15,23,42,.25)';
  wrapper.appendChild(marker);

  if (label) {
    const badge = document.createElement('div');
    badge.textContent = label;
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '800';
    badge.style.letterSpacing = '0.02em';
    badge.style.color = '#0f172a';
    badge.style.background = 'rgba(255,255,255,0.96)';
    badge.style.border = '1px solid #dbe5ee';
    badge.style.borderRadius = '999px';
    badge.style.padding = '3px 8px';
    badge.style.boxShadow = '0 3px 10px rgba(15,23,42,.12)';
    badge.style.whiteSpace = 'nowrap';
    wrapper.appendChild(badge);
  }

  return wrapper;
};

export default function TrackingRouteMap({
  storePin = null,
  customerPin = null,
  styleUrl,
  transformRequest,
  mapHeight = 280
}) {
  const mapRootRef = useRef(null);
  const mapRef = useRef(null);
  const storeMarkerRef = useRef(null);
  const customerMarkerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return;
    const initialCenter = hasCoordinate(storePin)
      ? [Number(storePin.longitude), Number(storePin.latitude)]
      : [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude];

    const map = new maplibregl.Map({
      container: mapRootRef.current,
      style: styleUrl,
      center: initialCenter,
      zoom: 13,
      attributionControl: true,
      transformRequest
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        try {
          map.resize();
        } catch {
          // ignore resize races during unmount
        }
      });
      observer.observe(mapRootRef.current);
      resizeObserverRef.current = observer;
    }

    map.once('load', () => {
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          // ignore map teardown race
        }
      });
    });

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (storeMarkerRef.current) {
        storeMarkerRef.current.remove();
        storeMarkerRef.current = null;
      }
      if (customerMarkerRef.current) {
        customerMarkerRef.current.remove();
        customerMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [storePin, styleUrl, transformRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const normalizedStorePin = hasCoordinate(storePin) ? {
      latitude: Number(storePin.latitude),
      longitude: Number(storePin.longitude)
    } : null;
    const normalizedCustomerPin = hasCoordinate(customerPin) ? {
      latitude: Number(customerPin.latitude),
      longitude: Number(customerPin.longitude)
    } : null;

    if (storeMarkerRef.current) {
      storeMarkerRef.current.remove();
      storeMarkerRef.current = null;
    }
    if (customerMarkerRef.current) {
      customerMarkerRef.current.remove();
      customerMarkerRef.current = null;
    }

    if (normalizedStorePin) {
      storeMarkerRef.current = new maplibregl.Marker({ element: buildMarkerElement('#1a4e8d', 'Store') })
        .setLngLat([normalizedStorePin.longitude, normalizedStorePin.latitude])
        .addTo(map);
    }
    if (normalizedCustomerPin) {
      customerMarkerRef.current = new maplibregl.Marker({ element: buildMarkerElement('#ea580c', 'Customer') })
        .setLngLat([normalizedCustomerPin.longitude, normalizedCustomerPin.latitude])
        .addTo(map);
    }

    const updateRouteLayer = () => {
      const routeSourceId = 'tracking-route-source';
      const routeLayerId = 'tracking-route-line';
      const hasRoute = Boolean(normalizedStorePin && normalizedCustomerPin);
      const existingSource = map.getSource(routeSourceId);

      try {
        map.resize();
      } catch {
        // ignore while style/container are settling
      }

      if (!hasRoute) {
        if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (existingSource) map.removeSource(routeSourceId);
      } else {
        const routeFeature = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [normalizedStorePin.longitude, normalizedStorePin.latitude],
              [normalizedCustomerPin.longitude, normalizedCustomerPin.latitude]
            ]
          }
        };
        if (existingSource) {
          existingSource.setData(routeFeature);
        } else {
          map.addSource(routeSourceId, {
            type: 'geojson',
            data: routeFeature
          });
          map.addLayer({
            id: routeLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': '#1a4e8d',
              'line-width': 4,
              'line-opacity': 0.8,
              'line-dasharray': [2, 2]
            }
          });
        }
      }

      if (normalizedStorePin && normalizedCustomerPin) {
        const bounds = new maplibregl.LngLatBounds(
          [normalizedStorePin.longitude, normalizedStorePin.latitude],
          [normalizedCustomerPin.longitude, normalizedCustomerPin.latitude]
        );
        map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 350 });
      } else if (normalizedStorePin) {
        map.easeTo({ center: [normalizedStorePin.longitude, normalizedStorePin.latitude], zoom: 14, duration: 350 });
      } else if (normalizedCustomerPin) {
        map.easeTo({ center: [normalizedCustomerPin.longitude, normalizedCustomerPin.latitude], zoom: 14, duration: 350 });
      } else {
        map.easeTo({ center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude], zoom: 12, duration: 350 });
      }
    };

    if (map.isStyleLoaded()) {
      updateRouteLayer();
    } else {
      map.once('load', updateRouteLayer);
    }
  }, [customerPin, storePin]);

  const hasStorePin = hasCoordinate(storePin);
  const hasCustomerPin = hasCoordinate(customerPin);
  const hasRoute = hasStorePin && hasCustomerPin;

  return (
    <div style={{ height: mapHeight, borderRadius: 20, border: '1px solid #e2e8f0', background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>
      <div ref={mapRootRef} style={{ width: '100%', height: '100%' }} />
      {!hasRoute && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,0.92)', border: '1px solid #dbe5ee', borderRadius: 12, padding: '8px 10px', fontSize: 12, color: '#475569' }}>
          {hasStorePin && !hasCustomerPin ? 'Waiting for customer pin to draw route.' : 'Map centered on store area.'}
        </div>
      )}
      {hasRoute && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,0.92)', border: '1px solid #dbe5ee', borderRadius: 12, padding: '8px 10px', fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: '3px dashed #1a4e8d' }} />
          Planned route preview (not live GPS yet)
        </div>
      )}
    </div>
  );
}

export const extractTrackingMapCoordinates = (trackingResult, selectedStore, selectedLocation) => {
  const raw = trackingResult?.raw || {};
  const fromTracking = {
    storeLatitude: toNumberOrNull(trackingResult?.storeLatitude ?? raw?.location?.latitude ?? raw?.order?.location_latitude ?? raw?.order?.store_latitude),
    storeLongitude: toNumberOrNull(trackingResult?.storeLongitude ?? raw?.location?.longitude ?? raw?.order?.location_longitude ?? raw?.order?.store_longitude),
    customerLatitude: toNumberOrNull(trackingResult?.customerLatitude ?? raw?.delivery_latitude ?? raw?.order?.delivery_latitude),
    customerLongitude: toNumberOrNull(trackingResult?.customerLongitude ?? raw?.delivery_longitude ?? raw?.order?.delivery_longitude)
  };

  const fromSelection = {
    storeLatitude: toNumberOrNull(selectedLocation?.latitude ?? selectedStore?.latitude),
    storeLongitude: toNumberOrNull(selectedLocation?.longitude ?? selectedStore?.longitude)
  };

  return {
    storePin: (Number.isFinite(fromTracking.storeLatitude) && Number.isFinite(fromTracking.storeLongitude))
      ? { latitude: fromTracking.storeLatitude, longitude: fromTracking.storeLongitude }
      : (Number.isFinite(fromSelection.storeLatitude) && Number.isFinite(fromSelection.storeLongitude))
        ? { latitude: fromSelection.storeLatitude, longitude: fromSelection.storeLongitude }
        : null,
    customerPin: (Number.isFinite(fromTracking.customerLatitude) && Number.isFinite(fromTracking.customerLongitude))
      ? { latitude: fromTracking.customerLatitude, longitude: fromTracking.customerLongitude }
      : null
  };
};
