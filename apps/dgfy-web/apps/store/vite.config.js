import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../sentryViteConfig.js';
import esCompatGuardPlugin from '../../build/esCompatGuardPlugin.js';
// Opt-in only (VITE_ANALYZE_BUNDLE=true) -- writes a stats.html treemap next
// to the build output. Never runs in a normal `build:store` so it can't
// perturb production build size/timing. See issue #282's Phase A baseline:
// https://github.com/Sieitzz/dgfy-platform/issues/282#issuecomment-5242741151
const shouldAnalyzeBundle = String(process.env.VITE_ANALYZE_BUNDLE || '').trim() === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const configuredBasePath = process.env.VITE_STORE_BASE_PATH || '/';
const allowedHosts = true;
const appSurface = 'store';
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
const devSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
};
const frontendNodeModules = path.resolve(frontendRoot, 'node_modules');
// Mirrors the `@/components` entry in frontend/vite.config.js. The DGFY auth and
// business pages ported into this app import the shared shadcn primitives
// (`@/components/ui/input`, `button`, `label`) that live in frontend/Components.
const sharedAliases = [
  { find: '@/components', replacement: path.resolve(frontendRoot, 'Components') }
];
const reactAliases = [
  { find: /^react$/, replacement: path.resolve(frontendNodeModules, 'react') },
  { find: /^react\/jsx-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-runtime.js') },
  { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-dev-runtime.js') },
  { find: /^react-dom$/, replacement: path.resolve(frontendNodeModules, 'react-dom') },
  { find: /^react-dom\/client$/, replacement: path.resolve(frontendNodeModules, 'react-dom/client.js') },
  { find: /^react-router$/, replacement: path.resolve(frontendNodeModules, 'react-router') },
  { find: /^react-router-dom$/, replacement: path.resolve(frontendNodeModules, 'react-router-dom') }
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
  root: __dirname,
  cacheDir: path.resolve(frontendRoot, 'node_modules/.vite-store'),
  base: normalizedBasePath,
  plugins: [
    react(),
    esCompatGuardPlugin(),
    ...buildSentryVitePlugins(appSurface),
    ...(shouldAnalyzeBundle
      ? [visualizer({
          filename: path.resolve(__dirname, '../../../../dist-apps/store/stats.html'),
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
    alias: [...sharedAliases, ...reactAliases]
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom', 'sonner']
  },
  server: {
    host: true,
    port: 5175,
    allowedHosts,
    headers: devSecurityHeaders,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts,
    headers: securityHeaders,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, '../../../../dist-apps/store'),
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
  }
  };
});
