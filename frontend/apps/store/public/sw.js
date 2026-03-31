const CACHE_NAME = 'sku-store-shell-v3';
const resolveBasePath = () => {
  const rawScope = self.registration?.scope || 'https://localhost/';
  const path = new URL(rawScope).pathname || '/';
  return path.endsWith('/') ? path : `${path}/`;
};
const BASE_PATH = resolveBasePath();
const SHELL_ASSETS = [BASE_PATH, `${BASE_PATH}manifest.json`, `${BASE_PATH}favicon.svg`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match(BASE_PATH);
        if (shell) return shell;
      }
      throw new Error('offline');
    })
  );
});
