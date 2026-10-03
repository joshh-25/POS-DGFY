import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../packages/web-core/vite/sentryViteConfig.js';
import { buildWebCoreRuntimeDepAliases } from '../../packages/web-core/vite/webCoreRuntimeDeps.js';
import esCompatGuardPlugin from '../../packages/web-core/vite/esCompatGuardPlugin.js';
import { resolveAppVersion, resolveReleaseFloor, buildStampPlugin } from '../../packages/web-core/vite/buildStampPlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Shared trunk extracted to packages/web-core (issue #322); Platform Admin (issue #350)
// consumes the same modules through this app's aliases.
// See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(__dirname, '../../packages/web-core');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
const appSurface = 'admin';
const appNodeModules = path.resolve(__dirname, 'node_modules');
// ADR 0081 Decision 4 (#1548 Wave 3, Phase 278): APP_VERSION build-arg with a package.json
// fallback, stamped into VITE_APP_VERSION below and, via buildStampPlugin, into the built
// index.html's <meta name="dgfy-version"> and a generated version.json. See
// docs/deployment/PWA_SURFACE_CONTRACT.md.
// #1977 (Phase 342): the release floor (bare X.Y.Z) and candidate revision (rN) ride alongside
// as APP_RELEASE_FLOOR/APP_RELEASE_REVISION (VITE_-prefixed spellings in the builder stage),
// stamped into version.json/meta tags so runtime consumers never infer the floor from an alias.
const appVersion = resolveAppVersion(__dirname);
const releaseInfo = resolveReleaseFloor(__dirname);
// The Platform Admin shell now owns these modules; shared UI and utility modules
// continue to come from packages/web-core through the app boundary.
const sharedAliases = [
  { find: '@/Pages', replacement: path.resolve(__dirname, 'Pages') },
  { find: '@/features', replacement: path.resolve(__dirname, 'src/features') },
  { find: '@/services/hostingStatusService.js', replacement: path.resolve(webCoreRoot, 'src/services/hostingStatusService.js') },
  { find: '@/services', replacement: path.resolve(__dirname, 'src/services') },
  { find: '@/hooks', replacement: path.resolve(webCoreRoot, 'src/hooks') },
  { find: '@/components', replacement: path.resolve(webCoreRoot, 'Components') },
  { find: '@/lib', replacement: path.resolve(webCoreRoot, 'src/lib') },
  { find: '@/src', replacement: path.resolve(webCoreRoot, 'src') },
  { find: '@/utils.js', replacement: path.resolve(__dirname, 'src/utils.js') },
  // Bare packages web-core's own source imports -- it has no node_modules of its own,
  // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
  ...buildWebCoreRuntimeDepAliases(appNodeModules)
];
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
const devSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
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

export default defineConfig({
  // The edge routes /admin/* to this app. Build assets into the same prefix so
  // deep links and refreshes keep requesting chunks through the admin route.
  base: '/admin/',
  plugins: [react(), esCompatGuardPlugin(), buildStampPlugin(appVersion, releaseInfo), ...buildSentryVitePlugins(appSurface)],
  // `config.plugins` above only applies to workers in dev -- Vite 6 requires `worker.plugins`
  // separately for the production worker build, or the ADR 0067 Layer 2 guardrail silently
  // stops covering any module Worker's bundled output (epic #265, Phase 296).
  worker: {
    plugins: () => [esCompatGuardPlugin()],
  },
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('admin'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_APP_RELEASE_FLOOR': JSON.stringify(releaseInfo.floor),
    'import.meta.env.VITE_APP_RELEASE_REVISION': JSON.stringify(releaseInfo.revision ?? '')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    // More specific aliases must come first.
    alias: sharedAliases
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    // MapLibre resolves its worker relative to the package module. Keep it out of
    // Vite's dependency optimizer so the explicit worker asset URL remains served.
    exclude: ['maplibre-gl']
  },
  server: {
    host: true,
    port: 5177,
    allowedHosts,
    // Platform Admin imports the shared frontend trunk through relative paths. Keep that
    // source tree available in dev so a clean Vite restart serves the same
    // modules that the production build consumes.
    fs: {
      allow: [__dirname, webCoreRoot]
    },
    headers: devSecurityHeaders,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5177,
    allowedHosts,
    headers: securityHeaders,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: sentrySourcemapBuildValue(appSurface),
    // Same browser-support baseline as the other apps (ADR 0067).
    target: ['chrome80', 'edge88', 'firefox78', 'safari14'],
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
    testTimeout: 15000,
    // Bound fork fan-out on Windows only (#1015). The default pool size starts one worker
    // per available CPU and starved the integration-heavy files there, causing
    // false timeouts and cross-file state failures under a full run. The runner and every
    // Linux/macOS dev machine are unaffected -- default back to one worker per CPU on those
    // platforms rather than carrying the Windows-only cap everywhere.
    maxWorkers: process.platform === 'win32' ? 4 : undefined,
  },
});
