import { lazy, Suspense } from 'react';

// Issue #282, Phase G: see ServicesHeroLazy.jsx for why. FnbHero is also
// what shared/components/DefaultStorefrontHero.jsx reuses internally for
// every non-fnb/services/simple mode -- that reuse is unaffected by this
// wrapper, since DefaultStorefrontHero.jsx still imports FnbHero's
// sub-components (not this file) directly.
const LazyFnbHeroImpl = lazy(() =>
  import('./FnbHero.jsx').then((module) => ({ default: module.FnbHero }))
);

export function FnbHero(props) {
  return (
    <Suspense fallback={<div style={{ minHeight: props.isMobileViewport ? 190 : 316 }} />}>
      <LazyFnbHeroImpl {...props} />
    </Suspense>
  );
}
