import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import { Toaster, toast } from 'sonner';
import { canCheckout, getCheckoutBlockReason } from './checkoutRules.js';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };
const ORDER_METHOD_OPTIONS = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeout', label: 'Takeout' }
];

const money = (v) => `PHP ${Number(v || 0).toFixed(2)}`;
const toSlug = (v) => String(v || '').trim().toLowerCase();
const TENANT_STORE_BASE_PATH = '/tenant-store';
const storePath = (slug) => `${TENANT_STORE_BASE_PATH}/${encodeURIComponent(toSlug(slug))}`;
const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const readRouteSlug = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  const patterns = [
    /^\/tenant-store\/([^/]+)$/i,
    /^\/store\/([^/]+)$/i
  ];
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  const hashPatterns = [
    /^#\/tenant-store\/([^/]+)$/i,
    /^#\/store\/([^/]+)$/i
  ];
  for (const pattern of hashPatterns) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
};

const buildRequestError = (message, meta = {}) => {
  const error = new Error(message);
  Object.assign(error, meta);
  return error;
};

const inferRuntimeApiOrigin = () => {
  if (typeof window === 'undefined') return '';
  const { hostname, port, protocol } = window.location;
  const isLocalStorePort = port === '5175' || port === '4175';
  if (!isLocalStorePort) return '';
  return `${protocol}//${hostname}:5000`;
};

const configuredApiOrigin = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const apiOrigin = configuredApiOrigin || inferRuntimeApiOrigin();
const buildStamp = String(import.meta.env.VITE_BUILD_STAMP || '').trim();
const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
const withApiOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/')) return url;
  return apiOrigin ? `${apiOrigin}${url}` : url;
};

const requestJson = async (url, { method = 'GET', body, storeSlug } = {}) => {
  let response;
  try {
    response = await fetch(withApiOrigin(url), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(storeSlug ? { 'x-store-slug': storeSlug } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    throw buildRequestError('Request failed before reaching API. Check server/proxy/CORS connectivity.', {
      isNetworkError: true,
      cause: networkError
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw buildRequestError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error_code || null,
      details: payload?.errors || payload?.details || null,
      requestId: payload?.request_id || null,
      payload
    });
  }
  return payload?.data ?? payload;
};

const extractStockViolation = (error) => {
  const details = error?.details;
  if (!details) return null;

  if (details?.stock_violation && typeof details.stock_violation === 'object') {
    return details.stock_violation;
  }

  if (Array.isArray(details?.stock_violations) && details.stock_violations.length > 0) {
    return details.stock_violations[0];
  }

  if (Array.isArray(details)) {
    return details.find((entry) => entry && typeof entry === 'object' && Number.isFinite(Number(entry.available_stock)) && Number.isFinite(Number(entry.requested_qty))) || null;
  }

  return null;
};

const buildStockExceededMessage = (violation = {}) => {
  const itemName = violation.item_name || 'item';
  const requested = Number.isFinite(Number(violation.requested_qty)) ? Number(violation.requested_qty) : null;
  const available = Number.isFinite(Number(violation.available_stock)) ? Number(violation.available_stock) : null;
  const unit = String(violation.unit_of_measure || '').trim();
  if (requested != null && available != null) {
    return `${itemName}: requested ${requested}${unit ? ` ${unit}` : ''}, only ${available}${unit ? ` ${unit}` : ''} in stock.`;
  }
  return `${itemName} is over current stock.`;
};

const pinIcon = (selected = false) => L.divIcon({
  className: '',
  iconSize: [26, 36],
  iconAnchor: [13, 35],
  popupAnchor: [0, -30],
  html: `<div style="position:relative;width:26px;height:36px;display:flex;align-items:center;justify-content:center;">
    <div style="width:${selected ? 22 : 18}px;height:${selected ? 22 : 18}px;border-radius:999px;border:3px solid #fff;box-shadow:0 6px 14px rgba(15,23,42,.35);background:${selected ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'linear-gradient(135deg,#334155,#64748b)'};"></div>
    <div style="position:absolute;bottom:2px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid ${selected ? '#0f766e' : '#334155'};"></div>
  </div>`
});

const userLocationIcon = L.divIcon({
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: '<div style="width:20px;height:20px;border-radius:999px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 6px 14px rgba(15,23,42,.35);"></div>'
});

function StoresMap({ stores, selectedKey, onSelectStore, userLocation = null }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    mapRef.current = L.map(ref.current, { zoomControl: true }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
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
      const marker = L.marker([lat, lng], { icon: pinIcon(highlighted) }).addTo(map);
      marker.bindPopup(`<strong>${store.location_name || store.tenant_name || 'Store'}</strong><br/>${store.address_line || ''}`);
      marker.on('click', () => onSelectStore(store));
      markersRef.current.push(marker);
      bounds.push([lat, lng]);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      const uLat = Number(userLocation.latitude);
      const uLng = Number(userLocation.longitude);
      if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
        userMarkerRef.current = L.marker([uLat, uLng], { icon: userLocationIcon }).addTo(map);
        userMarkerRef.current.bindPopup('<strong>Your location</strong>');
        bounds.push([uLat, uLng]);
      }
    }

    if (bounds.length === 1) map.setView(bounds[0], 15, { animate: true });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [stores, selectedKey, onSelectStore, userLocation]);

  return <div ref={ref} style={{ height: 360, border: '1px solid #d6e2e8', borderRadius: 14 }} />;
}

