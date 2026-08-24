import { lazy, Suspense } from 'react';

// Issue #282, Phase E: maplibre-gl (~1.1MB / 285kB gzip) was previously
// statically imported by StoresMap.jsx and reachable from every storefront
// page load regardless of whether a stores map ever rendered -- including
// the discovery landing page and, via the hero contact-location components,
// the default storefront page itself for stores with map data. This
// wrapper defers that whole module graph -- including the library itself --
// to a lazy chunk loaded only when a consumer actually renders <StoresMap>.
// Self-contained Suspense boundary means every consumer only needs its
// import path repointed here; no JSX/Suspense changes at call sites.
const loadStoresMapModule = () =>
  import('./StoresMap.jsx').then((module) => ({ default: module.StoresMap }));

// MapLibre is interaction-heavy and is not required to paint the discovery
// shell. Waiting until the document has loaded and the browser reaches an idle
// window keeps the visible map behavior intact while taking its parse/evaluate
// work out of the first-paint critical path. The timeout is a bounded fallback
// for browsers that do not expose requestIdleCallback or pages with a long load
// event; it also prevents a map from remaining permanently on its fallback.
const loadStoresMapWhenIdle = () => {
  // Keep Vitest and local development behavior synchronous so map contracts
  // remain deterministic; the defer is specifically a production startup
  // optimization for the shipped discovery shell.
  if (import.meta.env.MODE !== 'production') return loadStoresMapModule();
  if (typeof window === 'undefined') return loadStoresMapModule();

  return new Promise((resolve, reject) => {
    let started = false;
    let timeoutId = null;

    const start = () => {
      if (started) return;
      started = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);

      const load = () => loadStoresMapModule().then(resolve, reject);
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(load, { timeout: 1200 });
      } else {
        window.setTimeout(load, 0);
      }
    };

    if (document.readyState === 'complete') {
      start();
      return;
    }

    window.addEventListener('load', start, { once: true });
    timeoutId = window.setTimeout(start, 2200);
  });
};

const LazyStoresMapImpl = lazy(loadStoresMapWhenIdle);

export function StoresMap(props) {
  const resolvedHeight = typeof props.height === 'number' ? `${props.height}px` : String(props.height || '360px');
  return (
    <Suspense fallback={<div style={{ width: '100%', height: resolvedHeight }} />}>
      <LazyStoresMapImpl {...props} />
    </Suspense>
  );
}
