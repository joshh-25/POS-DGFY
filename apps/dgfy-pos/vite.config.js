import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../packages/web-core/vite/sentryViteConfig.js';
import { buildWebCoreRuntimeDepAliases } from '../../packages/web-core/vite/webCoreRuntimeDeps.js';
import { posOfflinePrecachePlugin } from './vitePosOfflinePrecachePlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Shared trunk extracted to packages/web-core (issue #322). Alias key is unchanged from
// before the split -- only its target moved. See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(__dirname, '../../packages/web-core');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
const appSurface = 'pos';
const appNodeModules = path.resolve(__dirname, 'node_modules');
// This app's own src/main.jsx only imports `@/components/ui/sonner` directly, but it also
// pulls in TerminalPage.jsx and WorkflowModeContext.jsx from packages/web-core, and THEIR
// own internal code still uses the pre-extraction `@/...` self-referential alias convention
// (see docs/architecture/frontend-split-sync.md) -- so the full set web-core's source relies
// on must be aliased here, not just what main.jsx itself references.
const sharedAliases = [
  { find: '@/hooks', replacement: path.resolve(webCoreRoot, 'src/hooks') },
  { find: '@/components', replacement: path.resolve(webCoreRoot, 'Components') },
  { find: '@/lib', replacement: path.resolve(webCoreRoot, 'src/lib') },
  { find: '@/services', replacement: path.resolve(webCoreRoot, 'src/services') },
  { find: '@/src', replacement: path.resolve(webCoreRoot, 'src') },
  // Bare packages web-core's own source imports -- it has no node_modules of its own,
  // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
  ...buildWebCoreRuntimeDepAliases(appNodeModules)
];
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
  base: './',
  plugins: [react(), posOfflinePrecachePlugin(), ...buildSentryVitePlugins(appSurface)],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('pos')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    // More specific aliases must come first.
    alias: sharedAliases
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom']
  },
  server: {
    host: true,
    port: 5174,
    allowedHosts,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5174,
    allowedHosts,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: sentrySourcemapBuildValue(appSurface),
    // iMin POS WebView is Chrome 80-84 (no String.replaceAll, ES2021). See DGFY-POS-B.
    target: ['chrome80', 'edge88', 'firefox78', 'safari14'],
    // Keep optional map rendering separate from the terminal's primary startup path.
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
  },
});
