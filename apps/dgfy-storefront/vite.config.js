import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../packages/web-core/vite/sentryViteConfig.js';
import { buildWebCoreRuntimeDepAliases } from '../../packages/web-core/vite/webCoreRuntimeDeps.js';
// Opt-in only (VITE_ANALYZE_BUNDLE=true) -- writes a stats.html treemap next
// to the build output. Never runs in a normal `build` so it can't perturb
// production build size/timing. See issue #282's Phase A baseline:
// https://github.com/Sieitzz/dgfy-platform/issues/282#issuecomment-5242741151
const shouldAnalyzeBundle = String(process.env.VITE_ANALYZE_BUNDLE || '').trim() === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Shared trunk extracted to packages/web-core (issue #322). Alias key is unchanged from
// before the split -- only its target moved. See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(__dirname, '../../packages/web-core');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const configuredBasePath = process.env.VITE_STORE_BASE_PATH || '/';
const allowedHosts = true;
// Sentry/PostHog env vars (SENTRY_PROJECT_STORE, VITE_SENTRY_DSN_STORE, ...) all key off
// 'store', not 'storefront' -- kept as-is pending Phase 6's consumer fanout.
const appSurface = 'store';
const appNodeModules = path.resolve(__dirname, 'node_modules');
// Mirrors the `@/components` entry in the other two apps' vite configs. The DGFY auth and
// business pages ported into this app import the shared shadcn primitives
// (`@/components/ui/input`, `button`, `label`) that live in packages/web-core/Components.
const sharedAliases = [
  { find: '@/components', replacement: path.resolve(webCoreRoot, 'Components') },
  // Bare packages web-core's own source imports -- it has no node_modules of its own,
  // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
  ...buildWebCoreRuntimeDepAliases(appNodeModules)
];
const normalizedBasePath = (() => {
  const trimmed = String(configuredBasePath).trim() || '/';
  if (trimmed === '/') return '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
})();
const proxyTargets = {
  '/api': {
    target: apiProxyTarget,
    // Preserve the browser Host header so local custom storefront domains can
    // be resolved by the backend tenant middleware.
    changeOrigin: false,
    secure: false
  },
  '/uploads': {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: false
  },
  '/openfreemap': {
    target: 'https://tiles.openfreemap.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/openfreemap/, ''),
    secure: false
  },
  // Same-origin PostHog (EU cloud) dev proxy, mirroring
  // infrastructure/docker/nginx/nginx.conf.template's /ingest/ blocks so local
  // dev exercises the same path analyticsClient.js defaults to. More specific
  // prefixes first -- Vite matches proxy keys in insertion order.
  '/ingest/static': {
    target: 'https://eu-assets.i.posthog.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ingest\/static/, '/static')
  },
  '/ingest/array': {
    target: 'https://eu-assets.i.posthog.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ingest\/array/, '/array')
  },
  '/ingest': {
    target: 'https://eu.i.posthog.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ingest/, '')
  }
};

export default defineConfig(async () => {
  const { visualizer } = shouldAnalyzeBundle ? await import('rollup-plugin-visualizer') : { visualizer: null };
  return {
  base: normalizedBasePath,
  plugins: [
    react(),
    ...buildSentryVitePlugins(appSurface),
    ...(shouldAnalyzeBundle
      ? [visualizer({
          filename: path.resolve(__dirname, 'dist/stats.html'),
          gzipSize: true,
          brotliSize: true,
          template: 'treemap'
        })]
      : [])
  ],
  define: {
    'import.meta.env.VITE_BUILD_STAMP': JSON.stringify(process.env.VITE_BUILD_STAMP || new Date().toISOString()),
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('store')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    // More specific aliases must come first.
    alias: sharedAliases
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom', 'sonner']
  },
  server: {
    host: true,
    port: 5175,
    allowedHosts,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: sentrySourcemapBuildValue(appSurface),
    // Older customer handsets can be as old as the iMin POS WebView (Chrome 80-84). See DGFY-POS-B.
    target: ['chrome80', 'edge88', 'firefox78', 'safari14'],
    // MapLibre is lazy-loaded; keep chunk warnings focused on initial app/vendor regressions.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split out self-contained leaf libraries. Forcing a
          // vendor/vendor-react split previously caused a cross-chunk
          // initialization cycle (vendor <-> vendor-react): the broad
          // `id.includes('react')` match pinned @sentry/react into
          // vendor-react while @sentry/browser/core fell into vendor,
          // splitting the Sentry family and producing a runtime TDZ
          // ("Cannot access 'B' before initialization"). Letting the
          // React/router/sonner/sentry graph fall to the default chunk
          // (as the POS app already does) keeps it acyclic by construction.
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return undefined;
        }
      }
    }
  },
  test: {
    // Playwright owns browser E2E specs (tests/e2e/**); Vitest must run only unit/component
    // tests. packages/web-core's own tests run from apps/dgfy-ims, not here -- see
    // docs/architecture/frontend-split-sync.md.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
  };
});
