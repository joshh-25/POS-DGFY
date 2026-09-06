/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeVariantsCore } from '../encodeVariants.js';
import { installMockCanvas, makeMockBitmap } from './canvasTestUtils.js';

describe('canvas max-dimension degrade path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resizes via createImageBitmap(resizeWidth/resizeHeight) before any drawImage, for an oversized source', async () => {
    installMockCanvas();
    // 6000x6000 = 36M px, comfortably over the 16.7M px cap.
    const oversizedBitmap = makeMockBitmap(6000, 6000);
    const resizedBitmap = makeMockBitmap(2828, 2828); // ~8M px, the safety pre-pass target

    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValueOnce(oversizedBitmap) // obtainOrientedBitmap's imageOrientation decode
      .mockResolvedValueOnce(resizedBitmap); // capToSafePixelArea's resize pre-pass
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const file = new File(['bytes'], 'huge.jpg', { type: 'image/jpeg' });
    const result = await encodeVariantsCore(file, {
      capabilities: { imageOrientationOption: true },
      targets: [{ key: 'large', maxWidth: 1920 }],
    });

    // The resize call happened, using resizeWidth/resizeHeight/resizeQuality -- and BEFORE any
    // drawImage on the canvas that produces the actual encoded variant.
    expect(createImageBitmapMock).toHaveBeenNthCalledWith(2, oversizedBitmap, {
      resizeWidth: expect.any(Number),
      resizeHeight: expect.any(Number),
      resizeQuality: 'high',
    });
    const drawImageCallOrder = HTMLCanvasElement.prototype.getContext.mock.results[0].value.drawImage.mock
      .invocationCallOrder[0];
    const resizeCallOrder = createImageBitmapMock.mock.invocationCallOrder[1];
    expect(resizeCallOrder).toBeLessThan(drawImageCallOrder);

    expect(result.degraded).toContain('source_downscaled_for_safety');
    // The variant is rendered from the already-safe (resized) bitmap, never upscaled past it.
    expect(result.variantMeta.large.width).toBe(1920);
  });

  it('flags a post-encode blank/all-black render rather than shipping it silently', async () => {
    installMockCanvas({ pixelColorAt: () => [0, 0, 0, 255] }); // uniform opaque black everywhere
    const bitmap = makeMockBitmap(800, 600);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const file = new File(['bytes'], 'blank.jpg', { type: 'image/jpeg' });
    const result = await encodeVariantsCore(file, {
      capabilities: { imageOrientationOption: true },
      targets: [{ key: 'large', maxWidth: 1920 }],
    });

    expect(result.degraded).toContain('blank_output_suspected:large');
  });

  it('does not flag an ordinary, non-blank render', async () => {
    installMockCanvas(); // default mid-tone, non-blank pixels
    const bitmap = makeMockBitmap(800, 600);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const file = new File(['bytes'], 'normal.jpg', { type: 'image/jpeg' });
    const result = await encodeVariantsCore(file, {
      capabilities: { imageOrientationOption: true },
      targets: [{ key: 'large', maxWidth: 1920 }],
    });

    expect(result.degraded).not.toContain('blank_output_suspected:large');
  });
});
