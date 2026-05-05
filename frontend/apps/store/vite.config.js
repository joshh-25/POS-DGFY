import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const configuredBasePath = process.env.VITE_STORE_BASE_PATH || '/';
const allowedHosts = ['surebizcorp.com', 'store.surebizcorp.com', 'localhost', '127.0.0.1'];
const normalizedBasePath = (() => {
  const trimmed = String(configuredBasePath).trim() || '/';
  if (trimmed === '/') return '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
})();
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
    rewrite: (path) => path.replace(/^\/openfreemap/, ''),
    secure: false
  }
};

export default defineConfig({
  root: __dirname,
  base: normalizedBasePath,
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_STAMP': JSON.stringify(process.env.VITE_BUILD_STAMP || new Date().toISOString())
  },
  server: {
    port: 5173,
    allowedHosts,
    proxy: proxyTargets
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, '../../../dist-apps/store'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-map';
          if (id.includes('qrcode')) return 'vendor-qr';
          if (id.includes('sonner')) return 'vendor-feedback';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  }
});
