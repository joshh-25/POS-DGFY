// A storefront URL only gets added when E2E_STORE_SLUG names a real, seeded
// tenant -- unlike /login (a static admin route usable with no backend
// data), a storefront route 404s without one. Mirrors the same convention
// tests/e2e/store/paymongo-order-finalization.spec.js uses. Also requires
// the backend API reachable at VITE_PROXY_TARGET (default 127.0.0.1:5000)
// and `npm run build:store` already run, since the store preview server
// only serves a build that exists on disk. See issue #282's Phase A
// baseline: scratch/storefront-perf-baseline-282.md.
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const storefrontUrls = storeSlug ? [`http://localhost:5175/${storeSlug}`] : [];
// Both preview servers are independent vite configs (apps/store has its own
// port/proxy setup) -- background the second one and let LHCI's own
// URL-polling readiness check gate collection on both being up.
const startServerCommand = storeSlug
  ? 'npm run preview -- --port 5173 & npm run preview -- --config apps/store/vite.config.js --port 5175 & wait'
  : 'npm run preview -- --port 5173';

module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:5173/login',
        ...storefrontUrls,
      ],
      startServerCommand,
      numberOfRuns: 2,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['warn', { minScore: 0.8 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'interactive': ['warn', { maxNumericValue: 3500 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
