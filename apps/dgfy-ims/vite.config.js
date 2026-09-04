import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../packages/web-core/vite/sentryViteConfig.js';
import { buildWebCoreRuntimeDepAliases } from '../../packages/web-core/vite/webCoreRuntimeDeps.js';
import esCompatGuardPlugin from '../../packages/web-core/vite/esCompatGuardPlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Shared trunk extracted to packages/web-core (issue #322). Alias keys are unchanged from
// before the split -- only their targets moved. See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(__dirname, '../../packages/web-core');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
const appSurface = 'skupervisor';
const appNodeModules = path.resolve(__dirname, 'node_modules');

// Vitest's SSR module runner needs react-router/react-router-dom pinned explicitly here --
// resolve.dedupe alone isn't enough for them (unlike bare react/react-dom, which Vite's
// JSX-runtime pre-bundling handles regardless of importer location). This app is the only
// one left running Vitest directly (packages/web-core's own suite runs from here too, via
// the test.include glob below) -- the split-out pos/storefront apps that only ever
// `vite build`/`vite dev` against these packages don't need this.
const routerAliases = [
  { find: /^react-router$/, replacement: path.resolve(appNodeModules, 'react-router') },
  { find: /^react-router-dom$/, replacement: path.resolve(appNodeModules, 'react-router-dom') },
];

// Both blocks below existed identically in the pre-split root apps/dgfy-web/vite.config.js
// but were missing from apps/skupervisor/vite.config.js's server/preview blocks -- carried
// forward here rather than silently dropped during the merge.
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
const devSecurityHeaders = {
  ...securityHeaders,
  // Vite React Refresh injects an inline preamble in development.
  // Keep preview/build CSP strict while allowing the local dev app to boot.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
};

const proxyTargets = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
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
    rewrite: (proxyPath) => proxyPath.replace(/^\/openfreemap/, ''),
    secure: false
  },
  '/osm': {
    target: 'https://tile.openstreetmap.org',
    changeOrigin: true,
    rewrite: (proxyPath) => proxyPath.replace(/^\/osm/, '')
  },
  // Same-origin PostHog (EU cloud) dev proxy, mirroring
  // infrastructure/docker/nginx/nginx.conf.template's /ingest/ blocks so local
  // dev exercises the same path analyticsClient.js defaults to. More specific
  // prefixes first -- Vite matches proxy keys in insertion order.
  '/ingest/static': {
    target: 'https://eu-assets.i.posthog.com',
    changeOrigin: true,
    rewrite: (proxyPath) => proxyPath.replace(/^\/ingest\/static/, '/static')
  },
  '/ingest/array': {
    target: 'https://eu-assets.i.posthog.com',
    changeOrigin: true,
    rewrite: (proxyPath) => proxyPath.replace(/^\/ingest\/array/, '/array')
  },
  '/ingest': {
    target: 'https://eu.i.posthog.com',
    changeOrigin: true,
    rewrite: (proxyPath) => proxyPath.replace(/^\/ingest/, '')
  }
};

export default defineConfig({
  plugins: [react(), esCompatGuardPlugin(), ...buildSentryVitePlugins(appSurface)],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('skupervisor')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      // More specific aliases must come first.
      ...routerAliases,
      { find: '@/hooks', replacement: path.resolve(webCoreRoot, 'src/hooks') },
      { find: '@/components', replacement: path.resolve(webCoreRoot, 'Components') },
      { find: '@/Pages', replacement: path.resolve(__dirname, 'Pages') },
      { find: '@/lib', replacement: path.resolve(webCoreRoot, 'src/lib') },
      { find: '@/services', replacement: path.resolve(webCoreRoot, 'src/services') },
      { find: '@/src', replacement: path.resolve(webCoreRoot, 'src') },
      // Bare packages web-core's own source imports -- it has no node_modules of its own,
      // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
      ...buildWebCoreRuntimeDepAliases(appNodeModules),
      // General alias to the local app root (main.jsx, Layout.jsx, utils.js, Pages/).
      { find: '@', replacement: __dirname },
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom']
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts,
    headers: devSecurityHeaders,
    // Vitest's per-file @vitest-environment pragma re-fetches the test file through the dev
    // server, which enforces fs.allow -- without this, every packages/web-core test using
    // that pragma fails with "Cannot find module" since that package lives outside this
    // app's root. See docs/architecture/frontend-split-sync.md.
    fs: { allow: [path.resolve(__dirname, '../../')] },
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts,
    headers: securityHeaders,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: sentrySourcemapBuildValue(appSurface),
    // Reachable from the iMin POS WebView (Chrome 80-84) via the Sales handoff. See DGFY-POS-B.
    target: ['chrome80', 'edge88', 'firefox78', 'safari14'],
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          if (id.includes('lucide-react')) return 'vendor-icons';
          // AiChat.jsx (Pages/AiChat.jsx) is the only consumer of this family, via
          // packages/web-core's MarkdownRenderer.jsx.
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('katex') || id.includes('unified') || id.includes('micromark')) return 'vendor-markdown';
          return undefined;
        }
      }
    }
  },
  test: {
    // Playwright owns browser E2E specs (tests/e2e/**); Vitest must run only unit/component
    // tests. packages/web-core's own tests run from here rather than getting their own
    // vitest setup (that package deliberately has no node_modules of its own -- see its
    // README).
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    include: [...configDefaults.include, '../../packages/web-core/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // The integration-heavy jsdom suite exercises lazy routes and mocked API
    // boundaries in parallel. Five seconds is below the normal cold-start
    // budget on CI/local Windows workers and turns healthy tests into flakes.
    testTimeout: 15000,
    // Bound fork fan-out on Windows only (#1015). The default pool size starts one worker
    // per available CPU and starved the integration-heavy Storefront/POS files there, causing
    // false timeouts and cross-file state failures under a full run. The runner and every
    // Linux/macOS dev machine are unaffected -- default back to one worker per CPU on those
    // platforms rather than carrying the Windows-only cap everywhere.
    maxWorkers: process.platform === 'win32' ? 4 : undefined,
  },
});
