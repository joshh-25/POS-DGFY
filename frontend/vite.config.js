import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiProxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000'
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
const devSecurityHeaders = {
  ...securityHeaders,
  // Vite React Refresh injects an inline preamble in development.
  // Keep preview/build CSP strict while allowing the local dev app to boot.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // More specific aliases must come first
      { find: '@/hooks', replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@/components', replacement: path.resolve(__dirname, './Components') },
      { find: '@/Pages', replacement: path.resolve(__dirname, './Pages') },
      { find: '@/Entities', replacement: path.resolve(__dirname, './Entities') },
      { find: '@/lib', replacement: path.resolve(__dirname, './src/lib') },
      { find: '@/services', replacement: path.resolve(__dirname, './src/services') },
      // General alias to src folder
      { find: '@', replacement: path.resolve(__dirname, './') },
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    allowedHosts: ['skupervisor.surebizcorp.com', 'skupervisor.dgfy.ph', '10.123.33.49', 'localhost'],
    headers: devSecurityHeaders,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
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
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ['skupervisor.surebizcorp.com', 'skupervisor.dgfy.ph', '10.123.33.49', 'localhost'],
    headers: securityHeaders,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
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
      },
    },
  },
  build: {
    // MapLibre is lazy-loaded by location-picker surfaces; keep warnings focused on initial app/vendor regressions.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('maplibre-gl')) return 'vendor-maplibre'
          if (id.includes('qrcode')) return 'vendor-qrcode'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('katex') || id.includes('unified') || id.includes('micromark')) return 'vendor-markdown'
          return 'vendor'
        },
      },
    },
  },
})
