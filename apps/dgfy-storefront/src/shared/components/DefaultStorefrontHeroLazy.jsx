import { lazy, Suspense } from 'react';

// Issue #282, Phase G: see modes/services/storefront/components/
// ServicesHeroLazy.jsx for why. DefaultStorefrontHero.jsx itself reuses
// FnbHero's sub-components internally (deliberately, for visual
// consistency) -- lazy-wrapping it here means retail/fallback-mode
// visitors now load that fnb-derived code on demand too, instead of it
// riding along in the main bundle for every mode.
const LazyDefaultStorefrontHeroImpl = lazy(() =>
  import('./DefaultStorefrontHero.jsx').then((module) => ({ default: module.DefaultStorefrontHero }))
);

export function DefaultStorefrontHero(props) {
  return (
    <Suspense fallback={<div style={{ minHeight: props.isMobileViewport ? 190 : 316 }} />}>
      <LazyDefaultStorefrontHeroImpl {...props} />
    </Suspense>
  );
}
