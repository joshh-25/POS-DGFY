const DEFAULT_TILE_BASE = 'https://tiles.openfreemap.org';

export const DEFAULT_CENTER = Object.freeze({ latitude: 10.7202, longitude: 122.5621 });

export const TILE_BASE = import.meta.env.VITE_TILE_BASE || DEFAULT_TILE_BASE;

export const TILING_SERVER = import.meta.env.DEV
  ? '/openfreemap/styles/positron'
  : `${TILE_BASE}/styles/positron`;

export const tileTransformRequest = import.meta.env.DEV
  ? (url) => {
      if (typeof url === 'string' && url.startsWith(TILE_BASE)) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return { url: url.replace(TILE_BASE, `${origin}/openfreemap`) };
      }
      return { url };
    }
  : undefined;

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
