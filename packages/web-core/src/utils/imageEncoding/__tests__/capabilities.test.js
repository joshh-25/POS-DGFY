/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectCapabilities, resetCapabilitiesCacheForTests } from '../capabilities.js';

describe('imageEncoding capabilities', () => {
  beforeEach(() => {
    resetCapabilitiesCacheForTests();
  });

  afterEach(() => {
    resetCapabilitiesCacheForTests();
    vi.restoreAllMocks();
  });

  it('reports WebP unsupported when toBlob silently downgrades the blob type (WebKit)', async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, requestedType) {
      // WebKit's real-world behavior: resolves with a real Blob, but its `.type` is silently
      // downgraded to image/png even though image/webp was requested.
      expect(requestedType).toBe('image/webp');
      callback(new Blob(['bytes'], { type: 'image/png' }));
    };

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(false);
  });

  it('reports WebP unsupported when toBlob resolves with a null blob', async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(null);
    };

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(false);
  });

  it('reports WebP supported only when the returned blob type actually matches', async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, requestedType) {
      callback(new Blob(['bytes'], { type: requestedType }));
    };

    const capabilities = await detectCapabilities();

    expect(capabilities.webp).toBe(true);
  });

  it('memoizes the result across calls instead of re-probing', async () => {
    const toBlobSpy = vi.fn(function toBlob(callback, requestedType) {
      callback(new Blob(['bytes'], { type: requestedType }));
    });
    HTMLCanvasElement.prototype.toBlob = toBlobSpy;

    await detectCapabilities();
    await detectCapabilities();

    expect(toBlobSpy).toHaveBeenCalledTimes(1);
  });
});
