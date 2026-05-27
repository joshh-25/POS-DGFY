import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const TILE_BASE = 'https://tiles.openfreemap.org';
const TILING_SERVER = import.meta.env.DEV
  ? '/openfreemap/styles/liberty'
  : (import.meta.env.VITE_TILING_SERVER || `${TILE_BASE}/styles/liberty`);
const tileTransformRequest = import.meta.env.DEV
  ? (url) => {
      if (url.startsWith(TILE_BASE)) {
        return { url: url.replace(TILE_BASE, '/openfreemap') };
      }
    }
  : undefined;

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };
const DEFAULT_ZOOM = 12;
const PIN_ZOOM = 16;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const RADIUS_SOURCE = 'delivery-radius';

const buildPinSvg = ({ highlighted = false } = {}) => {
  const gradientTop = highlighted ? '#5eead4' : '#14b8a6';
  const gradientBottom = highlighted ? '#0f766e' : '#115e59';
  const stroke = highlighted ? '#0f766e' : '#134e4a';
  const ringStroke = highlighted ? '#ccfbf1' : '#99f6e4';
  const innerDot = highlighted ? '#0f766e' : '#134e4a';
  const shineOpacity = highlighted ? 0.52 : 0.38;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="58" viewBox="0 0 42 58" fill="none">
  <defs>
    <filter id="ofm-pin-shadow" x="0" y="0" width="42" height="58" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="ofm-pin-gradient" x1="21" y1="3" x2="21" y2="50" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${gradientTop}"/>
      <stop offset="100%" stop-color="${gradientBottom}"/>
    </linearGradient>
  </defs>
  <g filter="url(#ofm-pin-shadow)">
    <path d="M21 3C11.059 3 3 11.059 3 21c0 14.5 15.8 31.9 16.5 32.7a1.9 1.9 0 0 0 3 0C23.2 52.9 39 35.5 39 21 39 11.059 30.941 3 21 3Z" fill="url(#ofm-pin-gradient)" stroke="${stroke}" stroke-width="2.4"/>
    <ellipse cx="16.8" cy="14.8" rx="8.2" ry="3.7" fill="#ffffff" opacity="${shineOpacity}"/>
    <circle cx="21" cy="21" r="7.6" fill="#ffffff" stroke="${ringStroke}" stroke-width="2.4"/>
    <circle cx="21" cy="21" r="2.9" fill="${innerDot}"/>
  </g>
</svg>`;
};

const makePinElement = (highlighted = false) => {
  const el = document.createElement('div');
  el.style.cssText = `width:42px;height:58px;cursor:${highlighted ? 'grab' : 'pointer'};`;
  el.innerHTML = buildPinSvg({ highlighted });
  return el;
};

const parseCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toFixedCoordinate = (value) => Number(value.toFixed(8));

function createCirclePolygon(centerLng, centerLat, radiusMeters, steps = 64) {
  if (!(radiusMeters > 0)) return null;
  const R = 6371000;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.sin(angle) / R) * (180 / Math.PI);
    const dLng = (radiusMeters * Math.cos(angle) / R) * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);
    coords.push([centerLng + dLng, centerLat + dLat]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
}

export default function MapPinPicker({
  latitude,
  longitude,
  deliveryRadiusKm,
  onChange,
  className
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pendingCircleDataRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const loadErrorRef = useRef('');
  const isPinDragModeRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isPinDragMode, setIsPinDragMode] = useState(false);

  const selectedPosition = useMemo(() => {
    const lat = parseCoordinate(latitude);
    const lng = parseCoordinate(longitude);
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [latitude, longitude]);

  const radiusMeters = useMemo(() => {
    const parsed = Number(deliveryRadiusKm);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed * 1000;
  }, [deliveryRadiusKm]);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { isPinDragModeRef.current = isPinDragMode; }, [isPinDragMode]);

  const resetViewport = () => {
    mapRef.current?.flyTo({
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: DEFAULT_ZOOM
    });
  };

  const centerToCurrentLocation = () => {
    if (!navigator?.geolocation) {
      setLoadError('Geolocation is not available in this browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = toFixedCoordinate(position.coords.latitude);
        const nextLongitude = toFixedCoordinate(position.coords.longitude);
        onChangeRef.current?.({ latitude: nextLatitude, longitude: nextLongitude });
        mapRef.current?.flyTo({ center: [nextLongitude, nextLatitude], zoom: PIN_ZOOM });
        setIsLocating(false);
      },
      () => {
        setLoadError('Unable to get your current location. Please allow location access.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Map initialisation
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return undefined;

    let isCancelled = false;
    let map;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: TILING_SERVER,
        transformRequest: tileTransformRequest,
        center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        bearing: 0,
        pitch: 0,
        // [swLng, swLat, neLng, neLat]. MapLibre uses lng-first order.
        maxBounds: [[-180, -85], [180, 85]]
      });
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    } catch {
      const loadErrorTimer = setTimeout(() => {
        setLoadError('Map failed to load. Please refresh and try again.');
      }, 0);
      return () => clearTimeout(loadErrorTimer);
    }

    map.once('load', () => {
      if (isCancelled) return;
      map.addSource(RADIUS_SOURCE, {
        type: 'geojson',
        data: pendingCircleDataRef.current ?? { type: 'FeatureCollection', features: [] }
      });
      pendingCircleDataRef.current = null;
      map.addLayer({
        id: `${RADIUS_SOURCE}-fill`,
        type: 'fill',
        source: RADIUS_SOURCE,
        paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.22 }
      });
      map.addLayer({
        id: `${RADIUS_SOURCE}-line`,
        type: 'line',
        source: RADIUS_SOURCE,
        paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-opacity': 0.95 }
      });
      if (!isCancelled) setIsMapReady(true);
    });

    map.on('click', (event) => {
      const lat = toFixedCoordinate(event.lngLat.lat);
      const lng = toFixedCoordinate(event.lngLat.lng);
      onChangeRef.current?.({ latitude: lat, longitude: lng });
      // Camera movement handled by the selectedPosition effect via jumpTo
    });

    map.on('error', () => {
      if (!loadErrorRef.current && !isCancelled) {
        const message = 'Map tiles failed to load. Check connection or disable blocking extensions.';
        loadErrorRef.current = message;
        setLoadError(message);
      }
    });

    mapRef.current = map;

    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => map.resize());
      resizeObserverRef.current.observe(containerRef.current);
    }

    // Kick initial resize after the browser has painted
    setTimeout(() => {
      if (!isCancelled) {
        map.resize();
        setIsMapReady(true);
      }
    }, 0);

    return () => {
      isCancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync drag-mode appearance onto the existing marker
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    marker.setDraggable(isPinDragMode);
    const el = marker.getElement();
    if (el) {
      el.innerHTML = buildPinSvg({ highlighted: isPinDragMode });
      el.style.cursor = isPinDragMode ? 'grab' : 'pointer';
    }
    map.getCanvas().style.cursor = isPinDragMode ? 'grab' : '';
  }, [isPinDragMode, selectedPosition]);

  // Marker position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedPosition) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const { latitude: lat, longitude: lng } = selectedPosition;

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({
        element: makePinElement(false),
        anchor: 'bottom',
        draggable: false
      }).setLngLat([lng, lat]).addTo(map);

      marker.on('dragstart', () => {
        map.getCanvas().style.cursor = 'grabbing';
        const el = marker.getElement();
        if (el) {
          el.innerHTML = buildPinSvg({ highlighted: true });
          el.style.cursor = 'grabbing';
        }
      });

      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        const dragging = isPinDragModeRef.current;
        map.getCanvas().style.cursor = dragging ? 'grab' : '';
        const el = marker.getElement();
        if (el) {
          el.innerHTML = buildPinSvg({ highlighted: dragging });
          el.style.cursor = dragging ? 'grab' : 'pointer';
        }
        onChangeRef.current?.({
          latitude: toFixedCoordinate(pos.lat),
          longitude: toFixedCoordinate(pos.lng)
        });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }

    const currentZoom = map.getZoom();
    map.jumpTo({ center: [lng, lat], zoom: currentZoom < PIN_ZOOM ? PIN_ZOOM : currentZoom });
  }, [selectedPosition]);

  // Delivery radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasRadius = selectedPosition && radiusMeters > 0;
    const circle = hasRadius
      ? createCirclePolygon(selectedPosition.longitude, selectedPosition.latitude, radiusMeters)
      : null;
    const circleData = circle
      ? { type: 'FeatureCollection', features: [circle] }
      : { type: 'FeatureCollection', features: [] };

    const source = map.getSource(RADIUS_SOURCE);
    if (source) {
      source.setData(circleData);
    } else {
      pendingCircleDataRef.current = circleData;
    }

    if (circle) {
      // Fit the viewport to include the full circle if it isn't already visible
      const R = 6371000;
      const { latitude: lat, longitude: lng } = selectedPosition;
      const dLat = (radiusMeters / R) * (180 / Math.PI);
      const dLng = dLat / Math.cos(lat * Math.PI / 180);
      const sw = [lng - dLng, lat - dLat];
      const ne = [lng + dLng, lat + dLat];
      const bounds = map.getBounds();
      if (!bounds.contains(sw) || !bounds.contains(ne)) {
        map.fitBounds([sw, ne], { padding: 24 });
      }
    }
  }, [selectedPosition, radiusMeters]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-teal-50 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-300 text-amber-900 hover:bg-amber-100"
          onClick={resetViewport}
        >
          Reset View
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-teal-300 text-teal-900 hover:bg-teal-100"
          onClick={centerToCurrentLocation}
          disabled={isLocating}
        >
          {isLocating ? 'Locating...' : 'Pin Current Location'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'border-slate-300 text-slate-800 hover:bg-slate-100',
            isPinDragMode && 'border-teal-400 bg-teal-50 text-teal-800 hover:bg-teal-100'
          )}
          onClick={() => setIsPinDragMode((prev) => !prev)}
          disabled={!selectedPosition}
        >
          {isPinDragMode ? 'Stop Moving Pin' : 'Adjust Pin'}
        </Button>
      </div>
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
        {!isMapReady ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-50/60 text-sm font-medium text-slate-600 backdrop-blur-[1px]">
            Loading map...
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="h-full w-full"
          role="application"
          aria-label="Map location picker"
        />
      </div>
      {loadError ? (
        <p className="text-xs text-red-600">{loadError}</p>
      ) : (
        <p className="text-xs text-slate-500">
          Pan the map to explore. Click to place a pin. Use `Adjust Pin` if you want to drag the marker precisely.
        </p>
      )}
      {selectedPosition && radiusMeters > 0 ? (
        <p className="text-xs text-teal-700">
          Delivery coverage preview: {(radiusMeters / 1000).toFixed(2)} km radius
        </p>
      ) : null}
      <p className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
        {selectedPosition
          ? `Pinned: ${selectedPosition.latitude.toFixed(6)}, ${selectedPosition.longitude.toFixed(6)}`
          : 'No pin selected yet.'}
      </p>
    </div>
  );
}
