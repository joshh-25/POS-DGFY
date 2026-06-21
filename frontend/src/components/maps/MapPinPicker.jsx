import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '../../lib/utils.js';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  applyMapLibreCanvasSizing,
  getMerchantPinValidationError,
  getUsableMerchantPin,
  isCoordinateInPhilippines,
  parseMapCoordinate,
  safeResizeMap,
  tileTransformRequest
} from './mapLibreShared.js';

const DEFAULT_ZOOM = 13;
const PIN_ZOOM = 16;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const RADIUS_SOURCE = 'delivery-radius';
const MAP_READY_TIMEOUT_MS = 1500;

const getGeolocationErrorMessage = (error) => {
  if (error?.code === 1) {
    return 'Location permission was denied. Please allow location access or place the storefront pin on the map.';
  }
  if (error?.code === 2) {
    return 'Your browser could not determine your current location. Please place the storefront pin on the map.';
  }
  if (error?.code === 3) {
    return 'Current location lookup timed out. Please try again or place the storefront pin on the map.';
  }
  return 'Unable to get your current location. Please place the storefront pin on the map.';
};

const getAccuracyMessage = (accuracyMeters) => {
  const accuracy = Number(accuracyMeters);
  if (!Number.isFinite(accuracy) || accuracy <= 0) return '';
  const rounded = Math.round(accuracy);
  if (rounded <= 50) return `High accuracy: within about ${rounded} m.`;
  if (rounded <= 150) return `Approximate location: within about ${rounded} m. Adjust the pin if needed.`;
  return `Low accuracy: within about ${rounded} m. Drag the pin to confirm the storefront location.`;
};

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

const toFixedCoordinate = (value) => Number(value.toFixed(8));