function DeliveryPinMap({ pin = null, onPinChange, disabled = false }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    mapRef.current = L.map(ref.current, { zoomControl: true }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], 13);
    mapRef.current.getContainer().style.zIndex = '0';
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapRef.current);
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
        markerRef.current = L.marker([lat, lng], { icon: userLocationIcon }).addTo(map);
        map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
      }
    }
  }, [pin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (disabled) return undefined;

    const handleClick = (event) => {
      const lat = Number(event?.latlng?.lat);
      const lng = Number(event?.latlng?.lng);
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
    const timer = setTimeout(() => map.invalidateSize(), 120);
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

function App() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [highlightedStoreSlug, setHighlightedStoreSlug] = useState('');
  const [discoveryCoords, setDiscoveryCoords] = useState(null);
  const [discoveryLocationMap, setDiscoveryLocationMap] = useState({});
  const [loadingDiscoveryLocations, setLoadingDiscoveryLocations] = useState(false);
  const [highlightedDiscoveryMarkerKey, setHighlightedDiscoveryMarkerKey] = useState('');

  const [selectedStore, setSelectedStore] = useState(null);
  const [storeLocations, setStoreLocations] = useState([]);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const [orderMethod, setOrderMethod] = useState('delivery');
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [pinLocationLoading, setPinLocationLoading] = useState(false);
  const [pinLocationError, setPinLocationError] = useState('');
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteNeedsRefresh, setQuoteNeedsRefresh] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [trackingPinInput, setTrackingPinInput] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState('checkout');
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ));

  const isStorePage = Boolean(routeSlug);

  const loadStores = useCallback(async (coords = null) => {
    setLoadingStores(true);
    setStoresError('');
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (coords?.latitude && coords?.longitude) {
        q.set('latitude', String(coords.latitude));
        q.set('longitude', String(coords.longitude));
        setDiscoveryCoords({
          latitude: Number(coords.latitude),
          longitude: Number(coords.longitude)
        });
      } else {
        setDiscoveryCoords(null);
      }
      q.set('limit', '100');
      const data = await requestJson(`/api/v1/storefront/discovery?${q.toString()}`);
      setStores(Array.isArray(data?.stores) ? data.stores : []);
    } catch (error) {
      setStores([]);
      setStoresError(error.message || 'Failed to load discovery stores.');
    } finally {
      setLoadingStores(false);
    }
  }, [search]);

  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;

    setLoadingCatalog(true);
    setCatalogError('');
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    try {
      const profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`);
      setSelectedStore(profile);

      try {
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug });
        const locations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];
        const nextPrimaryLocationId = locationsData?.primary_location_id ?? null;
        setStoreLocations(locations);
        setPrimaryLocationId(nextPrimaryLocationId);
        if (locations.length > 0) {
          const preferredLocationId = (
            preferredStoreLocationSelection?.slug
            && toSlug(preferredStoreLocationSelection.slug) === toSlug(profile.slug)
          )
            ? preferredStoreLocationSelection.locationId
            : null;
          const preferredLocation = preferredLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(preferredLocationId)) || null);
          const primaryLocation = nextPrimaryLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(nextPrimaryLocationId)) || null);
          const firstOpenLocation = locations.find((location) => location?.is_open !== false) || null;
          const fallbackLocationId = (
            preferredLocation?.location_id
            ?? firstOpenLocation?.location_id
            ?? primaryLocation?.location_id
            ?? locations[0]?.location_id
            ?? null
          );
          setSelectedLocationId(fallbackLocationId);
        } else {
          setSelectedLocationId(null);
        }
      } catch {
        setStoreLocations([]);
        setPrimaryLocationId(null);
        setSelectedLocationId(null);
      }

      const catalogData = await requestJson('/api/v1/store/catalog?limit=120', { storeSlug: profile.slug });
      setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
    } catch (error) {
      setSelectedStore(null);
      setStoreLocations([]);
      setCatalog([]);
      setCatalogError(error.message || 'Failed to load tenant storefront page.');
    } finally {
      setLoadingCatalog(false);
    }
  }, [preferredStoreLocationSelection]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!routeSlug) return;
    openStoreBySlug(routeSlug);
  }, [routeSlug, openStoreBySlug]);

  useEffect(() => {
    let cancelled = false;

    const loadDiscoveryLocations = async () => {
      if (!Array.isArray(stores) || stores.length === 0) {
        setDiscoveryLocationMap({});
        return;
      }

      setLoadingDiscoveryLocations(true);
      try {
        const locationPairs = await Promise.all(
          stores.map(async (store) => {
            const slug = toSlug(store?.slug);
            if (!slug) return [slug, { locations: [], primary_location_id: null }];
            try {
              const data = await requestJson('/api/v1/store/locations', { storeSlug: slug });
              const locations = Array.isArray(data?.locations) ? data.locations : [];
              return [slug, { locations, primary_location_id: data?.primary_location_id ?? null }];
            } catch {
              return [slug, { locations: [], primary_location_id: null }];
            }
          })
        );
        if (cancelled) return;
        setDiscoveryLocationMap(Object.fromEntries(locationPairs.filter(([slug]) => Boolean(slug))));
      } finally {
        if (!cancelled) setLoadingDiscoveryLocations(false);
      }
    };

    loadDiscoveryLocations();
    return () => {
      cancelled = true;
    };
  }, [stores]);

  useEffect(() => {
    const onPopState = () => setRouteSlug(readRouteSlug());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sku-store-shell-')).map((k) => caches.delete(k))))
          .catch(() => {});
      }
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
        const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
        const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
        if (!probe.ok || !scriptLike) {
          console.warn('[StorefrontPWA] Skipping service worker registration due to invalid script response', {
            status: probe.status,
            contentType
          });
          return;
        }
        await navigator.serviceWorker.register(serviceWorkerUrl, { scope: appBasePath === '/' ? '/' : `${appBasePath}/` });
      } catch (error) {
        console.warn('[StorefrontPWA] Service worker registration failed', {
          error: error?.message || 'unknown_error'
        });
      }
    };

    registerServiceWorker();
  }, []);

  const goStore = (slug, locationId = null) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    setPreferredStoreLocationSelection(locationId == null ? null : {
      slug: normalized,
      locationId: Number(locationId)
    });
    const target = storePath(normalized);
    if (window.location.pathname !== target) {
      window.history.pushState({ storeSlug: normalized }, '', target);
    }
    setRouteSlug(normalized);
  };

  const goDiscovery = () => {
    if (window.location.pathname !== TENANT_STORE_BASE_PATH) window.history.pushState({}, '', TENANT_STORE_BASE_PATH);
    setRouteSlug(null);
    setSelectedStore(null);
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    setPreferredStoreLocationSelection(null);
    setCatalog([]);
    setCatalogError('');
    setIsCheckoutOpen(false);
  };

  const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.price)), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [cart]);
  const storesWithNearestBranch = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    return (Array.isArray(stores) ? stores : [])
      .map((store) => {
        const slug = toSlug(store?.slug);
        const locationBundle = discoveryLocationMap[slug] || {};
        const allLocations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
        const activeLocations = allLocations.filter((location) => location?.is_active !== false);
        const pins = activeLocations
          .map((location) => ({
            ...location,
            latitude: toNumberOrNull(location?.latitude),
            longitude: toNumberOrNull(location?.longitude)
          }))
          .filter((location) => location.latitude != null && location.longitude != null);
        const primaryLocation = pins.find((location) => Number(location.location_id) === Number(locationBundle.primary_location_id))
          || pins.find((location) => location?.is_primary_storefront === true)
          || null;
        const fallbackLocation = primaryLocation || pins[0] || null;
        const fallbackLat = toNumberOrNull(store?.latitude);
        const fallbackLng = toNumberOrNull(store?.longitude);
        const anchorLatitude = fallbackLocation?.latitude ?? fallbackLat ?? DEFAULT_CENTER.latitude;
        const anchorLongitude = fallbackLocation?.longitude ?? fallbackLng ?? DEFAULT_CENTER.longitude;
        const nearestPinWithDistance = hasDiscoveryLocation
          ? pins
            .map((location) => ({
              location,
              distance_km: haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            }))
            .sort((a, b) => a.distance_km - b.distance_km)[0] || null
          : null;
        const nearestDistanceKm = nearestPinWithDistance?.distance_km
          ?? (Number.isFinite(Number(store?.distance_km)) ? Number(store.distance_km) : null);
        const nearestLocation = nearestPinWithDistance?.location || fallbackLocation;
        return {
          ...store,
          latitude: anchorLatitude,
          longitude: anchorLongitude,
          active_location_count: activeLocations.length,
          nearest_distance_km: nearestDistanceKm,
          nearest_location_name: nearestLocation?.name || null,
          nearest_location_id: nearestLocation?.location_id ?? null,
          nearest_is_primary: nearestLocation?.is_primary_storefront === true
        };
      })
      .sort((a, b) => {
        const left = Number.isFinite(a.nearest_distance_km) ? a.nearest_distance_km : Number.POSITIVE_INFINITY;
        const right = Number.isFinite(b.nearest_distance_km) ? b.nearest_distance_km : Number.POSITIVE_INFINITY;
        if (left !== right) return left - right;
        return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
      });
  }, [stores, discoveryCoords, discoveryLocationMap]);
  const discoveryMapPins = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    const pins = [];
    storesWithNearestBranch.forEach((store) => {
      const slug = toSlug(store?.slug);
      const locationBundle = discoveryLocationMap[slug] || {};
      const locations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
      const activeWithCoords = locations
        .filter((location) => location?.is_active !== false)
        .map((location) => ({
          ...location,
          latitude: toNumberOrNull(location?.latitude),
          longitude: toNumberOrNull(location?.longitude)
        }))
        .filter((location) => location.latitude != null && location.longitude != null);
      if (activeWithCoords.length === 0) {
        const lat = toNumberOrNull(store?.latitude);
        const lng = toNumberOrNull(store?.longitude);
        if (lat == null || lng == null) return;
        pins.push({
          ...store,
          marker_key: `${slug}:fallback`,
          latitude: lat,
          longitude: lng,
          location_id: store?.location_id ?? null,
          location_name: store?.nearest_location_name || store?.tenant_name,
          branch_label: 'Storefront pin',
          distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
        });
        return;
      }
      activeWithCoords.forEach((location) => {
        pins.push({
          ...store,
          marker_key: `${slug}:${location.location_id}`,
          location_id: location.location_id,
          location_name: location.name || store?.tenant_name,
          address_line: location.address_line || store?.address_line || '',
          latitude: location.latitude,
          longitude: location.longitude,
          is_primary_storefront: location.is_primary_storefront === true,
          branch_label: location.is_primary_storefront ? 'Primary branch' : 'Branch',
          distance_km: hasDiscoveryLocation
            ? haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            : null
        });
      });
    });
    return pins.sort((a, b) => {
      const left = Number.isFinite(Number(a.distance_km)) ? Number(a.distance_km) : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
    });
  }, [storesWithNearestBranch, discoveryLocationMap, discoveryCoords]);
  const discoverySummary = useMemo(() => {
    const totalStores = storesWithNearestBranch.length;
    const openStores = storesWithNearestBranch.filter((store) => store.storefront_open).length;
    const totalCatalogItems = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.catalog_count || 0), 0);
    const waitTotals = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.estimated_wait_minutes || 0), 0);
    const avgWait = totalStores > 0 ? Math.round(waitTotals / totalStores) : 0;
    return {
      totalStores,
      openStores,
      totalCatalogItems,
      avgWait
    };
  }, [storesWithNearestBranch]);
  const nearestDistanceKm = useMemo(() => {
    const withDistance = storesWithNearestBranch
      .map((store) => Number(store?.nearest_distance_km))
      .filter((distance) => Number.isFinite(distance));
    if (withDistance.length === 0) return null;
    return Math.min(...withDistance);
  }, [storesWithNearestBranch]);
  const highlightedStore = useMemo(() => {
    if (!storesWithNearestBranch.length) return null;
    if (!highlightedStoreSlug) return storesWithNearestBranch[0];
    return storesWithNearestBranch.find((store) => store.slug === highlightedStoreSlug) || storesWithNearestBranch[0];
  }, [storesWithNearestBranch, highlightedStoreSlug]);
  const selectedLocation = useMemo(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) return null;
    if (selectedLocationId == null) return null;
    return storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId)) || null;
  }, [storeLocations, selectedLocationId]);
  const isDeliveryOrder = orderMethod === 'delivery';
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal + deliveryFee;
    return {
      subtotal_amount: subtotal,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount
    };
  }, [quoteResult, cartTotal]);
  const isDesktopCheckout = viewportWidth >= 1024;
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    quoteResult,
    quoteNeedsRefresh
  });
  const checkoutAllowed = canCheckout({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    quoteResult,
    quoteNeedsRefresh
  });

  useEffect(() => {
    if (!storesWithNearestBranch.length) {
      setHighlightedStoreSlug('');
      setHighlightedDiscoveryMarkerKey('');
      return;
    }
    if (!highlightedStoreSlug || !storesWithNearestBranch.some((store) => store.slug === highlightedStoreSlug)) {
      setHighlightedStoreSlug(storesWithNearestBranch[0].slug);
    }
    if (!highlightedDiscoveryMarkerKey || !discoveryMapPins.some((pin) => pin.marker_key === highlightedDiscoveryMarkerKey)) {
      setHighlightedDiscoveryMarkerKey(discoveryMapPins[0]?.marker_key || '');
    }
  }, [storesWithNearestBranch, highlightedStoreSlug, discoveryMapPins, highlightedDiscoveryMarkerKey]);
  useEffect(() => {
    if (!isStorePage) return;
    setQuoteNeedsRefresh(true);
  }, [cart, orderMethod, selectedLocationId, customerPin, isStorePage]);
  useEffect(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) {
      if (selectedLocationId != null) setSelectedLocationId(null);
      return;
    }
    const exists = storeLocations.some((location) => Number(location.location_id) === Number(selectedLocationId));
    if (!exists) {
      const primaryLocation = primaryLocationId == null
        ? null
        : (storeLocations.find((location) => Number(location.location_id) === Number(primaryLocationId)) || null);
      const firstOpenLocation = storeLocations.find((location) => location?.is_open !== false) || null;
      const fallbackLocationId = (firstOpenLocation?.location_id ?? primaryLocation?.location_id ?? storeLocations[0]?.location_id ?? null);
      setSelectedLocationId(fallbackLocationId);
    }
  }, [storeLocations, selectedLocationId, primaryLocationId]);

  const addToCart = (item) => {
    let stockWarning = '';
    setCart((prev) => {
      const found = prev.find((l) => Number(l.item_id) === Number(item.item_id));
      const price = Number(item.default_sale_price ?? item.cost_per_unit ?? 0);
      const maxStock = Number.isFinite(Number(item.current_stock)) ? Number(item.current_stock) : 0;
      if (found) {
        const requestedQty = Number(found.quantity) + 1;
        const safeQty = Math.max(0, Math.min(requestedQty, maxStock));
        if (requestedQty > maxStock) {
          stockWarning = buildStockExceededMessage({
            item_name: item.name,
            requested_qty: requestedQty,
            available_stock: maxStock,
            unit_of_measure: item.unit_of_measure || ''
          });
        }
        return prev.map((line) => Number(line.item_id) === Number(item.item_id)
          ? { ...line, quantity: safeQty, max_stock: maxStock }
          : line);
      }
      return [...prev, {
        item_id: item.item_id,
        name: item.name,
        quantity: maxStock > 0 ? 1 : 0,
        price,
        image_url: item.image_url || null,
        unit_of_measure: item.unit_of_measure || '',
        max_stock: maxStock
      }];
    });
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  const removeCartItem = (itemId) => {
    setCart((prev) => prev.filter((line) => Number(line.item_id) !== Number(itemId)));
  };

  const updateQty = (itemId, qty) => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      setCart((prev) => prev.filter((line) => Number(line.item_id) !== Number(itemId)));
      return;
    }
    let stockWarning = '';
    setCart((prev) => prev.map((line) => {
      if (Number(line.item_id) !== Number(itemId)) return line;
      const maxStock = Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY;
      const safeQty = Math.min(parsed, maxStock);
      if (parsed > maxStock) {
        stockWarning = buildStockExceededMessage({
          item_name: line.name,
          requested_qty: parsed,
          available_stock: maxStock,
          unit_of_measure: line.unit_of_measure || ''
        });
      }
      return { ...line, quantity: safeQty };
    }));
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  const checkoutPayload = () => ({
    location_id: selectedLocationId ?? selectedStore?.location_id,
    order_method: orderMethod,
    customer_name: customerName,
    customer_phone: customerPhone,
    delivery_address: isDeliveryOrder ? customerAddress : '',
    delivery_latitude: isDeliveryOrder ? toNumberOrNull(customerPin?.latitude) : null,
    delivery_longitude: isDeliveryOrder ? toNumberOrNull(customerPin?.longitude) : null,
    lines: cart.map((line) => ({ item_id: Number(line.item_id), quantity: Number(line.quantity) }))
  });

  const handlePinMyLocation = () => {
    if (!navigator?.geolocation) {
      setPinLocationError('Geolocation is not supported on this device/browser.');
      return;
    }
    setPinLocationError('');
    setPinLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerPin({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        });
        setPinLocationLoading(false);
      },
      () => {
        setPinLocationError('Unable to get your current location.');
        setPinLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  const handleQuote = async () => {
    if (!selectedStore) return;
    setQuoteError('');
    try {
      const data = await requestJson('/api/v1/store/cart/quote', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        body: checkoutPayload()
      });
      setQuoteResult(data);
      setQuoteNeedsRefresh(false);
      toast.success('Quote updated.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      const message = error?.isNetworkError
        ? 'Quote request failed before reaching API. Check store API proxy/CORS.'
        : (error.message || 'Unable to compute quote.');
      setQuoteError(message);
      toast.error(message);
    }
  };

  const handleCheckout = async () => {
    if (!selectedStore) return;
    setCheckoutError('');
    setCheckoutResult(null);
    if (checkoutBlockReason === 'stock_violation') {
      const message = 'Cannot checkout: one or more items exceed current stock.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'missing_quote') {
      const message = 'Please click Quote first before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'stale_quote') {
      const message = 'Your cart changed. Please refresh Quote before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    setCheckoutLoading(true);
    try {
      const data = await requestJson('/api/v1/store/checkout', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        body: {
          ...checkoutPayload(),
          idempotency_key: window.crypto?.randomUUID?.() || `store-${Date.now()}`,
          payment_type: 'cash'
        }
      });
      setCheckoutResult(data);
      if (data?.tracking_pin) {
        setTrackingPinInput(data.tracking_pin);
        setCheckoutTab('track');
      }
      setCart([]);
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      toast.success('Checkout completed.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setCheckoutError(message);
        toast.error(message);
        return;
      }
      const message = error?.isNetworkError
        ? 'Checkout request failed before reaching API. Check store API proxy/CORS.'
        : (error.message || 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleTrack = async () => {
    setTrackingError('');
    setTrackingResult(null);
    try {
      const pin = trackingPinInput.trim().toUpperCase();
      if (!pin || !selectedStore?.slug) throw new Error('Select a storefront and enter a valid tracking pin.');
      const data = await requestJson(`/api/v1/store/track/${encodeURIComponent(pin)}`, { storeSlug: selectedStore.slug });
      setTrackingResult(data);
    } catch (error) {
      setTrackingError(error.message || 'Tracking failed');
    }
  };

  const handleNearMe = () => {
    if (!navigator?.geolocation) {
      loadStores();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadStores({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        loadStores();
      },
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  };

  return (
    <main style={{ fontFamily: 'Segoe UI, system-ui, sans-serif', background: '#eef2f7', minHeight: '100vh', color: '#0f172a' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: 20, paddingBottom: isStorePage ? 120 : 24 }}>
        {!isStorePage && (
          <>
            <h1 style={{ margin: '0 0 10px 0', fontSize: 42 }}>SKUpervisor General Store</h1>
            <p style={{ margin: '0 0 14px 0', color: '#475569', fontSize: 22 }}>Discover nearby stores, browse menus, and place online orders.</p>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store, slug, address, or item..." style={{ flex: '1 1 360px', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px' }} />
                <button type="button" onClick={() => loadStores()} style={{ borderRadius: 10, border: '1px solid #0f766e', color: '#0f766e', background: '#fff', padding: '10px 14px', fontWeight: 700 }}>Search</button>
                <button type="button" onClick={handleNearMe} style={{ borderRadius: 10, border: '1px solid #0f766e', color: '#0f766e', background: '#fff', padding: '10px 14px', fontWeight: 700 }}>Near Me</button>
                {['list', 'grid', 'map'].map((mode) => (
                  <button key={mode} type="button" onClick={() => setViewMode(mode)} style={{ borderRadius: 10, border: `1px solid ${viewMode === mode ? '#1d9a8a' : '#cbd5e1'}`, background: viewMode === mode ? '#e6fffb' : '#fff', padding: '10px 14px', fontWeight: 700, textTransform: 'capitalize' }}>{mode}</button>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                {discoveryCoords
                  ? `Near Me is active (${discoveryCoords.latitude.toFixed(4)}, ${discoveryCoords.longitude.toFixed(4)}). Results are sorted by nearest active storefront branch${nearestDistanceKm != null ? ` • nearest: ${nearestDistanceKm.toFixed(2)} km` : ''}.`
                  : 'Tip: Near Me uses your browser location to sort stores by nearest active storefront branch.'}
                {loadingDiscoveryLocations ? ' Syncing branch pins...' : ''}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <article style={{ background: 'linear-gradient(135deg,#ecfeff,#f0fdfa)', border: '1px solid #bff3ec', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>DISCOVERABLE STORES</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#eff6ff,#f8fafc)', border: '1px solid #dbeafe', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>OPEN RIGHT NOW</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.openStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#fff7ed,#fffaf0)', border: '1px solid #ffedd5', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>AVG WAIT TIME</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.avgWait} min</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#f5f3ff,#faf5ff)', border: '1px solid #e9d5ff', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700 }}>VISIBLE CATALOG</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalCatalogItems}</div>
                </article>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 12 }}>
                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', padding: 12, minHeight: 420 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15 }}>Discovery Results</strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Select any store to open its tenant page</span>
                  </div>

                  {loadingStores && <div style={{ color: '#475569' }}>Loading stores...</div>}
                  {!loadingStores && storesError && <div style={{ color: '#b91c1c' }}>{storesError}</div>}
                  {!loadingStores && !storesError && storesWithNearestBranch.length === 0 && (
                    <div style={{ color: '#64748b' }}>
                      {search.trim()
                        ? `No stores matched "${search.trim()}" in visible storefront catalog items.`
                        : 'No visible storefronts yet. Tenant pages auto-activate once each tenant enables storefront visibility and active location setup.'}
                    </div>
                  )}

                  {!loadingStores && !storesError && discoveryMapPins.length > 0 && viewMode === 'map' && (
                    <StoresMap
                      stores={discoveryMapPins}
                      selectedKey={highlightedDiscoveryMarkerKey || null}
                      userLocation={discoveryCoords}
                      onSelectStore={(pin) => {
                        setHighlightedStoreSlug(pin.slug);
                        setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                        goStore(pin.slug, pin.location_id ?? null);
                      }}
                    />
                  )}

                  {!loadingStores && !storesError && storesWithNearestBranch.length > 0 && viewMode !== 'map' && (
                    <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'list' ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {storesWithNearestBranch.map((store) => (
                        <button
                          key={store.slug}
                          type="button"
                          onMouseEnter={() => {
                            setHighlightedStoreSlug(store.slug);
                            const nearestPin = discoveryMapPins.find((pin) => pin.slug === store.slug);
                            if (nearestPin) setHighlightedDiscoveryMarkerKey(nearestPin.marker_key);
                          }}
                          onClick={() => goStore(store.slug)}
                          style={{ textAlign: 'left', borderRadius: 14, border: '1px solid #d6e2e8', background: '#fff', padding: 14, cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <strong style={{ fontSize: 18 }}>{store.tenant_name}</strong>
                            <span style={{ fontSize: 12, color: store.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700 }}>{store.storefront_open ? 'Open' : 'Closed'}</span>
                          </div>
                          <div style={{ marginTop: 8, color: '#425466', fontSize: 13 }}>{store.address_line || 'Address unavailable'}</div>
                          <div style={{ marginTop: 8, fontSize: 12, color: '#4f46e5', fontWeight: 700 }}>{store.catalog_count} storefront item(s) • Wait {store.estimated_wait_minutes} min</div>
                          {Number.isFinite(Number(store.nearest_distance_km)) && (
                            <div style={{ marginTop: 4, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                              {Number(store.nearest_distance_km).toFixed(2)} km from your location
                            </div>
                          )}
                          {store.nearest_location_name && (
                            <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>
                              Nearest branch: <strong>{store.nearest_location_name}</strong> {store.nearest_is_primary ? '(Primary)' : ''}
                            </div>
                          )}
                          <div style={{ marginTop: 10, fontSize: 12, color: '#0f766e', textDecoration: 'underline' }}>Open tenant storefront page</div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>Live Storefront Map</strong>
                  {!loadingStores && !storesError && discoveryMapPins.length > 0 ? (
                    <StoresMap
                      stores={discoveryMapPins}
                      selectedKey={highlightedDiscoveryMarkerKey || null}
                      userLocation={discoveryCoords}
                      onSelectStore={(pin) => {
                        setHighlightedStoreSlug(pin.slug);
                        setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                        goStore(pin.slug, pin.location_id ?? null);
                      }}
                    />
                  ) : (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, color: '#64748b' }}>Map will appear once storefront data is available.</div>
                  )}

                  {highlightedStore && (
                    <article style={{ border: '1px solid #dbeafe', borderRadius: 12, background: '#eff6ff', padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{highlightedStore.tenant_name}</strong>
                        <span style={{ color: highlightedStore.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700, fontSize: 12 }}>
                          {highlightedStore.storefront_open ? 'Open' : 'Closed'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6, color: '#334155' }}>{highlightedStore.address_line || 'Address unavailable'}</div>
                      {Number.isFinite(Number(highlightedStore.nearest_distance_km)) && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                          {Number(highlightedStore.nearest_distance_km).toFixed(2)} km from your location
                        </div>
                      )}
                      {highlightedStore.nearest_location_name && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
                          Closest active branch: <strong>{highlightedStore.nearest_location_name}</strong> {highlightedStore.nearest_is_primary ? '(Primary)' : ''}
                        </div>
                      )}
                      <button type="button" onClick={() => goStore(highlightedStore.slug)} style={{ marginTop: 10, width: '100%', borderRadius: 9, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 10px', fontWeight: 700 }}>
                        Open This Tenant Storefront
                      </button>
                    </article>
                  )}

                  <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: 10 }}>
                    <strong style={{ fontSize: 14 }}>Quick Flow</strong>
                    <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#64748b' }}>Search a store, open its tenant page, add items, then checkout using the bottom cart popout.</p>
                  </article>
                </section>
              </div>
            </section>
          </>
        )}

        {isStorePage && (
          <>
            <section style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={goDiscovery} style={{ borderRadius: 10, border: '1px solid #334155', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700 }}>? Back to General Store</button>
              <div style={{ color: '#64748b', fontSize: 13 }}>Tenant page: {routeSlug}</div>
            </section>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 34 }}>{selectedStore?.tenant_name || 'Loading storefront...'}</h1>
                {buildStamp && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px', background: '#f8fafc' }}>
                    Build {buildStamp}
                  </span>
                )}
              </div>
              <p style={{ margin: '8px 0 0 0', color: '#475569' }}>{selectedLocation?.address_line || selectedStore?.address_line || 'Tenant storefront page is loading or being configured.'}</p>
              {selectedStore && <div style={{ marginTop: 8, color: '#0f766e', fontWeight: 700, fontSize: 13 }}>{selectedStore.storefront_open ? 'Open now' : 'Temporarily closed'} • {selectedStore.catalog_count} storefront item(s)</div>}
            </section>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16, marginBottom: 14 }}>
              {selectedStore ? (
                <>
                  <StoresMap
                    stores={
                      storeLocations.length > 0
                        ? storeLocations.map((location) => ({
                          ...location,
                          tenant_name: selectedStore.tenant_name,
                          marker_key: `loc-${location.location_id}`,
                          location_name: location.name
                        }))
                        : [selectedStore]
                    }
                    selectedKey={selectedLocationId != null ? `loc-${selectedLocationId}` : null}
                    onSelectStore={(location) => {
                      if (location?.location_id != null) {
                        setSelectedLocationId(location.location_id);
                      }
                    }}
                  />
                  <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
                    {storeLocations.length > 0
                      ? `Showing ${storeLocations.length} active fulfillment location pin(s). Discovery and Near Me rank by the nearest active branch pin.`
                      : 'Showing storefront location pin used by discovery and Near Me.'}
                  </div>
                  {selectedLocation && (
                    <div style={{ marginTop: 6, fontSize: 13, color: '#0f766e', fontWeight: 700 }}>
                      Selected fulfillment location: {selectedLocation.name} ({selectedLocation.address_line || 'Address unavailable'})
                    </div>
                  )}
                </>
              ) : <div style={{ color: '#64748b' }}>Waiting for storefront map pin...</div>}
            </section>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 34 }}>Store Catalog</h2>
                <button type="button" onClick={() => openStoreBySlug(routeSlug)} style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}>Refresh Tenant Page</button>
              </div>

              {loadingCatalog && <p style={{ color: '#475569' }}>Loading tenant catalog...</p>}
              {!loadingCatalog && catalogError && <p style={{ color: '#b91c1c' }}>{catalogError}</p>}
              {!loadingCatalog && !catalogError && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 10 }}>
                  {catalog.map((item) => (
                    <div key={item.item_id} style={{ border: '1px solid #d6e2e8', borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{item.name}</div>
                      <div style={{ marginTop: 8, color: '#0f766e', fontWeight: 700 }}>{money(item.default_sale_price ?? item.cost_per_unit ?? 0)}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: Number(item.current_stock) > 0 ? '#0f766e' : '#b91c1c', fontWeight: 700 }}>
                        IMS Stock: {Number.isFinite(Number(item.current_stock)) ? Number(item.current_stock).toFixed(2) : '0.00'} {item.unit_of_measure || ''} {Number(item.current_stock) > 0 ? '(In stock)' : '(Out of stock)'}
                      </div>
                      <button type="button" onClick={() => addToCart(item)} disabled={Number(item.current_stock) <= 0} style={{ marginTop: 10, width: '100%', borderRadius: 10, border: '1px solid #7f1d1d', background: Number(item.current_stock) > 0 ? '#7f1d1d' : '#cbd5e1', color: '#fff', padding: '8px 10px', fontWeight: 700, cursor: Number(item.current_stock) > 0 ? 'pointer' : 'not-allowed' }}>Add to Cart</button>
                    </div>
                  ))}
                  {catalog.length === 0 && <p style={{ color: '#64748b' }}>No storefront-visible items configured for this tenant yet.</p>}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {isStorePage && (
        <>
          <button
            type="button"
            onClick={() => {
              setIsCheckoutOpen((prev) => {
                const next = !prev;
                if (next) setCheckoutTab('checkout');
                return next;
              });
            }}
            style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 2100, border: 'none', borderRadius: 999, background: 'linear-gradient(135deg,#7f1d1d,#991b1b 65%,#b91c1c)', color: '#fff', boxShadow: '0 12px 30px rgba(127,29,29,.35)', padding: '12px 18px', minWidth: 245, textAlign: 'left', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 13, opacity: .95 }}>Cart {cartCount}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{money(cartTotal)}</div>
            <div style={{ marginTop: 2, fontSize: 12, textDecoration: 'underline' }}>{isCheckoutOpen ? 'Close checkout' : 'Go to checkout'}</div>
          </button>

          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: isCheckoutOpen ? 'auto' : 'none' }}>
            <div role="button" tabIndex={0} onClick={() => setIsCheckoutOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsCheckoutOpen(false); }} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.50)', backdropFilter: 'blur(6px)', opacity: isCheckoutOpen ? 1 : 0, transition: 'opacity 180ms ease' }} />
            <aside
              style={{
                position: 'absolute',
                zIndex: 2001,
                background: 'linear-gradient(180deg,#ffffff 0%,#f7fbfb 100%)',
                border: '1px solid #d6e2e8',
                boxShadow: isDesktopCheckout ? '0 30px 80px rgba(15,23,42,.18)' : '0 -14px 34px rgba(15,23,42,.22)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 220ms ease, opacity 220ms ease',
                opacity: isCheckoutOpen ? 1 : 0,
                ...(isDesktopCheckout
                  ? {
                    top: 24,
                    right: 24,
                    bottom: 24,
                    width: 'min(1080px, calc(100vw - 48px))',
                    borderRadius: 26,
                    transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(32px)'
                  }
                  : {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    maxHeight: '92vh',
                    borderTopLeftRadius: 22,
                    borderTopRightRadius: 22,
                    transform: isCheckoutOpen ? 'translateY(0)' : 'translateY(105%)'
                  })
              }}
            >
              <div style={{ padding: isDesktopCheckout ? '16px 18px 12px 18px' : '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.88)' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>Guest Checkout</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedStore?.tenant_name || routeSlug || 'Tenant'}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#e6fffb', border: '1px solid #99f6e4', borderRadius: 999, padding: '3px 8px' }}>
                      {cartCount} item{cartCount === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout'}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setIsCheckoutOpen(false)} style={{ borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', width: 34, height: 34, fontWeight: 900, cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ display: 'flex', gap: 8, padding: isDesktopCheckout ? '14px 18px 8px 18px' : '12px 14px 6px 14px', background: 'rgba(255,255,255,.72)' }}>
                {[{ id: 'checkout', label: 'Checkout' }, { id: 'track', label: 'Track' }].map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setCheckoutTab(tab.id)} style={{ borderRadius: 999, border: `1px solid ${checkoutTab === tab.id ? '#0f766e' : '#cbd5e1'}`, background: checkoutTab === tab.id ? '#e6fffb' : '#fff', color: checkoutTab === tab.id ? '#0f766e' : '#334155', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>{tab.label}</button>
                ))}
              </div>

              <div style={{ overflowY: 'auto', padding: isDesktopCheckout ? '12px 18px 18px 18px' : '8px 14px 16px 14px' }}>
                {checkoutTab === 'checkout' && (
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.5fr) minmax(340px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
                    <section style={{ display: 'grid', gap: 14 }}>
                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Delivery Details</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Group the must-fill fields together so checkout feels faster and calmer.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                          {storeLocations.length > 0 && (
                            <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                              Fulfillment Location
                              <select
                                value={selectedLocationId ?? ''}
                                onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                                style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                              >
                                {storeLocations.map((location) => (
                                  <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                                    {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Order Method
                            <select
                              value={orderMethod}
                              onChange={(e) => {
                                setOrderMethod(e.target.value);
                                setPinLocationError('');
                              }}
                              style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                            >
                              {ORDER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Customer Name
                            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is receiving this?" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Phone Number
                            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                        </div>
                        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10 }}>
                          Delivery Address
                          <input
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder={isDeliveryOrder ? 'House number, street, landmark' : 'Address is only needed for delivery'}
                            disabled={!isDeliveryOrder}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: isDeliveryOrder ? '#fff' : '#f1f5f9' }}
                          />
                        </label>
                        {selectedLocation?.is_open === false && (
                          <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                            Selected location is closed and cannot accept orders right now.
                          </div>
                        )}
                      </div>

                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Location Pin</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {isDeliveryOrder ? 'Add a precise drop-off pin to help fulfillment.' : 'Pinning is available for delivery orders.'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={handlePinMyLocation}
                              disabled={!isDeliveryOrder || pinLocationLoading}
                              style={{ borderRadius: 12, border: '1px solid #0f766e', background: isDeliveryOrder ? '#fff' : '#f8fafc', color: '#0f766e', padding: '9px 12px', fontWeight: 700, cursor: isDeliveryOrder ? 'pointer' : 'not-allowed' }}
                            >
                              {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerPin(null)}
                              disabled={!isDeliveryOrder || !customerPin}
                              style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700, cursor: (!isDeliveryOrder || !customerPin) ? 'not-allowed' : 'pointer' }}
                            >
                              Clear Pin
                            </button>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                          {isDeliveryOrder
                            ? (customerPin
                              ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
                              : 'No pin selected yet. Tap the map or use your current location.')
                            : 'Switch order method to Delivery if you want to save a location pin.'}
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <DeliveryPinMap
                            pin={customerPin}
                            onPinChange={setCustomerPin}
                            disabled={!isDeliveryOrder}
                          />
                          {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
                        </div>
                      </div>
                    </section>

                    <section style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 14, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Order Summary</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Keep the total visible while editing.</div>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
                        </div>
                        <div style={{ maxHeight: isDesktopCheckout ? 320 : 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 16, padding: 10, marginTop: 12, background: '#fbfeff' }}>
                          {cart.length === 0 && <p style={{ margin: 0, color: '#64748b' }}>Cart is empty.</p>}
                          {cart.map((line) => (
                            <div key={line.item_id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 78px 96px', gap: 10, alignItems: 'center', marginBottom: 10, padding: 10, border: '1px solid #e6edf2', borderRadius: 14, background: '#fff' }}>
                              <div style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {line.image_url ? (
                                  <img
                                    src={line.image_url}
                                    alt={line.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: 6 }}>No Image</span>
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  Unit: {money(line.price)} {line.unit_of_measure ? `• ${line.unit_of_measure}` : ''}
                                </div>
                                <div style={{ fontSize: 11, color: Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY) ? '#b91c1c' : '#0f766e', fontWeight: 700 }}>
                                  Stock: {Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock).toFixed(2) : 'n/a'} {line.unit_of_measure || ''}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCartItem(line.item_id)}
                                  style={{ marginTop: 6, border: 'none', background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Remove
                                </button>
                              </div>
                              <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateQty(line.item_id, e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 10px', background: '#fff', fontWeight: 700 }} />
                              <span style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{money(line.quantity * line.price)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 12, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14 }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Items Subtotal</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.subtotal_amount)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Delivery Fee</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.delivery_fee)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Vatable Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vatable_sales)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>VAT Amount</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_amount)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>VAT-Exempt Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_exempt_sales)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Zero-Rated Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.zero_rated_sales)}</strong>
                            </div>
                            <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.24)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 14, fontWeight: 800 }}>Total Amount Due</span>
                              <strong style={{ fontSize: 22 }}>{money(totalsForDisplay.total_amount)}</strong>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, opacity: .95 }}>
                            {quoteResult
                              ? (quoteNeedsRefresh ? 'Displayed totals are stale. Click Quote again to re-sync and unlock checkout.' : 'Totals are synced from the latest quote and checkout is enabled.')
                              : 'No quote yet. Click Quote to unlock checkout.'}
                          </div>
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.55)', background: '#ffffff', color: '#0f766e', padding: '11px 12px', fontWeight: 800 }}>Quote</button>
                            <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0b3d3a', color: '#fff', padding: '11px 12px', fontWeight: 800 }}>{checkoutLoading ? 'Processing...' : 'Checkout'}</button>
                          </div>
                        </div>
                        {hasStockViolation && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
                            Cannot checkout: one or more lines exceed current stock.
                          </p>
                        )}
                        {!quoteResult && cart.length > 0 && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Quote is required before checkout.
                          </p>
                        )}
                        {quoteResult && quoteNeedsRefresh && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Cart changed after quote. Click Quote again to proceed.
                          </p>
                        )}
                        {quoteError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
                        {quoteResult && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>
                            Quote synced. Total due: {money(totalsForDisplay.total_amount)}
                          </p>
                        )}
                        {checkoutError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                        {checkoutResult?.tracking_pin && <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>Order placed. Tracking PIN: <strong>{checkoutResult.tracking_pin}</strong></p>}
                      </div>
                    </section>
                  </div>
                )}

                {checkoutTab === 'track' && (
                  <div style={{ maxWidth: 560, border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>Track Order</h3>
                    <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>Enter a tracking PIN to check the latest status without leaving the sheet.</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={trackingPinInput} onChange={(e) => setTrackingPinInput(e.target.value.toUpperCase())} placeholder="SK-XXXXXX" style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px' }} />
                      <button type="button" onClick={handleTrack} disabled={!selectedStore} style={{ borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '11px 16px', fontWeight: 700 }}>Track</button>
                    </div>
                    {trackingError && <p style={{ color: '#b91c1c', marginTop: 10 }}>{trackingError}</p>}
                    {trackingResult && <div style={{ marginTop: 10, fontSize: 14, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>Status: <strong>{trackingResult.status_label || trackingResult.status}</strong></div>}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster richColors position="top-right" />
  </React.StrictMode>
);






