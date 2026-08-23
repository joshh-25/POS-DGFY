import { lazy, Suspense } from 'react';

// Issue #282, Phase G: exactly one of ServicesHero/FnbHero/SimpleHero/
// DefaultStorefrontHero/HospitalityBookingPanel ever renders per page load
// (app/pages/StorefrontHeroBandContainer.jsx's branches are mutually
// exclusive), yet all five were statically imported there, so every
// storefront visitor downloaded all five modes' hero code regardless of
// which single mode their store actually is. Same self-contained
// Suspense-wrapper pattern as the Phase E map lazy-wrappers
// (discovery/components/StoresMapLazy.jsx) -- consumers only need their
// import path repointed, no JSX/Suspense changes at the call site.
const LazyServicesHeroImpl = lazy(() =>
  import('./ServicesHero.jsx').then((module) => ({ default: module.ServicesHero }))
);

export function ServicesHero(props) {
  return (
    <Suspense fallback={<div style={{ minHeight: props.isMobileViewport ? 190 : 316 }} />}>
      <LazyServicesHeroImpl {...props} />
    </Suspense>
  );
}
