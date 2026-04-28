import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const frontendRoot = process.cwd();
const posServiceWorkerPath = path.resolve(frontendRoot, 'apps/pos/public/sw.js');
const storeServiceWorkerPath = path.resolve(frontendRoot, 'apps/store/public/sw.js');
const posMainPath = path.resolve(frontendRoot, 'apps/pos/src/main.jsx');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('service worker caching contracts', () => {
  it('keeps POS service worker runtime caching bounded and API-safe', () => {
    const source = readSource(posServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/'];");
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
  });

  it('keeps Storefront service worker runtime caching bounded and API-safe', () => {
    const source = readSource(storeServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/'];");
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
});
