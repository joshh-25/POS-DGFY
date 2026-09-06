/**
 * Deliberately no jsdom environment pragma in this file -- it runs under Vitest's default
 * `node` environment, which (like `encodeWorker.js`'s real Worker global scope) has no
 * `document` global at all. This is what proves `probeCanvasToBlobType` takes its
 * `OffscreenCanvas` branch and reports the browser's true WebP support in that environment,
 * rather than the `document.createElement('canvas')` path silently throwing and reporting
 * `webp: false` regardless of actual support (the RF-2 bug this test guards against). Note:
 * don't spell out that pragma's literal directive text anywhere in this file, even in prose --
 * Vitest's pragma detector is a naive whole-file text scan, not context-aware, and would
 * activate jsdom for this file exactly the way the sibling `capabilities.test.js` opts into it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectCapabilities, resetCapabilitiesCacheForTests } from '../capabilities.js';

describe('imageEncoding capabilities (worker-shaped global: no document, OffscreenCanvas present)', () => {
  beforeEach(() => {
    resetCapabilitiesCacheForTests();
    expect(typeof document).toBe('undefined');
  });

  afterEach(() => {
    resetCapabilitiesCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports WebP supported via OffscreenCanvas.convertToBlob when the browser truly supports it', async () => {
    class FakeOffscreenCanvas {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }

      async convertToBlob({ type } = {}) {
        return new Blob(['bytes'], { type });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(true);
  });

  it('reports WebP unsupported when convertToBlob silently downgrades the blob type', async () => {
    class FakeOffscreenCanvas {
      async convertToBlob() {
        // Mirrors WebKit's real-world canvas.toBlob() downgrade behavior: resolves with a
        // real Blob, but its `.type` is silently downgraded away from what was requested.
        return new Blob(['bytes'], { type: 'image/png' });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(false);
  });

  it('reports WebP unsupported when OffscreenCanvas is unavailable', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(false);
  });

  it('reports WebP unsupported when convertToBlob throws', async () => {
    class FakeOffscreenCanvas {
      async convertToBlob() {
        throw new Error('encoder unavailable');
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(false);
  });
});
