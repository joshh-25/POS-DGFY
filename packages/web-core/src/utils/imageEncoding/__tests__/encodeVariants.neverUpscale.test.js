/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeVariantsCore } from '../encodeVariants.js';
import { installMockCanvas, makeMockBitmap } from './canvasTestUtils.js';

describe('never-upscale guarantee', () => {
  beforeEach(() => {
    installMockCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never emits a variant wider than the source, even against a larger target width', async () => {
    const sourceWidth = 300;
    const sourceHeight = 200;
    const bitmap = makeMockBitmap(sourceWidth, sourceHeight);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const file = new File(['bytes'], 'small.jpg', { type: 'image/jpeg' });
    const result = await encodeVariantsCore(file, {
      capabilities: { imageOrientationOption: true },
      targets: [{ key: 'thumbnail', maxWidth: 400 }], // target wider than the 300px source
    });

    expect(result.variantMeta.thumbnail.width).toBe(sourceWidth);
    expect(result.variantMeta.thumbnail.width).not.toBeGreaterThan(sourceWidth);
    expect(result.degraded).not.toContain('large_variant_unavailable');
  });
});
