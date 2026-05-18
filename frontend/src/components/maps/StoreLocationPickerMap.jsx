import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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

const DEFAULT_CENTER = { latitude: 14.5995, longitude: 120.9842 };
const RADIUS_SOURCE = 'delivery-radius';

const makePinElement = () => {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:24px;height:34px;display:flex;align-items:center;justify-content:center;cursor:grab;';
  el.innerHTML = '<div style="width:18px;height:18px;border-radius:999px;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.28);background:linear-gradient(135deg,#0f766e,#14b8a6);"></div>'
    + '<div style="position:absolute;bottom:1px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #0f766e;"></div>';
  return el;
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidCoordinate = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

const normalizeCoordinate = (value) => Number(value).toFixed(6);

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

export default function StoreLocationPickerMap({
  latitude,
  longitude,
  deliveryRadiusKm = 0,
  onCoordinatesChange,
  disabled = false
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pendingCircleDataRef = useRef(null);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);

  useEffect(() => {
    onCoordinatesChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILING_SERVER,
      transformRequest: tileTransformRequest,
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: 12
    });

    map.on('load', () => {
      map.addSource(RADIUS_SOURCE, {
        type: 'geojson',
        data: pendingCircleDataRef.current ?? { type: 'FeatureCollection', features: [] }
      });
      pendingCircleDataRef.current = null;
      map.addLayer({
        id: `${RADIUS_SOURCE}-fill`,
        type: 'fill',
        source: RADIUS_SOURCE,
        paint: { 'fill-color': '#14b8a6', 'fill-opacity': 0.1 }
      });
      map.addLayer({
        id: `${RADIUS_SOURCE}-line`,
        type: 'line',
        source: RADIUS_SOURCE,
        paint: { 'line-color': '#0f766e', 'line-width': 1.5 }
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const handleClick = (event) => {
      if (disabled) return;
      const nextLat = toFiniteNumber(event?.lngLat?.lat);
      const nextLng = toFiniteNumber(event?.lngLat?.lng);
      if (!isValidCoordinate(nextLat, nextLng)) return;
      onCoordinatesChangeRef.current?.({
        latitude: normalizeCoordinate(nextLat),
        longitude: normalizeCoordinate(nextLng)
      });
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lat = toFiniteNumber(latitude);
    const lng = toFiniteNumber(longitude);
    const radiusMeters = Math.max(0, Number(deliveryRadiusKm) || 0) * 1000;
    const circle = isValidCoordinate(lat, lng) ? createCirclePolygon(lng, lat, radiusMeters) : null;
    const circleData = circle
      ? { type: 'FeatureCollection', features: [circle] }
      : { type: 'FeatureCollection', features: [] };

    if (!isValidCoordinate(lat, lng)) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      const source = map.getSource(RADIUS_SOURCE);
      if (source) source.setData(circleData);
      else pendingCircleDataRef.current = circleData;
      return;
    }

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({
        element: makePinElement(),
        draggable: !disabled
      }).setLngLat([lng, lat]).addTo(map);

      marker.on('dragend', () => {
        if (disabled) return;
        const pos = marker.getLngLat();
        const nextLat = toFiniteNumber(pos?.lat);
        const nextLng = toFiniteNumber(pos?.lng);
        if (!isValidCoordinate(nextLat, nextLng)) return;
        onCoordinatesChangeRef.current?.({
          latitude: normalizeCoordinate(nextLat),
          longitude: normalizeCoordinate(nextLng)
        });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
      markerRef.current.setDraggable(!disabled);
    }

    const source = map.getSource(RADIUS_SOURCE);
    if (source) source.setData(circleData);
    else pendingCircleDataRef.current = circleData;

    map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
  }, [latitude, longitude, deliveryRadiusKm, disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.resize(), 120);
    return () => clearTimeout(timer);
  }, [latitude, longitude, deliveryRadiusKm, disabled]);

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200"
        style={{ height: 280 }}
      >
        <div ref={containerRef} className="h-full w-full" />
        {disabled && (
          <div className="absolute inset-0 bg-white/50" />
        )}
      </div>
      <p className="text-xs text-slate-500">
        Click the map or drag the pin to set exact coordinates used by storefront discovery and delivery radius.
      </p>
    </div>
  );
}
