import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildWebCoreRuntimeDepAliases } from '../../packages/web-core/vite/webCoreRuntimeDeps.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Shared trunk extracted to packages/web-core (issue #322). Alias keys are unchanged from
// before the split -- only their targets moved -- so existing @/... imports need no rewrite.
// See docs/architecture/frontend-split-sync.md.
const webCoreRoot = path.resolve(__dirname, '../../packages/web-core')
// resolve.dedupe resolves bare 'react'/'react-dom' fine even from web-core's node_modules-less
// files (Vite's JSX-runtime auto-injection pre-bundles them regardless of importer location),
// but NOT react-router-dom/react-router under Vitest's SSR module runner -- confirmed by every
// packages/web-core test importing it failing with "Failed to resolve import 'react-router-dom'"
// until aliased explicitly here. This app's own vitest suite (the only one left running
// through Vitest's SSR module runner in the monolith) is why this stays; the split-out apps
// don't need it since they only ever run `vite build`/`vite dev` against these packages.
const routerAliases = [
  { find: /^react-router$/, replacement: path.resolve(__dirname, 'node_modules/react-router') },
  { find: /^react-router-dom$/, replacement: path.resolve(__dirname, 'node_modules/react-router-dom') },
]
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
      ...routerAliases,
      { find: '@/hooks', replacement: path.resolve(webCoreRoot, './src/hooks') },
      { find: '@/components', replacement: path.resolve(webCoreRoot, './Components') },
      { find: '@/Pages', replacement: path.resolve(__dirname, './Pages') },
      { find: '@/lib', replacement: path.resolve(webCoreRoot, './src/lib') },
      { find: '@/services', replacement: path.resolve(webCoreRoot, './src/services') },
      { find: '@/src', replacement: path.resolve(webCoreRoot, './src') },
      // Bare packages web-core's own source imports -- it has no node_modules of its own,
      // so these must resolve against this app's instead. See webCoreRuntimeDeps.js.
      ...buildWebCoreRuntimeDepAliases(path.resolve(__dirname, 'node_modules')),
      // General alias to the local app root (main.jsx, Layout.jsx, utils.js, remaining Pages/)
      { find: '@', replacement: path.resolve(__dirname, './') },
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    // Vitest's per-file `@vitest-environment` pragma re-fetches the test file through
    // the dev server, which enforces fs.allow -- without this, every packages/web-core
    // test using the pragma fails with "Cannot find module" since that package lives
    // outside this app's root. See docs/architecture/frontend-split-sync.md.
    fs: { allow: [path.resolve(__dirname, '../../')] },
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
    // iMin POS WebView is Chrome 80-84 (no String.replaceAll, ES2021). See DGFY-POS-B.
    target: ['chrome80', 'edge88', 'firefox78', 'safari14'],
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
  test: {
    // Playwright owns browser E2E specs; Vitest must run only unit and component tests.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    // packages/web-core's tests run from here rather than getting their own vitest setup
    // (that package deliberately has no node_modules of its own -- see its README).
    include: [...configDefaults.include, '../../packages/web-core/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
