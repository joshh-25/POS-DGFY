/**
 * Pure, worker-safe encode pipeline for the client-side image encoder (epic #265, Phase 296).
 * Runs identically on the main thread and inside encodeWorker.js -- it touches no API beyond
 * what both contexts share: `createImageBitmap`, a 2D canvas context (via
 * `document.createElement('canvas')` on the main thread, `OffscreenCanvas` in the worker), and
 * plain typed-array/DataView byte parsing.
 *
 * Never calls the global `structuredClone()` function anywhere in this file. See
 * `packages/web-core/vite/esCompatGuardPlugin.js`'s own doc comment: that Layer-1 runtime
 * shim (`src/compat/chrome80Runtime.js`) has no Blob/File/ArrayBuffer/ImageBitmap support and
 * silently returns an empty object for them on Chrome 80-84 instead of throwing. Nothing here
 * needs it -- File/Blob objects cross the worker boundary via the browser's own native (non-
 * polyfilled) structured-clone support built into `postMessage`, which is a separate,
 * spec-correct mechanism unaffected by that shim.
 */

export const VARIANT_LADDER = [
  { key: 'large', maxWidth: 1920 },
  { key: 'medium', maxWidth: 1024 },
  { key: 'thumbnail', maxWidth: 400 },
];

const DEFAULT_DEADLINE_MS = 8000;
// ~16.7M px: several browsers silently produce a blank/garbled canvas above this area instead
// of throwing. Anything larger gets one resize pre-pass before any drawImage call.
const MAX_SAFE_PIXELS = 16 * 1024 * 1024;
const SAFE_PIXEL_TARGET = 8 * 1024 * 1024;
const QUALITY_BY_MIME = {
  'image/webp': 0.82,
  'image/jpeg': 0.85,
};

function createAbortError(message = 'The operation was aborted.') {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function checkAborted(isAborted) {
  if (typeof isAborted === 'function' && isAborted()) {
    throw createAbortError();
  }
}

function resolveEncodeMimeType(capabilities) {
  return capabilities?.webp ? 'image/webp' : 'image/jpeg';
}

function extensionForMimeType(mimeType) {
  return mimeType === 'image/webp' ? 'webp' : 'jpg';
}

function baseFileName(file) {
  const name = file?.name || 'image';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function createDrawingSurface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return { surface: new OffscreenCanvas(width, height), isOffscreen: true };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { surface: canvas, isOffscreen: false };
}

function surfaceToBlob(surface, isOffscreen, mimeType, quality) {
  if (isOffscreen) {
    return surface.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    surface.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas toBlob produced no data'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Reads EXIF Orientation (tag 0x0112) directly from raw JPEG bytes. Used only as a fallback
 * when the runtime's `createImageBitmap(file, { imageOrientation: 'from-image' })` isn't
 * honored (an implementation that silently ignores the option instead of throwing on it).
 * Returns null when the file isn't a JPEG, has no EXIF APP1 block, or the block has no
 * orientation tag -- callers treat null as "no rotation known," never as orientation 1 by
 * assumption.
 */
export function parseJpegOrientation(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) {
      return null;
    }
    if (marker === 0xffd9 || marker === 0xffda) {
      return null; // EOI / start-of-scan reached with no EXIF block found first
    }

    const segmentLength = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 4 + 6 <= view.byteLength) {
      const isExif =
        view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000;
      if (isExif) {
        const orientation = readOrientationFromTiff(view, offset + 10);
        if (orientation !== null) {
          return orientation;
        }
      }
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readOrientationFromTiff(view, tiffOffset) {
  if (tiffOffset + 8 > view.byteLength) {
    return null;
  }
  const byteOrderMark = view.getUint16(tiffOffset);
  const littleEndian = byteOrderMark === 0x4949;
  if (!littleEndian && byteOrderMark !== 0x4d4d) {
    return null;
  }

  const ifd0Offset = tiffOffset + view.getUint32(tiffOffset + 4, littleEndian);
  if (ifd0Offset + 2 > view.byteLength) {
    return null;
  }

  const entryCount = view.getUint16(ifd0Offset, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) {
      break;
    }
    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === 0x0112) {
      return view.getUint16(entryOffset + 8, littleEndian);
    }
  }

  return null;
}

/** Canvas dimensions and 2D transform for each of the 8 EXIF orientation values (2-8; 1 is identity). */
function orientationLayout(orientation, width, height) {
  const swapped = orientation >= 5 && orientation <= 8;
  const transformByOrientation = {
    2: [-1, 0, 0, 1, width, 0],
    3: [-1, 0, 0, -1, width, height],
    4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, height, 0],
    7: [0, -1, -1, 0, height, width],
    8: [0, -1, 1, 0, 0, width],
  };

  return {
    canvasWidth: swapped ? height : width,
    canvasHeight: swapped ? width : height,
    transform: transformByOrientation[orientation] || null,
  };
}

