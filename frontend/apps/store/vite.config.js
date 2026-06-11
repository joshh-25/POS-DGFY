import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const configuredBasePath = process.env.VITE_STORE_BASE_PATH || '/';
const allowedHosts = true;
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
    outDir: path.resolve(__dirname, '../../../dist-apps/store'),
    emptyOutDir: true,
    // MapLibre is lazy-loaded; keep chunk warnings focused on initial app/vendor regressions.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('commonjsHelpers.js')) return 'vendor-react';
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('scheduler')) return 'vendor-react';
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  }
});
