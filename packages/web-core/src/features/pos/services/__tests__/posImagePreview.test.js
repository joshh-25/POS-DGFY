// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquirePosImagePreview, readPosImageDimensions } from '../posImagePreview.js';

const imageFile = (width = 1200, height = 900) => {
  const header = new ArrayBuffer(24);
  const view = new DataView(header);
  view.setUint32(0, 0x89504e47); view.setUint32(16, width); view.setUint32(20, height);
  return { size: 1000, slice: () => ({ arrayBuffer: async () => header }) };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 192, height: 144, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['preview'])));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:small'), revokeObjectURL: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('bounded POS preview decoding', () => {
  it('shares one decode and revokes only after both consumers release', async () => {
    const file = imageFile();
    const editor = acquirePosImagePreview(file);
    const catalog = acquirePosImagePreview(file);
    expect(await editor.promise).toBe('blob:small');
    expect(await catalog.promise).toBe('blob:small');
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledWith(file, expect.objectContaining({ resizeWidth: 192, resizeHeight: 144 }));
    editor.release();
    await vi.runAllTimersAsync();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    catalog.release();
    await vi.runAllTimersAsync();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:small');
  });
  it('rejects excessive pixels before decode and skips cancelled queued work', async () => {
    const oversized = acquirePosImagePreview(imageFile(100000, 100000));
    await expect(oversized.promise).rejects.toThrow('pixel limit');
    oversized.release();
    const cancelled = acquirePosImagePreview(imageFile());
    cancelled.release();
    expect(await cancelled.promise).toBe('');
    expect(createImageBitmap).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
  });
  it('rejects truncated or unsupported headers', () => {
    expect(() => readPosImageDimensions(new ArrayBuffer(2))).toThrow('Local preview unavailable');
  });
});