async function applyOrientation(bitmap, orientation) {
  if (!orientation || orientation === 1) {
    return bitmap;
  }
  const { canvasWidth, canvasHeight, transform } = orientationLayout(orientation, bitmap.width, bitmap.height);
  if (!transform) {
    return bitmap;
  }

  const { surface, isOffscreen } = createDrawingSurface(canvasWidth, canvasHeight);
  const ctx = surface.getContext('2d');
  ctx.transform(...transform);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return isOffscreen ? surface.transferToImageBitmap() : createImageBitmap(surface);
}

/**
 * Resolves the correctly-oriented source bitmap for encoding. Two paths, in order:
 *   1. `createImageBitmap(file, { imageOrientation: 'from-image' })`, when the runtime honors
 *      the option (probed once in capabilities.js) -- the browser does the rotation for us.
 *   2. Otherwise, a hand-rolled fallback: parse the EXIF orientation tag directly from the raw
 *      bytes, decode the file with a plain `createImageBitmap(file)`, and rotate/transpose it
 *      ourselves via a canvas transform.
 * If both paths are unavailable or fail, returns `{ bitmap: null, orientationHandled: false }`
 * so the caller degrades to "send the original file untouched" rather than guessing.
 */
export async function obtainOrientedBitmap(file, { capabilities } = {}) {
  if (capabilities?.imageOrientationOption) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { bitmap, orientationHandled: true };
    } catch {
      // fall through to the manual path below
    }
  }

  try {
    const buffer = await file.arrayBuffer();
    const orientation = parseJpegOrientation(buffer);
    const rawBitmap = await createImageBitmap(file);
    const bitmap = await applyOrientation(rawBitmap, orientation);
    return { bitmap, orientationHandled: true };
  } catch {
    return { bitmap: null, orientationHandled: false };
  }
}

/**
 * Guards against decoding a pathologically large image straight into `drawImage`. Runs one
 * resize pre-pass via `createImageBitmap`'s own `resizeWidth`/`resizeHeight`/`resizeQuality`
 * options -- executed BEFORE any `drawImage` call -- when the oriented source exceeds
 * `MAX_SAFE_PIXELS`, rather than attempting to draw the oversized bitmap directly.
 */
async function capToSafePixelArea(bitmap) {
  const area = bitmap.width * bitmap.height;
  if (area <= MAX_SAFE_PIXELS) {
    return bitmap;
  }

  const scale = Math.sqrt(SAFE_PIXEL_TARGET / area);
  const resizeWidth = Math.max(1, Math.round(bitmap.width * scale));
  const resizeHeight = Math.max(1, Math.round(bitmap.height * scale));

  const resized = await createImageBitmap(bitmap, {
    resizeWidth,
    resizeHeight,
    resizeQuality: 'high',
  });
  bitmap.close?.();
  return resized;
}

/**
 * 4-corner + center sample. All-transparent (alpha 0 everywhere sampled) or all-opaque-black
 * reads as a blank/failed render rather than a real photo -- narrow on purpose, a real photo
 * with a black vignette at all 5 sample points is vanishingly unlikely.
 */