const reverseGeocodeMapPin = async ({ latitude, longitude }, { signal } = {}) => {
  if (typeof fetch !== 'function') return null;
  const lat = parseMapCoordinate(latitude);
  const lng = parseMapCoordinate(longitude);
  if (lat == null || lng == null) return null;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng)
  });
  const response = await fetch(`/api/v1/geo/reverse-geocode?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const addressLine = String(payload?.data?.address_line || '').trim();
  if (!addressLine) return null;
  return {
    address_line: addressLine,
    address_precision: String(payload?.data?.precision || '').trim() || undefined,
    address_provider: String(payload?.data?.provider || '').trim() || undefined,
    address_distance_meters: payload?.data?.distance_meters
  };
};

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
  defaultAdjustMode = false,
  className
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pendingCircleDataRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const reverseGeocodeAbortRef = useRef(null);
  const reverseGeocodeSequenceRef = useRef(0);
  const loadErrorRef = useRef('');
  const isPinDragModeRef = useRef(false);
  const radiusLayerReadyRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isPinDragMode, setIsPinDragMode] = useState(defaultAdjustMode === true);
  const [draftPin, setDraftPin] = useState(null);
  const [accuracyMessage, setAccuracyMessage] = useState('');

  const rawPosition = useMemo(() => {
    const lat = parseMapCoordinate(latitude);
    const lng = parseMapCoordinate(longitude);
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [latitude, longitude]);

  const selectedPosition = useMemo(() => {
    return getUsableMerchantPin({ latitude, longitude });
  }, [latitude, longitude]);

  const effectivePosition = selectedPosition || draftPin;
  const activePinDragMode = Boolean(isPinDragMode && effectivePosition);
  const hasInvalidCoordinateInput = Boolean(rawPosition && !selectedPosition);

  const radiusMeters = useMemo(() => {
    const parsed = Number(deliveryRadiusKm);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed * 1000;
  }, [deliveryRadiusKm]);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { isPinDragModeRef.current = isPinDragMode; }, [isPinDragMode]);
  useEffect(() => {
    if (selectedPosition) {
      setDraftPin(null);
    }
  }, [selectedPosition]);
  useEffect(() => {
    if (defaultAdjustMode === true && !selectedPosition) {
      setIsPinDragMode(true);
    }
  }, [defaultAdjustMode, selectedPosition]);

  const emitPinChange = (pin) => {
    const lat = parseMapCoordinate(pin?.latitude);
    const lng = parseMapCoordinate(pin?.longitude);
    const validationError = getMerchantPinValidationError({ latitude: lat, longitude: lng });
    if (validationError) {
      setLoadError(validationError);
      return false;
    }

    const normalizedPin = {
      ...pin,
      latitude: lat,
      longitude: lng
    };
    setDraftPin({ latitude: lat, longitude: lng });
    setLoadError('');
    loadErrorRef.current = '';
    onChangeRef.current?.(normalizedPin);

    reverseGeocodeAbortRef.current?.abort?.();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    reverseGeocodeAbortRef.current = controller;
    const sequence = reverseGeocodeSequenceRef.current + 1;
    reverseGeocodeSequenceRef.current = sequence;

    reverseGeocodeMapPin({ latitude: lat, longitude: lng }, { signal: controller?.signal })
      .then((addressPayload) => {
        if (!addressPayload?.address_line || reverseGeocodeSequenceRef.current !== sequence) return;
        onChangeRef.current?.({
          ...normalizedPin,
          ...addressPayload
        });
      })
      .catch(() => {
        // Address autofill is best-effort; coordinates remain the source of truth.
      });
    return true;
  };

  const clearInvalidPin = () => {
    if (!hasInvalidCoordinateInput) return;
    onChangeRef.current?.({ latitude: '', longitude: '' });
    setDraftPin(null);
    setIsPinDragMode(false);
  };

  const resetViewport = () => {
    clearInvalidPin();
    mapRef.current?.flyTo({
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: DEFAULT_ZOOM
    });
  };

  const centerToCurrentLocation = () => {
    if (!isPinDragModeRef.current) {
      setLoadError('Press Adjust Pin before changing the storefront location.');
      return;
    }
    if (!navigator?.geolocation) {
      setLoadError('Geolocation is not available in this browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = toFixedCoordinate(position.coords.latitude);
        const nextLongitude = toFixedCoordinate(position.coords.longitude);
        const nextAccuracyMessage = getAccuracyMessage(position.coords.accuracy);
        if (!isCoordinateInPhilippines({ latitude: nextLatitude, longitude: nextLongitude })) {
          setLoadError('Your browser reported a location outside the Philippines. Please click the map or enter the storefront coordinates manually.');
          setIsLocating(false);
          return;
        }
        if (emitPinChange({ latitude: nextLatitude, longitude: nextLongitude })) {
          setAccuracyMessage(nextAccuracyMessage);
          mapRef.current?.flyTo({ center: [nextLongitude, nextLatitude], zoom: PIN_ZOOM });
        }
        setIsLocating(false);
      },
      (error) => {
        setLoadError(getGeolocationErrorMessage(error));
        setAccuracyMessage('');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const getDraftPinFromMapCenter = () => {
    const center = mapRef.current?.getCenter?.();
    const draft = center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))
      ? { latitude: toFixedCoordinate(Number(center.lat)), longitude: toFixedCoordinate(Number(center.lng)) }
      : DEFAULT_CENTER;
    return getUsableMerchantPin(draft) || DEFAULT_CENTER;
  };

  const handleAdjustPinClick = () => {
    if (!isPinDragMode) {
      if (!effectivePosition) {
        const draftPin = getDraftPinFromMapCenter();
        if (emitPinChange(draftPin)) {
          mapRef.current?.jumpTo?.({ center: [draftPin.longitude, draftPin.latitude], zoom: PIN_ZOOM });
        }
      }
      setIsPinDragMode(true);
      return;
    }
    if (!effectivePosition) {
      const draftPin = getDraftPinFromMapCenter();
      if (emitPinChange(draftPin)) {
        mapRef.current?.jumpTo?.({ center: [draftPin.longitude, draftPin.latitude], zoom: PIN_ZOOM });
      }
      return;
    }
    setIsPinDragMode(false);
  };

  // Map initialisation
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return undefined;

    let isCancelled = false;
    let map;
    let readyTimer;

    const markMapReady = () => {
      if (isCancelled) return;
      safeResizeMap(map, containerRef.current);
      setIsMapReady(true);
    };

    const ensureRadiusLayers = () => {
      if (isCancelled || !map || radiusLayerReadyRef.current) return;
      try {
        if (!map.getSource(RADIUS_SOURCE)) {
          map.addSource(RADIUS_SOURCE, {
            type: 'geojson',
            data: pendingCircleDataRef.current ?? { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer?.(`${RADIUS_SOURCE}-fill`)) {
          map.addLayer({
            id: `${RADIUS_SOURCE}-fill`,
            type: 'fill',
            source: RADIUS_SOURCE,
            paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.22 }
          });
        }
        if (!map.getLayer?.(`${RADIUS_SOURCE}-line`)) {
          map.addLayer({
            id: `${RADIUS_SOURCE}-line`,
            type: 'line',
            source: RADIUS_SOURCE,
            paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-opacity': 0.95 }
          });
        }
        pendingCircleDataRef.current = null;
        radiusLayerReadyRef.current = true;
      } catch {
        // Defer radius overlay setup until MapLibre reports the style as fully loaded.
      }
    };

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: TILING_SERVER,
        transformRequest: tileTransformRequest,
        center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        trackResize: false,
        bearing: 0,
        pitch: 0
      });
      applyMapLibreCanvasSizing(map);
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    } catch {
      readyTimer = setTimeout(() => {
        setLoadError('Map failed to load. Please refresh and try again.');
      }, 0);
      return () => clearTimeout(readyTimer);
    }

    map.once('load', () => {
      ensureRadiusLayers();
      markMapReady();
    });

    map.on('styledata', () => {
      ensureRadiusLayers();
    });

    map.on('click', (event) => {
      if (!isPinDragModeRef.current) return;
      const lat = toFixedCoordinate(event.lngLat.lat);
      const lng = toFixedCoordinate(event.lngLat.lng);
      setAccuracyMessage('');
      emitPinChange({ latitude: lat, longitude: lng });
      // Camera movement handled by the selectedPosition effect via jumpTo
    });

    map.on('mousemove', () => {
      if (isPinDragModeRef.current) {
        map.getCanvas().style.cursor = 'crosshair';
      } else {
        map.getCanvas().style.cursor = '';
      }
    });

    map.on('mouseleave', () => {
      map.getCanvas().style.cursor = '';
    });

    map.on('error', () => {
      if (!loadErrorRef.current && !isCancelled) {
        const message = 'Map interaction is still available. You can place the pin or edit coordinates manually.';
        loadErrorRef.current = message;
        setLoadError(message);
      }
    });

    mapRef.current = map;

    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => safeResizeMap(map, containerRef.current));
      resizeObserverRef.current.observe(containerRef.current);
    }

    // Kick initial resize after the browser has painted
    readyTimer = setTimeout(() => {
      if (!isCancelled) {
        ensureRadiusLayers();
        markMapReady();
      }
    }, MAP_READY_TIMEOUT_MS);

    return () => {
      isCancelled = true;
      clearTimeout(readyTimer);
      reverseGeocodeAbortRef.current?.abort?.();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      try {
        map.remove();
      } catch {
        // Ignore late WebGL/resize cleanup failures while a modal or settings panel is closing.
      }
      mapRef.current = null;
      markerRef.current = null;
      radiusLayerReadyRef.current = false;
    };
  }, []);

  // Sync drag-mode appearance onto the existing marker
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    marker.setDraggable(activePinDragMode);
    const el = marker.getElement();
    if (el) {
      el.innerHTML = buildPinSvg({ highlighted: activePinDragMode });
      el.style.cursor = activePinDragMode ? 'grab' : 'pointer';
    }
    map.getCanvas().style.cursor = activePinDragMode ? 'grab' : '';
  }, [activePinDragMode, effectivePosition]);

  // Marker position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!effectivePosition) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (defaultAdjustMode !== true) {
        setIsPinDragMode(false);
      }
      return;
    }

    const { latitude: lat, longitude: lng } = effectivePosition;

    if (!markerRef.current) {
      const shouldDrag = Boolean(isPinDragModeRef.current && effectivePosition);
      const marker = new maplibregl.Marker({
        element: makePinElement(shouldDrag),
        anchor: 'bottom',
        draggable: shouldDrag
      }).setLngLat([lng, lat]).addTo(map);
      const element = marker.getElement();
      if (element) {
        element.style.cursor = shouldDrag ? 'grab' : 'pointer';
      }

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
        emitPinChange({
          latitude: toFixedCoordinate(pos.lat),
          longitude: toFixedCoordinate(pos.lng)
        });
        setAccuracyMessage('');
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }

    const currentZoom = map.getZoom();
    map.jumpTo({ center: [lng, lat], zoom: currentZoom < PIN_ZOOM ? PIN_ZOOM : currentZoom });
  }, [effectivePosition, defaultAdjustMode]);

  // Delivery radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasRadius = effectivePosition && radiusMeters > 0;
    const circle = hasRadius
      ? createCirclePolygon(effectivePosition.longitude, effectivePosition.latitude, radiusMeters)
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
      const { latitude: lat, longitude: lng } = effectivePosition;
      const dLat = (radiusMeters / R) * (180 / Math.PI);
      const dLng = dLat / Math.cos(lat * Math.PI / 180);
      const sw = [lng - dLng, lat - dLat];
      const ne = [lng + dLng, lat + dLat];
      const bounds = map.getBounds();
      if (!bounds.contains(sw) || !bounds.contains(ne)) {
        map.fitBounds([sw, ne], { padding: 24 });
      }
    }
  }, [effectivePosition, radiusMeters]);

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
          disabled={isLocating || !isPinDragMode}
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
          onClick={handleAdjustPinClick}
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
          {isPinDragMode
            ? 'Adjust mode is active. Click the map, drag the marker, or use current location to set the storefront pin.'
            : 'Location is locked. Press `Adjust Pin` before changing the storefront pin.'}
        </p>
      )}
      {accuracyMessage ? (
        <p className="text-xs text-slate-600">{accuracyMessage}</p>
      ) : null}
      {effectivePosition && radiusMeters > 0 ? (
        <p className="text-xs text-teal-700">
          Delivery coverage preview: {(radiusMeters / 1000).toFixed(2)} km radius
        </p>
      ) : null}
      <p className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
        {effectivePosition
          ? `Pinned: ${effectivePosition.latitude.toFixed(6)}, ${effectivePosition.longitude.toFixed(6)}`
          : 'No pin selected yet.'}
      </p>
    </div>
  );
}
