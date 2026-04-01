import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const DEFAULT_CENTER = {
  latitude: 10.7202,
  longitude: 122.5621
};
const DEFAULT_ZOOM = 12;
const PIN_ZOOM = 16;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const WORLD_BOUNDS = [[-85, -180], [85, 180]];

const buildPinSvgDataUrl = ({ highlighted = false } = {}) => {
  const gradientTop = highlighted ? '#5eead4' : '#14b8a6';
  const gradientBottom = highlighted ? '#0f766e' : '#115e59';
  const stroke = highlighted ? '#0f766e' : '#134e4a';
  const ringStroke = highlighted ? '#ccfbf1' : '#99f6e4';
  const innerDot = highlighted ? '#0f766e' : '#134e4a';
  const shineOpacity = highlighted ? 0.52 : 0.38;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="42" height="58" viewBox="0 0 42 58" fill="none">
  <defs>
    <filter id="shadow" x="0" y="0" width="42" height="58" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="pinGradient" x1="21" y1="3" x2="21" y2="50" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${gradientTop}"/>
      <stop offset="100%" stop-color="${gradientBottom}"/>
    </linearGradient>
  </defs>
  <g filter="url(#shadow)">
    <path d="M21 3C11.059 3 3 11.059 3 21c0 14.5 15.8 31.9 16.5 32.7a1.9 1.9 0 0 0 3 0C23.2 52.9 39 35.5 39 21 39 11.059 30.941 3 21 3Z" fill="url(#pinGradient)" stroke="${stroke}" stroke-width="2.4"/>
    <ellipse cx="16.8" cy="14.8" rx="8.2" ry="3.7" fill="#ffffff" opacity="${shineOpacity}"/>
    <circle cx="21" cy="21" r="7.6" fill="#ffffff" stroke="${ringStroke}" stroke-width="2.4"/>
    <circle cx="21" cy="21" r="2.9" fill="${innerDot}"/>
  </g>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const createPinIcon = (L, { highlighted = false } = {}) => L.icon({
  iconUrl: buildPinSvgDataUrl({ highlighted }),
  iconSize: [42, 58],
  iconAnchor: [21, 56],
  popupAnchor: [0, -44]
});

const parseCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toFixedCoordinate = (value) => Number(value.toFixed(8));

export default function OpenStreetMapPinPicker({
  latitude,
  longitude,
  deliveryRadiusKm,
  onChange,
  className
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const leafletRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const loadErrorRef = useRef('');
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

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const syncPin = ({ latitude: nextLatitude, longitude: nextLongitude }) => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const nextLatLng = [nextLatitude, nextLongitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(nextLatLng, {
        icon: createPinIcon(L),
        // Keep drag handler initialized; we control actual drag state via enable/disable.
        draggable: true,
        keyboard: true,
        autoPan: true,
        title: 'Store location pin',
        riseOnHover: true
      }).addTo(map);

      // Default to non-draggable mode until user explicitly enables "Adjust Pin".
      markerRef.current.dragging?.disable?.();

      markerRef.current.on('dragstart', () => {
        map.getContainer().style.cursor = 'grabbing';
        markerRef.current?.setIcon(createPinIcon(L, { highlighted: true }));
      });

      markerRef.current.on('dragend', (event) => {
        const latLng = event?.target?.getLatLng?.();
        if (!latLng) return;
        map.getContainer().style.cursor = '';
        markerRef.current?.setIcon(createPinIcon(L));
        onChangeRef.current?.({
          latitude: toFixedCoordinate(latLng.lat),
          longitude: toFixedCoordinate(latLng.lng)
        });
      });
    } else {
      markerRef.current.setLatLng(nextLatLng);
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    if (isPinDragMode) {
      marker.dragging?.enable?.();
      marker.setIcon(createPinIcon(leafletRef.current, { highlighted: true }));
      map.getContainer().style.cursor = 'grab';
    } else {
      marker.dragging?.disable?.();
      marker.setIcon(createPinIcon(leafletRef.current));
      map.getContainer().style.cursor = '';
    }
  }, [isPinDragMode, selectedPosition]);

  const resetViewport = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM, {
      animate: true
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
        onChangeRef.current?.({
          latitude: nextLatitude,
          longitude: nextLongitude
        });
        const map = mapRef.current;
        if (map) {
          map.setView([nextLatitude, nextLongitude], PIN_ZOOM, { animate: true });
        }
        setIsLocating(false);
      },
      () => {
        setLoadError('Unable to get your current location. Please allow location access.');
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) {
      return undefined;
    }

    let isCancelled = false;

    const initializeMap = async () => {
      try {
        await import('leaflet/dist/leaflet.css');
        const leafletModule = await import('leaflet');
        const L = leafletModule.default || leafletModule;
        if (isCancelled) return;

        leafletRef.current = L;

        const initialCenter = [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude];

        const map = L.map(containerRef.current, {
          center: initialCenter,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          zoomControl: true,
          attributionControl: true,
          maxBounds: WORLD_BOUNDS,
          maxBoundsViscosity: 1
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        map.once('load', () => {
          setIsMapReady(true);
        });

        map.on('click', (event) => {
          const lat = toFixedCoordinate(event.latlng.lat);
          const lng = toFixedCoordinate(event.latlng.lng);
          onChangeRef.current?.({ latitude: lat, longitude: lng });
          map.setView([lat, lng], PIN_ZOOM, { animate: true });
        });

        map.on('tileerror', () => {
          if (!loadErrorRef.current) {
            const message = 'Map tiles failed to load. Check connection or disable blocking extensions.';
            loadErrorRef.current = message;
            setLoadError(message);
          }
        });

        mapRef.current = map;

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserverRef.current = new ResizeObserver(() => {
            map.invalidateSize();
          });
          resizeObserverRef.current.observe(containerRef.current);
        }

        setTimeout(() => {
          map.invalidateSize();
          setIsMapReady(true);
        }, 0);
      } catch (error) {
        setLoadError('Map failed to load. Please refresh and try again.');
      }
    };

    initializeMap();

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      mapRef.current = null;
      markerRef.current = null;
      radiusCircleRef.current = null;
      leafletRef.current = null;
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !leafletRef.current) return;

    if (!selectedPosition) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const nextLatLng = [selectedPosition.latitude, selectedPosition.longitude];
    syncPin({
      latitude: selectedPosition.latitude,
      longitude: selectedPosition.longitude
    });

    const currentZoom = map.getZoom();
    map.setView(nextLatLng, currentZoom < PIN_ZOOM ? PIN_ZOOM : currentZoom, {
      animate: false
    });
  }, [selectedPosition]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (!selectedPosition || radiusMeters <= 0) {
      if (radiusCircleRef.current) {
        radiusCircleRef.current.remove();
        radiusCircleRef.current = null;
      }
      return;
    }

    const circleCenter = [selectedPosition.latitude, selectedPosition.longitude];

    if (!radiusCircleRef.current) {
      radiusCircleRef.current = L.circle(circleCenter, {
        radius: radiusMeters,
        color: '#0f766e',
        weight: 3,
        opacity: 0.95,
        fillColor: '#2dd4bf',
        fillOpacity: 0.22
      }).addTo(map);
    } else {
      radiusCircleRef.current.setLatLng(circleCenter);
      radiusCircleRef.current.setRadius(radiusMeters);
    }

    radiusCircleRef.current.bringToBack();

    const circleBounds = radiusCircleRef.current.getBounds();
    if (!map.getBounds().contains(circleBounds)) {
      map.fitBounds(circleBounds, {
        padding: [24, 24],
        animate: true
      });
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
      <div
        className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
      >
        {!isMapReady ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-50/60 text-sm font-medium text-slate-600 backdrop-blur-[1px]">
            Loading map...
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="h-full w-full"
          role="application"
          aria-label="OpenStreetMap location picker"
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