function sampleLooksBlank(ctx, width, height) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), Math.floor(height / 2)],
  ];

  let allTransparent = true;
  let allBlack = true;

  for (const [x, y] of points) {
    const { data } = ctx.getImageData(x, y, 1, 1);
    const [r, g, b, a] = data;
    if (a !== 0) allTransparent = false;
    if (!(r === 0 && g === 0 && b === 0 && a === 255)) allBlack = false;
  }

  return allTransparent || allBlack;
}

function renderVariantSurface(bitmap, targetWidth) {
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const width = Math.min(targetWidth, sourceWidth); // never upscale
  const height = Math.max(1, Math.round((width / sourceWidth) * sourceHeight));

  const { surface, isOffscreen } = createDrawingSurface(width, height);
  const ctx = surface.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  return { surface, isOffscreen, ctx, width, height };
}

/**
 * The core encode pipeline. Identical on the main thread and inside encodeWorker.js.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {Array<{key:string,maxWidth:number}>} [options.targets] defaults to VARIANT_LADDER,
 *   generated in ladder order (large first) so the one variant every caller relies on is
 *   produced before the deadline budget is spent on the smaller, optional ones.
 * @param {number} [options.deadlineMs] wall-clock budget for the whole call
 * @param {() => boolean} [options.isAborted] polled between steps. The worker path never
 *   passes this -- `AbortSignal` can't cross `postMessage` -- cancellation there is handled by
 *   the orchestration layer (index.js) calling `worker.terminate()` instead.
 * @param {(progress: {key:string,index:number,total:number}) => void} [options.onProgress]
 * @param {object} [options.capabilities] pre-computed via detectCapabilities()
 * @returns {Promise<{variants: Record<string,File>, variantMeta: Record<string,{file:File,width:number,height:number}>, degraded: string[]}>}
 */
export async function encodeVariantsCore(file, options = {}) {
  const {
    targets = VARIANT_LADDER,
    deadlineMs = DEFAULT_DEADLINE_MS,
    isAborted,
    onProgress,
    capabilities = {},
  } = options;

  const degraded = [];
  const deadlineAt = Date.now() + deadlineMs;

  checkAborted(isAborted);

  const { bitmap: sourceBitmap, orientationHandled } = await obtainOrientedBitmap(file, { capabilities });
  if (!orientationHandled || !sourceBitmap) {
    return {
      variants: { large: file },
      variantMeta: {},
      degraded: ['orientation_unknown'],
    };
  }

  checkAborted(isAborted);
  const safeBitmap = await capToSafePixelArea(sourceBitmap);
  if (safeBitmap !== sourceBitmap) {
    degraded.push('source_downscaled_for_safety');
  }

  const mimeType = resolveEncodeMimeType(capabilities);
  const quality = QUALITY_BY_MIME[mimeType] ?? 0.85;
  const extension = extensionForMimeType(mimeType);
  const name = baseFileName(file);

  const variantMeta = {};

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];

    if (Date.now() >= deadlineAt) {
      degraded.push(`deadline_exceeded:${target.key}`);
      continue;
    }
    checkAborted(isAborted);

    const { surface, isOffscreen, ctx, width, height } = renderVariantSurface(safeBitmap, target.maxWidth);

    if (sampleLooksBlank(ctx, width, height)) {
      degraded.push(`blank_output_suspected:${target.key}`);
    }

    const blob = await surfaceToBlob(surface, isOffscreen, mimeType, quality);
    const variantFile = new File([blob], `${name}-${target.key}.${extension}`, {
      type: mimeType,
      lastModified: Date.now(),
    });

    variantMeta[target.key] = { file: variantFile, width, height };
    onProgress?.({ key: target.key, index, total: targets.length });
  }

  safeBitmap.close?.();

  if (!variantMeta.large && targets.some((target) => target.key === 'large')) {
    // 'large' is the one variant every caller relies on -- if it didn't survive the deadline
    // or was otherwise skipped, there's nothing safe to send but the original file.
    return {
      variants: { large: file },
      variantMeta: {},
      degraded: [...degraded, 'large_variant_unavailable'],
    };
  }

  const variants = Object.fromEntries(
    Object.entries(variantMeta).map(([key, meta]) => [key, meta.file])
  );

  return { variants, variantMeta, degraded };
}
