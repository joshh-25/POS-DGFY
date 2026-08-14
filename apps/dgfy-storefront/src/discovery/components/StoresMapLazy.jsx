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
const LazyStoresMapImpl = lazy(() =>
  import('./StoresMap.jsx').then((module) => ({ default: module.StoresMap }))
);

export function StoresMap(props) {
  const resolvedHeight = typeof props.height === 'number' ? `${props.height}px` : String(props.height || '360px');
  return (
    <Suspense fallback={<div style={{ width: '100%', height: resolvedHeight }} />}>
      <LazyStoresMapImpl {...props} />
    </Suspense>
  );
}
