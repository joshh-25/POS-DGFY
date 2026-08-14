const CACHE_PREFIX = 'sku-admin';
const SHELL_CACHE_NAME = `${CACHE_PREFIX}-shell-v1`;
const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}-runtime-v1`;
const MAX_RUNTIME_CACHE_ENTRIES = 120;
const STATIC_CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/', '/openfreemap', '/osm'];

const resolveBasePath = () => {
  const rawScope = self.registration?.scope || self.location?.origin || 'https://localhost/';
  const scopePath = new URL(rawScope).pathname || '/';
  return scopePath.endsWith('/') ? scopePath : `${scopePath}/`;
};

const BASE_PATH = resolveBasePath();
const SHELL_ASSETS = [BASE_PATH, `${BASE_PATH}manifest.webmanifest`, `${BASE_PATH}logo-icon.png`];

const isBypassPath = (pathname = '/') => (
  BYPASS_PATH_PREFIXES.some((prefix) => (
    pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
  ))
);

// A deploy deletes the previous build's hashed chunks. If any layer between
// the browser and the build output answers a missing chunk with the SPA
// shell instead of a 404, the response is a 200 text/html document. Caching
// that as the script makes the failure survive every subsequent reload, so
// the content type is verified before a script response is ever stored or
// replayed.
const SCRIPT_CONTENT_TYPE_PATTERN = /(?:java|ecma)script|text\/jsx?/i;

const isScriptLikeResponse = (response) => (
  SCRIPT_CONTENT_TYPE_PATTERN.test(String(response?.headers?.get('Content-Type') || ''))
);

const isUsableCachedResponse = (response, request) => (
  request?.destination !== 'script' || isScriptLikeResponse(response)
);

const isCacheableResponse = (response, request) => {
  if (!response || !response.ok) return false;
  const cacheControl = String(response.headers?.get('Cache-Control') || '').toLowerCase();
  if (cacheControl.includes('no-store')) return false;
  if (request?.destination === 'script' && !isScriptLikeResponse(response)) return false;
  return true;
};

const pruneRuntimeCache = async () => {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_CACHE_ENTRIES) return;
  const keysToDelete = keys.slice(0, keys.length - MAX_RUNTIME_CACHE_ENTRIES);
  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
};

const shouldHandleRuntimeRequest = (request, url) => {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
  if (url.origin !== self.location.origin) return false;
  if (isBypassPath(url.pathname)) return false;
  return STATIC_CACHEABLE_DESTINATIONS.has(request.destination || '');
};

const staleWhileRevalidateRuntime = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  let cached = await cache.match(request);
  if (cached && !isUsableCachedResponse(cached, request)) {
    await cache.delete(request);
    cached = null;
  }

  const networkPromise = fetch(request).then(async (response) => {
    if (isCacheableResponse(response, request)) {
      await cache.put(request, response.clone());
      await pruneRuntimeCache();
    }
    return response;
  }).catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return new Response(null, { status: 503, statusText: 'Offline' });
};

const networkFirstNavigation = async (request) => {
  try {
    return await fetch(request);
  } catch {
    const cachedRequest = await caches.match(request);
    if (cachedRequest) return cachedRequest;
    const shell = await caches.match(BASE_PATH);
    if (shell) return shell;
    throw new Error('offline');
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(`${CACHE_PREFIX}-`))
        .filter((key) => key !== SHELL_CACHE_NAME && key !== RUNTIME_CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;

  event.respondWith(staleWhileRevalidateRuntime(event.request));
});
