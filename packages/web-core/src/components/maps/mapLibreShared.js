const DEFAULT_TILE_BASE = 'https://tiles.openfreemap.org';
const LOCAL_TILE_PROXY_BASE = '/openfreemap';
const POS_APP_SURFACE = 'pos';

export const DEFAULT_CENTER = Object.freeze({ latitude: 10.7202, longitude: 122.5621 });
export const PHILIPPINES_BOUNDS = Object.freeze({
  minLatitude: 4.2,
  maxLatitude: 21.5,
  minLongitude: 116,
  maxLongitude: 127
});

export const TILE_BASE = import.meta.env.VITE_TILE_BASE || DEFAULT_TILE_BASE;

export const shouldUseLocalTileProxy = (env = import.meta.env) => {
  const configuredTileBase = String(env?.VITE_TILE_BASE || '').trim();
  const appSurface = String(env?.VITE_APP_SURFACE || '').trim().toLowerCase();
  return !configuredTileBase && appSurface !== POS_APP_SURFACE;
};

export const getMapStyleUrl = (env = import.meta.env) => {
  const configuredTileBase = String(env?.VITE_TILE_BASE || '').trim();
  if (configuredTileBase) return `${configuredTileBase.replace(/\/+$/, '')}/styles/positron`;
  if (!shouldUseLocalTileProxy(env)) return `${DEFAULT_TILE_BASE}/styles/positron`;
  return `${LOCAL_TILE_PROXY_BASE}/styles/positron`;
};

export const rewriteOpenFreeMapUrl = (url, origin = '') => {
  if (typeof url !== 'string' || !url.startsWith(DEFAULT_TILE_BASE)) return url;
  const base = origin ? `${origin}${LOCAL_TILE_PROXY_BASE}` : LOCAL_TILE_PROXY_BASE;
  return url.replace(DEFAULT_TILE_BASE, base);
};

export const TILING_SERVER = getMapStyleUrl();

export const tileTransformRequest = (url) => {
  if (!shouldUseLocalTileProxy()) return { url };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return { url: rewriteOpenFreeMapUrl(url, origin) };
};

export const applyMapLibreCanvasSizing = (map) => {
  const canvasContainer = map?.getCanvasContainer?.();
  if (canvasContainer?.style) {
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '100%';
  }

  const canvas = map?.getCanvas?.();
  if (canvas?.style) {
    canvas.style.zIndex = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
};

export const canResizeMapContainer = (container) => {
  if (!container || container.isConnected === false) return false;
  const rect = container.getBoundingClientRect?.();
  if (!rect) return true;
  return rect.width > 0 && rect.height > 0;
};

export const safeResizeMap = (map, container) => {
  if (!map || !canResizeMapContainer(container)) return;
  try {
    applyMapLibreCanvasSizing(map);
    map.resize();
  } catch {
    // MapLibre can throw while a modal is closing or a hidden panel is being reflowed.
  }
};

export const parseMapCoordinate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

export const isZeroCoordinatePair = (latitude, longitude) => (
  Math.abs(Number(latitude)) < 0.000001 && Math.abs(Number(longitude)) < 0.000001
);

export const isCoordinateInPhilippines = ({ latitude, longitude }) => {
  const lat = parseMapCoordinate(latitude);
  const lng = parseMapCoordinate(longitude);
  if (lat == null || lng == null) return false;
  return lat >= PHILIPPINES_BOUNDS.minLatitude
    && lat <= PHILIPPINES_BOUNDS.maxLatitude
    && lng >= PHILIPPINES_BOUNDS.minLongitude
    && lng <= PHILIPPINES_BOUNDS.maxLongitude;
};

export const getMerchantPinValidationError = ({ latitude, longitude } = {}) => {
  const lat = parseMapCoordinate(latitude);
  const lng = parseMapCoordinate(longitude);
  if (lat == null || lng == null) return 'Please pin the location on the map.';
  if (isZeroCoordinatePair(lat, lng)) return 'Please pin the location on the map.';
  if (!isCoordinateInPhilippines({ latitude: lat, longitude: lng })) {
    return 'Storefront pins must be located in the Philippines.';
  }
  return '';
};

export const getUsableMerchantPin = ({ latitude, longitude } = {}) => {
  const lat = parseMapCoordinate(latitude);
  const lng = parseMapCoordinate(longitude);
  if (getMerchantPinValidationError({ latitude: lat, longitude: lng })) return null;
  return { latitude: lat, longitude: lng };
};
