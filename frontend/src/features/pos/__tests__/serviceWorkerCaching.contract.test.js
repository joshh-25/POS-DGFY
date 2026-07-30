import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  createPosOfflineBuildRevision,
  POS_OFFLINE_BUILD_REVISION_TOKEN
} from '../../../../apps/pos/vitePosOfflinePrecachePlugin.js';

const frontendRoot = process.cwd();
const posServiceWorkerPath = path.resolve(frontendRoot, 'apps/pos/public/sw.js');
const skupervisorServiceWorkerPath = path.resolve(frontendRoot, 'apps/skupervisor/public/sw.js');
const storeServiceWorkerPath = path.resolve(frontendRoot, 'apps/store/public/sw.js');
const posMainPath = path.resolve(frontendRoot, 'apps/pos/src/main.jsx');
const posPrecachePluginPath = path.resolve(frontendRoot, 'apps/pos/vitePosOfflinePrecachePlugin.js');
const posViteConfigPath = path.resolve(frontendRoot, 'apps/pos/vite.config.js');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('service worker caching contracts', () => {
  it('keeps POS service worker runtime caching bounded and API-safe', () => {
    const source = readSource(posServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/'];");
    expect(source).toContain(`const CACHE_VERSION = '${POS_OFFLINE_BUILD_REVISION_TOKEN}';`);
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
    expect(source).toContain("const PRECACHE_MANIFEST_URL = `${BASE_PATH}precache-manifest.json`;");
    expect(source).toContain("await shellCache.addAll([...REQUIRED_SHELL_ASSETS, PRECACHE_MANIFEST_URL, ...assetUrls]);");
    expect(source).toContain('const precached = await shellCache.match(request, { ignoreVary: true });');
  });

  it('emits a deterministic POS build manifest for critical JavaScript, CSS, fonts, and the web manifest', () => {
    const pluginSource = readSource(posPrecachePluginPath);
    const viteSource = readSource(posViteConfigPath);
    expect(pluginSource).toContain("const PRECACHE_FILE_NAME = 'precache-manifest.json';");
    expect(pluginSource).toContain("const CRITICAL_ASSET_PATTERN = /\\.(?:css|js|webmanifest|woff2?)$/i;");
    expect(pluginSource).toContain('assets: collectPosOfflinePrecacheAssets(bundle)');
    expect(viteSource).toContain('plugins: [react(), posOfflinePrecachePlugin(),');
    expect(viteSource).toContain('...buildSentryVitePlugins(appSurface)');
  });

  it('creates a distinct POS worker revision for each production build', () => {
    const bundle = {
      app: { fileName: 'assets/index-abc.js', code: 'console.log("app")' }
    };
    expect(createPosOfflineBuildRevision(bundle, 1)).toMatch(/^v[a-f0-9]{16}$/);
    expect(createPosOfflineBuildRevision(bundle, 1)).toBe(createPosOfflineBuildRevision(bundle, 1));
    expect(createPosOfflineBuildRevision(bundle, 2)).not.toBe(createPosOfflineBuildRevision(bundle, 1));
  });

  it('keeps SKUpervisor service worker from caching map proxy resources', () => {
    const source = readSource(skupervisorServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/', '/openfreemap'];");
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
  });

  it('keeps Storefront service worker runtime caching bounded and API-safe', () => {
    const source = readSource(storeServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/', '/openfreemap'];");
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
  });

  it('registers POS service worker with BASE_URL-aware script URL and scope', () => {
    const source = readSource(posMainPath);
    expect(source).toContain('const appBasePath = String(import.meta.env.BASE_URL || \'/\')');
    expect(source).toContain('const serviceWorkerUrl = appBasePath === \'/\' ? \'/sw.js\' : `${appBasePath}/sw.js`;');
    expect(source).toContain('scope: appBasePath === \'/\' ? \'/\' : `${appBasePath}/`');
  });

  it('removes stale root-scoped workers before mounting the local POS app', () => {
    const source = readSource(posMainPath);
    expect(source).toContain('const resetStaleDevelopmentServiceWorkers = async () => {');
    expect(source).toContain('await navigator.serviceWorker.getRegistrations()');
    expect(source).toContain('registration.unregister()');
    expect(source).toContain("cacheName.startsWith('sku-admin-') || cacheName.startsWith('sku-pos-')");
    expect(source).toContain('if (await resetStaleDevelopmentServiceWorkers()) return;');
  });
});
