import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = true;

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(frontendRoot, 'node_modules/.vite/pos'),
  base: './',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_SURFACE': JSON.stringify('pos')
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
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
  server: {
    host: true,
    port: 5174,
    allowedHosts,
    proxy: {
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
        rewrite: (path) => path.replace(/^\/openfreemap/, '')
      },
      '/osm': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/osm/, '')
      }
    }
  },
  preview: {
    host: true,
    port: 5174,
    allowedHosts
  },
  build: {
    outDir: path.resolve(__dirname, '../../../dist-apps/pos'),
    emptyOutDir: true
  }
});
