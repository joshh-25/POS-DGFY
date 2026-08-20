import React from 'react';

// Recovery for a dynamic-import ("chunk load") failure -- the failure mode
// where a browser tab stays open across a deploy, the old build's hashed
// chunks are gone, and a `React.lazy`/`import()` for one of them rejects.
// See DGFY-POS-1 ("Importing a module script failed.") -- Safari's wording
// for exactly this.
//
// Deliberately outside frontend/src/features/pos/ so this module and its
// own tests stay out of the compliance-gated POS tree; it's imported BY
// POS code, not part of it.

const CHUNK_ERROR_MESSAGE_PATTERN = new RegExp(
  [
    'failed to fetch dynamically imported module', // Chrome/Edge
    'error loading dynamically imported module', // Firefox
    'importing a module script failed', // Safari -- the DGFY-POS-1 title
    'unable to preload css', // Vite's __vitePreload
    'dynamically imported module', // catch-all for the families above
    'disallowed mime type', // Firefox, HTML served as a module
    'is not a valid javascript mime type', // Chrome
    'expected a javascript(?:-or-wasm)? module script', // Chrome
    // HTML parsed as JS (nginx serving index.html for a missing chunk).
    // Kept last and deliberately loose: this can also match a JSON.parse
    // of an HTML error page, but this predicate only ever gates a one-shot
    // reload of the SPA shell, so a false positive costs one reload, not a
    // masked bug.
    "unexpected token '<'",
    // #632 backstop: nginx's `try_files ... /index.html` can resolve a
    // deleted chunk's dynamic import instead of rejecting it. React.lazy
    // stores the resolved value in its own `_result` slot and later reads
    // `_result.default` while rendering -- past `importWithChunkRetry`'s
    // own try/catch, since nothing rejected. `importWithChunkRetry` now
    // validates the resolved module itself (below), so this should no
    // longer originate from a `lazyWithChunkRetry` call site, but this
    // stays as a backstop so the ErrorBoundary still recognizes the raw
    // browser TypeError if it reaches it by any other path.
    '_result\\.default', // Safari/JSC: "undefined is not an object (evaluating 'e._result.default')"
    "reading 'default'" // Chrome/V8: "Cannot read properties of undefined (reading 'default')"
  ].join('|'),
  'i'
);

export const isChunkLoadError = (error) => {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true; // webpack-era; harmless to keep
  return CHUNK_ERROR_MESSAGE_PATTERN.test(String(error.message || ''));
};

export const CHUNK_RELOAD_MARKER_KEY = 'dgfy:chunk-reload-attempt';
// A broken deploy would otherwise reload once per chunk-load failure --
// tight-looping if the tab keeps navigating. A cooldown instead of a
// one-time-forever flag means a genuinely new deploy hours later still
// gets its own reload, while a still-broken deploy gets at most one
// reload per window instead of a loop.
export const CHUNK_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

// Returns true if a reload was actually triggered, false if the cooldown
// is still active (or there's no reloadable environment -- SSR/tests).
export const reloadOnceForChunkFailure = ({
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null),
  location = (typeof window !== 'undefined' ? window.location : null),
  now = Date.now
} = {}) => {
  if (!location?.reload) return false;
  try {
    const last = Number(storage?.getItem(CHUNK_RELOAD_MARKER_KEY) || 0);
    if (last && now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    storage?.setItem(CHUNK_RELOAD_MARKER_KEY, String(now()));
  } catch {
    // Private-mode / storage disabled -- fall through and reload once
    // anyway rather than getting stuck on a broken build with no recovery.
  }
  location.reload();
  return true;
};

// An explicit human click on the ErrorBoundary's manual reload button
// should always get a fresh one-shot budget, independent of the automatic
// cooldown above.
export const clearChunkReloadMarker = ({
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null)
} = {}) => {
  try {
    storage?.removeItem(CHUNK_RELOAD_MARKER_KEY);
  } catch {
    // ignore
  }
};

// Purges every app-owned cache and unregisters the service worker. Only
// called from the manual "Reload Page" path (never the automatic one) --
// this kills offline mode until the next successful load, an acceptable
// price after an explicit human click, not something to do silently in
// the background.
export const clearAppRuntimeCaches = async () => {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore -- best-effort cleanup, must not block the reload
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // ignore
  }
};

// #632: nginx's `try_files $uri $uri/ /index.html` can resolve a deleted
// chunk's dynamic import to the SPA shell instead of rejecting it -- some
// clients get back `undefined` (or an empty object) rather than a thrown
// error. React.lazy would store that as a resolved module and crash later,
// deep in the reconciler (`_result.default`), past both this function's
// own retry loop and the ErrorBoundary's chunk-error routing. A module is
// "usable" if it has a non-null `default` (the shape React.lazy actually
// reads) or is otherwise non-empty -- a named-exports-only module is still
// a real module, just not one React.lazy can render directly.
const isUsableModule = (module) => {
  if (module == null) return false;
  if (typeof module !== 'object' && typeof module !== 'function') return false;
  if (module.default != null) return true;
  return Object.keys(module).length > 0;
};

// loadModule is a THUNK (`() => import('./X.jsx')`), not a promise -- a
// browser evicts a failed module from its module map, so calling the same
// arrow again genuinely re-fetches rather than replaying the same
// rejection. No cache-busting query param: that would change the module
// specifier, risking a second copy of an already-loaded shared dependency
// (duplicate React contexts); the chunk is deleted, not stale-cached, so
// only loading the current index.html recovers it.
export const importWithChunkRetry = async (loadModule, { attempts = 2, delayMs = 250 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const module = await loadModule();
      if (!isUsableModule(module)) {
        // Nothing rejected -- the import "succeeded" with an unusable
        // value. Treat it exactly like a chunk-load rejection so it flows
        // through the same retry/reload path instead of surfacing later as
        // an unrecognizable TypeError.
        const unusableModuleError = new Error(
          'Chunk load resolved to an unusable module (dynamically imported module)'
        );
        unusableModuleError.name = 'ChunkLoadError';
        throw unusableModuleError;
      }
      return module;
    } catch (error) {
      lastError = error;
      if (!isChunkLoadError(error)) throw error; // a real eval error must not be retried
      if (attempt < attempts) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  reloadOnceForChunkFailure();
  throw lastError;
};

export const lazyWithChunkRetry = (loadModule, options) => (
  React.lazy(() => importWithChunkRetry(loadModule, options))
);
