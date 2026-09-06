/**
 * Extends the repo's existing `mockCanvas()` idiom (see
 * `packages/web-core/Components/items/__tests__/MenuPhotoCaptureSheet.behavior.test.jsx:34-48`)
 * with the extra 2D-context surface (`transform`, `getImageData`) and `toBlob` mime/quality
 * echoing this module's tests need, rather than inventing a new mocking pattern.
 */
import { vi } from 'vitest';

/**
 * @param {(x:number, y:number) => [number, number, number, number]} [pixelColorAt] defaults
 *   to a plain mid-tone opaque pixel -- i.e. "not blank" -- everywhere.
 */
export function installMockCanvas({ pixelColorAt } = {}) {
  const colorAt = pixelColorAt || (() => [200, 120, 80, 255]);

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    transform: vi.fn(),
    getImageData: (x, y) => ({ data: Uint8ClampedArray.from(colorAt(x, y)) }),
  }));

  HTMLCanvasElement.prototype.toBlob = function toBlob(callback, mimeType) {
    callback(new Blob(['encoded-bytes'], { type: mimeType || 'image/jpeg' }));
  };
}

export function makeMockBitmap(width, height) {
  return { width, height, close: vi.fn() };
}
