import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../../../packages/web-core/vite/sentryViteConfig.js';
import { buildWebCoreRuntimeDepAliases } from '../../../../packages/web-core/vite/webCoreRuntimeDeps.js';
import { posOfflinePrecachePlugin } from './vitePosOfflinePrecachePlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
// Shared trunk extracted to packages/web-core (issue #322). Alias keys are unchanged from
// before the split -- only their targets moved. See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(frontendRoot, '../../packages/web-core');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
const appSurface = 'pos';
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
const frontendNodeModules = path.resolve(frontendRoot, 'node_modules');
const reactAliases = [
  { find: /^react$/, replacement: path.resolve(frontendNodeModules, 'react') },
  { find: /^react\/jsx-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-runtime.js') },
  { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-dev-runtime.js') },
  { find: /^react-dom$/, replacement: path.resolve(frontendNodeModules, 'react-dom') },
  { find: /^react-dom\/client$/, replacement: path.resolve(frontendNodeModules, 'react-dom/client.js') },
  { find: /^react-router$/, replacement: path.resolve(frontendNodeModules, 'react-router') },
  { find: /^react-router-dom$/, replacement: path.resolve(frontendNodeModules, 'react-router-dom') }
];

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(frontendRoot, 'node_modules/.vite-pos'),
  base: './',
  plugins: [react(), posOfflinePrecachePlugin(), ...buildSentryVitePlugins(appSurface)],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('pos')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      ...reactAliases,
      { find: '@/hooks', replacement: path.resolve(webCoreRoot, 'src/hooks') },
      { find: '@/components', replacement: path.resolve(webCoreRoot, 'Components') },
      { find: '@/Pages', replacement: path.resolve(frontendRoot, 'Pages') },
      { find: '@/lib', replacement: path.resolve(webCoreRoot, 'src/lib') },
      { find: '@/services', replacement: path.resolve(webCoreRoot, 'src/services') },
      { find: '@/src', replacement: path.resolve(webCoreRoot, 'src') },
      // Bare packages web-core's own source imports -- it has no node_modules of its own,
      // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
      ...buildWebCoreRuntimeDepAliases(frontendNodeModules),
      { find: '@', replacement: frontendRoot }
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
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
    outDir: path.resolve(__dirname, '../../../../dist-apps/pos'),
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
  }
});
