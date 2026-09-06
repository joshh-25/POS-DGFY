/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockCanvas, makeMockBitmap } from './canvasTestUtils.js';
import { resetCapabilitiesCacheForTests } from '../capabilities.js';

vi.mock('../rolloutFlag.js', () => ({ getImageClientConversionFlag: () => 'on' }));

describe('concurrency cap: one encode at a time', () => {
  beforeEach(() => {
    resetCapabilitiesCacheForTests();
    installMockCanvas();
    // No Worker/OffscreenCanvas stubbed -- forces the main-thread fallback path, which we can
    // hold open deterministically via a controllable createImageBitmap promise below.
    vi.stubGlobal('createImageBitmap', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects a second concurrent call while the first is still in flight', async () => {
    const { prepareImageVariants, resetActiveEncodeForTests } = await import('../index.js');
    resetActiveEncodeForTests();

    let releaseFirstDecode;
    const firstDecodeGate = new Promise((resolve) => {
      releaseFirstDecode = resolve;
    });
    createImageBitmap.mockImplementation(async () => {
      await firstDecodeGate;
      return makeMockBitmap(800, 600);
    });

    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    const firstCall = prepareImageVariants(fileA);
    // Let the first call actually enter its encode (past the synchronous "already in
    // progress" guard) before firing the second.
    await Promise.resolve();

    await expect(prepareImageVariants(fileB)).rejects.toThrow(/already in progress/i);

    releaseFirstDecode();
    const firstResult = await firstCall;
    expect(firstResult.variants.large).toBeInstanceOf(File);
  });

  it('accepts a new call once the previous one has settled', async () => {
    const { prepareImageVariants, resetActiveEncodeForTests } = await import('../index.js');
    resetActiveEncodeForTests();
    createImageBitmap.mockResolvedValue(makeMockBitmap(800, 600));

    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    await prepareImageVariants(fileA);
    await expect(prepareImageVariants(fileB)).resolves.toMatchObject({
      variants: { large: expect.any(File) },
    });
  });
});
