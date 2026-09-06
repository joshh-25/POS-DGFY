/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeVariantsCore, obtainOrientedBitmap, parseJpegOrientation } from '../encodeVariants.js';
import { buildJpegWithExifOrientation } from './fixtures/exifJpeg.js';
import { installMockCanvas, makeMockBitmap } from './canvasTestUtils.js';

function makeJpegFile(buffer) {
  const file = new File([buffer], 'photo.jpg', { type: 'image/jpeg' });
  // jsdom's File.arrayBuffer() re-reads from the Blob parts, which already round-trips our
  // fixture bytes correctly -- no need to override it.
  return file;
}

describe('EXIF orientation handling', () => {
  beforeEach(() => {
    installMockCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parseJpegOrientation reads tag 0x0112 directly from raw bytes', () => {
    const buffer = buildJpegWithExifOrientation(6);
    expect(parseJpegOrientation(buffer)).toBe(6);
  });

  it('returns null when there is no EXIF block at all', () => {
    const plainJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer; // SOI + EOI only
    expect(parseJpegOrientation(plainJpeg)).toBeNull();
  });

  it('(a) uses createImageBitmap(file, { imageOrientation: "from-image" }) when the runtime honors it', async () => {
    const orientedBitmap = makeMockBitmap(100, 200);
    const createImageBitmapMock = vi.fn().mockResolvedValue(orientedBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const file = makeJpegFile(buildJpegWithExifOrientation(6));
    const { bitmap, orientationHandled } = await obtainOrientedBitmap(file, {
      capabilities: { imageOrientationOption: true },
    });

    expect(orientationHandled).toBe(true);
    expect(bitmap).toBe(orientedBitmap);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(createImageBitmapMock).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  it('(b) falls back to manual EXIF parsing + canvas rotation when the option is not honored', async () => {
    const rawBitmap = makeMockBitmap(100, 50); // landscape source
    const rotatedBitmap = makeMockBitmap(50, 100); // orientation 6 swaps width/height
    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValueOnce(rawBitmap) // plain createImageBitmap(file)
      .mockResolvedValueOnce(rotatedBitmap); // createImageBitmap(rotatedCanvas)
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const file = makeJpegFile(buildJpegWithExifOrientation(6));
    const { bitmap, orientationHandled } = await obtainOrientedBitmap(file, {
      capabilities: { imageOrientationOption: false },
    });

    expect(orientationHandled).toBe(true);
    expect(bitmap).toBe(rotatedBitmap);
    // First call must be the plain, option-less decode -- the option path was skipped entirely.
    expect(createImageBitmapMock).toHaveBeenNthCalledWith(1, file);
    // Orientation 6's transform: [0, 1, -1, 0, height, 0] against the raw bitmap's own dims.
    const ctx = HTMLCanvasElement.prototype.getContext.mock.results.at(-1).value;
    expect(ctx.transform).toHaveBeenCalledWith(0, 1, -1, 0, 50, 0);
  });

  it('(c) degrades to the original file, untouched, when both orientation paths fail', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failed'))
    );

    const file = makeJpegFile(buildJpegWithExifOrientation(6));
    const { bitmap, orientationHandled } = await obtainOrientedBitmap(file, {
      capabilities: { imageOrientationOption: true },
    });
    expect(bitmap).toBeNull();
    expect(orientationHandled).toBe(false);

    const result = await encodeVariantsCore(file, { capabilities: { imageOrientationOption: true } });
    expect(result.variants).toEqual({ large: file });
    expect(result.degraded).toEqual(['orientation_unknown']);
  });
});
