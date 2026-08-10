import { lazy, Suspense } from 'react';

// Issue #282, Phase E: maplibre-gl (~1.1MB / 285kB gzip) was previously
// statically imported by DeliveryPinMap.jsx and reachable from every
// storefront page load regardless of whether a delivery-pin map ever
// rendered. This wrapper defers that whole module graph -- including the
// library itself -- to a lazy chunk loaded only when a consumer actually
// renders <DeliveryPinMap>. Self-contained Suspense boundary means every
// consumer only needs its import path repointed here; no JSX/Suspense
// changes at call sites.
const LazyDeliveryPinMapImpl = lazy(() =>
  import('./DeliveryPinMap.jsx').then((module) => ({ default: module.DeliveryPinMap }))
);

export function DeliveryPinMap(props) {
  const resolvedHeight = typeof props.height === 'number' ? `${props.height}px` : String(props.height || '260px');
  return (
    <Suspense fallback={<div style={{ width: '100%', height: resolvedHeight }} />}>
      <LazyDeliveryPinMapImpl {...props} />
    </Suspense>
  );
}
