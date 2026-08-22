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
        `${posUrl}/pos`,
        ...storefrontUrls,
      ],
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
