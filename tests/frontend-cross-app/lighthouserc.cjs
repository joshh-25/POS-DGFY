// This file must stay CommonJS (.cjs) -- this workspace's package.json sets
// "type": "module", and LHCI's own config loader requires module.exports.
//
// The storefront root is always audited; when E2E_STORE_SLUG names a real,
// seeded tenant, the seeded route is audited as well. Mirrors the same convention
// tests/e2e/store/paymongo-order-finalization.spec.js uses. Also requires
// the backend API reachable at VITE_PROXY_TARGET (default 127.0.0.1:5000)
// and `npm run build:store` already run, since the store preview server
// only serves a build that exists on disk. See issue #282's Phase A
// baseline: https://github.com/Sieitzz/dgfy-platform/issues/282#issuecomment-5242741151
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const skupervisorUrl = process.env.LHCI_SKUPERVISOR_URL || 'http://localhost:5173';
const posUrl = process.env.LHCI_POS_URL || 'http://localhost:5174';
const storefrontUrl = process.env.LHCI_STOREFRONT_URL || 'http://localhost:5175';
const storefrontUrls = [storeSlug ? `${storefrontUrl}/${storeSlug}` : `${storefrontUrl}/`];

// Three independent apps post-split (issue #322) -- background all three preview
// servers and let LHCI's own URL-polling readiness check gate collection on all
// of them being up. Only meaningful when LHCI_*_URL point at localhost (the
// default); when a caller overrides them to already-running remote servers,
// this command still runs but its ports simply won't be polled against.
const startServerCommand =
  'npm --prefix ../../apps/dgfy-ims run preview -- --port 5173 & ' +
  'npm --prefix ../../apps/dgfy-pos run preview -- --port 5174 & ' +
  'npm --prefix ../../apps/dgfy-storefront run preview -- --port 5175 & wait';

module.exports = {
  ci: {
    collect: {
      settings: {
        // POS and SKUpervisor are desktop-first surfaces; use Lighthouse's
        // desktop profile so local CPU throttling does not turn bundle-load
        // latency into a false production regression. Mobile behavior remains
        // covered by the Playwright responsive suite.
        preset: 'desktop',
        ...(process.env.LHCI_CHROME_FLAGS
          ? { chromeFlags: process.env.LHCI_CHROME_FLAGS }
          : {}),
      },
      url: [
        `${skupervisorUrl}/login`,
        // POS is a HashRouter with base: './' -- everything after the origin's
        // pathname is served the SPA shell and routes off the URL fragment, so
        // this resolves the same terminal root page as `${posUrl}/`. Kept
        // verbatim from origin/develop rather than silently "fixed" to
        // `${posUrl}/#/` -- functionally equivalent, cosmetic only.
        `${posUrl}/pos`,
        ...storefrontUrls,
      ],
      startServerCommand,
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.8 }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'interactive': ['error', { maxNumericValue: 3500 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
