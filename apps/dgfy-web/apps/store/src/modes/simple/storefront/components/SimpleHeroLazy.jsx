import { lazy, Suspense } from 'react';

// Issue #282, Phase G: see ServicesHeroLazy.jsx for why.
const LazySimpleHeroImpl = lazy(() =>
  import('./SimpleHero.jsx').then((module) => ({ default: module.SimpleHero }))
);

export function SimpleHero(props) {
  return (
    <Suspense fallback={<div style={{ minHeight: props.isMobileViewport ? 190 : 316 }} />}>
      <LazySimpleHeroImpl {...props} />
    </Suspense>
  );
}
