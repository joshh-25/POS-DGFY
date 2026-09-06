/**
 * Client-side canvas image encoder for POS catalog image uploads (epic #265, Phase 296).
 *
 * `prepareImageVariants` is the only export call sites should import -- see
 * `posCatalogService.js`'s `uploadPosCatalogImage` for the intended usage. Import it via a
 * lazy `await import('.../utils/imageEncoding/index.js')` at the call site rather than a
 * static import from anywhere higher up the chain (e.g. TerminalPage.jsx); several route
 * chunks this module could otherwise land in have near-zero budget headroom left in
 * scripts/check-frontend-budgets.js's ROUTE_BUDGETS.
 *
 * Behind rolloutFlag.js's `image_client_conversion` stub -- inert (returns the original file,
 * `degraded: ['flag_off']`) until Phase 298 wires a real flag.
 */
import { detectCapabilities } from './capabilities.js';
import { encodeVariantsCore, VARIANT_LADDER } from './encodeVariants.js';
import { buildVariantManifest } from './variantManifest.js';
import { getImageClientConversionFlag } from './rolloutFlag.js';

const DEFAULT_DEADLINE_MS = 8000;

// This module encodes one file at a time (epic #265's "1 file at a time" concurrency
// requirement) -- a second concurrent call rejects rather than silently queuing or running
// two encodes (and two Workers) in parallel.
let activeEncode = null;

function createAbortError() {
  return typeof DOMException === 'function'
    ? new DOMException('The operation was aborted.', 'AbortError')
    : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

function buildResult({ file, variants, variantMeta, degraded }) {
  return {
    variants,
    manifest: buildVariantManifest({ sourceFile: file, variantMeta, degraded }),
    degraded,
  };
}

/**
 * Runs the encode pipeline inside a dedicated module Worker. Cancellation can't rely on
 * `AbortSignal` crossing `postMessage` -- instead, an abort just calls `worker.terminate()`
 * outright and ignores any message the worker sends afterward.
 */
function runInWorker(file, { targets, deadlineMs, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL('./encodeWorker.js', import.meta.url));

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      fn(value);
    };

    function onAbort() {
      finish(reject, createAbortError());
    }
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'progress') {
        onProgress?.(data.progress);
        return;
      }
      if (data.type === 'success') {
        finish(resolve, data.result);
        return;
      }
      if (data.type === 'error') {
        const error = new Error(data.message || 'encode failed in worker');
        error.name = data.name || 'Error';
        finish(reject, error);
      }
    };

    worker.onerror = (event) => {
      finish(reject, event?.error || new Error(event?.message || 'worker encode failed'));
    };

    worker.postMessage({ type: 'encode', file, targets, deadlineMs });
  });
}

function runOnMainThread(file, { targets, deadlineMs, onProgress, signal, capabilities }) {
  return encodeVariantsCore(file, {
    targets,
    deadlineMs,
    onProgress,
    capabilities,
    isAborted: () => Boolean(signal?.aborted),
  });
}

/**
 * Converts one uploaded catalog image into a resized/re-encoded variant ladder, entirely in
 * the browser.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: {key:string,index:number,total:number}) => void} [options.onProgress]
 * @param {Array<{key:string,maxWidth:number}>} [options.targets]
 * @param {number} [options.deadlineMs]
 * @returns {Promise<{variants: {large: File, medium?: File, thumbnail?: File}, manifest: object, degraded: string[]}>}
 */
export async function prepareImageVariants(file, options = {}) {
  const { signal, onProgress, targets = VARIANT_LADDER, deadlineMs = DEFAULT_DEADLINE_MS } = options;

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (getImageClientConversionFlag() === 'off') {
    return buildResult({ file, variants: { large: file }, variantMeta: {}, degraded: ['flag_off'] });
  }

  if (activeEncode) {
    throw new Error('prepareImageVariants: an encode is already in progress for this session');
  }

  activeEncode = true;
  try {
    const capabilities = await detectCapabilities();
    const canUseWorker = capabilities.worker && capabilities.offscreenCanvas;

    const { variants, variantMeta, degraded } = canUseWorker
      ? await runInWorker(file, { targets, deadlineMs, onProgress, signal })
      : await runOnMainThread(file, { targets, deadlineMs, onProgress, signal, capabilities });

    return buildResult({ file, variants, variantMeta, degraded });
  } finally {
    activeEncode = null;
  }
}

/** Test-only escape hatch -- production code never calls this. */
export function resetActiveEncodeForTests() {
  activeEncode = null;
}
