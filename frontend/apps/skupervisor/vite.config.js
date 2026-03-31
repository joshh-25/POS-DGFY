import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
const allowedHosts = ['skupervisor.surebizcorp.com', 'localhost', '127.0.0.1'];

export default defineConfig({
  root: __dirname,
  plugins: [react()],
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
