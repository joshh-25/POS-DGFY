import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { renderBusinessModePinSvg } from './businessModePins.js';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };
const TILE_BASE = import.meta.env.VITE_TILE_BASE || 'https://tiles.openfreemap.org';

const TILING_SERVER = import.meta.env.DEV
  ? '/openfreemap/styles/liberty'
  : `${TILE_BASE}/styles/liberty`;

const tileTransformRequest = import.meta.env.DEV
  ? (url) => {
      if (url.startsWith(TILE_BASE)) {
        return { url: url.replace(TILE_BASE, `${window.location.origin}/openfreemap`) };
      }
      return { url };
    }
  : undefined;

const makePinElement = (mode, selected = false) => {
  const el = document.createElement('div');
  el.style.cssText = `width:${selected ? 38 : 34}px;height:${selected ? 48 : 44}px;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
  el.innerHTML = renderBusinessModePinSvg(mode, selected);
  return el;
};

const makeUserLocationElement = () => {
  const el = document.createElement('div');
  el.style.cssText = 'width:20px;height:20px;border-radius:999px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 6px 14px rgba(15,23,42,.35);';
  return el;
};

const createStorePopupNode = (store = {}, resolveAssetUrl = (value) => value) => {
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gap = '4px';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';

  const profileImageUrl = resolveAssetUrl(store?.storefront_profile_image_url);
  if (profileImageUrl) {
    const img = document.createElement('img');
    img.setAttribute('src', profileImageUrl);
    img.setAttribute('alt', '');
    img.style.width = '28px';
    img.style.height = '28px';
    img.style.borderRadius = '999px';
    img.style.objectFit = 'cover';
    img.style.border = '1px solid #d1d5db';
    img.onerror = () => {
      img.remove();
    };
    row.appendChild(img);
  }

  const title = document.createElement('strong');
  title.textContent = String(store?.location_name || store?.tenant_name || 'Store');
  row.appendChild(title);
  container.appendChild(row);

  const address = document.createElement('div');
  address.textContent = String(store?.address_line || '');
  container.appendChild(address);

  return container;
};

export function StoresMap({
  stores,
  selectedKey,
  onSelectStore,
  userLocation = null,
  resolveAssetUrl = (value) => value
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: ref.current,
      style: TILING_SERVER,
      transformRequest: tileTransformRequest,
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: 11,
      bearing: 60,
      pitch: 60
    });
    mapRef.current = map;

    map.on('error', (event) => console.error('[MapLibre error]', event));
    map.on('tileerror', (event) => console.error('[MapLibre] tile error', event));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const rows = Array.isArray(stores) ? stores : [];
    const bounds = [];

    rows.forEach((store) => {
      const lat = Number(store?.latitude);
      const lng = Number(store?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const markerKey = String(store.marker_key || store.slug || store.location_id || `${lat}:${lng}`);
      const highlighted = selectedKey
        ? markerKey === String(selectedKey)
        : store.is_primary_storefront === true;
      const el = makePinElement(store.workflow_mode || store.business_mode, highlighted);
      el.addEventListener('click', () => onSelectStore?.(store));
      const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(createStorePopupNode(store, resolveAssetUrl));
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
      bounds.push([lng, lat]);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      const uLat = Number(userLocation.latitude);
      const uLng = Number(userLocation.longitude);
      if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
        const el = makeUserLocationElement();
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([uLng, uLat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<strong>Your location</strong>'))
          .addTo(map);
        bounds.push([uLng, uLat]);
      }
    }

    if (bounds.length === 1) map.flyTo({ center: bounds[0], zoom: 15 });
    if (bounds.length > 1) {
      const lngs = bounds.map((point) => point[0]);
      const lats = bounds.map((point) => point[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 24, maxZoom: 14 }
      );
    }
  }, [stores, selectedKey, onSelectStore, userLocation, resolveAssetUrl]);

  return <div ref={ref} style={{ height: 360, border: '1px solid #d6e2e8', borderRadius: 14 }} />;
}

export function DeliveryPinMap({ pin = null, onPinChange, disabled = false }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: ref.current,
      style: TILING_SERVER,
      transformRequest: tileTransformRequest,
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: 13,
      bearing: 60,
      pitch: 60
    });
    map.getCanvas().style.zIndex = '0';
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (pin?.latitude != null && pin?.longitude != null) {
      const lat = Number(pin.latitude);
      const lng = Number(pin.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const el = makeUserLocationElement();
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
      }
    }
  }, [pin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || disabled) return undefined;

    const handleClick = (event) => {
      const lat = Number(event?.lngLat?.lat);
      const lng = Number(event?.lngLat?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onPinChange?.({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6))
      });
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [disabled, onPinChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.resize(), 120);
    return () => clearTimeout(timer);
  }, [disabled]);

  return (
    <div style={{ position: 'relative', marginBottom: 10, width: '100%', maxWidth: 420, aspectRatio: '1 / 1', overflow: 'hidden', border: '1px solid #cbd5e1', borderRadius: 10, isolation: 'isolate', zIndex: 0 }}>
      <div ref={ref} style={{ height: '100%', width: '100%' }} />
      {disabled && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(255,255,255,.6)' }} />
      )}
    </div>
  );
}
