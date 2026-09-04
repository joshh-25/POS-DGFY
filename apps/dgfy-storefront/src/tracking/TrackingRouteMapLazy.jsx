import { lazy, Suspense } from 'react';

// Issue #282, Phase E: maplibre-gl (~1.1MB / 285kB gzip) was previously
// statically imported by TrackingRouteMap.jsx and reachable from every
// storefront page load regardless of whether an order-tracking map ever
// rendered. This wrapper defers that whole module graph -- including the
// library itself -- to a lazy chunk loaded only when a consumer actually
// renders <TrackingRouteMap>. Self-contained Suspense boundary means the
// consumer only needs its import path repointed here; no JSX/Suspense
// changes at the call site. Import extractTrackingMapCoordinates from
// extractTrackingMapCoordinates.js directly (not from here, and not from
// TrackingRouteMap.jsx) to avoid pulling this whole chunk in just for the
// coordinate math.
const LazyTrackingRouteMapImpl = lazy(() => import('./TrackingRouteMap.jsx'));

export default function TrackingRouteMap(props) {
  const resolvedHeight = typeof props.mapHeight === 'number' ? `${props.mapHeight}px` : String(props.mapHeight || '280px');
  return (
    <Suspense fallback={<div style={{ height: resolvedHeight, borderRadius: 20, border: '1px solid #dbe5ee', background: '#f8fafc' }} />}>
      <LazyTrackingRouteMapImpl {...props} />
    </Suspense>
  );
}
