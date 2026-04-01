import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = { latitude: 14.5995, longitude: 120.9842 };

const pinIcon = L.divIcon({
  className: '',
  iconSize: [24, 34],
  iconAnchor: [12, 33],
  popupAnchor: [0, -30],
  html: `<div style="position:relative;width:24px;height:34px;display:flex;align-items:center;justify-content:center;">
    <div style="width:18px;height:18px;border-radius:999px;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.28);background:linear-gradient(135deg,#0f766e,#14b8a6);"></div>
    <div style="position:absolute;bottom:1px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #0f766e;"></div>
  </div>`
});

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
  const circleRef = useRef(null);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);

  useEffect(() => {
    onCoordinatesChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      zoomControl: true
    }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const handleClick = (event) => {
      if (disabled) return;
      const nextLat = toFiniteNumber(event?.latlng?.lat);
      const nextLng = toFiniteNumber(event?.latlng?.lng);
      if (!isValidCoordinate(nextLat, nextLng)) return;

      onCoordinatesChangeRef.current?.({
        latitude: normalizeCoordinate(nextLat),
        longitude: normalizeCoordinate(nextLng)
      });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lat = toFiniteNumber(latitude);
    const lng = toFiniteNumber(longitude);

    if (!isValidCoordinate(lat, lng)) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
      return;
    }

    if (!markerRef.current) {
      const marker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: !disabled
      }).addTo(map);

      marker.on('dragend', (event) => {
        if (disabled) return;
        const position = event?.target?.getLatLng?.();
        const nextLat = toFiniteNumber(position?.lat);
        const nextLng = toFiniteNumber(position?.lng);
        if (!isValidCoordinate(nextLat, nextLng)) return;
        onCoordinatesChangeRef.current?.({
          latitude: normalizeCoordinate(nextLat),
          longitude: normalizeCoordinate(nextLng)
        });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([lat, lng]);
      if (markerRef.current.dragging) {
        if (disabled) markerRef.current.dragging.disable();
        else markerRef.current.dragging.enable();
      }
    }

    const radiusMeters = Math.max(0, Number(deliveryRadiusKm) || 0) * 1000;
    if (!circleRef.current) {
      circleRef.current = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#0f766e',
        fillColor: '#14b8a6',
        fillOpacity: 0.1,
        weight: 1.5
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(radiusMeters);
    }

    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: false });
  }, [latitude, longitude, deliveryRadiusKm, disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.invalidateSize(), 120);
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
