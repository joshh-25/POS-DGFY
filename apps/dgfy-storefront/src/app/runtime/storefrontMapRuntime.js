import { DEFAULT_CENTER, rewriteOpenFreeMapUrl } from '../../../../../packages/web-core/src/components/maps/mapLibreShared.js';

const DEFAULT_TILE_BASE = 'https://tiles.openfreemap.org';

export { DEFAULT_CENTER };

export const TILE_BASE = String(import.meta.env.VITE_TILE_BASE || DEFAULT_TILE_BASE).trim().replace(/\/+$/, '') || DEFAULT_TILE_BASE;

export const TILING_SERVER = import.meta.env.DEV
  ? '/openfreemap/styles/positron'
  : `${TILE_BASE}/styles/positron`;

export const tileTransformRequest = import.meta.env.DEV
  ? (url) => ({ url: rewriteOpenFreeMapUrl(url, window.location.origin) })
  : undefined;
