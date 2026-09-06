/**
 * Module Worker entry point for the client-side image encoder (epic #265, Phase 296).
 *
 * Left at Vite's default `worker.format` (`'iife'` -- none of the three apps override it), so
 * this file's own imports (encodeVariants.js, capabilities.js) get bundled into one
 * self-contained chunk with no runtime ESM-in-worker requirement. That chunk is only scanned
 * by the ADR 0067 Layer-2 guardrail (`esCompatGuardPlugin`) because each app's `vite.config.js`
 * now also sets `worker: { plugins: () => [esCompatGuardPlugin()] }` -- Vite's `plugins` array
 * only covers dev workers, not production worker builds (see that config's own comment). Do
 * not remove that block without an equivalent replacement; without it this file ships
 * completely unscanned for iMin POS WebView (Chrome 80-84) incompatible syntax.
 *
 * Thin wrapper only -- all real logic lives in encodeVariants.js, exercised by the same unit
 * tests whether it runs here or via index.js's main-thread fallback.
 */
import { encodeVariantsCore } from './encodeVariants.js';
import { detectCapabilities } from './capabilities.js';

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type !== 'encode') {
    return;
  }

  try {
    const capabilities = await detectCapabilities();
    const result = await encodeVariantsCore(data.file, {
      targets: data.targets,
      deadlineMs: data.deadlineMs,
      capabilities,
      // No AbortSignal here -- it can't cross postMessage. Cancellation from the main thread
      // is handled entirely by index.js calling worker.terminate() instead.
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'success', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message, name: error?.name });
  }
};
