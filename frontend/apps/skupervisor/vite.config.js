import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../..');
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = ['skupervisor.surebizcorp.com', 'skupervisor.dgfy.ph', 'staging.dgfy.ph', 'localhost', '127.0.0.1'];

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
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
    port: 5173,
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
      }
    }
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts
  },
  build: {
    outDir: path.resolve(__dirname, '../../../dist-apps/skupervisor'),
    emptyOutDir: true
  }
});
