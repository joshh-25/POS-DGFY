import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildSentryVitePlugins, sentrySourcemapBuildValue } from '../../sentryViteConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
const appSurface = 'skupervisor';
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
  root: __dirname,
  cacheDir: path.resolve(frontendRoot, 'node_modules/.vite-skupervisor'),
  plugins: [react(), ...buildSentryVitePlugins(appSurface)],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('skupervisor')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      { find: '@/hooks', replacement: path.resolve(frontendRoot, 'src/hooks') },
      { find: '@/components', replacement: path.resolve(frontendRoot, 'Components') },
      { find: '@/Pages', replacement: path.resolve(frontendRoot, 'Pages') },
      { find: '@/lib', replacement: path.resolve(frontendRoot, 'src/lib') },
      { find: '@/services', replacement: path.resolve(frontendRoot, 'src/services') },
      { find: '@', replacement: frontendRoot }
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, '../../../dist-apps/skupervisor'),
    emptyOutDir: true,
    sourcemap: sentrySourcemapBuildValue(appSurface)
  }
});
