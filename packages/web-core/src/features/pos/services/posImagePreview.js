// POS-only, reference-counted previews: the editor and pending store share one decode.
const cache = new WeakMap();
let decodeQueue = Promise.resolve();
const SIZE = 144;

export const readPosImageDimensions = (buffer) => {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff && offset < bytes.length) offset++;
      if (offset + 8 >= bytes.length) break;
      const marker = bytes[offset++];
      const length = view.getUint16(offset);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const type = view.getUint32(12);
    if (type === 0x56503858) return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
    if (type === 0x56503820) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (type === 0x5650384c) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  throw new Error('Local preview unavailable; the server will validate this image.');
};

const makePreview = async (file, isCancelled) => {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Image exceeds the 10 MB preview limit.');
  const { width, height } = readPosImageDimensions(await file.slice(0, 256 * 1024).arrayBuffer());
  if (!width || !height || width * height > 40 * 1024 * 1024) throw new Error('Image exceeds the preview pixel limit.');
  if (isCancelled()) return '';
  let bitmap;
  let sourceUrl;
  try {
    if (typeof createImageBitmap === 'function') {
      const scale = Math.min(1, SIZE / Math.min(width, height));
      bitmap = await createImageBitmap(file, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: 'low'
      });
    } else {
      if (width * height > 4 * 1024 * 1024) throw new Error('This device will show the server thumbnail when ready.');
      sourceUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        const timeout = setTimeout(() => { image.src = ''; reject(new Error('Preview timed out.')); }, 10000);
        image.onload = () => { clearTimeout(timeout); resolve(image); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error('Preview decode failed.')); };
        image.src = sourceUrl;
      });
    }
    if (isCancelled()) return '';
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Preview canvas unavailable.');
    const edge = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, SIZE, SIZE);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
    return blob && !isCancelled() ? URL.createObjectURL(blob) : '';
  } finally {
    bitmap?.close?.();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
};

export const acquirePosImagePreview = (file) => {
  let entry = cache.get(file);
  if (!entry) {
    entry = { refs: 0, url: '', disposeTimer: null };
    entry.promise = decodeQueue.then(() => makePreview(file, () => entry.refs === 0))
      .then((url) => { entry.url = url; return url; });
    decodeQueue = entry.promise.catch(() => {});
    cache.set(file, entry);
  }
  clearTimeout(entry.disposeTimer);
  entry.refs++;
  let released = false;
  return {
    promise: entry.promise,
    release: () => {
      if (released) return;
      released = true;
      entry.refs--;
      if (entry.refs) return;
      entry.disposeTimer = setTimeout(() => {
        if (entry.refs) return;
        cache.delete(file);
        entry.promise.catch(() => '').then(() => {
          if (entry.url) URL.revokeObjectURL(entry.url);
        });
      }, 0);
    }
  };
};
