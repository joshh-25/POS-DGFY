import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;
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
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('pos')
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      ...reactAliases,
      { find: '@/hooks', replacement: path.resolve(frontendRoot, 'src/hooks') },
      { find: '@/components', replacement: path.resolve(frontendRoot, 'Components') },
      { find: '@/Pages', replacement: path.resolve(frontendRoot, 'Pages') },
      { find: '@/Entities', replacement: path.resolve(frontendRoot, 'Entities') },
      { find: '@/lib', replacement: path.resolve(frontendRoot, 'src/lib') },
      { find: '@/services', replacement: path.resolve(frontendRoot, 'src/services') },
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
    outDir: path.resolve(__dirname, '../../../dist-apps/pos'),
    emptyOutDir: true,
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
