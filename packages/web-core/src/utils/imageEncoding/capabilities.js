/**
 * Memoized feature probe for the client-side image encoder (epic #265, Phase 296).
 *
 * Every probe here is deliberately conservative: on any doubt, ambiguity, or thrown error it
 * reports the feature UNSUPPORTED rather than risk a silent bad encode. WebKit's own
 * `canvas.toBlob('image/webp')` behavior is the canonical example this guards against -- it
 * resolves the callback with a real Blob, but silently downgrades its `.type` back to
 * `image/png` instead of throwing or returning null. Reading `.type` back is the only
 * reliable signal; a `null` blob (another real-world failure mode) is also treated as
 * unsupported, never as a thrown error.
 *
 * Does NOT call the global `structuredClone()` shim (see chrome80Runtime.js) on any of these
 * probe values -- none of this module's data crosses a worker boundary, and even if it did,
 * these are plain booleans, not Blob/File/ArrayBuffer/ImageBitmap.
 */

const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let cachedCapabilities = null;

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * `document` doesn't exist inside `encodeWorker.js`'s real Worker global scope -- this probe
 * runs a second time there (`detectCapabilities()` is called fresh per worker instance, see
 * that file's own comment), and `document.createElement('canvas')` throws in that scope. Branch
 * on `typeof document === 'undefined'` and use `OffscreenCanvas`+`convertToBlob` instead,
 * mirroring `encodeVariants.js`'s own `createDrawingSurface` helper -- rather than let the
 * `try/catch` below swallow that throw and silently report the real capability as unsupported.
 */
function probeCanvasToBlobType(mimeType) {
  if (typeof document === 'undefined') {
    return probeOffscreenCanvasToBlobType(mimeType);
  }
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      if (typeof canvas.toBlob !== 'function') {
        resolve(false);
        return;
      }
      canvas.toBlob((blob) => {
        resolve(Boolean(blob) && blob.type === mimeType);
      }, mimeType);
    } catch {
      resolve(false);
    }
  });
}

async function probeOffscreenCanvasToBlobType(mimeType) {
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }
  try {
    const canvas = new OffscreenCanvas(1, 1);
    if (typeof canvas.convertToBlob !== 'function') {
      return false;
    }
    const blob = await canvas.convertToBlob({ type: mimeType });
    return Boolean(blob) && blob.type === mimeType;
  } catch {
    return false;
  }
}

async function probeImageOrientationOption() {
  if (typeof createImageBitmap !== 'function') {
    return false;
  }
  try {
    const blob = base64ToBlob(ONE_PX_PNG_BASE64, 'image/png');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects and memoizes the capability set this module needs. Safe to call repeatedly -- the
 * underlying probes only ever run once per page load (or once per test, after
 * `resetCapabilitiesCacheForTests()`).
 */
export async function detectCapabilities() {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const [webp, imageOrientationOption] = await Promise.all([
    probeCanvasToBlobType('image/webp'),
    probeImageOrientationOption(),
  ]);

  cachedCapabilities = {
    webp,
    imageOrientationOption,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    worker: typeof Worker !== 'undefined',
    createImageBitmap: typeof createImageBitmap === 'function',
  };

  return cachedCapabilities;
}

/** Test-only escape hatch -- production code never calls this. */
export function resetCapabilitiesCacheForTests() {
  cachedCapabilities = null;
}
